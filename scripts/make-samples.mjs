// Dev only: builds dev/sample.pdf (3 pages, the last one rotated) and a
// sample signature SVG to try the editor with.
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const devDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dev');
await mkdir(devDir, { recursive: true });

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const titles = ['Contrat de location', 'Conditions générales', 'Annexe (page tournée)'];
titles.forEach((title, i) => {
  const page = doc.addPage([595, 842]);
  page.drawText(title, { x: 60, y: 770, size: 22, font });
  for (let line = 0; line < 22; line += 1) {
    page.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.', {
      x: 60, y: 720 - line * 22, size: 11, font, color: rgb(0.3, 0.3, 0.3),
    });
  }
  page.drawText('Signature :', { x: 340, y: 150, size: 12, font });
  page.drawLine({ start: { x: 340, y: 90 }, end: { x: 540, y: 90 }, thickness: 1 });
  if (i === 2) page.setRotation(degrees(90));
});
await writeFile(join(devDir, 'sample.pdf'), await doc.save());

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 110">
  <path d="M15 80 C 40 10, 55 10, 60 70 S 90 100, 100 50 S 130 20, 140 70 C 150 95, 170 40, 190 60 S 240 80, 285 35"
        fill="none" stroke="#1a2a6c" stroke-width="5" stroke-linecap="round"/>
</svg>`;
await writeFile(join(devDir, 'signature.svg'), svg);
console.log('dev/sample.pdf, dev/signature.svg');
