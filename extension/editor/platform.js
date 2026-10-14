// Thin wrapper around the chrome.* APIs, with plain-web fallbacks so the
// editor can also run as a normal page (local dev server, future web app).

const ext = typeof chrome !== 'undefined' && chrome.storage?.local ? chrome : null;

export const isExtension = Boolean(ext);

export function assetUrl(path) {
  return ext ? ext.runtime.getURL(path) : new URL(`../${path}`, import.meta.url).href;
}

export async function storageGet(key, fallback) {
  if (ext) {
    const result = await ext.storage.local.get(key);
    return result[key] ?? fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function storageSet(key, value) {
  if (ext) {
    await ext.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

/** Saves a file, asking where to put it when running as an extension. */
export async function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const revokeLater = () => setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (ext?.downloads) {
    try {
      await ext.downloads.download({ url, filename, saveAs: true });
    } finally {
      revokeLater();
    }
    return;
  }
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  revokeLater();
}

/** Whether the user ticked "Allow access to file URLs" for this extension. */
export async function fileAccessAllowed() {
  if (!ext?.extension?.isAllowedFileSchemeAccess) return false;
  return ext.extension.isAllowedFileSchemeAccess();
}

export function openExtensionSettings() {
  if (ext) ext.tabs.create({ url: `chrome://extensions/?id=${ext.runtime.id}` });
}
