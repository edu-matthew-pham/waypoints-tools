// Talking to a page that embeds App Builder in an iframe (a lesson step, a test harness).
//
// App Builder -> page   { type: 'appbuilder', event: 'ready' }                 once, when it can take commands
//                       { type: 'appbuilder', event: 'project', project, sheet }  after every change (debounced)
// page -> App Builder   { type: 'appbuilder', cmd: 'start', project }   load it unless this copy already has saved work
//                       { type: 'appbuilder', cmd: 'reset', project }   load it, replacing the work (Start again)
//                       { type: 'appbuilder', cmd: 'get' }              send the project now
// ?id=<lesson/step>&code=<project JSON>: a Waypoints lesson step (see below); its work is kept per id.
// `sheet` is the project as plain text (core/sheet-text.js), for checks that look for phrases.
// Messages go only to, and are only taken from, the embedding page's origin when it is on the allow list.
import { sheetText } from './core/sheet-text.js';
import { checkProject } from './core/project.js';

const ALLOWED = [/^https:\/\/([a-z0-9-]+\.)*learningwaypoints\.com$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const embedded = window.parent !== window;
function parentOrigin() {
  let o = '';
  try { o = location.ancestorOrigins?.[0] || (document.referrer ? new URL(document.referrer).origin : ''); } catch { /* none */ }
  if (!o || o === 'null') o = location.origin; // same-origin pages may send no referrer
  return o === location.origin || ALLOWED.some((re) => re.test(o)) ? o : null;
}
const target = embedded ? parentOrigin() : null;
const send = (msg) => { if (target) { try { window.parent.postMessage({ type: 'appbuilder', ...msg }, target); } catch { /* gone */ } } };

// Waypoints lessons (tutorials.learningwaypoints.com) embed playgrounds with ?id=<lesson/step> and listen for
// { wp: 'run', kind, id, status: 'done', quiet, code } on their own origin; code is what their checks read.
const wpId = new URLSearchParams(location.search).get('id');
let reported = false;
const sendWp = (project) => {
  if (!wpId || !target) return;
  try { window.parent.postMessage({ wp: 'run', kind: 'appbuilder', id: wpId, status: 'done', quiet: !reported, code: sheetText(project) }, target); } catch { /* gone */ }
  reported = true;
};

let timer = 0;
export const embed = {
  active: !!target,
  report(project) {
    if (!target) return;
    clearTimeout(timer);
    timer = setTimeout(() => { send({ event: 'project', project: JSON.parse(JSON.stringify(project)), sheet: sheetText(project) }); sendWp(project); }, 150);
  },
  start({ start, reset, get }) {
    if (!target) return;
    addEventListener('message', (e) => {
      const m = e.data;
      if (e.origin !== target || !m || m.type !== 'appbuilder' || !m.cmd) return;
      if (m.cmd === 'get') { clearTimeout(timer); send({ event: 'project', project: get(), sheet: sheetText(get()) }); return; }
      if ((m.cmd === 'start' || m.cmd === 'reset') && m.project && typeof m.project === 'object') {
        try { (m.cmd === 'start' ? start : reset)(checkProject(structuredClone(m.project))); } catch { send({ event: 'error', message: 'That project could not be opened.' }); }
      }
    });
    send({ event: 'ready' });
    if (wpId) sendWp(get()); // first report is quiet: the page shows what is already done, without nagging
  },
};
