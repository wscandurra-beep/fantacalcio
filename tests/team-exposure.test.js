import test from 'node:test';
import assert from 'node:assert/strict';
import {teamExposure} from '../src/team-exposure.js';

const players=[
  {id:'i1',team:'Inter'},{id:'i2',team:'Inter'},{id:'i3',team:'Inter'},
  {id:'n1',team:'Napoli'},{id:'m1',team:'Milan'},{id:'r1',team:'Roma'}
];

test('team exposure uses configured roster slots as denominator',()=>{
  const slots=[{playerId:'i1'},{playerId:'i2'},{playerId:'i3'},{playerId:'n1'}];
  const result=teamExposure(slots,players,34);
  assert.equal(result[0].team,'Inter');
  assert.equal(result[0].count,3);
  assert.ok(Math.abs(result[0].percentage-3/34*100)<1e-12);
  assert.ok(Math.abs(result.find(item=>item.team==='Napoli').percentage-1/34*100)<1e-12);
});

test('team exposure updates when configured total changes',()=>{
  const slots=[{playerId:'i1'},{playerId:'i2'},{playerId:'i3'}];
  assert.ok(Math.abs(teamExposure(slots,players,34)[0].percentage-8.823529411764707)<1e-12);
  assert.ok(Math.abs(teamExposure(slots,players,31)[0].percentage-9.67741935483871)<1e-12);
});

test('only represented teams are returned and ties sort alphabetically',()=>{
  const slots=[{playerId:'r1'},{playerId:'m1'}];
  assert.deepEqual(teamExposure(slots,players,34).map(item=>item.team),['Milan','Roma']);
});

test('unassigned or unknown players do not affect exposure',()=>{
  const slots=[{playerId:null},{playerId:'missing'},{playerId:'n1'}];
  assert.deepEqual(teamExposure(slots,players,34).map(item=>[item.team,item.count]),[['Napoli',1]]);
});
