import {getForecast} from './domain.js';

const emptyAuctionValue=value=>value==null||value===''||Number(value)===0||!Number.isFinite(Number(value));

export function auctionSlotTitle(slot){
  if(slot.id==='OUT')return slot.id;
  return `${slot.id} · BDG ${slot.originalPlannedBudget} · FRC ${getForecast(slot)}`;
}

export function auctionInjuryStatus(status){
  if(status==='OK')return {label:'OK',interactive:false,detail:null};
  return {label:'NOT OK',interactive:true,detail:status?String(status):'Dettaglio infortunio non disponibile'};
}

export function sortAuctionPlayers(players=[]){
  return players.map((player,index)=>({player,index})).sort((left,right)=>{
    const leftEmpty=emptyAuctionValue(left.player.auctionValue),rightEmpty=emptyAuctionValue(right.player.auctionValue);
    if(leftEmpty!==rightEmpty)return leftEmpty?1:-1;
    if(!leftEmpty){const difference=Number(right.player.auctionValue)-Number(left.player.auctionValue);if(difference)return difference;}
    return left.index-right.index;
  }).map(item=>item.player);
}

export function auctionPlayerMarketStatus(player,market={},acquiredPlayerIds=new Set()){
  const marketStatus=market[player.id]?.marketStatus||'AVAILABLE';
  if(marketStatus==='SOLD')return 'SOLD';
  if(marketStatus==='MY TEAM'||acquiredPlayerIds.has(player.id))return 'ACQUIRED';
  return 'AVAILABLE';
}

export function sortAuctionSoldLast(players=[],market={},acquiredPlayerIds=new Set()){
  const available=[],sold=[];
  for(const player of players)(auctionPlayerMarketStatus(player,market,acquiredPlayerIds)==='SOLD'?sold:available).push(player);
  return available.concat(sold);
}

export function auctionStatusCounts(players=[],market={},acquiredPlayerIds=new Set()){
  const counts={sold:0,acquired:0,available:0};
  for(const player of players){
    const status=auctionPlayerMarketStatus(player,market,acquiredPlayerIds);
    if(status==='SOLD')counts.sold+=1;
    else if(status==='ACQUIRED')counts.acquired+=1;
    else counts.available+=1;
  }
  return counts;
}

export function buildAuctionRows(players,slots,viewState={},includeOut=false){
  const placements=viewState.placements||{},orders=viewState.orders||{};
  const rows=slots.map(slot=>({slot,players:[]}));
  if(includeOut)rows.push({slot:{id:'OUT',category:'OUT',priority:'Override'},players:[]});
  const byId=new Map(rows.map(row=>[row.slot.id,row]));
  const categorySlots=new Map();
  for(const row of rows){const grouped=categorySlots.get(row.slot.category)||[];grouped.push(row.slot.id);categorySlots.set(row.slot.category,grouped);}
  for(const player of players){
    const automatic=categorySlots.get(player.strategicAlias??player.rankingCategory)?.[Number(player.tier)-1];
    const target=byId.has(placements[player.id])?placements[player.id]:automatic;
    if(target&&byId.has(target))byId.get(target).players.push(player);
  }
  for(const row of rows){
    const automatic=sortAuctionPlayers(row.players),manual=orders[row.slot.id]||[],rank=new Map(manual.map((id,index)=>[id,index]));
    row.players=automatic.sort((a,b)=>{const ar=rank.get(a.id),br=rank.get(b.id);if(ar!=null&&br!=null)return ar-br;if(ar!=null)return -1;if(br!=null)return 1;return 0;});
  }
  return rows;
}

export function auctionPlayerSlotId(rows=[],playerId){
  return rows.find(row=>row.players.some(player=>String(player.id)===String(playerId)))?.slot.id??null;
}

export function pinAuctionPlayerToCurrentSlot(viewState,playerId,rows=[]){
  const slotId=auctionPlayerSlotId(rows,playerId);
  if(!slotId)return viewState;
  return {...(viewState||{}),placements:{...(viewState?.placements||{}),[playerId]:slotId},orders:{...(viewState?.orders||{})}};
}

export function moveAuctionPlayer(viewState,playerId,toSlotId,toIndex,rows){
  const next={placements:{...(viewState?.placements||{})},orders:{...(viewState?.orders||{})}};
  next.placements[playerId]=toSlotId;
  for(const row of rows){
    const ids=row.players.map(player=>player.id).filter(id=>id!==playerId);
    if(row.slot.id===toSlotId)ids.splice(Math.max(0,Math.min(Number(toIndex),ids.length)),0,playerId);
    next.orders[row.slot.id]=ids;
  }
  return next;
}

export function canDropAuctionPlayer(player,toSlot,market={},slots=[]){
  if(!player||!toSlot)return false;
  const acquired=market[player.id]?.marketStatus==='MY TEAM'||slots.some(slot=>String(slot.playerId)===String(player.id));
  if(toSlot.id==='OUT')return !acquired;
  if(toSlot.category!==player.strategicAlias)return false;
  return !acquired||!toSlot.playerId||String(toSlot.playerId)===String(player.id);
}
