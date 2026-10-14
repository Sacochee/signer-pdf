// Editor entry point: state, wiring and rendering.
import { openPdf, loadPageViews, mountPages } from './pdf-view.js';
import { fetchDocument, readLocalFile, sourceProtocol, FileAccessError, NotPdfError } from './loader.js';
import { listSignatures, addSignature, removeSignature } from './signatures.js';
import { renderPlacements } from './placements.js';
import { createPlacement, clampPlacement, reshapePlacement, stackBelowSameSpot } from './geometry.js';
import { createMentionsPanel, renderTextContent } from './mentions.js';
import { loadWebFonts, measureText } from './fonts.js';
import { buildSignedPdf, inspectDocument, signedFileName } from './export.js';
import { saveFile, storageGet, storageSet, fileAccessAllowed, openExtensionSettings, isExtension } from './platform.js';

const DEFAULT_SIGNATURE_WIDTH_PT = 140; // ~5 cm
const DEFAULT_TEXT_SIZE_PT = 13;
const SELECTED_KEY = 'selectedSignatureId';

const $ = (id) => document.getElementById(id);
const ui = {
  viewer: $('viewer'),
  pages: $('pages'),
  empty: $('empty'),
  emptyMessage: $('empty-message'),
  docName: $('doc-name'),
  saveBtn: $('save-btn'),
  fileInput: $('file-input'),
  sigInput: $('sig-input'),
  sigList: $('sig-list'),
  removeBg: $('remove-bg'),
  toast: $('toast'),
  busy: $('busy'),
  hint: $('placement-hint'),
};

let state = {
  doc: null, // { name, bytes, pdf, views, wrappers, dispose }
  placements: [],
  signatures: [],
  selectedSignatureId: null,
  selectedPlacementId: null,
  dirty: false,
};

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

// ---------- rendering ----------

function render() {
  renderSignatureList();
  const { doc } = state;
  ui.empty.hidden = Boolean(doc);
  ui.pages.hidden = !doc;
  ui.saveBtn.disabled = !doc || state.placements.length === 0;
  ui.docName.textContent = doc ? doc.name : 'Signer PDF';
  document.title = doc ? `Signer · ${doc.name}` : 'Signer PDF';
  ui.hint.hidden = !doc || state.placements.length > 0;
  if (doc) {
    renderPlacements({
      wrappers: doc.wrappers,
      views: doc.views,
      placements: state.placements,
      renderContent,
      selectedId: state.selectedPlacementId,
      handlers: placementHandlers,
    });
  }
}

function renderContent(placement) {
  if (placement.kind === 'text') return renderTextContent(placement);
  const signature = state.signatures.find((s) => s.id === placement.signatureId);
  return signature ? Object.assign(document.createElement('img'), { src: signature.dataUrl, alt: '', draggable: false }) : null;
}

function renderSignatureList() {
  const items = state.signatures.map((signature) => {
    const li = document.createElement('li');
    li.className = `sig-item${signature.id === state.selectedSignatureId ? ' selected' : ''}`;

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'sig-pick';
    pick.title = state.doc ? 'Poser cette signature sur la page affichée' : 'Choisir cette signature';
    pick.append(Object.assign(document.createElement('img'), { src: signature.dataUrl, alt: signature.name }));
    pick.addEventListener('click', () => onSignatureClicked(signature.id));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'sig-remove';
    remove.textContent = '✕';
    remove.title = 'Supprimer cette signature enregistrée';
    remove.setAttribute('aria-label', `Supprimer la signature ${signature.name}`);
    remove.addEventListener('click', () => onRemoveSignature(signature));

    li.append(pick, remove);
    return li;
  });
  ui.sigList.replaceChildren(...items);
  ui.sigList.classList.toggle('is-empty', items.length === 0);
}

// ---------- feedback ----------

let toastTimer;
function toast(message, kind = 'info') {
  ui.toast.textContent = message;
  ui.toast.dataset.kind = kind;
  ui.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), kind === 'error' ? 7000 : 3500);
}

async function withBusy(label, task) {
  ui.busy.textContent = label;
  ui.busy.hidden = false;
  try {
    return await task();
  } finally {
    ui.busy.hidden = true;
  }
}

