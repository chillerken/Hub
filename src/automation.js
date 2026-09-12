function makeAutomation(config, store, messenger) {
  async function processJobs(result) {
    const jobs = await store.listDueJobs(50).catch(()=>[]);
    for (const job of jobs) {
      const attempts = Number(job.attempts || 0) + 1;
      await store.updateJob(job.id,{status:'processing',attempts,locked_at:new Date().toISOString()}).catch(()=>{});
      try {
        const payload = job.payload || {};
        const lead = job.lead_id ? await store.getLead(job.lead_id) : null;
        let sent = null;

        if (job.agent_type === 'email' || job.agent_type === 'cold_email') {
          if (!lead) throw new Error('Lead ontbreekt');
          sent = await messenger.sendEmail({
            lead,
            subject:String(payload.subject || (job.agent_type==='cold_email' ? `Kennismaking — ${config.business.name}` : config.business.name)).slice(0,180),
            text:String(payload.text || payload.message || '').slice(0,12000),
            type:job.agent_type
          });
          if (!sent.ok) {
            if (sent.skipped) {
              await store.updateJob(job.id,{status:'skipped',last_error:sent.reason || 'Overgeslagen',completed_at:new Date().toISOString()});
              result.jobsSkipped++;
              continue;
            }
            throw new Error(sent.error || sent.reason || 'Verzending mislukt');
          }
        } else if (job.agent_type === 'lead') {
          if (!lead) throw new Error('Lead ontbreekt');
          const text = String(payload.text || `Dag ${lead.name}, bedankt voor je interesse in ${config.business.name}. Kan ik je helpen met een offerte of afspraak?`);
          sent = await messenger.sendBest({lead,subject:String(payload.subject || `Opvolging — ${config.business.name}`),text,type:'lead_agent'});
          if (!sent.ok) throw new Error(sent.reason || sent.error || 'Opvolging mislukt');
        } else if (job.agent_type === 'social') {
          await store.createEvent({type:'social_job',lead_id:null,channel:String(payload.platform || 'social'),status:'queued',detail:String(payload.caption || payload.text || '').slice(0,500),provider_id:null});
        } else if (job.agent_type === 'booking') {
          await store.createEvent({type:'booking_job',lead_id:lead?.id || null,channel:'booking',status:'queued',detail:JSON.stringify(payload).slice(0,500),provider_id:null});
        } else if (job.agent_type === 'voice') {
          await store.createEvent({type:'voice_job',lead_id:lead?.id || null,channel:'voice',status:'queued',detail:JSON.stringify(payload).slice(0,500),provider_id:null});
        }

        await store.updateJob(job.id,{status:'completed',provider_id:sent?.providerId || '',completed_at:new Date().toISOString(),last_error:''});
        result.jobsCompleted++;
      } catch (e) {
        const terminal = attempts >= Number(job.max_attempts || 3);
        await store.updateJob(job.id,{status:terminal?'failed':'queued',last_error:String(e.message || e).slice(0,500),completed_at:terminal?new Date().toISOString():''}).catch(()=>{});
        result.jobsFailed++;
      }
    }
  }

  async function runUnlocked() {
    const now = new Date();
    const leads = await store.listLeads();
    const appointments = await store.listAppointments();
    const result = { followups:0, reminders:0, reviews:0, jobsCompleted:0, jobsFailed:0, jobsSkipped:0, errors:0 };

    for (const lead of leads) {
      if (lead.opted_out || !lead.follow_up_at || !['new','contacted','quoted'].includes(lead.status) || new Date(lead.follow_up_at) > now) continue;
      const text = `Dag ${lead.name}, je had onlangs contact met ${config.business.name}${lead.service ? ` over ${lead.service}` : ''}. Kan ik je nog ergens mee helpen of wil je een afspraak/offerte inplannen?`;
      const sent = await messenger.sendBest({ lead, subject:`Nog interesse in ${lead.service || config.business.name}?`, text, type:'lead_followup' });
      if (sent.ok) {
        await store.updateLead(lead.id, { follow_up_at:null, last_contact_at:now.toISOString(), next_action:'Wacht op reactie' });
        result.followups++;
      } else if (!sent.skipped) result.errors++;
    }

    for (const appt of appointments) {
      if (appt.status !== 'scheduled' || appt.reminder_sent_at) continue;
      const starts = new Date(appt.starts_at);
      const hours = (starts - now) / 36e5;
      if (hours < 0 || hours > config.appointmentReminderHours) continue;
      const lead = await store.getLead(appt.lead_id);
      if (!lead || lead.opted_out) continue;
      const when = starts.toLocaleString('nl-BE', { dateStyle:'full', timeStyle:'short', timeZone:'Europe/Brussels' });
      const text = `Dag ${lead.name}, vriendelijke herinnering aan je afspraak bij ${config.business.name} op ${when}. Tot dan!`;
      const sent = await messenger.sendBest({ lead, subject:`Herinnering afspraak ${config.business.name}`, text, type:'appointment_reminder' });
      if (sent.ok) {
        await store.updateAppointment(appt.id, { reminder_sent_at:now.toISOString() });
        result.reminders++;
      } else if (!sent.skipped) result.errors++;
    }

    for (const appt of appointments) {
      if (appt.status !== 'completed') continue;
      const lead = await store.getLead(appt.lead_id);
      if (!lead || lead.opted_out || lead.review_sent_at || !config.business.reviewUrl) continue;
      const text = `Dag ${lead.name}, bedankt dat je voor ${config.business.name} koos. Tevreden? Een korte Google-review helpt onze lokale zaak enorm: ${config.business.reviewUrl}`;
      const sent = await messenger.sendBest({ lead, subject:`Hoe was je ervaring met ${config.business.name}?`, text, type:'review_request' });
      if (sent.ok) {
        await store.updateLead(lead.id, { review_sent_at:now.toISOString(), next_action:'Review gevraagd' });
        result.reviews++;
      } else if (!sent.skipped) result.errors++;
    }

    await processJobs(result);
    return result;
  }

  async function run() {
    return store.withAutomationLock(runUnlocked);
  }
  return { run };
}
module.exports = makeAutomation;
