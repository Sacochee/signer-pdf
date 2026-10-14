// Copies the PDF libraries into the extension (Manifest V3 forbids remote code).
import { mkdir, copyFile, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(root, 'extension', 'vendor');

const FILES = [
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['node_modules/pdf-lib/dist/pdf-lib.esm.min.js', 'pdf-lib.esm.min.js'],
  // UMD build: self-contained (the ESM build imports "pako" by bare name).
  ['node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js', 'fontkit.umd.min.js'],
];

// Font data pdf.js needs for PDFs that don't embed their fonts.
const DIRS = [
  ['node_modules/pdfjs-dist/cmaps', 'cmaps'],
  ['node_modules/pdfjs-dist/standard_fonts', 'standard_fonts'],
];

await mkdir(vendorDir, { recursive: true });
for (const [from, to] of FILES) {
  await copyFile(join(root, from), join(vendorDir, to));
  console.log(`vendor/${to}`);
}
for (const [from, to] of DIRS) {
  await cp(join(root, from), join(vendorDir, to), { recursive: true });
  console.log(`vendor/${to}/`);
}
