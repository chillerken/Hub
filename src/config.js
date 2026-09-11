const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const s=line.trim(); if(!s || s.startsWith('#')) continue;
    const i=s.indexOf('='); if(i<0) continue;
    const k=s.slice(0,i).trim(); let v=s.slice(i+1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v=v.slice(1,-1);
    if (process.env[k] === undefined) process.env[k]=v;
  }
}
loadDotEnv();

const splitServices = (value) => (value || '').split('|').map(v=>v.trim()).filter(Boolean);
module.exports = {
  port:Number(process.env.PORT||3000),
  baseUrl:process.env.BASE_URL||`http://localhost:${process.env.PORT||3000}`,
  adminPassword:process.env.ADMIN_PASSWORD||'change-this-now',
  cookieSecret:process.env.COOKIE_SECRET||'dev-cookie-secret-change-me',
  cronSecret:process.env.CRON_SECRET||'dev-cron-secret-change-me',
  openaiKey:process.env.OPENAI_API_KEY||'',
  openaiModel:process.env.OPENAI_MODEL||'gpt-5.6-luna',
  resend:{apiKey:process.env.RESEND_API_KEY||'',from:process.env.RESEND_FROM||process.env.BUSINESS_EMAIL||'noreply@example.com'},
  whatsapp:{token:process.env.WHATSAPP_TOKEN||'',phoneNumberId:process.env.WHATSAPP_PHONE_NUMBER_ID||'',apiVersion:process.env.WHATSAPP_API_VERSION||'v23.0'},
  business:{
    name:process.env.BUSINESS_NAME||'Demo Lokale Zaak', email:process.env.BUSINESS_EMAIL||'info@example.be',
    phone:process.env.BUSINESS_PHONE||'+32 470 00 00 00', website:process.env.BUSINESS_WEBSITE||'https://example.be',
    area:process.env.BUSINESS_AREA||'Aalst en omgeving', hours:process.env.BUSINESS_HOURS||'Ma-Vr 08:00-18:00',
    reviewUrl:process.env.GOOGLE_REVIEW_URL||'', services:splitServices(process.env.BUSINESS_SERVICES||'Dienst 1|Dienst 2|Offerte op maat')
  },
  leadFollowupHours:Number(process.env.LEAD_FOLLOWUP_HOURS||24),
  appointmentReminderHours:Number(process.env.APPOINTMENT_REMINDER_HOURS||24)
};
