// Pure geometry helpers: no DOM, no chrome APIs (unit-tested under Node).

export const MIN_SIZE_FRACTION = 0.02;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * A placement is stored as fractions (0..1) of the page as displayed
 * (i.e. after the page's own /Rotate is applied). This makes it independent
 * of zoom level and lets the overlay be positioned with plain CSS percentages.
 *
 * `view` describes the page at scale 1 (1 viewport px === 1 PDF point):
 *   { width, height, rotation, toPdfPoint(x, y) => [pdfX, pdfY] }
 *
 * Returns the options for pdf-lib's `page.drawImage`. The anchor is the
 * image's visual bottom-left corner; rotating by the page rotation
 * (counter-clockwise in PDF space) cancels the viewer's clockwise rotation,
 * so the signature always appears upright.
 */
export function placementToDrawParams(placement, view) {
  const left = placement.x * view.width;
  const top = placement.y * view.height;
  const width = placement.w * view.width;
  const height = placement.h * view.height;
  const [x, y] = view.toPdfPoint(left, top + height);
  return { x, y, width, height, rotation: normalizeRotation(view.rotation) };
}

export function normalizeRotation(rotation) {
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

/**
 * Keeps a placement fully inside the page without distorting it: the size is
 * scaled as a whole (h / w stays constant). Returns a new object.
 */
export function clampPlacement(placement) {
  const ratio = placement.h / placement.w;
  const minW = Math.max(MIN_SIZE_FRACTION, MIN_SIZE_FRACTION / ratio);
  const maxW = Math.min(1, 1 / ratio);
  const w = Math.min(Math.max(placement.w, minW), maxW);
  const h = w * ratio;
  return {
    ...placement,
    w,
    h,
    x: clamp(placement.x, 0, 1 - w),
    y: clamp(placement.y, 0, 1 - h),
  };
}

/** Moves a placement by a delta expressed in page fractions. */
export function movePlacement(placement, dx, dy) {
  return clampPlacement({ ...placement, x: placement.x + dx, y: placement.y + dy });
}

/**
 * Resizes from the bottom-right corner, keeping the aspect ratio of the signature or text.
 * `pageAspect` is pageWidth / pageHeight (needed because fractions of width
 * and height are not the same unit).
 */
export function resizePlacement(placement, dxFraction, pageAspect, aspect) {
  const maxW = Math.min(1 - placement.x, ((1 - placement.y) * aspect) / pageAspect);
  const w = clamp(placement.w + dxFraction, MIN_SIZE_FRACTION, maxW);
  const h = (w * pageAspect) / aspect;
  return { ...placement, w, h };
}

/**
 * Creates a placement centred on (cx, cy) (page fractions) with a target
 * width in PDF points. `aspect` is the content's width / height; any other
 * field (kind, signatureId, text...) is copied as is.
 */
export function createPlacement({ cx, cy, view, aspect, widthPt, ...content }) {
  const pageAspect = view.width / view.height;
  const w = Math.min(widthPt / view.width, 0.9);
  const h = (w * pageAspect) / aspect;
  return clampPlacement({ ...content, aspect, x: cx - w / 2, y: cy - h / 2, w, h });
}

const STACK_GAP = 0.3; // fraction of the new item's height
const MAX_STACK = 20;

const overlaps = (a, b) =>
  a.pageIndex === b.pageIndex && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Items added one after the other land on the same spot (centre of the
 * visible page): move the new one below whatever it would cover.
 */
export function stackBelowSameSpot(placement, existing) {
  let current = placement;
  for (let i = 0; i < MAX_STACK; i += 1) {
    const blocker = existing.find((p) => overlaps(p, current));
    if (!blocker) return current;
    const next = clampPlacement({ ...current, y: blocker.y + blocker.h + current.h * STACK_GAP });
    if (next.y === current.y) return current; // reached the bottom of the page
    current = next;
  }
  return current;
}

/**
 * Same placement with content of a new aspect ratio (edited text, other
 * font), keeping its height in points (i.e. the font size) and its top-left.
 */
export function reshapePlacement(placement, view, newAspect, heightScale = 1) {
  const h = placement.h * heightScale;
  const w = (h * newAspect * view.height) / view.width;
  return clampPlacement({ ...placement, aspect: newAspect, w, h });
}
