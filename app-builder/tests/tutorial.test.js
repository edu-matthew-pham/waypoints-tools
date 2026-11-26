// Guided tutorials read from a Waypoints lesson (src/edu/tutorial.js). The fixture is a copy of the tutorials'
// "A practice tracker" (content/code/apps/practice-tracker), so this also notices if the lesson format moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLesson, parseSource, ticks, region, targetsOf, triesOf, mentionedVariables, clipUrls, hintsOf, evalRules, tutorialUrl, loadStarter, inlineFiles } from '../src/edu/tutorial.js';
import { sheetText } from '../src/core/sheet-text.js';
import { checkProject } from '../src/core/project.js';

const dir = new URL('./fixtures/practice-tracker/', import.meta.url);
const lesson = readFileSync(new URL('lesson.md', dir), 'utf8');
const app = readFileSync(new URL('app.json', dir), 'utf8');
const sheet = (name) => sheetText(checkProject(JSON.parse(region(app, name))));

test('a lesson becomes one tutorial step per App Builder build step (tasks split), after Try the finished app', () => {
  const t = parseLesson(lesson);
  assert.equal(t.steps[0].title, 'Try the finished app');
  assert.equal(t.steps[0].play, 'app.json#done');
  t.steps.shift();
  assert.equal(t.title, 'A practice tracker');
  assert.equal(t.starter, 'app.json#start');
  assert.equal(t.level, 2);
  assert.deepEqual(t.steps.map((s) => s.title), ['Build 1: make the screen', 'Build 2: count with a variable', 'Build 3: show the total', 'A Reset button', 'Count the sessions']);
  assert.equal(t.steps[3].part, 'Make it yours: Reset and sessions');
  assert.ok(t.steps[0].body.startsWith('1. On the **Design** tab'));
  assert.ok(!t.steps.some((s) => s.body.includes('```')), 'step blocks are not shown as text');
  assert.ok(t.steps.every((s) => s.check), 'every build step here has a code check');
});

test('the clip gives the pointers, in order, with their captions', () => {
  const s = parseLesson(lesson).steps[2];
  assert.equal(s.targets[0].selector, "[data-ab='new-variable-name']");
  assert.equal(s.targets[0].action, 'type');
  assert.match(s.targets[0].caption, /variable remembers a number/);
  assert.ok(s.targets.some((x) => x.selector.includes("entry:onClicked")));
  assert.deepEqual(targetsOf([{ wait: 5 }, { press: 'Enter' }]), []);
});

test('steps tick as the lesson’s solutions are reached, and un-tick when undone', () => {
  const t = parseLesson(lesson);
  t.steps.shift(); // Try the finished app: nothing to tick
  assert.deepEqual(ticks(t, sheet('start')), [false, false, false, false, false]);
  // the lesson's sol-step-N regions are where step N starts (the step before it, done)
  assert.deepEqual(ticks(t, sheet('sol-step-2')).slice(0, 3), [true, false, false]);
  assert.deepEqual(ticks(t, sheet('sol-step-3')).slice(0, 3), [true, true, false]);
  assert.deepEqual(ticks(t, sheet('done')), [true, true, true, false, false]);
  assert.deepEqual(ticks(t, sheet('sol-reset')), [true, true, true, true, false]);
  assert.deepEqual(ticks(t, sheet('sol-sessions')), [true, true, true, true, true]);
});

test('rules match the lesson page: spaces ignored, event phrases on one line, lacks', () => {
  const text = 'object A (button) text ""\nevent: when A is clicked | do: Add 1 to variable N\nevent: always | do: Set T text to N';
  assert.ok(evalRules({ contains: ['object  A (button)'] }, text)[0].ok);
  assert.ok(evalRules({ event: [['when A is clicked', 'Add 1']] }, text)[0].ok);
  assert.ok(!evalRules({ event: [['when A is clicked', 'Set T text']] }, text)[0].ok, 'phrases split across events do not count');
  assert.ok(!evalRules({ lacks: ['Add 1'] }, text)[0].ok);
});

test('the clip\u2019s expect: lines on the running app become Try it ticks; named variables are found', () => {
  const t = parseLesson(lesson);
  assert.deepEqual(t.steps[3].tries, [{ widget: 'TotalText', contains: '15', after: 'SaveButton' }]);
  assert.deepEqual(t.steps[2].tries, [], 'an expect on the editor (the event sheet) is not a try');
  assert.deepEqual(triesOf([{ expect: { selector: '.view-run .stage', contains: 'Glasses: 0 of 8' } }]), [{ widget: '', contains: 'Glasses: 0 of 8', after: '' }]);
  assert.deepEqual(mentionedVariables('beside *Minutes*, its value goes up; Sessions too', ['Minutes', 'Sessions']), ['Minutes']);
});

