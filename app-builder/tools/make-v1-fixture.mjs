// Makes tests/fixtures/v1-project.json: one app that uses every kind of thing v1 can save (screens, All screens,
// functions, variables, lists, tables with every field type, every object, media settings). Run once, when v1 was
// tagged; the file is then frozen, and tests/v1-compat.test.js checks later versions still open and run it.
//   node tools/make-v1-fixture.mjs
import { writeFileSync } from 'node:fs';
import { valuesJournal } from '../src/samples.js';
import { addObject, newEvent, checkProject, newScreen } from '../src/core/project.js';
import { newFunction } from '../src/core/functions.js';
import { addParam } from '../src/core/rename.js';

const p = checkProject(valuesJournal());
p.name = 'v1 everything';
p.allowCamera = true; p.allowMic = true; p.allowYoutube = false;
p.features = { level: 4 };
const s = newScreen('Media'); p.screens.push(s);
for (const [kind, name] of [['drawing', 'Pad'], ['photo', 'Cam'], ['recorder', 'Mic'], ['sound', 'Player'], ['video', 'Clip'], ['image', 'Show'],
  ['button', 'KeepBtn'], ['button', 'HomeBtn'], ['text', 'Msg'], ['table', 'Gallery'], ['list', 'Names']]) addObject(s, kind).obj.name = name;
const inst = (n) => s.objects.find((o) => o.name === n).instances[0];
inst('Gallery').source = 'Clips'; inst('Names').source = 'People';
inst('Player').sound = 'calm'; inst('Clip').link = 'https://commons.wikimedia.org/wiki/File:Example.webm';
p.variables.push(
  { name: 'Saved', value: 0, remember: true },
  { name: 'People', value: ['Ana', 'Ben'], remember: true },
  { name: 'Kinds', table: { fields: [{ name: 'kind', type: 'text' }] }, value: [{ kind: 'drawing' }, { kind: 'photo' }] },
  { name: 'Clips', remember: true, table: { fields: [{ name: 'note', type: 'text' }, { name: 'n', type: 'number' }, { name: 'picture', type: 'picture' },
    { name: 'sound', type: 'sound' }, { name: 'kind', type: 'link', to: 'Kinds' }] }, value: [{ note: 'start', n: 1, picture: 'star', sound: 'calm', kind: 'drawing' }] });
s.events.push(
  newEvent({ conds: [{ type: 'onDrawn', target: 'Pad' }], actions: [{ type: 'setText', target: 'Msg', value: '"lines: " & Pad.lines' }] }),
  newEvent({ conds: [{ type: 'onClicked', target: 'KeepBtn' }], actions: [
    { type: 'tableAdd', table: 'Clips', values: { note: '"drawn"', n: 'Saved', picture: 'Pad.picture', sound: '', kind: '"drawing"' } },
    { type: 'setImageFrom', target: 'Show', value: 'Pad.picture' }, { type: 'clearDrawing', target: 'Pad' }] }),
  newEvent({ conds: [{ type: 'onPhotoTaken', target: 'Cam' }], actions: [{ type: 'tableAdd', table: 'Clips', values: { note: '"photo"', n: '0', picture: 'Cam.picture', sound: '', kind: '"photo"' } }] }),
  newEvent({ conds: [{ type: 'onRecorded', target: 'Mic' }], actions: [{ type: 'setSoundNamed', target: 'Player', name: 'Mic.sound' }, { type: 'playSound', target: 'Player' }] }),
);
const fn = newFunction(p, 'Bump');
addParam(p, 'Bump', 'by');
fn.events = [newEvent({ actions: [{ type: 'addTo', var: 'Saved', value: 'by' }] })];
p.allScreens.events.push(newEvent({ conds: [{ type: 'onClicked', target: 'HomeBtn' }], actions: [{ type: 'callFunction', fn: 'Bump', args: { by: '1' } }, { type: 'goToScreen', screen: p.screens[0].id }] }));
writeFileSync(new URL('../tests/fixtures/v1-project.json', import.meta.url), JSON.stringify(p, null, 2) + '\n');
console.log('wrote tests/fixtures/v1-project.json');
