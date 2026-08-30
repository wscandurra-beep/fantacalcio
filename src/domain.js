export const CATEGORY_PRIORITY = ['POR','DC','E','C','WA','PC'];
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
export function budgetSummary(budget,slots) { const spent=slots.reduce((s,x)=>s+(x.actualPurchasePrice??0),0); const planned=slots.reduce((s,x)=>s+Number(x.originalPlannedBudget||0),0); const forecast=slots.filter(x=>!x.playerId).reduce((s,x)=>s+Number(x.currentForecastBudget||0),0); return {budget,planned,unallocated:budget-planned,spent,remaining:budget-spent,currentPlannedRemaining:forecast,variance:(budget-spent)-forecast}; }
export function slotPlanSummary(slots) { return {slotCount:slots.length,roleCount:slots.filter(slot=>slot.category).length,planned:slots.reduce((total,slot)=>total+Number(slot.originalPlannedBudget||0),0)}; }
export function statusFor(injury) { return !injury?'OK':[injury.injuryDetails,injury.expectedReturn&&`Rientro: ${injury.expectedReturn}`].filter(Boolean).join(' · '); }
export function availablePlayers(players,state) { return players.filter(p=>(state[p.id]?.marketStatus??'AVAILABLE')==='AVAILABLE'); }
export function tierDepletion(players,state){const m={};for(const p of players){const k=`${p.rankingCategory}-${p.tier}`;m[k]??={category:p.rankingCategory,tier:p.tier,total:0,available:0};m[k].total++;if((state[p.id]?.marketStatus??'AVAILABLE')==='AVAILABLE')m[k].available++;}return Object.values(m);}
export function updateForecasts(slots) {
  return slots.map(slot=>({...slot,currentForecastBudget:slot.playerId?Number(slot.actualPurchasePrice):Number(slot.originalPlannedBudget)}));
}
export function updateSlotStrategy(slots,edits) {
  const categories=new Set(CATEGORY_PRIORITY.slice(1));
  const updated=slots.map(slot=>{
    const edit=edits[slot.id];
    if(!edit)return slot;
    const originalBudget=Number(edit.originalPlannedBudget);
    if(!Number.isFinite(originalBudget)||originalBudget<0)throw new Error(`Baseline non valida per ${slot.id}`);
    if(slot.category==='POR')return {...slot,originalPlannedBudget:originalBudget};
    if(!categories.has(edit.category))throw new Error(`Ruolo non valido per ${slot.id}`);
    return {...slot,category:edit.category,originalPlannedBudget:originalBudget};
  });
  return updateForecasts(updated);
}
