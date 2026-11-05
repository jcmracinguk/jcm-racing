const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=JSON.parse(fs.readFileSync('data/bet-builder-2026-11-05.json'));
const store=new Map(),stub={addEventListener(){},querySelector(){return stub;}};
class Clock extends Date{static now(){return Date.parse('2026-11-05T15:00:00Z');}}
const context={window:{jcmAcceptedResult:()=>true},document:{getElementById:()=>stub,addEventListener(){}},structuredClone,Date:Clock,setInterval(){},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
const source=fs.readFileSync('scripts/bet-builder.js','utf8').replace("window.jcmOpenDummyAccount=()=>open('race');","window.additionTest={settings,key,storage};window.jcmOpenDummyAccount=()=>open('race');");
vm.runInNewContext(source,context);const api=context.window.additionTest;
const old=structuredClone(c);old.rows.pop();old.published_simulations.race.entries.pop();delete old.expansion_from_keys;delete old.sync_published_default_entry_keys;
const saved=api.settings(old,'race'),first=api.key(old.rows[0]);saved.entries[first].included=false;saved.entries[first].liability_cents=0;saved.choices[first]=false;
const raw=JSON.stringify(saved);store.set(api.storage(c.date,'race'),raw);
const migrated=api.settings(c,'race'),newKey=api.key(c.rows[2]);
assert.equal(migrated.entries[first].included,false);assert.equal(migrated.choices[first],false);
assert.equal(migrated.entries[newKey].included,true);assert.equal(migrated.entries[newKey].liability_cents,50000);assert.equal(migrated.entries[newKey].odds,3.05);assert.equal(migrated.choices[newKey],true);
assert.equal(store.get(api.storage(c.date,'race')),raw);
store.clear();const fresh=api.settings(c,'race');assert.equal(Object.values(fresh.entries).filter(e=>e.included).length,3);
console.log('Approved addition: frozen odds and £500 liability included; prior device exclusion and storage preserved.');
