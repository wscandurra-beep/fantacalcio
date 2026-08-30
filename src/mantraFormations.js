export const MANTRA_ROLES = Object.freeze(['Por','Dd','Ds','Dc','B','E','M','C','W','T','A','Pc']);

const P=(id,line,side,roles)=>Object.freeze({id,line,side,acceptedRoles:Object.freeze(roles),optionalLabel:roles.join('/')});
const L=(id,spec)=>Object.freeze({id,line:id,positions:Object.freeze(spec.map(([positionId,side,roles])=>P(positionId,id,side,roles)))});
const GK=()=>L('GK',[['GK','centre',['Por']]]);
const D3=()=>L('DEF',[['DEF_LEFT','left',['Dc','B']],['DEF_CENTRE','centre',['Dc']],['DEF_RIGHT','right',['Dc','B']]]);
const D4=()=>L('DEF',[['DEF_LEFT','left',['Ds']],['DEF_CENTRE_LEFT','centre',['Dc']],['DEF_CENTRE_RIGHT','centre',['Dc']],['DEF_RIGHT','right',['Dd']]]);
const M4=()=>L('MID',[['MID_LEFT','left',['E']],['MID_CENTRE_LEFT','centre',['M','C']],['MID_CENTRE_RIGHT','centre',['M','C']],['MID_RIGHT','right',['E']]]);
const C3=()=>L('MID',[['MID_LEFT','left',['M','C']],['MID_CENTRE','centre',['M','C']],['MID_RIGHT','right',['M','C']]]);
const A2=()=>L('ATT',[['ATT_LEFT','left',['A','Pc']],['ATT_RIGHT','right',['A','Pc']]]);
const A1=()=>L('ATT',[['ATT_CENTRE','centre',['A','Pc']]]);
const F=(id,defenders,midfielders,attackingMidfielders,forwards,lines)=>Object.freeze({id,label:id,defenders,midfielders,attackingMidfielders,forwards,lines:Object.freeze([GK(),...lines])});
const wings=()=>L('ATT',[['ATT_LEFT','left',['W','A']],['ATT_CENTRE','centre',['A','Pc']],['ATT_RIGHT','right',['W','A']]]);
const m5=()=>L('MID',[['MID_LEFT','left',['E']],['MID_CENTRE_LEFT','centre',['M','C']],['MID_CENTRE','centre',['M','C']],['MID_CENTRE_RIGHT','centre',['M','C']],['MID_RIGHT','right',['E']]]);
const wide4=()=>L('MID',[['MID_LEFT','left',['E','W']],['MID_CENTRE_LEFT','centre',['M','C']],['MID_CENTRE_RIGHT','centre',['M','C']],['MID_RIGHT','right',['E','W']]]);

export const MANTRA_FORMATIONS=Object.freeze({
 '3-4-3':F('3-4-3',3,4,0,3,[D3(),M4(),wings()]),
 '3-4-1-2':F('3-4-1-2',3,4,1,2,[D3(),M4(),L('AM',[['AM_CENTRE','centre',['T']]]),A2()]),
 '3-4-2-1':F('3-4-2-1',3,4,2,1,[D3(),M4(),L('AM',[['AM_LEFT','left',['W','T']],['AM_RIGHT','right',['W','T']]]),A1()]),
 '3-5-2':F('3-5-2',3,5,0,2,[D3(),m5(),A2()]),
 '3-5-1-1':F('3-5-1-1',3,5,1,1,[D3(),m5(),L('AM',[['AM_CENTRE','centre',['T','A']]]),A1()]),
 '4-3-3':F('4-3-3',4,3,0,3,[D4(),C3(),wings()]),
 '4-3-1-2':F('4-3-1-2',4,3,1,2,[D4(),C3(),L('AM',[['AM_CENTRE','centre',['T']]]),A2()]),
 '4-4-2':F('4-4-2',4,4,0,2,[D4(),wide4(),A2()]),
 '4-1-4-1':F('4-1-4-1',4,5,0,1,[D4(),L('MID',[['MID_SCREEN','centre',['M']],['MID_LEFT','left',['E','W']],['MID_CENTRE_LEFT','centre',['C','T']],['MID_CENTRE_RIGHT','centre',['C','T']],['MID_RIGHT','right',['E','W']]]),A1()]),
 '4-4-1-1':F('4-4-1-1',4,4,1,1,[D4(),wide4(),L('AM',[['AM_CENTRE','centre',['T','A']]]),A1()]),
 '4-2-3-1':F('4-2-3-1',4,2,3,1,[D4(),L('MID',[['MID_CENTRE_LEFT','centre',['M','C']],['MID_CENTRE_RIGHT','centre',['M','C']]]),L('AM',[['AM_LEFT','left',['W','T']],['AM_CENTRE','centre',['T']],['AM_RIGHT','right',['W','T']]]),A1()])
});

export const getFormation=id=>MANTRA_FORMATIONS[id]??null;
export const getFormationIds=()=>Object.keys(MANTRA_FORMATIONS);
export const getFormationPositions=id=>getFormation(id)?.lines.flatMap(group=>group.positions)??[];
export const normalizePlayerRoles=(roles=[])=>[...new Set((Array.isArray(roles)?roles:String(roles).split(';')).map(role=>String(role).trim()).filter(Boolean))];
export const isPlayerCompatibleWithPosition=(roles,position)=>normalizePlayerRoles(roles).some(role=>position.acceptedRoles.includes(role));
export const getCompatiblePositions=(roles,id)=>getFormationPositions(id).filter(position=>isPlayerCompatibleWithPosition(roles,position));
export const getFormationRoleDemand=id=>getFormationPositions(id).reduce((result,position)=>{for(const role of position.acceptedRoles)(result[role]??=[]).push(position.id);return result},{});

export function validateFormationDefinitions(formations=MANTRA_FORMATIONS){
 const allowed=new Set(MANTRA_ROLES),ids=new Set();
 for(const [key,formation] of Object.entries(formations)){
  if(!formation||formation.id!==key||ids.has(formation.id))throw new Error(`Invalid or duplicate formation id: ${key}`);ids.add(formation.id);
  const positions=formation.lines.flatMap(group=>group.positions),positionIds=new Set();
  if(positions.length!==11)throw new Error(`${key} must contain exactly 11 positions`);
  if(positions.filter(position=>position.line==='GK'&&position.acceptedRoles.length===1&&position.acceptedRoles[0]==='Por').length!==1)throw new Error(`${key} must contain exactly one goalkeeper`);
  if(positions.filter(position=>position.line!=='GK').length!==10)throw new Error(`${key} must contain exactly 10 outfield positions`);
  for(const position of positions){if(positionIds.has(position.id))throw new Error(`${key} contains duplicate position id ${position.id}`);positionIds.add(position.id);if(!Array.isArray(position.acceptedRoles)||!position.acceptedRoles.length)throw new Error(`${key}/${position.id} requires accepted roles`);if(position.acceptedRoles.some(role=>!allowed.has(role)))throw new Error(`${key}/${position.id} contains an invalid role`)}
 }
 return true;
}
validateFormationDefinitions();
