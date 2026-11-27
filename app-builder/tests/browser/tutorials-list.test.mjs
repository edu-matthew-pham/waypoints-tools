// The Tutorials button: the list from the tutorials site, in sections; opening one; leaving it.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { page, openApp, close } from './helpers.mjs';

after(close);

const L = (slug, title, unit, optional = false) => ({ slug, title, summary: 'About ' + title, unit, optional });
const LIST = { v: 1, site: 'https://tutorials.learningwaypoints.com/', courses: [
  { path: 'code/apps', title: 'App Builder apps', units: [{ id: 'respond', title: 'Apps that respond', section: 'First apps' }, { id: 'screens', title: 'Screens', section: 'More apps' }],
    lessons: [L('code/apps/practice-tracker', 'A practice tracker', 'respond'), L('code/apps/values-journal', 'A values journal', 'screens')] },
  { path: 'code/data-apps', title: 'Data apps', units: [{ id: 'tables', title: 'Tables' }], lessons: [L('code/data-apps/one-table', 'One table', 'tables', true)] }] };
const LESSONS = { 'code/apps/practice-tracker': 'practice-tracker' };

test('the list shows in sections, one at a time; a lesson opens guided; Leave goes back', async () => {
  const p = await page({ list: LIST, lessons: LESSONS });
  await openApp(p);
  await p.click("[data-ab='tutorials']");
  await p.waitForSelector('.tl-item');
  assert.deepEqual((await p.locator('.tl-tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['1 First apps 1', '2 More apps 1', '3 Data apps 1']);
  assert.deepEqual(await p.locator('.tl-panel .tl-item .tl-title').allInnerTexts(), ['A practice tracker']);
  await p.click("[data-ab='tutorial-section:3']");
  assert.match((await p.locator('.tl-panel').innerText()).replace(/\s+/g, ' '), /One table extra/);
  await p.click("[data-ab='tutorial-section:1']");
  await p.click("[data-ab='tutorial:code/apps/practice-tracker']");
  await p.waitForSelector("[data-ab='tutorial']");
  assert.match(p.url(), /\?lesson=code\/apps\/practice-tracker$/);
  await p.click("[data-ab='tutorials']");
  await p.waitForSelector('.tl-item.here');
  assert.equal(await p.locator('.tl-item.here').evaluate((e) => getComputedStyle(e).fontFamily === getComputedStyle(e.parentElement).fontFamily && e.getBoundingClientRect().width > 300), true, 'the open lesson looks like the others (27 Nov: it took the sidebar\u2019s .now style)');
  await p.click("[data-ab='tutorial-leave']");
  await p.waitForSelector("[data-ab='tutorials']");
  assert.equal(new URL(p.url()).search, '');
  assert.equal(await p.locator("[data-ab='tutorial']").count(), 0);
  assert.deepEqual(p.errors, []);
});

test('no list (offline, or not published): the dialog says so', async () => {
  const p = await page({ list: null });
  await openApp(p);
  await p.click("[data-ab='tutorials']");
  await p.waitForFunction(() => /couldn.t be loaded/.test(document.querySelector('.tl')?.textContent || ''));
  assert.deepEqual(p.errors, []);
});
