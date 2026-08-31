export const MARKET_COLUMNS={name:{label:'Giocatore',value:p=>p.name},team:{label:'Squadra',value:p=>p.team},role:{label:'Ruolo',value:p=>p.rankingCategory},tier:{label:'Tier',value:p=>p.tier,numeric:true},auction:{label:'Asta €',value:p=>p.auctionValue,numeric:true},quotation:{label:'Quot.',value:p=>p.quotation,numeric:true},hype:{label:'Hype',value:p=>p.hypeFactor,numeric:true},age:{label:'Età',value:p=>p.age,numeric:true},pg:{label:'PG / MF',value:p=>p.actPg,numeric:true},status:{label:'Status',value:p=>p.status}};

export function createMarketControls(){
  return {query:'',category:'',availability:'AVAILABLE',columns:{},sort:null,openMenu:null};
}
