import test from 'node:test';import assert from 'node:assert/strict';import {assignRankingCategory,rankPlayers,assignTiers,budgetSummary,slotPlanSummary,statusFor,availablePlayers,getForecast,updateForecasts,updateSlotStrategy,percentageOfBudget,formatPercentage,areaVariance,totalCompletedVariance,slotCountsFromSlots,validateSlotCounts,reconcileSlotCounts,normalizeMantraRoles,mantraRoleDepletion,tierDepletion,groupSlotsByCategory,availableMantraRoles,defaultAliasConfiguration,validateAliasConfiguration,aliasForMantraRole,classifyPlayersByAliases,reconcileAliasSlots} from '../src/domain.js';
test('role category priority',()=>{assert.equal(assignRankingCategory('Ds;Dc'),'DC');assert.equal(assignRankingCategory('Dd;Dc'),'DC');assert.equal(assignRankingCategory('Dc;E'),'E');assert.equal(assignRankingCategory('W;A'),'WA');assert.equal(assignRankingCategory('Por'),'POR')});
test('slot groups follow strategy order and retain configured extra categories',()=>{const groups=groupSlotsByCategory([{id:'1',category:'PC'},{id:'2',category:'DC'},{id:'3',category:'M'},{id:'4',category:'DC'}]);assert.deepEqual(groups.map(group=>[group.category,group.slots.map(slot=>slot.id)]),[['PC',['1']],['DC',['2','4']],['M',['3']]])});
test('ranking uses auction value then quotation',()=>{const r=rankPlayers([{id:'a',name:'a',auctionValue:20,quotation:4},{id:'b',name:'b',auctionValue:20,quotation:7},{id:'c',name:'c',auctionValue:30,quotation:1}]);assert.deepEqual(r.map(x=>x.id),['c','b','a'])});
test('tiers assign all and balance remainder',()=>{assert.deepEqual(assignTiers(Array.from({length:250},(_,i)=>({id:i})),10).reduce((a,p)=>(a[p.tier]=(a[p.tier]||0)+1,a),{}),Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,25])));const r=assignTiers(Array.from({length:253},(_,i)=>({id:i})),10);assert.equal(r.length,253);assert.deepEqual([...new Set(r.map(x=>x.tier))].map(t=>r.filter(x=>x.tier===t).length),[26,26,26,25,25,25,25,25,25,25])});
test('budget purchase',()=>assert.equal(budgetSummary(1000,[{actualPurchasePrice:220,currentForecastBudget:220,playerId:'1'}]).remaining,780));
test('slot plan summary counts slots, assigned roles and planned credits',()=>assert.deepEqual(slotPlanSummary([{category:'POR',originalPlannedBudget:45},{category:'DC',originalPlannedBudget:'30'},{category:'',originalPlannedBudget:5}],100),{slotCount:3,roleCount:2,planned:80,forecast:80,actual:0,completedVariance:0,baselinePct:80,forecastPct:80}));
test('sold remains frozen but unavailable',()=>{const p=[{id:'1',tier:2,rankingPosition:8}],s={'1':{marketStatus:'SOLD'}};assert.equal(p[0].tier,2);assert.equal(availablePlayers(p,s).length,0)});
test('normalizes technical Mantra role differences without changing role order',()=>{assert.equal(normalizeMantraRoles(' dc / DD ; e '),'Dc;Dd;E');assert.equal(normalizeMantraRoles('por'),'Por')});
test('groups exact Mantra combinations and exposes the same players used by counters',()=>{const players=[{id:'1',roles:'Dc;Dd'},{id:'2',roles:'dc / dd'},{id:'3',roles:'Dc'},{id:'4',roles:'E;W'},{id:'5',roles:'C;T'}];const groups=mantraRoleDepletion(players,{'2':{marketStatus:'SOLD'}});assert.deepEqual(groups.map(({players,...group})=>group),[{roles:'Dc;Dd',total:2,available:1},{roles:'C;T',total:1,available:1},{roles:'Dc',total:1,available:1},{roles:'E;W',total:1,available:1}]);assert.deepEqual(groups[0].players.map(player=>player.id),['1','2'])});
test('tier groups expose every original player and retain purchased players',()=>{const players=[{id:'1',rankingCategory:'DC',tier:3},{id:'2',rankingCategory:'DC',tier:3}];const [group]=tierDepletion(players,{'2':{marketStatus:'MY TEAM'}});assert.deepEqual({category:group.category,tier:group.tier,total:group.total,available:group.available},{category:'DC',tier:3,total:2,available:1});assert.deepEqual(group.players,players)});
test('injury status',()=>{assert.equal(statusFor(null),'OK');assert.equal(statusFor({injuryDetails:'Lesione',expectedReturn:'ottobre'}),'Lesione · Rientro: ottobre')});
test('slot strategy allows manual baseline and outfield role changes',()=>{const slots=[{id:'DC1',category:'DC',originalPlannedBudget:20}];assert.deepEqual(updateSlotStrategy(slots,{DC1:{category:'WA',originalPlannedBudget:'35'}}),[{id:'DC1',category:'WA',originalPlannedBudget:35}])});
test('goalkeeper role is fixed while its baseline remains editable',()=>{const slots=[{id:'POR1',category:'POR',originalPlannedBudget:30}];assert.deepEqual(updateSlotStrategy(slots,{POR1:{category:'PC',originalPlannedBudget:'40'}}),[{id:'POR1',category:'POR',originalPlannedBudget:40}]);assert.throws(()=>updateSlotStrategy([{id:'DC1',category:'DC',originalPlannedBudget:20}],{DC1:{category:'POR',originalPlannedBudget:20}}),/Ruolo non valido/)});
test('forecast is always derived with Actual taking priority over Baseline',()=>{
  const open={originalPlannedBudget:50,actualPurchasePrice:null};
  const completed={originalPlannedBudget:50,actualPurchasePrice:63};
  assert.equal(getForecast(open),50);
  assert.equal(getForecast(completed),63);
  assert.equal(getForecast({...completed,actualPurchasePrice:0}),0);
  assert.equal(getForecast({...open,originalPlannedBudget:55}),55);
  assert.equal(getForecast({...completed,originalPlannedBudget:55}),63);
  assert.equal(getForecast({...completed,actualPurchasePrice:47}),47);
  assert.equal(getForecast({...completed,actualPurchasePrice:null}),50);
});

