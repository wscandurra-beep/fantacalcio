export const IMPORT_STORAGE_KEY='fantacalcio-import-history-v1';
export const REQUIRED_PLAYER_HEADERS=['Id','RM','Nome','Squadra'];

const clean=value=>String(value??'').trim();
const identity=value=>clean(value).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const playerKey=player=>`${identity(player.name??player.Nome)}|${identity(player.team??player.Squadra)}`;
const importedPlayer=row=>({id:clean(row.Id),roles:clean(row.RM),name:clean(row.Nome),team:clean(row.Squadra)});

const decoder=new TextDecoder();
const xmlValue=value=>String(value??'').replace(/&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi,(entity,decimal,hex)=>decimal?String.fromCodePoint(Number(decimal)):hex?String.fromCodePoint(parseInt(hex,16)):({"&amp;":'&',"&lt;":'<',"&gt;":'>',"&quot;":'"',"&apos;":"'"}[entity.toLowerCase()]??entity));
const columnIndex=reference=>[...reference.match(/^[A-Z]+/)?.[0]??''].reduce((value,letter)=>value*26+letter.charCodeAt(0)-64,0)-1;

async function unzip(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=new Map();
  let eocd=-1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--)if(view.getUint32(offset,true)===0x06054b50){eocd=offset;break}
  if(eocd<0)throw new Error('File Excel non valido o danneggiato.');
  const entries=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true);
  for(let index=0;index<entries;index++){
    if(view.getUint32(offset,true)!==0x02014b50)throw new Error('Archivio Excel non valido.');
    const method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),localOffset=view.getUint32(offset+42,true),name=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength));
    const localNameLength=view.getUint16(localOffset+26,true),localExtraLength=view.getUint16(localOffset+28,true),start=localOffset+30+localNameLength+localExtraLength,compressed=bytes.slice(start,start+size);
    if(method===0)files.set(name,compressed);
    else if(method===8){const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));files.set(name,new Uint8Array(await new Response(stream).arrayBuffer()))}
    else throw new Error(`Compressione Excel non supportata (${method}).`);
    offset+=46+nameLength+extraLength+commentLength;
  }
  return files;
}

