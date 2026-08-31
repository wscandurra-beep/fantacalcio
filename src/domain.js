export const CATEGORY_PRIORITY = ['POR','DC','E','C','WA','PC'];
export const DEFAULT_SLOT_COUNTS = Object.freeze({POR:3,DC:8,E:6,C:5,WA:9,PC:3});
export function normalizeName(value='') { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,' ').replace(/[^a-zA-Z0-9]+/g,' ').trim().toLowerCase(); }
export function assignRankingCategory(roles='') {
  const set=new Set(String(roles).split(';').map(x=>x.trim().toLowerCase()));
  const eligible=[];
  if(set.has('por')) eligible.push('POR');
  if(set.has('dc')) eligible.push('DC');
  if(set.has('e')) eligible.push('E');
  if(set.has('c')||set.has('m')) eligible.push('C');
  if(set.has('w')||set.has('a')||set.has('t')) eligible.push('WA');
  if(set.has('pc')) eligible.push('PC');
  return eligible.at(-1) ?? null;
}
export function rankPlayers(players) { return [...players].sort((a,b)=>(b.auctionValue-a.auctionValue)||(b.quotation-a.quotation)||a.name.localeCompare(b.name)).map((p,i)=>({...p,rankingPosition:i+1})); }
export function assignTiers(players, slotCount) {
  if(!Number.isInteger(slotCount)||slotCount<1) return [];
  const n=players.length, base=Math.floor(n/slotCount), remainder=n%slotCount; let cursor=0;
  return Array.from({length:slotCount},(_,i)=>{const size=base+(i<remainder?1:0); return players.slice(cursor,cursor+=size).map(p=>({...p,tier:i+1}));}).flat();
}
export function getForecast(slot) {
  return slot.actualPurchasePrice!=null&&Number.isFinite(Number(slot.actualPurchasePrice))
    ? Number(slot.actualPurchasePrice)
    : Number(slot.originalPlannedBudget)||0;
}
export function budgetSummary(budget,slots) { const spent=slots.reduce((s,x)=>s+Number(x.actualPurchasePrice??0),0); const planned=slots.reduce((s,x)=>s+Number(x.originalPlannedBudget||0),0); const forecast=slots.filter(x=>x.actualPurchasePrice==null).reduce((s,x)=>s+getForecast(x),0); return {budget,planned,unallocated:budget-planned,spent,remaining:budget-spent,currentPlannedRemaining:forecast,variance:(budget-spent)-forecast}; }
export function percentageOfBudget(value,budget) {
  const total=Number(budget),amount=Number(value);
  return Number.isFinite(total)&&total>0&&Number.isFinite(amount)?amount/total*100:0;
}
export function formatPercentage(value) {
  return `${new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(Number(value)||0)}%`;
}
export function isCompletedSlot(slot) {
  return slot.actualPurchasePrice!=null&&Number.isFinite(Number(slot.actualPurchasePrice));
}
export function areaVariance(slots,category) {
  return slots.filter(slot=>slot.category===category&&isCompletedSlot(slot)).reduce((total,slot)=>total+Number(slot.actualPurchasePrice)-Number(slot.originalPlannedBudget||0),0);
}
export function totalCompletedVariance(slots) {
  return slots.filter(isCompletedSlot).reduce((total,slot)=>total+Number(slot.actualPurchasePrice)-Number(slot.originalPlannedBudget||0),0);
}
export function slotPlanSummary(slots,budget=0) {
  const planned=slots.reduce((total,slot)=>total+Number(slot.originalPlannedBudget||0),0);
  const forecast=slots.reduce((total,slot)=>total+getForecast(slot),0);
  const actual=slots.filter(isCompletedSlot).reduce((total,slot)=>total+Number(slot.actualPurchasePrice),0);
  return {slotCount:slots.length,roleCount:slots.filter(slot=>slot.category).length,planned,forecast,actual,completedVariance:totalCompletedVariance(slots),baselinePct:percentageOfBudget(planned,budget),forecastPct:percentageOfBudget(forecast,budget)};
}
export function statusFor(injury) { return !injury?'OK':[injury.injuryDetails,injury.expectedReturn&&`Rientro: ${injury.expectedReturn}`].filter(Boolean).join(' · '); }
export function availablePlayers(players,state) { return players.filter(p=>(state[p.id]?.marketStatus??'AVAILABLE')==='AVAILABLE'); }
export function tierDepletion(players,state){const m={};for(const p of players){const k=`${p.rankingCategory}-${p.tier}`;m[k]??={category:p.rankingCategory,tier:p.tier,total:0,available:0};m[k].total++;if((state[p.id]?.marketStatus??'AVAILABLE')==='AVAILABLE')m[k].available++;}return Object.values(m);}
export function normalizeMantraRoles(roles='') {
  return String(roles).split(/[;,|/]+/).map(role=>role.trim()).filter(Boolean).map(role=>{
    const lower=role.toLocaleLowerCase('it');
    return lower==='por'?'Por':lower.charAt(0).toLocaleUpperCase('it')+lower.slice(1);
  }).join(';');
}
export function mantraRoleDepletion(players,state={}) {
  const groups=new Map();
  for(const player of players){
    const roles=normalizeMantraRoles(player.roles);
    if(!roles)continue;
    const group=groups.get(roles)??{roles,total:0,available:0};
    group.total++;
    if((state[player.id]?.marketStatus??'AVAILABLE')==='AVAILABLE')group.available++;
    groups.set(roles,group);
  }
  return [...groups.values()].sort((a,b)=>b.total-a.total||a.roles.localeCompare(b.roles,'it',{sensitivity:'base'}));
}
export function updateForecasts(slots) {
  return slots.map(({currentForecastBudget,...slot})=>slot);
}
export function updateSlotStrategy(slots,edits) {
  const categories=new Set(CATEGORY_PRIORITY.slice(1));
  const updated=slots.map(slot=>{
    const edit=edits[slot.id];
    if(!edit)return slot;
    const originalBudget=Number(edit.originalPlannedBudget);
    if(!Number.isFinite(originalBudget)||originalBudget<0)throw new Error(`Baseline non valida per ${slot.id}`);
    const budgets={originalPlannedBudget:originalBudget};
    if(slot.id.startsWith('POR'))return {...slot,...budgets,category:'POR'};
    if(isCompletedSlot(slot))return {...slot,...budgets};
    if(!categories.has(edit.category))throw new Error(`Ruolo non valido per ${slot.id}`);
    return {...slot,...budgets,category:edit.category};
  });
  return updateForecasts(updated);
}
export function slotCountsFromSlots(slots=[]) {
  const counts=Object.fromEntries(CATEGORY_PRIORITY.map(category=>[category,0]));
  for(const slot of slots)if(Object.hasOwn(counts,slot.category))counts[slot.category]++;
  return counts;
}
export function validateSlotCounts(input,maxRosterSize=34) {
  const counts={};
  for(const category of CATEGORY_PRIORITY){
    const value=Number(input?.[category]);
    if(!Number.isInteger(value)||value<0)throw new Error(`Numero slot non valido per ${category}`);
    counts[category]=value;
  }
  if(counts.POR!==3)throw new Error('I portieri devono essere esattamente 3');
  const total=CATEGORY_PRIORITY.reduce((sum,category)=>sum+counts[category],0);
  if(total<3||total>maxRosterSize)throw new Error(`La rosa deve contenere da 3 a ${maxRosterSize} giocatori`);
  return {counts,total};
}
function nextSlotId(slots,category) {
  const used=new Set(slots.map(slot=>slot.id));
  let index=1;
  while(used.has(`${category}${index}`))index++;
  return `${category}${index}`;
}
function priorityForIndex(index) { return index===0?'Key':index<3?'Starter':'Reserve'; }
export function reconcileSlotCounts(slots,input,maxRosterSize=34) {
  const {counts}=validateSlotCounts(input,maxRosterSize);
  let result=[...slots];
  for(const category of CATEGORY_PRIORITY){
    const desired=counts[category];
    let grouped=result.filter(slot=>slot.category===category);
    const completed=grouped.filter(isCompletedSlot);
    if(desired<completed.length)throw new Error(`Impossibile ridurre ${category} a ${desired}: ${completed.length} slot sono già acquistati`);
    if(grouped.length>desired){
      const toRemove=grouped.length-desired;
      const removable=new Set([...grouped].reverse().filter(slot=>!isCompletedSlot(slot)).slice(0,toRemove).map(slot=>slot.id));
      if(removable.size!==toRemove)throw new Error(`Impossibile ridurre ${category}: gli slot da rimuovere contengono acquisti`);
      result=result.filter(slot=>!removable.has(slot.id));
    }
    grouped=result.filter(slot=>slot.category===category);
    while(grouped.length<desired){
      const id=nextSlotId(result,category),index=grouped.length;
      const slot={id,category,priority:priorityForIndex(index),originalPlannedBudget:0,playerId:null,actualPurchasePrice:null};
      result.push(slot);grouped.push(slot);
    }
  }
  return updateForecasts(result);
}
