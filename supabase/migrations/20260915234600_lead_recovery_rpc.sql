create or replace function private.leadrecovery_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare
  a public.leadrecovery_accounts;
  l public.leadrecovery_leads;
  rid uuid;
  result jsonb;
  n integer;
  maxleads integer;
  ref public.leadrecovery_accounts;
begin
  if action='health' then return jsonb_build_object('ok',true,'schema','leadrecovery-1'); end if;

  if action='account_claim' then
    if nullif(lower(trim(p->>'email')),'') is null or nullif(p->>'user_id','') is null then raise exception 'email_and_user_required'; end if;
    select * into a from public.leadrecovery_accounts where email=lower(trim(p->>'email')) for update;
    if a.id is null then
      insert into public.leadrecovery_accounts(email,owner_user_id,reply_email,slug,referral_code)
      values(lower(trim(p->>'email')),(p->>'user_id')::uuid,lower(trim(p->>'email')),'b-'||substr(md5(lower(trim(p->>'email'))||gen_random_uuid()::text),1,14),upper(substr(md5(gen_random_uuid()::text),1,10))) returning * into a;
    elsif a.owner_user_id is null then
      update public.leadrecovery_accounts set owner_user_id=(p->>'user_id')::uuid where id=a.id returning * into a;
    elsif a.owner_user_id<>(p->>'user_id')::uuid then
      raise exception 'account_already_claimed' using errcode='42501';
    end if;
    if nullif(p->>'ref','') is not null and a.referrer_account_id is null then
      select * into ref from public.leadrecovery_accounts where referral_code=upper(p->>'ref') and id<>a.id;
      if ref.id is not null then
        update public.leadrecovery_accounts set referrer_account_id=ref.id where id=a.id returning * into a;
        insert into public.leadrecovery_referrals(referrer_account_id,referred_account_id) values(ref.id,a.id) on conflict(referred_account_id) do nothing;
      end if;
    end if;
    return to_jsonb(a);
  end if;

  if action='account_get' then select * into a from public.leadrecovery_accounts where id=(p->>'account_id')::uuid; return to_jsonb(a); end if;

  if action='account_update' then
    update public.leadrecovery_accounts set
      business_name=trim(p->>'business_name'), website=trim(p->>'website'), booking_url=trim(p->>'booking_url'),
      review_url=trim(coalesce(p->>'review_url','')), reply_email=lower(trim(p->>'reply_email')),
      onboarding_complete=(trim(p->>'business_name')<>'' and trim(p->>'website')<>'' and trim(p->>'booking_url')<>'' and trim(p->>'reply_email')<>'')
    where id=(p->>'account_id')::uuid returning * into a;
    if a.id is null then raise exception 'account_not_found'; end if; return to_jsonb(a);
  end if;

  if action='public_account' then
    select * into a from public.leadrecovery_accounts where slug=p->>'slug' and subscription_status in ('active','trialing') and onboarding_complete;
    if a.id is null then return null; end if;
    return jsonb_build_object('business_name',a.business_name,'slug',a.slug,'website',a.website);
  end if;

  if action='lead_capture' then
    select * into a from public.leadrecovery_accounts where slug=p->>'slug' and subscription_status in ('active','trialing') and onboarding_complete for update;
    if a.id is null then raise exception 'form_not_active'; end if;
    select count(*) into n from public.leadrecovery_leads where account_id=a.id and created_at>=date_trunc('month',now());
    maxleads:=case a.plan when 'growth' then 500 else 150 end;
    if n>=maxleads then raise exception 'monthly_lead_limit_reached'; end if;
    insert into public.leadrecovery_leads(account_id,name,email,phone,service,message,source)
    values(a.id,trim(p->>'name'),lower(trim(p->>'email')),trim(coalesce(p->>'phone','')),trim(coalesce(p->>'service','')),trim(coalesce(p->>'message','')),coalesce(p->>'source','hosted_form')) returning * into l;
    insert into public.leadrecovery_events(account_id,type,payload) values(a.id,'lead.created',jsonb_build_object('lead_id',l.id,'source',l.source));
    return to_jsonb(l)||jsonb_build_object('business_name',a.business_name,'reply_email',a.reply_email,'booking_url',a.booking_url,'website',a.website);
  end if;

  if action='lead_delivery' then
    select * into l from public.leadrecovery_leads where id=(p->>'id')::uuid for update;
    if l.id is null then raise exception 'lead_not_found'; end if;
    insert into public.leadrecovery_messages(account_id,lead_id,stage,status,provider_id,error)
    values(l.account_id,l.id,p->>'stage',case when coalesce((p->>'ok')::boolean,false) then 'sent' else 'failed' end,nullif(p->>'provider_id',''),nullif(p->>'error',''));
    if p->>'stage'='confirmation' and coalesce((p->>'ok')::boolean,false) then update public.leadrecovery_leads set confirmation_sent_at=now() where id=l.id;
    elsif not coalesce((p->>'ok')::boolean,false) then update public.leadrecovery_leads set delivery_failures=delivery_failures+1 where id=l.id; end if;
    return '{"ok":true}'::jsonb;
  end if;

  if action='due_followups' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
      select l.*,a.business_name,a.reply_email,a.booking_url,a.website from public.leadrecovery_leads l join public.leadrecovery_accounts a on a.id=l.account_id
      where l.status='new' and l.follow_up_stage<2 and l.next_follow_up_at<=now() and a.subscription_status in ('active','trialing')
      order by l.next_follow_up_at for update of l skip locked limit least(coalesce((p->>'limit')::int,30),100)
    ) x; return result;
  end if;

  if action='followup_result' then
    select * into l from public.leadrecovery_leads where id=(p->>'id')::uuid for update; if l.id is null then raise exception 'lead_not_found'; end if;
    insert into public.leadrecovery_messages(account_id,lead_id,stage,status,provider_id,error)
    values(l.account_id,l.id,'followup_'||(l.follow_up_stage+1),case when coalesce((p->>'ok')::boolean,false) then 'sent' else 'failed' end,nullif(p->>'provider_id',''),nullif(p->>'error',''));
    if coalesce((p->>'ok')::boolean,false) then
      update public.leadrecovery_leads set follow_up_stage=follow_up_stage+1,next_follow_up_at=case when follow_up_stage=0 then now()+interval '22 hours' else null end where id=l.id returning * into l;
    else
      update public.leadrecovery_leads set delivery_failures=delivery_failures+1,next_follow_up_at=case when delivery_failures>=2 then null else now()+interval '2 hours' end where id=l.id returning * into l;
      if l.delivery_failures>=3 then insert into public.leadrecovery_support(account_id,message,priority) values(l.account_id,'Automatische e-mail naar lead kon drie keer niet worden afgeleverd. Lead: '||l.id,'high'); end if;
    end if;
    return to_jsonb(l);
  end if;

  if action='lead_action' then
    select * into l from public.leadrecovery_leads where id=(p->>'id')::uuid for update; if l.id is null then raise exception 'lead_not_found'; end if;
    if p->>'action'='book' then update public.leadrecovery_leads set status='engaged',engaged_at=coalesce(engaged_at,now()),next_follow_up_at=null where id=l.id;
    elsif p->>'action'='stop' then update public.leadrecovery_leads set status='stopped',stopped_at=now(),next_follow_up_at=null where id=l.id;
    else raise exception 'invalid_action'; end if;
    select * into a from public.leadrecovery_accounts where id=l.account_id;
    return jsonb_build_object('ok',true,'booking_url',a.booking_url,'website',a.website);
  end if;

  if action='lead_list' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select * from public.leadrecovery_leads where account_id=(p->>'account_id')::uuid order by created_at desc limit least(coalesce((p->>'limit')::int,50),200)) x; return result;
  end if;

  if action='lead_convert' then
    update public.leadrecovery_leads set status='converted',converted_at=now(),review_due_at=now()+interval '48 hours',next_follow_up_at=null where id=(p->>'id')::uuid and account_id=(p->>'account_id')::uuid returning * into l; return to_jsonb(l);
  end if;

  if action='account_analytics' then
    select jsonb_build_object(
      'leads',count(*),
      'engaged',count(*) filter(where status in ('engaged','converted')),
      'converted',count(*) filter(where status='converted'),
      'stopped',count(*) filter(where status='stopped'),
      'conversion_rate',case when count(*)=0 then 0 else round(100.0*count(*) filter(where status='converted')/count(*),1) end,
      'month_leads',count(*) filter(where created_at>=date_trunc('month',now()))
    ) into result from public.leadrecovery_leads where account_id=(p->>'account_id')::uuid; return result;
  end if;

  if action='support_create' then
    insert into public.leadrecovery_support(account_id,message) values((p->>'account_id')::uuid,trim(p->>'message')) returning id into rid;
    return jsonb_build_object('id',rid,'status','open');
  end if;

  if action='stripe_checkout' then
    update public.leadrecovery_accounts set stripe_customer_id=nullif(p->>'customer_id',''),stripe_subscription_id=nullif(p->>'subscription_id',''),plan=case when p->>'plan' in ('core','growth') then p->>'plan' else 'core' end,billing_cycle=case when p->>'billing'='annual' then 'annual' else 'monthly' end,subscription_status='active',last_summary_at=coalesce(last_summary_at,now()),canceled_at=null,winback_sent_at=null
    where id=(p->>'account_id')::uuid returning * into a;
    if a.id is null and nullif(p->>'email','') is not null then update public.leadrecovery_accounts set stripe_customer_id=nullif(p->>'customer_id',''),stripe_subscription_id=nullif(p->>'subscription_id',''),plan=case when p->>'plan' in ('core','growth') then p->>'plan' else 'core' end,billing_cycle=case when p->>'billing'='annual' then 'annual' else 'monthly' end,subscription_status='active',last_summary_at=coalesce(last_summary_at,now()),canceled_at=null,winback_sent_at=null where email=lower(p->>'email') returning * into a; end if;
    if a.id is null then raise exception 'account_not_found'; end if;
    insert into public.leadrecovery_events(account_id,type,payload) values(a.id,'subscription.activated',jsonb_build_object('plan',a.plan,'billing',a.billing_cycle));
    if a.referrer_account_id is not null then update public.leadrecovery_referrals set status='qualified',reward_cents=9900 where referred_account_id=a.id and status='pending'; end if;
    return to_jsonb(a);
  end if;

  if action='stripe_subscription' then
    update public.leadrecovery_accounts set subscription_status=case when p->>'status' in ('trialing','active','past_due','canceled','unpaid','incomplete') then p->>'status' else subscription_status end,plan=case when p->>'plan' in ('core','growth') then p->>'plan' else plan end,stripe_customer_id=coalesce(nullif(p->>'customer_id',''),stripe_customer_id),canceled_at=case when p->>'status'='canceled' then coalesce(canceled_at,now()) when p->>'status' in ('active','trialing') then null else canceled_at end,winback_sent_at=case when p->>'status' in ('active','trialing') then null else winback_sent_at end
    where stripe_subscription_id=p->>'subscription_id' or (nullif(p->>'account_id','') is not null and id=(p->>'account_id')::uuid) returning * into a;
    if a.id is not null then insert into public.leadrecovery_events(account_id,type,payload) values(a.id,'subscription.updated',jsonb_build_object('status',a.subscription_status)); end if; return to_jsonb(a);
  end if;

  if action='stripe_invoice' then
    update public.leadrecovery_accounts set subscription_status=case when p->>'status'='payment_failed' then 'past_due' when subscription_status='past_due' and p->>'status'='paid' then 'active' else subscription_status end,failed_payments=failed_payments+case when p->>'status'='payment_failed' then 1 else 0 end
    where stripe_subscription_id=p->>'subscription_id' returning * into a;
    if a.id is not null then insert into public.leadrecovery_events(account_id,type,payload) values(a.id,'invoice.'||(p->>'status'),jsonb_build_object('invoice_id',p->>'invoice_id','amount_paid',coalesce((p->>'amount_paid')::int,0))); end if; return to_jsonb(a);
  end if;

  if action='qualified_referrals' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
      select r.id,r.reward_cents,a.stripe_customer_id,a.email from public.leadrecovery_referrals r join public.leadrecovery_accounts a on a.id=r.referrer_account_id
      where r.status='qualified' and a.subscription_status in ('active','trialing') and a.stripe_customer_id is not null order by r.created_at limit 20 for update of r skip locked
    ) x; return result;
  end if;
  if action='referral_rewarded' then update public.leadrecovery_referrals set status='rewarded',rewarded_at=now() where id=(p->>'id')::uuid and status='qualified' returning id into rid; return jsonb_build_object('ok',rid is not null); end if;

  if action='review_due' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
      select l.id,l.email,l.name,a.business_name,a.review_url,a.reply_email
      from public.leadrecovery_leads l join public.leadrecovery_accounts a on a.id=l.account_id
      where l.status='converted' and l.review_due_at<=now() and l.review_sent_at is null and a.review_url<>'' and a.subscription_status in ('active','trialing')
      order by l.review_due_at limit 30 for update of l skip locked
    ) x; return result;
  end if;
  if action='review_sent' then update public.leadrecovery_leads set review_sent_at=now() where id=(p->>'id')::uuid and review_sent_at is null; return '{"ok":true}'::jsonb; end if;

  if action='winback_due' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
      select id,email,business_name from public.leadrecovery_accounts
      where subscription_status='canceled' and canceled_at<=now()-interval '14 days' and winback_sent_at is null
      order by canceled_at limit 30 for update skip locked
    ) x; return result;
  end if;
  if action='winback_sent' then update public.leadrecovery_accounts set winback_sent_at=now() where id=(p->>'id')::uuid and winback_sent_at is null; return '{"ok":true}'::jsonb; end if;

  if action='summary_due' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
      select a.id,a.email,a.business_name,a.plan,a.referral_code,a.stripe_customer_id,
        count(l.id) filter(where l.created_at>=now()-interval '30 days') leads_30d,
        count(l.id) filter(where l.status='engaged' and l.created_at>=now()-interval '30 days') engaged_30d,
        count(l.id) filter(where l.status='converted' and l.created_at>=now()-interval '30 days') converted_30d
      from public.leadrecovery_accounts a left join public.leadrecovery_leads l on l.account_id=a.id
      where a.subscription_status in ('active','trialing') and (a.last_summary_at is null or a.last_summary_at<now()-interval '30 days')
      group by a.id order by a.created_at limit 30
    ) x; return result;
  end if;
  if action='summary_sent' then update public.leadrecovery_accounts set last_summary_at=now() where id=(p->>'id')::uuid; return '{"ok":true}'::jsonb; end if;

  if action='webhook_claim' then
    insert into private.leadrecovery_webhooks(id,provider) values(p->>'id',p->>'provider') on conflict(id) do update set lease_until=now()+interval '60 seconds' where leadrecovery_webhooks.status='processing' and leadrecovery_webhooks.lease_until<now() returning id into rid;
    return jsonb_build_object('claimed',rid is not null);
  end if;
  if action='webhook_finish' then update private.leadrecovery_webhooks set status='completed' where id=p->>'id'; return '{"ok":true}'::jsonb; end if;

  if action='admin_accounts' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select id,email,business_name,plan,billing_cycle,subscription_status,failed_payments,created_at from public.leadrecovery_accounts order by created_at desc limit least(coalesce((p->>'limit')::int,100),500)) x; return result;
  end if;
  if action='admin_analytics' then
    return jsonb_build_object(
      'revenue_today_cents',(select coalesce(sum((payload->>'amount_paid')::int),0) from public.leadrecovery_events where type='invoice.paid' and created_at>=date_trunc('day',now())),
      'revenue_month_cents',(select coalesce(sum((payload->>'amount_paid')::int),0) from public.leadrecovery_events where type='invoice.paid' and created_at>=date_trunc('month',now())),
      'mrr_cents',(select coalesce(sum(case plan when 'core' then 9900 when 'growth' then 17900 else 0 end),0) from public.leadrecovery_accounts where subscription_status in ('active','trialing')),
      'customers',(select count(*) from public.leadrecovery_accounts where subscription_status in ('active','trialing','past_due')),
      'active_subscriptions',(select count(*) from public.leadrecovery_accounts where subscription_status in ('active','trialing')),
      'new_customers_30d',(select count(*) from public.leadrecovery_accounts where created_at>=now()-interval '30 days' and subscription_status in ('active','trialing','past_due')),
      'churn_30d',(select case when count(*) filter(where subscription_status in ('active','trialing','canceled'))=0 then 0 else round(100.0*count(*) filter(where subscription_status='canceled' and updated_at>=now()-interval '30 days')/count(*) filter(where subscription_status in ('active','trialing','canceled')),1) end from public.leadrecovery_accounts),
      'failed_payments',(select count(*) from public.leadrecovery_events where type='invoice.payment_failed' and created_at>=now()-interval '30 days'),
      'open_support',(select count(*) from public.leadrecovery_support where status='open'),
      'leads',(select count(*) from public.leadrecovery_leads),
      'conversion_rate',(select case when count(*)=0 then 0 else round(100.0*count(*) filter(where status='converted')/count(*),1) end from public.leadrecovery_leads)
    );
  end if;

  if action='retention' then
    delete from private.leadrecovery_webhooks where created_at<now()-interval '30 days';
    delete from public.leadrecovery_events where created_at<now()-interval '365 days';
    delete from public.leadrecovery_messages where created_at<now()-interval '365 days';
    return '{"ok":true}'::jsonb;
  end if;

  raise exception 'unknown_action';
end $$;

-- Guard with the already-deployed application secret validator. No new database credential is introduced.
create or replace function public.leadrecovery_rpc(p_secret text,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.ai_business_rpc(p_secret,'health','{}');
  return private.leadrecovery_dispatch(p_action,p_payload);
end $$;
revoke all on function public.leadrecovery_rpc(text,text,jsonb) from public;
grant execute on function public.leadrecovery_rpc(text,text,jsonb) to anon,authenticated,service_role;
revoke all on function private.leadrecovery_dispatch(text,jsonb) from public,anon,authenticated;
