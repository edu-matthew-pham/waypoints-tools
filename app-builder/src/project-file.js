// Saving and opening a project as a file.
//
// No pictures or recordings: plain JSON, as before (projectname.app.json).
// With them: one zip (projectname.app.zip) holding project.json, which keeps its media:<id> references, and a media/
// folder with each file, named by its reference (media/7f3a09c2.png). It opens on any computer, and is also an
// ordinary zip someone can look inside.
// "Data made while running" (what Remember between visits kept: rows, lists, drawings, photos, recordings) is included
// when asked, as project.json's "remembered": { name: value }; Open puts it back for this App Builder.
import { collectRefs, refFile, bytesToDataUrl } from './core/media.js';
import { makeZip, readZip, isZip } from './core/zip.js';
import { getFile, keepAs, available } from './media-store.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
const baseType = (t) => String(t || '').split(';')[0];
const fileName = (name, ext) => (name || 'app').replace(/[^\w-]+/g, '-') + ext;

// -> { filename, data (string or Uint8Array), type, missing }
export async function buildSave(project, remembered = null) {
  const out = structuredClone(project);
  if (remembered && Object.keys(remembered).length) out.remembered = remembered;
  const refs = [...collectRefs(out)];
  if (!refs.length) return { filename: fileName(project.name, '.app.json'), data: JSON.stringify(out, null, 2), type: 'application/json', missing: 0 };
  const files = [], media = {};
  let missing = 0;
  for (const ref of refs) {
    const f = await getFile(ref);
    if (!f) { missing++; continue; }
    const path = `media/${ref.slice(6)}.${EXT[baseType(f.type)] || 'bin'}`;
    media[ref] = { file: path, type: f.type };
    files.push({ name: path, bytes: new Uint8Array(await f.blob.arrayBuffer()) });
  }
  out.mediaFiles = media; // reference -> file in the zip, with its type
  files.unshift({ name: 'project.json', bytes: new TextEncoder().encode(JSON.stringify(out, null, 2)) });
  return { filename: fileName(project.name, '.app.zip'), data: makeZip(files), type: 'application/zip', missing };
}

// a File (or bytes) -> { project, remembered, missing }
export async function readProjectFile(file) {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  if (!isZip(bytes)) return split(JSON.parse(new TextDecoder().decode(bytes)), 0);
  const entries = await readZip(bytes);
  const main = entries.get('project.json') || [...entries].find(([n]) => n.endsWith('/project.json') || n.endsWith('.app.json'))?.[1];
  if (!main) throw new Error('There is no project.json in this zip');
  let text = new TextDecoder().decode(main);
  const p = JSON.parse(text);
  const manifest = p.mediaFiles || {};
  const store = await available();
  const swap = new Map(); // reference in the file -> what it becomes here
  let missing = 0;
  for (const ref of collectRefs(p)) {
    const path = manifest[ref]?.file || [...entries.keys()].find((n) => n.startsWith(`media/${ref.slice(6)}.`));
    const data = path && entries.get(path);
    if (!data) { missing++; continue; }
    const type = manifest[ref]?.type || TYPE[path.split('.').pop()] || '';
    const kept = store ? await keepAs(ref, new Blob([data], { type })) : null;
    // no media store here: the file goes inside the project, as older projects had it
    const now = kept || bytesToDataUrl(data, baseType(type));
    if (now !== ref) swap.set(ref, now);
  }
  if (swap.size) {
    text = JSON.stringify(p);
    for (const [from, to] of swap) text = text.split(`"${from}`).join(`"${to}`); // keeps a recording's #t= range
    return split(JSON.parse(text), missing);
  }
  return split(p, missing);
}
function split(p, missing) {
  const remembered = p.remembered && typeof p.remembered === 'object' ? p.remembered : null;
  delete p.remembered; delete p.mediaFiles;
  return { project: p, remembered, missing };
}
export { refFile };
