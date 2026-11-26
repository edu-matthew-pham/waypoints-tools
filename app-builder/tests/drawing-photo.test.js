// Drawing and Photo (ROADMAP §10 step 2): pictures made while the app runs, kept as references.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/core/runtime.js';
import { newProject, addObject, newEvent, checkProject, FIELD_TYPES } from '../src/core/project.js';
import { sheetText } from '../src/core/sheet-text.js';
import { resolve, canUse } from '../src/edu/features.js';

function app() {
  const p = checkProject(newProject('Gallery'));
  const s = p.screens[0];
  for (const [kind, name] of [['drawing', 'Pad'], ['photo', 'Cam'], ['image', 'Show'], ['button', 'Keep'], ['button', 'Snap'], ['button', 'Undo'], ['button', 'Wipe'], ['text', 'Msg']]) addObject(s, kind).obj.name = name;
  p.variables.push({ name: 'Pics', table: { fields: [{ name: 'note', type: 'text' }, { name: 'picture', type: 'picture' }] }, value: [{ note: 'start', picture: 'star' }] });
  s.events.push(
    newEvent({ conds: [{ type: 'onDrawn', target: 'Pad' }], actions: [{ type: 'setText', target: 'Msg', value: '"lines: " & Pad.lines' }] }),
    newEvent({ conds: [{ type: 'onClicked', target: 'Keep' }], actions: [
      { type: 'tableAdd', table: 'Pics', values: { note: '"drawn"', picture: 'Pad.picture' } },
      { type: 'setImageFrom', target: 'Show', value: 'Pad.picture' }] }),
    newEvent({ conds: [{ type: 'onClicked', target: 'Snap' }], actions: [{ type: 'takePhoto', target: 'Cam' }, { type: 'setImageFrom', target: 'Show', value: 'Cam.picture' }] }),
    newEvent({ conds: [{ type: 'onClicked', target: 'Undo' }], actions: [{ type: 'undoDrawing', target: 'Pad' }] }),
    newEvent({ conds: [{ type: 'onClicked', target: 'Wipe' }], actions: [{ type: 'clearDrawing', target: 'Pad' }] }),
  );
  return p;
}
const one = (rt, n) => rt.instancesOf(n)[0];
function runtime(p = app()) {
  let n = 0;
  const shots = [];
  const rt = new Runtime(p, { hooks: { snapshot: (id) => { shots.push(id); return `media:0000000${++n}`; } } });
  rt.start();
  return { rt, shots };
}

test('lines are counted; undo and clear change the count and tell the page (seq counters)', () => {
  const { rt } = runtime();
  const pad = one(rt, 'Pad');
  rt.userChange(pad.id, 1); rt.userChange(pad.id, 2);
  assert.equal(pad.props.lines, 2);
  assert.equal(one(rt, 'Msg').props.text, 'lines: 2'); // "is drawn on" ran
  rt.click(one(rt, 'Undo').id);
  assert.equal(pad.props.lines, 1); assert.equal(pad.props.undoSeq, 1);
  rt.click(one(rt, 'Wipe').id);
  assert.equal(pad.props.lines, 0); assert.equal(pad.props.clearSeq, 1);
  rt.click(one(rt, 'Undo').id);
  assert.equal(pad.props.undoSeq, 1, 'undo on an empty drawing does nothing');
});

test('Drawing.picture is made when read, kept until the drawing changes, and saved by reference in a row', () => {
  const { rt, shots } = runtime();
  const pad = one(rt, 'Pad');
  rt.userChange(pad.id, 1);
  rt.click(one(rt, 'Keep').id);
  rt.click(one(rt, 'Keep').id); // no new line: the same picture, no second file
  assert.equal(shots.length, 1);
  const rows = rt.globals.get('Pics');
  assert.deepEqual(rows.slice(1).map((r) => r.picture), ['media:00000001', 'media:00000001']);
  assert.equal(one(rt, 'Show').props.image, 'media:00000001');
  rt.userChange(pad.id, 2);
  rt.click(one(rt, 'Keep').id);
  assert.equal(rt.globals.get('Pics').at(-1).picture, 'media:00000002');
  assert.equal(rows[1].picture, 'media:00000001', 'an earlier row keeps the earlier drawing');
});

test('an empty drawing gives no picture (or its background); Set picture to says so plainly', () => {
  const { rt, shots } = runtime();
  rt.click(one(rt, 'Keep').id);
  assert.equal(shots.length, 0);
  assert.match(rt.errors.at(-1).message, /no picture yet/);
  one(rt, 'Pad').props.background = 'heart';
  assert.equal(rt.evalExpr('Pad.picture', { picked: new Map(), loop: [] }), 'heart');
});

