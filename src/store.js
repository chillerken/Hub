const crypto = require('crypto');
const { Pool } = require('pg');

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

class Store {
  constructor(config) {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is verplicht. Lokale JSON-opslag is uitgeschakeld.');
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined
    });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL DEFAULT '',
        phone text NOT NULL DEFAULT '',
        service text NOT NULL DEFAULT '',
        message text NOT NULL DEFAULT '',
        source text NOT NULL DEFAULT 'website',
        status text NOT NULL DEFAULT 'new',
        last_contact_at timestamptz,
        next_action text NOT NULL DEFAULT 'Opvolgen',
        follow_up_at timestamptz,
        review_sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at DESC);
      CREATE INDEX IF NOT EXISTS leads_follow_up_idx ON leads(follow_up_at) WHERE follow_up_at IS NOT NULL;

      CREATE TABLE IF NOT EXISTS appointments (
        id uuid PRIMARY KEY,
        lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        starts_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'scheduled',
        reminder_sent_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS appointments_start_idx ON appointments(starts_at);

      CREATE TABLE IF NOT EXISTS events (
        id uuid PRIMARY KEY,
        type text NOT NULL,
        lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
        channel text,
        status text NOT NULL,
        detail text,
        provider_id text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS events_created_at_idx ON events(created_at DESC);
    `);
  }

  async health() {
    const r = await this.pool.query('SELECT 1 AS ok');
    return r.rows[0]?.ok === 1;
  }

  async listLeads() {
    return (await this.pool.query('SELECT * FROM leads ORDER BY created_at DESC')).rows;
  }
  async getLead(id) {
    return (await this.pool.query('SELECT * FROM leads WHERE id=$1', [id])).rows[0] || null;
  }
  async createLead(d) {
    const row = {
      id: uuid(), status: 'new', last_contact_at: null, next_action: 'Opvolgen', review_sent_at: null,
      created_at: now(), updated_at: now(), ...d
    };
    const q = `INSERT INTO leads
      (id,name,email,phone,service,message,source,status,last_contact_at,next_action,follow_up_at,review_sent_at,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`;
    const v = [row.id,row.name,row.email||'',row.phone||'',row.service||'',row.message||'',row.source||'website',row.status,row.last_contact_at,row.next_action,row.follow_up_at||null,row.review_sent_at,row.created_at,row.updated_at];
    return (await this.pool.query(q, v)).rows[0];
  }
  async updateLead(id, patch) {
    const allowed = ['status','next_action','follow_up_at','last_contact_at','review_sent_at'];
    const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
    if (!entries.length) return this.getLead(id);
    const sets = entries.map(([k], i) => `${k}=$${i+2}`);
    sets.push(`updated_at=now()`);
    const values = [id, ...entries.map(([,v]) => v)];
    return (await this.pool.query(`UPDATE leads SET ${sets.join(',')} WHERE id=$1 RETURNING *`, values)).rows[0] || null;
  }

  async listAppointments() {
    return (await this.pool.query('SELECT * FROM appointments ORDER BY starts_at ASC')).rows;
  }
  async createAppointment(d) {
    const row = { id: uuid(), status: 'scheduled', reminder_sent_at: null, completed_at: null, created_at: now(), ...d };
    return (await this.pool.query(`INSERT INTO appointments
      (id,lead_id,starts_at,status,reminder_sent_at,completed_at,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *`,
      [row.id,row.lead_id,row.starts_at,row.status,row.reminder_sent_at,row.completed_at,row.created_at])).rows[0];
  }
  async updateAppointment(id, patch) {
    const allowed = ['status','reminder_sent_at','completed_at'];
    const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
    if (!entries.length) return (await this.pool.query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0] || null;
    const sets = entries.map(([k], i) => `${k}=$${i+2}`);
    sets.push(`updated_at=now()`);
    const values = [id, ...entries.map(([,v]) => v)];
    return (await this.pool.query(`UPDATE appointments SET ${sets.join(',')} WHERE id=$1 RETURNING *`, values)).rows[0] || null;
  }

  async createEvent(d) {
    const row = { id: uuid(), created_at: now(), ...d };
    return (await this.pool.query(`INSERT INTO events
      (id,type,lead_id,channel,status,detail,provider_id,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [row.id,row.type,row.lead_id||null,row.channel||null,row.status,row.detail||null,row.provider_id||null,row.created_at])).rows[0];
  }
  async listEvents(limit = 100) {
    const n = Math.max(1, Math.min(Number(limit) || 100, 1000));
    return (await this.pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT $1',[n])).rows;
  }

  async withAutomationLock(fn) {
    const client = await this.pool.connect();
    try {
      const lock = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [84319021]);
      if (!lock.rows[0]?.locked) return { skipped: true, reason: 'already_running', followups: 0, reminders: 0, reviews: 0, errors: 0 };
      return await fn();
    } finally {
      try { await client.query('SELECT pg_advisory_unlock($1)', [84319021]); } catch {}
      client.release();
    }
  }

  async close() { await this.pool.end(); }
}

module.exports = config => new Store(config);
