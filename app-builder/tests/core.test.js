import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluate, check, ExprError } from '../src/core/expr.js';
import { Runtime } from '../src/core/runtime.js';
import { validateSheet } from '../src/core/catalog.js';
import { musicTracker, dailyChores } from '../src/samples.js';

const run = (src, vars = {}, props = {}) => evaluate(parse(src), {
  random: () => 0.5,
  getVar: (n) => { if (!(n in vars)) throw new ExprError('no ' + n); return vars[n]; },
  getProp: (o, p) => props[o + '.' + p],
});
const text = (rt, name, i = 0) => rt.instancesOf(name)[i].props.text;
const clickBy = (rt, name, i = 0) => rt.click(rt.instancesOf(name)[i].id);

test('expressions: precedence, text joining, functions', () => {
  assert.equal(run('1 + 2 * 3'), 7);
  assert.equal(run('(1 + 2) * 3'), 9);
  assert.equal(run('-4 + 10'), 6);
  assert.equal(run('"Total: " & n & " min"', { n: 30 }), 'Total: 30 min');
  assert.equal(run('"a" & 1 + 2'), 'a3');          // + binds tighter than &
  assert.equal(run('int("12") + 1'), 13);
  assert.equal(run('int("abc")'), 0);
  assert.equal(run('upper("hi") & len("four")'), 'HI4');
  assert.equal(run('random(6)'), 3);
  assert.equal(run('Card.hearts + 1', {}, { 'Card.hearts': 2 }), 3);
  assert.equal(run('“hello”'), 'hello');   // tablet smart quotes
});

