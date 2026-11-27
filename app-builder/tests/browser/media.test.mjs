// Pictures and sounds from the app's user: Choose a photo, Choose a sound (with camera and microphone off), and a
// Sound with no player.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { page, openApp, close, loadProject } from './helpers.mjs';

after(close);

const W = (name, kind, x, y, w, h, extra = {}) => ({ name, kind, instanceVars: [], instances: [{ id: name, x, y, w, h, text: '', visible: true, vars: {}, ...extra }] });
const app = (objects, events, extra = {}) => ({ version: 1, name: 'Media', device: 'web', features: { level: 4 }, variables: [], ...extra, screens: [{ id: 'main', name: 'Home', objects, events }] });
const ev = (conds, actions) => ({ id: 'e' + Math.random().toString(36).slice(2, 7), else: false, conds, actions, children: [] });
// a tiny PNG and a 1.5-second silent WAV
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64');
function wav(seconds) {
  const sr = 8000, n = Math.round(sr * seconds), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
const runTab = async (p) => { await p.click("[data-ab='tab:run']"); await p.waitForTimeout(400); };

test('Choose a photo, with the camera off: sets Photo.picture and runs "a photo is taken"', async () => {
  const p = await page(); await openApp(p);
  await loadProject(p, app([W('Cam', 'photo', 20, 20, 300, 225, { shutter: true }), W('Msg', 'text', 20, 260, 300, 32)],
    [ev([{ type: 'onPhotoTaken', target: 'Cam' }], [{ type: 'setText', target: 'Msg', value: '"Got a photo"' }])], { allowCamera: false }));
  await runTab(p);
  assert.match(await p.locator(".view-run [data-ab='widget:Cam'] .pho-msg").innerText(), /choose a photo/i);
  const chooser = p.waitForEvent('filechooser');
  await p.click(".view-run [data-ab='widget:Cam'] [data-ab='photo-choose']");
  await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:Msg']")?.textContent === 'Got a photo');
  assert.equal(await p.locator(".view-run [data-ab='widget:Cam'] .pho-pic").count(), 1, 'the chosen photo shows in the Photo');
  assert.deepEqual(p.errors, []);
});

test('Choose a sound, with the microphone off: works like a finished recording', async () => {
  const p = await page(); await openApp(p);
  await loadProject(p, app([W('Rec', 'recorder', 20, 20, 320, 104), W('Msg', 'text', 20, 140, 300, 32)],
    [ev([{ type: 'onRecorded', target: 'Rec' }], [{ type: 'setText', target: 'Msg', value: '"Got " & Rec.length & " s"' }])], { allowMic: false }));
  await runTab(p);
  assert.match(await p.locator(".view-run [data-ab='widget:Rec'] .rec-msg").innerText(), /choose a sound/i);
  const chooser = p.waitForEvent('filechooser');
  await p.click(".view-run [data-ab='widget:Rec'] [data-ab='recorder-choose']");
  await (await chooser).setFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: wav(1.5) });
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:Msg']")?.textContent === 'Got 1.5 s');
  assert.deepEqual(p.errors, []);
});

test('a Sound with no player: hidden while running, faded in Design, still plays, credit under the app', async () => {
  const p = await page(); await openApp(p);
  await loadProject(p, app([W('Music', 'sound', 20, 20, 260, 52, { sound: 'calm', player: false }), W('Go', 'button', 20, 100, 150, 46, { text: 'Play' })],
    [ev([{ type: 'onClicked', target: 'Go' }], [{ type: 'playSound', target: 'Music' }])]));
  assert.ok(await p.evaluate(() => document.querySelector(".view-design [data-ab='widget:Music']").classList.contains('noplayer')));
  await runTab(p);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector(".view-run [data-ab='widget:Music']")).display), 'none');
  assert.match(await p.locator('.view-run .app-credits').innerText(), /\S/);
  await p.click(".view-run [data-ab='widget:Go']");
  await p.waitForFunction(() => document.querySelector(".view-run [data-ab='widget:Music'] audio")?.getAttribute('src'));
  assert.deepEqual(p.errors.filter((e) => !/play\(\)|NotSupported|media/i.test(e)), []);
});
