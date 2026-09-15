module.exports = function makeLeadRecoveryDb(config) {
  return async function db(action, payload = {}) {
    const response = await fetch(`${config.supabase.url.replace(/\/$/, '')}/rest/v1/rpc/leadrecovery_rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabase.publishableKey
      },
      body: JSON.stringify({ p_secret: config.supabase.appSecret, p_action: action, p_payload: payload }),
      signal: AbortSignal.timeout(20000)
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!response.ok) {
      const error = new Error(data?.message || `Lead Recovery databasefout (${response.status})`);
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  };
};
