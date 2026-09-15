module.exports = function makeMailer(config) {
  const apiKey = config.resend.apiKey;
  const from = process.env.AUTOPILOT_FROM || config.resend.from;

  async function send({ to, subject, text, replyTo }) {
    if (!apiKey || !from) return { ok: false, error: 'E-mailprovider niet geconfigureerd' };
    const payload = { from, to: [to], subject, text };
    if (replyTo) payload.reply_to = replyTo;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data?.message || `Resend HTTP ${response.status}` };
    return { ok: true, id: data.id || '' };
  }
  return { send, ready: Boolean(apiKey && from), from };
};
