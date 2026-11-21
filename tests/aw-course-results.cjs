const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Exercise the actual display gate against the settled AW result and identity conflicts.
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/window\.jcmAcceptedResult = function\(r\) \{[\s\S]*?\n\};/)[0];
const context = { window: {}, URL, Date };
vm.runInNewContext(script, context);
const rows = JSON.parse(fs.readFileSync('data/competition-research-2026-11-21.json', 'utf8')).high_competition;
const giorgio = rows.find(row => row.horse === 'Giorgio M');
assert.equal(giorgio.course, 'Lingfield (AW)');
assert.equal(giorgio.result_status, 'LOSS');
assert.equal(giorgio.booked_profit_gbp, -500);
for (const row of rows) assert.equal(context.window.jcmAcceptedResult(row), true, row.horse);
for (const bad of [
  { course: 'Kempton (AW)' },
  { race_date: '2026-11-22' },
  { result_horse: 'Different horse' },
  { result_website_race_id: '1' },
  { result_status: 'WIN', position: '1' },
  { verification_status: 'AWAITING_RESULT' }
]) assert.equal(context.window.jcmAcceptedResult({ ...giorgio, ...bad }), false);
console.log('AW display regression passed: all five Saturday Picks accepted; mismatched evidence stays pending.');
