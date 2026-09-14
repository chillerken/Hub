const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadDotEnv();

const splitServices = value => (value || '').split('|').map(v => v.trim()).filter(Boolean);
const production = process.env.NODE_ENV === 'production';

const config = {
  production,
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${process.env.PORT || 3000}`),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  cookieSecret: process.env.COOKIE_SECRET || '',
  cronSecret: process.env.CRON_SECRET || '',
  siteBridgeSecret: process.env.LUXWASH_SITE_BRIDGE_SECRET || '',
  aiMode: process.env.AI_MODE === 'generative' ? 'generative' : 'rules',
  publicSiteUrl: 'https://www.luxwash.online',
  centralDashboard: process.env.CENTRAL_DASHBOARD === 'enabled',
  supabase: {
    url: process.env.SUPABASE_URL || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    appSecret: process.env.SUPABASE_APP_SECRET || ''
  },
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.RESEND_FROM || process.env.BUSINESS_EMAIL || ''
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0'
  },
  business: {
    name: process.env.BUSINESS_NAME || 'Lokale zaak',
    email: process.env.BUSINESS_EMAIL || '',
    phone: process.env.BUSINESS_PHONE || '',
    website: process.env.BUSINESS_WEBSITE || '',
    area: process.env.BUSINESS_AREA || '',
    hours: process.env.BUSINESS_HOURS || '',
    reviewUrl: process.env.GOOGLE_REVIEW_URL || '',
    services: splitServices(process.env.BUSINESS_SERVICES || '')
  },
  leadFollowupHours: Number(process.env.LEAD_FOLLOWUP_HOURS || 24),
  appointmentReminderHours: Number(process.env.APPOINTMENT_REMINDER_HOURS || 24),
  automationIntervalMinutes: Number(process.env.AUTOMATION_INTERVAL_MINUTES || 5)
};

function validate() {
  const errors = [];
  if (!config.supabase.url) errors.push('SUPABASE_URL ontbreekt');
  if (!config.supabase.publishableKey) errors.push('SUPABASE_PUBLISHABLE_KEY ontbreekt');
  if (!config.supabase.appSecret || config.supabase.appSecret.length < 32) errors.push('SUPABASE_APP_SECRET moet minstens 32 tekens bevatten');
  if (!config.adminPassword || config.adminPassword.length < 12) errors.push('ADMIN_PASSWORD moet minstens 12 tekens bevatten');
  if (!config.cookieSecret || config.cookieSecret.length < 32) errors.push('COOKIE_SECRET moet minstens 32 tekens bevatten');
  if (!config.cronSecret || config.cronSecret.length < 32) errors.push('CRON_SECRET moet minstens 32 tekens bevatten');
  if (!config.business.name) errors.push('BUSINESS_NAME ontbreekt');
  if (production && errors.length) throw new Error(`Productieconfiguratie ongeldig: ${errors.join('; ')}`);
  return errors;
}

config.validationErrors = validate();
module.exports = config;
