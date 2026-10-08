import test from 'node:test';
import assert from 'node:assert/strict';
import { canUsePlan, escapeHtml } from '../ai-receptionist-host/access.js';
const now = Date.parse('2026-10-08T12:00:00Z');
test('only valid, current trials unlock paid features', () => {
  for (const end of [null, '', 'invalid', '2026-10-08T12:00:00Z', '2026-10-07T12:00:00Z']) {
    assert.equal(canUsePlan({plan:'trial',trial_ends_at:end},'business',now),false);
  }
  assert.equal(canUsePlan({plan:'trial',trial_ends_at:'2026-10-09T12:00:00Z'},'business',now),true);
});
test('paid features respect plan and subscription status', () => {
  assert.equal(canUsePlan({plan:'starter',subscription_status:'active'},'pro',now),false);
  assert.equal(canUsePlan({plan:'pro',subscription_status:'active'},'pro',now),true);
  for (const status of ['canceled','past_due','unpaid',null]) {
    assert.equal(canUsePlan({plan:'business',subscription_status:status},'starter',now),false);
  }
  assert.equal(canUsePlan({plan:'unknown',subscription_status:'active'},'starter',now),false);
  assert.equal(canUsePlan({is_internal:true},'unknown',now),false);
  assert.equal(canUsePlan({is_internal:true},'business',now),true);
});
test('business text is safely escaped in HTML and attributes', () => {
  assert.equal(escapeHtml('<img title="x" onerror=\'y\'>&'), '&lt;img title=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;');
  assert.equal(escapeHtml(null),'');
});
