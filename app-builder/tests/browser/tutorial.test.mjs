// Guided tutorials in the browser: a student following only the ring through real lessons (copies in tests/fixtures),
// and the card staying put (27 Nov 2026: it flipped sides four times a second while the ring pointed at its own
// checklist). Each step starts from the lesson's own starter for that step.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page, openApp, close, lessonFiles, region, loadProject, watchFlips, followRing, stepBuilt, ring, ROOT } from './helpers.mjs';
import { parseLesson } from '../../src/edu/tutorial.js';

after(close);

const LESSONS = { 'code/apps/practice-tracker': 'practice-tracker', 'code/apps/water-sound': 'water-sound', 'code/apps/creature-scores': 'creature-scores', 'code/data-apps/journal-drawings': 'journal-drawings', 'code/apps/practice-record': 'practice-record', 'code/data-apps/one-table': 'one-table' };
const slugOf = (fixture) => Object.keys(LESSONS).find((k) => LESSONS[k] === fixture);

// Open a fixture lesson guided, go to the step whose title matches, starting from that step's own starter.
async function atStep(fixture, title, view) {
  const files = lessonFiles(fixture);
  const steps = parseLesson(files['lesson.md']).steps;
  const i = steps.findIndex((s) => title.test(s.title));
  assert.ok(i >= 0, `no step ${title} in ${fixture}`);
  const p = await page({ lessons: LESSONS, view });
  await openApp(p, '?lesson=' + slugOf(fixture));
  await loadProject(p, region(files, steps[i].start.split('#')[1]));
  await p.click(`[data-ab='tutorial-step:${i + 1}']`);
  await p.waitForTimeout(300);
  return p;
}

// What a student gets from the ring alone, step by step. 'built': the ring leads all the way. 'checklist': the clip
// shows part and the step's text asks for more; the ring hands over to the card's checklist (fine), never loops.
const EXPECT = [
  ['practice-tracker', /^Build 1/, 'built'],
  ['practice-tracker', /^Build 2/, 'built'],
  ['practice-tracker', /^Build 3/, 'checklist'],
  ['water-sound', /^Build 1/, 'built'],        // a box already holding the clip's text; a dropdown set with arrow keys
  ['creature-scores', /^Build 1/, 'checklist'], // renaming a function, not an object
  ['journal-drawings', /^Build 3/, 'checklist'], // a table rule with settings: no endless add-and-rename
  ['practice-record', /^Build 2/, 'built'],     // a tick box named with Playwright's :has-text() (was stuck, 28 Nov 2026)
  ['one-table', /^Build 1/, 'built'],           // Enter then change in a field-name box is one move (was stuck: skipped "artist")
];
for (const [fixture, title, want] of EXPECT) {
  test(`${fixture} ${title.source.slice(1)}: following the ring → ${want}, the card steady`, async () => {
    const p = await atStep(fixture, title);
    const flips = await watchFlips(p);
    const r = await followRing(p);
    const during = await flips.count();
    await p.waitForTimeout(2000);
    const idle = (await flips.count()) - during;
    assert.equal(r.built ? 'built' : r.stop, want, `stopped: ${r.stop} after ${r.moves} moves`);
    assert.ok(during <= 2, `the card changed sides ${during} times while following`);
    assert.equal(idle, 0, 'the card keeps changing sides while nothing happens');
    assert.deepEqual(p.errors, []);
  });
}

test('the card stays put while the ring points at its own checklist, on common screen sizes', async () => {
  for (const view of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080]]) {
    const p = await atStep('practice-tracker', /^Build 3/, view);
    await followRing(p); // to the checklist hand-over
    const flips = await watchFlips(p);
    await p.waitForTimeout(2500);
    assert.equal(await flips.count(), 0, `the card flips at ${view.join('×')}`);
  }
});

test('Try the finished app: it opens over the editor, and Start building moves on to Build 1', async () => {
  const p = await page({ lessons: LESSONS });
  await openApp(p, '?lesson=code/apps/practice-tracker');
  assert.match(await p.locator('.tut-title').innerText(), /finished app/i);
  await p.click("[data-ab='tutorial-play']");
  await p.waitForSelector(".tut-play-dlg [data-ab='widget:SaveButton']");
  await p.click("[data-ab='tutorial-play-next']");
  await p.waitForTimeout(300);
  assert.match(await p.locator('.tut-title').innerText(), /^Build 1/);
  assert.equal(await p.locator('.tut-play-dlg').count(), 0);
  assert.deepEqual(p.errors, []);
});

test('a finished step says so: the Step done banner, and Next goes on', async () => {
  const p = await atStep('practice-tracker', /^Build 1/);
  await loadProject(p, region(lessonFiles('practice-tracker'), 'sol-step-2'));
  await p.waitForSelector('.tut-cheer');
  assert.match(await p.locator('.tut-cheer').innerText(), /Step done/);
  assert.ok(await stepBuilt(p));
  await p.click("[data-ab='tutorial-cheer-next']");
  assert.match(await p.locator('.tut-title').innerText(), /^Build 2/);
});

test('progress is kept: reload, and the tutorial is on the same step with the same work', async () => {
  const p = await atStep('practice-tracker', /^Build 2/);
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForSelector("[data-ab='tutorial']");
  assert.match(await p.locator('.tut-title').innerText(), /^Build 2/);
  assert.ok(await p.evaluate(() => window.__app.S.project.screens[0].objects.some((o) => o.name === 'SaveButton')));
});

