// Pure pixel helpers working on RGBA arrays (unit-tested under Node).

const DEFAULT_INK = {
  low: 14, // darker than the local paper by less than this: paper
  high: 45, // darker by more than this: fully opaque ink
  backgroundPercentile: 0.7,
  minAreaRatio: 0.03, // specks smaller than 3 % of the main stroke are dropped
  minArea: 40,
};

const luminanceOverWhite = (rgba, i) => {
  const a = rgba[i + 3] / 255;
  const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return lum * a + 255 * (1 - a); // transparent pixels count as white paper
};

/**
 * Isolates the ink of a photographed / scanned signature. Returns a new RGBA
 * array where the paper is transparent.
 *
 * - The paper brightness is estimated locally (grid of cells), so grey paper,
 *   shadows and uneven lighting are handled.
 * - A pixel's opacity depends on how much darker than the local paper it is.
 * - Small isolated specks (dot grid, dust, paper grain) are removed.
 */
export function extractInk(rgba, width, height, options = {}) {
  const opts = { ...DEFAULT_INK, ...options };
  const count = width * height;
  const lum = new Float32Array(count);
  for (let p = 0; p < count; p += 1) lum[p] = luminanceOverWhite(rgba, p * 4);

  const cell = options.cell ?? Math.max(16, Math.round(Math.max(width, height) / 50));
  const background = estimateBackground(lum, width, height, cell, opts.backgroundPercentile);

  const strength = new Float32Array(count);
  for (let p = 0; p < count; p += 1) {
    const darker = background[p] - lum[p];
    strength[p] = Math.min(Math.max((darker - opts.low) / (opts.high - opts.low), 0), 1);
  }

  const keep = keepLargeComponents(strength, width, height, opts);
  const out = new Uint8ClampedArray(rgba);
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const alpha = keep[p] ? strength[p] : 0;
    out[i + 3] = Math.round(rgba[i + 3] * alpha);
    if (alpha > 0 && alpha < 1) {
      // Edge pixels are a mix of ink and paper: remove the paper part so the
      // stroke keeps its real colour instead of a greyish halo.
      for (let c = 0; c < 3; c += 1) out[i + c] = background[p] - (background[p] - rgba[i + c]) / alpha;
    }
  }
  return out;
}

/**
 * Paper brightness for every pixel: a high percentile of each cell (ink is a
 * minority of a cell), bilinearly interpolated between cell centres.
 */
export function estimateBackground(lum, width, height, cell, percentile) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const grid = new Float32Array(cols * rows);
  const histogram = new Uint32Array(256);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      histogram.fill(0);
      const x1 = Math.min(width, (col + 1) * cell);
      const y1 = Math.min(height, (row + 1) * cell);
      let total = 0;
      for (let y = row * cell; y < y1; y += 1) {
        for (let x = col * cell; x < x1; x += 1) {
          histogram[Math.round(lum[y * width + x])] += 1;
          total += 1;
        }
      }
      const target = total * percentile;
      let seen = 0;
      let level = 0;
      while (level < 255 && seen + histogram[level] < target) {
        seen += histogram[level];
        level += 1;
      }
      grid[row * cols + col] = level;
    }
  }

  const out = new Float32Array(width * height);
  const at = (c, r) => grid[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  for (let y = 0; y < height; y += 1) {
    const gy = (y + 0.5) / cell - 0.5;
    const r0 = Math.floor(gy);
    const fy = gy - r0;
    for (let x = 0; x < width; x += 1) {
      const gx = (x + 0.5) / cell - 0.5;
      const c0 = Math.floor(gx);
      const fx = gx - c0;
      const top = at(c0, r0) * (1 - fx) + at(c0 + 1, r0) * fx;
      const bottom = at(c0, r0 + 1) * (1 - fx) + at(c0 + 1, r0 + 1) * fx;
      out[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/**
 * 8-connected components of the pixels with strength > 0. Keeps the ones whose
 * area is at least `minAreaRatio` of the largest (and at least `minArea` px).
 * Returns a Uint8Array mask (1 = keep).
 */
export function keepLargeComponents(strength, width, height, { minAreaRatio, minArea }) {
  const count = width * height;
  const labels = new Int32Array(count).fill(-1);
  const areas = [];
  const stack = new Int32Array(count);

  for (let start = 0; start < count; start += 1) {
    if (strength[start] <= 0 || labels[start] !== -1) continue;
    const label = areas.length;
    let area = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    while (top > 0) {
      const p = stack[--top];
      area += 1;
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (strength[q] > 0 && labels[q] === -1) {
            labels[q] = label;
            stack[top++] = q;
          }
        }
      }
    }
    areas.push(area);
  }

  const largest = areas.reduce((max, a) => Math.max(max, a), 0);
  const threshold = Math.max(minArea, largest * minAreaRatio);
  const keep = new Uint8Array(count);
  for (let p = 0; p < count; p += 1) {
    if (labels[p] !== -1 && areas[labels[p]] >= threshold) keep[p] = 1;
  }
  return keep;
}

/**
 * Bounding box of pixels whose alpha is above `threshold`.
 * Returns null when the image is fully transparent.
 */
export function alphaBoundingBox(rgba, width, height, threshold = 12) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Grows a box by `padding` px on each side, staying inside the image. */
export function padBox(box, padding, width, height) {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  return {
    x,
    y,
    width: Math.min(width, box.x + box.width + padding) - x,
    height: Math.min(height, box.y + box.height + padding) - y,
  };
}

/** Scale factor so the longest side is at most `maxDim`. */
export function fitScale(width, height, maxDim) {
  const longest = Math.max(width, height);
  return longest > maxDim ? maxDim / longest : 1;
}
