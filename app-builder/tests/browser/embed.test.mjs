// The Embed object in a real browser (ROADMAP §13). Most important: a pasted page runs sandboxed, so it can't read
// App Builder's storage (projects, media, drive sign-in), reach the page around it, or move that page somewhere else.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page, openApp, close, loadProject, BASE } from './helpers.mjs';
import { readZip } from '../../src/core/zip.js';

after(close);

const W = (name, kind, x, y, w, h, extra = {}) => ({ name, kind, instanceVars: [], instances: [{ id: name, x, y, w, h, text: '', visible: true, vars: {}, ...extra }] });
const app = (objects, extra = {}) => ({ version: 1, name: 'Embed', device: 'web', features: { level: 4 }, variables: [], ...extra, screens: [{ id: 'main', name: 'Home', objects, events: [] }] });
const dataPage = (html) => 'data:text/html;charset=utf-8;base64,' + Buffer.from(html).toString('base64');
const runTab = async (p) => { await p.click("[data-ab='tab:run']"); await p.waitForTimeout(400); };
const listen = (p) => p.evaluate(() => { window.__emb = null; addEventListener('message', (e) => { if (e.data?.embedTest) window.__emb = { ...e.data.embedTest, from: e.origin }; }); });

// A page that tries everything it mustn't do, then reports what happened.
const NOSY = `<!DOCTYPE html><html><body><p id="t">Pendulum ünïcode</p><script>
(async () => {
  const r = {};
  r.origin = String(self.origin);
  try { r.ls = String(localStorage.getItem('appbuilder.secret')); } catch (e) { r.ls = 'blocked'; }
  r.idb = await new Promise((ok) => { try { const q = indexedDB.open('appbuilder-media'); q.onsuccess = () => ok('opened'); q.onerror = () => ok('blocked'); } catch (e) { ok('blocked'); } });
  try { r.parent = String(parent.document.title); } catch (e) { r.parent = 'blocked'; }
  try { r.parentLs = String(parent.localStorage.getItem('appbuilder.secret')); } catch (e) { r.parentLs = 'blocked'; }
  try { r.popup = window.open('https://example.org/') ? 'opened' : 'blocked'; } catch (e) { r.popup = 'blocked'; }
  parent.postMessage({ embedTest: r }, '*');
  try { top.location.href = 'https://example.org/'; } catch (e) { /* refused */ }
})();
</script></body></html>`;

test('a pasted page runs sandboxed: no App Builder storage, no parent page, no popups, no moving the page', async () => {
  const p = await page(); await openApp(p);
  await p.route('https://example.org/**', (r) => r.fulfill({ body: 'escaped' }));
  await p.evaluate(() => localStorage.setItem('appbuilder.secret', 's3cret'));
  await loadProject(p, app([W('Sim', 'embed', 20, 20, 480, 320, { page: 'nosy' })], { pages: [{ name: 'nosy', data: dataPage(NOSY) }] }));
  await listen(p);
  await runTab(p);
  const frame = p.locator(".view-run [data-ab='widget:Sim'] iframe");
  assert.equal(await frame.getAttribute('sandbox'), 'allow-scripts', 'scripts only: never allow-same-origin, top navigation, popups or forms');
  assert.match(await frame.getAttribute('src'), /^blob:/, 'the page was moved into the media store');
  assert.equal(await p.frameLocator(".view-run [data-ab='widget:Sim'] iframe").locator('#t').innerText(), 'Pendulum ünïcode', 'shows, as UTF-8');
  await p.waitForFunction(() => window.__emb, null, { timeout: 5000 });
  await p.waitForTimeout(500); // time for the attempt to move the page
  const r = await p.evaluate(() => window.__emb);
  assert.equal(r.origin, 'null', 'a blank origin of its own');
  assert.equal(r.from, 'null');
  assert.equal(r.ls, 'blocked', 'can\'t read localStorage');
  assert.equal(r.idb, 'blocked', 'can\'t open the media store');
  assert.equal(r.parent, 'blocked', 'can\'t reach the page around it');
  assert.equal(r.parentLs, 'blocked');
  assert.equal(r.popup, 'blocked', 'can\'t open windows');
  assert.ok(p.url().startsWith(BASE), 'App Builder is still the page: ' + p.url());
  assert.equal(p.context().pages().length, 1, 'no new window');
  assert.equal(await p.evaluate(() => localStorage.getItem('appbuilder.secret')), 's3cret');
});

