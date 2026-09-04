export const CATEGORY_PRIORITY = Object.freeze(['POR','D','E','C','W','A','PC','OUT']);
export const DEFAULT_SLOT_COUNTS = Object.freeze({POR:3,D:8,E:6,C:6,W:4,A:4,PC:3,OUT:0});
export const OUT_ALIAS = 'OUT';
export const DEFAULT_ROLE_ALIAS = Object.freeze({
  Por:'POR','E;W':'E',E:'E',Dc:'D','Dd;Dc':'D','Dd;E':'E','Ds;Dc':'D','Dd;Ds;E':'D','Ds;E':'E',
  'B;Dd;E':'D','B;Ds;E':'D','Dd;Ds;Dc':'D','B;Dd;Ds':'D','T;A':'A','M;C':'C','C;T':'C',
  'W;A':'W',T:'OUT',C:'C','W;T':'W',W:'W','E;C':'E','E;M':'E','C;W':'C',Pc:'PC',A:'A'
});
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
export function availableMantraRoles(players=[]) {
  return [...new Set(players.map(player=>normalizeMantraRoles(player.roles)).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
}
export function defaultAliasConfiguration(players=[]) {
  const roles=availableMantraRoles(players);
  return CATEGORY_PRIORITY.map(alias=>({
    alias,
    slotCount:DEFAULT_SLOT_COUNTS[alias],
    mantraRoles:Object.entries(DEFAULT_ROLE_ALIAS).filter(([,mapped])=>mapped===alias).map(([role])=>role)
      .filter(role=>roles.includes(role)||Object.hasOwn(DEFAULT_ROLE_ALIAS,role))
  }));
}
export function validateAliasConfiguration(configuration=[],availableRoles=[],maxRosterSize=34) {
  if(!Array.isArray(configuration))throw new Error('Configurazione Alias non valida');
  const known=new Set(availableRoles.map(normalizeMantraRoles)),aliases=new Set(),claimed=new Map();
  const normalized=configuration.map((item,index)=>{
    const alias=String(item?.alias??'').trim().toUpperCase();
    if(!alias)throw new Error(`Nome Alias mancante alla riga ${index+1}`);
    if(!CATEGORY_PRIORITY.includes(alias))throw new Error(`Alias non valido: ${alias}`);
    if(aliases.has(alias))throw new Error(`Alias duplicato: ${alias}`);
    aliases.add(alias);
    const slotCount=Number(item.slotCount);
    if(!Number.isInteger(slotCount)||slotCount<0)throw new Error(`Numero slot non valido per ${alias}`);
    const mantraRoles=[...new Set((item.mantraRoles||[]).map(normalizeMantraRoles).filter(Boolean))];
    for(const role of mantraRoles){
      if(!known.has(role))throw new Error(`Ruolo Mantra non presente nel dataset: ${role}`);
      if(claimed.has(role))throw new Error(`${role} è già assegnato a ${claimed.get(role)}: ogni combinazione può appartenere a un solo Alias`);
      claimed.set(role,alias);
    }
    return {alias,slotCount,mantraRoles};
  });
  const por=normalized.find(item=>item.alias==='POR');
  if(!por||por.slotCount!==3||por.mantraRoles.length!==1||por.mantraRoles[0]!=='Por')throw new Error('POR deve essere fisso a 3 slot e ruolo Por');
  const out=normalized.find(item=>item.alias==='OUT');
  if(out&&out.slotCount!==0)throw new Error('OUT non genera slot pianificati');
  const total=normalized.reduce((sum,item)=>sum+(item.alias==='OUT'?0:item.slotCount),0);
  if(total<3||total>maxRosterSize)throw new Error(`La rosa deve contenere da 3 a ${maxRosterSize} giocatori`);
  return {configuration:normalized,total};
}
export function aliasForMantraRole(roles,configuration=[]) {
  const normalized=normalizeMantraRoles(roles);
  return configuration.find(item=>item.mantraRoles.includes(normalized))?.alias??null;
}
export function classifyPlayersByAliases(players=[],configuration=[]) {
  return players.map(player=>({...player,strategicAlias:aliasForMantraRole(player.roles,configuration)}));
}
/**
 * Make the persisted purchase assignment follow the current Mantra Role → Alias
 * mapping.  Slot-plan order is authoritative; manual auction-card placement is
 * deliberately not used as a roster assignment.
 */
export function reconcilePurchasedAssignments({slots=[],market={},auctionView={}},players=[],configuration=[]) {
  const playerById=new Map(players.map(player=>[String(player.id),player]));
  const occupied=slots.filter(slot=>slot.playerId).map(slot=>({playerId:String(slot.playerId),slotId:slot.id,price:slot.actualPurchasePrice}));
  const occupiedByPlayer=new Map(occupied.map(item=>[item.playerId,item]));
  const purchasedIds=[];
  for(const item of occupied)if(!purchasedIds.includes(item.playerId))purchasedIds.push(item.playerId);
  for(const [id,item] of Object.entries(market))if(item?.marketStatus==='MY TEAM'&&!purchasedIds.includes(String(id)))purchasedIds.push(String(id));

  const nextSlots=slots.map(slot=>({...slot,playerId:null,actualPurchasePrice:null}));
  const nextMarket={...market};
  const used=new Set();
  const records=purchasedIds.map(playerId=>{
    const entry=market[playerId]||{},legacy=occupiedByPlayer.get(playerId);
    const player=playerById.get(playerId),mappedAlias=player?aliasForMantraRole(player.roles,configuration):null;
    const explicitId=entry.assignedSlot?.id??entry.assignedSlotId??legacy?.slotId??null;
    const price=entry.actualPurchasePrice??legacy?.price??null;
    return {playerId,entry,mappedAlias,explicitId,price,assigned:null};
  });
  // Honour compatible explicit assignments before allocating any free slot.
  for(const record of records){
    const slot=nextSlots.find(item=>item.id===record.explicitId);
    if(slot&&slot.category===record.mappedAlias&&!used.has(slot.id)){record.assigned=slot;used.add(slot.id);}
  }
  for(const record of records){
    if(!record.assigned){
      const slot=nextSlots.find(item=>item.category===record.mappedAlias&&!used.has(item.id));
      if(slot){record.assigned=slot;used.add(slot.id);}
    }
    if(record.assigned){
      record.assigned.playerId=record.playerId;
      record.assigned.actualPurchasePrice=record.price;
    }
    nextMarket[record.playerId]={...record.entry,marketStatus:'MY TEAM',actualPurchasePrice:record.price,
      assignedSlot:record.assigned?{id:record.assigned.id,alias:record.assigned.category}:null,
      slotAssignmentStatus:record.assigned?'ASSIGNED':'OVERFLOW'};
  }
  const placements={...(auctionView?.placements||{})};
  for(const record of records){if(record.assigned)placements[record.playerId]=record.assigned.id;else delete placements[record.playerId];}
  const nextAuctionView={...(auctionView||{}),placements,orders:{...(auctionView?.orders||{})}};
  validatePurchasedAssignments(nextSlots,nextMarket,players,configuration);
  return {slots:updateForecasts(nextSlots),market:nextMarket,auctionView:nextAuctionView,overflow:records.filter(record=>!record.assigned).map(record=>record.playerId)};
}
export function validatePurchasedAssignments(slots=[],market={},players=[],configuration=[]) {
  const playerById=new Map(players.map(player=>[String(player.id),player])),used=new Set();
  for(const slot of slots.filter(item=>item.playerId)){
    if(used.has(slot.id))throw new Error(`Slot duplicato: ${slot.id}`);
    used.add(slot.id);
    const player=playerById.get(String(slot.playerId));
    const mappedAlias=player?aliasForMantraRole(player.roles,configuration):null;
    if(slot.category!==mappedAlias)throw new Error(`Slot ${slot.id} incompatibile con ${slot.playerId}`);
    const assigned=market[slot.playerId]?.assignedSlot;
    if(!assigned||assigned.id!==slot.id||assigned.alias!==mappedAlias)throw new Error(`Assegnazione persistente non valida per ${slot.playerId}`);
  }
  return true;
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
export function tierDepletion(players,state){const m={};for(const p of players){const category=p.strategicAlias??p.rankingCategory,k=`${category}-${p.tier}`;m[k]??={category,tier:p.tier,total:0,available:0,players:[]};const group=m[k];group.total++;group.players.push(p);if((state[p.id]?.marketStatus??'AVAILABLE')==='AVAILABLE')group.available++;}return Object.values(m);}
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
    const group=groups.get(roles)??{roles,total:0,available:0,players:[]};
    group.total++;
    group.players.push(player);
    if((state[player.id]?.marketStatus??'AVAILABLE')==='AVAILABLE')group.available++;
    groups.set(roles,group);
  }
  return [...groups.values()].sort((a,b)=>b.total-a.total||a.roles.localeCompare(b.roles,'it',{sensitivity:'base'}));
}
export function updateForecasts(slots) {
  return slots.map(({currentForecastBudget,...slot})=>slot);
}
export function updateSlotBaseline(slots,slotId,value) {
  if(typeof value==='string'&&!value.trim())throw new Error(`Baseline non valida per ${slotId}`);
  const originalPlannedBudget=Number(value);
  if(!Number.isFinite(originalPlannedBudget)||originalPlannedBudget<0)throw new Error(`Baseline non valida per ${slotId}`);
  if(!slots.some(slot=>slot.id===slotId))throw new Error(`Slot non trovato: ${slotId}`);
  return updateForecasts(slots.map(slot=>slot.id===slotId?{...slot,originalPlannedBudget}:slot));
}
export function updateSlotStrategy(slots,edits) {
  const categories=new Set([...CATEGORY_PRIORITY.slice(1),...Object.values(edits).map(edit=>edit.category).filter(category=>category&&category!=='POR')]);
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
export function groupSlotsByCategory(slots=[],includeEmpty=false,categoryOrder=CATEGORY_PRIORITY) {
  const configured=[...categoryOrder];
  for(const slot of slots)if(slot.category&&!configured.includes(slot.category))configured.push(slot.category);
  return configured.map(category=>({category,slots:slots.filter(slot=>slot.category===category)})).filter(group=>includeEmpty||group.slots.length);
}
export function validateSlotCounts(input,maxRosterSize=34) {
  const counts={};
  for(const category of CATEGORY_PRIORITY){
    const value=input?.[category]==null?0:Number(input[category]);
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
function normalizeSlotIdentifiers(slots,categoryOrder=CATEGORY_PRIORITY) {
  const ordered=[...categoryOrder];
  for(const slot of slots)if(slot.category&&!ordered.includes(slot.category))ordered.push(slot.category);
  const normalized=new Map();
  for(const category of ordered){
    const ownPrefix=new RegExp(`^${category}\\d+$`);
    const grouped=slots.map((slot,index)=>({slot,index})).filter(item=>item.slot.category===category)
      // Keep existing identifiers first. Slots moved into this role are appended,
      // so C1…C5 followed by a legacy WA2 correctly becomes C6.
      .sort((left,right)=>(Number(ownPrefix.test(right.slot.id))-Number(ownPrefix.test(left.slot.id)))||left.index-right.index);
    grouped.forEach(({slot},index)=>normalized.set(slot,{...slot,id:`${category}${index+1}`}));
  }
  return slots.map(slot=>normalized.get(slot)??slot);
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
  return updateForecasts(normalizeSlotIdentifiers(result));
}
export function reconcileAliasSlots(slots,configuration,maxRosterSize=34) {
  const planned=configuration.filter(item=>item.alias!==OUT_ALIAS);
  const total=planned.reduce((sum,item)=>sum+Number(item.slotCount),0);
  if(total>maxRosterSize)throw new Error(`La rosa deve contenere da 3 a ${maxRosterSize} giocatori`);
  let result=[...slots];
  const valid=new Set(planned.map(item=>item.alias));
  const stranded=result.filter(slot=>!valid.has(slot.category)&&isCompletedSlot(slot));
  if(stranded.length)throw new Error(`Impossibile rimuovere l'Alias ${stranded[0].category}: contiene acquisti`);
  result=result.filter(slot=>valid.has(slot.category));
  for(const {alias,slotCount} of planned){
    let grouped=result.filter(slot=>slot.category===alias);
    const completed=grouped.filter(isCompletedSlot);
    if(slotCount<completed.length)throw new Error(`Impossibile ridurre ${alias} a ${slotCount}: ${completed.length} slot sono già acquistati`);
    if(grouped.length>slotCount){
      const removable=new Set([...grouped].reverse().filter(slot=>!isCompletedSlot(slot)).slice(0,grouped.length-slotCount).map(slot=>slot.id));
      result=result.filter(slot=>!removable.has(slot.id));
    }
    grouped=result.filter(slot=>slot.category===alias);
    while(grouped.length<slotCount){
      const id=nextSlotId(result,alias),index=grouped.length;
      const slot={id,category:alias,priority:priorityForIndex(index),originalPlannedBudget:0,playerId:null,actualPurchasePrice:null};
      result.push(slot);grouped.push(slot);
    }
  }
  return updateForecasts(normalizeSlotIdentifiers(result));
}