test('Stuck? help: the clip captions as hints, and the step\u2019s video only from the tutorials site', () => {
  const t = parseLesson(lesson);
  assert.equal(t.steps[2].clip, 'step-3', 'the website numbers every section, Try the finished app included');
  assert.equal(t.steps[2].title, 'Build 2: count with a variable');
  assert.ok(hintsOf(t.steps[2]).length >= 2);
  assert.equal(clipUrls(t.steps[2], 'https://tutorials.learningwaypoints.com/code/apps/practice-tracker/source.json').video, 'https://tutorials.learningwaypoints.com/code/apps/practice-tracker/clips/step-3.mp4');
  assert.equal(clipUrls(t.steps[2], 'http://localhost:8000/lesson.md'), null);
  assert.equal(clipUrls(t.steps[4], 'https://tutorials.learningwaypoints.com/x/source.json'), null, 'a step with no clip has no video');
});

test('teacher notes, a second finished-app step and quizzes stay out', () => {
  const md = `---\ntitle: X\n---\n## Try it\n\n\`\`\`step\ntry: { playground: appbuilder, starter: "a.json#done" }\n\`\`\`\nlook\n\n## Build\n\n\`\`\`step\ntry: { playground: appbuilder, starter: "a.json#s", keep: b }\n\`\`\`\nDo it.\n\n## Quiz\n\n\`\`\`step\ncheck: { type: choice }\n\`\`\`\n\n\`\`\`teacher\nsecret: yes\n\`\`\`\n`;
  const t = parseLesson(md);
  assert.deepEqual(t.steps.map((s) => s.title), ['Try it', 'Build']);
  assert.equal(t.steps[0].play, 'a.json#done');
  assert.equal(t.steps[1].check, null);
  assert.throws(() => parseLesson('no frontmatter'));
  assert.throws(() => parseLesson('---\ntitle: X\n---\n## Q\n\n```step\ncheck: { type: choice }\n```\n'), /no App Builder build steps/);
});

test('the starter comes from beside the lesson, or from inside it', async () => {
  const t = parseLesson(lesson);
  const p = await loadStarter(t, 'http://localhost:8000/x/lesson.md', async (url) => { assert.equal(url, 'http://localhost:8000/x/app.json'); return app; });
  assert.equal(p.name, 'Practice tracker');
  const { files } = inlineFiles('```code a.json#s\n{"version":1}\n```\n');
  assert.equal(region(files['a.json'], 's'), '{"version":1}');
});

test('a lesson\u2019s source.json (the tutorials site) works like its lesson.md, starter included', async () => {
  const t = parseSource(JSON.stringify({ title: 'A practice tracker', files: { 'lesson.md': lesson, 'app.json': app } }));
  assert.equal(t.steps.length, 6);
  const p = await loadStarter(t, 'https://tutorials.learningwaypoints.com/x/source.json', async () => { throw new Error('should not fetch'); });
  assert.equal(p.name, 'Practice tracker');
  assert.throws(() => parseSource('{"files":{}}'), /isn.t a lesson/);
  assert.equal(parseSource(lesson).steps.length, 6);
});

test('tutorial links: ?lesson= names a lesson in the tutorials repo; ?tutorial= only from allowed sites', () => {
  const q = (s) => tutorialUrl(new URLSearchParams(s), 'https://tools.learningwaypoints.com/app-builder/');
  assert.equal(q('lesson=code/apps/practice-tracker').url, 'https://tutorials.learningwaypoints.com/code/apps/practice-tracker/source.json');
  assert.equal(q('tutorial=https://tutorials.learningwaypoints.com/code/apps/practice-tracker/').url, 'https://tutorials.learningwaypoints.com/code/apps/practice-tracker/source.json');
  assert.ok(q('tutorial=https://raw.githubusercontent.com/edu-matthew-pham/waypoints-tutorials/main/content/code/apps/practice-tracker/lesson.md').url);
  assert.ok(q('lesson=../../etc').error);
  assert.ok(q('tutorial=http://localhost:8000/l/lesson.md').url);
  assert.ok(q('tutorial=https://tutorials.learningwaypoints.com/a/lesson.md').url);
  assert.ok(q('tutorial=https://evil.example/lesson.md').error);
  assert.equal(q(''), null);
});
