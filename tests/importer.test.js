import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('workbook importer unit suite', () => {
  const result=spawnSync('python3',['-m','unittest','discover','-s','tests','-p','*_test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
});
