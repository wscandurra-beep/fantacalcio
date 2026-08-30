import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATIONS, isSupportedFormation } from '../src/config.js';

test('all official Mantra formations are available once', () => {
  assert.deepEqual(FORMATIONS.map(({ id }) => id), [
    '3-4-3',
    '3-4-1-2',
    '3-4-2-1',
    '3-5-2',
    '3-5-1-1',
    '4-3-3',
    '4-3-1-2',
    '4-4-2',
    '4-1-4-1',
    '4-4-1-1',
    '4-2-3-1',
  ]);
  assert.equal(new Set(FORMATIONS.map(({ id }) => id)).size, FORMATIONS.length);
});

test('formation validation only accepts configured values', () => {
  assert.equal(isSupportedFormation('3-4-2-1'), true);
  assert.equal(isSupportedFormation('4-2-3-1'), true);
  assert.equal(isSupportedFormation('5-5-5'), false);
});
