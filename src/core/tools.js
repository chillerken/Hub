const {booking,contact,z}=require('./validation');
const {hash}=require('./db');
function definition(name,description,properties,required=Object.keys(properties)){return {type:'function',name,description,parameters:{type:'object',properties,required,additionalProperties:false},strict:false};}
const str={type:'string'};
const TOOL_DEFS=[
 definition('getServices','Lees echte diensten en prijsindicaties uit LuxWash. Geen vast tarief beloven bij estimate.',{}),
 definition('calculatePrice','Prijs uit prijstabel; geeft fixed, estimate of quote terug.',{service_id:str,category:str},['service_id']),
 definition('checkAvailability','Zoek echte vrije slots. ISO-datums met tijdzone; maximaal 14 dagen.',{service_id:str,postcode:str,from:str,to:str}),
 definition('createCustomer','Bewaar opgegeven contactgegevens. Geen bestaand profiel teruggeven.',{name:str,email:str,phone:str},['name','phone']),
 definition('findCustomer','Herken opgegeven contact zonder privégegevens terug te geven. Bestaande afspraken vereisen beheercode.',{phone:str,email:str},[]),
 definition('createAppointment','Sla afspraak op nadat klant dienst, adres, datum en prijsindicatie uitdrukkelijk heeft bevestigd. Requested is nog geen definitieve afspraak.',{name:str,email:str,phone:str,address:str,postcode:str,vehicle:str,service_id:str,category:str,starts_at:str,notes:str,confirmed_by_customer:{type:'boolean'}},['name','phone','address','postcode','service_id','starts_at','confirmed_by_customer']),
 definition('updateAppointment','Verplaats een afspraak met de beheercode uit de bevestiging.',{id:str,manage_token:str,starts_at:str}),
 definition('cancelAppointment','Annuleer met de beheercode, uitsluitend na expliciet verzoek.',{id:str,manage_token:str}),
 definition('sendConfirmation','Controleer bevestigingstaak. Een queued taak is niet verzonden.',{id:str,manage_token:str}),
 definition('createFollowup','Maak terugbelactie voor klacht, schade, offerte, onbekende dienst of technische fout. Neem alleen noodzakelijke contactinfo in de samenvatting op.',{summary:str,priority:{type:'string',enum:['normal','high','urgent']}})
];
module.exports=function makeTools(db,config){
 async function execute(name,args,ctx){
  let result;const p=args||{};
  switch(name){
   case 'getServices': result=await db('catalog');break;
   case 'calculatePrice': result=await db('price',{service_id:z.string().uuid().parse(p.service_id),category:p.category||'standard'});break;
   case 'checkAvailability':{const q=z.object({service_id:z.string().uuid(),postcode:z.string().regex(/^\d{4}$/),from:z.string().datetime({offset:true}),to:z.string().datetime({offset:true})}).parse(p);result=await db('slots',q);break;}
   case 'findCustomer':{const rows=await db('customer_find',{phone:p.phone?require('./validation').phone.parse(p.phone):'',email:p.email||''});result={found:rows.length>0,identity_verified:false,message:'Vraag contactgegevens; deel geen opgeslagen persoonsgegevens. Voor wijzigen is de beheercode nodig.'};break;}
   case 'createCustomer':{const c=await db('customer_create',contact.parse(p));ctx.customerId=c.id;result={ok:true,saved:true};break;}
   case 'createAppointment':{
    const b=booking.parse({...p,idempotency_key:`${ctx.sessionId}:${ctx.toolCallId}`});const manage= require('node:crypto').createHmac('sha256',config.cookieSecret).update(b.idempotency_key).digest('base64url');
    const r=await db('book',{...b,source:ctx.source,manage_token_hash:hash(manage)});ctx.customerId=r.appointment.customer_id;
    result={ok:true,id:r.appointment.id,status:r.appointment.status,confirmed:r.appointment.status==='confirmed',starts_at:r.appointment.starts_at,price_cents:r.appointment.price_cents,price_mode:r.appointment.price_mode,confirmation:'queued',manage_token:manage};break;
   }
   case 'updateAppointment':case 'cancelAppointment':{const id=z.string().uuid().parse(p.id);if(!p.manage_token)throw new Error('Beheercode vereist');result=await db('appointment_change',{id,token_hash:hash(p.manage_token),...(name==='cancelAppointment'?{status:'cancelled'}:{starts_at:z.string().datetime({offset:true}).parse(p.starts_at)})});break;}
   case 'sendConfirmation':await db('manage_get',{id:z.string().uuid().parse(p.id),token_hash:hash(p.manage_token)});result=await db('confirmation_status',{id:p.id,token_hash:hash(p.manage_token)});break;
   case 'createFollowup':result=await db('handoff',{summary:z.string().min(5).max(2000).parse(p.summary),priority:z.enum(['normal','high','urgent']).parse(p.priority||'normal'),phone_call_id:ctx.phoneCallId,customer_id:ctx.customerId});break;
   default:throw new Error('Onbekende functie');
  }
  if(ctx.source==='phone'&&ctx.customerId)await db('call_update',{provider_call_id:ctx.sessionId,customer_id:ctx.customerId});
  await db('save',{table:'ai_actions',data:{source:ctx.source,action:name,reason:'Klantgesprek',status:'success',result:{ok:true},...(ctx.customerId?{customer_id:ctx.customerId}:{})}});
  return result;
 }
 return {execute,definitions:TOOL_DEFS};
};
module.exports.TOOL_DEFS=TOOL_DEFS;
