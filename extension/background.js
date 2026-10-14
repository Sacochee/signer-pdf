// Service worker: detects PDF tabs and opens the signing editor.

const EDITOR_PATH = 'editor/editor.html';
const MENU_LINK = 'sign-pdf-link';
const MENU_PAGE = 'sign-pdf-page';
const SUPPORTED_PROTOCOLS = ['http:', 'https:', 'file:'];

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isSupportedUrl(url) {
  const parsed = parseUrl(url);
  return Boolean(parsed && SUPPORTED_PROTOCOLS.includes(parsed.protocol));
}

function hasPdfExtension(url) {
  return isSupportedUrl(url) && /\.pdf$/i.test(parseUrl(url).pathname);
}

/**
 * For URLs without ".pdf" (e.g. /download?id=42): ask the already-open page
 * what it is, without sending any new request to the server.
 */
async function tabShowsPdf(tab) {
  if (!isSupportedUrl(tab.url || '')) return false;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.contentType,
    });
    return result?.result === 'application/pdf';
  } catch {
    return false;
  }
}

function openEditor(src, openerTab) {
  const query = src && isSupportedUrl(src) ? `?src=${encodeURIComponent(src)}` : '';
  return chrome.tabs.create({
    url: chrome.runtime.getURL(EDITOR_PATH) + query,
    ...(openerTab ? { index: openerTab.index + 1, openerTabId: openerTab.id } : {}),
  });
}

async function updateBadge(tabId, url) {
  const isPdf = hasPdfExtension(url);
  await chrome.action.setBadgeText({ tabId, text: isPdf ? 'PDF' : '' });
  if (isPdf) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#2c55d6' });
}

chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || '';
  const src = hasPdfExtension(url) || (await tabShowsPdf(tab)) ? url : null;
  await openEditor(src, tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateBadge(tabId, tab.url || '').catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_LINK,
      title: 'Signer ce PDF',
      contexts: ['link'],
      targetUrlPatterns: ['http://*/*', 'https://*/*', 'file:///*'],
    });
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: 'Ouvrir l’outil de signature',
      contexts: ['action'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_LINK && info.linkUrl) openEditor(info.linkUrl, tab);
  if (info.menuItemId === MENU_PAGE) openEditor(null, tab);
});
