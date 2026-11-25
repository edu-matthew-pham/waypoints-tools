// Run tab: the app at full size, with a read-only event sheet that flashes as rows run.
import { h } from '../ui/dom.js';
import { Runner } from '../run-engine.js';
import { scopeFor, exprScopeFor } from '../core/project.js';
import { sharedEventsFor } from '../core/shared.js';
import { S } from '../state.js';

export function initRun(root) {
  const stageHost = h('div', { class: 'stage-host' });
  const problems = h('div', { class: 'problems' });
  const sheet = document.createElement('event-sheet');
  const shared = document.createElement('event-sheet'); // the All screens events that apply here
  const sharedHead = h('h3', { hidden: true }, 'Events on all screens');
  const restartBtn = h('button', { class: 'btn', 'data-ab': 'restart' }, '↻ Restart');
  const forgetBtn = h('button', { class: 'btn', 'data-ab': 'forget-saved', title: 'Forget what the app remembered between visits, and start again as if for the first time' }, 'Forget saved data');
  root.append(
    h('div', { class: 'stage-col' },
      h('div', { class: 'run-bar' }, restartBtn, forgetBtn, h('span', { class: 'muted' }, 'Starts on the screen you were editing. Click things like a user would. Values now show beside each variable on the left.'), h('span', { class: 'run-screen', 'data-now-screen': '' })),
      stageHost),
    h('div', { class: 'run-side' }, problems, sharedHead, shared, h('h3', {}, 'Events on this screen'), sheet));

  const runner = new Runner(stageHost, {
    problems,
    flash: (id) => { sheet.flash(id); shared.flash(id); },
    onScreen: (scr, project) => {
      const scope = scopeFor(project, scr), exprScope = exprScopeFor(project, scr);
      sheet.setData({ events: scr.events, scope, exprScope, mode: 'readonly' });
      const evs = sharedEventsFor(project, scr);
      sharedHead.hidden = shared.hidden = !evs.length;
      shared.setData({ events: evs, scope, exprScope, mode: 'readonly' });
    },
  });
  runner.stage.fitTo(root.querySelector('.stage-col'), () => innerHeight - 170);
  const start = () => { runner.start(S.project, S.screenId); runner.focus(); }; // so keys work straight away
  restartBtn.addEventListener('click', start);
  forgetBtn.addEventListener('click', () => { runner.stop(); runner.forget(S.project); start(); });
  return {
    activate: () => { document.documentElement.classList.add('ab-runtab'); forgetBtn.hidden = !S.project.variables.some((v) => v.remember); start(); },
    deactivate: () => { document.documentElement.classList.remove('ab-runtab'); runner.stop(); },
  };
}
