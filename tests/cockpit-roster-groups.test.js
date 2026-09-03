import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('cockpit roster groups purchased slots through the shared strategy helper',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/groupSlotsByCategory\(purchased\)/);
  assert.match(app,/<h3>\$\{escapeHtml\(category\)\} <span>· \$\{slots\.length\}<\/span><\/h3>/);
  assert.match(app,/state\.slots\.filter\(slot=>slot\.playerId\)/);
  assert.match(app,/slotTable\(state\.slots,false,true\)/);
});
