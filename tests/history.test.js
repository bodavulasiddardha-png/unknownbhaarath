import assert from 'node:assert';
import { test } from 'node:test';
import { isDuplicate } from '../src/history.js';

const history = ['India GDP Hits 4T', 'ISRO Launched 104 Satellites', 'Hyderabad Adds 40000 Jobs'];

test('exact duplicate detected', () => {
  assert.strictEqual(isDuplicate('India GDP Hits 4T', history), true);
});

test('number-only difference is NOT a duplicate', () => {
  assert.strictEqual(isDuplicate('India GDP Hits 5T', history), false);
});

test('completely new headline is not duplicate', () => {
  assert.strictEqual(isDuplicate('India Wins Cricket World Cup', history), false);
});

test('near-identical wording detected', () => {
  assert.strictEqual(isDuplicate('ISRO Launched 104 Satellites', history), true);
});

test('empty history means nothing is duplicate', () => {
  assert.strictEqual(isDuplicate('Any headline here', []), false);
});
