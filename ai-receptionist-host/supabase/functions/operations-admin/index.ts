import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const out=(body:any,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json"}
});
const clean=(v:any,max=1000)=>String(v??"").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return out({error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return out({error:"Unauthorized"},401);
    const token=auth.slice(7);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,anon,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
    const db=createClient(url,service,{auth:{persistSession:false}});

    const {data:u,error:ue}=await userDb.auth.getUser(token);
    if(ue||!u?.user) return out({error:"Unauthorized"},401);

    const {data:mem,error:me}=await userDb.from("memberships")
      .select("organization_id,role")
      .eq("user_id",u.user.id).eq("active",true).single();
    if(me||!mem) return out({error:"Membership not found"},403);
    if(!["owner","admin"].includes(mem.role)) return out({error:"Owner or admin role required"},403);

    const b=await req.json();
    const action=clean(b.action,50);
    const org=mem.organization_id;

    if(action==="schedule_appointment"){
      const appointmentId=clean(b.appointment_id,80);
      const start=new Date(String(b.start_at||""));
      const end=new Date(String(b.end_at||""));
      if(!appointmentId||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start){
        return out({error:"Valid appointment_id, start_at and end_at are required"},400);
      }
      const status=["proposed","confirmed"].includes(b.status)?b.status:"proposed";
      const {data:current,error:ce}=await db.from("appointments")
        .select("id,status,organization_id")
        .eq("id",appointmentId).eq("organization_id",org).single();
      if(ce||!current) return out({error:"Appointment not found"},404);
      if(["completed","cancelled"].includes(current.status)) return out({error:"Closed appointment cannot be rescheduled"},409);

      const {data:updated,error}=await db.from("appointments")
        .update({
          start_at:start.toISOString(),
          end_at:end.toISOString(),
          timezone:clean(b.timezone,100)||"Europe/Brussels",
          location:clean(b.location,500)||null,
          status,
          updated_at:new Date().toISOString()
        })
        .eq("id",appointmentId).eq("organization_id",org)
        .select("*").single();
      if(error) throw error;
      return out({ok:true,appointment:updated});
    }

    if(action==="confirm_appointment"){
      const appointmentId=clean(b.appointment_id,80);
      const {data:current,error:ce}=await db.from("appointments").select("*")
        .eq("id",appointmentId).eq("organization_id",org).single();
      if(ce||!current) return out({error:"Appointment not found"},404);
      if(!current.start_at||!current.end_at) return out({error:"Set an exact start and end time first"},409);
      if(["completed","cancelled"].includes(current.status)) return out({error:"Closed appointment cannot be confirmed"},409);
      const {data:updated,error}=await db.from("appointments")
        .update({status:"confirmed",updated_at:new Date().toISOString()})
        .eq("id",appointmentId).eq("organization_id",org)
        .select("*").single();
      if(error) throw error;
      return out({ok:true,appointment:updated});
    }

    if(action==="complete_appointment"){
      const appointmentId=clean(b.appointment_id,80);
      const {data:current,error:ce}=await db.from("appointments").select("*")
        .eq("id",appointmentId).eq("organization_id",org).single();
      if(ce||!current) return out({error:"Appointment not found"},404);
      if(current.status!=="confirmed") return out({error:"Only a confirmed appointment can be marked completed"},409);
      const {data:updated,error}=await db.from("appointments")
        .update({status:"completed",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
        .eq("id",appointmentId).eq("organization_id",org)
        .select("*").single();
      if(error) throw error;
      return out({ok:true,appointment:updated});
    }

    if(action==="cancel_appointment"){
      const appointmentId=clean(b.appointment_id,80);
      const {data:current,error:ce}=await db.from("appointments").select("*")
        .eq("id",appointmentId).eq("organization_id",org).single();
      if(ce||!current) return out({error:"Appointment not found"},404);
      if(current.status==="completed") return out({error:"Completed appointment cannot be cancelled"},409);
      const {data:updated,error}=await db.from("appointments")
        .update({status:"cancelled",updated_at:new Date().toISOString()})
        .eq("id",appointmentId).eq("organization_id",org)
        .select("*").single();
      if(error) throw error;
      return out({ok:true,appointment:updated});
    }

    if(action==="create_payment"){
      const appointmentId=clean(b.appointment_id,80)||null;
      let leadId=clean(b.lead_id,80)||null;
      const amount=Number(b.amount_cents);
      const currency=clean(b.currency||"EUR",3).toUpperCase();
      if(!Number.isInteger(amount)||amount<=0) return out({error:"Positive amount_cents required"},400);
      if(!/^[A-Z]{3}$/.test(currency)) return out({error:"Invalid currency"},400);

      if(appointmentId){
        const {data:appt,error:ae}=await db.from("appointments").select("id,lead_id,status")
          .eq("id",appointmentId).eq("organization_id",org).single();
        if(ae||!appt) return out({error:"Appointment not found"},404);
        if(appt.status==="cancelled") return out({error:"Cannot create payment for cancelled appointment"},409);
        leadId=appt.lead_id;
      }
      if(!leadId) return out({error:"lead_id or appointment_id required"},400);
      const {data:lead,error:le}=await db.from("leads").select("id")
        .eq("id",leadId).eq("organization_id",org).single();
      if(le||!lead) return out({error:"Lead not found"},404);

      let existing:any=null;
      if(appointmentId){
        const {data}=await db.from("customer_payments").select("*")
          .eq("organization_id",org).eq("appointment_id",appointmentId)
          .eq("status","pending").order("created_at",{ascending:false}).limit(1).maybeSingle();
        existing=data;
      }

      if(existing?.payment_url && existing.amount_cents!==amount){
        return out({error:"Existing Checkout link already has a fixed amount; create a new payment instead"},409);
      }

      if(existing){
        const {data:updated,error}=await db.from("customer_payments")
          .update({amount_cents:amount,currency,updated_at:new Date().toISOString()})
          .eq("id",existing.id).eq("organization_id",org)
          .select("*").single();
        if(error) throw error;
        return out({ok:true,payment:updated,reused:true});
      }

      const {data:created,error}=await db.from("customer_payments")
        .insert({
          organization_id:org,lead_id:leadId,appointment_id:appointmentId,
          status:"pending",amount_cents:amount,currency
        })
        .select("*").single();
      if(error) throw error;
      return out({ok:true,payment:created,reused:false});
    }

    return out({error:"Unknown action"},400);
  }catch(e){
    console.error(e);
    return out({error:"Operation failed",detail:clean(e instanceof Error?e.message:e,1000)},500);
  }
});