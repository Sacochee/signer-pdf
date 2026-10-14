// Handwriting fonts: shown on screen with @font-face, embedded in the PDF
// with pdf-lib + fontkit. Both use the same bundled TTF files.
import { assetUrl } from './platform.js';
import { splitLines, textBox } from './text-layout.js';

// ascent / descent come from the font files (hhea), in em.
export const FONTS = [
  { id: 'kalam', label: 'Stylo', family: 'SignerKalam', file: 'fonts/Kalam-Regular.ttf', ascent: 1.063, descent: 0.531 },
  {
    id: 'homemade',
    label: 'Cursive',
    family: 'SignerHomemadeApple',
    file: 'fonts/HomemadeApple-Regular.ttf',
    ascent: 1.296,
    descent: 0.846,
  },
];

export const INK_COLORS = [
  { id: 'blue', label: 'Encre bleue', hex: '#1f2a7a' },
  { id: 'black', label: 'Encre noire', hex: '#1b1b1b' },
];

export const fontById = (id) => FONTS.find((f) => f.id === id) ?? FONTS[0];
export const colorById = (id) => INK_COLORS.find((c) => c.id === id) ?? INK_COLORS[0];

let webFontsReady;
/** Registers the fonts for on-screen rendering (overlays, buttons). */
export function loadWebFonts() {
  webFontsReady ??= Promise.all(
    FONTS.map(async (font) => {
      const face = new FontFace(font.family, `url("${assetUrl(font.file)}")`);
      document.fonts.add(await face.load());
    }),
  );
  return webFontsReady;
}

let measureContext;
/** Width / height (at font size 1) of a text block, measured with the real font. */
export function measureText(text, fontId) {
  const font = fontById(fontId);
  measureContext ??= document.createElement('canvas').getContext('2d');
  measureContext.font = `100px "${font.family}"`;
  const measure = (line) => measureContext.measureText(line).width / 100;
  return textBox(splitLines(text), measure, font);
}

const fontFiles = new Map();
export async function fontBytes(fontId) {
  const font = fontById(fontId);
  if (!fontFiles.has(font.id)) {
    const response = await fetch(assetUrl(font.file));
    if (!response.ok) throw new Error('Police introuvable dans l’extension.');
    fontFiles.set(font.id, await response.arrayBuffer());
  }
  return fontFiles.get(font.id);
}

let fontkitReady;
/** fontkit (needed by pdf-lib for custom fonts) is ~750 KB: loaded on first use. */
export function loadFontkit() {
  fontkitReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = assetUrl('vendor/fontkit.umd.min.js');
    script.onload = () => (window.fontkit ? resolve(window.fontkit) : reject(new Error('fontkit absent')));
    script.onerror = () => reject(new Error('Impossible de charger le moteur de polices.'));
    document.head.append(script);
  });
  return fontkitReady;
}
