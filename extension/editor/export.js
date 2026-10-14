// Writes the signatures and mentions into the original PDF with pdf-lib.
import { PDFDocument, degrees, rgb } from '../vendor/pdf-lib.esm.min.js';
import { placementToDrawParams } from './geometry.js';
import { splitLines, textLineOrigins } from './text-layout.js';
import { fontById, colorById, fontBytes, loadFontkit } from './fonts.js';

async function loadEditable(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (/encrypt/i.test(String(error?.message))) {
      throw new Error('Ce PDF est protégé par son auteur : il ne peut pas être modifié.');
    }
    throw new Error("Ce PDF est dans un format qui ne peut pas être modifié.");
  }
}

/**
 * Called when a document is opened, so problems show up before the user
 * places anything. Throws a user-facing error when the PDF cannot be edited.
 */
export async function inspectDocument(bytes) {
  await loadEditable(bytes);
  // A certified / digitally signed PDF keeps a /ByteRange in its signature dictionary.
  const text = new TextDecoder('latin1').decode(bytes);
  return { hasDigitalSignature: text.includes('/ByteRange') };
}

/** Memoises one async embed per key (a signature image, a font). */
function embedCache(embed) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) cache.set(key, embed(key));
    return cache.get(key);
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function buildSignedPdf({ bytes, placements, signatures, views }) {
  const doc = await loadEditable(bytes);
  if (placements.some((p) => p.kind === 'text')) doc.registerFontkit(await loadFontkit());

  const imageFor = embedCache(async (signatureId) => {
    const signature = signatures.find((s) => s.id === signatureId);
    if (!signature) throw new Error('Une signature placée a été supprimée entre-temps.');
    return doc.embedPng(signature.dataUrl);
  });
  // subset: false because pdf-lib's subsetting drops glyphs of some fonts (Kalam).
  const fontFor = embedCache(async (fontId) => doc.embedFont(await fontBytes(fontId), { subset: false }));

  for (const placement of placements) {
    const view = views[placement.pageIndex];
    const page = doc.getPage(placement.pageIndex);
    const { rotation, ...params } = placementToDrawParams(placement, view);

    if (placement.kind === 'text') {
      const font = fontById(placement.fontId);
      const lines = splitLines(placement.text);
      const size = params.height / (lines.length * (font.ascent + font.descent));
      const pdfFont = await fontFor(font.id);
      const color = hexToRgb(colorById(placement.colorId).hex);
      textLineOrigins({ x: params.x, y: params.y, rotation }, size, lines.length, font).forEach(([x, y], i) => {
        page.drawText(lines[i], { x, y, size, font: pdfFont, color, rotate: degrees(rotation) });
      });
    } else {
      page.drawImage(await imageFor(placement.signatureId), { ...params, rotate: degrees(rotation) });
    }
  }

  return doc.save();
}

export function signedFileName(originalName) {
  const base = originalName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'document';
  return `${base.replace(/^\.+/, '')} - signé.pdf`;
}
