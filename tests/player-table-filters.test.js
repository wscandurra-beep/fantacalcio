import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('player table renders one sortable header row directly before its body',()=>{
  const table=app.match(/function playerTable\(ps\)\{(.+?)\nfunction applyMarketPipeline/s)?.[1]??'';
  assert.match(table,/<thead><tr>.*<\/tr><\/thead><tbody>/s);
  assert.doesNotMatch(table,/column-filters|data-column|aria-label="Filtra/);
  assert.match(table,/sortHeader\('name','Giocatore'\)/);
  assert.match(table,/sortHeader\('status','Status'\)/);
});

test('column filter layout styles have been removed',()=>{
  assert.doesNotMatch(css,/\.column-filters|\.range-filter|\.metric-ranges/);
});
