CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_name text;
  v_onboarding_token uuid;
  v_invite record;
  v_now timestamptz := now();
begin
  v_name := left(coalesce(nullif(trim(new.raw_user_meta_data->>'business_name'),''),'Mijn bedrijf'),120);

  begin
    v_onboarding_token := nullif(trim(new.raw_user_meta_data->>'onboarding_token'),'')::uuid;
  exception when others then
    v_onboarding_token := null;
  end;

  if v_onboarding_token is not null then
    select i.*,l.email,l.phone,l.name,l.qualification
    into v_invite
    from public.sales_onboarding_invites i
    join public.leads l on l.id=i.lead_id and l.organization_id=i.sales_organization_id
    where i.token=v_onboarding_token
      and new.email_confirmed_at is not null
      and nullif(lower(trim(l.email)),'')=lower(trim(new.email))
      and i.status='pending'
      and i.expires_at>v_now
    for update;

    if found and coalesce(v_invite.qualification->>'company','')<>'' then
      v_name := left(v_invite.qualification->>'company',120);
    end if;
  end if;

  insert into public.organizations(name,status)
  values(v_name,'onboarding')
  returning id into v_org;

  insert into public.memberships(organization_id,user_id,role,active)
  values(v_org,new.id,'owner',true);

  insert into public.business_profiles(
    organization_id,business_name,qualification_questions,notification_email
  )
  values(
    v_org,
    v_name,
    '["Waarmee kunnen we u precies helpen?","Wanneer wilt u dit laten uitvoeren?","Hoe mogen we u het best bereiken?"]'::jsonb,
    nullif(lower(trim(new.email)),'')
  );

  insert into public.audit_events(
    organization_id,actor_user_id,event_type,entity_type,entity_id,payload
  )
  values(
    v_org,new.id,'organization.created','organization',v_org,
    jsonb_build_object(
      'source',case when v_onboarding_token is not null and v_invite.id is not null then 'reception_ai_sales_onboarding' else 'auth_signup' end
    )
  );

  if v_onboarding_token is not null and v_invite.id is not null then
    update public.sales_onboarding_invites
    set status='claimed',
        claimed_organization_id=v_org,
        claimed_at=v_now,
        updated_at=v_now
    where id=v_invite.id;

    update public.leads
    set status='follow_up',
        score=greatest(score,95),
        qualification=coalesce(qualification,'{}'::jsonb) || jsonb_build_object(
          'funnel_stage','onboarding_started',
          'requested_plan',v_invite.requested_plan,
          'onboarding_invite_id',v_invite.id,
          'tenant_organization_id',v_org
        ),
        updated_at=v_now
    where id=v_invite.lead_id
      and organization_id=v_invite.sales_organization_id
      and status not in ('won','lost');

    insert into public.sales_opportunities(
      organization_id,lead_id,temperature,stage,confidence,next_action,reason,channel,message,objection,missing_info,can_contact,analyzed_at,updated_at
    )
    values(
      v_invite.sales_organization_id,v_invite.lead_id,'hot','onboarding',98,
      'Onboarding begeleiden en controleren of bedrijfsprofiel, widget en integraties correct worden ingesteld.',
      'De prospect heeft vanuit de Reception AI-verkoopflow zelf een bedrijfsaccount aangemaakt.',
      case when coalesce(v_invite.phone,'')<>'' then 'telefoon' else 'e-mail' end,
      '',
      '',
      '[]'::jsonb,
      true,
      v_now,v_now
    )
    on conflict (organization_id,lead_id) do update set
      temperature='hot',
      stage='onboarding',
      confidence=greatest(public.sales_opportunities.confidence,98),
      next_action=excluded.next_action,
      reason=excluded.reason,
      channel=excluded.channel,
      can_contact=true,
      analyzed_at=v_now,
      updated_at=v_now;

    if not exists(
      select 1 from public.tasks
      where organization_id=v_invite.sales_organization_id
        and lead_id=v_invite.lead_id
        and status='open'
        and title='Sales Agent: Reception AI onboarding begeleiden'
    ) then
      insert into public.tasks(organization_id,lead_id,title,status,priority,due_at)
      values(
        v_invite.sales_organization_id,
        v_invite.lead_id,
        'Sales Agent: Reception AI onboarding begeleiden',
        'open','high',v_now+interval '24 hours'
      );
    end if;

    insert into public.audit_events(
      organization_id,actor_user_id,event_type,entity_type,entity_id,payload
    )
    values(
      v_invite.sales_organization_id,null,'sales_onboarding.started','lead',v_invite.lead_id,
      jsonb_build_object(
        'invite_id',v_invite.id,
        'requested_plan',v_invite.requested_plan,
        'claimed_organization_id',v_org
      )
    );
  end if;

  return new;
end;
$function$

