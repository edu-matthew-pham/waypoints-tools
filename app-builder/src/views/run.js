// Run tab: the app at full size, with a read-only event sheet that flashes as rows run.
import { h } from '../ui/dom.js';
import { Runner } from '../run-engine.js';
import { scopeFor, exprScopeFor } from '../core/project.js';
import { S } from '../state.js';

export function initRun(root) {
  const stageHost = h('div', { class: 'stage-host' });
  const problems = h('div', { class: 'problems' });
  const sheet = document.createElement('event-sheet');
  const restartBtn = h('button', { class: 'btn', 'data-ab': 'restart' }, '↻ Restart');
  root.append(
    h('div', { class: 'stage-col' },
      h('div', { class: 'run-bar' }, restartBtn, h('span', { class: 'muted' }, 'Starts on the screen you were editing. Click things like a user would. Values now show beside each variable on the left.'), h('span', { class: 'run-screen', 'data-now-screen': '' })),
      stageHost),
    h('div', { class: 'run-side' }, problems, h('h3', {}, 'Events on this screen'), sheet));

  const runner = new Runner(stageHost, {
    problems,
    flash: (id) => sheet.flash(id),
    onScreen: (scr, project) => sheet.setData({ events: scr.events, scope: scopeFor(project, scr), exprScope: exprScopeFor(project, scr), mode: 'readonly' }),
  });
  runner.stage.fitTo(root.querySelector('.stage-col'), () => innerHeight - 170);
  const start = () => { runner.start(S.project, S.screenId); runner.focus(); }; // so keys work straight away
  restartBtn.addEventListener('click', start);
  return {
    activate: () => { document.documentElement.classList.add('ab-runtab'); start(); },
    deactivate: () => { document.documentElement.classList.remove('ab-runtab'); runner.stop(); },
  };
}
