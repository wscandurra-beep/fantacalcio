import test from 'node:test';import assert from 'node:assert/strict';import {assignRankingCategory,rankPlayers,assignTiers,budgetSummary,slotPlanSummary,statusFor,availablePlayers,updateForecasts,updateSlotStrategy,percentageOfBudget,formatPercentage,areaVariance,totalCompletedVariance} from '../src/domain.js';
test('role category priority',()=>{assert.equal(assignRankingCategory('Ds;Dc'),'DC');assert.equal(assignRankingCategory('Dd;Dc'),'DC');assert.equal(assignRankingCategory('Dc;E'),'E');assert.equal(assignRankingCategory('W;A'),'WA');assert.equal(assignRankingCategory('Por'),'POR')});
test('ranking uses auction value then quotation',()=>{const r=rankPlayers([{id:'a',name:'a',auctionValue:20,quotation:4},{id:'b',name:'b',auctionValue:20,quotation:7},{id:'c',name:'c',auctionValue:30,quotation:1}]);assert.deepEqual(r.map(x=>x.id),['c','b','a'])});
test('tiers assign all and balance remainder',()=>{assert.deepEqual(assignTiers(Array.from({length:250},(_,i)=>({id:i})),10).reduce((a,p)=>(a[p.tier]=(a[p.tier]||0)+1,a),{}),Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,25])));const r=assignTiers(Array.from({length:253},(_,i)=>({id:i})),10);assert.equal(r.length,253);assert.deepEqual([...new Set(r.map(x=>x.tier))].map(t=>r.filter(x=>x.tier===t).length),[26,26,26,25,25,25,25,25,25,25])});
test('budget purchase',()=>assert.equal(budgetSummary(1000,[{actualPurchasePrice:220,currentForecastBudget:220,playerId:'1'}]).remaining,780));
test('slot plan summary counts slots, assigned roles and planned credits',()=>assert.deepEqual(slotPlanSummary([{category:'POR',originalPlannedBudget:45},{category:'DC',originalPlannedBudget:'30'},{category:'',originalPlannedBudget:5}],100),{slotCount:3,roleCount:2,planned:80,forecast:0,actual:0,completedVariance:0,baselinePct:80,forecastPct:0}));
test('sold remains frozen but unavailable',()=>{const p=[{id:'1',tier:2,rankingPosition:8}],s={'1':{marketStatus:'SOLD'}};assert.equal(p[0].tier,2);assert.equal(availablePlayers(p,s).length,0)});
test('injury status',()=>{assert.equal(statusFor(null),'OK');assert.equal(statusFor({injuryDetails:'Lesione',expectedReturn:'ottobre'}),'Lesione · Rientro: ottobre')});
test('slot strategy allows manual baseline and outfield role changes',()=>{const slots=[{id:'DC1',category:'DC',originalPlannedBudget:20}];assert.deepEqual(updateSlotStrategy(slots,{DC1:{category:'WA',originalPlannedBudget:'35'}}),[{id:'DC1',category:'WA',originalPlannedBudget:35,currentForecastBudget:35}])});
test('goalkeeper role is fixed while its baseline remains editable',()=>{const slots=[{id:'POR1',category:'POR',originalPlannedBudget:30}];assert.deepEqual(updateSlotStrategy(slots,{POR1:{category:'PC',originalPlannedBudget:'40'}}),[{id:'POR1',category:'POR',originalPlannedBudget:40,currentForecastBudget:40}]);assert.throws(()=>updateSlotStrategy([{id:'DC1',category:'DC',originalPlannedBudget:20}],{DC1:{category:'POR',originalPlannedBudget:20}}),/Ruolo non valido/)});
test('forecast and actual remain independent',()=>{const slots=[{id:'DC1',category:'DC',originalPlannedBudget:20,currentForecastBudget:10,playerId:null,actualPurchasePrice:null},{id:'DC2',category:'DC',originalPlannedBudget:15,currentForecastBudget:15,playerId:'p1',actualPurchasePrice:27}];assert.deepEqual(updateForecasts(slots).map(slot=>slot.currentForecastBudget),[10,15]);const updated=updateSlotStrategy(slots,{DC1:{category:'DC',originalPlannedBudget:'35',currentForecastBudget:'22'},DC2:{category:'WA',originalPlannedBudget:'50',currentForecastBudget:'19'}});assert.deepEqual(updated.map(slot=>[slot.originalPlannedBudget,slot.currentForecastBudget,slot.actualPurchasePrice,slot.category]),[[35,22,null,'DC'],[50,19,27,'DC']])});


test('forecast percentage uses total budget and rounds only for display',()=>{
  assert.equal(percentageOfBudget(63,1000),6.3);
  assert.equal(percentageOfBudget(25,500),5);
  assert.ok(Math.abs(percentageOfBudget(1,3)-100/3)<1e-12);
  assert.equal(formatPercentage(100/3),'33,3%');
  assert.equal(formatPercentage(5),'5%');
});

test('area variance supports savings, overspend, zero and excludes open slots',()=>{
  const slots=[
    {category:'POR',originalPlannedBudget:50,playerId:'a',actualPurchasePrice:20},
    {category:'POR',originalPlannedBudget:10,playerId:'b',actualPurchasePrice:4},
    {category:'POR',originalPlannedBudget:15,playerId:null,actualPurchasePrice:null},
    {category:'DC',originalPlannedBudget:20,playerId:'c',actualPurchasePrice:63},
    {category:'E',originalPlannedBudget:12,playerId:'d',actualPurchasePrice:12}
  ];
  assert.equal(areaVariance(slots,'POR'),-36);
  assert.equal(areaVariance(slots,'DC'),43);
  assert.equal(areaVariance(slots,'E'),0);
  assert.equal(totalCompletedVariance(slots),7);
});

test('open slot category changes while completed history and POR remain fixed',()=>{
  const slots=[{id:'DC1',category:'DC',originalPlannedBudget:20,currentForecastBudget:20},{id:'DC2',category:'DC',originalPlannedBudget:20,currentForecastBudget:20,playerId:'x',actualPurchasePrice:21},{id:'POR1',category:'PC',originalPlannedBudget:5,currentForecastBudget:5}];
  const changed=updateSlotStrategy(slots,{DC1:{category:'WA',originalPlannedBudget:20,currentForecastBudget:20},DC2:{category:'WA',originalPlannedBudget:20,currentForecastBudget:20},POR1:{category:'PC',originalPlannedBudget:5,currentForecastBudget:5}});
  assert.deepEqual(changed.map(slot=>slot.category),['WA','DC','POR']);
});

test('purchase does not mutate baseline and strategy survives JSON save/reload',()=>{
  const slot={id:'DC1',category:'DC',originalPlannedBudget:20,currentForecastBudget:25,playerId:'p1',actualPurchasePrice:63};
  const reloaded=JSON.parse(JSON.stringify(updateForecasts([slot])));
  assert.deepEqual(reloaded,[slot]);
  assert.equal(areaVariance(reloaded,'DC'),43);
  assert.deepEqual(slotPlanSummary(reloaded,1000),{slotCount:1,roleCount:1,planned:20,forecast:25,actual:63,completedVariance:43,baselinePct:2,forecastPct:2.5});
});
