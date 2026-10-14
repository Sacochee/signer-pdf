// Pure text layout helpers for handwritten mentions (unit-tested under Node).
// All sizes are in "em": multiply by the font size (PDF points) to get points.

export const MAX_TEXT_LENGTH = 300;
const MIN_WIDTH_EM = 0.3;

/** Cleans user text: unified newlines, no trailing spaces, no empty edges. */
export function normalizeText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
    .slice(0, MAX_TEXT_LENGTH);
}

export function splitLines(text) {
  return normalizeText(text).split('\n');
}

/** Replaces the {date} token with the given date, French format (14/10/2026). */
export function fillDate(text, date = new Date()) {
  const formatted = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return text.replaceAll('{date}', formatted);
}

/**
 * Size of a text block at font size 1.
 * `measure(line)` returns the advance width of a line at size 1.
 * `metrics` = { ascent, descent } of the font, in em (descent positive).
 */
export function textBox(lines, measure, { ascent, descent }) {
  const lineHeight = ascent + descent;
  const width = Math.max(MIN_WIDTH_EM, ...lines.map(measure));
  return { width, height: lines.length * lineHeight, lineHeight };
}

/** Baseline of each line, measured from the top of the box, at size 1. */
export function lineBaselines(lineCount, { ascent, descent }) {
  const lineHeight = ascent + descent;
  return Array.from({ length: lineCount }, (_, i) => i * lineHeight + ascent);
}

/**
 * PDF origin (baseline start) of each line for pdf-lib's drawText.
 * `anchor` is the box's visual bottom-left corner and rotation, as returned by
 * placementToDrawParams; text is rotated about that corner like an image.
 */
export function textLineOrigins(anchor, size, lineCount, metrics) {
  const boxHeight = lineCount * (metrics.ascent + metrics.descent) * size;
  const r = (anchor.rotation * Math.PI) / 180;
  return lineBaselines(lineCount, metrics).map((baseline) => {
    const up = boxHeight - baseline * size; // distance from the box bottom
    return [anchor.x - up * Math.sin(r), anchor.y + up * Math.cos(r)];
  });
}
