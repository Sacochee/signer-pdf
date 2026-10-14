// Saved signatures: import (PNG / JPG / WebP / SVG), clean-up, storage.
import { storageGet, storageSet } from './platform.js';
import { extractInk, alphaBoundingBox, padBox, fitScale } from './image-math.js';

const STORAGE_KEY = 'signatures';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_DIM = 1600;
const SVG_RENDER_WIDTH = 1600;
const CROP_PADDING = 6;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export async function listSignatures() {
  const list = await storageGet(STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function addSignature(file, { removeBackground }) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Format non pris en charge. Utilise une image PNG, JPG, WebP ou SVG.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image trop lourde (15 Mo maximum).');
  }
  const image = await loadImage(file);
  const png = rasterize(image, { removeBackground });
  const signature = {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ''),
    createdAt: Date.now(),
    ...png,
  };
  const next = [...(await listSignatures()), signature];
  await storageSet(STORAGE_KEY, next);
  return { signature, signatures: next };
}

export async function removeSignature(id) {
  const next = (await listSignatures()).filter((s) => s.id !== id);
  await storageSet(STORAGE_KEY, next);
  return next;
}

async function loadImage(file) {
  const blob = file.type === 'image/svg+xml' ? await sizedSvgBlob(file) : file;
  const url = URL.createObjectURL(blob);
  try {
    // onload rather than image.decode(): decode() can stay pending in a background tab.
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty');
    return image;
  } catch {
    throw new Error("Impossible de lire cette image. Vérifie que le fichier n'est pas abîmé.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** SVGs often have no intrinsic size; give them one so they render sharply. */
async function sizedSvgBlob(file) {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg') {
    throw new Error('Ce fichier SVG est invalide.');
  }
  const viewBox = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const [vbWidth, vbHeight] = viewBox.length === 4 ? viewBox.slice(2) : [];
  const width = parseFloat(svg.getAttribute('width')) || vbWidth || 300;
  const height = parseFloat(svg.getAttribute('height')) || vbHeight || 100;
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(SVG_RENDER_WIDTH));
  svg.setAttribute('height', String(Math.round((SVG_RENDER_WIDTH * height) / width)));
  return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
}

/** Draws the image, optionally removes the paper, crops to the ink, returns a PNG. */
function rasterize(image, { removeBackground }) {
  const scale = fitScale(image.naturalWidth, image.naturalHeight, MAX_DIM);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const cleaned = removeBackground ? extractInk(pixels, width, height) : pixels;
  const box = alphaBoundingBox(cleaned, width, height);
  if (!box) throw new Error("L'image semble vide une fois le fond retiré. Essaie en décochant « Retirer le fond ».");
  const crop = padBox(box, CROP_PADDING, width, height);

  const out = document.createElement('canvas');
  out.width = crop.width;
  out.height = crop.height;
  out.getContext('2d').putImageData(new ImageData(cleaned, width, height), -crop.x, -crop.y);
  return { dataUrl: out.toDataURL('image/png'), width: crop.width, height: crop.height };
}
