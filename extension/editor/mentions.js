// Handwritten mentions ("Lu et approuvé", date...): sidebar panel, text
// dialog, style preferences, and the on-page rendering of a text placement.
import { storageGet, storageSet } from './platform.js';
import { FONTS, INK_COLORS, fontById, colorById, measureText } from './fonts.js';
import { fillDate, splitLines, lineBaselines, normalizeText } from './text-layout.js';

const PREFS_KEY = 'mentionPrefs';
const PLACEHOLDER = '…';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_UNITS_PER_EM = 100; // avoids tiny font sizes inside the SVG

export const PRESETS = [
  'Lu et approuvé',
  'Bon pour accord',
  'Lu et approuvé, bon pour accord',
  'Le {date}',
  `Fait à ${PLACEHOLDER}, le {date}`,
];

const DEFAULT_PREFS = { fontId: FONTS[0].id, colorId: INK_COLORS[0].id, custom: [] };

/** SVG showing a text placement; it scales with the overlay box. */
export function renderTextContent(placement) {
  const font = fontById(placement.fontId);
  const lines = splitLines(placement.text);
  const box = measureText(placement.text, placement.fontId);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box.width * SVG_UNITS_PER_EM} ${box.height * SVG_UNITS_PER_EM}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('text-content');
  lineBaselines(lines.length, font).forEach((baseline, i) => {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', String(baseline * SVG_UNITS_PER_EM));
    text.setAttribute('font-family', font.family);
    text.setAttribute('font-size', String(SVG_UNITS_PER_EM));
    text.setAttribute('fill', colorById(placement.colorId).hex);
    text.textContent = lines[i];
    svg.append(text);
  });
  return svg;
}

/**
 * @param {object} args
 * @param {(text: string) => void} args.onPlace place a mention on the visible page
 * @param {(patch: { fontId?: string, colorId?: string }) => void} args.onStyleChange only what changed
 */
export async function createMentionsPanel({ onPlace, onStyleChange }) {
  const ui = {
    list: document.getElementById('mention-list'),
    newBtn: document.getElementById('mention-new'),
    fonts: document.getElementById('font-choice'),
    colors: document.getElementById('color-choice'),
    dialog: document.getElementById('text-dialog'),
    input: document.getElementById('text-input'),
    save: document.getElementById('text-save'),
    saveRow: document.getElementById('text-save-row'),
    title: document.getElementById('text-dialog-title'),
  };
  let prefs = { ...DEFAULT_PREFS, ...(await storageGet(PREFS_KEY, {})) };

  const savePrefs = async (patch) => {
    prefs = { ...prefs, ...patch };
    await storageSet(PREFS_KEY, prefs);
    render();
  };

  // The dialog answers through this callback; it does not rely on the
  // dialog's own "close" event, which is not always delivered promptly.
  let answer = null;
  const finish = (ok) => {
    if (!answer) return;
    const text = normalizeText(ui.input.value);
    const resolve = answer;
    answer = null;
    if (ui.dialog.open) ui.dialog.close();
    resolve(ok && text ? { text, save: ui.save.checked } : null);
  };
  ui.dialog.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    finish(event.submitter?.value === 'ok');
  });
  ui.dialog.addEventListener('cancel', (event) => {
    event.preventDefault(); // Escape
    finish(false);
  });
  ui.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      finish(true);
    }
  });

  /** Resolves with { text, save } or null when cancelled. */
  const askText = ({ initial = '', title = 'Écrire une mention', allowSave = true } = {}) =>
    new Promise((resolve) => {
      finish(false); // never leave an earlier request hanging
      answer = resolve;
      ui.title.textContent = title;
      ui.input.value = initial;
      ui.save.checked = false;
      ui.saveRow.hidden = !allowSave;
      ui.dialog.showModal();
      const at = initial.indexOf(PLACEHOLDER);
      if (at >= 0) ui.input.setSelectionRange(at, at + PLACEHOLDER.length);
      else ui.input.setSelectionRange(initial.length, initial.length);
      ui.input.focus();
    });

  const useMention = async (template) => {
    if (!template.includes(PLACEHOLDER)) {
      onPlace(fillDate(template));
      return;
    }
    const result = await askText({ initial: template, title: 'Compléter la mention' });
    if (!result) return;
    if (result.save) await savePrefs({ custom: [...prefs.custom, result.text] });
    onPlace(fillDate(result.text));
  };

  const writeMention = async () => {
    const result = await askText();
    if (!result) return;
    if (result.save) await savePrefs({ custom: [...prefs.custom, result.text] });
    onPlace(fillDate(result.text));
  };

  const chip = (template, removable) => {
    const li = document.createElement('li');
    li.className = 'mention-item';
    const button = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'mention-chip',
      textContent: fillDate(template),
      title: 'Poser cette mention sur la page affichée',
    });
    button.style.fontFamily = `"${fontById(prefs.fontId).family}", cursive`;
    button.style.color = colorById(prefs.colorId).hex;
    button.addEventListener('click', () => useMention(template));
    li.append(button);
    if (removable) {
      const remove = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'mention-remove',
        textContent: '✕',
        title: 'Retirer de mes mentions',
      });
      remove.setAttribute('aria-label', `Retirer « ${template} » de mes mentions`);
      remove.addEventListener('click', () => savePrefs({ custom: prefs.custom.filter((t) => t !== template) }));
      li.append(remove);
    }
    return li;
  };

  const choice = ({ label, selected, onClick, style, className }) => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className, title: label });
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', label);
    Object.assign(button.style, style);
    button.addEventListener('click', onClick);
    return button;
  };

  function render() {
    ui.list.replaceChildren(...PRESETS.map((t) => chip(t, false)), ...prefs.custom.map((t) => chip(t, true)));
    ui.fonts.replaceChildren(
      ...FONTS.map((font) => {
        const button = choice({
          label: `Police ${font.label}`,
          selected: font.id === prefs.fontId,
          className: 'font-option',
          style: { fontFamily: `"${font.family}", cursive` },
          onClick: () => selectStyle({ fontId: font.id }),
        });
        button.textContent = font.label;
        return button;
      }),
    );
    ui.colors.replaceChildren(
      ...INK_COLORS.map((color) =>
        choice({
          label: color.label,
          selected: color.id === prefs.colorId,
          className: 'color-option',
          style: { background: color.hex },
          onClick: () => selectStyle({ colorId: color.id }),
        }),
      ),
    );
  }

  async function selectStyle(patch) {
    await savePrefs(patch);
    onStyleChange(patch);
  }

  ui.newBtn.addEventListener('click', writeMention);
  render();

  return {
    style: () => ({ fontId: prefs.fontId, colorId: prefs.colorId }),
    /** Opens the dialog to edit an existing text; resolves with the new text or null. */
    editText: async (text) => (await askText({ initial: text, title: 'Modifier la mention', allowSave: false }))?.text ?? null,
    /** Reflects the style of the selected mention in the panel, without saving it. */
    showStyle: ({ fontId, colorId }) => {
      ui.fonts.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(FONTS[i].id === fontId)));
      ui.colors
        .querySelectorAll('button')
        .forEach((b, i) => b.setAttribute('aria-pressed', String(INK_COLORS[i].id === colorId)));
    },
    rerender: render,
  };
}