function showEmptyMessage(message, action) {
  ui.emptyMessage.replaceChildren();
  if (!message) return;
  ui.emptyMessage.append(Object.assign(document.createElement('p'), { textContent: message }));
  if (action) {
    const button = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'btn',
      textContent: action.label,
    });
    button.addEventListener('click', action.run);
    ui.emptyMessage.append(button);
  }
}

// ---------- documents ----------

let loadToken = 0;

/** Turns pdf.js / pdf-lib failures into a message the user can act on. */
function openErrorMessage(error) {
  if (error?.name === 'PasswordException') {
    return 'Ce PDF est protégé par un mot de passe : il ne peut pas être modifié.';
  }
  if (error?.name === 'InvalidPDFException') return 'Ce fichier PDF est abîmé ou incomplet.';
  return error?.message || "Ce document n'a pas pu être ouvert.";
}

async function loadDocument({ bytes, name }) {
  const token = ++loadToken;
  const { hasDigitalSignature } = await inspectDocument(bytes);
  const pdf = await openPdf(bytes);
  let views;
  try {
    views = await loadPageViews(pdf);
  } catch (error) {
    pdf.destroy();
    throw error;
  }
  if (token !== loadToken) {
    pdf.destroy(); // a more recent document was opened meanwhile
    return;
  }
  state.doc?.dispose();
  state.doc?.pdf.destroy();
  setState({ doc: null, placements: [], selectedPlacementId: null, dirty: false });
  ui.pages.hidden = false;
  const { wrappers, dispose } = mountPages(views, ui.pages);
  ui.viewer.scrollTop = 0;
  setState({ doc: { name, bytes, pdf, views, wrappers, dispose } });
  if (hasDigitalSignature) {
    toast(
      'Attention : ce PDF contient déjà une signature électronique certifiée. Le modifier la rendra invalide.',
      'error',
    );
  }
}

async function openFromUrl(src) {
  const isFile = sourceProtocol(src) === 'file:';
  const fileAccess = isFile ? await fileAccessAllowed() : true;
  try {
    await withBusy('Chargement du PDF…', async () => loadDocument(await fetchDocument(src, { fileAccess })));
  } catch (error) {
    if (error instanceof FileAccessError) {
      showEmptyMessage(
        "Pour signer un PDF ouvert depuis ton ordinateur, autorise l'extension à lire tes fichiers : " +
          "Détails → « Autoriser l'accès aux URL de fichier ». Ou glisse simplement le fichier ici.",
        isExtension ? { label: "Ouvrir les réglages de l'extension", run: openExtensionSettings } : null,
      );
    } else if (error instanceof NotPdfError) {
      showEmptyMessage("L'onglet ne contient pas de PDF lisible. Glisse ou choisis un fichier.");
    } else {
      showEmptyMessage(openErrorMessage(error));
    }
  }
}

async function openFromFile(file) {
  if (!file) return;
  if (state.dirty && !confirm('Les signatures placées sur le document actuel seront perdues. Continuer ?')) return;
  try {
    await withBusy('Ouverture…', async () => loadDocument(await readLocalFile(file)));
    showEmptyMessage(null);
  } catch (error) {
    toast(openErrorMessage(error), 'error');
  }
}

let saving = false;

async function save() {
  const { doc, placements, signatures } = state;
  if (!doc || placements.length === 0 || saving) return;
  saving = true;
  try {
    const bytes = await withBusy('Création du PDF signé…', () =>
      buildSignedPdf({ bytes: doc.bytes, placements, signatures, views: doc.views }),
    );
    await saveFile(new Blob([bytes], { type: 'application/pdf' }), signedFileName(doc.name));
    setState({ dirty: false });
    toast('PDF signé enregistré.');
  } catch (error) {
    if (/cancel/i.test(String(error?.message))) return; // "Save as" dialog closed
    toast(error.message || "L'enregistrement a échoué.", 'error');
  } finally {
    saving = false;
  }
}

// ---------- signatures ----------

