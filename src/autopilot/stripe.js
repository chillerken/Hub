const crypto = require('node:crypto');

const PLANS = {
  core_monthly: { code: 'core', billing: 'monthly', amount: 9900, label: 'Core', interval: 'month' },
  core_annual: { code: 'core', billing: 'annual', amount: 99000, label: 'Core Jaar', interval: 'year' },
  growth_monthly: { code: 'growth', billing: 'monthly', amount: 17900, label: 'Growth', interval: 'month' },
  growth_annual: { code: 'growth', billing: 'annual', amount: 179000, label: 'Growth Jaar', interval: 'year' }
};

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

module.exports = function makeStripe(config) {
  const secret = process.env.AUTOPILOT_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
  const webhookSecret = process.env.AUTOPILOT_STRIPE_WEBHOOK_SECRET || '';

  async function api(path, params) {
    if (!secret) throw Object.assign(new Error('Stripe live key is nog niet geconfigureerd.'), { status: 503 });
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data?.error?.message || 'Stripe-fout'), { status: response.status });
    return data;
  }

  async function checkout({ account, planKey }) {
    const plan = PLANS[planKey];
    if (!plan) throw Object.assign(new Error('Onbekend abonnement'), { status: 400 });
    const success = `${config.baseUrl}/autopilot/success?session_id={CHECKOUT_SESSION_ID}`;
    return api('/checkout/sessions', {
      mode: 'subscription', customer_email: account.email, client_reference_id: account.id,
      success_url: success, cancel_url: `${config.baseUrl}/autopilot/pricing?cancelled=1`,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(plan.amount),
      'line_items[0][price_data][recurring][interval]': plan.interval,
      'line_items[0][price_data][product_data][name]': `LuxAI Lead Autopilot — ${plan.label}`,
      'metadata[account_id]': account.id, 'metadata[plan]': plan.code, 'metadata[billing]': plan.billing,
      'subscription_data[metadata][account_id]': account.id, 'subscription_data[metadata][plan]': plan.code,
      'allow_promotion_codes': 'true'
    });
  }

  async function applyCredit(customerId, amountCents, description) {
    if (!customerId || !Number.isInteger(amountCents) || amountCents <= 0) throw Object.assign(new Error('Ongeldige referral credit'), { status: 400 });
    return api(`/customers/${encodeURIComponent(customerId)}/balance_transactions`, { amount: String(-amountCents), currency: 'eur', description: description || 'Referral credit' });
  }

  async function portal(account) {
    if (!account.stripe_customer_id) throw Object.assign(new Error('Nog geen Stripe-klant gekoppeld'), { status: 409 });
    return api('/billing_portal/sessions', { customer: account.stripe_customer_id, return_url: `${config.baseUrl}/autopilot/app` });
  }

  function verify(raw, signature) {
    if (!webhookSecret || !signature) return false;
    const parts = Object.fromEntries(String(signature).split(',').map(v => v.split('=', 2)));
    const ts = Number(parts.t || 0);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return false;
    const expected = crypto.createHmac('sha256', webhookSecret).update(`${ts}.${raw}`).digest('hex');
    return safeEqual(expected, parts.v1);
  }

  return { PLANS, checkout, portal, applyCredit, verify, ready: Boolean(secret && webhookSecret), secretConfigured: Boolean(secret), webhookConfigured: Boolean(webhookSecret) };
};
