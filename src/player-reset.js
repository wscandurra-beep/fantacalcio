/** Restore one player before a sale or purchase in every shared view. */
export function resetPlayer(state,playerId){
  const market={...(state.market||{})};
  delete market[playerId];
  const slots=(state.slots||[]).map(slot=>slot.playerId===playerId
    ?{...slot,playerId:null,actualPurchasePrice:null}
    :slot);
  return {...state,market,slots};
}
