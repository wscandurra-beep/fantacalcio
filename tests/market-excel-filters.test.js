import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('market uses Excel-style header menus instead of a permanent filter row',async()=>{
  const [app,marketModule,marketCss,css]=await Promise.all([
    readFile(new URL('../src/app.js',import.meta.url),'utf8'),
    readFile(new URL('../src/market-filters.js',import.meta.url),'utf8'),
    readFile(new URL('../src/market-filters.css',import.meta.url),'utf8'),
    readFile(new URL('../src/style.css',import.meta.url),'utf8')
  ]);

  assert.match(marketModule,/export const MARKET_COLUMNS=/);
  assert.match(app,/import \{MARKET_COLUMNS,createMarketControls\}/);
  assert.match(app,/class="excel-filter-trigger/);
  assert.match(app,/class=excel-filter-menu/);
  assert.doesNotMatch(app,/emptyColumnFilters|class=column-filters/);
  assert.doesNotMatch(marketCss,/\.column-filters|\.range-filter|\.sort-button/);
  // The conflict's main branch also added these injury panel refinements.
  assert.match(css,/\.injury-refresh\{padding:18px 20px\}/);
  assert.match(css,/\.injury-refresh \.refresh-status\{/);
});

test('toolbar and column team filters share the same market control',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');

  assert.match(app,/teamSelection=.*marketControls\.columns\.team/);
  assert.match(app,/#team'\)\.oninput=.*marketControls\.columns\.team/);
  assert.doesNotMatch(app,/marketControls\.team/);
});