test('Paste HTML on an Embed: a new page, shown while running, listed in the sidebar, saved in embeds/', async () => {
  const p = await page({ noSavePicker: true }); await openApp(p);
  await loadProject(p, app([W('Sim', 'embed', 20, 20, 480, 320)]));
  await p.click(".view-design [data-ab='widget:Sim']");
  assert.match(await p.locator('.props').innerText(), /Nothing to show yet/);
  await p.click("[data-ab='embed-paste']");
  await p.fill("[data-ab='embed-html']", '<!DOCTYPE html><p id="t">Hello from the sim</p>');
  await p.fill("[data-ab='embed-name']", 'Pendulum Lab');
  await p.click("[data-ab='embed-use']");
  await p.waitForFunction(() => window.__app.S.project.screens[0].objects[0].instances[0].page === 'pendulum_lab');
  assert.equal(await p.locator("[data-ab='page:pendulum_lab']").count(), 1, 'listed under Web pages');
  assert.match(await p.locator(".view-design [data-ab='widget:Sim']").innerText(), /Web page: pendulum_lab/, 'a placeholder in Design');
  assert.equal(await p.locator(".view-design [data-ab='widget:Sim'] iframe").count(), 0, 'nothing runs while editing');
  await runTab(p);
  assert.equal(await p.frameLocator(".view-run [data-ab='widget:Sim'] iframe").locator('#t').innerText(), 'Hello from the sim');
  await p.click("[data-ab='tab:design']");
  const download = p.waitForEvent('download', { timeout: 5000 });
  await p.click("[data-ab='save']");
  if (await p.locator('.popmenu').count()) await p.click("[data-ab='menu:save-to-this-computer']");
  if (await p.locator("[data-ab='save-include-data']").count()) await p.keyboard.press('Enter');
  const d = await download;
  assert.match(d.suggestedFilename(), /\.app\.zip$/);
  const entries = await readZip(new Uint8Array(readFileSync(await d.path())));
  assert.ok(entries.has('embeds/pendulum_lab.html'), 'in embeds/, by name: ' + [...entries.keys()].join(', '));
  assert.match(new TextDecoder().decode(entries.get('embeds/pendulum_lab.html')), /Hello from the sim/);
  const pj = JSON.parse(new TextDecoder().decode(entries.get('project.json')));
  assert.equal(pj.pages[0].name, 'pendulum_lab');
  assert.deepEqual(p.errors, []);
});

test('a website on the usual list: its own origin, with an Open link; others are off until allowed', async () => {
  const p = await page(); await openApp(p);
  await p.route('https://phet.colorado.edu/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p id="t">PhET here</p>' }));
  const phet = 'https://phet.colorado.edu/sims/html/pendulum-lab/latest/pendulum-lab_en.html';
  await loadProject(p, app([W('Sim', 'embed', 20, 20, 480, 320, { page: phet }), W('Other', 'embed', 20, 360, 300, 120, { page: 'https://example.org/sim' })]));
  await runTab(p);
  const frame = p.locator(".view-run [data-ab='widget:Sim'] iframe");
  assert.equal(await frame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-forms allow-popups');
  assert.equal(await frame.getAttribute('src'), phet);
  assert.equal(await p.frameLocator(".view-run [data-ab='widget:Sim'] iframe").locator('#t').innerText(), 'PhET here');
  assert.equal(await p.locator(".view-run [data-ab='widget:Sim'] .emb-open").getAttribute('href'), phet);
  assert.equal(await p.locator(".view-run [data-ab='widget:Other'] iframe").count(), 0, 'off the list: nothing loads');
  assert.match(await p.locator(".view-run [data-ab='widget:Other']").innerText(), /Allow any website/);
  assert.deepEqual(p.errors, []);
});