test('legacy persisted forecast is discarded and cannot become stale',()=>{
  const migrated=updateForecasts([{id:'DC1',originalPlannedBudget:60,actualPurchasePrice:null,currentForecastBudget:10},{id:'DC2',originalPlannedBudget:50,actualPurchasePrice:63,currentForecastBudget:55}]);
  assert.deepEqual(migrated,[{id:'DC1',originalPlannedBudget:60,actualPurchasePrice:null},{id:'DC2',originalPlannedBudget:50,actualPurchasePrice:63}]);
  assert.deepEqual(migrated.map(getForecast),[60,63]);
});

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

test('purchase does not mutate baseline and derived forecast survives JSON save/reload',()=>{
  const slot={id:'DC1',category:'DC',originalPlannedBudget:20,currentForecastBudget:25,playerId:'p1',actualPurchasePrice:63};
  const reloaded=JSON.parse(JSON.stringify(updateForecasts([slot])));
  assert.deepEqual(reloaded,[{id:'DC1',category:'DC',originalPlannedBudget:20,playerId:'p1',actualPurchasePrice:63}]);
  assert.equal(areaVariance(reloaded,'DC'),43);
  assert.deepEqual(slotPlanSummary(reloaded,1000),{slotCount:1,roleCount:1,planned:20,forecast:63,actual:63,completedVariance:43,baselinePct:2,forecastPct:6.3});
});

test('total forecast mixes Actual for completed slots and Baseline for open slots',()=>{
  const summary=slotPlanSummary([{category:'DC',originalPlannedBudget:50,actualPurchasePrice:40},{category:'WA',originalPlannedBudget:30,actualPurchasePrice:null}],1000);
  assert.equal(summary.forecast,70);
  assert.ok(Math.abs(summary.forecastPct-7)<1e-12);
  assert.equal(summary.completedVariance,-10);
});

test('slot counts derive from persisted strategy and validate league constraints',()=>{
  const slots=[{category:'POR'},{category:'POR'},{category:'POR'},{category:'D'},{category:'W'}];
  assert.deepEqual(slotCountsFromSlots(slots),{POR:3,D:1,E:0,C:0,W:1,A:0,PC:0,OUT:0});
  assert.deepEqual(validateSlotCounts({POR:3,D:8,E:6,C:5,W:9,PC:3}),{counts:{POR:3,D:8,E:6,C:5,W:9,A:0,PC:3,OUT:0},total:34});
  assert.throws(()=>validateSlotCounts({POR:2,D:8,E:6,C:5,W:9,PC:3}),/esattamente 3/);
  assert.throws(()=>validateSlotCounts({POR:3,D:9,E:6,C:5,W:9,PC:3}),/da 3 a 34/);
  assert.throws(()=>validateSlotCounts({POR:3,D:1.5,E:0,C:0,W:0,PC:0}),/non valido/);
});

