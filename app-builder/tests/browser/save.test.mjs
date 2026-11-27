// Saving and opening, as a user does it (26–27 Nov 2026: "Save to this computer…" reopened the Save menu instead of
// saving, once drives were in it).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { page, openApp, close } from './helpers.mjs';

after(close);

test('Save ▾ → Save to this computer… saves a file (not the menu again)', async () => {
  const p = await page({ noSavePicker: true });
  await openApp(p);
  const download = p.waitForEvent('download', { timeout: 5000 });
  await p.click("[data-ab='save']");
  if (await p.locator('.popmenu').count()) await p.click("[data-ab='menu:save-to-this-computer']"); // drives on offer: Save asks where
  const d = await download;
  assert.match(d.suggestedFilename(), /\.app\.json$/);
  assert.equal(await p.locator('.popmenu').count(), 0, 'the menu has closed');
  assert.deepEqual(p.errors, []);
});

test('Ctrl+S saves too, and a saved file opens again', async () => {
  const p = await page({ noSavePicker: true });
  await openApp(p);
  await p.fill("[data-ab='project-name']", 'Round trip');
  const download = p.waitForEvent('download', { timeout: 5000 });
  await p.keyboard.press('Control+s');
  if (await p.locator('.popmenu').count()) await p.click("[data-ab='menu:save-to-this-computer']");
  const path = await (await download).path();
  await p.click("[data-ab='new']"); await p.click("[data-ab='new']"); // New asks twice
  const chooser = p.waitForEvent('filechooser');
  await p.click("[data-ab='open']");
  if (await p.locator('.popmenu').count()) await p.click("[data-ab='menu:open-from-this-computer']");
  await (await chooser).setFiles(path);
  await p.waitForFunction(() => window.__app.S.project.name === 'Round trip');
  assert.deepEqual(p.errors, []);
});
