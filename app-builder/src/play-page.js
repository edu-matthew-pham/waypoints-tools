// The play-only page for a shared link (index.html#play=…): just the working app, full size, no editor. A small bar
// says what it is and offers "Open a copy in App Builder" (the viewer's copy; the original stays the maker's).
// Uses only the Player (core plus the stage), like any page could.
import { h } from './ui/dom.js';
import { Player, localStore, projectMedia } from './player.js';
import { checkProject } from './core/project.js';
import { decodeApp, linkKey } from './core/share-link.js';

export async function startPlay(code, { soundBase } = {}) {
  document.title = 'App Builder: shared app';
  const root = document.getElementById('app');
  root.className = 'play-page';
  let project;
  try { project = checkProject(await decodeApp(code)); } catch (e) {
    root.replaceChildren(h('div', { class: 'play-error' }, h('h1', {}, 'This link doesn’t open an app'),
      h('p', {}, 'It may have been cut short when it was copied. Ask for the link again.'), h('p', { class: 'muted' }, String(e.message || e))));
    return;
  }
  document.title = `${project.name || 'App'} (made with App Builder)`;
  const host = h('div', { class: 'stage-host' }), area = h('div', { class: 'play-stage' }, host);
  const openCopy = location.pathname + location.search + '#open=' + code;
  root.replaceChildren(
    h('div', { class: 'top play-bar' },
      h('strong', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '⚡'), project.name || 'App'),
      h('span', { class: 'play-made' }, 'Made with App Builder'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', 'data-ab': 'play-restart', onclick: () => start() }, '↻ Restart'),
      h('a', { class: 'btn primary', href: openCopy, target: '_blank', rel: 'noopener', 'data-ab': 'open-copy', title: 'Open your own copy to look inside or change it. The original stays as it is.' }, 'Open a copy in App Builder')),
    area);
  const player = new Player(host, { store: localStore('appbuilder.play.' + linkKey(code)), media: projectMedia(() => project, { soundBase }) });
  player.stage.fitTo(area, () => innerHeight - 100);
  const start = () => { player.start(project); player.focus(); };
  start();
}
