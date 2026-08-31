import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('market pressure keeps its controls fixed and scrolls the full card grid',async()=>{
  const [app,css]=await Promise.all([
    readFile(new URL('../src/app.js',import.meta.url),'utf8'),
    readFile(new URL('../src/style.css',import.meta.url),'utf8')
  ]);

  assert.match(app,/class=pressure-scroll><div class=pressure>/);
  assert.match(css,/\.market-pressure\{[^}]*display:flex;flex-direction:column/);
  assert.match(css,/\.pressure-scroll\{[^}]*flex:1 1 auto;min-height:0;[^}]*overflow-y:auto/);
  assert.match(css,/\.market-pressure \.pressure\{[^}]*padding-bottom:16px/);
  assert.doesNotMatch(css,/\.market-pressure \.pressure\{[^}]*max-height/);
});
