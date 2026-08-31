import test from 'node:test';
import assert from 'node:assert/strict';
import {applyInjurySnapshot,formatItalianDate,normalizeInjuryUpdate} from '../src/injury-data.js';

test('snapshot updates player statuses exclusively through playerId',()=>{
  const players=[{id:'1',name:'Same',status:'old'},{id:'2',name:'Same',status:'old'}];
  const snapshot={injuries:[{playerId:'2',name:'Different',injury:'Lesione',expectedReturn:'ottobre'}]};
  assert.deepEqual(applyInjurySnapshot(players,snapshot).map(player=>player.status),['OK','Lesione · Rientro: ottobre']);
});

test('valid metadata uses the snapshot as current-count source of truth',()=>{
  const update={updatedAt:'2026-08-31T22:31:34Z',currentInjuries:0,newInjuries:39};
  assert.equal(normalizeInjuryUpdate(update,{injuries:Array(39).fill({})}).currentInjuries,39);
  assert.deepEqual(normalizeInjuryUpdate({updatedAt:'not-a-date'},{}),{});
});

test('UTC timestamp is displayed in Italian local time',()=>{
  assert.equal(formatItalianDate('2026-08-31T22:31:34Z'),'01/09/2026, 00:31');
  assert.equal(formatItalianDate(null),'mai');
});
