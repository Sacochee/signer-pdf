// Rendering pages with pdf.js. Pages are laid out immediately (right aspect
// ratio); canvases are drawn when a page nears the viewport and released when
// it moves far away, so long documents don't exhaust memory.
import * as pdfjsLib from '../vendor/pdf.min.mjs';
import { assetUrl } from './platform.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = assetUrl('vendor/pdf.worker.min.mjs');

const MAX_CANVAS_SIDE = 4096;
const MAX_DPR = 2;
const KEEP_MARGIN = '1200px 0px';
const RESIZE_DEBOUNCE_MS = 250;

export async function openPdf(bytes) {
  // pdf.js transfers the buffer to its worker: give it a copy, we need ours for export.
  return pdfjsLib.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    cMapUrl: assetUrl('vendor/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('vendor/standard_fonts/'),
  }).promise;
}

/** Page geometry at scale 1 (1 px = 1 PDF point), as used by geometry.js. */
export async function loadPageViews(pdf) {
  const indexes = Array.from({ length: pdf.numPages }, (_, i) => i);
  return Promise.all(
    indexes.map(async (index) => {
      const page = await pdf.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      return {
        index,
        page,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        toPdfPoint: (x, y) => viewport.convertToPdfPoint(x, y),
      };
    }),
  );
}

/** Creates one wrapper per page; canvases follow the scroll position. */
export function mountPages(views, container) {
  container.replaceChildren();
  const tasks = new Map(); // wrapper -> running pdf.js render task

  const release = (wrapper) => {
    tasks.get(wrapper)?.cancel();
    tasks.delete(wrapper);
    const canvas = wrapper.querySelector('.page-canvas');
    if (canvas) {
      canvas.width = 0; // frees the bitmap immediately
      canvas.remove();
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) {
          release(target);
        } else if (!tasks.has(target) && !target.querySelector('.page-canvas')) {
          renderPage(views[Number(target.dataset.pageIndex)], target, tasks);
        }
      }
    },
    { root: container.closest('main'), rootMargin: KEEP_MARGIN },
  );

  const wrappers = views.map((view) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    wrapper.dataset.pageIndex = String(view.index);
    wrapper.style.aspectRatio = `${view.width} / ${view.height}`;
    wrapper.setAttribute('aria-label', `Page ${view.index + 1}`);
    container.append(wrapper);
    observer.observe(wrapper);
    return wrapper;
  });

  // Re-render displayed pages at the new size; the old canvas stays until the new one is ready.
  let resizeTimer;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const wrapper of wrappers) {
        if (!wrapper.querySelector('.page-canvas')) continue;
        tasks.get(wrapper)?.cancel();
        renderPage(views[Number(wrapper.dataset.pageIndex)], wrapper, tasks);
      }
    }, RESIZE_DEBOUNCE_MS);
  };
  window.addEventListener('resize', onResize);

  return {
    wrappers,
    dispose: () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      wrappers.forEach(release);
    },
  };
}

async function renderPage(view, wrapper, tasks) {
  const cssWidth = wrapper.clientWidth || 800;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const scale = Math.min((cssWidth * dpr) / view.width, MAX_CANVAS_SIDE / Math.max(view.width, view.height));
  const viewport = view.page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.className = 'page-canvas';

  const task = view.page.render({ canvasContext: canvas.getContext('2d'), viewport });
  tasks.set(wrapper, task);
  try {
    await task.promise;
    if (tasks.get(wrapper) !== task) return; // released or superseded meanwhile
    wrapper.classList.remove('page-error');
    wrapper.querySelectorAll('.page-canvas').forEach((old) => {
      old.width = 0;
      old.remove();
    });
    wrapper.prepend(canvas);
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') {
      wrapper.classList.add('page-error');
      console.error('Rendu de page impossible', error);
    }
    canvas.width = 0;
  } finally {
    if (tasks.get(wrapper) === task) tasks.delete(wrapper);
  }
}
