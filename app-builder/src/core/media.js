// Media references. Pictures and recordings are kept as files in the browser's media store (src/media-store.js,
// IndexedDB); the project, its tables and lists hold only a short reference to each one, "media:7f3a09c2", the way
// a database row holds a file path. No DOM here, so tests run in Node.
//
// While App Builder is open, each file it has loaded is reachable at an object URL (blob:...), registered here, so
// pictures and sounds show instantly from ordinary, synchronous code (the runtime, the stage, the sidebar).

// A reference can carry a play range, for a trimmed recording: media:7f3a09c2#t=1.2,4.5 (seconds). The file stays
// whole; browsers play just that part (a "media fragment"). The file itself is the part before the #.
export const REF_RE = /^media:[0-9a-f]{8}(#t=\d+(\.\d+)?,\d+(\.\d+)?)?$/;
export const isRef = (v) => typeof v === 'string' && REF_RE.test(v);
export const refFile = (ref) => ref.slice(0, 14);
export const refRange = (ref) => { const m = /#t=([\d.]+),([\d.]+)$/.exec(ref); return m ? [Number(m[1]), Number(m[2])] : null; };
const sec = (n) => String(Math.round(n * 10) / 10);
// a file's reference playing only from start to end (whole file: no range)
export const withRange = (ref, start, end, length) =>
  (start > 0.05 || end < length - 0.05) ? `${refFile(ref)}#t=${sec(start)},${sec(end)}` : refFile(ref);
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
  if (isRef(value)) into.add(refFile(value));
  else if (Array.isArray(value)) for (const v of value) collectRefs(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectRefs(v, into);
  return into;
}
// the same, in JSON text kept somewhere (localStorage), without parsing it
export function refsInText(text, into = new Set()) {
  for (const m of String(text ?? '').matchAll(/"(media:[0-9a-f]{8})(?:#t=[\d.,]+)?"/g)) into.add(m[1]);
  return into;
}

// file reference -> object URL (and its type, e.g. image/png or audio/webm) for files loaded while App Builder is open
const urls = new Map(), types = new Map();
export const mediaUrl = (ref) => urls.get(refFile(ref)) || '';
export const hasMediaUrl = (ref) => urls.has(refFile(ref));
export const mediaType = (ref) => types.get(refFile(ref)) || '';
export function setMediaUrl(ref, url, type = '') { urls.set(ref, url); if (type) types.set(ref, type); }
export function clearMediaUrls() { urls.clear(); types.clear(); }
// a picture or sound value as something a page can show or play: a reference becomes its URL (with its play range),
// anything else is kept
export const mediaSrc = (v) => {
  if (!isRef(v)) return v;
  const u = mediaUrl(v);
  return u && v.length > 14 ? u + v.slice(14) : u;
};
// is this value a picture someone made or uploaded (a data: URL or reference to an image)? Recordings are references too.
export const isPictureValue = (v) => (typeof v === 'string' && v.startsWith('data:image/')) || (isRef(v) && !mediaType(v).startsWith('audio/') && !mediaType(v).startsWith('text/'));
export const isSoundValue = (v) => (typeof v === 'string' && v.startsWith('data:audio/')) || (isRef(v) && mediaType(v).startsWith('audio/'));

// Uploads kept in the project (project.assets, project.sounds and, for Embeds, project.pages: [{ name, data, ... }]). `data` is a reference when
// the file is in the media store, or a data: URL (older projects, a saved file, or a browser with no media store).
export const uploads = (project) => [...(project.assets || []), ...(project.sounds || []), ...(project.pages || [])];
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