test('a photo needs the camera on first; then Photo.picture is the photo', () => {
  const { rt } = runtime();
  rt.click(one(rt, 'Snap').id);
  assert.ok(rt.errors.some((e) => /camera isn't on yet/.test(e.message)));
  rt.userChange(one(rt, 'Cam').id, true);
  assert.equal(one(rt, 'Cam').props.ready, true);
  rt.click(one(rt, 'Snap').id);
  assert.equal(one(rt, 'Cam').props.picture, 'media:00000001');
  assert.equal(one(rt, 'Show').props.image, 'media:00000001');
});

test('Set picture to the one in: names of pictures and references work, anything else is a plain error', () => {
  const { rt } = runtime();
  const show = one(rt, 'Show');
  const ctx = { picked: new Map(), loop: [] };
  ACTIONS_run(rt, { type: 'setImageFrom', target: 'Show', value: '"heart"' }, ctx);
  assert.equal(show.props.image, 'heart');
  ACTIONS_run(rt, { type: 'setImageFrom', target: 'Show', value: '"media:abcdef12"' }, ctx);
  assert.equal(show.props.image, 'media:abcdef12');
  assert.throws(() => ACTIONS_run(rt, { type: 'setImageFrom', target: 'Show', value: '"nope"' }, ctx), /no picture called "nope"/);
});
import { ACTIONS } from '../src/core/catalog.js';
function ACTIONS_run(rt, a, ctx) { ACTIONS[a.type].run(rt, ctx, a); }

test('pen colour and size actions; size is kept between 1 and 40', () => {
  const { rt } = runtime();
  const ctx = { picked: new Map(), loop: [] };
  ACTIONS_run(rt, { type: 'setPenColour', target: 'Pad', value: '"blue"' }, ctx);
  ACTIONS_run(rt, { type: 'setPenSize', target: 'Pad', value: '99' }, ctx);
  assert.equal(one(rt, 'Pad').props.color, 'blue');
  assert.equal(one(rt, 'Pad').props.pen, 40);
});

test('picture is a field type; the new blocks are offered from level 3; the sheet text names them', () => {
  assert.ok(FIELD_TYPES.some(([t]) => t === 'picture'));
  const l2 = resolve({ level: 2 }), l3 = resolve({ level: 3 });
  for (const id of ['takePhoto', 'clearDrawing', 'setImageFrom']) { assert.ok(!canUse(l2, 'act', id)); assert.ok(canUse(l3, 'act', id)); }
  assert.ok(l3.kinds.includes('drawing') && l3.kinds.includes('photo') && !l2.kinds.includes('photo'));
  const text = sheetText(app());
  assert.match(text, /object Pad \(drawing\)/);
  assert.match(text, /Take a photo with Cam/);
});

test('the Photo\'s own take-photo button takes the photo and runs "a photo is taken"; the action does not run it', () => {
  const p = app();
  p.screens[0].events.push(newEvent({ conds: [{ type: 'onPhotoTaken', target: 'Cam' }], actions: [{ type: 'setText', target: 'Msg', value: '"taken " & Cam.picture' }] }));
  const { rt } = runtime(p);
  const cam = one(rt, 'Cam');
  rt.userChange(cam.id, { shoot: true });
  assert.ok(rt.errors.some((e) => /camera isn't on yet/.test(e.message)), 'no camera yet: a plain problem, nothing runs');
  assert.equal(one(rt, 'Msg').props.text, 'Text');
  rt.userChange(cam.id, true);
  rt.userChange(cam.id, { shoot: true });
  assert.equal(one(rt, 'Msg').props.text, 'taken media:00000001');
  rt.click(one(rt, 'Snap').id); // Take a photo with Cam, from a button's event
  assert.equal(one(rt, 'Msg').props.text, 'taken media:00000001', 'the action does not run "a photo is taken"');
  assert.equal(cam.props.picture, 'media:00000002');
});

test('Choose a photo: a picture from the device sets Photo.picture and runs "a photo is taken", with no camera', () => {
  const p = app();
  p.screens[0].events.push(newEvent({ conds: [{ type: 'onPhotoTaken', target: 'Cam' }], actions: [{ type: 'setText', target: 'Msg', value: '"chosen " & Cam.picture' }] }));
  const kept = [];
  const rt = new Runtime(p, { hooks: { keepPicture: (d) => { kept.push(d); return 'media:0000000a'; } } });
  rt.start();
  const cam = one(rt, 'Cam');
  assert.ok(!cam.props.ready, 'the camera never started');
  rt.userChange(cam.id, { chosen: 'data:image/jpeg;base64,AAAA' });
  assert.deepEqual(kept, ['data:image/jpeg;base64,AAAA'], 'the page keeps it in the media store');
  assert.equal(cam.props.picture, 'media:0000000a');
  assert.equal(one(rt, 'Msg').props.text, 'chosen media:0000000a');
  // with nowhere to keep files (no hook), the picture itself is used
  const rt2 = new Runtime(app(), {}); rt2.start();
  rt2.userChange(one(rt2, 'Cam').id, { chosen: 'data:image/jpeg;base64,BBBB' });
  assert.equal(one(rt2, 'Cam').props.picture, 'data:image/jpeg;base64,BBBB');
});

test('a Sound without a player still plays from events; the sheet text says so', () => {
  const p = checkProject(newProject('Music'));
  const s = p.screens[0];
  const snd = addObject(s, 'sound').obj; snd.name = 'Cheer'; snd.instances[0].player = false;
  addObject(s, 'button').obj.name = 'Go';
  s.events.push(newEvent({ conds: [{ type: 'onClicked', target: 'Go' }], actions: [{ type: 'playSound', target: 'Cheer' }] }));
  assert.match(sheetText(p), /object Cheer \(sound\) text "" sound \S+ \(no player\)/);
  const rt = new Runtime(p, {}); rt.start();
  rt.click(one(rt, 'Go').id);
  assert.equal(one(rt, 'Cheer').props.playing, true);
  assert.equal(one(rt, 'Cheer').props.player, false);
});
