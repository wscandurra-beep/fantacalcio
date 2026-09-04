const emptyAuctionValue=value=>value==null||value===''||Number(value)===0||!Number.isFinite(Number(value));

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
