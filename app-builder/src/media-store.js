// The media store: pictures and recordings kept as files in IndexedDB (this site's own storage in this browser,
// on this device: nothing is sent anywhere, and it is not the cache). Usually hundreds of MB, where localStorage,
// which holds the project itself, has about 5 MB. Projects hold only references (core/media.js).
//
// IndexedDB answers "later", but events need answers now, so: the files an app uses are loaded into memory (as
// object URLs) when it opens, and new files are saved in the background. Fails safe: with no IndexedDB (blocked,
// some private windows) uploads simply stay inside the project as data: URLs, as before.
import { isRef, newRef, collectRefs, refsInText, hasMediaUrl, setMediaUrl, mediaUrl, uploads, uploadsToMove, dataUrlToBytes, bytesToDataUrl } from './core/media.js';

const DB = 'appbuilder-media';
const STORE = 'media';
const GRACE = 24 * 3600 * 1000; // media nothing points to is tidied after a day (another tab may still be using it)
const FULL = 0.8; // warn when the site has used this much of what the browser allows

let notify = () => {};
export function setNotify(fn) { notify = fn; }

let dbp = null;
function db() {
  dbp ||= new Promise((ok) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => ok(req.result);
      req.onerror = req.onblocked = () => ok(null);
    } catch { ok(null); }
  });
  return dbp;
}
export const available = async () => !!(await db());

function tx(d, mode, fn) {
  return new Promise((ok, fail) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(out?.result);
    t.onerror = t.onabort = () => fail(t.error || new Error('Media store error'));
  });
}
const get = (d, id) => tx(d, 'readonly', (s) => s.get(id));

// Ask the browser to keep this site's storage when space is short (it may say no; then it is "best effort").
let asked = false;
function persist() {
  if (asked) return;
  asked = true;
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* not offered */ }
}

// { usage, quota } in bytes for this whole site (App Builder's projects and media), or null if the browser won't say
export async function usage() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null; } catch { return null; }
}
export const mb = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e7 ? `${Math.round(bytes / 1e6)} MB` : `${(bytes / 1e6).toFixed(1)} MB`);
let warned = false;
async function checkRoom() {
  const u = await usage();
  if (!u?.quota || warned || u.usage < FULL * u.quota) return;
  warned = true;
  notify(`This browser's storage for App Builder is nearly full (${mb(u.usage)} of about ${mb(u.quota)}). Save your project, then delete pictures or recordings you no longer need.`);
}

// Keep a file; returns its reference (already loaded, so it shows straight away), or null if it couldn't be kept.
export async function keepBlob(blob) {
  const d = await db();
  if (!d) return null;
  persist();
  let ref;
  try {
    for (;;) { ref = newRef(); if (!(await get(d, ref))) break; }
    await tx(d, 'readwrite', (s) => s.put({ id: ref, blob, type: blob.type, size: blob.size, added: Date.now() }));
  } catch (e) {
    notify(e?.name === 'QuotaExceededError'
      ? 'There is no room left in this browser to keep that. Save your project, then delete pictures or recordings you no longer need.'
      : 'Could not keep that file in this browser.');
    return null;
  }
  setMediaUrl(ref, URL.createObjectURL(blob));
  checkRoom();
  return ref;
}
const toBlob = (dataUrl) => { const { type, bytes } = dataUrlToBytes(dataUrl); return new Blob([bytes], { type }); };

// An upload, as { data, size }: data is a reference when the store kept it, or the data: URL as before when it couldn't.
export async function keep(dataUrl) {
  const blob = toBlob(dataUrl);
  return { data: (await keepBlob(blob)) || dataUrl, size: blob.size };
}

// Move uploads that are still inside a project (data: URLs) into the store. Changes the project; returns how many moved.
export async function moveUploads(project) {
  let n = 0;
  for (const a of uploadsToMove(project)) {
    const blob = toBlob(a.data);
    const ref = await keepBlob(blob);
    if (!ref) break; // no store, or no room: the rest stay inside the project, which still works
    a.data = ref; a.size = blob.size; n++;
  }
  return n;
}

// Load every file a value refers to (a project, remembered values) so it shows instantly. Returns how many are missing
// (made in another browser, or cleared with the site's data).
export async function load(value) {
  const want = [...collectRefs(value)].filter((r) => !hasMediaUrl(r));
  if (!want.length) return 0;
  const d = await db();
  if (!d) return want.length;
  let missing = 0;
  for (const ref of want) {
    try {
      const rec = await get(d, ref);
      if (rec?.blob) setMediaUrl(ref, URL.createObjectURL(rec.blob)); else missing++;
    } catch { missing++; }
  }
  return missing;
}

// A copy of the project with its uploads back inside it as data: URLs, so a saved .json file is complete on its own.
export async function inline(project) {
  const p = structuredClone(project);
  const d = await db();
  let missing = 0;
  for (const a of uploads(p)) {
    if (!isRef(a.data)) continue;
    const rec = d && await get(d, a.data).catch(() => null);
    if (!rec?.blob) { missing++; continue; }
    a.data = bytesToDataUrl(new Uint8Array(await rec.blob.arrayBuffer()), rec.type);
    delete a.size;
  }
  return { project: p, missing };
}

// Tidy up media nothing points to any more: not this project, nor any App Builder project or remembered value kept
// in this browser (every lesson link keeps its own), and older than a day. Runs when App Builder opens, never while
// someone works, so Undo can always bring a picture back.
export async function tidy(current) {
  const d = await db();
  if (!d) return 0;
  const used = collectRefs(current);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('appbuilder.')) refsInText(localStorage.getItem(k), used);
    }
  } catch { return 0; } // can't see what is in use: tidy nothing
  const old = Date.now() - GRACE;
  const gone = [];
  await tx(d, 'readwrite', (s) => {
    const req = s.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (!used.has(c.value.id) && (c.value.added || 0) < old) { gone.push(c.value.id); c.delete(); }
      c.continue();
    };
  }).catch(() => {});
  for (const ref of gone) { const u = mediaUrl(ref); if (u) URL.revokeObjectURL(u); }
  return gone.length;
}