const xmlFile=(files,path)=>{const value=files.get(path);if(!value)throw new Error(`Componente Excel mancante: ${path}.`);return decoder.decode(value)};
function worksheetMatrix(xml,shared){
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(row=>{const values=[];for(const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){const ref=/\br="([A-Z]+\d+)"/.exec(cell[1])?.[1],type=/\bt="([^"]+)"/.exec(cell[1])?.[1],body=cell[2],raw=/<v>([\s\S]*?)<\/v>/.exec(body)?.[1]??[...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match=>match[1]).join(''),value=type==='s'?shared[Number(raw)]??'':xmlValue(raw);if(ref)values[columnIndex(ref)]=value}return values});
}

export async function readPlayerWorkbook(buffer){
  const files=await unzip(buffer),workbook=xmlFile(files,'xl/workbook.xml'),sheet=[...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].find(match=>/\bname="Tutti"/.test(match[1]));
  if(!sheet)throw new Error('Foglio obbligatorio “Tutti” non trovato.');
  const relationshipId=/\br:id="([^"]+)"/.exec(sheet[1])?.[1],relationships=xmlFile(files,'xl/_rels/workbook.xml.rels'),target=[...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].find(match=>new RegExp(`\\bId="${relationshipId}"`).test(match[1])),sheetTarget=/\bTarget="([^"]+)"/.exec(target?.[1]??'')?.[1];
  if(!sheetTarget)throw new Error('Relazione del foglio “Tutti” non valida.');
  const shared=files.has('xl/sharedStrings.xml')?[...xmlFile(files,'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(item=>[...item[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match=>xmlValue(match[1])).join('')):[];
  const matrix=worksheetMatrix(xmlFile(files,`xl/${sheetTarget.replace(/^\/?xl\//,'')}`),shared);
  const headers=(matrix[1]||[]).map(clean);
  const missing=REQUIRED_PLAYER_HEADERS.filter(header=>!headers.includes(header));
  if(missing.length)throw new Error(`Intestazioni della seconda riga non valide. Mancano: ${missing.join(', ')}.`);
  return matrix.slice(2).map((values,index)=>({line:index+3,...Object.fromEntries(REQUIRED_PLAYER_HEADERS.map(header=>[header,values[headers.indexOf(header)]]))}));
}

export function analyzePlayerImport(rows,current=[]){
  const invalid=[],duplicatesId=[],duplicatesNameTeam=[],valid=[],seenIds=new Map(),seenNames=new Map();
  for(const row of rows){
    const player=importedPlayer(row),line=row.line??valid.length+3;
    if(!player.id||!player.roles||!player.name||!player.team){invalid.push({line,reason:'Id, RM, Nome e Squadra sono obbligatori',row});continue}
    const nameTeam=playerKey(player);
    if(seenIds.has(player.id)){duplicatesId.push({line,id:player.id,firstLine:seenIds.get(player.id),player});continue}
    if(seenNames.has(nameTeam)){duplicatesNameTeam.push({line,name:player.name,team:player.team,firstLine:seenNames.get(nameTeam),player});continue}
    seenIds.set(player.id,line);seenNames.set(nameTeam,line);valid.push(player);
  }
  const oldById=new Map(current.map(player=>[clean(player.id),player])),nextById=new Map(valid.map(player=>[player.id,player]));
  const oldByName=new Map(current.map(player=>[playerKey(player),player])),nextByName=new Map(valid.map(player=>[playerKey(player),player]));
  const added=valid.filter(player=>!oldById.has(player.id));
  const removed=current.filter(player=>!nextById.has(clean(player.id)));
  const modified=valid.filter(player=>{const old=oldById.get(player.id);return old&&(clean(old.roles)!==player.roles||clean(old.name)!==player.name||clean(old.team)!==player.team)}).map(player=>({before:oldById.get(player.id),after:player}));
  const changedIds=valid.filter(player=>{const old=oldByName.get(playerKey(player));return old&&clean(old.id)!==player.id}).map(player=>({before:oldByName.get(playerKey(player)),after:player}));
  const trulyAdded=added.filter(player=>!oldByName.has(playerKey(player))),trulyRemoved=removed.filter(player=>!nextByName.has(playerKey(player)));
  const delta=valid.length-current.length,anomalous=current.length>0&&Math.abs(delta)/current.length>=.05;
  return {records:valid.length,discarded:invalid.length+duplicatesId.length+duplicatesNameTeam.length,valid,added:trulyAdded,removed:trulyRemoved,modified,duplicatesId,duplicatesNameTeam,invalid,changedIds,matchingProblems:changedIds,delta,anomalous};
}

export function mergePlayerDataset(current,valid){
  const byId=new Map(current.map(player=>[clean(player.id),player])),byName=new Map(current.map(player=>[playerKey(player),player]));
  return valid.map(player=>({...byName.get(playerKey(player)),...byId.get(player.id),...player}));
}

export function loadImportStore(storage=localStorage){
  try{const parsed=JSON.parse(storage.getItem(IMPORT_STORAGE_KEY)||'{}');return {history:Array.isArray(parsed.history)?parsed.history:[]}}catch{return {history:[]}}
}

export function saveImportVersion({filename,analysis,players,season='',now=new Date(),storage=localStorage}){
  const store=loadImportStore(storage),previous=store.history[0];
  const entry={id:`players-${now.toISOString()}`,dataset:'Lista giocatori',type:'players',filename,importedAt:now.toISOString(),records:analysis.records,discarded:analysis.discarded,season:season||null,previousVersion:previous?.id??null,result:analysis.invalid.length||analysis.duplicatesId.length||analysis.duplicatesNameTeam.length||analysis.removed.length||analysis.anomalous?'Warning':'OK',delta:analysis.delta,quality:{added:analysis.added,removed:analysis.removed,modified:analysis.modified,duplicatesId:analysis.duplicatesId,duplicatesNameTeam:analysis.duplicatesNameTeam,changedIds:analysis.changedIds,invalid:analysis.invalid,anomalous:analysis.anomalous},snapshot:players};
  store.history.unshift(entry);storage.setItem(IMPORT_STORAGE_KEY,JSON.stringify(store));return entry;
}

export function referenceSeason(filename){const match=filename.match(/(20\d{2})[_-](\d{2})/);return match?`${match[1]}/${match[2]}`:''}