async function onAddSignature(file) {
  if (!file) return;
  try {
    const { signature, signatures } = await withBusy('Préparation de la signature…', () =>
      addSignature(file, { removeBackground: ui.removeBg.checked }),
    );
    await storageSet(SELECTED_KEY, signature.id);
    setState({ signatures, selectedSignatureId: signature.id });
    toast(state.doc ? 'Signature ajoutée. Clique dessus pour la poser.' : 'Signature enregistrée.');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function onRemoveSignature(signature) {
  if (!confirm(`Supprimer la signature « ${signature.name} » ?`)) return;
  const signatures = await removeSignature(signature.id);
  setState({
    signatures,
    placements: state.placements.filter((p) => p.signatureId !== signature.id),
    selectedSignatureId: state.selectedSignatureId === signature.id ? signatures[0]?.id ?? null : state.selectedSignatureId,
  });
}

async function onSignatureClicked(id) {
  await storageSet(SELECTED_KEY, id);
  setState({ selectedSignatureId: id });
  if (!state.doc) return;
  const { pageIndex, cx, cy } = visiblePageCenter();
  placeSignature(id, pageIndex, cx, cy, { stack: true });
}

// ---------- placements ----------

function placeSignature(signatureId, pageIndex, cx, cy, options) {
  const signature = state.signatures.find((s) => s.id === signatureId);
  if (!signature) {
    toast("Ajoute d'abord une signature (colonne de gauche).", 'error');
    return;
  }
  addPlacement(
    createPlacement({
      id: crypto.randomUUID(),
      kind: 'image',
      signatureId,
      pageIndex,
      cx,
      cy,
      view: state.doc.views[pageIndex],
      aspect: signature.width / signature.height,
      widthPt: DEFAULT_SIGNATURE_WIDTH_PT,
    }),
    options,
  );
}

/** `stack`: placed at the page centre, so step aside from what is already there. */
function addPlacement(placement, { stack = false } = {}) {
  const placed = stack ? stackBelowSameSpot(placement, state.placements) : placement;
  setState({ placements: [...state.placements, placed], selectedPlacementId: placed.id, dirty: true });
}

function replacePlacement(next) {
  setState({ placements: state.placements.map((p) => (p.id === next.id ? next : p)), dirty: true });
}

// ---------- mentions ----------

let mentions;

async function placeText(text) {
  if (!state.doc) {
    toast("Ouvre d'abord un document.", 'error');
    return;
  }
  await loadWebFonts(); // measuring needs the real font
  const { fontId, colorId } = mentions.style();
  const box = measureText(text, fontId);
  const { pageIndex, cx, cy } = visiblePageCenter();
  addPlacement(
    createPlacement({
      id: crypto.randomUUID(),
      kind: 'text',
      text,
      fontId,
      colorId,
      pageIndex,
      cx,
      cy,
      view: state.doc.views[pageIndex],
      aspect: box.width / box.height,
      widthPt: box.width * DEFAULT_TEXT_SIZE_PT,
    }),
    { stack: true },
  );
}

/** New text and/or font for a mention, keeping its font size and position. */
function retypeText(placement, patch) {
  const next = { ...placement, ...patch };
  const before = measureText(placement.text, placement.fontId);
  const after = measureText(next.text, next.fontId);
  const view = state.doc.views[placement.pageIndex];
  return reshapePlacement(next, view, after.width / after.height, after.height / before.height);
}

async function editText(id) {
  const placement = state.placements.find((p) => p.id === id);
  if (placement?.kind !== 'text') return;
  const text = await mentions.editText(placement.text);
  if (text && text !== placement.text) replacePlacement(retypeText(placement, { text }));
}

function applyTextStyle(patch) {
  const placement = state.placements.find((p) => p.id === state.selectedPlacementId);
  if (placement?.kind !== 'text') return;
  replacePlacement(patch.fontId ? retypeText(placement, patch) : { ...placement, ...patch });
}

const placementHandlers = {
  onSelect: (id) => {
    if (state.selectedPlacementId === id) return;
    state = { ...state, selectedPlacementId: id };
    document.querySelectorAll('.placement.selected').forEach((el) => el.classList.remove('selected'));
    const placement = state.placements.find((p) => p.id === id);
    mentions.showStyle(placement?.kind === 'text' ? placement : mentions.style());
  },
  onEdit: (id) => editText(id),
  onCommit: (next) =>
    setState({
      placements: state.placements.map((p) => (p.id === next.id ? next : p)),
      selectedPlacementId: next.id,
      dirty: true,
    }),
  onRemove: (id) =>
    setState({ placements: state.placements.filter((p) => p.id !== id), selectedPlacementId: null, dirty: true }),
  onCopyToAllPages: (id) => {
    const source = state.placements.find((p) => p.id === id);
    if (!source) return;
    const sameContent = (p) =>
      p.kind === source.kind && (p.kind === 'text' ? p.text === source.text : p.signatureId === source.signatureId);
    const alreadyThere = (pageIndex) =>
      state.placements.some(
        (p) =>
          p.pageIndex === pageIndex &&
          sameContent(p) &&
          Math.abs(p.x - source.x) < 0.02 &&
          Math.abs(p.y - source.y) < 0.02,
      );
    const copies = state.doc.views
      .filter((view) => view.index !== source.pageIndex && !alreadyThere(view.index))
      .map((view) =>
        clampPlacement({
          ...source,
          id: crypto.randomUUID(),
          pageIndex: view.index,
          h: (source.w * (view.width / view.height)) / source.aspect,
        }),
      );
    if (copies.length === 0) {
      toast('Déjà présent sur toutes les pages.');
      return;
    }
    setState({ placements: [...state.placements, ...copies], dirty: true });
    toast(`Copié sur ${copies.length} autre(s) page(s).`);
  },
};

/** Page most visible in the viewer, and the centre of its visible part (fractions). */
function visiblePageCenter() {
  const viewerRect = ui.viewer.getBoundingClientRect();
  let best = { pageIndex: 0, cx: 0.5, cy: 0.5, visible: -Infinity };
  state.doc.wrappers.forEach((wrapper, pageIndex) => {
    const r = wrapper.getBoundingClientRect();
    const top = Math.max(r.top, viewerRect.top);
    const bottom = Math.min(r.bottom, viewerRect.bottom);
    const visible = bottom - top;
    if (visible > best.visible) {
      best = { pageIndex, cx: 0.5, cy: ((top + bottom) / 2 - r.top) / r.height, visible };
    }
  });
  return best;
}

function onPageDoubleClick(event) {
  const wrapper = event.target.closest('.page');
  if (!wrapper || !state.doc) return;
  const signatureId = state.selectedSignatureId ?? state.signatures[0]?.id;
  const r = wrapper.getBoundingClientRect();
  placeSignature(
    signatureId,
    Number(wrapper.dataset.pageIndex),
    (event.clientX - r.left) / r.width,
    (event.clientY - r.top) / r.height,
  );
}

// ---------- wiring ----------

function wireEvents() {
  ui.fileInput.addEventListener('change', () => {
    openFromFile(ui.fileInput.files[0]);
    ui.fileInput.value = '';
  });
  ui.sigInput.addEventListener('change', () => {
    onAddSignature(ui.sigInput.files[0]);
    ui.sigInput.value = '';
  });
  ui.saveBtn.addEventListener('click', save);
  ui.pages.addEventListener('dblclick', onPageDoubleClick);
  ui.pages.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.placement') && state.selectedPlacementId) {
      setState({ selectedPlacementId: null });
    }
  });

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.body.classList.add('dragging-file');
  });
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) document.body.classList.remove('dragging-file');
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    document.body.classList.remove('dragging-file');
    openFromFile(event.dataTransfer.files[0]);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) event.preventDefault();
  });
}

async function init() {
  wireEvents();
  mentions = await createMentionsPanel({ onPlace: placeText, onStyleChange: applyTextStyle });
  loadWebFonts()
    .then(() => mentions.rerender())
    .catch((error) => console.error('Polices manuscrites indisponibles', error));
  const signatures = await listSignatures();
  const storedSelection = await storageGet(SELECTED_KEY, null);
  setState({
    signatures,
    selectedSignatureId: signatures.some((s) => s.id === storedSelection) ? storedSelection : signatures[0]?.id ?? null,
  });
  const src = new URLSearchParams(location.search).get('src');
  if (src) await openFromUrl(src);
}

init().catch((error) => {
  console.error(error);
  toast("L'éditeur n'a pas pu démarrer. Recharge la page.", 'error');
});