test('expressions: kind errors for text maths and bad input', () => {
  assert.throws(() => run('"5" + 1'), /int\(/);
  assert.throws(() => run('1 / 0'), /divide by zero/);
  assert.throws(() => parse('1 +'), /stops too early/);
  assert.throws(() => parse('"open'), /closing quote/);
  assert.throws(() => parse('1 $ 2'), /Unexpected/);
  assert.throws(() => parse(''), /Nothing to work out/);
});

test('expressions: static check finds unknown names', () => {
  const scope = { vars: new Set(['minutes']), objects: new Map([['Card', new Set(['text', 'hearts'])]]) };
  assert.equal(check('minutes + 1', scope), null);
  assert.equal(check('Card.hearts', scope), null);
  assert.match(check('minutse', scope), /no variable called "minutse"/);
  assert.match(check('Card.hart', scope), /no property "hart"/);
  assert.match(check('Cart.hearts', scope), /no object called "Cart"/);
  assert.match(check('frob(1)', scope), /no function/);
});

test('practice tracker: start trigger, add, sub-event + Else', () => {
  const rt = new Runtime(musicTracker());
  rt.start();
  assert.equal(text(rt, 'Total'), 'Total: 0 min');       // On start of screen ran
  clickBy(rt, 'AddBtn');
  assert.equal(rt.getVar('minutes'), 10);
  assert.equal(text(rt, 'Total'), 'Total: 10 min');
  assert.equal(text(rt, 'Msg'), '20 minutes to go');      // Else branch
  clickBy(rt, 'AddBtn'); clickBy(rt, 'AddBtn');
  assert.equal(rt.getVar('minutes'), 30);
  assert.equal(text(rt, 'Msg'), 'Goal reached!');         // sub-event branch
  assert.equal(rt.errors.length, 0);
});

test('screens: globals survive, copies reset, start trigger refreshes', () => {
  const rt = new Runtime(musicTracker());
  rt.start();
  clickBy(rt, 'AddBtn'); clickBy(rt, 'AddBtn');
  clickBy(rt, 'SummaryBtn');
  assert.equal(rt.screenId, 'summary');
  assert.equal(text(rt, 'Result'), 'You practised 20 minutes');
  clickBy(rt, 'BackBtn');
  assert.equal(rt.screenId, 'home');
  assert.equal(text(rt, 'Total'), 'Total: 20 min');       // refreshed by On start
  assert.equal(text(rt, 'Msg'), '');                       // a fresh screen: instance text reset
});

test('picking: clicking one copy changes only that copy', () => {
  const rt = new Runtime(dailyChores());
  rt.start();
  rt.tick();
  assert.equal(text(rt, 'Status'), 'Done: 0 of 3');
  clickBy(rt, 'Chore', 1);
  assert.equal(text(rt, 'Chore', 0), '☐ Make bed');
  assert.equal(text(rt, 'Chore', 1), '☑ Feed the cat');
  assert.equal(text(rt, 'Chore', 2), '☐ Homework');
  rt.tick();
  assert.equal(text(rt, 'Status'), 'Done: 1 of 3');
});

test('Else toggles: second click undoes the first', () => {
  const rt = new Runtime(dailyChores());
  rt.start();
  clickBy(rt, 'Chore', 0); clickBy(rt, 'Chore', 2);
  assert.equal(rt.getVar('doneCount'), 2);
  clickBy(rt, 'Chore', 0);
  assert.equal(rt.getVar('doneCount'), 1);
  assert.equal(text(rt, 'Chore', 0), '☐ Make bed');
  assert.equal(rt.instancesOf('Chore')[0].vars.done, 0);
  assert.equal(rt.instancesOf('Chore')[2].vars.done, 1);
});

test('every tick: only non-trigger events run on tick, triggers do not', () => {
  const ran = [];
  const rt = new Runtime(dailyChores(), { hooks: { onEventRan: (id) => ran.push(id) } });
  rt.start();
  ran.length = 0;
  rt.tick();
  assert.deepEqual(ran, ['e_status']);
  assert.equal(rt.needsTick, true);
  assert.equal(new Runtime(musicTracker()).needsTick, false);
});

test('known misconception: an action left on the parent ignores the sub-event condition', () => {
  const p = musicTracker();
  p.variables = [{ name: 'count', value: 0 }, { name: 'goal', value: 10 }];
  p.screens[0].events = [{
    id: 'cap', else: false,
    conds: [{ type: 'onClicked', target: 'AddBtn' }],
    actions: [{ type: 'addTo', value: '1', var: 'count' }],            // the slip: not capped
    children: [{ id: 'cap_sub', else: false, conds: [{ type: 'compareVar', var: 'count', op: '<', value: 'goal' }], actions: [], children: [] }],
  }];
  const rt = new Runtime(p);
  rt.start();
  for (let i = 0; i < 12; i++) clickBy(rt, 'AddBtn');
  assert.equal(rt.getVar('count'), 12);   // goes past the goal of 10
});

test('errors are reported kindly and do not stop the sheet', () => {
  const p = musicTracker();
  p.screens[0].events[1].actions.unshift({ type: 'addTo', value: 'minutse', var: 'minutes' });
  const rt = new Runtime(p);
  rt.start();
  clickBy(rt, 'AddBtn');
  assert.equal(rt.errors.length, 1);
  assert.match(rt.errors[0].message, /no variable called "minutse"/);
  assert.equal(rt.getVar('minutes'), 10);  // later actions still ran
  clickBy(rt, 'AddBtn');
  assert.equal(rt.errors[0].count, 2);     // deduplicated, counted
});

test('text input: typing fires the changed trigger and int() makes it a number', () => {
  const p = musicTracker();
  p.screens[0].objects.push({ name: 'Box', kind: 'input', instanceVars: [], instances: [{ id: 'i_box', x: 0, y: 0, w: 100, h: 40, text: '', visible: true, vars: {} }] });
  p.screens[0].events.push({
    id: 'e_typed', else: false, conds: [{ type: 'onChanged', target: 'Box' }],
    actions: [{ type: 'setVar', var: 'minutes', value: 'int(Box.text) * 2' }], children: [],
  });
  const rt = new Runtime(p);
  rt.start();
  rt.typeInto('i_box', '21');
  assert.equal(rt.getVar('minutes'), 42);
});

test('validation: trigger placement and Else rules', () => {
  const e = (id, conds, extra = {}) => ({ id, else: false, conds, actions: [], children: [], ...extra });
  assert.deepEqual(validateSheet([e('a', [{ type: 'onStart' }]), e('b', [], { else: true })]).map((x) => x.id), ['b']);
  assert.equal(validateSheet([e('a', [{ type: 'everyTick' }]), e('b', [], { else: true })]).length, 0);
  assert.match(validateSheet([e('a', [{ type: 'everyTick' }, { type: 'onStart' }])])[0].message, /first condition/);
  assert.match(validateSheet([e('a', [], { children: [e('c', [{ type: 'onStart' }])] })])[0].message, /sub-events/);
  assert.equal(validateSheet(musicTracker().screens[0].events).length, 0);
});

test('screen change loops are stopped', () => {
  const p = musicTracker();
  p.screens[0].events = [{ id: 'x', else: false, conds: [{ type: 'onStart' }], actions: [{ type: 'goToScreen', screen: 'summary' }], children: [] }];
  p.screens[1].events = [{ id: 'y', else: false, conds: [{ type: 'onStart' }], actions: [{ type: 'goToScreen', screen: 'home' }], children: [] }];
  const rt = new Runtime(p);
  rt.start();
  assert.ok(rt.errors.some((e) => /Too many screen changes/.test(e.message)));
});

test('if(test, yes, no): picks a value; only the chosen side is worked out', () => {
  const env = { getVar: (n) => ({ minutes: 40, goal: 30, name: 'Sam' })[n], getProp: () => 0, random: () => 0 };
  const run = (src) => evaluate(parse(src), env);
  assert.equal(run('if(minutes ≥ goal, "Goal reached!", "Keep going")'), 'Goal reached!');
  assert.equal(run('if(minutes < goal, "Goal reached!", "Keep going")'), 'Keep going');
  assert.equal(run('if(minutes >= 30, 1, 0)'), 1);            // typed symbols work too
  assert.equal(run('if(name = "Sam", "Hi " & name, "Hello")'), 'Hi Sam');
  assert.equal(run('"Result: " & if(minutes != goal, "different", "same")'), 'Result: different');
  assert.equal(run('if(minutes > 0, 5, 1 / 0)'), 5);          // the unused side is never run
});

test('if(): friendly errors', () => {
  const scope = { vars: new Set(['minutes', 'goal']), objects: new Map() };
  assert.match(check('if(minutes, 1, 2)', scope), /needs a test/);
  assert.match(check('if(minutes ≥ goal, 1)', scope), /three parts/);
  assert.match(check('if(minutes ≥ goal)', scope), /true/);
  assert.match(check('if(minutes ≥ goal, "a", 2)', scope), /same kind/);
  assert.match(check('if(nope ≥ goal, 1, 2)', scope), /no variable called "nope"/);
  assert.match(check('minutes ≥ goal', scope), /only work inside if/);
  assert.equal(check('if(minutes ≥ goal, "a", "b")', scope), null);
});
