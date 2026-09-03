import test from 'node:test';import assert from 'node:assert/strict';
import {applyProContro,normalizeProControRuns} from '../src/pro-contro-data.js';
test('scraper data overrides stale workbook values by stable id',()=>assert.equal(applyProContro([{id:'7',pro:'old'}],[{id:7,pro:'new',contro:'safe'}])[0].pro,'new'));
test('invalid history is safe',()=>assert.deepEqual(normalizeProControRuns([]),{runs:[]}));
