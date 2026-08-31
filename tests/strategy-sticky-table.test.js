import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('strategy table uses one scroll container with sticky header and totals',async()=>{
  const [app,css]=await Promise.all([
    readFile(new URL('../src/app.js',import.meta.url),'utf8'),
    readFile(new URL('../src/style.css',import.meta.url),'utf8')
  ]);

  assert.match(app,/slot-table-wrap\$\{editable\?' strategy-slot-table-wrap':''\}/);
  assert.match(css,/\.strategy-slot-table-wrap\{[^}]*overflow:auto/);
  assert.match(css,/\.strategy-slot-table-wrap thead th\{[^}]*position:sticky;top:0/);
  assert.match(css,/\.strategy-slot-table-wrap tfoot th\{[^}]*position:sticky;bottom:0/);
});
