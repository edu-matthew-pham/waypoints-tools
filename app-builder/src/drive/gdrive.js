// Google Drive (Google Workspace for Education, and personal Google accounts), all in the browser: Google Identity
// Services' token client (Google's own sign-in window, loaded only when a student chooses Google) and the Drive API.
// Permission: drive.file, so App Builder only ever sees files it made itself, kept in an "App Builder" folder.
import { SignInError, session } from './oauth.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
const FOLDER = 'App Builder', FOLDER_TYPE = 'application/vnd.google-apps.folder';

// Google's sign-in library, loaded from Google the first time (nothing is loaded for students who never choose Google)
let gis = null;
export function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return (gis ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { gis = null; reject(new SignInError('load', 'Google sign-in couldn’t be loaded. Check the internet connection.')); };
    document.head.append(s);
  }));
}

export function createGoogleDrive({ clientId, fetch: f = (...a) => fetch(...a), token = null }) {
  let tok = token ?? session.get('g');           // { access, expires, name, email }
  let folderId = null;
  const save = () => session.set('g', tok);
  let client = null, pending = null;

  function tokenClient() {
    if (client) return client;
    client = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE,
      callback: (r) => { const p = pending; pending = null; if (!p) return; if (r.error) p.reject(new SignInError(r.error, r.error_description || 'Signing in didn’t work.')); else p.resolve(r); },
      error_callback: (e) => { const p = pending; pending = null; p?.reject(new SignInError(e?.type || 'closed', e?.type === 'popup_failed_to_open' ? 'The sign-in window was blocked. Allow pop-ups for this site and try again.' : 'The sign-in window was closed.')); } });
    return client;
  }
  async function access() {
    if (tok?.access && Date.now() < tok.expires) return tok.access;
    // Google gives no lasting token to a page: an hour later the student signs in again (usually one click)
    tok = null; save();
    throw new SignInError('signin', 'Sign in again to use your Google Drive.');
  }
  async function api(url, opts = {}) {
    const r = await f(url, { ...opts, headers: { Authorization: 'Bearer ' + await access(), ...(opts.headers || {}) } });
    if (r.status === 401) { tok = null; save(); throw new SignInError('signin', 'Sign in again to use your Google Drive.'); }
    return r;
  }
  const fail = async (r, what) => { const j = await r.json().catch(() => ({})); const e = new Error(`${what} (${j.error?.message || r.status})`); e.status = r.status; return e; };
  const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  async function folder() {
    if (folderId) return folderId;
    const r = await api(`${API}/files?` + new URLSearchParams({ q: `name='${q(FOLDER)}' and mimeType='${FOLDER_TYPE}' and trashed=false`, fields: 'files(id)', spaces: 'drive' }));
    if (!r.ok) throw await fail(r, 'Couldn’t find the App Builder folder');
    const found = (await r.json()).files?.[0];
    if (found) return (folderId = found.id);
    const c = await api(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: FOLDER_TYPE }) });
    if (!c.ok) throw await fail(c, 'Couldn’t make the App Builder folder');
    return (folderId = (await c.json()).id);
  }

  return {
    id: 'google', name: 'Google Drive', company: 'Google',
    signedIn: () => !!tok,
    account: () => (tok ? { name: tok.name, email: tok.email } : null),
    // call straight from a click. The library loads first on the very first use, which can make the browser block the
    // window: then the student presses once more (the library is loaded by then).
    async signIn() {
      await loadGis();
      const r = await new Promise((resolve, reject) => { pending = { resolve, reject }; tokenClient().requestAccessToken({ prompt: tok?.email ? '' : 'select_account', login_hint: tok?.email || undefined }); });
      tok = { access: r.access_token, expires: Date.now() + (Number(r.expires_in) - 120) * 1000, name: '', email: '' };
      try {
        const u = await f('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + r.access_token } });
        if (u.ok) { const j = await u.json(); tok.name = j.name || ''; tok.email = j.email || ''; }
      } catch { /* the name is only shown */ }
      save();
    },
    signOut() {
      try { if (tok?.access) window.google?.accounts?.oauth2?.revoke(tok.access, () => {}); } catch { /* */ }
      tok = null; folderId = null; save();
    },
    async list() {
      const id = await folder();
      const r = await api(`${API}/files?` + new URLSearchParams({ q: `'${id}' in parents and trashed=false`, fields: 'files(id,name,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '200' }));
      if (!r.ok) throw await fail(r, 'Couldn’t list your apps');
      return ((await r.json()).files || []).filter((it) => /\.app\.(json|zip)$/i.test(it.name))
        .map((it) => ({ id: it.id, name: it.name, modified: Date.parse(it.modifiedTime) || 0, size: Number(it.size) || 0 }));
    },
    async save({ name, data, type, id = null }) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      // a resumable upload: one request to start it (with the file's name), one with the bytes; any size
      const start = id
        ? await api(`${UPLOAD}/files/${id}?uploadType=resumable&fields=id,name`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': type }, body: JSON.stringify({ name }) })
        : await api(`${UPLOAD}/files?uploadType=resumable&fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': type }, body: JSON.stringify({ name, parents: [await folder()] }) });
      if (!start.ok) throw await fail(start, 'Couldn’t save to Google Drive');
      const put = await api(start.headers.get('Location'), { method: 'PUT', headers: { 'Content-Type': type }, body: bytes });
      if (!put.ok) throw await fail(put, 'Couldn’t save to Google Drive');
      const j = await put.json(); return { id: j.id, name: j.name };
    },
    async open(id) {
      const r = await api(`${API}/files/${id}?alt=media`);
      if (!r.ok) throw await fail(r, 'Couldn’t open that app');
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}
