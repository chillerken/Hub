export const planRank = { starter: 1, pro: 2, business: 3 };

export function canUsePlan(org, tier, now = Date.now()) {
  if (!Object.hasOwn(planRank, tier)) return false;
  if (org?.is_internal === true) return true;
  if (org?.plan === 'trial') {
    const expiry = Date.parse(org.trial_ends_at || '');
    return Number.isFinite(expiry) && expiry > now;
  }
  return Object.hasOwn(planRank, org?.plan) &&
    ['active', 'trialing'].includes(org?.subscription_status) &&
    planRank[org.plan] >= planRank[tier];
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
