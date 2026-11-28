// Browser tests: App Builder in real Chromium (Playwright), with every request answered from files on disk, so no
// server is needed. The tutorials site (lessons, their source.json, the list of tutorials) is answered from
// tests/fixtures. Run: npm run test:browser (needs `npx playwright install chromium` once).
import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('../../', import.meta.url).pathname; // app-builder/
export const BASE = 'http://127.0.0.1:8123/';                      // never contacted: answered below
export const SITE = 'https://tutorials.learningwaypoints.com/';
const TYPES = { html: 'text/html', json: 'application/json', js: 'text/javascript', mp3: 'audio/mpeg', wav: 'audio/wav', svg: 'image/svg+xml' };

// A fixture lesson's files, as the tutorials site's source.json would give them.
export function lessonFiles(name) {
  const dir = join(ROOT, 'tests/fixtures', name), out = {};
  for (const n of readdirSync(dir)) if (statSync(join(dir, n)).isFile()) out[n] = readFileSync(join(dir, n), 'utf8');
  return out;
}
// A region of a fixture's app.json, parsed.
export const region = (files, name) => JSON.parse(files['app.json'].split('// region: ' + name + '\n')[1].split('\n// endregion')[0]);

let browser = null;
// Watch it run: HEADED=1 shows the browser window; SLOWMO=300 waits that many ms between actions.
export async function launch() {
  browser ??= await chromium.launch({ headless: !process.env.HEADED, slowMo: Number(process.env.SLOWMO) || 0 });
  return browser;
}
export async function close() { await browser?.close(); browser = null; }

// A fresh page (its own storage). lessons: { 'code/apps/x': 'fixture-name' }; list: the tutorials list to serve.
// video: a folder to record the page into (a .webm, written when its context closes; the lesson audit's --video)
export async function page({ view = [1300, 860], lessons = {}, list = null, noSavePicker = false, video = null } = {}) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: view[0], height: view[1] }, acceptDownloads: true,
    ...(video ? { recordVideo: { dir: video, size: { width: view[0], height: view[1] } } } : {}) });
  await ctx.route(SITE + '**', (r) => {
    const path = new URL(r.request().url()).pathname.slice(1);
    const cors = { 'access-control-allow-origin': '*' };
    if (path === 'appbuilder-tutorials.json' && list) return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(list) });
    const slug = path.replace(/\/source\.json$/, '');
    // a lesson: a fixture's name, or its files themselves (the lesson audit)
    if (path.endsWith('source.json') && lessons[slug]) return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ title: slug, files: typeof lessons[slug] === 'string' ? lessonFiles(lessons[slug]) : lessons[slug] }) });
    return r.fulfill({ status: 404, headers: cors, body: '' });
  });
  await ctx.route(BASE + '**', (r) => {
    const path = new URL(r.request().url()).pathname.slice(1) || 'index.html';
    const file = join(ROOT, path);
    if (!existsSync(file) || statSync(file).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ body: readFileSync(file), contentType: TYPES[path.split('.').pop()] || 'application/octet-stream' });
  });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  if (noSavePicker) await p.addInitScript(() => { delete window.showSaveFilePicker; }); // like Firefox and Safari
  return p;
}

export async function openApp(p, query = '') {
  await p.goto(BASE + 'index.html' + query);
  await p.waitForSelector("[data-ab='tab:design']");
  if (query.includes('lesson=') || query.includes('tutorial=')) await p.waitForSelector("[data-ab='tutorial']");
}
export const loadProject = (p, project) => p.evaluate((j) => window.__app.loadProject(JSON.parse(j)), JSON.stringify(project));

// Count how often the tutorial card changes sides (a flip-flopping card is a bug).
export async function watchFlips(p) {
  await p.evaluate(() => {
    window.__flips = 0;
    const card = document.querySelector('.tut');
    let was = card?.classList.contains('left');
    if (card) new MutationObserver(() => { const l = card.classList.contains('left'); if (l !== was) { window.__flips++; was = l; } }).observe(card, { attributes: true, attributeFilter: ['class'] });
  });
  return { count: () => p.evaluate(() => window.__flips), reset: () => p.evaluate(() => { window.__flips = 0; }) };
}

// The element the ring points at (marked data-ringed), and what its bubble says; null when there's no ring.
export const ring = (p) => p.evaluate(() => {
  document.querySelectorAll('[data-ringed]').forEach((e) => e.removeAttribute('data-ringed'));
  const r = document.querySelector('.tut-ring');
  if (!r?.isConnected) return null;
  const q = r.getBoundingClientRect();
  const el = document.elementsFromPoint(q.left + q.width / 2, q.top + q.height / 2).find((e) => !e.classList.contains('tut-ring') && !e.classList.contains('tut-bubble'));
  const t = el?.closest('input, textarea, select, button, li, [data-ab]') || el;
  if (!t) return null;
  t.setAttribute('data-ringed', '1');
  return { tag: t.tagName, ab: t.dataset.ab || t.tagName, caption: document.querySelector('.tut-bubble')?.textContent || '', inDialog: !!t.closest('dialog'), prop: /^prop:/.test(t.dataset.ab || '') || !!t.closest('[data-ab^="prop:"]') };
});
export const stepBuilt = (p) => p.evaluate(() => !!document.querySelector('.tut-main .tut-check.ok')?.textContent.startsWith('✓ Done'));

// A student who does only what the ring and its caption say, until the step is built (or the ring hands over to the
// checklist, or there is no ring, or it repeats itself). Returns { built, moves, stop }.
export async function followRing(p, { maxMoves = 45, pause = 350 } = {}) {
  const seen = [];
  for (let moves = 0; moves < maxMoves; moves++) {
    if (await stepBuilt(p)) return { built: true, moves, stop: 'built' };
    await p.waitForTimeout(pause);
    const r = await ring(p);
    if (!r) return { built: await stepBuilt(p), moves, stop: 'no ring' };
    if (r.caption.startsWith('Still to do')) return { built: false, moves, stop: 'checklist' };
    const key = r.ab + '|' + r.caption;
    seen.push(key);
    if (seen.length > 3 && seen.slice(-4).every((x) => x === key)) return { built: false, moves, stop: 'repeats: ' + key };
    if (r.tag === 'INPUT' && /^(checkbox|radio)$/.test(await p.getAttribute('[data-ringed]', 'type') || '')) await p.click('[data-ringed]'); // a tick box: click it
    else if (/^(INPUT|TEXTAREA)$/.test(r.tag)) {
      const text = /Leave it empty\.$/.test(r.caption) ? '' : r.caption.match(/Type: (.*)$/)?.[1] ?? r.caption.match(/^(?:Type|Make a variable called) (\w+)/)?.[1];
      if (text == null) return { built: false, moves, stop: 'a box with nothing to type: ' + r.caption };
      const startAt = r.caption.match(/^Make a variable called \S+, starting at (.+?): /)?.[1];
      if (startAt != null) await p.fill("[data-ab='new-variable-value']", startAt);
      await p.fill('[data-ringed]', text);
      await p.press('[data-ringed]', r.inDialog || r.prop ? 'Tab' : 'Enter');
    } else if (r.tag === 'SELECT') {
      const pick = r.caption.match(/Choose: (.*)$/)?.[1];
      if (!pick) return { built: false, moves, stop: 'a dropdown with nothing to choose: ' + r.caption };
      await p.selectOption('[data-ringed]', { label: pick });
    } else await p.click('[data-ringed]', { timeout: 3000 });
  }
  return { built: await stepBuilt(p), moves: maxMoves, stop: 'too many moves' };
}
