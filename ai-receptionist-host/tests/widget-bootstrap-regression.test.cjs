const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'widget.js'), 'utf8');

function evaluate(windowState, scriptElement) {
  const warnings = [];
  const context = { window: windowState, document: { currentScript: scriptElement }, console: { warn: (...args) => warnings.push(args.join(' ')) } };
  try { vm.runInNewContext(script, context, { timeout: 500 }); }
  catch (error) {
    // A correctly configured widget proceeds to construct browser UI.
    // This isolated bootstrap test deliberately does not mock the DOM.
    if (!windowState.__RECEPTION_AI_WIDGET_LOADED__) throw error;
  }
  return warnings;
}

test('missing script does not poison widget bootstrap', () => {
  const state = {};
  evaluate(state, null);
  assert.notEqual(state.__RECEPTION_AI_WIDGET_LOADED__, true);
});

test('missing widget token is retryable with a subsequent valid embed', () => {
  const state = {};
  const warnings = evaluate(state, { dataset: {} });
  assert.match(warnings.join(' '), /data-widget-token ontbreekt/);
  assert.notEqual(state.__RECEPTION_AI_WIDGET_LOADED__, true);
  evaluate(state, { dataset: { widgetToken: 'test-token' } });
  assert.equal(state.__RECEPTION_AI_WIDGET_LOADED__, true);
});
