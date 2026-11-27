// The Toggle's Tick box look: chosen in Properties, ticks and unticks when running, "is on" works the same.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { page, openApp, close, loadProject } from './helpers.mjs';

after(close);

test('a Toggle as a tick box: pick the look in Properties, then tick it in the running app', async () => {
  const p = await page(); await openApp(p);
  const W = (name, kind, x, y, w, h, extra = {}) => ({ name, kind, instanceVars: [], instances: [{ id: name, x, y, w, h, text: '', visible: true, vars: {}, ...extra }] });
  await loadProject(p, { version: 1, name: 'Jobs', device: 'web', features: { level: 2 }, variables: [], screens: [{ id: 'main', name: 'Home', objects: [
    W('BedJob', 'toggle', 20, 20, 220, 32, { text: 'Make the bed', on: false }), W('Msg', 'text', 20, 70, 300, 32)],
    events: [{ id: 'e1', else: false, conds: [{ type: 'onToggled', target: 'BedJob' }], actions: [{ type: 'setText', target: 'Msg', value: 'if(BedJob.on = true, "Done!", "Not yet")' }], children: [] }] }] });
  await p.click(".view-design [data-ab='widget:BedJob']");
  await p.selectOption("[data-ab='prop:look']", 'tick');
  assert.ok(await p.evaluate(() => document.querySelector(".view-design [data-ab='widget:BedJob'] .tg").classList.contains('tick')));
  assert.equal(await p.evaluate(() => document.querySelector(".view-design [data-ab='widget:BedJob'] input").getAttribute('role')), 'checkbox');
  await p.click("[data-ab='tab:run']"); await p.waitForTimeout(300);
  await p.click(".view-run [data-ab='widget:BedJob'] .tg");
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:Msg']")?.textContent === 'Done!');
  await p.click(".view-run [data-ab='widget:BedJob'] .tg");
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:Msg']")?.textContent === 'Not yet');
  await p.screenshot({ path: '/tmp/tickbox.png' });
  assert.deepEqual(p.errors, []);
});
