import test from 'node:test';
import assert from 'node:assert/strict';
import {backupFilename,createBackup,parseBackup} from '../src/backup.js';

const state={budget:1000,formation:'3-4-2-1',slots:[{id:'POR1',category:'POR',playerId:'p1',actualPurchasePrice:12}],aliasConfiguration:[],market:{p1:{marketStatus:'MY TEAM'}},auctionView:{placements:{p1:'POR1'},orders:{POR1:['p1']}},futureProperty:{kept:true}};

test('backup wraps and preserves the complete persisted state',()=>{
  const date=new Date('2026-09-04T07:08:00.000Z');
  const backup=createBackup(JSON.stringify(state),date);
  assert.deepEqual(backup,{backupVersion:1,exportedAt:date.toISOString(),state});
  assert.deepEqual(parseBackup(JSON.stringify(backup)).state.futureProperty,{kept:true});
});

test('backup filename follows the requested timestamp format',()=>{
  assert.equal(backupFilename(new Date(2026,8,4,7,8)),'Fantacalcio_Backup_20260904_0708.json');
});

test('invalid or incompatible files are rejected before yielding state',()=>{
  assert.throws(()=>parseBackup('{nope'),/JSON valido/);
  assert.throws(()=>parseBackup(JSON.stringify({backupVersion:2,exportedAt:new Date().toISOString(),state})),/Versione/);
  assert.throws(()=>parseBackup(JSON.stringify({backupVersion:1,exportedAt:new Date().toISOString(),state:{...state,slots:null}})),/slot/);
});
