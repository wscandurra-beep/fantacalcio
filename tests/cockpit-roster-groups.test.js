import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('cockpit roster groups purchased slots in the configured alias order',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/groupSlotsByCategory\(purchased,false,state\.aliasConfiguration\.map\(item=>item\.alias\)\)/);
  assert.match(app,/<h3>\$\{escapeHtml\(category\)\} <span>· \$\{slots\.length\}<\/span><\/h3>/);
  assert.match(app,/state\.slots\.filter\(slot=>slot\.playerId\)/);
  assert.match(app,/rosterPlayer=player\?\?\{id:slot\.playerId,name:slot\.playerId\}/);
  assert.match(app,/<li><span class=roster-player-summary>.*\$\{resetButton\(rosterPlayer,true,'roster-player-reset'\)\}<\/li>/);
  assert.doesNotMatch(app,/class=roster-player(?:[ >])/);
  assert.doesNotMatch(app,/<dt>(?:Slot|Priorità|Prezzo)<\/dt>/);
  assert.match(app,/slotTable\(state\.slots,false,true\)/);
});

test('cockpit roster and market pressure share the desktop row',async()=>{
  const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/\.wide\{grid-column:span 2\}/);
  assert.doesNotMatch(css,/\.roster-card\{[^}]*grid-column:1\/-1/);
  assert.match(css,/@media\(max-width:900px\)\{\.grid\{grid-template-columns:1fr 1fr\}\.wide\{grid-column:span 2\}/);
  assert.match(css,/\.roster-players li\{display:flex;/);
  assert.match(css,/\.roster-players \.roster-player-reset\{[^}]*margin-left:auto/);
});
