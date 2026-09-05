/** Restore one player before a sale or purchase in every shared view. */
export function resetPlayer(state,playerId){
  const market={...(state.market||{})};
  delete market[playerId];
  const slots=(state.slots||[]).map(slot=>{
    const playerIds=(slot.playerIds??(slot.playerId?[slot.playerId]:[])).filter(id=>String(id)!==String(playerId));
    if(slot.playerId!==playerId)return {...slot,playerIds};
    return {...slot,playerIds,playerId:playerIds[0]??null,actualPurchasePrice:null};
  });
  return {...state,market,slots};
}
