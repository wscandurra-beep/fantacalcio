import assert from 'node:assert/strict';
import test from 'node:test';
import {applyDynamicAges, calculateAge, playerKey, resolvePlayerAge} from '../src/age-domain.js';

test('age display key separates player and team', () => {
  assert.equal(playerKey(' Rossi ', ' Roma '), 'Rossi\u0000Roma');
  assert.notEqual(playerKey('Rossi', 'Roma'), playerKey('Rossi', 'Milan'));
});

test('age is derived around the birthday using UTC calendar dates', () => {
  assert.equal(calculateAge('2000-09-05', new Date('2026-09-06T00:00:00Z')), 26);
  assert.equal(calculateAge('2000-09-07', new Date('2026-09-06T00:00:00Z')), 25);
});

test('29 February changes age on 1 March in a non-leap year', () => {
  assert.equal(calculateAge('2000-02-29', new Date('2025-02-28T12:00:00Z')), 24);
  assert.equal(calculateAge('2000-02-29', new Date('2025-03-01T00:00:00Z')), 25);
});

test('missing DOB is explicitly resolved from legacy age without inventing a date', () => {
  assert.deepEqual(resolvePlayerAge({dateOfBirth: null, legacyAge: 31}), {age: 31, basis: 'legacy', fallback: true});
  assert.deepEqual(resolvePlayerAge({dateOfBirth: null}), {age: null, basis: 'missing', fallback: false});
  assert.equal(applyDynamicAges([{dateOfBirth: '2000-01-01', legacyAge: 12}], new Date('2026-01-02'))[0].age, 26);
});
