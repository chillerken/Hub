function makeMessenger(config, store) {
  const truncate = (s, n=500) => String(s || '').slice(0, n);

  async function log(type, lead, channel, status, detail, providerId='') {
    return store.createEvent({ type, lead_id: lead?.id || null, channel, status, detail: truncate(detail), provider_id: providerId || null });
  }

  async function sendEmail({ lead, subject, text, type }) {
    if (!lead?.email) return { ok:false, skipped:true, reason:'Geen e-mailadres' };
    if (!config.resend.apiKey || !config.resend.from) {
      await log(type, lead, 'email', 'unconfigured', 'Resend is niet geconfigureerd');
      return { ok:false, unconfigured:true, reason:'E-mailprovider niet geconfigureerd' };
    }
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{ Authorization:`Bearer ${config.resend.apiKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ from:config.resend.from, to:[lead.email], subject, text })
      });
      const data = await r.json().catch(async () => ({ raw: await r.text().catch(()=> '') }));
      if (!r.ok) throw new Error(data?.message || data?.error?.message || data?.raw || `Resend HTTP ${r.status}`);
      await log(type, lead, 'email', 'sent', subject, data?.id || '');
      return { ok:true, providerId:data?.id || '' };
    } catch (e) {
      await log(type, lead, 'email', 'error', e.message);
      return { ok:false, error:e.message };
    }
  }

  async function sendWhatsApp({ lead, text, type }) {
    if (!lead?.phone) return { ok:false, skipped:true, reason:'Geen telefoonnummer' };
    const { token, phoneNumberId, apiVersion } = config.whatsapp;
    if (!(token && phoneNumberId)) {
      await log(type, lead, 'whatsapp', 'unconfigured', 'WhatsApp Cloud API is niet geconfigureerd');
      return { ok:false, unconfigured:true, reason:'WhatsApp niet geconfigureerd' };
    }
    const to = String(lead.phone).replace(/[^0-9]/g, '');
    if (!to) return { ok:false, skipped:true, reason:'Ongeldig telefoonnummer' };
    try {
      const r = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ messaging_product:'whatsapp', recipient_type:'individual', to, type:'text', text:{ preview_url:true, body:text } })
      });
      const data = await r.json().catch(async () => ({ raw: await r.text().catch(()=> '') }));
      if (!r.ok) throw new Error(data?.error?.message || data?.raw || `WhatsApp HTTP ${r.status}`);
      const id = data?.messages?.[0]?.id || '';
      await log(type, lead, 'whatsapp', 'sent', truncate(text, 200), id);
      return { ok:true, providerId:id };
    } catch (e) {
      await log(type, lead, 'whatsapp', 'error', e.message);
      return { ok:false, error:e.message };
    }
  }

  async function sendBest(args) {
    if (args.lead?.email) return sendEmail(args);
    if (args.lead?.phone) return sendWhatsApp(args);
    return { ok:false, skipped:true, reason:'Geen bruikbaar contactkanaal' };
  }

  return {
    sendEmail,
    sendWhatsApp,
    sendBest,
    emailReady:Boolean(config.resend.apiKey && config.resend.from),
    whatsappReady:Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId)
  };
}
module.exports = makeMessenger;
