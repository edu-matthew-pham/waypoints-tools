// Media references. Pictures and recordings are kept as files in the browser's media store (src/media-store.js,
// IndexedDB); the project, its tables and lists hold only a short reference to each one, "media:7f3a09c2", the way
// a database row holds a file path. No DOM here, so tests run in Node.
//
// While App Builder is open, each file it has loaded is reachable at an object URL (blob:...), registered here, so
// pictures and sounds show instantly from ordinary, synchronous code (the runtime, the stage, the sidebar).

export const REF_RE = /^media:[0-9a-f]{8}$/;
export const isRef = (v) => typeof v === 'string' && REF_RE.test(v);
export const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:');

export function newRef(taken = () => false) {
  for (;;) {
    const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const ref = 'media:' + hex;
    if (!taken(ref)) return ref;
  }
}

// every media reference in a value (a project, a table's rows, a remembered list...), however deep
export function collectRefs(value, into = new Set()) {
  if (isRef(value)) into.add(value);
  else if (Array.isArray(value)) for (const v of value) collectRefs(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectRefs(v, into);
  return into;
}
// the same, in JSON text kept somewhere (localStorage), without parsing it
export function refsInText(text, into = new Set()) {
  for (const m of String(text ?? '').matchAll(/"(media:[0-9a-f]{8})"/g)) into.add(m[1]);
  return into;
}

// ref -> object URL for files loaded while App Builder is open
const urls = new Map();
export const mediaUrl = (ref) => urls.get(ref) || '';
export const hasMediaUrl = (ref) => urls.has(ref);
export function setMediaUrl(ref, url) { urls.set(ref, url); }
export function clearMediaUrls() { urls.clear(); }
// a picture or sound value as something a page can show or play: a reference becomes its URL, anything else is kept
export const mediaSrc = (v) => (isRef(v) ? mediaUrl(v) : v);

// Uploads kept in the project (project.assets and project.sounds: [{ name, data, ... }]). `data` is a reference when
// the file is in the media store, or a data: URL (older projects, a saved file, or a browser with no media store).
export const uploads = (project) => [...(project.assets || []), ...(project.sounds || [])];
export const uploadsToMove = (project) => uploads(project).filter((a) => isDataUrl(a.data));
// rough size in bytes of an upload, for the sidebar
export const uploadSize = (a) => a.size ?? (isDataUrl(a.data) ? Math.round((a.data.length - a.data.indexOf(',') - 1) * 0.75) : 0);

// data: URL <-> bytes (no FileReader or fetch, so Node can test it)
export function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(String(dataUrl));
  if (!m) throw new Error('Not a data: URL');
  const type = m[1] || 'application/octet-stream';
  const bytes = /;base64/i.test(m[2])
    ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(m[3]));
  return { type, bytes };
}
export function bytesToDataUrl(bytes, type) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type || 'application/octet-stream'};base64,${btoa(bin)}`;
}
