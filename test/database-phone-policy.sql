begin;
do $$
declare call_id text:='qa-astra-log-'||gen_random_uuid(); c jsonb; saved jsonb;
 expected jsonb:='{"klant_naam":"QA TEST Astra","telefoonnummer":"+32000000003","regio_gemeente":"Lede","type_reiniging":"terras","doorgestuurd_naar_whatsapp":true,"samenvatting_gesprek":"QA TEST: terras van 20 m², vrijdag als voorkeur; prijs en planning nog persoonlijk te bevestigen."}'::jsonb;
begin
 c:=private.luxwash_dispatch('call_start',jsonb_build_object('provider_call_id',call_id,'phone','+32000000003'));
 perform private.luxwash_dispatch('call_start',jsonb_build_object('provider_call_id',call_id));
 perform private.luxwash_dispatch('call_update',jsonb_build_object('provider_call_id',call_id,'summary',expected::text,'status','completed','intent','quote'));
 select summary::jsonb into saved from public.phone_calls where provider_call_id=call_id;
 assert saved=expected,'The complete six-field phone log must survive storage';
 assert jsonb_typeof(saved->'doorgestuurd_naar_whatsapp')='boolean','WhatsApp referral must remain a JSON boolean';
 assert (select count(*) from public.phone_calls where provider_call_id=call_id)=1,'Call replay must not duplicate the journal';
 assert exists(select 1 from public.phone_calls where provider_call_id=call_id and ended_at is not null and status='completed'),'Hang-up must close the stored call';
 assert not exists(select 1 from public.automation_jobs where customer_id=(c->>'customer_id')::uuid),'Phone journaling must not send messages';
end $$;
rollback;
