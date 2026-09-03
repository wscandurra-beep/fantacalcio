import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('cockpit roster groups purchased slots through the shared strategy helper',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/groupSlotsByCategory\(purchased\)/);
  assert.match(app,/escapeHtml\(slotCategoryLabel\(category\)\)/);
  assert.match(app,/state\.slots\.filter\(slot=>slot\.playerId\)/);
  assert.match(app,/slotTable\(state\.slots,false,true\)/);
  assert.match(app,/<div class=roster-player><b>\$\{escapeHtml\(player\?\.name\?\?slot\.playerId\)\}<\/b><span>· \$\{escapeHtml\(player\?\.team\|\|'—'\)\}<\/span><\/div>/);
  assert.doesNotMatch(app,/class=roster-player>.*<dl>/);
});

test('cockpit roster and market pressure share the desktop row',async()=>{
  const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/\.roster-card\{grid-column:span 2;/);
  assert.doesNotMatch(css,/\.roster-card\{grid-column:1\/-1/);
});
