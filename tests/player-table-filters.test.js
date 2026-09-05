import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('Mercato page, route and exclusive table controls are removed',()=>{
  assert.doesNotMatch(html,/data-view="market"|>Mercato</);
  assert.doesNotMatch(app,/function market\(|function playerTable\(|function initMarketFilters\(|marketControls/);
  assert.doesNotMatch(app,/\{cockpit,auction,market,/);
});
