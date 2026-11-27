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
