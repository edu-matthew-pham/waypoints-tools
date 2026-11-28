// The Embed object (ROADMAP §13): a web page of the app's own (pasted or uploaded HTML) or a website.
// The sandbox itself is checked in a real browser: tests/browser/embed.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { embedSource, pageAssetName, EMBED_SITES } from '../src/core/assets.js';
import { setMediaUrl, clearMediaUrls, uploads, isPictureValue, isSoundValue } from '../src/core/media.js';
import { canShareByLink } from '../src/core/share-link.js';
import { sheetText } from '../src/core/sheet-text.js';
import { newProject, checkProject, addObject } from '../src/core/project.js';
import { LEVELS, resolve } from '../src/edu/features.js';
import { COMPONENTS } from '../src/core/components.js';

const withEmbed = (page, extra = {}) => {
  const p = checkProject(newProject('Sim'));
  Object.assign(p, extra);
  const o = addObject(p.screens[0], 'embed').obj;
  o.name = 'Sim'; o.instances[0].page = page;
  return p;
};

test('an Embed starts empty, sits in Media, and is offered at Level 4 only', () => {
  assert.equal(COMPONENTS.embed.category, 'Media');
  assert.equal(COMPONENTS.embed.extra.page, '');
  assert.ok(LEVELS[4].kinds.includes('embed'));
  for (const l of [1, 2, 3]) assert.ok(!LEVELS[l].kinds.includes('embed'), `not at level ${l}`);
  assert.ok(resolve({ level: 4 }).kinds.includes('embed'));
});

test('a page of the app\'s own shows from its loaded file; a missing or unknown one says why', () => {
  clearMediaUrls();
  const p = { pages: [{ name: 'pendulum', data: 'media:0000000e' }, { name: 'old', data: 'data:text/html;charset=utf-8;base64,PHA+aGk8L3A+' }] };
  assert.equal(embedSource(p, 'pendulum').kind, 'none', 'not loaded yet: nothing to show, no error');
  setMediaUrl('media:0000000e', 'blob:pend', 'text/html;charset=utf-8');
  assert.deepEqual(embedSource(p, 'pendulum'), { kind: 'page', src: 'blob:pend', name: 'pendulum' });
  assert.equal(embedSource(p, 'old').src.slice(0, 15), 'data:text/html;');
  assert.match(embedSource(p, 'nope').why, /no page called "nope"/);
  assert.equal(embedSource(p, '').kind, 'none');
  assert.ok(!isPictureValue('media:0000000e') && !isSoundValue('media:0000000e'), 'a page is neither a picture nor a sound');
  assert.equal(uploads(p).length, 2, 'pages are uploads: moved into the media store and saved like pictures');
});

test('links: the usual sites (and their subdomains) work; others need "Allow any website"; only https', () => {
  const p = {};
  assert.deepEqual(embedSource(p, 'https://phet.colorado.edu/sims/html/pendulum-lab/latest/pendulum-lab_en.html'),
    { kind: 'link', src: 'https://phet.colorado.edu/sims/html/pendulum-lab/latest/pendulum-lab_en.html', from: 'PhET' });
  assert.equal(embedSource(p, 'https://www.desmos.com/calculator').from, 'Desmos');
  assert.equal(embedSource(p, 'https://www.geogebra.org/classic').from, 'GeoGebra');
  assert.equal(embedSource(p, 'https://example.org/sim').kind, 'blocked');
  assert.equal(embedSource(p, 'https://phet.colorado.edu.evil.example/x').kind, 'blocked', 'a look-alike host is not PhET');
  assert.equal(embedSource(p, 'https://notphet.colorado.edu.example/').kind, 'blocked');
  assert.deepEqual(embedSource(p, 'https://www.example.org/sim', { allowAnyLink: true }), { kind: 'link', src: 'https://www.example.org/sim', from: 'example.org' });
  assert.equal(embedSource(p, 'http://phet.colorado.edu/', { allowAnyLink: true }).kind, 'none', 'http is refused');
  assert.equal(embedSource(p, 'javascript:alert(1)', { allowAnyLink: true }).kind, 'none');
  assert.equal(embedSource(p, 'data:text/html,<p>x', { allowAnyLink: true }).kind, 'none');
  assert.ok(EMBED_SITES.length >= 4);
});

