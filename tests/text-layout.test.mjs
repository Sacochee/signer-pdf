import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, splitLines, fillDate, textBox, lineBaselines, textLineOrigins } from '../extension/editor/text-layout.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const metrics = { ascent: 1, descent: 0.5 };

test('normalizeText trims edges and unifies newlines', () => {
  assert.equal(normalizeText('\n\nLu et approuvé   \r\nBon pour accord\n\n'), 'Lu et approuvé\nBon pour accord');
  assert.equal(normalizeText('x'.repeat(500)).length, 300);
});

test('splitLines returns one entry per line', () => {
  assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
});

test('fillDate uses the French day/month/year format', () => {
  assert.equal(fillDate('Fait à Paris, le {date}', new Date(2026, 9, 4)), 'Fait à Paris, le 04/10/2026');
  assert.equal(fillDate('sans date'), 'sans date');
});

test('textBox uses the widest line and the font line height', () => {
  const box = textBox(['ab', 'abcd'], (line) => line.length * 0.5, metrics);
  assert.deepEqual(box, { width: 2, height: 3, lineHeight: 1.5 });
});

test('lineBaselines are spaced by the line height', () => {
  assert.deepEqual(lineBaselines(3, metrics), [1, 2.5, 4]);
});

test('textLineOrigins: unrotated, first line baseline below the box top', () => {
  // box of 2 lines at size 10 => 30 pt high, anchor at its bottom-left (100, 200)
  const origins = textLineOrigins({ x: 100, y: 200, rotation: 0 }, 10, 2, metrics);
  assert.deepEqual(origins, [
    [100, 220], // top line: baseline 10 pt under the top (230)
    [100, 205],
  ]);
});

test('textLineOrigins: rotated 90°, lines move along -x like the image frame', () => {
  const [[x1, y1], [x2, y2]] = textLineOrigins({ x: 100, y: 200, rotation: 90 }, 10, 2, metrics);
  assert.ok(close(x1, 80) && close(y1, 200));
  assert.ok(close(x2, 95) && close(y2, 200));
});
