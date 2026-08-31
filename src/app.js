import {CATEGORY_PRIORITY,DEFAULT_SLOT_COUNTS,rankPlayers,assignTiers,budgetSummary,slotPlanSummary,tierDepletion,updateForecasts,updateSlotStrategy,getForecast,percentageOfBudget,formatPercentage,areaVariance,slotCountsFromSlots,reconcileSlotCounts} from './domain.js';
import {getFormation,getFormationIds} from './mantraFormations.js';
import {MARKET_COLUMNS,createMarketControls} from './market-filters.js';
let marketControls=createMarketControls();
const cacheKey=Date.now();
const loadIssues=[];
async function fetchJson(path,fallback,label){
  try{
    const response=await fetch(`${path}?v=${cacheKey}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch(error){
    loadIssues.push(`${label}: ${error.message}`);
    return fallback;
  }
}
const [raw,injuryUpdate]=await Promise.all([
  fetchJson('./data/players.json',[],'Elenco giocatori'),
  Promise.all([
    fetchJson('./data/infortuni.json',{},'Snapshot infortuni'),
    fetchJson('./data/infortuni_update.json',{},'Aggiornamento infortuni')
  ]).then(([,update])=>update)
]);
const refreshEndpoint=document.querySelector('meta[name="injury-refresh-endpoint"]')?.content?.trim()||'';
const defaults={budget:1000,rosterSize:34,formation:'3-4-2-1',started:false,slots:[],slotCounts:{...DEFAULT_SLOT_COUNTS},market:{}};
let persisted={};
try{persisted=JSON.parse(localStorage.getItem('mantra-auction')||'{}')}catch(error){loadIssues.push('Configurazione salvata non valida: sono stati ripristinati i valori iniziali')}
if(!persisted||typeof persisted!=='object'||Array.isArray(persisted))persisted={};
let state=Object.assign({},defaults,persisted);
if(!Array.isArray(state.slots))state.slots=[];
if(!state.market||typeof state.market!=='object'||Array.isArray(state.market))state.market={};
const counts={...DEFAULT_SLOT_COUNTS};
if(!state.slots.length) state.slots=Object.entries(counts).flatMap(([c,n])=>Array.from({length:n},(_,i)=>({id:`${c}${i+1}`,category:c,priority:i===0?'Key':i<3?'Starter':'Reserve',originalPlannedBudget:[45,30,20,12,8,5,3,1][i]??1,playerId:null,actualPurchasePrice:null})));
state.slots=updateForecasts(state.slots);
state.slotCounts=slotCountsFromSlots(state.slots);
state.rosterSize=state.slots.length;
function players(){return CATEGORY_PRIORITY.flatMap(cat=>assignTiers(rankPlayers(raw.filter(p=>p.rankingCategory===cat)),state.slots.filter(s=>s.category===cat).length));}
const save=()=>{localStorage.setItem('mantra-auction',JSON.stringify(state));render()};let view='cockpit';
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));render()});
function cockpit(){const b=budgetSummary(state.budget,state.slots),ps=players(),dep=tierDepletion(ps,state.market);return `<div class=eyebrow>Live strategy</div><h1>Buonasera, Mister.</h1><div class=grid>${[['Budget iniziale',b.budget],['Speso',b.spent],['Rimanente',b.remaining],['Varianza',b.variance]].map((x,i)=>`<div class="card metric"><label>${x[0]}</label><strong class=${i===2?'lime':''}>${x[1]} <small>cr</small></strong></div>`).join('')}<div class="card wide"><div class=section-head><h2>Rosa</h2><span class=pill>${state.slots.filter(s=>s.playerId).length} / ${state.slots.length}</span></div><p class=muted>${state.slots.filter(s=>!s.playerId).length} slot aperti · ${state.formation}</p></div><div class="card wide"><div class=section-head><h2>Pressione mercato</h2><span class=muted>Disponibili / originali</span></div><div class=pressure>${dep.slice(0,12).map(x=>`<div class=tier><span class=muted>${x.category} · Tier ${x.tier}</span><b>${x.available} / ${x.total}</b><div class=bar><i style="width:${100*x.available/x.total}%"></i></div></div>`).join('')}</div></div></div><div class=section><div class=section-head><h2>Slot prioritari</h2><button class=action onclick="goMarket()">Apri mercato</button></div>${slotTable(state.slots.slice(0,10))}</div>`}
function signed(value){return value>0?`+${value}`:`${value}`}
function varianceClass(value){return value<0?'variance-saving':value>0?'variance-overspend':'variance-even'}
function slotRow(s,editable){
  const completed=Boolean(s.playerId),roleFixed=s.id.startsWith('POR')||completed;
  const role=editable&&!roleFixed?`<select data-slot-role aria-label="Ruolo ${s.id}">${CATEGORY_PRIORITY.slice(1).map(category=>`<option${category===s.category?' selected':''}>${category}</option>`).join('')}</select>`:`<span class="fixed-role">${s.category}${s.id.startsWith('POR')?' <small>fisso</small>':completed?' <small>acquistato</small>':''}</span>`;
  const baseline=editable?`<div class="baseline-cell"><input data-slot-baseline aria-label="Baseline ${s.id}" type="text" inputmode="decimal" value="${s.originalPlannedBudget}"><button class="fill-handle" type="button" aria-label="Trascina per copiare la baseline di ${s.id}" title="Trascina per copiare il valore"></button></div>`:s.originalPlannedBudget;
  const forecast=getForecast(s);
  return `<tr data-slot-id="${s.id}"><td><b>${s.id}</b></td><td>${role}</td><td>${s.priority}</td><td data-slot-baseline-pct>${formatPercentage(percentageOfBudget(s.originalPlannedBudget,state.budget))}</td><td>${baseline}</td><td data-slot-forecast>${forecast}</td><td data-slot-forecast-pct>${formatPercentage(percentageOfBudget(forecast,state.budget))}</td><td>${completed?(raw.find(p=>p.id===s.playerId)?.name??s.playerId)+' · '+s.actualPurchasePrice:'—'}</td></tr>`;
}
function slotTable(slots,editable=false){
  const recap=slotPlanSummary(slots,state.budget);
  const body=editable?CATEGORY_PRIORITY.map(category=>{const grouped=slots.filter(slot=>slot.category===category),variance=areaVariance(slots,category);if(!grouped.length)return '';return `<tr class="area-row"><th colspan="7">${category==='WA'?'W/A':category}</th><th>Δ Baseline <strong class="${varianceClass(variance)}">${signed(variance)}</strong></th></tr>${grouped.map(s=>slotRow(s,true)).join('')}`}).join(''):slots.map(s=>slotRow(s,false)).join('');
  const totals=editable?`<tfoot><tr class="totals-row"><th colspan="3">Totali</th><th data-total-baseline-pct>${formatPercentage(recap.baselinePct)}</th><th data-total-baseline>${recap.planned}</th><th data-total-forecast>${recap.forecast}</th><th data-total-forecast-pct>${formatPercentage(recap.forecastPct)}</th><th><span class="actual-total">Actual ${recap.actual}</span><br>Δ <strong class="${varianceClass(recap.completedVariance)}" data-total-variance>${signed(recap.completedVariance)}</strong></th></tr></tfoot>`:'';
  return `<div class="slot-table-wrap${editable?' strategy-slot-table-wrap':''}"><table class="slot-table"><thead><tr><th>Slot</th><th>Ruolo</th><th>Priorità</th><th>Baseline %</th><th>Baseline</th><th>Forecast</th><th>Forecast %</th><th>Actual</th></tr></thead><tbody>${body}</tbody>${totals}</table></div>`;
}
const selected=(value,current)=>`${value===current?' selected':''}`;
const uniqueValues=key=>[...new Set(players().map(MARKET_COLUMNS[key].value).filter(value=>value!=null&&value!==''))].sort((a,b)=>MARKET_COLUMNS[key].numeric?Number(a)-Number(b):String(a).localeCompare(String(b),'it',{numeric:true}));
const teamSelection=()=>marketControls.columns.team?.selected;
function market(){const teams=uniqueValues('team'),quickTeam=teamSelection()?.length===1?teamSelection()[0]:'';return `<div class=eyebrow>Selezione giocatori</div><h1>Mercato live</h1><div class=filters><input id=q value="${marketControls.query}" placeholder="Cerca giocatore o squadra…"><select id=cat><option value="">Tutti i ruoli</option>${CATEGORY_PRIORITY.map(x=>`<option${selected(x,marketControls.category)}>${x}</option>`).join('')}</select><select id=ms><option value="AVAILABLE"${selected('AVAILABLE',marketControls.availability)}>Disponibili</option><option value=""${selected('',marketControls.availability)}>Tutti gli stati</option><option${selected('SOLD',marketControls.availability)}>SOLD</option><option${selected('MY TEAM',marketControls.availability)}>MY TEAM</option></select><select id=team><option value="">Tutte le squadre</option>${teams.map(x=>`<option${selected(String(x),String(quickTeam))}>${x}</option>`).join('')}</select></div><div id=marketTable>${playerTable(applyMarketPipeline(players()))}</div>`}
const columnFiltered=key=>{const filter=marketControls.columns[key];return Boolean(filter&&(filter.selected||filter.operator))};
const columnHeader=key=>{const column=MARKET_COLUMNS[key],sort=marketControls.sort?.key===key?(marketControls.sort.direction==='asc'?'↑':'↓'):'';return `<button type=button class="excel-filter-trigger${columnFiltered(key)?' filtered':''}" data-filter-menu="${key}" aria-expanded="${marketControls.openMenu===key}"><span>${column.label}</span><i>${sort||'▾'}</i></button>`};
function filterPopup(key){if(marketControls.openMenu!==key)return '';const column=MARKET_COLUMNS[key],values=uniqueValues(key),active=marketControls.columns[key]?.selected??values.map(String),numeric=column.numeric;return `<div class=excel-filter-menu data-filter-popup="${key}"><button data-menu-sort=asc>${numeric?'Ordina dal più piccolo':'Ordina A → Z'}</button><button data-menu-sort=desc>${numeric?'Ordina dal più grande':'Ordina Z → A'}</button><hr><input data-value-search placeholder="Cerca…" aria-label="Cerca valori"><label class=check-all><input type=checkbox data-select-all ${active.length===values.length?'checked':''}> Seleziona tutto</label><div class=value-list>${values.map(value=>`<label data-value-label><input type=checkbox value="${value}" ${active.includes(String(value))?'checked':''}> ${value}</label>`).join('')}</div>${numeric?`<details><summary>Filtri numerici</summary><div class=numeric-filter><select data-number-op><option value="">Seleziona…</option><option value=gt>Maggiore di</option><option value=lt>Minore di</option><option value=between>Tra</option></select><input data-number-a type=number placeholder="Valore"><input data-number-b type=number placeholder="Secondo valore"></div></details>`:''}<hr><div class=menu-actions><button class=action data-apply-filter>Applica</button><button data-clear-filter>Cancella filtro</button></div></div>`}
function playerTable(ps){return `<div class=market-table-wrap><table class=market-table><thead><tr><th>#</th>${Object.keys(MARKET_COLUMNS).map(key=>`<th>${columnHeader(key)}${filterPopup(key)}</th>`).join('')}<th>Azioni</th></tr></thead><tbody>${ps.slice(0,180).map(p=>{let st=state.market[p.id]?.marketStatus||'AVAILABLE';return `<tr class=${st==='AVAILABLE'?'':'sold'}><td>${p.rankingPosition}</td><td><b>${p.name}</b>${p.cups?`<br><span class=muted>${p.cups}</span>`:''}</td><td>${p.team}</td><td>${p.roles}<br><span class=pill>${p.rankingCategory}</span></td><td>${p.tier??'—'}</td><td><b>${p.auctionValue}</b></td><td>${p.quotation}</td><td>${p.hypeFactor??'—'}</td><td>${p.age??'—'}</td><td>${p.actPg??'—'} / ${p.actMf??'—'}</td><td>${p.status}</td><td>${st==='AVAILABLE'?`<button class="action secondary" onclick="sold('${p.id}')">SOLD</button> <button class=action onclick="buy('${p.id}')">+ MIA</button>`:st}</td></tr>`}).join('')}</tbody></table></div>`}
function applyMarketPipeline(source){const q=marketControls.query.trim().toLocaleLowerCase('it');let result=source.filter(p=>(!q||`${p.name} ${p.team}`.toLocaleLowerCase('it').includes(q))&&(!marketControls.category||p.rankingCategory===marketControls.category)&&(!marketControls.availability||(state.market[p.id]?.marketStatus||'AVAILABLE')===marketControls.availability)&&Object.entries(marketControls.columns).every(([key,filter])=>{const value=MARKET_COLUMNS[key].value(p);if(filter.selected&&!filter.selected.includes(String(value)))return false;if(!filter.operator)return true;const number=Number(value);return filter.operator==='gt'?number>filter.a:filter.operator==='lt'?number<filter.a:number>=filter.a&&number<=filter.b}));if(!marketControls.sort)return result;const {key,direction}=marketControls.sort,get=MARKET_COLUMNS[key].value,sign=direction==='asc'?1:-1;return result.map((p,index)=>({p,index})).sort((a,b)=>{const av=get(a.p),bv=get(b.p),an=av==null||av===''||av==='N/A',bn=bv==null||bv===''||bv==='N/A';if(an!==bn)return an?1:-1;if(an&&bn)return a.index-b.index;const comparison=MARKET_COLUMNS[key].numeric?Number(av)-Number(bv):String(av).localeCompare(String(bv),'it',{numeric:true,sensitivity:'base'});return comparison?comparison*sign:a.index-b.index}).map(x=>x.p)}
function formationSummary(id){const formation=getFormation(id);if(!formation)return `<p class=muted>Modulo non disponibile</p>`;const names={GK:"PORTA",DEF:"DIFESA",MID:"CENTROCAMPO",AM:"TREQUARTI",ATT:"ATTACCO"};return `<div class=formation-summary><b>${formation.label}</b>${formation.lines.map(group=>`<div><span>${names[group.id]}</span><strong>${group.positions.map(position=>position.optionalLabel).join(" · ")}</strong></div>`).join("")}</div>`}
function slotCountControls(){return `<div class="slot-counts"><div class="slot-counts-head"><b>Slot per ruolo</b><span class=muted>POR fisso a 3 · totale massimo 34</span></div>${CATEGORY_PRIORITY.map(category=>`<label>${category==='WA'?'W/A':category}<br><input data-slot-count="${category}" type="number" min="${category==='POR'?3:0}" max="${category==='POR'?3:31}" step="1" value="${state.slotCounts[category]??0}" ${category==='POR'?'disabled':''}></label>`).join('')}</div>`}
function strategy(){return `<div class=eyebrow>Baseline configurabile</div><h1>Strategia d'asta</h1><div class="card editor"><label>Budget<br><input id=budget type=number value=${state.budget}></label><label>Rosa<br><input id=size type=number min=3 max=34 value=${state.rosterSize} readonly></label><label>Modulo<br><select id=formation>${getFormationIds().map(id=>`<option value="${id}"${id===state.formation?" selected":""}>${getFormation(id).label}</option>`).join("")}</select></label><label><br><button class=action onclick=configure()>Salva configurazione</button></label>${slotCountControls()}</div><div id=formationSummary class="card tactical-card">${formationSummary(state.formation)}</div><div class=section><div class=section-head><div><h2>Piano slot</h2><p class=muted>Il forecast è calcolato in tempo reale: usa l'Actual per gli slot acquistati e la Baseline per quelli aperti. Le variazioni di ruolo sono disponibili solo per gli slot aperti; i tre POR sono fissi.</p></div></div>${slotTable(state.slots,true)}</div><div class="card reset-panel section"><div><h2>Ripristina impostazioni</h2><p class=muted>Cancella configurazione, acquisti e stati del mercato, riportando l'app ai valori iniziali.</p></div><button class="action danger-action" onclick=resetAll()>Resetta tutto</button></div>`}
const changeLabel={NEW_INJURY:'NUOVO',RECOVERED:'RIENTRATO',INJURY_UPDATED:'AGGIORNATO',RETURN_UPDATED:'AGGIORNATO',UNCHANGED:'INVARIATO'};
function quality(){const missingAge=raw.filter(p=>p.age==null).length,missingPc=raw.filter(p=>!p.pro||!p.contro).length,uncat=raw.filter(p=>!p.rankingCategory).length,u=injuryUpdate,diagnostics=[...(u.unmatchedRecords||[]).map(x=>`UNMATCHED · ${x.name} · ${x.team||'squadra ignota'}`),...(u.ambiguousRecords||[]).map(x=>`AMBIGUOUS · ${x.name} · ${x.team||'squadra ignota'} · candidati: ${(x.candidateIds||[]).join(', ')}`)];return `<div class=eyebrow>Import diagnostics</div><h1>Data quality</h1><div class=grid>${[['Giocatori importati',raw.length],['Età mancanti',missingAge],['Pro / Contro mancanti',missingPc],['Categoria irrisolta',uncat]].map(x=>`<div class="card metric"><label>${x[0]}</label><strong>${x[1]}</strong></div>`).join('')}</div><section class="card section injury-refresh"><div class=section-head><div><h2>Aggiornamento infortuni</h2><p class=muted>Fonte unica: Fantacalcio · ultimo aggiornamento ${u.updatedAt?new Date(u.updatedAt).toLocaleString('it-IT'):'mai'}</p></div><button id=refreshInjuries class=action ${refreshEndpoint?'':'disabled'} ${refreshEndpoint?'':'disabled'}>Aggiorna infortuni</button></div><p id=refreshStatus class=muted>${refreshEndpoint?'Pronto.':'Avvio web non configurato: serve l’endpoint autenticato descritto nella documentazione; nessuna credenziale è esposta nel browser.'}</p><div class=grid>${[['Infortunati attuali',u.currentInjuries],['Matched',u.matched],['Unmatched',u.unmatched],['Ambiguous',u.ambiguous],['Senza rientro',u.missingExpectedReturn],['Nuovi',u.newInjuries],['Rientrati',u.recovered],['Aggiornati',(u.injuryUpdated||0)+(u.returnUpdated||0)]].map(x=>`<div class="metric"><label>${x[0]}</label><strong>${x[1]??0}</strong></div>`).join('')}</div>${(u.errors||[]).map(x=>`<p class=danger>${x}</p>`).join('')}${diagnostics.length?`<h3>Matching da verificare</h3><ul>${diagnostics.map(x=>`<li>${x}</li>`).join('')}</ul>`:''}<h3>Ultime variazioni</h3><div class=changes>${(u.changes||[]).filter(x=>x.type!=='UNCHANGED').map(x=>`<div><span class="change ${x.type}">${changeLabel[x.type]||x.type}</span><b>${x.name}</b><span>${x.team||'—'}</span>${x.type==='RETURN_UPDATED'?`<small>${x.before?.expectedReturn||'—'} → ${x.after?.expectedReturn||'—'}</small>`:''}</div>`).join('')||'<p class=muted>Nessuna variazione disponibile.</p>'}</div></section><div class="notice section">Gli arricchimenti non associabili con certezza restano vuoti e richiedono revisione manuale.</div>`}
async function refreshInjuries(){const button=document.querySelector('#refreshInjuries'),status=document.querySelector('#refreshStatus'),previous=injuryUpdate.updatedAt;button.disabled=true;try{status.textContent='Avvio aggiornamento…';const response=await fetch(refreshEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'include'});if(!response.ok)throw new Error(`endpoint HTTP ${response.status}`);status.textContent='Scraping in corso…';for(let attempt=0;attempt<60;attempt++){await new Promise(resolve=>setTimeout(resolve,5000));status.textContent=attempt<5?'Scraping in corso…':'Aggiornamento dati…';const next=await fetch(`./data/infortuni_update.json?v=${Date.now()}`,{cache:'no-store'}).then(r=>r.json());if(next.updatedAt&&next.updatedAt!==previous){status.textContent=next.result==='SUCCESS'?'Aggiornamento completato':'Aggiornamento fallito';setTimeout(()=>location.reload(),800);return}}throw new Error('timeout in attesa del workflow')}catch(error){status.textContent=`Aggiornamento fallito: ${error.message}`;button.disabled=false}}
function initBaselineEditor(){
  const inputs=[...document.querySelectorAll('[data-slot-baseline]')];
  const refresh=input=>{
    const budget=Number(document.querySelector('#budget').value),row=input?.closest('[data-slot-id]');
    if(row){
      const baselineValue=row.querySelector('[data-slot-baseline]').value;
      row.querySelector('[data-slot-baseline-pct]').textContent=formatPercentage(percentageOfBudget(baselineValue,budget));
      const slot=state.slots.find(item=>item.id===row.dataset.slotId),forecast=getForecast({...slot,originalPlannedBudget:baselineValue});
      row.querySelector('[data-slot-forecast]').textContent=forecast;
    }
    document.querySelectorAll('[data-slot-id]').forEach(item=>item.querySelector('[data-slot-forecast-pct]').textContent=formatPercentage(percentageOfBudget(item.querySelector('[data-slot-forecast]').textContent,budget)));
    const baseline=inputs.reduce((sum,item)=>sum+Number(item.value||0),0),forecast=[...document.querySelectorAll('[data-slot-forecast]')].reduce((sum,item)=>sum+Number(item.textContent||0),0);
    document.querySelector('[data-total-baseline]').textContent=baseline;
    document.querySelector('[data-total-forecast]').textContent=forecast;
    document.querySelector('[data-total-baseline-pct]').textContent=formatPercentage(percentageOfBudget(baseline,budget));
    document.querySelector('[data-total-forecast-pct]').textContent=formatPercentage(percentageOfBudget(forecast,budget));
  };
  inputs.forEach(input=>input.oninput=()=>refresh(input));
  document.querySelector('#budget').oninput=()=>refresh(inputs[0]);
  const countInputs=[...document.querySelectorAll('[data-slot-count]')];
  const previewSlotTotal=()=>{document.querySelector('#size').value=countInputs.reduce((sum,input)=>sum+Number(input.value||0),0)};
  countInputs.forEach(input=>{input.oninput=previewSlotTotal;input.onchange=()=>{previewSlotTotal();window.configure()}});
  let drag=null;
  const fillTo=target=>{
    const end=inputs.indexOf(target);
    if(!drag||end<0)return;
    inputs.forEach((input,index)=>{
      const selected=index>=Math.min(drag.start,end)&&index<=Math.max(drag.start,end);
      input.closest('.baseline-cell').classList.toggle('fill-preview',selected);
      if(selected){input.value=drag.value;refresh(input)}
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
function initMarketFilters(){
  const refreshTable=()=>{document.querySelector('#marketTable').innerHTML=playerTable(applyMarketPipeline(players()));const team=document.querySelector('#team'),active=teamSelection();if(team)team.value=active?.length===1?active[0]:'';bindTableControls()};
  ['q','cat','ms'].forEach(id=>document.querySelector('#'+id).oninput=event=>{marketControls[{q:'query',cat:'category',ms:'availability'}[id]]=event.target.value;refreshTable()});
  document.querySelector('#team').oninput=event=>{if(event.target.value)marketControls.columns.team={selected:[event.target.value]};else delete marketControls.columns.team;refreshTable()};
  function bindTableControls(){
    document.querySelectorAll('[data-filter-menu]').forEach(button=>button.onclick=event=>{event.stopPropagation();const key=button.dataset.filterMenu;marketControls.openMenu=marketControls.openMenu===key?null:key;refreshTable()});
    const popup=document.querySelector('[data-filter-popup]');if(!popup)return;popup.onclick=event=>event.stopPropagation();const key=popup.dataset.filterPopup;
    popup.querySelectorAll('[data-menu-sort]').forEach(button=>button.onclick=()=>{marketControls.sort={key,direction:button.dataset.menuSort};marketControls.openMenu=null;refreshTable()});
    popup.querySelector('[data-value-search]').oninput=event=>popup.querySelectorAll('[data-value-label]').forEach(label=>label.hidden=!label.textContent.toLocaleLowerCase('it').includes(event.target.value.toLocaleLowerCase('it')));
    popup.querySelector('[data-select-all]').onchange=event=>popup.querySelectorAll('[data-value-label] input').forEach(input=>input.checked=event.target.checked);
    popup.querySelector('[data-apply-filter]').onclick=()=>{const values=uniqueValues(key),checked=[...popup.querySelectorAll('[data-value-label] input:checked')].map(input=>input.value),operator=popup.querySelector('[data-number-op]')?.value,a=Number(popup.querySelector('[data-number-a]')?.value),b=Number(popup.querySelector('[data-number-b]')?.value),filter={};if(checked.length!==values.length)filter.selected=checked;if(operator)Object.assign(filter,{operator,a,b});if(Object.keys(filter).length)marketControls.columns[key]=filter;else delete marketControls.columns[key];marketControls.openMenu=null;refreshTable()};
    popup.querySelector('[data-clear-filter]').onclick=()=>{delete marketControls.columns[key];marketControls.openMenu=null;refreshTable()};
  }
  document.onclick=()=>{if(marketControls.openMenu){marketControls.openMenu=null;refreshTable()}};
  bindTableControls();
}
function render(){document.querySelector('header i').textContent=state.started?'ASTA LIVE':'STRATEGIA';const warning=loadIssues.length?`<div class="notice load-warning" role="alert"><b>Dati caricati solo in parte.</b> ${loadIssues.join(' · ')}. Puoi comunque aprire l’app e riprovare aggiornando la pagina.</div>`:'';document.querySelector('#app').innerHTML=warning+({cockpit,market,strategy,quality})[view]();if(view==='quality'&&refreshEndpoint)document.querySelector('#refreshInjuries').onclick=refreshInjuries;if(view==='strategy'){document.querySelector('#formation').onchange=event=>document.querySelector('#formationSummary').innerHTML=formationSummary(event.target.value);initBaselineEditor()}if(view==='market')initMarketFilters()}
window.goMarket=()=>{view='market';render()};window.sold=id=>{state.started=true;state.market[id]={marketStatus:'SOLD'};save()};window.buy=id=>{const p=raw.find(x=>x.id===id),open=state.slots.filter(s=>!s.playerId&&s.category===p.rankingCategory);if(!open.length)return alert('Nessuno slot compatibile aperto');const price=Number(prompt(`Prezzo per ${p.name}?`,p.auctionValue));if(!Number.isFinite(price)||price<1)return;const slot=open[0];slot.playerId=id;slot.actualPurchasePrice=price;state.market[id]={marketStatus:'MY TEAM'};state.started=true;save()};window.configure=()=>{const budget=Number(document.querySelector('#budget').value);const requestedCounts=Object.fromEntries(CATEGORY_PRIORITY.map(category=>[category,Number(document.querySelector(`[data-slot-count="${category}"]`).value)]));const edits=Object.fromEntries([...document.querySelectorAll('[data-slot-id]')].map(row=>{const slot=state.slots.find(item=>item.id===row.dataset.slotId);return [row.dataset.slotId,{category:row.querySelector('[data-slot-role]')?.value??slot.category,originalPlannedBudget:row.querySelector('[data-slot-baseline]').value}]}));try{let updatedSlots=updateSlotStrategy(state.slots,edits);const countsChanged=CATEGORY_PRIORITY.some(category=>requestedCounts[category]!==state.slotCounts[category]);if(countsChanged){updatedSlots=reconcileSlotCounts(updatedSlots,requestedCounts,34);state.slotCounts={...requestedCounts}}else state.slotCounts=slotCountsFromSlots(updatedSlots);state.slots=updatedSlots}catch(error){alert(error.message);render();return}state.budget=budget;state.rosterSize=state.slots.length;state.formation=document.querySelector('#formation').value;save()};window.resetAll=()=>{if(!confirm('Vuoi davvero resettare tutte le impostazioni? Configurazione, acquisti e stati del mercato verranno cancellati.'))return;localStorage.removeItem('mantra-auction');location.reload()};render();
