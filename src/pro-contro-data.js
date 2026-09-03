export function applyProContro(players=[],rows=[]){
  const byId=new Map(rows.filter(row=>row?.id!=null).map(row=>[String(row.id),row]));
  return players.map(player=>{const row=byId.get(String(player.id));return row?{...player,pro:row.pro||null,contro:row.contro||null,proControStatus:row.status}:player});
}
export function normalizeProControRuns(payload={}){return {runs:Array.isArray(payload?.runs)?payload.runs:[]}}