test('slot count increase creates deterministic empty zero-baseline slots',()=>{
  const slots=[
    {id:'POR1',category:'POR',originalPlannedBudget:10},{id:'POR2',category:'POR',originalPlannedBudget:5},{id:'POR3',category:'POR',originalPlannedBudget:1},
    {id:'D1',category:'D',originalPlannedBudget:20}
  ];
  const updated=reconcileSlotCounts(slots,{POR:3,D:3,E:0,C:0,W:0,PC:0});
  assert.equal(updated.length,6);
  assert.deepEqual(updated.filter(x=>x.category==='D').map(x=>[x.id,x.originalPlannedBudget,x.playerId,x.actualPurchasePrice]),[
    ['D1',20,undefined,undefined],['D2',0,null,null],['D3',0,null,null]
  ]);
});

test('slot count decrease removes only open slots and preserves completed purchases',()=>{
  const slots=[
    {id:'POR1',category:'POR'},{id:'POR2',category:'POR'},{id:'POR3',category:'POR'},
    {id:'D1',category:'D',playerId:'p1',actualPurchasePrice:30,originalPlannedBudget:20},
    {id:'D2',category:'D',playerId:null,actualPurchasePrice:null,originalPlannedBudget:10},
    {id:'D3',category:'D',playerId:null,actualPurchasePrice:null,originalPlannedBudget:5}
  ];
  const updated=reconcileSlotCounts(slots,{POR:3,D:2,E:0,C:0,W:0,A:0,PC:0,OUT:0});
  assert.deepEqual(updated.filter(x=>x.category==='D').map(x=>x.id),['D1','D2']);
  assert.equal(updated.find(x=>x.id==='D1').playerId,'p1');
  assert.throws(()=>reconcileSlotCounts(slots,{POR:3,D:0,E:0,C:0,W:0,PC:0}),/già acquistati/);
});

test('slot count roundtrip remains compatible with totals and derived forecast',()=>{
  const slots=[
    {id:'POR1',category:'POR',originalPlannedBudget:10},{id:'POR2',category:'POR',originalPlannedBudget:5},{id:'POR3',category:'POR',originalPlannedBudget:1},
    {id:'D1',category:'D',originalPlannedBudget:20,playerId:'p1',actualPurchasePrice:30}
  ];
  const updated=JSON.parse(JSON.stringify(reconcileSlotCounts(slots,{POR:3,D:2,E:0,C:0,W:0,A:0,PC:0,OUT:0})));
  assert.deepEqual(slotCountsFromSlots(updated),{POR:3,D:2,E:0,C:0,W:0,A:0,PC:0,OUT:0});
  assert.deepEqual(slotPlanSummary(updated,100),{slotCount:5,roleCount:5,planned:36,forecast:46,actual:30,completedVariance:10,baselinePct:36,forecastPct:46});
});

test('Alias configuration provides the exact strategic board defaults',()=>{
  const players=[{roles:'Por'},{roles:'Dc'},{roles:'Dd;Dc'},{roles:'W;A'},{roles:'Pc'}],configuration=defaultAliasConfiguration(players);
  assert.deepEqual(availableMantraRoles(players),['Dc','Dd;Dc','Pc','Por','W;A']);
  assert.deepEqual(configuration.find(item=>item.alias==='D').mantraRoles.includes('Dd;Dc'),true);
  assert.equal(aliasForMantraRole('W;A',configuration),'W');
  assert.equal(classifyPlayersByAliases(players,configuration)[2].strategicAlias,'D');
});
test('Alias validation keeps POR fixed, rejects ambiguity and caps the roster',()=>{
  const valid=[{alias:'POR',slotCount:3,mantraRoles:['Por']},{alias:'D',slotCount:8,mantraRoles:['Dc','Dd;Dc']}];
  assert.equal(validateAliasConfiguration(valid,['Por','Dc','Dd;Dc']).total,11);
  assert.throws(()=>validateAliasConfiguration([{alias:'POR',slotCount:2,mantraRoles:['Por']}],['Por']),/POR deve essere fisso/);
  assert.throws(()=>validateAliasConfiguration([...valid,{alias:'E',slotCount:1,mantraRoles:['Dc']}],['Por','Dc','Dd;Dc']),/già assegnato a D/);
  assert.throws(()=>validateAliasConfiguration([{alias:'POR',slotCount:3,mantraRoles:['Por']},{alias:'D',slotCount:32,mantraRoles:['Dc']}],['Por','Dc']),/da 3 a 34/);
});
test('Alias slots use configurable names and protect completed purchases',()=>{
  const configuration=[{alias:'POR',slotCount:3},{alias:'D',slotCount:2}],slots=reconcileAliasSlots([],configuration);
  assert.deepEqual(slots.map(slot=>slot.id),['POR1','POR2','POR3','D1','D2']);
  assert.throws(()=>reconcileAliasSlots([{id:'D1',category:'D',playerId:'x',actualPurchasePrice:2}],[{alias:'POR',slotCount:3},{alias:'D',slotCount:0}]),/già acquistati/);
});
