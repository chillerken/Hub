function makeAutomation(config, store, messenger) {
  async function run() {
    const now = new Date();
    const leads = await store.listLeads();
    const appointments = await store.listAppointments();
    const result = { followups: 0, reminders: 0, reviews: 0 };

    for (const lead of leads) {
      if (lead.follow_up_at && ['new','contacted','quoted'].includes(lead.status) && new Date(lead.follow_up_at) <= now) {
        const text = `Dag ${lead.name}, je had onlangs contact met ${config.business.name}${lead.service ? ` over ${lead.service}` : ''}. Kan ik je nog ergens mee helpen of wil je een afspraak/offerte inplannen?`;
        await messenger.sendBest({ lead, subject: `Nog interesse in ${lead.service || config.business.name}?`, text, type: 'lead_followup' });
        await store.updateLead(lead.id, { follow_up_at: null, last_contact_at: now.toISOString(), next_action: 'Wacht op reactie' });
        result.followups++;
      }
    }

    for (const appt of appointments) {
      if (appt.status !== 'scheduled' || appt.reminder_sent_at) continue;
      const starts = new Date(appt.starts_at);
      const hours = (starts - now) / 36e5;
      if (hours >= 0 && hours <= config.appointmentReminderHours) {
        const lead = await store.getLead(appt.lead_id); if (!lead) continue;
        const when = starts.toLocaleString('nl-BE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Brussels' });
        const text = `Dag ${lead.name}, vriendelijke herinnering aan je afspraak bij ${config.business.name} op ${when}. Tot dan!`;
        await messenger.sendBest({ lead, subject: `Herinnering afspraak ${config.business.name}`, text, type: 'appointment_reminder' });
        await store.updateAppointment(appt.id, { reminder_sent_at: now.toISOString() });
        result.reminders++;
      }
    }

    for (const appt of appointments) {
      if (appt.status !== 'completed') continue;
      const lead = await store.getLead(appt.lead_id); if (!lead || lead.review_sent_at || !config.business.reviewUrl) continue;
      const text = `Dag ${lead.name}, bedankt dat je voor ${config.business.name} koos. Tevreden? Een korte Google-review helpt onze lokale zaak enorm: ${config.business.reviewUrl}`;
      await messenger.sendBest({ lead, subject: `Hoe was je ervaring met ${config.business.name}?`, text, type: 'review_request' });
      await store.updateLead(lead.id, { review_sent_at: now.toISOString(), next_action: 'Review gevraagd' });
      result.reviews++;
    }
    return result;
  }
  return { run };
}
module.exports = makeAutomation;
