import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractInk, alphaBoundingBox, padBox, fitScale } from '../extension/editor/image-math.js';

/**
 * Synthetic "phone photo": grey paper with a lighting gradient (175 → 215),
 * a dot grid every 20 px (2x2 dark dots) and a thick blue stroke.
 */
function photo(width = 200, height = 120) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const set = (x, y, [r, g, b]) => rgba.set([r, g, b, 255], (y * width + x) * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const paper = Math.round(175 + (40 * x) / width);
      set(x, y, [paper, paper, paper - 4]);
    }
  }
  for (let y = 5; y < height; y += 20) {
    for (let x = 5; x < width; x += 20) {
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => set(x + dx, y + dy, [90, 90, 90]));
    }
  }
  for (let x = 30; x < 170; x += 1) {
    for (let y = 58; y < 64; y += 1) set(x, y, [60, 60, 190]);
  }
  return { rgba, width, height };
}

const alphaAt = (rgba, width, x, y) => rgba[(y * width + x) * 4 + 3];

test('extractInk removes grey, unevenly lit paper', () => {
  const { rgba, width, height } = photo();
  const out = extractInk(rgba, width, height, { cell: 16 });
  assert.equal(alphaAt(out, width, 10, 10), 0, 'dark side of the paper');
  assert.equal(alphaAt(out, width, 190, 100), 0, 'bright side of the paper');
});

test('extractInk keeps the signature stroke opaque', () => {
  const { rgba, width, height } = photo();
  const out = extractInk(rgba, width, height, { cell: 16 });
  assert.equal(alphaAt(out, width, 100, 60), 255);
  assert.equal(alphaAt(out, width, 35, 61), 255);
});

test('extractInk drops the dot grid, so the crop is just the signature', () => {
  const { rgba, width, height } = photo();
  const out = extractInk(rgba, width, height, { cell: 16 });
  assert.equal(alphaAt(out, width, 5, 5), 0, 'grid dot removed');
  const box = alphaBoundingBox(out, width, height);
  assert.deepEqual(box, { x: 30, y: 58, width: 140, height: 6 });
});

test('extractInk treats transparent pixels as paper and does not mutate', () => {
  const width = 60;
  const height = 20;
  const rgba = new Uint8ClampedArray(width * height * 4); // fully transparent black
  for (let x = 10; x < 50; x += 1) {
    for (let y = 8; y < 12; y += 1) rgba.set([20, 20, 20, 255], (y * width + x) * 4);
  }
  const copy = new Uint8ClampedArray(rgba);
  const out = extractInk(rgba, width, height, { cell: 16 });
  assert.equal(alphaAt(out, width, 2, 2), 0);
  assert.equal(alphaAt(out, width, 30, 10), 255);
  assert.deepEqual(rgba, copy);
});

test('alphaBoundingBox finds the visible content', () => {
  const data = new Uint8ClampedArray(4 * 3 * 4);
  data[(1 * 4 + 1) * 4 + 3] = 255;
  data[(2 * 4 + 2) * 4 + 3] = 255;
  assert.deepEqual(alphaBoundingBox(data, 4, 3), { x: 1, y: 1, width: 2, height: 2 });
});

test('alphaBoundingBox returns null for an empty image', () => {
  assert.equal(alphaBoundingBox(new Uint8ClampedArray(16), 2, 2), null);
});

test('padBox grows the box without leaving the image', () => {
  assert.deepEqual(padBox({ x: 1, y: 1, width: 2, height: 2 }, 5, 4, 3), { x: 0, y: 0, width: 4, height: 3 });
  assert.deepEqual(padBox({ x: 10, y: 10, width: 5, height: 5 }, 2, 100, 100), { x: 8, y: 8, width: 9, height: 9 });
});

test('fitScale only shrinks', () => {
  assert.equal(fitScale(4000, 1000, 2000), 0.5);
  assert.equal(fitScale(300, 100, 2000), 1);
});
