function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [decodeURIComponent(i < 0 ? v : v.slice(0, i)), decodeURIComponent(i < 0 ? '' : v.slice(i + 1))];
  }));
}

function cookie(name, value, config, maxAge = 3600) {
  return `${name}=${encodeURIComponent(value || '')}; HttpOnly; SameSite=Lax; Path=/autopilot; Max-Age=${maxAge}${config.production ? '; Secure' : ''}`;
}

module.exports = function makeAuth(config) {
  const base = config.supabase.url.replace(/\/$/, '');
  const headers = { apikey: config.supabase.publishableKey, 'Content-Type': 'application/json' };

  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!response.ok) {
      const error = new Error(data?.msg || data?.message || data?.error_description || 'Authenticatie mislukt');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function signUp(email, password, redirectTo) {
    return request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', body: JSON.stringify({ email, password }) });
  }
  async function signIn(email, password) {
    return request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  }
  async function recover(email, redirectTo) {
    return request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', body: JSON.stringify({ email }) });
  }
  async function updatePassword(accessToken, password) {
    return request('/auth/v1/user', { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ password }) });
  }
  async function getUser(accessToken) {
    if (!accessToken) return null;
    try { return await request('/auth/v1/user', { headers: { Authorization: `Bearer ${accessToken}` } }); } catch { return null; }
  }
  async function refresh(refreshToken) {
    if (!refreshToken) return null;
    try { return await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }); } catch { return null; }
  }
  async function session(req) {
    const c = parseCookies(req.headers.cookie || '');
    let accessToken = c.lra_at || '';
    let refreshToken = c.lra_rt || '';
    let user = await getUser(accessToken);
    let refreshed = null;
    if (!user && refreshToken) {
      refreshed = await refresh(refreshToken);
      accessToken = refreshed?.access_token || '';
      refreshToken = refreshed?.refresh_token || refreshToken;
      user = await getUser(accessToken);
    }
    return { user, accessToken, refreshToken, refreshed };
  }
  function sessionCookies(tokens) {
    const expires = Math.max(300, Number(tokens.expires_in || 3600));
    return [cookie('lra_at', tokens.access_token, config, expires), cookie('lra_rt', tokens.refresh_token, config, 60 * 60 * 24 * 30)];
  }
  function clearCookies() {
    return [cookie('lra_at', '', config, 0), cookie('lra_rt', '', config, 0)];
  }
  return { signUp, signIn, recover, updatePassword, getUser, session, sessionCookies, clearCookies };
};
