// Getting document bytes: from a tab URL, a picked file or a dropped file.
import { PDFDocument } from '../vendor/pdf-lib.esm.min.js';

const MAX_DOC_BYTES = 200 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg'];
const CSS_PX_TO_PT = 72 / 96;

export class FileAccessError extends Error {}
export class NotPdfError extends Error {}

export function looksLikePdf(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

export function fileNameFromUrl(url) {
  try {
    const last = new URL(url, globalThis.location?.href).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'document.pdf';
  } catch {
    return 'document.pdf';
  }
}

export function nameFromContentDisposition(header) {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // fall through to the plain filename
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

const FETCH_TIMEOUT_MS = 60_000;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'file:'];

/** Protocol of a URL ('file:', 'https:'...), or null when it is not usable. */
export function sourceProtocol(url) {
  try {
    const { protocol } = new URL(url, globalThis.location?.href);
    return ALLOWED_PROTOCOLS.includes(protocol) ? protocol : null;
  } catch {
    return null;
  }
}

/**
 * Downloads the document behind a tab URL. XHR (not fetch) because it is the
 * only way to read file:// URLs from an extension page.
 */
export function fetchDocument(url, { fileAccess = true } = {}) {
  const protocol = sourceProtocol(url);
  if (!protocol) return Promise.reject(new NotPdfError("Cette adresse ne peut pas être ouverte."));
  const isFile = protocol === 'file:';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.withCredentials = true;
    xhr.timeout = FETCH_TIMEOUT_MS;
    xhr.onprogress = (event) => {
      if (event.loaded > MAX_DOC_BYTES) {
        xhr.abort();
        reject(new Error('Document trop lourd (200 Mo maximum).'));
      }
    };
    xhr.ontimeout = () => reject(new Error('Le serveur met trop de temps à répondre.'));
    xhr.onload = () => {
      const ok = xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300);
      if (!ok || !xhr.response) {
        reject(new Error(`Le document n'a pas pu être téléchargé (erreur ${xhr.status}).`));
        return;
      }
      const bytes = new Uint8Array(xhr.response);
      if (!looksLikePdf(bytes)) {
        reject(new NotPdfError("Cet onglet n'affiche pas un fichier PDF."));
        return;
      }
      const header = isFile ? null : xhr.getResponseHeader('Content-Disposition');
      resolve({ bytes, name: nameFromContentDisposition(header) || fileNameFromUrl(url) });
    };
    xhr.onerror = () => {
      if (isFile && !fileAccess) {
        reject(new FileAccessError("Chrome bloque l'accès aux fichiers de ton ordinateur pour cette extension."));
      } else if (isFile) {
        reject(new Error("Le fichier est introuvable (déplacé ou renommé ?)."));
      } else {
        reject(new Error("Le document n'a pas pu être téléchargé (réseau ou accès refusé)."));
      }
    };
    xhr.send();
  });
}

/** Reads a picked / dropped file. Images become a one-page PDF. */
export async function readLocalFile(file) {
  if (file.size > MAX_DOC_BYTES) throw new Error('Fichier trop lourd (200 Mo maximum).');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (IMAGE_TYPES.includes(file.type)) {
    return { bytes: await imageToPdf(bytes, file.type), name: file.name.replace(/\.[^.]+$/, '.pdf') };
  }
  if (!looksLikePdf(bytes)) {
    throw new NotPdfError('Ce fichier n\'est ni un PDF ni une image PNG/JPG.');
  }
  return { bytes, name: file.name };
}

async function imageToPdf(bytes, type) {
  const doc = await PDFDocument.create();
  const image = type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const width = image.width * CSS_PX_TO_PT;
  const height = image.height * CSS_PX_TO_PT;
  doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  return doc.save();
}
