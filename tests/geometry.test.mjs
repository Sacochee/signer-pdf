import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  placementToDrawParams,
  clampPlacement,
  movePlacement,
  resizePlacement,
  createPlacement,
  reshapePlacement,
  stackBelowSameSpot,
  normalizeRotation,
} from '../extension/editor/geometry.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** Builds a one-page PDF with the given size / rotation / crop offset, read back by pdf.js. */
async function viewFor({ width, height, rotation, origin = [0, 0] }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  page.setMediaBox(origin[0], origin[1], width, height);
  page.setRotation(degrees(rotation));
  const bytes = await doc.save();
  const pdf = await getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pdfPage = await pdf.getPage(1);
  const viewport = pdfPage.getViewport({ scale: 1 });
  return {
    viewport,
    view: {
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation,
      toPdfPoint: (x, y) => viewport.convertToPdfPoint(x, y),
    },
  };
}

/** Corners of the image as drawn by pdf-lib (rotation about the anchor, CCW). */
function drawnCorners({ x, y, width, height, rotation }) {
  const r = (rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const at = (u, v) => [x + u * cos - v * sin, y + u * sin + v * cos];
  return { bottomLeft: at(0, 0), topLeft: at(0, height), topRight: at(width, height) };
}

for (const rotation of [0, 90, 180, 270]) {
  test(`signature lands exactly where it was placed (page rotation ${rotation}°)`, async () => {
    const { viewport, view } = await viewFor({ width: 595, height: 842, rotation, origin: [10, 20] });
    const placement = { x: 0.6, y: 0.75, w: 0.25, h: 0.08 };

    const params = placementToDrawParams(placement, view);
    const corners = drawnCorners(params);

    // Map the drawn image back to screen space: its visual top-left must be
    // the placement's top-left, and its top-right must be to the right of it.
    const [tlX, tlY] = viewport.convertToViewportPoint(...corners.topLeft);
    const [trX, trY] = viewport.convertToViewportPoint(...corners.topRight);
    const [blX, blY] = viewport.convertToViewportPoint(...corners.bottomLeft);

    assert.ok(close(tlX, placement.x * view.width), `top-left x ${tlX}`);
    assert.ok(close(tlY, placement.y * view.height), `top-left y ${tlY}`);
    assert.ok(close(trX, (placement.x + placement.w) * view.width), `top-right x ${trX}`);
    assert.ok(close(trY, tlY), 'image is not tilted');
    assert.ok(close(blY, (placement.y + placement.h) * view.height), `bottom y ${blY}`);
    assert.ok(close(blX, tlX), 'image is not skewed');
  });
}

test('normalizeRotation handles negative and >360 values', () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(0), 0);
});

test('clampPlacement keeps the signature inside the page and does not mutate', () => {
  const original = { id: 'a', x: 0.9, y: -0.1, w: 0.3, h: 0.1 };
  const clamped = clampPlacement(original);
  assert.deepEqual(clamped, { id: 'a', x: 0.7, y: 0, w: 0.3, h: 0.1 });
  assert.equal(original.x, 0.9);
});

test('clampPlacement never distorts the signature', () => {
  const tooTall = clampPlacement({ x: 0, y: 0, w: 0.5, h: 1.5 });
  assert.ok(close(tooTall.h, 1));
  assert.ok(close(tooTall.h / tooTall.w, 3));

  const veryWide = clampPlacement({ x: 0, y: 0, w: 0.1, h: 0.01 });
  assert.ok(close(veryWide.h / veryWide.w, 0.1));
  assert.ok(veryWide.h >= 0.02 - 1e-9 || veryWide.w === 1);
});

test('movePlacement applies the delta then clamps', () => {
  const moved = movePlacement({ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, 0.05, 2);
  assert.ok(close(moved.x, 0.15));
  assert.ok(close(moved.y, 0.9));
});

test('resizePlacement keeps the image aspect ratio and stays on the page', () => {
  const pageAspect = 595 / 842;
  const aspect = 3; // 3:1 signature
  const resized = resizePlacement({ x: 0.1, y: 0.1, w: 0.2, h: (0.2 * pageAspect) / 3 }, 0.1, pageAspect, aspect);
  assert.ok(close(resized.w, 0.3));
  assert.ok(close((resized.w * 595) / (resized.h * 842), aspect));

  const huge = resizePlacement({ x: 0.5, y: 0.1, w: 0.2, h: 0.05 }, 5, pageAspect, aspect);
  assert.ok(huge.x + huge.w <= 1 + 1e-9);
  assert.ok(huge.y + huge.h <= 1 + 1e-9);
});

test('createPlacement centres the signature with the requested width in points', () => {
  const view = { width: 595, height: 842 };
  const p = createPlacement({ id: 'p', signatureId: 's', pageIndex: 2, cx: 0.5, cy: 0.5, view, aspect: 3, widthPt: 150 });
  assert.ok(close(p.w * 595, 150));
  assert.ok(close(p.x + p.w / 2, 0.5));
  assert.ok(close((p.w * 595) / (p.h * 842), 3));
  assert.equal(p.pageIndex, 2);
});

test('createPlacement keeps the content fields and records the aspect', () => {
  const view = { width: 595, height: 842 };
  const p = createPlacement({ id: 't', kind: 'text', text: 'Lu', pageIndex: 0, cx: 0.5, cy: 0.5, view, aspect: 4, widthPt: 100 });
  assert.equal(p.kind, 'text');
  assert.equal(p.text, 'Lu');
  assert.equal(p.aspect, 4);
});

test('reshapePlacement keeps the height (font size) and the top-left corner', () => {
  const view = { width: 595, height: 842 };
  const p = createPlacement({ id: 't', pageIndex: 0, cx: 0.5, cy: 0.5, view, aspect: 4, widthPt: 100 });
  const longer = reshapePlacement(p, view, 8);
  assert.ok(close(longer.h, p.h));
  assert.ok(close(longer.w * 595, 200));
  assert.equal(longer.x, p.x);
  assert.equal(longer.y, p.y);
  assert.equal(longer.aspect, 8);

  const twoLines = reshapePlacement(p, view, 2, 2);
  assert.ok(close(twoLines.h, p.h * 2));
  assert.ok(close((twoLines.w * 595) / (twoLines.h * 842), 2));
});

test('stackBelowSameSpot moves a new item below the ones at the same spot', () => {
  const a = { id: 'a', pageIndex: 0, x: 0.4, y: 0.5, w: 0.2, h: 0.02 };
  const b = { id: 'b', pageIndex: 0, x: 0.4, y: 0.5 + 0.02 + 0.006, w: 0.2, h: 0.02 };
  const fresh = { id: 'c', pageIndex: 0, x: 0.4, y: 0.5, w: 0.2, h: 0.02 };
  const placed = stackBelowSameSpot(fresh, [a, b]);
  assert.ok(close(placed.y, b.y + 0.02 + 0.006));
  assert.equal(stackBelowSameSpot(fresh, [{ ...a, pageIndex: 1 }]), fresh, 'other page: unchanged');
});
