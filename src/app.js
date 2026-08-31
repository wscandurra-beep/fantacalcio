import {CATEGORY_PRIORITY,DEFAULT_SLOT_COUNTS,rankPlayers,assignTiers,budgetSummary,slotPlanSummary,tierDepletion,mantraRoleDepletion,updateForecasts,updateSlotStrategy,getForecast,percentageOfBudget,formatPercentage,areaVariance,slotCountsFromSlots,reconcileSlotCounts} from './domain.js';
import {getFormation,getFormationIds} from './mantraFormations.js';
import {applyInjurySnapshot,formatItalianDate,normalizeInjuryUpdate} from './injury-data.js';
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
let [raw,injurySnapshot,injuryUpdate]=await Promise.all([
  fetchJson('./data/players.json',[],'Elenco giocatori'),
  fetchJson('./data/infortuni.json',{},'Snapshot infortuni'),
  fetchJson('./data/infortuni_update.json',{},'Aggiornamento infortuni')
]);
raw=applyInjurySnapshot(raw,injurySnapshot);
injuryUpdate=normalizeInjuryUpdate(injuryUpdate,injurySnapshot);
const configuredEndpoint=document.querySelector('meta[name="injury-refresh-endpoint"]')?.content?.trim()||'';
const refreshEndpoint=configuredEndpoint.startsWith('http')?configuredEndpoint.replace(/\/$/,''):'';
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
const emptyColumnFilters=()=>({name:'',roles:[],tiers:[],auctionMin:'',auctionMax:'',quotationMin:'',quotationMax:'',hypeMin:'',hypeMax:'',ageMin:'',ageMax:'',pgMin:'',pgMax:'',mfMin:'',mfMax:'',statuses:[]});
let marketControls={query:'',category:'',availability:'AVAILABLE',team:'',columns:emptyColumnFilters(),sort:null};
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
function cockpit(){const b=budgetSummary(state.budget,state.slots),ps=players();return `<div class=eyebrow>Live strategy</div><h1>Buonasera, Mister.</h1><div class=grid>${[['Budget iniziale',b.budget],['Speso',b.spent],['Rimanente',b.remaining],['Varianza',b.variance]].map((x,i)=>`<div class="card metric"><label>${x[0]}</label><strong class=${i===2?'lime':''}>${x[1]} <small>cr</small></strong></div>`).join('')}<div class="card wide"><div class=section-head><h2>Rosa</h2><span class=pill>${state.slots.filter(s=>s.playerId).length} / ${state.slots.length}</span></div><p class=muted>${state.slots.filter(s=>!s.playerId).length} slot aperti · ${state.formation}</p></div>${marketPressure(ps)}</div><div class=section><div class=section-head><h2>Slot prioritari</h2><button class=action onclick="goMarket()">Apri mercato</button></div>${slotTable(state.slots,false,true)}</div>`}
function signed(value){return value>0?`+${value}`:`${value}`}
function varianceClass(value){return value<0?'variance-saving':value>0?'variance-overspend':'variance-even'}
function slotRow(s,editable){
  const completed=Boolean(s.playerId),roleFixed=s.id.startsWith('POR')||completed;
  const role=editable&&!roleFixed?`<select data-slot-role aria-label="Ruolo ${s.id}">${CATEGORY_PRIORITY.slice(1).map(category=>`<option${category===s.category?' selected':''}>${category}</option>`).join('')}</select>`:`<span class="fixed-role">${s.category}${s.id.startsWith('POR')?' <small>fisso</small>':completed?' <small>acquistato</small>':''}</span>`;
  const baseline=editable?`<div class="baseline-cell"><input data-slot-baseline aria-label="Baseline ${s.id}" type="text" inputmode="decimal" value="${s.originalPlannedBudget}"><button class="fill-handle" type="button" aria-label="Trascina per copiare la baseline di ${s.id}" title="Trascina per copiare il valore"></button></div>`:s.originalPlannedBudget;
  const forecast=getForecast(s);
  return `<tr data-slot-id="${s.id}"><td><b>${s.id}</b></td><td>${role}</td><td>${s.priority}</td><td data-slot-baseline-pct>${formatPercentage(percentageOfBudget(s.originalPlannedBudget,state.budget))}</td><td>${baseline}</td><td data-slot-forecast>${forecast}</td><td data-slot-forecast-pct>${formatPercentage(percentageOfBudget(forecast,state.budget))}</td><td>${completed?(raw.find(p=>p.id===s.playerId)?.name??s.playerId)+' · '+s.actualPurchasePrice:'—'}</td></tr>`;
}
function slotTable(slots,editable=false,priority=false){
  const recap=slotPlanSummary(slots,state.budget);
  const body=editable?CATEGORY_PRIORITY.map(category=>{const grouped=slots.filter(slot=>slot.category===category),variance=areaVariance(slots,category);if(!grouped.length)return '';return `<tr class="area-row"><th colspan="7">${category==='WA'?'W/A':category}</th><th>Δ Baseline <strong class="${varianceClass(variance)}">${signed(variance)}</strong></th></tr>${grouped.map(s=>slotRow(s,true)).join('')}`}).join(''):slots.map(s=>slotRow(s,false)).join('');
  const totals=editable?`<tfoot><tr class="totals-row"><th colspan="3">Totali</th><th data-total-baseline-pct>${formatPercentage(recap.baselinePct)}</th><th data-total-baseline>${recap.planned}</th><th data-total-forecast>${recap.forecast}</th><th data-total-forecast-pct>${formatPercentage(recap.forecastPct)}</th><th><span class="actual-total">Actual ${recap.actual}</span><br>Δ <strong class="${varianceClass(recap.completedVariance)}" data-total-variance>${signed(recap.completedVariance)}</strong></th></tr></tfoot>`:'';
  return `<div class="slot-table-wrap${editable?' strategy-slot-table-wrap':''}${priority?' priority-slots-scroll':''}"><table class="slot-table"><thead><tr><th>Slot</th><th>Ruolo</th><th>Priorità</th><th>Baseline %</th><th>Baseline</th><th>Forecast</th><th>Forecast %</th><th>Actual</th></tr></thead><tbody>${body}</tbody>${totals}</table></div>`;
}
const selected=(value,current)=>`${value===current?' selected':''}`;
function market(){const teams=[...new Set(raw.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));return `<div class=eyebrow>Selezione giocatori</div><h1>Mercato live</h1><div class=filters><input id=q value="${marketControls.query}" placeholder="Cerca giocatore o squadra…"><select id=cat><option value="">Tutti i ruoli</option>${CATEGORY_PRIORITY.map(x=>`<option${selected(x,marketControls.category)}>${x}</option>`).join('')}</select><select id=ms><option value="AVAILABLE"${selected('AVAILABLE',marketControls.availability)}>Disponibili</option><option value=""${selected('',marketControls.availability)}>Tutti gli stati</option><option${selected('SOLD',marketControls.availability)}>SOLD</option><option${selected('MY TEAM',marketControls.availability)}>MY TEAM</option></select><select id=team><option value="">Tutte le squadre</option>${teams.map(x=>`<option${selected(x,marketControls.team)}>${x}</option>`).join('')}</select></div><div id=marketTable>${playerTable(applyMarketPipeline(players()))}</div>`}
const sortIndicator=key=>marketControls.sort?.key===key?(marketControls.sort.direction==='asc'?'↑':'↓'):'↕';
const sortHeader=(key,label)=>`<button type=button class=sort-button data-sort="${key}">${label} <span aria-hidden=true>${sortIndicator(key)}</span></button>`;
const multiOptions=(values,active)=>values.map(value=>`<option value="${value}"${active.includes(String(value))?' selected':''}>${value}</option>`).join('');
const rangeInputs=(key,label='')=>`<div class=range-filter>${label?`<span>${label}</span>`:''}<input data-column="${key}Min" type=number placeholder="Min" value="${marketControls.columns[key+'Min']}"><input data-column="${key}Max" type=number placeholder="Max" value="${marketControls.columns[key+'Max']}"></div>`;
function playerTable(ps){const all=players(),roles=CATEGORY_PRIORITY,tiers=[...new Set(all.map(p=>p.tier).filter(v=>v!=null))].sort((a,b)=>Number(a)-Number(b)),statuses=[...new Set(raw.map(p=>p.status).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));return `<div class=market-table-wrap><table class=market-table><thead><tr><th>#</th><th>${sortHeader('name','Giocatore')}</th><th>${sortHeader('role','Ruolo')}</th><th>${sortHeader('tier','Tier')}</th><th>${sortHeader('auction','Asta €')}</th><th>${sortHeader('quotation','Quot.')}</th><th>${sortHeader('hype','Hype')}</th><th>${sortHeader('age','Età')}</th><th>${sortHeader('pg','PG / MF')}</th><th>${sortHeader('status','Status')}</th><th>Azioni</th></tr><tr class=column-filters><th></th><th><input data-column=name aria-label="Filtra giocatore" placeholder="Nome" value="${marketControls.columns.name}"></th><th><select data-column=roles aria-label="Filtra ruoli" multiple title="Seleziona uno o più ruoli">${multiOptions(roles,marketControls.columns.roles)}</select></th><th><select data-column=tiers aria-label="Filtra tier" multiple>${multiOptions(tiers,marketControls.columns.tiers)}</select></th><th>${rangeInputs('auction')}</th><th>${rangeInputs('quotation')}</th><th>${rangeInputs('hype')}</th><th>${rangeInputs('age')}</th><th><div class=metric-ranges>${rangeInputs('pg','PG')}${rangeInputs('mf','MF')}</div></th><th><select data-column=statuses aria-label="Filtra status" multiple>${multiOptions(statuses,marketControls.columns.statuses)}</select></th><th></th></tr></thead><tbody>${ps.slice(0,180).map(p=>{let st=state.market[p.id]?.marketStatus||'AVAILABLE';return `<tr class=${st==='AVAILABLE'?'':'sold'}><td>${p.rankingPosition}</td><td><b>${p.name}</b><br><span class=muted>${p.team} ${p.cups?'· '+p.cups:''}</span></td><td>${p.roles}<br><span class=pill>${p.rankingCategory}</span></td><td>${p.tier??'—'}</td><td><b>${p.auctionValue}</b></td><td>${p.quotation}</td><td>${p.hypeFactor??'—'}</td><td>${p.age??'—'}</td><td>${p.actPg??'—'} / ${p.actMf??'—'}</td><td>${p.status}</td><td>${st==='AVAILABLE'?`<button class="action secondary" onclick="sold('${p.id}')">SOLD</button> <button class=action onclick="buy('${p.id}')">+ MIA</button>`:st}</td></tr>`}).join('')}</tbody></table></div>`}
const inRange=(value,min,max)=>(min===''||Number(value)>=Number(min))&&(max===''||Number(value)<=Number(max))&&(min===''&&max===''||value!=null&&value!=='');
function applyMarketPipeline(source){const f=marketControls.columns,q=marketControls.query.trim().toLocaleLowerCase('it');let result=source.filter(p=>(!q||`${p.name} ${p.team}`.toLocaleLowerCase('it').includes(q))&&(!marketControls.category||p.rankingCategory===marketControls.category)&&(!marketControls.availability||(state.market[p.id]?.marketStatus||'AVAILABLE')===marketControls.availability)&&(!marketControls.team||p.team===marketControls.team)&&(!f.name||p.name.toLocaleLowerCase('it').includes(f.name.toLocaleLowerCase('it')))&&(!f.roles.length||f.roles.includes(p.rankingCategory))&&(!f.tiers.length||f.tiers.includes(String(p.tier)))&&inRange(p.auctionValue,f.auctionMin,f.auctionMax)&&inRange(p.quotation,f.quotationMin,f.quotationMax)&&inRange(p.hypeFactor,f.hypeMin,f.hypeMax)&&inRange(p.age,f.ageMin,f.ageMax)&&inRange(p.actPg,f.pgMin,f.pgMax)&&inRange(p.actMf,f.mfMin,f.mfMax)&&(!f.statuses.length||f.statuses.includes(p.status)));if(!marketControls.sort)return result;const {key,direction}=marketControls.sort,get={name:p=>p.name,role:p=>p.rankingCategory,tier:p=>p.tier,auction:p=>p.auctionValue,quotation:p=>p.quotation,hype:p=>p.hypeFactor,age:p=>p.age,pg:p=>p.actPg,status:p=>p.status}[key],sign=direction==='asc'?1:-1;return result.map((p,index)=>({p,index})).sort((a,b)=>{const av=get(a.p),bv=get(b.p),an=av==null||av===''||av==='N/A',bn=bv==null||bv===''||bv==='N/A';if(an!==bn)return an?1:-1;if(an&&bn)return a.index-b.index;const comparison=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'it',{numeric:true,sensitivity:'base'});return comparison?comparison*sign:a.index-b.index}).map(x=>x.p)}
function formationSummary(id){const formation=getFormation(id);if(!formation)return `<p class=muted>Modulo non disponibile</p>`;const names={GK:"PORTA",DEF:"DIFESA",MID:"CENTROCAMPO",AM:"TREQUARTI",ATT:"ATTACCO"};return `<div class=formation-summary><b>${formation.label}</b>${formation.lines.map(group=>`<div><span>${names[group.id]}</span><strong>${group.positions.map(position=>position.optionalLabel).join(" · ")}</strong></div>`).join("")}</div>`}
function slotCountControls(){return `<div class="slot-counts"><div class="slot-counts-head"><b>Slot per ruolo</b><span class=muted>POR fisso a 3 · totale massimo 34</span></div>${CATEGORY_PRIORITY.map(category=>`<label>${category==='WA'?'W/A':category}<br><input data-slot-count="${category}" type="number" min="${category==='POR'?3:0}" max="${category==='POR'?3:31}" step="1" value="${state.slotCounts[category]??0}" ${category==='POR'?'disabled':''}></label>`).join('')}</div>`}
function strategy(){return `<div class=eyebrow>Baseline configurabile</div><h1>Strategia d'asta</h1><div class="card editor"><label>Budget<br><input id=budget type=number value=${state.budget}></label><label>Rosa<br><input id=size type=number min=3 max=34 value=${state.rosterSize} readonly></label><label>Modulo<br><select id=formation>${getFormationIds().map(id=>`<option value="${id}"${id===state.formation?" selected":""}>${getFormation(id).label}</option>`).join("")}</select></label><label><br><button class=action onclick=configure()>Salva configurazione</button></label>${slotCountControls()}</div><div id=formationSummary class="card tactical-card">${formationSummary(state.formation)}</div><div class=section><div class=section-head><div><h2>Piano slot</h2><p class=muted>Il forecast è calcolato in tempo reale: usa l'Actual per gli slot acquistati e la Baseline per quelli aperti. Le variazioni di ruolo sono disponibili solo per gli slot aperti; i tre POR sono fissi.</p></div></div>${slotTable(state.slots,true)}</div><div class="card reset-panel section"><div><h2>Ripristina impostazioni</h2><p class=muted>Cancella configurazione, acquisti e stati del mercato, riportando l'app ai valori iniziali.</p></div><button class="action danger-action" onclick=resetAll()>Resetta tutto</button></div>`}
const changeLabel={NEW_INJURY:'NUOVO',RECOVERED:'RIENTRATO',INJURY_UPDATED:'AGGIORNATO',RETURN_UPDATED:'AGGIORNATO',UNCHANGED:'INVARIATO'};
function injurySummary(u){return `${u.currentInjuries??0} attuali · +${u.newInjuries??0} nuovi · ${u.recovered??0} recuperati · ${(u.injuryUpdated||0)+(u.returnUpdated||0)} modificati`}
function quality(){const missingAge=raw.filter(p=>p.age==null).length,missingPc=raw.filter(p=>!p.pro||!p.contro).length,uncat=raw.filter(p=>!p.rankingCategory).length,u=injuryUpdate,diagnostics=[...(u.unmatchedRecords||[]).map(x=>`Unmatched · ${x.name} · ${x.team||'squadra ignota'}`),...(u.ambiguousRecords||[]).map(x=>`Ambiguous · ${x.name} · ${x.team||'squadra ignota'} · candidati: ${(x.candidateIds||[]).join(', ')}`)];return `<div class=eyebrow>Import diagnostics</div><h1>Data quality</h1><div class=grid>${[['Giocatori importati',raw.length],['Età mancanti',missingAge],['Pro / Contro mancanti',missingPc],['Categoria irrisolta',uncat]].map(x=>`<div class="card metric"><label>${x[0]}</label><strong>${x[1]}</strong></div>`).join('')}</div><section class="card section injury-refresh"><div class=section-head><div><h2>Aggiornamento infortuni</h2><p class=muted>Fantacalcio.it · Aggiornato ${formatItalianDate(u.updatedAt)} · ${u.currentInjuries??'—'} infortunati</p></div><button id=refreshInjuries class=action>Aggiorna infortuni</button></div><p id=refreshStatus class=refresh-status aria-live=polite>${injurySummary(u)}</p>${diagnostics.length?`<details><summary>Dettagli matching (${diagnostics.length})</summary><ul>${diagnostics.map(x=>`<li>${x}</li>`).join('')}</ul></details>`:''}</section><div class="notice section">Gli arricchimenti non associabili con certezza restano vuoti e richiedono revisione manuale.</div>`}
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
  const refreshTable=focusKey=>{document.querySelector('#marketTable').innerHTML=playerTable(applyMarketPipeline(players()));bindTableControls();if(focusKey){const next=document.querySelector(`[data-column="${focusKey}"]`);next?.focus();if(next?.setSelectionRange)next.setSelectionRange(next.value.length,next.value.length)}};
  ['q','cat','ms','team'].forEach(id=>document.querySelector('#'+id).oninput=event=>{marketControls[{q:'query',cat:'category',ms:'availability',team:'team'}[id]]=event.target.value;refreshTable()});
  function bindTableControls(){
    document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{const key=button.dataset.sort,current=marketControls.sort;marketControls.sort={key,direction:current?.key===key&&current.direction==='asc'?'desc':'asc'};refreshTable()});
    document.querySelectorAll('[data-column]').forEach(control=>control.oninput=()=>{marketControls.columns[control.dataset.column]=control.multiple?[...control.selectedOptions].map(option=>option.value):control.value;refreshTable(control.dataset.column)});
  }
  bindTableControls();
}
function render(){document.querySelector('header i').textContent=state.started?'ASTA LIVE':'STRATEGIA';const warning=loadIssues.length?`<div class="notice load-warning" role="alert"><b>Dati caricati solo in parte.</b> ${loadIssues.join(' · ')}. Puoi comunque aprire l’app e riprovare aggiornando la pagina.</div>`:'';document.querySelector('#app').innerHTML=warning+({cockpit,market,strategy,quality})[view]();if(view==='quality')document.querySelector('#refreshInjuries').onclick=refreshInjuries;if(view==='strategy'){document.querySelector('#formation').onchange=event=>document.querySelector('#formationSummary').innerHTML=formationSummary(event.target.value);initBaselineEditor()}if(view==='market')initMarketFilters()}
window.openPressureDetail=index=>{
  const group=pressureGroups[index],panel=document.querySelector('.pressure-detail');
  if(!group||!panel)return;
  const rows=group.players.map(player=>{const available=(state.market[player.id]?.marketStatus??'AVAILABLE')==='AVAILABLE';return `<tr class="${available?'':'purchased'}"><td><b>${escapeHtml(player.name)}</b></td><td>${escapeHtml(player.team||'—')}</td><td><span class="pressure-status ${available?'available':'acquired'}">${available?'Disponibile':'Acquistato'}</span></td></tr>`}).join('');
  panel.innerHTML=`<div class=pressure-detail-head><h3>${escapeHtml(group.label)} — ${group.available} disponibili / ${group.total} originali</h3><button type=button onclick="closePressureDetail()" aria-label="Chiudi dettaglio">×</button></div><div class=pressure-player-list><table><thead><tr><th>Nome giocatore</th><th>Squadra</th><th>Stato</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  panel.classList.add('open');
};
window.closePressureDetail=()=>document.querySelector('.pressure-detail')?.classList.remove('open');
window.setPressurePage=page=>{pressurePage=page==='mantra'?'mantra':'tier';render()};window.goMarket=()=>{view='market';render()};window.sold=id=>{state.started=true;state.market[id]={marketStatus:'SOLD'};save()};window.buy=id=>{const p=raw.find(x=>x.id===id),open=state.slots.filter(s=>!s.playerId&&s.category===p.rankingCategory);if(!open.length)return alert('Nessuno slot compatibile aperto');const price=Number(prompt(`Prezzo per ${p.name}?`,p.auctionValue));if(!Number.isFinite(price)||price<1)return;const slot=open[0];slot.playerId=id;slot.actualPurchasePrice=price;state.market[id]={marketStatus:'MY TEAM'};state.started=true;save()};window.configure=()=>{const budget=Number(document.querySelector('#budget').value);const requestedCounts=Object.fromEntries(CATEGORY_PRIORITY.map(category=>[category,Number(document.querySelector(`[data-slot-count="${category}"]`).value)]));const edits=Object.fromEntries([...document.querySelectorAll('[data-slot-id]')].map(row=>{const slot=state.slots.find(item=>item.id===row.dataset.slotId);return [row.dataset.slotId,{category:row.querySelector('[data-slot-role]')?.value??slot.category,originalPlannedBudget:row.querySelector('[data-slot-baseline]').value}]}));try{let updatedSlots=updateSlotStrategy(state.slots,edits);const countsChanged=CATEGORY_PRIORITY.some(category=>requestedCounts[category]!==state.slotCounts[category]);if(countsChanged){updatedSlots=reconcileSlotCounts(updatedSlots,requestedCounts,34);state.slotCounts={...requestedCounts}}else state.slotCounts=slotCountsFromSlots(updatedSlots);state.slots=updatedSlots}catch(error){alert(error.message);render();return}state.budget=budget;state.rosterSize=state.slots.length;state.formation=document.querySelector('#formation').value;save()};window.resetAll=()=>{if(!confirm('Vuoi davvero resettare tutte le impostazioni? Configurazione, acquisti e stati del mercato verranno cancellati.'))return;localStorage.removeItem('mantra-auction');location.reload()};render();
