// Overlays on top of the pages (signatures and handwritten mentions):
// drag to move, corner to resize. The DOM is updated live while dragging;
// the editor state only changes once, on release (onCommit), with a new
// placement object.
import { movePlacement, resizePlacement } from './geometry.js';

const KEY_STEP = 0.004;
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * @param {object} args
 * @param {HTMLElement[]} args.wrappers page elements, indexed by page
 * @param {object[]} args.views page geometry, indexed by page
 * @param {object[]} args.placements
 * @param {(placement: object) => Element|null} args.renderContent what to show inside an overlay
 * @param {string|null} args.selectedId
 * @param {{ onCommit, onRemove, onSelect, onCopyToAllPages, onEdit }} args.handlers
 */
export function renderPlacements({ wrappers, views, placements, renderContent, selectedId, handlers }) {
  for (const wrapper of wrappers) {
    wrapper.querySelectorAll('.placement').forEach((el) => el.remove());
  }
  for (const placement of placements) {
    const wrapper = wrappers[placement.pageIndex];
    const content = wrapper ? renderContent(placement) : null;
    if (!content) continue;
    const view = views[placement.pageIndex];
    const el = createOverlay({
      placement,
      content,
      wrapper,
      pageAspect: view.width / view.height,
      selected: placement.id === selectedId,
      multiPage: wrappers.length > 1,
      handlers,
    });
    wrapper.append(el);
    if (placement.id === selectedId) el.focus({ preventScroll: true });
  }
}

function createOverlay({ placement, content, wrapper, pageAspect, selected, multiPage, handlers }) {
  const isText = placement.kind === 'text';
  const el = document.createElement('div');
  el.className = `placement${isText ? ' is-text' : ''}${selected ? ' selected' : ''}`;
  el.tabIndex = 0;
  el.setAttribute('role', 'group');
  el.setAttribute(
    'aria-label',
    `${isText ? `Mention « ${placement.text} »` : 'Signature'} placée. Flèches pour déplacer, Suppr pour retirer.`,
  );
  applyRect(el, placement);

  const handle = Object.assign(document.createElement('div'), { className: 'resize-handle', title: 'Redimensionner' });
  const tools = document.createElement('div');
  tools.className = 'placement-tools';
  tools.append(
    ...(isText ? [toolButton('✎', 'Modifier le texte', () => handlers.onEdit(placement.id), 'edit')] : []),
    ...(multiPage
      ? [toolButton('⧉', 'Copier à la même place sur toutes les pages', () => handlers.onCopyToAllPages(placement.id), 'copy')]
      : []),
    toolButton('✕', 'Retirer', () => handlers.onRemove(placement.id), 'remove'),
  );
  el.append(content, handle, tools);

  const startGesture = (event, update) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    handlers.onSelect(placement.id);
    const rect = wrapper.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let current = placement;
    el.setPointerCapture(event.pointerId);
    el.classList.add('selected', 'dragging');

    const onMove = (e) => {
      current = update((e.clientX - startX) / rect.width, (e.clientY - startY) / rect.height);
      applyRect(el, current);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.classList.remove('dragging');
      if (current !== placement) handlers.onCommit(current);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  el.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.placement-tools')) return;
    if (event.target === handle) {
      startGesture(event, (dx) => resizePlacement(placement, dx, pageAspect, placement.aspect));
    } else {
      startGesture(event, (dx, dy) => movePlacement(placement, dx, dy));
    }
  });
  el.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    if (isText) handlers.onEdit(placement.id);
  });
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      handlers.onRemove(placement.id);
      return;
    }
    if (event.key === 'Enter' && isText) {
      event.preventDefault();
      handlers.onEdit(placement.id);
      return;
    }
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP;
      handlers.onCommit(movePlacement(placement, arrow[0] * step, arrow[1] * step * pageAspect));
    }
  });
  return el;
}

function toolButton(label, title, onClick, kind) {
  const button = Object.assign(document.createElement('button'), { type: 'button', textContent: label, title });
  button.dataset.tool = kind;
  button.setAttribute('aria-label', title);
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function applyRect(el, { x, y, w, h }) {
  el.style.left = `${x * 100}%`;
  el.style.top = `${y * 100}%`;
  el.style.width = `${w * 100}%`;
  el.style.height = `${h * 100}%`;
}
