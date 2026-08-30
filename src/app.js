import {CATEGORY_PRIORITY,rankPlayers,assignTiers,budgetSummary,slotPlanSummary,tierDepletion,updateForecasts,updateSlotStrategy,getForecast,percentageOfBudget,formatPercentage,areaVariance} from './domain.js';
import {getFormation,getFormationIds} from './mantraFormations.js';
const raw=await fetch('./data/players.json').then(r=>r.json());
const defaults={budget:1000,rosterSize:34,formation:'3-4-2-1',started:false,slots:[],market:{}};
let state=Object.assign({},defaults,JSON.parse(localStorage.getItem('mantra-auction')||'{}'));
const counts={POR:3,DC:8,E:6,C:5,WA:9,PC:3};
if(!state.slots.length) state.slots=Object.entries(counts).flatMap(([c,n])=>Array.from({length:n},(_,i)=>({id:`${c}${i+1}`,category:c,priority:i===0?'Key':i<3?'Starter':'Reserve',originalPlannedBudget:[45,30,20,12,8,5,3,1][i]??1,playerId:null,actualPurchasePrice:null})));
state.slots=updateForecasts(state.slots);
function players(){return Object.keys(counts).flatMap(cat=>assignTiers(rankPlayers(raw.filter(p=>p.rankingCategory===cat)),state.slots.filter(s=>s.category===cat).length));}
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
function market(){let ps=players();return `<div class=eyebrow>Selezione giocatori</div><h1>Mercato live</h1><div class=filters><input id=q placeholder="Cerca giocatore o squadra…"><select id=cat><option value="">Tutti i ruoli</option>${Object.keys(counts).map(x=>`<option>${x}</option>`)}</select><select id=ms><option value="AVAILABLE">Disponibili</option><option value="">Tutti gli stati</option><option>SOLD</option><option>MY TEAM</option></select></div><div id=marketTable>${playerTable(ps)}</div>`}
function playerTable(ps){return `<table><thead><tr><th>#</th><th>Giocatore</th><th>Ruolo</th><th>Tier</th><th>Asta €</th><th>Quot.</th><th>Hype</th><th>Età</th><th>PG / MF</th><th>Status</th><th>Azioni</th></tr></thead><tbody>${ps.slice(0,180).map(p=>{let st=state.market[p.id]?.marketStatus||'AVAILABLE';return `<tr class=${st==='AVAILABLE'?'':'sold'}><td>${p.rankingPosition}</td><td><b>${p.name}</b><br><span class=muted>${p.team} ${p.cups?'· '+p.cups:''}</span></td><td>${p.roles}<br><span class=pill>${p.rankingCategory}</span></td><td>${p.tier}</td><td><b>${p.auctionValue}</b></td><td>${p.quotation}</td><td>${p.hypeFactor??'—'}</td><td>${p.age??'—'}</td><td>${p.actPg??'—'} / ${p.actMf??'—'}</td><td>${p.status}</td><td>${st==='AVAILABLE'?`<button class="action secondary" onclick="sold('${p.id}')">SOLD</button> <button class=action onclick="buy('${p.id}')">+ MIA</button>`:st}</td></tr>`}).join('')}</tbody></table>`}
function formationSummary(id){const formation=getFormation(id);if(!formation)return `<p class=muted>Modulo non disponibile</p>`;const names={GK:"PORTA",DEF:"DIFESA",MID:"CENTROCAMPO",AM:"TREQUARTI",ATT:"ATTACCO"};return `<div class=formation-summary><b>${formation.label}</b>${formation.lines.map(group=>`<div><span>${names[group.id]}</span><strong>${group.positions.map(position=>position.optionalLabel).join(" · ")}</strong></div>`).join("")}</div>`}
function strategy(){return `<div class=eyebrow>Baseline configurabile</div><h1>Strategia d'asta</h1><div class="card editor"><label>Budget<br><input id=budget type=number value=${state.budget}></label><label>Rosa<br><input id=size type=number min=3 max=34 value=${state.rosterSize}></label><label>Modulo<br><select id=formation>${getFormationIds().map(id=>`<option value="${id}"${id===state.formation?" selected":""}>${getFormation(id).label}</option>`).join("")}</select></label><label><br><button class=action onclick=configure()>Salva configurazione</button></label></div><div id=formationSummary class="card tactical-card">${formationSummary(state.formation)}</div><div class=section><div class=section-head><div><h2>Piano slot</h2><p class=muted>Il forecast è calcolato in tempo reale: usa l'Actual per gli slot acquistati e la Baseline per quelli aperti. Le variazioni di ruolo sono disponibili solo per gli slot aperti; i tre POR sono fissi.</p></div></div>${slotTable(state.slots,true)}</div><div class="card reset-panel section"><div><h2>Ripristina impostazioni</h2><p class=muted>Cancella configurazione, acquisti e stati del mercato, riportando l'app ai valori iniziali.</p></div><button class="action danger-action" onclick=resetAll()>Resetta tutto</button></div>`}
function quality(){const missingAge=raw.filter(p=>p.age==null).length,missingPc=raw.filter(p=>!p.pro||!p.contro).length,uncat=raw.filter(p=>!p.rankingCategory).length;return `<div class=eyebrow>Import diagnostics</div><h1>Data quality</h1><div class=grid>${[['Giocatori importati',raw.length],['Età mancanti',missingAge],['Pro / Contro mancanti',missingPc],['Categoria irrisolta',uncat]].map(x=>`<div class="card metric"><label>${x[0]}</label><strong>${x[1]}</strong></div>`).join('')}</div><div class="notice section">Gli arricchimenti storici non sono inventati: i valori non associabili con certezza restano vuoti e richiedono revisione manuale.</div>`}
function initBaselineEditor(){
  const inputs=[...document.querySelectorAll('[data-slot-baseline]')];
  const refresh=input=>{
    const budget=Number(document.querySelector('#budget').value),row=input.closest('[data-slot-id]');
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
function render(){document.querySelector('header i').textContent=state.started?'ASTA LIVE':'STRATEGIA';document.querySelector('#app').innerHTML=({cockpit,market,strategy,quality})[view]();if(view==='strategy'){document.querySelector('#formation').onchange=event=>document.querySelector('#formationSummary').innerHTML=formationSummary(event.target.value);initBaselineEditor()}if(view==='market'){const filter=()=>{let p=players(),q=document.querySelector('#q').value.toLowerCase(),c=document.querySelector('#cat').value,m=document.querySelector('#ms').value;p=p.filter(x=>(x.name+' '+x.team).toLowerCase().includes(q)&&(!c||x.rankingCategory===c)&&(!m||(state.market[x.id]?.marketStatus||'AVAILABLE')===m));document.querySelector('#marketTable').innerHTML=playerTable(p)};['q','cat','ms'].forEach(id=>document.querySelector('#'+id).oninput=filter)}}
window.goMarket=()=>{view='market';render()};window.sold=id=>{state.started=true;state.market[id]={marketStatus:'SOLD'};save()};window.buy=id=>{const p=raw.find(x=>x.id===id),open=state.slots.filter(s=>!s.playerId&&s.category===p.rankingCategory);if(!open.length)return alert('Nessuno slot compatibile aperto');const price=Number(prompt(`Prezzo per ${p.name}?`,p.auctionValue));if(!Number.isFinite(price)||price<1)return;const slot=open[0];slot.playerId=id;slot.actualPurchasePrice=price;state.market[id]={marketStatus:'MY TEAM'};state.started=true;save()};window.configure=()=>{const budget=Number(document.querySelector('#budget').value),size=Number(document.querySelector('#size').value);if(size>34||size<3)return alert('La rosa deve contenere da 3 a 34 giocatori');const edits=Object.fromEntries([...document.querySelectorAll('[data-slot-id]')].map(row=>{const slot=state.slots.find(item=>item.id===row.dataset.slotId);return [row.dataset.slotId,{category:row.querySelector('[data-slot-role]')?.value??slot.category,originalPlannedBudget:row.querySelector('[data-slot-baseline]').value}]}));try{state.slots=updateSlotStrategy(state.slots,edits)}catch(error){return alert(error.message)}state.budget=budget;state.rosterSize=size;state.formation=document.querySelector('#formation').value;save()};window.resetAll=()=>{if(!confirm('Vuoi davvero resettare tutte le impostazioni? Configurazione, acquisti e stati del mercato verranno cancellati.'))return;localStorage.removeItem('mantra-auction');location.reload()};render();
