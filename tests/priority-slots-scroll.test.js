import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('priority slots render the complete dataset in a vertically scrolling table',async()=>{
  const [app,css]=await Promise.all([
    readFile(new URL('../src/app.js',import.meta.url),'utf8'),
    readFile(new URL('../src/style.css',import.meta.url),'utf8')
  ]);

  assert.match(app,/slotTable\(state\.slots,false,true\)/);
  assert.doesNotMatch(app,/slotTable\(state\.slots\.slice\(/);
  assert.match(app,/priority\?' priority-slots-scroll':''/);
  assert.match(css,/\.priority-slots-scroll\{[^}]*max-height:[^;]+;min-height:0;[^}]*overflow-y:auto;[^}]*padding-bottom:[^;]+;/);
  assert.match(css,/\.priority-slots-scroll thead th\{[^}]*position:sticky;top:0/);
  assert.match(css,/\.priority-slots-scroll\{[^}]*scrollbar-width:thin;[^}]*scrollbar-color:/);
});
