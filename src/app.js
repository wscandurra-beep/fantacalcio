import {CATEGORY_PRIORITY,DEFAULT_SLOT_COUNTS,rankPlayers,assignTiers,budgetSummary,slotPlanSummary,tierDepletion,mantraRoleDepletion,updateForecasts,updateSlotBaseline,updateSlotStrategy,getForecast,getResidual,percentageOfBudget,formatPercentage,areaVariance,groupSlotsByCategory,availableMantraRoles,defaultAliasConfiguration,validateAliasConfiguration,classifyPlayersByAliases,reconcileAliasSlots,reconcilePurchasedAssignments,canonicalPurchases,purchaseReconciliation,purchaseFinancialSummary} from './domain.js';
import {getFormation,getFormationIds} from './mantraFormations.js';
import {applyInjurySnapshot,formatItalianDate,normalizeInjuryUpdate} from './injury-data.js';
import {applyProContro,normalizeProControRuns} from './pro-contro-data.js';
import {auctionInjuryStatus,auctionPlayerMarketStatus,auctionPlayerSlotId,auctionSlotTitle,auctionStatusCounts,buildAuctionRows,canDropAuctionPlayer,moveAuctionPlayer,pinAuctionPlayerToCurrentSlot,sortAuctionSoldLast} from './auction-view.js';
import {resetPlayer} from './player-reset.js';
import {backupFilename,createBackup,parseBackup} from './backup.js';
const loadIssues=[];
async function fetchJson(path,fallback,label){
  try{
    const separator=path.includes('?')?'&':'?';
    const response=await fetch(`${path}${separator}v=${Date.now()}`,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch(error){
    loadIssues.push(`${label}: ${error.message}`);
    return fallback;
  }
}
let [raw,injurySnapshot,injuryUpdate,proControRows,proControLog]=await Promise.all([
  fetchJson('./data/players.json',[],'Elenco giocatori'),
  fetchJson('./data/infortuni.json',{},'Snapshot infortuni'),
  fetchJson('./data/infortuni_update.json',{},'Aggiornamento infortuni'),
  fetchJson('./data/pro_contro.json',[],'Dataset PRO/CONTRO'),
  fetchJson('./data/pro_contro_runs.json',{runs:[]},'Log PRO/CONTRO')
]);
raw=applyProContro(raw,proControRows);
proControLog=normalizeProControRuns(proControLog);
raw=applyInjurySnapshot(raw,injurySnapshot);
injuryUpdate=normalizeInjuryUpdate(injuryUpdate,injurySnapshot);
const configuredEndpoint=document.querySelector('meta[name="injury-refresh-endpoint"]')?.content?.trim()||'';
const refreshEndpoint=configuredEndpoint.startsWith('http')?configuredEndpoint.replace(/\/$/,''):'';
const mantraRoleOptions=availableMantraRoles(raw);
const STORAGE_KEY='mantra-auction';
const defaults={budget:1000,rosterSize:34,formation:'3-4-2-1',started:false,slots:[],aliasConfiguration:defaultAliasConfiguration(raw),market:{},auctionView:{placements:{},orders:{}}};
let persisted={};
try{persisted=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch(error){loadIssues.push('Configurazione salvata non valida: sono stati ripristinati i valori iniziali')}
if(!persisted||typeof persisted!=='object'||Array.isArray(persisted))persisted={};
let state=Object.assign({},defaults,persisted);
if(!Array.isArray(state.slots))state.slots=[];
if(!state.market||typeof state.market!=='object'||Array.isArray(state.market))state.market={};
if(!state.auctionView||typeof state.auctionView!=='object'||Array.isArray(state.auctionView))state.auctionView={placements:{},orders:{}};
const counts={...DEFAULT_SLOT_COUNTS};
if(!state.slots.length) state.slots=Object.entries(counts).filter(([c])=>c!=='OUT').flatMap(([c,n])=>Array.from({length:n},(_,i)=>({id:`${c}${i+1}`,category:c,priority:i===0?'Key':i<3?'Starter':'Reserve',originalPlannedBudget:[45,30,20,12,8,5,3,1][i]??1,playerId:null,actualPurchasePrice:null})));
state.slots=updateForecasts(state.slots);
if(!Array.isArray(state.aliasConfiguration)||!CATEGORY_PRIORITY.every(alias=>state.aliasConfiguration.some(item=>item.alias===alias)))state.aliasConfiguration=defaultAliasConfiguration(raw);
try{state.aliasConfiguration=validateAliasConfiguration(state.aliasConfiguration,mantraRoleOptions).configuration}catch{state.aliasConfiguration=defaultAliasConfiguration(raw)}
// Alias names changed from the legacy DC/WA model to D/W/A.  A saved roster can
// therefore contain completed slots whose old category no longer exists.  Never
// let that client-side migration prevent the whole application from rendering.
try{state.slots=reconcileAliasSlots(state.slots,state.aliasConfiguration)}catch(error){
  const legacyAliases={DC:'D',WA:'W'};
  state.slots=state.slots.map(slot=>{
    if(CATEGORY_PRIORITY.includes(slot.category))return slot;
    const player=raw.find(item=>item.id===slot.playerId);
    const resolved=player?classifyPlayersByAliases([player],state.aliasConfiguration)[0]?.strategicAlias:null;
    return {...slot,category:resolved&&resolved!=='OUT'?resolved:(legacyAliases[slot.category]??'W')};
  });
  state.slots=reconcileAliasSlots(state.slots,state.aliasConfiguration);
  loadIssues.push('Configurazione precedente aggiornata ai nuovi Alias');
}
({slots:state.slots,market:state.market,auctionView:state.auctionView}=reconcilePurchasedAssignments(state,raw,state.aliasConfiguration));
state.rosterSize=state.slots.length;
function players(){const classified=classifyPlayersByAliases(raw,state.aliasConfiguration);return state.aliasConfiguration.flatMap(({alias})=>{const ranked=rankPlayers(classified.filter(player=>player.strategicAlias===alias));return alias==='OUT'?ranked.map(player=>({...player,tier:1})):assignTiers(ranked,state.slots.filter(slot=>slot.category===alias).length)});}
const save=(rerender=true)=>{const synchronized=reconcilePurchasedAssignments(state,raw,state.aliasConfiguration);state={...state,slots:synchronized.slots,market:synchronized.market,auctionView:synchronized.auctionView};localStorage.setItem(STORAGE_KEY,JSON.stringify(state));if(rerender)render();return synchronized};let view='cockpit';
let pressurePage='tier';
let pressureGroups=[];
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));render()});
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const pressureCards=items=>items.map((item,index)=>`<button type=button class=tier onclick="openPressureDetail(${index})" aria-label="Mostra giocatori: ${escapeHtml(item.label)}"><span class=muted>${escapeHtml(item.label)}</span><b>${item.available} / ${item.total}</b><div class=bar><i style="width:${item.total?100*item.available/item.total:0}%"></i></div></button>`).join('');
function marketPressure(ps){
  const tierItems=tierDepletion(ps,state.market).map(item=>({...item,label:`${item.category} · Tier ${item.tier}`}));
  const mantraItems=mantraRoleDepletion(raw,state.market).map(item=>({...item,label:item.roles}));
  pressureGroups=pressurePage==='tier'?tierItems:mantraItems;
  return `<div class="card wide market-pressure"><div class=section-head><h2>Pressione mercato</h2><span class=muted>Disponibili / originali</span></div><div class=pressure-tabs role=tablist aria-label="Vista pressione mercato"><button type=button role=tab aria-selected="${pressurePage==='tier'}" class="${pressurePage==='tier'?'active':''}" onclick="setPressurePage('tier')">Tier</button><button type=button role=tab aria-selected="${pressurePage==='mantra'}" class="${pressurePage==='mantra'?'active':''}" onclick="setPressurePage('mantra')">Ruoli Mantra</button></div><div class=pressure-scroll><div class=pressure>${pressureCards(pressureGroups)}</div></div><section class=pressure-detail aria-live=polite></section></div>`;
}
function rosterGroups(){
  const purchases=canonicalPurchases(state.market);
  if(!purchases.length)return `<p class="muted roster-empty">Nessun giocatore acquistato.</p>`;
  const groups=state.aliasConfiguration.map(({alias})=>({category:alias,purchases:purchases.filter(purchase=>state.slots.find(slot=>slot.id===purchase.slotId)?.category===alias)})).filter(group=>group.purchases.length);
  return `<div class=roster-groups>${groups.map(({category,purchases})=>`<section class=roster-group><h3>${escapeHtml(category)} <span>· ${purchases.length}</span></h3><ul class=roster-players>${purchases.map(purchase=>{const player=raw.find(item=>String(item.id)===purchase.playerId),rosterPlayer=player??{id:purchase.playerId,name:purchase.playerId};return `<li><span class=roster-player-summary><b>${escapeHtml(rosterPlayer.name)}</b><span> · ${escapeHtml(player?.team||'—')}</span></span>${resetButton(rosterPlayer,true,'roster-player-reset')}</li>`}).join('')}</ul></section>`).join('')}</div>`;
}
function cockpit(){const b=purchaseFinancialSummary(state.budget,state.slots,state.market),ps=players(),purchased=canonicalPurchases(state.market);return `<div class=eyebrow>Live strategy</div><h1>Buonasera, Mister.</h1><div class=grid>${[['Budget iniziale',b.budget],['Speso',b.spent],['Rimanente',b.remaining],['Varianza',b.variance]].map((x,i)=>`<div class="card metric"><label>${x[0]}</label><strong class=${i===2?'lime':''}>${x[1]} <small>cr</small></strong></div>`).join('')}<div class="card wide roster-card"><div class=section-head><h2>Rosa</h2><span class=pill>${purchased.length} / ${state.slots.length}</span></div><p class=muted>${Math.max(0,state.slots.length-purchased.length)} slot aperti · ${state.formation}</p>${rosterGroups()}</div>${marketPressure(ps)}</div><div class=section><div class=section-head><h2>Slot prioritari</h2><button class=action onclick="goAuction()">Apri Asta</button></div>${slotTable(state.slots,false,true)}</div>`}
function signed(value){return value>0?`+${value}`:`${value}`}
function varianceClass(value){return value<0?'variance-saving':value>0?'variance-overspend':'variance-even'}
function slotRow(s,editable){
  const completed=Boolean(s.playerId),roleFixed=s.id.startsWith('POR')||completed;
  const role=editable&&!roleFixed?`<select data-slot-role aria-label="Ruolo ${s.id}">${state.aliasConfiguration.filter(item=>item.alias!=='POR'&&item.alias!=='OUT').map(({alias})=>`<option${alias===s.category?' selected':''}>${escapeHtml(alias)}</option>`).join('')}</select>`:`<span class="fixed-role">${s.category}${s.id.startsWith('POR')?' <small>fisso</small>':completed?' <small>acquistato</small>':''}</span>`;
  const baseline=editable?`<div class="baseline-cell"><input data-slot-baseline aria-label="Baseline ${s.id}" type="text" inputmode="decimal" value="${s.originalPlannedBudget}"><button class="fill-handle" type="button" aria-label="Trascina per copiare la baseline di ${s.id}" title="Trascina per copiare il valore"></button></div>`:s.originalPlannedBudget;
  const forecast=getForecast(s);
  return `<tr data-slot-id="${s.id}"><td><b>${s.id}</b></td><td>${role}</td><td>${s.priority}</td><td data-slot-baseline-pct>${formatPercentage(percentageOfBudget(s.originalPlannedBudget,state.budget))}</td><td>${baseline}</td><td data-slot-forecast>${forecast}</td><td data-slot-forecast-pct>${formatPercentage(percentageOfBudget(forecast,state.budget))}</td><td>${completed?`${(s.playerIds??[s.playerId]).map(id=>raw.find(p=>String(p.id)===String(id))?.name??id).join(' · ')} · ${s.actualPurchasePrice}`:'—'}</td><td data-slot-residual>${getResidual(s)}</td></tr>`;
}
function slotPlanGroups(slots){return groupSlotsByCategory(slots,false,state.aliasConfiguration.map(item=>item.alias));}
function slotTable(slots,editable=false,priority=false){
  const recap=slotPlanSummary(slots,state.budget);
  const body=editable?slotPlanGroups(slots).map(({category,slots:grouped})=>{const variance=areaVariance(slots,category);return `<tr class="area-row"><th colspan="7">${escapeHtml(category)}</th><th>Δ Baseline <strong class="${varianceClass(variance)}">${signed(variance)}</strong></th><th></th></tr>${grouped.map(s=>slotRow(s,true)).join('')}`}).join(''):slots.map(s=>slotRow(s,false)).join('');
  const totals=editable?`<tfoot><tr class="totals-row"><th colspan="3">Totali</th><th data-total-baseline-pct>${formatPercentage(recap.baselinePct)}</th><th data-total-baseline>${recap.planned}</th><th data-total-forecast>${recap.forecast}</th><th data-total-forecast-pct>${formatPercentage(recap.forecastPct)}</th><th><span class="actual-total">Actual ${recap.actual}</span><br>Δ <strong class="${varianceClass(recap.completedVariance)}" data-total-variance>${signed(recap.completedVariance)}</strong></th><th data-total-residual>${recap.planned-recap.actual}</th></tr></tfoot>`:'';
  return `<div class="slot-table-wrap${editable?' strategy-slot-table-wrap':''}${priority?' priority-slots-scroll':''}"><table class="slot-table"><thead><tr><th>Slot</th><th>Ruolo</th><th>Priorità</th><th>Baseline %</th><th>Baseline</th><th>Forecast</th><th>Forecast %</th><th>Actual</th><th>Residui</th></tr></thead><tbody>${body}</tbody>${totals}</table></div>`;
}
const auctionField=(label,value,important=false)=>`<div class="auction-field${important?' important':''}"><span>${label}</span><b>${escapeHtml(value??'—')}</b></div>`;
function auctionRosterSummary(){
  const purchases=canonicalPurchases(state.market),reconciliation=purchaseReconciliation(state.slots,state.market),financials=purchaseFinancialSummary(state.budget,state.slots,state.market);
  const slotRows=state.slots.map(slot=>{const ids=slot.playerIds??(slot.playerId?[String(slot.playerId)]:[]),names=ids.map(id=>raw.find(player=>String(player.id)===String(id))?.name??id);return `<li><b>${escapeHtml(slot.id)}</b><span class="summary-count">${ids.length}</span><span>${names.length?names.map(escapeHtml).join(' · '):'<i>scoperto</i>'}</span></li>`}).join('');
  const uncovered=state.slots.filter(slot=>(slot.playerIds??(slot.playerId?[slot.playerId]:[])).length===0).length;
  return `<aside class="auction-roster-summary" aria-label="Sintesi rosa live"><div class="auction-summary-metrics">${[['Baseline',financials.planned],['Forecast',financials.forecast],['Spesa',financials.spent],['Residui',financials.remaining],['Giocatori',`${purchases.length} / ${state.slots.length}`],['Scoperti',uncovered]].map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>${reconciliation.consistent?'':`<div class="reconciliation-alert" role="alert"><b>Anomalia riconciliazione</b> Acquisti ${reconciliation.purchased} · rappresentati ${reconciliation.represented}</div>`}<ul class="auction-summary-slots">${slotRows}</ul></aside>`;
}
function auctionStatusField(player){
  const status=auctionInjuryStatus(player.status);
  const value=status.interactive?`<button type=button class=auction-injury-trigger draggable=false onclick="showInjury('${player.id}')" aria-label="Mostra dettaglio indisponibilità di ${escapeHtml(player.name)}">${status.label}</button>`:`<b class=auction-injury-ok>${status.label}</b>`;
  return `<div class="auction-field auction-status-field"><span>Status</span>${value}</div>`;
}
function resetButton(player,enabled,extraClass=''){
  if(!enabled)return '';
  return `<button type=button class="player-reset player-reset-visible ${extraClass}" onclick="resetOne('${player.id}')" aria-label="Annulla vendita o acquisto di ${escapeHtml(player.name)}" title="Ripristina giocatore"><span aria-hidden=true>↶</span></button>`;
}
const acquiredPlayerIds=()=>new Set(canonicalPurchases(state.market).map(purchase=>purchase.playerId));
function playerMarketStatus(player,acquiredIds=acquiredPlayerIds()){
  const status=auctionPlayerMarketStatus(player,state.market,acquiredIds);
  return status==='ACQUIRED'?'MY TEAM':status;
}
function auctionCard(player,index,acquiredPlayerIds){
  const marketStatus=playerMarketStatus(player,acquiredPlayerIds);
  const fields=[['Coppe',player.cups],['Asta €',player.auctionValue,true],['Quot.',player.quotation],['Hype Factor',player.hypeFactor],['Age',player.age],['AvgPG',player.AvgPG],['AvgMf',player.AvgMF],['Gol LY',player.GoLY],['Ass LY',player.AssLY],['ACT PG',player.PG],['ACT MF',player.MF]];
  const secondaryFields=[['Mantra R',player.roles],['Rigori',player.R],['Calci P',player.P]];
  const actions=marketStatus==='AVAILABLE'?`<button class="action secondary" onclick="sold('${player.id}')">Sold</button><button class=action onclick="buy('${player.id}')">+ Mia</button>`:`<strong class="auction-market-status">${escapeHtml(marketStatus)}</strong>`;
  return `<article class="auction-player-card category-${escapeHtml(player.rankingCategory)}${marketStatus==='AVAILABLE'?'':' sold'}" draggable=true data-player-id="${player.id}" data-index="${index}">${resetButton(player,marketStatus!=='AVAILABLE','auction-player-reset')}<div class=auction-player-head><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml(player.team||'—')}</p></div><div class=auction-card-fields>${fields.map(field=>auctionField(...field)).join('')}${auctionStatusField(player)}${secondaryFields.map(field=>auctionField(...field)).join('')}</div><details class=auction-pro-contro><summary>PRO / CONTRO</summary><b>PRO</b><p>${escapeHtml(player.pro||'Non disponibile')}</p><b>CONTRO</b><p>${escapeHtml(player.contro||'Non disponibile')}</p></details><div class=auction-actions>${actions}</div></article>`;
}
function auction(){
  const planOrderedSlots=slotPlanGroups(state.slots).flatMap(group=>group.slots),rows=buildAuctionRows(players(),planOrderedSlots,state.auctionView,true),acquiredIds=acquiredPlayerIds();
  return `<div class=eyebrow>Live auction board</div><h1>Asta</h1>${auctionRosterSummary()}<p class="muted auction-intro">Slot e Tier seguono la Strategia d'Asta. Trascina una card per creare un ordine o un'assegnazione manuale solo in questa vista.</p><div class=auction-board>${rows.map(({slot,players:rowPlayers})=>{const items=sortAuctionSoldLast(rowPlayers,state.market,acquiredIds),counts=auctionStatusCounts(items,state.market,acquiredIds),title=slot.id==='OUT'?escapeHtml(auctionSlotTitle(slot)):`${escapeHtml(slot.id)} <span aria-hidden="true">· BDG</span> <input data-auction-budget type="number" min="0" step="any" value="${escapeHtml(slot.originalPlannedBudget)}" aria-label="BDG ${escapeHtml(slot.id)}"> <span aria-hidden="true">· FRC</span> <output data-auction-forecast>${getForecast(slot)}</output>`;return `<section class=auction-slot-row data-slot-id="${slot.id}"><header class=auction-slot-head><h2>${title}</h2><span>${slot.id==='OUT'?'Override manuale · Tier unico':`${escapeHtml(slot.category)} · Tier ${state.slots.filter(item=>item.category===slot.category).indexOf(slot)+1}`} · ${items.length} giocatori · Sold: ${counts.sold} · Acquistati: ${counts.acquired} · Disponibili: ${counts.available}</span></header><div class=auction-slot-track>${items.map((player,index)=>auctionCard(player,index,acquiredIds)).join('')}<div class=auction-empty>${items.length?'Trascina qui per aggiungere in coda':'Trascina qui un giocatore'}</div></div></section>`}).join('')}</div>`;
}
function formationSummary(id){const formation=getFormation(id);if(!formation)return `<p class=muted>Modulo non disponibile</p>`;const names={GK:"PORTA",DEF:"DIFESA",MID:"CENTROCAMPO",AM:"TREQUARTI",ATT:"ATTACCO"};return `<div class=formation-summary><b>${formation.label}</b>${formation.lines.map(group=>`<div><span>${names[group.id]}</span><strong>${group.positions.map(position=>position.optionalLabel).join(" · ")}</strong></div>`).join("")}</div>`}
const roleBrick=(role,fixed=false)=>`<button type=button class="role-brick" draggable="${!fixed}" data-mantra-role="${escapeHtml(role)}" ${fixed?'aria-disabled=true':''}>${escapeHtml(role)}</button>`;
function aliasTile(item){const fixed=item.alias==='POR',out=item.alias==='OUT';return `<section class="alias-tile${out?' out-alias':''}" data-alias="${item.alias}"><header><b>${item.alias}</b><label>N° in Rosa <input data-alias-slots type=number min="${fixed?3:0}" max="${fixed?3:31}" value="${item.slotCount}" ${fixed||out?'disabled':''}></label></header><div class=role-dropzone>${item.mantraRoles.map(role=>roleBrick(role,fixed&&role==='Por')).join('')||'<span class="empty-drop">Trascina qui</span>'}</div>${out?'<small>Tier unico · escluso dagli slot pianificati</small>':''}</section>`}
function slotCountControls(){const claimed=new Set(state.aliasConfiguration.flatMap(item=>item.mantraRoles)),unassigned=mantraRoleOptions.filter(role=>!claimed.has(role));return `<div class="slot-counts"><div class="slot-counts-head"><div><b>Slot per ruolo</b><span class=muted>Trascina ogni Mantra Role nel suo Alias · massimo 34 giocatori</span></div><strong data-roster-total>${state.slots.length} / 34</strong></div><div id=aliasBoard class=alias-board>${state.aliasConfiguration.map(aliasTile).join('')}</div><section class="unassigned-tile" data-alias=""><header><b>Non assegnati</b><span class=muted>Nuovi ruoli rilevati nel dataset</span></header><div class=role-dropzone>${unassigned.map(role=>roleBrick(role)).join('')||'<span class="empty-drop">Nessun ruolo non assegnato</span>'}</div></section></div>`}
function strategy(){return `<div class=eyebrow>Baseline configurabile</div><h1>Strategia d'asta</h1><div class="card editor"><label>Budget<br><input id=budget type=number value=${state.budget}></label><label>Rosa<br><input id=size type=number min=3 max=34 value=${state.rosterSize} readonly></label><label>Modulo<br><select id=formation>${getFormationIds().map(id=>`<option value="${id}"${id===state.formation?" selected":""}>${getFormation(id).label}</option>`).join("")}</select></label><label><br><button class=action onclick=configure()>Salva configurazione</button></label>${slotCountControls()}</div><div id=formationSummary class="card tactical-card">${formationSummary(state.formation)}</div><div class=section><div class=section-head><div><h2>Piano slot</h2><p class=muted>Il forecast è calcolato in tempo reale: usa l'Actual per gli slot acquistati e la Baseline per quelli aperti. Le variazioni di ruolo sono disponibili solo per gli slot aperti; i tre POR sono fissi.</p></div></div>${slotTable(state.slots,true)}</div><div class="card reset-panel section"><div><h2>Ripristina impostazioni</h2><p class=muted>Cancella configurazione, acquisti e stati del mercato, riportando l'app ai valori iniziali.</p></div><button class="action danger-action" onclick=resetAll()>Resetta tutto</button></div>`}
function settings(){return `<div class=eyebrow>Protezione dati</div><h1>Configurazioni</h1><section class="card backup-panel"><div><h2>Backup della sessione</h2><p class=muted>Esporta una copia completa dello stato dell'asta oppure ripristina una copia precedente. L'import sostituisce tutti i dati correnti.</p></div><div class=backup-actions><button type=button class=action onclick="exportBackup()">Export Backup</button><button type=button class="action secondary" onclick="selectBackup()">Import Backup</button><input id=backupFile type=file accept="application/json,.json" hidden></div><p id=backupStatus class=backup-status aria-live=polite></p></section><div class="card reset-panel section"><div><h2>Ripristina impostazioni</h2><p class=muted>Cancella configurazione, acquisti e stati del mercato, riportando l'app ai valori iniziali.</p></div><button class="action danger-action" onclick=resetAll()>Resetta tutto</button></div>`}
const changeLabel={NEW_INJURY:'NUOVO',RECOVERED:'RIENTRATO',INJURY_UPDATED:'AGGIORNATO',RETURN_UPDATED:'AGGIORNATO',UNCHANGED:'INVARIATO'};
function injurySummary(u){return `${u.currentInjuries??0} attuali · +${u.newInjuries??0} nuovi · ${u.recovered??0} recuperati · ${(u.injuryUpdated||0)+(u.returnUpdated||0)} modificati`}
function proControDiagnostics(){
  const runs=proControLog.runs,latest=runs[0];
  if(!latest)return `<section class="card section pro-contro-diagnostics"><h2>PRO/CONTRO Scraper</h2><div class=notice>Nessuna esecuzione registrata.</div></section>`;
  const metrics=[['Status',latest.status],['Scraped',latest.scrapedRecords],['Matched',latest.matched],['Unmatched',latest.unmatched],['Ambiguous',latest.ambiguous],['Coverage',`${latest.coveragePct}%`]];
  const details=run=>[...(run.errors||[]).map(x=>`Errore · ${x.name||x.id||''} ${x.error||x}`),...(run.unmatchedRecords||[]).map(x=>`Unmatched · ${x.name} · ${x.team||'—'}`),...(run.ambiguousRecords||[]).map(x=>`Ambiguous · ${x.name} · candidati ${(x.candidateIds||[]).join(', ')}`)];
  return `<section class="card section pro-contro-diagnostics"><div class=section-head><div><h2>PRO/CONTRO Scraper</h2><p class=muted>Ultima esecuzione · ${escapeHtml(latest.runTimestamp)}</p></div></div><div class="grid log-summary">${metrics.map(([key,value])=>`<div class=metric><label>${key}</label><strong>${escapeHtml(value??'—')}</strong></div>`).join('')}</div><div class=log-history><h3>Storico esecuzioni</h3>${runs.map(run=>{const issues=details(run);return `<details><summary><b>${escapeHtml(run.runTimestamp)}</b> · ${escapeHtml(run.status)} · ${escapeHtml(run.scrapedRecords)} scraped · ${escapeHtml(run.coveragePct)}%</summary><p class=log-metrics>Source ${escapeHtml(run.sourcePlayers)} · discovered ${escapeHtml(run.playersDiscovered)} · processed ${escapeHtml(run.playersProcessed)} · requests OK ${escapeHtml(run.requestsSuccessful)} · failed ${escapeHtml(run.requestsFailed)} · PRO ${escapeHtml(run.withPro)} · CONTRO ${escapeHtml(run.withContro)} · both ${escapeHtml(run.withBoth)} · duplicates ${escapeHtml(run.duplicates)}</p>${issues.length?`<ul>${issues.map(issue=>`<li>${escapeHtml(issue)}</li>`).join('')}</ul>`:'<p class=muted>Nessun errore di scraping o matching.</p>'}</details>`}).join('')}</div></section>`;
}
function quality(){const missingAge=raw.filter(p=>p.age==null).length,missingPc=raw.filter(p=>!p.pro||!p.contro).length,uncat=raw.filter(p=>!p.rankingCategory).length,u=injuryUpdate,diagnostics=[...(u.unmatchedRecords||[]).map(x=>`Unmatched · ${x.name} · ${x.team||'squadra ignota'}`),...(u.ambiguousRecords||[]).map(x=>`Ambiguous · ${x.name} · ${x.team||'squadra ignota'} · candidati: ${(x.candidateIds||[]).join(', ')}`)];return `<div class=eyebrow>Import diagnostics</div><h1>Data quality</h1><div class=grid>${[['Giocatori importati',raw.length],['Età mancanti',missingAge],['Pro / Contro mancanti',missingPc],['Categoria irrisolta',uncat]].map(x=>`<div class="card metric"><label>${x[0]}</label><strong>${x[1]}</strong></div>`).join('')}</div><section class="card section injury-refresh"><div class=section-head><div><h2>Aggiornamento infortuni</h2><p class=muted>Fantacalcio.it · Aggiornato ${formatItalianDate(u.updatedAt)} · ${u.currentInjuries??'—'} infortunati</p></div><button id=refreshInjuries class=action>Aggiorna infortuni</button></div><p id=refreshStatus class=refresh-status aria-live=polite>${injurySummary(u)}</p>${diagnostics.length?`<details><summary>Dettagli matching (${diagnostics.length})</summary><ul>${diagnostics.map(x=>`<li>${x}</li>`).join('')}</ul></details>`:''}</section>${proControDiagnostics()}<div class="notice section">Gli arricchimenti non associabili con certezza restano vuoti e richiedono revisione manuale.</div>`}
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function refreshInjuries(){const button=document.querySelector('#refreshInjuries'),status=document.querySelector('#refreshStatus'),previous=injuryUpdate.updatedAt;button.disabled=true;status.textContent='Aggiornamento...';try{if(!refreshEndpoint)throw new Error('trigger unavailable');const trigger=await fetch(`${refreshEndpoint}/trigger`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!trigger.ok&&trigger.status!==409)throw new Error('trigger failed');const payload=await trigger.json();const deadline=Date.now()+15*60*1000;let workflowDone=false;while(Date.now()<deadline){await wait(5000);const check=await fetch(`${refreshEndpoint}/status?startedAt=${encodeURIComponent(payload.startedAt)}`,{cache:'no-store'});if(!check.ok)throw new Error('status failed');const run=await check.json();if(run.status==='completed'){if(run.conclusion!=='success')throw new Error('workflow failed');workflowDone=true;break}}if(!workflowDone)throw new Error('timeout');while(Date.now()<deadline){const [nextUpdateResponse,nextSnapshotResponse,nextPlayersResponse]=await Promise.all(['infortuni_update.json','infortuni.json','players.json'].map(file=>fetch(`./data/${file}?v=${Date.now()}`,{cache:'no-store',headers:{'Cache-Control':'no-cache'}})));if(nextUpdateResponse.ok&&nextSnapshotResponse.ok&&nextPlayersResponse.ok){const [nextUpdate,nextSnapshot,nextPlayers]=await Promise.all([nextUpdateResponse.json(),nextSnapshotResponse.json(),nextPlayersResponse.json()]);if(nextUpdate.updatedAt&&nextUpdate.updatedAt!==previous){injurySnapshot=nextSnapshot;injuryUpdate=normalizeInjuryUpdate(nextUpdate,nextSnapshot);raw=applyInjurySnapshot(nextPlayers,nextSnapshot);render();const success=document.querySelector('#refreshStatus');if(success)success.textContent=`✓ Aggiornato · ${injurySummary(injuryUpdate)}`;return}}await wait(5000)}throw new Error('publish timeout')}catch(error){console.error('Aggiornamento infortuni non riuscito',error);status.textContent='Aggiornamento non riuscito · Riprova';button.disabled=false}}
function initBaselineEditor(){
  const inputs=[...document.querySelectorAll('[data-slot-baseline]')];
  const refresh=input=>{
    const budget=Number(document.querySelector('#budget').value),row=input?.closest('[data-slot-id]');
    if(row){
      const baselineValue=row.querySelector('[data-slot-baseline]').value;
      row.querySelector('[data-slot-baseline-pct]').textContent=formatPercentage(percentageOfBudget(baselineValue,budget));
      const slot=state.slots.find(item=>item.id===row.dataset.slotId),forecast=getForecast({...slot,originalPlannedBudget:baselineValue});
      row.querySelector('[data-slot-forecast]').textContent=forecast;
      row.querySelector('[data-slot-residual]').textContent=getResidual({...slot,originalPlannedBudget:baselineValue});
    }
    document.querySelectorAll('[data-slot-id]').forEach(item=>item.querySelector('[data-slot-forecast-pct]').textContent=formatPercentage(percentageOfBudget(item.querySelector('[data-slot-forecast]').textContent,budget)));
    const baseline=inputs.reduce((sum,item)=>sum+Number(item.value||0),0),forecast=[...document.querySelectorAll('[data-slot-forecast]')].reduce((sum,item)=>sum+Number(item.textContent||0),0);
    document.querySelector('[data-total-baseline]').textContent=baseline;
    document.querySelector('[data-total-forecast]').textContent=forecast;
    document.querySelector('[data-total-residual]').textContent=baseline-state.slots.reduce((sum,slot)=>sum+(slot.actualPurchasePrice!=null&&Number.isFinite(Number(slot.actualPurchasePrice))?Number(slot.actualPurchasePrice):0),0);
    document.querySelector('[data-total-baseline-pct]').textContent=formatPercentage(percentageOfBudget(baseline,budget));
    document.querySelector('[data-total-forecast-pct]').textContent=formatPercentage(percentageOfBudget(forecast,budget));
  };
  const persistBaseline=input=>{
    const value=input.value.trim(),slotId=input.closest('[data-slot-id]')?.dataset.slotId;
    try{
      if(value==='')throw new Error('Baseline richiesta');
      state.slots=updateSlotBaseline(state.slots,slotId,value);
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      save(false);
      refresh(input);
      return true;
    }catch(error){
      input.setCustomValidity(error.message);
      input.setAttribute('aria-invalid','true');
      return false;
    }
  };
  inputs.forEach(input=>{
    input.oninput=()=>persistBaseline(input);
    input.onchange=()=>{
      if(persistBaseline(input))return;
      const slot=state.slots.find(item=>item.id===input.closest('[data-slot-id]').dataset.slotId);
      input.value=slot.originalPlannedBudget;
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      refresh(input);
    };
  });
  document.querySelector('#budget').oninput=()=>refresh(inputs[0]);
  const countInputs=[...document.querySelectorAll('[data-alias-slots]')];
  const previewSlotTotal=()=>{document.querySelector('#size').value=countInputs.reduce((sum,input)=>sum+Number(input.value||0),0)};
  countInputs.forEach(input=>input.oninput=previewSlotTotal);
  initAliasDragAndDrop();
  let drag=null;
  const fillTo=target=>{
    const end=inputs.indexOf(target);
    if(!drag||end<0)return;
    inputs.forEach((input,index)=>{
      const selected=index>=Math.min(drag.start,end)&&index<=Math.max(drag.start,end);
      input.closest('.baseline-cell').classList.toggle('fill-preview',selected);
      if(selected){input.value=drag.value;persistBaseline(input)}
    });
  };
  document.querySelectorAll('.fill-handle').forEach((handle,index)=>handle.onpointerdown=event=>{
    event.preventDefault();
    drag={start:index,value:inputs[index].value};
    fillTo(inputs[index]);
  });
  document.onpointermove=event=>{
    if(!drag)return;
    const pointed=document.elementFromPoint(event.clientX,event.clientY);
    const target=pointed?.closest('[data-slot-baseline]')??pointed?.closest('[data-slot-id]')?.querySelector('[data-slot-baseline]');
    if(target)fillTo(target);
  };
  document.onpointerup=()=>{
    if(!drag)return;
    drag=null;
    document.querySelectorAll('.fill-preview').forEach(cell=>cell.classList.remove('fill-preview'));
  };
}
function initAliasDragAndDrop(){
  let draggedRole='';
  document.querySelectorAll('.role-brick[draggable="true"]').forEach(brick=>{
    brick.ondragstart=event=>{draggedRole=brick.dataset.mantraRole;brick.classList.add('dragging');event.dataTransfer.setData('text/plain',draggedRole);event.dataTransfer.effectAllowed='move'};
    brick.ondragend=()=>document.querySelectorAll('.dragging,.valid-drop').forEach(item=>item.classList.remove('dragging','valid-drop'));
  });
  document.querySelectorAll('[data-alias] .role-dropzone').forEach(zone=>{
    const tile=zone.closest('[data-alias]'),alias=tile.dataset.alias;
    if(!alias)return;
    zone.ondragover=event=>{if(draggedRole==='Por')return;event.preventDefault();event.dataTransfer.dropEffect='move';zone.classList.add('valid-drop')};
    zone.ondragleave=()=>zone.classList.remove('valid-drop');
    zone.ondrop=event=>{event.preventDefault();const role=draggedRole||event.dataTransfer.getData('text/plain');if(!role||role==='Por')return;state.aliasConfiguration=state.aliasConfiguration.map(item=>({...item,mantraRoles:item.alias===alias?[...item.mantraRoles.filter(value=>value!==role),role]:item.mantraRoles.filter(value=>value!==role)}));save()};
  });
  document.querySelectorAll('.alias-tile [data-alias-slots]:not(:disabled)').forEach(input=>input.onchange=()=>{
    const alias=input.closest('[data-alias]').dataset.alias,next=Number(input.value),configuration=state.aliasConfiguration.map(item=>item.alias===alias?{...item,slotCount:next}:item);
    try{const validated=validateAliasConfiguration(configuration,mantraRoleOptions,34).configuration;state.slots=reconcileAliasSlots(state.slots,validated,34);state.aliasConfiguration=validated;state.rosterSize=state.slots.length;save()}catch(error){alert(error.message);render()}
  });
}
function initAuctionDragAndDrop(){
  document.querySelectorAll('[data-auction-budget]').forEach(input=>{
    const slotId=input.closest('[data-slot-id]').dataset.slotId;
    const persist=()=>{
      const slot=state.slots.find(item=>item.id===slotId),value=input.value.trim();
      try{
        if(value==='')throw new Error('BDG richiesto');
        const next=Number(value);
        if(next===Number(slot.originalPlannedBudget)){input.setCustomValidity('');input.removeAttribute('aria-invalid');return true}
        state.slots=updateSlotBaseline(state.slots,slotId,value);
        input.setCustomValidity('');input.removeAttribute('aria-invalid');
        save(false);
        input.closest('.auction-slot-head').querySelector('[data-auction-forecast]').textContent=getForecast(state.slots.find(item=>item.id===slotId));
        return true;
      }catch(error){input.setCustomValidity(error.message);input.setAttribute('aria-invalid','true');return false}
    };
    const finalize=()=>{if(persist())return;input.value=state.slots.find(item=>item.id===slotId).originalPlannedBudget;input.setCustomValidity('');input.removeAttribute('aria-invalid')};
    input.addEventListener('input',persist);
    input.addEventListener('change',finalize);
    input.addEventListener('blur',finalize);
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();finalize();input.blur()}});
  });
  let draggedId='';
  document.querySelectorAll('.auction-player-card').forEach(card=>{
    card.addEventListener('dragstart',event=>{draggedId=card.dataset.playerId;card.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedId)});
    card.addEventListener('dragend',()=>{draggedId='';document.querySelectorAll('.dragging,.drop-target').forEach(item=>item.classList.remove('dragging','drop-target'))});
  });
  document.querySelectorAll('.auction-slot-track').forEach(track=>{
    const dropContext=()=>{const player=players().find(item=>String(item.id)===String(draggedId)),slotId=track.closest('[data-slot-id]').dataset.slotId,toSlot=slotId==='OUT'?{id:'OUT',category:'OUT'}:state.slots.find(item=>item.id===slotId);return {player,slotId,toSlot}};
    track.addEventListener('dragover',event=>{const {player,toSlot}=dropContext();if(!canDropAuctionPlayer(player,toSlot,state.market,state.slots))return;event.preventDefault();event.dataTransfer.dropEffect='move';document.querySelectorAll('.drop-target').forEach(item=>item.classList.remove('drop-target'));const target=event.target.closest('.auction-player-card');(target||track).classList.add('drop-target')});
    track.addEventListener('dragleave',event=>{if(!track.contains(event.relatedTarget))track.classList.remove('drop-target')});
    track.addEventListener('drop',event=>{
      event.preventDefault();const playerId=draggedId||event.dataTransfer.getData('text/plain'),{player,slotId,toSlot}=dropContext();
      if(String(player?.id)!==String(playerId)||!canDropAuctionPlayer(player,toSlot,state.market,state.slots))return;
      const target=event.target.closest('.auction-player-card');let index=target?Number(target.dataset.index):track.querySelectorAll('.auction-player-card').length;
      if(target&&event.clientX>target.getBoundingClientRect().left+target.getBoundingClientRect().width/2)index++;
      const rows=buildAuctionRows(players(),state.slots,state.auctionView,true),source=rows.find(row=>row.players.some(player=>player.id===playerId));
      const oldIndex=source?.players.findIndex(player=>player.id===playerId)??-1;if(source?.slot.id===slotId&&oldIndex<index)index--;
      state.auctionView=moveAuctionPlayer(state.auctionView,playerId,slotId,index,rows);save();
    });
  });
}
function render(){document.querySelector('header i').textContent=state.started?'ASTA LIVE':'STRATEGIA';const warning=loadIssues.length?`<div class="notice load-warning" role="alert"><b>Dati caricati solo in parte.</b> ${loadIssues.join(' · ')}. Puoi comunque aprire l’app e riprovare aggiornando la pagina.</div>`:'';document.querySelector('#app').innerHTML=warning+({cockpit,auction,strategy,quality,settings})[view]();if(view==='quality')document.querySelector('#refreshInjuries').onclick=refreshInjuries;if(view==='settings')document.querySelector('#backupFile').onchange=importBackup;if(view==='strategy'){document.querySelector('#formation').onchange=event=>document.querySelector('#formationSummary').innerHTML=formationSummary(event.target.value);initBaselineEditor()}if(view==='auction')initAuctionDragAndDrop()}
function showBackupStatus(message,error=false){const target=document.querySelector('#backupStatus');if(!target)return;target.textContent=message;target.classList.toggle('error',error)}
window.exportBackup=()=>{try{const backup=createBackup(localStorage.getItem(STORAGE_KEY)??JSON.stringify(state)),contents=JSON.stringify(backup,null,2),url=URL.createObjectURL(new Blob([contents],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=backupFilename();document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);showBackupStatus('Backup esportato correttamente.')}catch(error){showBackupStatus(error.message,true)}};
window.selectBackup=()=>document.querySelector('#backupFile')?.click();
async function importBackup(event){const input=event.target,file=input.files?.[0];input.value='';if(!file)return;try{if(!file.name.toLocaleLowerCase().endsWith('.json'))throw new Error('Seleziona un file con estensione .json.');const backup=parseBackup(await file.text());if(!confirm(`Importare il backup del ${new Date(backup.exportedAt).toLocaleString('it-IT')}? Lo stato corrente verrà sostituito.`)){showBackupStatus('Import annullato.');return}localStorage.setItem(STORAGE_KEY,JSON.stringify(backup.state));location.reload()}catch(error){showBackupStatus(`Import non riuscito: ${error.message}`,true)}}
window.showProContro=id=>{const p=raw.find(x=>x.id===id);if(!p)return;const modal=document.createElement('div');modal.className='modal';modal.onclick=e=>{if(e.target===modal)modal.remove()};modal.innerHTML=`<section class=card><div class=section-head><h2>${escapeHtml(p.name)} · ${escapeHtml(p.team)}</h2><button class="action secondary" aria-label=Chiudi>×</button></div><h3>PRO</h3><p>${escapeHtml(p.pro||'Non disponibile')}</p><h3>CONTRO</h3><p>${escapeHtml(p.contro||'Non disponibile')}</p></section>`;modal.querySelector('button').onclick=()=>modal.remove();document.body.append(modal)};
window.showInjury=id=>{const p=raw.find(x=>x.id===id);if(!p)return;const status=auctionInjuryStatus(p.status);if(!status.interactive)return;const modal=document.createElement('div');modal.className='modal injury-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',`Dettaglio indisponibilità di ${p.name}`);modal.onclick=e=>{if(e.target===modal)modal.remove()};modal.innerHTML=`<section class=card><div class=section-head><h2>${escapeHtml(p.name)} · Indisponibilità</h2><button type=button class="action secondary" aria-label=Chiudi>×</button></div><p>${escapeHtml(status.detail)}</p></section>`;modal.querySelector('button').onclick=()=>modal.remove();document.body.append(modal)};
window.openPressureDetail=index=>{
  const group=pressureGroups[index],panel=document.querySelector('.pressure-detail');
  if(!group||!panel)return;
  const rows=group.players.map(player=>{const available=(state.market[player.id]?.marketStatus??'AVAILABLE')==='AVAILABLE';return `<tr class="${available?'':'purchased'}"><td><b>${escapeHtml(player.name)}</b></td><td>${escapeHtml(player.team||'—')}</td><td><span class="pressure-status ${available?'available':'acquired'}">${available?'Disponibile':'Acquistato'}</span></td></tr>`}).join('');
  panel.innerHTML=`<div class=pressure-detail-head><h3>${escapeHtml(group.label)} — ${group.available} disponibili / ${group.total} originali</h3><button type=button onclick="closePressureDetail()" aria-label="Chiudi dettaglio">×</button></div><div class=pressure-player-list><table><thead><tr><th>Nome giocatore</th><th>Squadra</th><th>Stato</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  panel.classList.add('open');
};
window.closePressureDetail=()=>document.querySelector('.pressure-detail')?.classList.remove('open');
window.setPressurePage=page=>{pressurePage=page==='mantra'?'mantra':'tier';render()};window.resetOne=id=>{state=resetPlayer(state,id);save()};window.goAuction=()=>{view='auction';document.querySelectorAll('nav button').forEach(button=>button.classList.toggle('active',button.dataset.view==='auction'));render()};
function freezeCurrentAuctionSlot(id){const rows=buildAuctionRows(players(),state.slots,state.auctionView,true),slotId=auctionPlayerSlotId(rows,id);state.auctionView=pinAuctionPlayerToCurrentSlot(state.auctionView,id,rows);return slotId}
window.sold=id=>{freezeCurrentAuctionSlot(id);state.started=true;state.market[id]={...state.market[id],marketStatus:'SOLD'};save()};window.buy=id=>{const p=players().find(x=>x.id===id);if(!p)return;const price=Number(prompt(`Prezzo per ${p.name}?`,p.auctionValue));if(!Number.isFinite(price)||price<1)return;const slotId=freezeCurrentAuctionSlot(id),slot=state.slots.find(item=>item.id===slotId);state.market[id]={marketStatus:'MY TEAM',actualPurchasePrice:price,assignedSlot:slot?{id:slot.id,alias:slot.category}:null,assignedSlotId:slot?.id??null,slotAssignmentStatus:slot?'ASSIGNED':'OVERFLOW'};state.started=true;const {overflow}=save();if(overflow.includes(String(id)))alert(`Acquisto registrato, ma lo slot ${slotId||p.strategicAlias||'compatibile'} non è disponibile: giocatore in overflow.`)};window.configure=()=>{const budget=Number(document.querySelector('#budget').value);const edits=Object.fromEntries([...document.querySelectorAll('[data-slot-id]')].map(row=>{const slot=state.slots.find(item=>item.id===row.dataset.slotId);return [row.dataset.slotId,{category:row.querySelector('[data-slot-role]')?.value??slot.category,originalPlannedBudget:row.querySelector('[data-slot-baseline]').value}]}));try{state.slots=reconcileAliasSlots(updateSlotStrategy(state.slots,edits),state.aliasConfiguration)}catch(error){alert(error.message);render();return}state.budget=budget;state.rosterSize=state.slots.length;state.formation=document.querySelector('#formation').value;save()};window.resetAll=()=>{if(!confirm('Vuoi davvero resettare tutte le impostazioni? Configurazione, acquisti e stati del mercato verranno cancellati.'))return;localStorage.removeItem(STORAGE_KEY);location.reload()};render();
