class Store {
  constructor(config) {
    if (!config.supabase.url) throw new Error('SUPABASE_URL is verplicht.');
    if (!config.supabase.publishableKey) throw new Error('SUPABASE_PUBLISHABLE_KEY is verplicht.');
    if (!config.supabase.appSecret) throw new Error('SUPABASE_APP_SECRET is verplicht.');
    this.url = config.supabase.url.replace(/\/$/, '');
    this.key = config.supabase.publishableKey;
    this.secret = config.supabase.appSecret;
  }

  async rpc(action, payload = {}) {
    const res = await fetch(`${this.url}/rest/v1/rpc/ai_business_rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`
      },
      body: JSON.stringify({ p_secret: this.secret, p_action: action, p_payload: payload })
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(`Supabase RPC ${action} failed (${res.status})`);
      err.status = res.status;
      err.detail = data;
      throw err;
    }
    return data;
  }

  async init() { return this.health(); }
  async health() { const r = await this.rpc('health'); return Boolean(r?.ok); }
  async listLeads() { return await this.rpc('list_leads'); }
  async getLead(id) { return await this.rpc('get_lead', { id }); }
  async createLead(d) { return await this.rpc('create_lead', d); }
  async updateLead(id, patch) { return await this.rpc('update_lead', { id, ...patch }); }
  async listAppointments() { return await this.rpc('list_appointments'); }
  async createAppointment(d) { return await this.rpc('create_appointment', d); }
  async updateAppointment(id, patch) { return await this.rpc('update_appointment', { id, ...patch }); }
  async createEvent(d) { return await this.rpc('create_event', d); }
  async listEvents(limit = 100) { return await this.rpc('list_events', { limit }); }

  async withAutomationLock(fn) {
    return fn();
  }

  async close() {}
}

module.exports = config => new Store(config);
