// The Drive dialog: sign in with Microsoft or Google, save this app to your own drive, open one saved there.
// The work is done by src/drive/ (sign-in, files) and the app shell (what a save holds, opening it); this only shows it.
import { h } from './dom.js';
import { modal } from './sheet-dialogs.js';

const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const shown = (name) => name.replace(/\.app\.(json|zip)$/i, '');

// drives: { microsoft?, google? } (src/drive); save(drive) and open(drive, item) are the shell's; current: the drive
// file this app is saved to, if any ({ drive, id, name })
export function driveDialog({ drives, save, open, current, notify }) {
  const signedIn = Object.values(drives).find((d) => d.signedIn());
  const body = h('div', { class: 'drive' });
  const { close } = modal(signedIn ? `Your ${signedIn.name}` : 'Save to your drive', body,
    [h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')]);
  const again = () => { close(); driveDialog({ drives, save, open, current, notify }); };
  const problem = (e, d) => {
    if (e?.needFiles) {
      body.replaceChildren(
        h('p', {}, `Your account didn’t allow App Builder its own app folder. Sign in once more to let it use an “Apps/App Builder” folder in your ${d.name}: it only uses that folder.`),
        h('button', { class: 'btn primary', type: 'button', 'data-ab': 'drive-allow', onclick: () => d.signIn({ files: true }).then(again, (er) => problem(er, d)) }, 'Sign in again'));
      return;
    }
    if (e?.code === 'signin') { d.signOut(); again(); return; }
    const admin = /consent|admin|AADSTS65001|AADSTS90094|access_denied|admin_policy_enforced|org_internal/i.test(`${e?.code} ${e?.message}`);
    body.prepend(h('p', { class: 'drive-err', role: 'alert' }, (e?.message || 'Something went wrong.') +
      (admin ? ' Your school may need to allow App Builder first: ask your teacher or IT team. Meanwhile, Save to a file still works.' : '')));
  };

  if (!signedIn) {
    body.append(
      h('p', {}, 'Sign in with your school account to save your apps to your own drive and open them on any computer. Your tutorial step goes with them.'),
      h('div', { class: 'drive-signin' }, Object.values(drives).map((d) => h('button', { class: 'btn', type: 'button', 'data-ab': 'drive-signin:' + d.id,
        onclick: (ev) => { const b = ev.currentTarget; b.disabled = true; d.signIn().then(again, (e) => { b.disabled = false; if (e?.code !== 'closed') problem(e, d); }); } },
      `Sign in with ${d.company}`))),
      h('p', { class: 'muted small' }, `Your apps go in an “App Builder” folder in your own ${Object.values(drives).map((d) => d.name).join(' or ')}. App Builder has no server and keeps nothing itself. Your school may need to allow it first. On a shared computer, closing the tab signs you out.`));
    return;
  }

  const d = signedIn, who = d.account();
  const list = h('div', { class: 'drive-list', 'data-ab': 'drive-list' }, h('p', { class: 'muted' }, 'Finding your apps…'));
  body.append(
    h('p', { class: 'drive-who' }, h('span', {}, `Signed in${who?.name || who?.email ? ' as ' : ''}`, h('strong', {}, who?.name || who?.email || '')),
      h('button', { class: 'btn', type: 'button', 'data-ab': 'drive-signout', onclick: () => { d.signOut(); again(); } }, 'Sign out')),
    h('button', { class: 'btn primary', type: 'button', 'data-ab': 'drive-save', onclick: async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { await save(d); close(); } catch (e) { b.disabled = false; problem(e, d); }
    } }, current?.drive === d.id ? `Save to ${shown(current.name)}` : `Save this app to ${d.name}`),
    h('h3', { class: 'drive-h' }, `Your apps in ${d.name}`),
    list);
  d.list().then((items) => {
    list.replaceChildren(...(items.length ? items.map((it) => h('div', { class: 'drive-item' + (current?.id === it.id ? ' on' : '') },
      h('span', { class: 'drive-name' }, shown(it.name)), h('span', { class: 'muted small' }, ago(it.modified)),
      h('button', { class: 'btn', type: 'button', 'data-ab': 'drive-open', onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        try { await open(d, it); close(); } catch (e) { b.disabled = false; problem(e, d); }
      } }, 'Open'))) : [h('p', { class: 'muted' }, 'Nothing saved here yet.')]));
  }, (e) => { list.replaceChildren(); problem(e, d); });
}
