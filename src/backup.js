export const STORAGE_KEY='mantra-auction';
export const BACKUP_VERSION=1;

const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

export function validatePersistedState(state){
  if(!isObject(state))throw new Error('Il backup non contiene uno stato valido.');
  if(!Number.isFinite(state.budget)||state.budget<0)throw new Error('Il budget del backup non è valido.');
  if(typeof state.formation!=='string'||!state.formation)throw new Error('La formazione del backup non è valida.');
  if(!Array.isArray(state.slots))throw new Error('Gli slot del backup non sono validi.');
  if(!state.slots.every(slot=>isObject(slot)&&typeof slot.id==='string'&&typeof slot.category==='string'))throw new Error('Uno o più slot del backup non sono compatibili.');
  if(!Array.isArray(state.aliasConfiguration))throw new Error('La configurazione Alias del backup non è valida.');
  if(!isObject(state.market))throw new Error('Il mercato del backup non è valido.');
  if(!isObject(state.auctionView))throw new Error("La vista d'asta del backup non è valida.");
  return state;
}

export function createBackup(storedValue,now=new Date()){
  if(typeof storedValue!=='string')throw new Error('Non esiste ancora uno stato salvato da esportare.');
  let state;
  try{state=JSON.parse(storedValue)}catch{throw new Error('Lo stato salvato non è un JSON valido.')}
  validatePersistedState(state);
  return {backupVersion:BACKUP_VERSION,exportedAt:now.toISOString(),state};
}

export function parseBackup(contents){
  let backup;
  try{backup=JSON.parse(contents)}catch{throw new Error('Il file selezionato non contiene JSON valido.')}
  if(!isObject(backup)||backup.backupVersion!==BACKUP_VERSION)throw new Error('Versione del backup non supportata.');
  if(typeof backup.exportedAt!=='string'||!Number.isFinite(Date.parse(backup.exportedAt)))throw new Error('Il backup non contiene una data di esportazione valida.');
  validatePersistedState(backup.state);
  return backup;
}

export function backupFilename(date=new Date()){
  const pad=value=>String(value).padStart(2,'0');
  return `Fantacalcio_Backup_${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
