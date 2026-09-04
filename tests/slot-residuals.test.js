import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('slot plan renders residual values and refreshes them after baseline edits',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/<th>Actual<\/th><th>Residui<\/th>/);
  assert.match(app,/data-slot-residual>\$\{getResidual\(s\)\}/);
  assert.match(app,/data-total-residual>\$\{recap\.planned-recap\.actual\}/);
  assert.match(app,/querySelector\('\[data-slot-residual\]'\)\.textContent=getResidual/);
  assert.match(app,/querySelector\('\[data-total-residual\]'\)\.textContent=baseline-state\.slots\.reduce/);
});
