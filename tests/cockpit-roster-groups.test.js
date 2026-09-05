import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('cockpit roster reads the canonical purchases in configured alias order',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/const purchases=canonicalPurchases\(state\.market\)/);
  assert.match(app,/state\.aliasConfiguration\.map\(\(\{alias\}\)/);
  assert.match(app,/\$\{purchases\.length\}<\/span>/);
  assert.match(app,/resetButton\(rosterPlayer,true,'roster-player-reset'\)/);
});

test('cockpit roster and pressure share the desktop row',async()=>{
  const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/\.wide\{grid-column:span 2\}/);
  assert.match(css,/\.roster-players li\{display:flex;/);
});
