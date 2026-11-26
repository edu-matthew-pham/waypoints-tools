// Carrying an app to another device: one shape, { project, remembered, progress }, wherever it goes.
//   project     the app itself
//   remembered  what "Remember between visits" kept ({ name: value }), or null
//   progress    where the student is in a guided tutorial, or null:
//               { tutorial: <id>, link: '?lesson=…', step: <index>, tried: ['<step>:<n>', …] }
// Today it goes into a file (project-file.js) or a link (#continue=, here). Saving to a student's own OneDrive or
// Google Drive would be one more place for the same shape (ROADMAP: Sign in to save to your drive).
// Shell code: no DOM; core/ knows nothing about this.
import { encodeApp, decodeApp } from './core/share-link.js';
import { collectRefs } from './core/media.js';
import { tutorialUrl } from './edu/tutorial.js';

// Which browser storage key an App Builder address keeps its app under (app.js uses it for STORE_KEY).
export function storeKeyFor(search, href) {
  const qs = new URLSearchParams(search);
  const storeId = qs.get('store') || qs.get('id');
  if (storeId) return 'appbuilder.store.' + storeId;
  const t = tutorialUrl(qs, href);
  if (t?.id) return 'appbuilder.tutorial.' + t.id;
  if (qs.get('sample')) return 'appbuilder.lesson.' + qs.get('sample');
  return 'appbuilder.prototype.v1';
}

// The tutorial's own keys (ui/tutorial-panel.js reads them when it starts).
export const progressKeys = (id) => ({ step: 'appbuilder.tutorial.' + id + '.step', tried: 'appbuilder.tutorial.' + id + '.tried' });

// The parts of an address that bring back the same tutorial at the same level, e.g. '?lesson=code/apps/x&level=2'.
const KEEP = ['lesson', 'tutorial', 'sample', 'store', 'id', 'level', 'allow', 'lock'];
export function tutorialLinkPart(search) {
  const qs = new URLSearchParams(search), out = new URLSearchParams();
  for (const k of KEEP) if (qs.has(k)) out.set(k, qs.get(k));
  const s = out.toString();
  return s ? '?' + s : '';
}

// store: (fn) => fn(localStorage), as in app.js (null when storage isn't allowed)
export function readProgress(store, id, search) {
  if (!id) return null;
  const k = progressKeys(id);
  const stepText = store((ls) => ls.getItem(k.step));
  let tried = [];
  try { tried = JSON.parse(store((ls) => ls.getItem(k.tried)) || '[]'); } catch { /* none */ }
  if (stepText == null && !tried.length) return null; // not started
  const step = Number(stepText);
  return { tutorial: id, link: tutorialLinkPart(search), step: Number.isInteger(step) && step >= 0 ? step : 0, tried: Array.isArray(tried) ? tried.map(String) : [] };
}
export function writeProgress(store, progress) {
  if (!validProgress(progress)) return false;
  const k = progressKeys(progress.tutorial);
  store((ls) => { ls.setItem(k.step, String(progress.step)); ls.setItem(k.tried, JSON.stringify(progress.tried)); });
  return true;
}
export const validProgress = (p) => !!p && typeof p === 'object' && typeof p.tutorial === 'string' && !!p.tutorial
  && Number.isInteger(p.step) && p.step >= 0 && Array.isArray(p.tried) && typeof (p.link ?? '') === 'string';

// Can it all go in a link? Not when the app, or what it kept, has its own pictures or recordings (too big).
export const fitsInLink = ({ project, remembered }) => collectRefs([project, remembered]).size === 0;

// -> the part after #continue=
export async function encodeCarry({ project, remembered = null, progress = null }) {
  const out = { carry: 1, project };
  if (remembered && Object.keys(remembered).length) out.remembered = remembered;
  if (progress) out.progress = progress;
  return encodeApp(out);
}
export async function decodeCarry(code) {
  const d = await decodeApp(code);
  if (!d || d.carry !== 1 || !d.project) throw new Error('This link isn’t a Continue link');
  return { project: d.project, remembered: d.remembered && typeof d.remembered === 'object' ? d.remembered : null,
    progress: validProgress(d.progress) ? d.progress : null };
}
