import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('market uses Excel-style header menus instead of a permanent filter row',async()=>{
  const [app,css]=await Promise.all([
    readFile(new URL('../src/app.js',import.meta.url),'utf8'),
    readFile(new URL('../src/style.css',import.meta.url),'utf8')
  ]);

  assert.match(app,/const MARKET_COLUMNS=/);
  assert.match(app,/class="excel-filter-trigger/);
  assert.match(app,/class=excel-filter-menu/);
  assert.doesNotMatch(app,/emptyColumnFilters|class=column-filters/);
  assert.doesNotMatch(css,/\.column-filters|\.range-filter|\.sort-button/);
});

test('toolbar and column team filters share the same market control',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');

  assert.match(app,/teamSelection=.*marketControls\.columns\.team/);
  assert.match(app,/#team'\)\.oninput=.*marketControls\.columns\.team/);
  assert.doesNotMatch(app,/marketControls\.team/);
});