test('the fixtures are real lessons (refresh them from waypoints-tutorials when lessons change)', () => {
  for (const f of new Set(Object.values(LESSONS))) assert.ok(readFileSync(ROOT + `tests/fixtures/${f}/lesson.md`, 'utf8').startsWith('---'));
});

test('work saved before a lesson renamed its input: the ring leads the rename, then the step ticks', async () => {
  const files = lessonFiles('practice-tracker');
  const steps = parseLesson(files['lesson.md']).steps;
  const i = steps.findIndex((s) => /^Build 3/.test(s.title));
  const p = await page({ lessons: LESSONS });
  await openApp(p, '?lesson=code/apps/practice-tracker');
  // the lesson's finished app, but with the input still called TextInput
  await loadProject(p, JSON.parse(JSON.stringify(region(files, 'done')).replace(/MinutesInput/g, 'TextInput')));
  await p.click(`[data-ab='tutorial-step:${i + 1}']`);
  await p.waitForTimeout(400);
  assert.ok(!(await stepBuilt(p)), 'not ticked yet');
  assert.match(await p.locator("[data-ab='tutorial-todo']").innerText(), /a Text input called MinutesInput/);
  const r = await followRing(p);
  assert.equal(r.built, true, `stopped: ${r.stop}`);
  assert.ok(await p.evaluate(() => window.__app.S.project.screens[0].objects.some((o) => o.name === 'MinutesInput')));
});

test('a check that asks for an object’s text: the ring selects it and says what to type', async () => {
  const files = lessonFiles('practice-tracker');
  // Build 1's check, as lessons can write it: the button says Save, and the title says Practice tracker
  files['lesson.md'] = files['lesson.md'].replace('"object SaveButton (button)"', '"object SaveButton (button) text \\"Save\\"", "(text) text \\"Practice tracker\\""');
  const steps = parseLesson(files['lesson.md']).steps;
  const i = steps.findIndex((s) => /^Build 1/.test(s.title));
  const p = await page({ lessons: { 'code/apps/practice-tracker': files } });
  await openApp(p, '?lesson=code/apps/practice-tracker');
  await loadProject(p, region(files, steps[i].start.split('#')[1]));
  await p.click(`[data-ab='tutorial-step:${i + 1}']`);
  await p.waitForTimeout(300);
  const r = await followRing(p, { maxMoves: 60 });
  assert.equal(r.built, true, `stopped: ${r.stop}`);
  const texts = await p.evaluate(() => Object.fromEntries(window.__app.S.project.screens[0].objects.map((o) => [o.name, o.instances[0].text])));
  assert.equal(texts.SaveButton, 'Save');
  assert.ok(Object.values(texts).includes('Practice tracker'));
  assert.deepEqual(p.errors, []);
});

// A slip in a typed value (28 Nov 2026): the ring goes back to the box while it's open; once it's closed, the card
// shows what the lesson typed. A student following only the ring until the value box, then typing Minuts for Minutes.
test('a typo in a value box: the ring goes back to it, then the card says what the lesson typed', async () => {
  const p = await atStep('practice-tracker', /^Build 3/);
  const want = '"You\'ve practised " & Minutes & " minutes"';
  let r;
  for (let n = 0; n < 30; n++) { // follow the ring until it points at the dialog's value box
    await p.waitForTimeout(350);
    r = await ring(p);
    assert.ok(r, 'the ring is there');
    if (r.inDialog && r.ab === 'param:value') break;
    if (r.tag === 'SELECT') await p.selectOption('[data-ringed]', { label: r.caption.match(/Choose: (.*)$/)[1] });
    else await p.click('[data-ringed]');
  }
  assert.equal(r.ab, 'param:value');
  await p.fill('[data-ringed]', want.replace('Minutes', 'Minuts'));
  await p.press('[data-ringed]', 'Tab');
  await p.waitForTimeout(400);
  r = await ring(p);
  assert.equal(r.ab, 'param:value', 'the ring stays on the box with the slip');
  assert.match(r.caption, /^Not quite: check yours matches, letter for letter .* Type: "You've practised " & Minutes & " minutes"$/);
  // fixed: the ring moves on (to Done)
  await p.fill('[data-ringed]', want);
  await p.press('[data-ringed]', 'Tab');
  await p.waitForTimeout(400);
  r = await ring(p);
  assert.notEqual(r.ab, 'param:value', 'fixed: the ring moves on');
  // an unknown name can't be added at all: the dialog says so, with the closest name
  await p.fill("dialog[open] [data-ab='param:value']", want.replace('Minutes', 'Minuts'));
  await p.waitForTimeout(300);
  assert.ok(await p.locator("dialog[open] [data-ab='done']").isDisabled(), 'Add is off while the value has an unknown name');
  assert.match(await p.locator('dialog[open]').innerText(), /There's no variable called "Minuts"\. Did you mean Minutes\?/);
  // a slip that is still a valid value (" minute" for " minutes"), and Add anyway: the card shows what the lesson
  // typed, and the ring points at it
  await p.fill("dialog[open] [data-ab='param:value']", want.replace('" minutes"', '" minute"'));
  await p.click("dialog[open] [data-ab='done']");
  await p.waitForTimeout(500);
  assert.match(await p.locator("[data-ab='tutorial-typed']").innerText(), /The lesson’s video types:[\s\S]*"You've practised " & Minutes & " minutes"/);
  r = await ring(p);
  assert.match(r.caption, /^Find this in your events and check it matches/);
  assert.deepEqual(p.errors, []);
});
