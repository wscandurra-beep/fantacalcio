import test from 'node:test';
import assert from 'node:assert/strict';
import {resetPlayer} from '../src/player-reset.js';

test('reset removes only the selected sold player market state',()=>{
  const state={market:{a:{marketStatus:'SOLD'},b:{marketStatus:'MY TEAM'}},slots:[]};
  const next=resetPlayer(state,'a');
  assert.deepEqual(next.market,{b:{marketStatus:'MY TEAM'}});
  assert.deepEqual(state.market,{a:{marketStatus:'SOLD'},b:{marketStatus:'MY TEAM'}});
});

test('reset clears the selected purchase, price and shared market status',()=>{
  const untouched={id:'D2',playerId:'b',actualPurchasePrice:7};
  const state={market:{a:{marketStatus:'MY TEAM'},b:{marketStatus:'MY TEAM'}},slots:[{id:'D1',playerId:'a',actualPurchasePrice:19},untouched]};
  const next=resetPlayer(state,'a');
  assert.deepEqual(next.slots[0],{id:'D1',playerId:null,actualPurchasePrice:null,playerIds:[]});
  assert.deepEqual(next.slots[1],{...untouched,playerIds:['b']});
  assert.deepEqual(next.market,{b:{marketStatus:'MY TEAM'}});
});
