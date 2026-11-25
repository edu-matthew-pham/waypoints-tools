import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/core/runtime.js';
import { newProject, addObject, newEvent } from '../src/core/project.js';
import { videoSource, soundInfo, soundNames, addBuiltinSounds } from '../src/core/assets.js';
import { sheetText } from '../src/core/sheet-text.js';
import { resolve } from '../src/edu/features.js';

function app() {
  const p = newProject('Player');
  const s = p.screens[0];
  for (const [kind, name] of [['sound', 'Music'], ['button', 'Go'], ['button', 'Halt'], ['text', 'Msg']]) addObject(s, kind).obj.name = name;
  p.variables.push({ name: 'Songs', table: { fields: [{ name: 'title', type: 'text' }, { name: 'sound', type: 'text' }] }, value: [{ title: 'Calm', sound: 'calm' }, { title: 'Bad', sound: 'nope' }] });
  addObject(s, 'table').obj.name = 'View';
  s.objects.find((o) => o.name === 'View').instances[0].source = 'Songs';
  s.events.push(
    newEvent({ conds: [{ type: 'onClicked', target: 'Go' }], actions: [{ type: 'playSound', target: 'Music' }] }),
    newEvent({ conds: [{ type: 'onClicked', target: 'Halt' }], actions: [{ type: 'stopSound', target: 'Music' }] }),
    newEvent({ conds: [{ type: 'onEnded', target: 'Music' }], actions: [{ type: 'setText', target: 'Msg', value: '"done"' }] }),
    newEvent({ conds: [{ type: 'onItemClicked', target: 'View' }], actions: [{ type: 'setSoundNamed', target: 'Music', name: 'ClickedItem.sound' }, { type: 'playSound', target: 'Music' }] }),
  );
  return p;
}
const one = (rt, n) => rt.instancesOf(n)[0];

test('play, stop and finishing: the runtime keeps playing and counts each command', () => {
  const rt = new Runtime(app());
  rt.start();
  const m = one(rt, 'Music');
  assert.equal(m.props.playing, false);
  assert.equal(m.props.sound, 'calm');
  rt.click(one(rt, 'Go').id);
  assert.equal(m.props.playing, true);
  const seq = m.props.mediaSeq;
  rt.click(one(rt, 'Go').id);
  assert.equal(m.props.mediaSeq, seq + 1, 'Play again restarts it');
  assert.equal(rt.evalExpr('Music.playing', { picked: new Map(), loop: [] }), true);
  rt.mediaEnded(m.id);
  assert.equal(m.props.playing, false);
  assert.equal(one(rt, 'Msg').props.text, 'done');
  rt.mediaState(m.id, true); // the user pressed the player's own button
  assert.equal(m.props.playing, true);
  rt.click(one(rt, 'Halt').id);
  assert.equal(m.props.playing, false);
});

test('a table field can name the sound to play; a name that is not a sound is an error', () => {
  const rt = new Runtime(app());
  rt.start();
  const v = one(rt, 'View');
  rt.itemClick(v.id, 1);
  assert.equal(one(rt, 'Music').props.sound, 'calm');
  assert.equal(one(rt, 'Music').props.playing, true);
  rt.itemClick(v.id, 2);
  assert.match(rt.errors[0].message, /no sound called "nope"/);
});

test('sounds: built-ins, uploads and extra built-ins', () => {
  const p = app();
  assert.ok(soundNames(p).includes('chime'));
  assert.equal(soundInfo(p, 'chime').src, 'sounds/chime.mp3');
  p.sounds = [{ name: 'band', data: 'data:audio/mpeg;base64,AAAA' }];
  assert.equal(soundInfo(p, 'band').credit, 'Uploaded');
  addBuiltinSounds([{ name: 'rain_roof', file: 'rain-roof.mp3', title: 'Rain on the Roof', credit: 'FreePD, CC0' }, { name: 'Bad Name', file: 'x.mp3' }, { name: 'evil', file: '../x.mp3' }]);
  assert.equal(soundInfo(p, 'rain_roof').src, 'sounds/rain-roof.mp3');
  assert.ok(!soundNames(p).includes('evil'));
  assert.match(sheetText(p), /object Music \(sound\) text "" sound calm/);
});

test('video links: Commons pages become files, YouTube only when allowed, others need a video file', () => {
  const c = videoSource('https://commons.wikimedia.org/wiki/File:Bee on flower.webm');
  assert.equal(c.kind, 'file');
  assert.equal(c.src, 'https://commons.wikimedia.org/wiki/Special:FilePath/Bee_on_flower.webm');
  assert.equal(c.page, 'https://commons.wikimedia.org/wiki/File:Bee_on_flower.webm');
  assert.equal(videoSource('https://archive.org/download/x/clip.mp4').kind, 'file');
  assert.equal(videoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ').kind, 'blocked');
  const y = videoSource('https://youtu.be/dQw4w9WgXcQ', { allowYoutube: true });
  assert.equal(y.kind, 'youtube');
  assert.match(y.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  assert.equal(videoSource('https://example.com/page').kind, 'none');
  assert.equal(videoSource('javascript:alert(1)').kind, 'none');
  assert.equal(videoSource('').kind, 'none');
});

test('sound and video are offered from level 2, a sound named by a field from level 3', () => {
  assert.ok(!resolve({ level: 1 }).kinds.includes('sound'));
  assert.ok(resolve({ level: 2 }).kinds.includes('video'));
  assert.ok(resolve({ level: 2 }).act.has('playSound'));
  assert.ok(!resolve({ level: 2 }).act.has('setSoundNamed'));
  assert.ok(resolve({ level: 3 }).act.has('setSoundNamed'));
});
