import assert from 'node:assert/strict';
import test from 'node:test';
import {playerKey} from '../src/age-domain.js';

test('age display key separates player and team', () => {
  assert.equal(playerKey(' Rossi ', ' Roma '), 'Rossi\u0000Roma');
  assert.notEqual(playerKey('Rossi', 'Roma'), playerKey('Rossi', 'Milan'));
});