test('page names are tidy and never clash', () => {
  const p = { pages: [{ name: 'pendulum_lab', data: '' }] };
  assert.equal(pageAssetName(p, 'Pendulum Lab.html'), 'pendulum_lab_2');
  assert.equal(pageAssetName(p, '3d.html'), 'w3d');
  assert.equal(pageAssetName({}, ''), 'page');
});

test('sheet text names the page; apps without an Embed read as before', () => {
  assert.match(sheetText(withEmbed('pendulum')), /object Sim \(embed\) text "" page "pendulum"/);
  const plain = checkProject(newProject('x'));
  assert.ok(!/embed|page/.test(sheetText(plain)));
  assert.ok(!('pages' in plain), 'a project gets no pages list until it has a page');
});

test('share by link: not for apps with their own pages, or linking a site off the usual list', () => {
  assert.ok(canShareByLink(withEmbed('https://phet.colorado.edu/sims/html/x/latest/x_en.html')));
  assert.ok(!canShareByLink(withEmbed('sim', { pages: [{ name: 'sim', data: 'media:00000001' }] })));
  assert.ok(!canShareByLink(withEmbed('https://example.org/', { allowAnyEmbed: true })));
  assert.ok(canShareByLink(checkProject(newProject('x'))));
});

// ---------- the bridge (phase 2) ----------
import { messageNames, badNames, readMessage, plainValue, embedPrompt } from '../src/core/embed-bridge.js';
import { Runtime } from '../src/core/runtime.js';
import { newEvent, scopeFor, exprScopeFor } from '../src/core/project.js';
import { check } from '../src/core/expr.js';
import { defaultParams } from '../src/core/catalog.js';

test('message names: identifiers only, no repeats, none of the Embed\'s own property names', () => {
  assert.deepEqual(messageNames('period, angle;  period\nlength'), ['period', 'angle', 'length']);
  assert.deepEqual(messageNames('x, text, page, 2nd, a-b, ok_1'), ['ok_1']);
  assert.deepEqual(badNames('x, 2nd, fine'), ['x', '2nd']);
  assert.deepEqual(messageNames(undefined), []);
});

test('a message from a page is data: a listed name and one plain value, or nothing', () => {
  assert.deepEqual(readMessage({ name: 'period', value: 1.42 }, 'period'), { name: 'period', value: 1.42 });
  assert.deepEqual(readMessage({ name: 'done', value: true }, 'done'), { name: 'done', value: true });
  assert.equal(readMessage({ name: 'angle', value: 1 }, 'period'), null, 'not a name the Embed lists');
  assert.equal(readMessage({ name: 'period', value: { a: 1 } }, 'period'), null, 'not one plain value');
  assert.equal(readMessage({ name: 'period', value: [1] }, 'period'), null);
  assert.equal(readMessage({ name: 'period', value: NaN }, 'period'), null);
  assert.equal(readMessage({ name: 'period', value: 'x'.repeat(1001) }, 'period'), null, 'text is capped');
  assert.equal(readMessage({ name: 'period' }, 'period'), null);
  assert.equal(readMessage('period', 'period'), null);
  assert.equal(readMessage([{ name: 'period', value: 1 }], 'period'), null);
  assert.equal(plainValue('ok'), 'ok');
});

