// The chores lesson's light/dark button, built the way the lesson will: one event with an Else, a true/false variable,
// colours set while the app runs. Also: a wrong colour shows as an error, the app keeps running.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { page, openApp, close, loadProject } from './helpers.mjs';

after(close);

const W = (name, kind, x, y, w, h, extra = {}) => ({ name, kind, instanceVars: [], instances: [{ id: name, x, y, w, h, text: '', visible: true, vars: {}, ...extra }] });
const cond = (c) => ({ type: 'compareVar', var: 'Dark', op: '=', value: c });
const darkMode = {
  version: 1, name: 'Jobs', device: 'web', features: { level: 2 }, variables: [{ name: 'Dark', value: false }],
  screens: [{ id: 'main', name: 'Home', objects: [W('Title', 'text', 20, 20, 300, 32, { text: 'My jobs today' }), W('ModeButton', 'button', 20, 70, 150, 46, { text: '🌙 Dark' })],
    events: [
      { id: 'e1', else: false, conds: [{ type: 'onClicked', target: 'ModeButton' }], actions: [], children: [
        { id: 'e2', else: false, conds: [cond('false')], actions: [{ type: 'setVar', var: 'Dark', value: 'true' }, { type: 'setBackground', value: '"#1c2333"' },
          { type: 'setColour', target: 'Title', value: '"white"' }, { type: 'setText', target: 'ModeButton', value: '"☀️ Light"' }], children: [] },
        { id: 'e3', else: true, conds: [], actions: [{ type: 'setVar', var: 'Dark', value: 'false' }, { type: 'setBackground', value: '"white"' },
          { type: 'setColour', target: 'Title', value: '"black"' }, { type: 'setText', target: 'ModeButton', value: '"🌙 Dark"' }], children: [] }] }] }],
};

test('a light/dark button: one event with an Else, colours set while running', async () => {
  const p = await page(); await openApp(p);
  await loadProject(p, darkMode);
  await p.click("[data-ab='tab:run']"); await p.waitForTimeout(300);
  const look = () => p.evaluate(() => ({
    bg: getComputedStyle(document.querySelector('.view-run .stage')).backgroundColor,
    title: getComputedStyle(document.querySelector(".view-run [data-ab='widget:Title'] .t") || document.querySelector(".view-run [data-ab='widget:Title']")).color,
    label: document.querySelector(".view-run [data-ab='widget:ModeButton']").textContent.trim() }));
  const before = await look();
  await p.click(".view-run [data-ab='widget:ModeButton']");
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:ModeButton']").textContent.includes('Light'));
  const dark = await look();
  assert.equal(dark.bg, 'rgb(28, 35, 51)');
  assert.equal(dark.title, 'rgb(255, 255, 255)');
  await p.click(".view-run [data-ab='widget:ModeButton']");
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:ModeButton']").textContent.includes('Dark'));
  const light = await look();
  assert.equal(light.bg, 'rgb(255, 255, 255)');
  assert.equal(light.title, 'rgb(0, 0, 0)');
  assert.notEqual(before.bg, dark.bg);
  await p.screenshot({ path: '/tmp/darkmode.png' });
  assert.deepEqual(p.errors, []);
});

test('a Button given a colour keeps a readable label (white on dark, dark on light)', async () => {
  const p = await page(); await openApp(p);
  await loadProject(p, { version: 1, name: 'B', device: 'web', features: { level: 2 }, variables: [], screens: [{ id: 'main', name: 'Home',
    objects: [W('Go', 'button', 20, 20, 150, 46, { text: 'Go' })],
    events: [{ id: 'e1', else: false, conds: [{ type: 'onClicked', target: 'Go' }], actions: [{ type: 'setColour', target: 'Go', value: '"gold"' }], children: [] }] }] });
  await p.click("[data-ab='tab:run']"); await p.waitForTimeout(300);
  await p.click(".view-run [data-ab='widget:Go']");
  await p.waitForFunction(() => getComputedStyle(document.querySelector(".view-run [data-ab='widget:Go'] button") || document.querySelector(".view-run [data-ab='widget:Go']")).backgroundColor === 'rgb(255, 215, 0)');
  const c = await p.evaluate(() => getComputedStyle(document.querySelector(".view-run [data-ab='widget:Go'] button") || document.querySelector(".view-run [data-ab='widget:Go']")).color);
  assert.equal(c, 'rgb(28, 35, 51)', 'dark words on gold');
});