// The bridge: a page posts { name, value } to the app, and the app sends values back. Only that iframe's window,
// only names the Embed lists, only plain values.
const TALKER = `<!DOCTYPE html><p id="t">waiting</p><script>
parent.postMessage({ name: 'secret', value: 1 }, '*');            // not listed: dropped
parent.postMessage({ name: 'period', value: { evil: 1 } }, '*');  // not one plain value: dropped
parent.postMessage({ name: 'period', value: 2.5 }, '*');
addEventListener('message', (e) => {
  const { name, value } = e.data || {};
  if (name !== 'gravity') return;
  document.getElementById('t').textContent = 'gravity ' + value;
  parent.postMessage({ name: 'echo', value: value * 2 }, '*');
});
</script>`;

test('the bridge: page -> "Sim sends period" and Sim.period; "Send gravity" -> page; nothing else gets through', async () => {
  const p = await page(); await openApp(p);
  const ev = (conds, actions) => ({ id: Math.random().toString(36).slice(2), else: false, conds, actions, children: [] });
  const proj = app([
    W('Sim', 'embed', 20, 20, 300, 160, { page: 'talker', sends: 'period, echo', listens: 'gravity' }),
    W('Out', 'text', 20, 200, 300, 30, { text: '-' }), W('Echo', 'text', 20, 240, 300, 30, { text: '-' }), W('Moon', 'button', 20, 280, 120, 40, { text: 'Moon' }),
  ], { pages: [{ name: 'talker', data: dataPage(TALKER) }] });
  proj.screens[0].events = [
    ev([{ type: 'onEmbedSends', target: 'Sim', message: 'period' }], [{ type: 'setText', target: 'Out', value: '"period " & Sim.period' }]),
    ev([{ type: 'onEmbedSends', target: 'Sim', message: 'echo' }], [{ type: 'setText', target: 'Echo', value: '"echo " & Sim.echo' }]),
    ev([{ type: 'onClicked', target: 'Moon' }], [{ type: 'sendToEmbed', target: 'Sim', message: 'gravity', value: '1.6' }]),
  ];
  await loadProject(p, proj);
  await runTab(p);
  const run = (n) => p.locator(`.view-run [data-ab='widget:${n}']`);
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:Out']")?.innerText.includes('period'), null, { timeout: 5000 });
  assert.equal((await run('Out').innerText()).trim(), 'period 2.5');
  // a message from another window (here the app's own page) is ignored, even with a listed name
  await p.evaluate(() => window.postMessage({ name: 'period', value: 99 }, '*'));
  await p.waitForTimeout(300);
  assert.equal((await run('Out').innerText()).trim(), 'period 2.5');
  await run('Moon').click();
  assert.equal(await p.frameLocator(".view-run [data-ab='widget:Sim'] iframe").locator('#t').innerText(), 'gravity 1.6');
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:Echo']")?.innerText.includes('echo'), null, { timeout: 5000 });
  assert.equal((await run('Echo').innerText()).trim(), 'echo 3.2');
  assert.deepEqual(await p.evaluate(() => window.__app.player?.rt?.errors?.map((e) => e.message) ?? []), []);
  assert.deepEqual(p.errors, []);
});

test('the Pendulum lab sample: the sim reports its period, Moon changes gravity, Record adds a row', async () => {
  const p = await page(); await openApp(p);
  await p.selectOption("[data-ab='samples']", 'Pendulum lab (Embed)');
  await p.waitForFunction(() => window.__app.S.project.name === 'Pendulum lab');
  await runTab(p);
  const run = (n) => p.locator(`.view-run [data-ab='widget:${n}']`);
  await p.waitForFunction(() => /Period: 2\.01 s/.test(document.querySelector(".view-run [data-ab='widget:PeriodText']")?.innerText || ''), null, { timeout: 5000 });
  await run('Planet').nth(1).click(); // Moon
  await p.waitForFunction(() => /Period: 4\.97 s/.test(document.querySelector(".view-run [data-ab='widget:PeriodText']")?.innerText || ''), null, { timeout: 5000 });
  assert.match(await run('GravityText').innerText(), /Gravity: 1\.6/);
  await run('Record').click();
  await p.waitForTimeout(200);
  assert.match(await run('ReadingsView').innerText(), /1\s+1\.6\s+4\.97/);
  assert.deepEqual(p.errors, []);
});