function bridgeApp() {
  const p = newProject('Bridge'), s = p.screens[0];
  const sim = addObject(s, 'embed').obj; sim.name = 'Sim';
  Object.assign(sim.instances[0], { page: 'pendulum', sends: 'period, swings', listens: 'gravity' });
  addObject(s, 'text').obj.name = 'Out';
  addObject(s, 'button').obj.name = 'Moon';
  s.events.push(
    newEvent({ conds: [{ type: 'onEmbedSends', target: 'Sim', message: 'period' }], actions: [{ type: 'setText', target: 'Out', value: '"Period: " & Sim.period' }] }),
    newEvent({ conds: [{ type: 'onClicked', target: 'Moon' }], actions: [{ type: 'sendToEmbed', target: 'Sim', message: 'gravity', value: '1.6' }] }),
  );
  return p;
}

test('the page sends: "Sim sends period" runs, and Sim.period is its latest value', () => {
  const rt = new Runtime(bridgeApp());
  rt.start();
  const sim = rt.instancesOf('Sim')[0], out = rt.instancesOf('Out')[0];
  const before = out.props.text;
  rt.embedMessage(sim.id, 'swings', 3);
  assert.equal(out.props.text, before, 'another name doesn\'t run it');
  rt.embedMessage(sim.id, 'period', 2.5);
  assert.equal(out.props.text, 'Period: 2.5');
  assert.equal(rt.evalExpr('Sim.swings', { picked: new Map(), loop: [] }), 3);
  assert.throws(() => new Runtime(bridgeApp()).evalExpr('Sim.period', { picked: new Map(), loop: [] }), /no object|hasn't sent period yet/);
  const rt2 = new Runtime(bridgeApp()); rt2.start();
  assert.throws(() => rt2.evalExpr('Sim.period', { picked: new Map(), loop: [] }), /Sim hasn't sent period yet/);
  assert.equal(rt.errors.length, 0);
});

test('the app sends: "Send gravity = 1.6 to Sim" hands one plain value to the renderer; a list is an error', () => {
  const sent = [];
  const p = bridgeApp();
  p.screens[0].events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [] }));
  const rt = new Runtime(p, { hooks: { sendToEmbed: (...a) => sent.push(a) } });
  rt.start();
  rt.click(rt.instancesOf('Moon')[0].id);
  assert.deepEqual(sent, [[rt.instancesOf('Sim')[0].id, 'gravity', 1.6]]);
  p.variables.push({ name: 'L', value: [1, 2] });
  p.screens[0].events[1].actions[0].value = 'L';
  const rt3 = new Runtime(p, { hooks: { sendToEmbed: () => assert.fail('a list must not be sent') } });
  rt3.start();
  rt3.click(rt3.instancesOf('Moon')[0].id);
  assert.match(rt3.errors[0].message, /Send one value/);
});

test('the event sheet offers the names the Embed lists; expressions know Sim.period', () => {
  const p = bridgeApp(), s = p.screens[0];
  const sc = scopeFor(p, s);
  const sim = sc.objects.find((o) => o.name === 'Sim');
  assert.deepEqual([sim.sends, sim.listens], [['period', 'swings'], ['gravity']]);
  assert.equal(defaultParams(CONDITIONS_onEmbed(), sc).message, 'period');
  const es = exprScopeFor(p, s);
  assert.equal(check('Sim.period * 2', es), null);
  assert.match(String(check('Sim.angle', es)), /no property "angle"/);
  assert.match(sheetText(p), /object Sim \(embed\) text "" page "pendulum" sends period, swings listens gravity/);
  assert.match(sheetText(p), /when Sim sends period/);
  assert.match(sheetText(p), /Send gravity = 1.6 to Sim/);
});
import { CONDITIONS } from '../src/core/catalog.js';
const CONDITIONS_onEmbed = () => CONDITIONS.onEmbedSends;

test('the prompt asks for one file and names the messages both ways', () => {
  const t = embedPrompt({ what: 'a pendulum', sends: 'period', listens: 'gravity' });
  assert.match(t, /Make a pendulum as ONE self-contained HTML file/);
  assert.match(t, /parent\.postMessage\(\{ name: 'period'/);
  assert.match(t, /name 'gravity'/);
  assert.ok(!/postMessage/.test(embedPrompt({})), 'no names: no messages');
});
