// Saving to, and opening from, the student's own drive: the dialog behind Save ▾ › Save to OneDrive / Google Drive and
// Open ▾ › Open from OneDrive / Google Drive. Signs in first if needed. The work is done by src/drive/ (sign-in, files)
// and the app shell (what a save holds, opening it); this only shows it.
//   mode 'save': save as a new app (a name), or save over one already there (asks first)
//   mode 'open': open one; either way each app can be deleted (to the drive's bin, asks first)
import { h } from './dom.js';
import { modal } from './sheet-dialogs.js';

const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const shown = (name) => name.replace(/\.app\.(json|zip)$/i, '');

// d: one drive (src/drive). save(d, { id, name }) / open(d, item) / removed(d, item): the shell's.
// current: the drive file this app is saved to, if any ({ drive, id, name }); name: the app's name, for a new save
export function driveDialog(opts) {
  const { d, mode, save, open, removed, current, notify, name } = opts;
  const here = current?.drive === d.id ? current : null;
  const body = h('div', { class: 'drive' });
  const { close } = modal(mode === 'save' ? `Save to ${d.name}` : `Open from ${d.name}`, body,
    [h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')]);
  const again = () => { close(); driveDialog(opts); };
  const busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (e) { b.disabled = false; problem(e); } };
  function problem(e) {
    if (e?.needFiles) {
      body.replaceChildren(
        h('p', {}, `Your account didn’t allow App Builder its own app folder. Sign in once more to let it use an “Apps/App Builder” folder in your ${d.name}: it only uses that folder.`),
        h('button', { class: 'btn primary', type: 'button', 'data-ab': 'drive-allow', onclick: (ev) => busy(ev.currentTarget, () => d.signIn({ files: true }).then(again)) }, 'Sign in again'));
      return;
    }
    if (e?.code === 'signin') { d.signOut(); again(); return; }
    if (e?.code === 'closed') return; // the student closed the sign-in window
    const admin = /consent|admin|AADSTS65001|AADSTS90094|access_denied|admin_policy_enforced|org_internal/i.test(`${e?.code} ${e?.message}`);
    body.querySelector('.drive-err')?.remove();
    body.prepend(h('p', { class: 'drive-err', role: 'alert' }, (e?.message || 'Something went wrong.') +
      (admin ? ' Your school may need to allow App Builder first: ask your teacher or IT team. Meanwhile, Save to this computer still works.' : '')));
  }

  if (!d.signedIn()) {
    body.append(
      h('p', {}, `Sign in with your ${d.company} account to ${mode === 'save' ? 'save this app to' : 'open apps from'} your own ${d.name}, and get to them from any computer. Your tutorial step goes with them.`),
      h('div', { class: 'drive-signin' }, h('button', { class: 'btn primary', type: 'button', 'data-ab': 'drive-signin:' + d.id,
        onclick: (ev) => busy(ev.currentTarget, () => d.signIn().then(again)) }, `Sign in with ${d.company}`)),
      h('p', { class: 'muted small' }, `Your apps go in an “App Builder” folder in your own ${d.name}. App Builder has no server and keeps nothing itself. Your school may need to allow it first. On a shared computer, closing the tab signs you out.`));
    return;
  }

  const who = d.account();
  body.append(h('p', { class: 'drive-who muted small' }, `Signed in${who?.name || who?.email ? ' as ' + (who.name || who.email) : ''}. `,
    h('button', { class: 'linkish', type: 'button', 'data-ab': 'drive-signout', onclick: () => { d.signOut(); close(); notify?.(`Signed out of ${d.name}.`); } }, 'Sign out')));

  if (mode === 'save') {
    if (here) body.append(h('button', { class: 'btn primary drive-same', type: 'button', 'data-ab': 'drive-save-same',
      onclick: (ev) => busy(ev.currentTarget, async () => { await save(d, { id: here.id }); close(); }) }, `Save to “${shown(here.name)}”`));
    const input = h('input', { class: 'ctl', 'data-ab': 'drive-save-name', value: name || 'My app', 'aria-label': 'Name for the new app' });
    const go = (b) => busy(b, async () => { await save(d, { name: input.value.trim() || 'My app' }); close(); });
    const newBtn = h('button', { class: 'btn' + (here ? '' : ' primary'), type: 'button', 'data-ab': 'drive-save-new', onclick: (ev) => go(ev.currentTarget) }, 'Save');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(newBtn); } });
    body.append(h('h3', { class: 'drive-h' }, here ? 'Or save as a new app' : 'Save as a new app'), h('div', { class: 'drive-new' }, input, newBtn));
  }
  const list = h('div', { class: 'drive-list', 'data-ab': 'drive-list' }, h('p', { class: 'muted' }, 'Finding your apps…'));
  body.append(h('h3', { class: 'drive-h' }, mode === 'save' ? 'Or save over one of your apps' : `Your apps in ${d.name}`), list);

  let items = [];
  const empty = () => h('p', { class: 'muted' }, 'Nothing saved here yet.');
  function row(it) {
    const el = h('div', { class: 'drive-item' + (here?.id === it.id ? ' on' : '') });
    const isThis = here?.id === it.id;
    const plain = () => {
      el.classList.remove('asking');
      el.replaceChildren(
        h('span', { class: 'drive-name' }, shown(it.name), isThis ? h('span', { class: 'muted small' }, ' (this app)') : null),
        h('span', { class: 'muted small' }, ago(it.modified)),
        mode === 'open'
          ? h('button', { class: 'btn', type: 'button', 'data-ab': 'drive-open', onclick: (ev) => busy(ev.currentTarget, async () => { await open(d, it); close(); }) }, 'Open')
          : h('button', { class: 'btn', type: 'button', 'data-ab': 'drive-save-over', onclick: (ev) => (isThis ? busy(ev.currentTarget, async () => { await save(d, { id: it.id }); close(); }) : askOver()) }, isThis ? 'Save' : 'Save over'),
        h('button', { class: 'btn icon-only drive-del', type: 'button', 'data-ab': 'drive-delete', title: `Delete ${shown(it.name)}`, 'aria-label': `Delete ${shown(it.name)}`, onclick: askDelete }, '\u{1F5D1}'));
    };
    // both questions are asked in the row itself
    const ask = (text, label, ab, fn, danger) => {
      el.classList.add('asking');
      el.replaceChildren(h('span', { class: 'drive-ask', role: 'alert' }, text),
        h('button', { class: 'btn', type: 'button', 'data-ab': ab + '-cancel', onclick: plain }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', 'data-ab': ab + '-confirm', onclick: (ev) => busy(ev.currentTarget, fn) }, label));
    };
    const askOver = () => ask(`Replace “${shown(it.name)}” with this app? What was in it is replaced (your ${d.name} may keep older versions).`,
      'Save over', 'drive-save-over', async () => { await save(d, { id: it.id, name: it.name }); close(); });
    const askDelete = () => ask(`Delete “${shown(it.name)}”? It goes to your ${d.bin}, where you can restore it for a while.${isThis ? ' It’s the app you have open: that stays open, and Save then asks where.' : ''}`,
      'Delete', 'drive-delete', async () => {
        await d.remove(it.id);
        items = items.filter((x) => x !== it); el.remove();
        if (!items.length) list.replaceChildren(empty());
        removed?.(d, it);
        notify?.(`Moved “${shown(it.name)}” to your ${d.bin}.`);
      }, true);
    plain();
    return el;
  }
  d.list().then((found) => {
    items = found;
    list.replaceChildren(...(items.length ? items.map(row) : [empty()]));
  }, (e) => { list.replaceChildren(); problem(e); });
}
