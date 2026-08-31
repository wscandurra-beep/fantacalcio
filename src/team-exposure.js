export function teamExposure(slots=[],players=[],totalSlots=slots.length){
  const denominator=Number(totalSlots);
  const byId=new Map(players.map(player=>[String(player.id),player]));
  const counts=new Map();
  for(const slot of slots){
    if(!slot?.playerId)continue;
    const player=byId.get(String(slot.playerId));
    const team=String(player?.team||'').trim();
    if(!team)continue;
    counts.set(team,(counts.get(team)||0)+1);
  }
  return [...counts.entries()]
    .map(([team,count])=>({team,count,percentage:Number.isFinite(denominator)&&denominator>0?count/denominator*100:0}))
    .sort((a,b)=>b.percentage-a.percentage||a.team.localeCompare(b.team,'it'));
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function readState(){
  try{return JSON.parse(localStorage.getItem('mantra-auction')||'{}')}catch{return {}}
}

function configuredTotal(){
  const inputs=[...document.querySelectorAll('[data-slot-count]')];
  if(inputs.length){
    const values=inputs.map(input=>Number(input.value));
    if(values.every(Number.isFinite))return values.reduce((sum,value)=>sum+value,0);
  }
  const state=readState();
  return Array.isArray(state.slots)?state.slots.length:Number(state.rosterSize)||0;
}

function summaryMarkup(exposure,total){
  const formatter=new Intl.NumberFormat('it-IT',{maximumFractionDigits:1});
  const rows=exposure.map(item=>`<span class="team-exposure-chip"><b>${escapeHtml(item.team)}</b><strong>${formatter.format(item.percentage)}%</strong></span>`).join('');
  return `<div class="section-head team-exposure-head"><div><h2>Distribuzione squadre</h2><p class="muted">Giocatori della squadra / ${total} slot configurati</p></div></div><div class="team-exposure-list">${rows||'<span class="muted">Nessun giocatore assegnato.</span>'}</div>`;
}

function init(){
  const app=document.querySelector('#app');
  if(!app)return;
  let players=[];
  let observer;
  const renderExposure=()=>{
    const slotHeading=[...app.querySelectorAll('h2')].find(node=>node.textContent.trim()==='Piano slot');
    if(!slotHeading)return;
    const slotSection=slotHeading.closest('.section');
    if(!slotSection)return;
    const state=readState();
    const slots=Array.isArray(state.slots)?state.slots:[];
    const total=configuredTotal();
    let panel=app.querySelector('[data-team-exposure]');
    if(!panel){
      panel=document.createElement('div');
      panel.className='card team-exposure section';
      panel.dataset.teamExposure='';
      slotSection.before(panel);
    }
    panel.innerHTML=summaryMarkup(teamExposure(slots,players,total),total);
    app.querySelectorAll('[data-slot-count]').forEach(input=>{
      if(input.dataset.teamExposureBound)return;
      input.dataset.teamExposureBound='1';
      input.addEventListener('input',renderExposure);
    });
  };
  const enhance=()=>{
    observer?.disconnect();
    renderExposure();
    observer?.observe(app,{childList:true,subtree:true});
  };
  observer=new MutationObserver(enhance);
  observer.observe(app,{childList:true,subtree:true});
  fetch(`./data/players.json?v=${Date.now()}`,{cache:'no-store'}).then(response=>response.json()).then(data=>{players=Array.isArray(data)?data:[];enhance()}).catch(()=>enhance());
  enhance();
}

if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined')init();
