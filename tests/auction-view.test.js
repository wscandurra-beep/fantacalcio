import test from 'node:test';
import assert from 'node:assert/strict';
import {auctionInjuryStatus,buildAuctionRows,moveAuctionPlayer,sortAuctionPlayers} from '../src/auction-view.js';

const players=[
  {id:'a',rankingCategory:'DC',tier:1,auctionValue:12},
  {id:'b',rankingCategory:'DC',tier:1,auctionValue:30},
  {id:'c',rankingCategory:'DC',tier:2,auctionValue:0},
  {id:'d',rankingCategory:'DC',tier:1,auctionValue:null}
];
const slots=[{id:'DC1',category:'DC'},{id:'DC2',category:'DC'}];

test('auction values are descending and zero/null values remain at the end',()=>{
  assert.deepEqual(sortAuctionPlayers(players).map(player=>player.id),['b','a','c','d']);
});

test('rows use the tier assignment from strategy slots',()=>{
  const rows=buildAuctionRows(players,slots);
  assert.deepEqual(rows.map(row=>row.players.map(player=>player.id)),[['b','a','d'],['c']]);
});

test('manual order and cross-slot placement override automatic assignment',()=>{
  const initial=buildAuctionRows(players,slots);
  const view=moveAuctionPlayer({},'a','DC2',1,initial);
  const moved=buildAuctionRows(players,slots,view);
  assert.deepEqual(moved.map(row=>row.players.map(player=>player.id)),[['b','d'],['c','a']]);
  assert.equal(view.placements.a,'DC2');
});

test('an override to a removed strategy slot falls back to the current tier layout',()=>{
  const rows=buildAuctionRows(players,slots.slice(0,1),{placements:{a:'DC2'},orders:{}});
  assert.deepEqual(rows[0].players.map(player=>player.id),['b','a','d']);
});


test('OUT is the optional final single row and stores manual overrides',()=>{
  const initial=buildAuctionRows(players,slots,{},true);
  assert.equal(initial.at(-1).slot.id,'OUT');
  const view=moveAuctionPlayer({},'a','OUT',0,initial),moved=buildAuctionRows(players,slots,view,true);
  assert.deepEqual(moved.at(-1).players.map(player=>player.id),['a']);
  assert.equal(moved[0].players.some(player=>player.id==='a'),false);
});

test('auction injury status only exposes details for unavailable players',()=>{
  assert.deepEqual(auctionInjuryStatus('OK'),{label:'OK',interactive:false,detail:null});
  assert.deepEqual(auctionInjuryStatus('Lesione muscolare'),{label:'NOT OK',interactive:true,detail:'Lesione muscolare'});
  assert.equal(auctionInjuryStatus(null).detail,'Dettaglio infortunio non disponibile');
});
