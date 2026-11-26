// OneDrive (Microsoft 365 school accounts, and personal Microsoft accounts) through Microsoft Graph, all in the browser:
// sign-in is the authorization code flow with PKCE for a single-page app (no secret), tokens stay in this tab.
// Files go in App Builder's own folder: Apps/App Builder in the student's OneDrive (Files.ReadWrite.AppFolder). If an
// account doesn't allow that permission, App Builder asks for Files.ReadWrite instead and uses the same folder by path.
import { randomString, pkceChallenge, redirectUri, openPopup, waitForResult, SignInError, tokenClaims, session } from './oauth.js';

const LOGIN = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = { app: 'openid profile offline_access Files.ReadWrite.AppFolder', files: 'openid profile offline_access Files.ReadWrite' };
const SIMPLE_MAX = 4 * 1024 * 1024;     // larger files go up in pieces (an upload session)
const CHUNK = 320 * 1024 * 12;          // pieces must be multiples of 320 KiB

export function createOneDrive({ clientId, href = location.href, fetch: f = (...a) => fetch(...a), token = null }) {
  let tok = token ?? session.get('ms');          // { access, expires, refresh, mode, name, email }
  const save = () => session.set('ms', tok);

  async function tokenRequest(body) {
    const r = await f(LOGIN + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new SignInError(j.error || 'token', j.error_description?.split('\r\n')[0] || 'Signing in didn’t work.');
    return j;
  }
  function keep(j, mode) {
    const who = j.id_token ? tokenClaims(j.id_token) : {};
    tok = { access: j.access_token, expires: Date.now() + (j.expires_in - 120) * 1000, refresh: j.refresh_token || tok?.refresh || null,
      mode, name: who.name || tok?.name || '', email: who.preferred_username || who.email || tok?.email || '' };
    save();
  }
  async function access() {
    if (tok?.access && Date.now() < tok.expires) return tok.access;
    if (tok?.refresh) {
      try { keep(await tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh, scope: SCOPES[tok.mode] }), tok.mode); return tok.access; } catch { /* sign in again */ }
    }
    tok = null; save();
    throw new SignInError('signin', 'Sign in again to use your OneDrive.');
  }
  async function graph(path, opts = {}) {
    const r = await f(path.startsWith('http') ? path : GRAPH + path, { ...opts, headers: { Authorization: 'Bearer ' + await access(), ...(opts.headers || {}) } });
    if (r.status === 401) { tok = { ...tok, expires: 0 }; save(); }
    return r;
  }
  const fail = async (r, what) => {
    const j = await r.json().catch(() => ({}));
    const e = new Error(`${what} (${j.error?.message || r.status})`);
    e.status = r.status; e.code = j.error?.code;
    // the account won't let App Builder use its own app folder: ask for the wider permission instead
    if (tok?.mode === 'app' && (r.status === 403 || (r.status === 400 && /notSupported|invalidRequest/i.test(e.code || '')))) e.needFiles = true;
    return e;
  };
  // where App Builder's files are: its app folder, or (with Files.ReadWrite) the same place by path
  const folder = () => (tok?.mode === 'files' ? '/me/drive/root:/Apps/App Builder:' : '/me/drive/special/approot');
  const byName = (name) => (tok?.mode === 'files' ? `/me/drive/root:/Apps/App Builder/${encodeURIComponent(name)}:` : `/me/drive/special/approot:/${encodeURIComponent(name)}:`);

  return {
    id: 'microsoft', name: 'OneDrive', company: 'Microsoft',
    signedIn: () => !!tok,
    account: () => (tok ? { name: tok.name, email: tok.email } : null),
    // call straight from a click: the sign-in window has to open before anything waits
    async signIn({ files = false } = {}) {
      const popup = openPopup();
      if (!popup) throw new SignInError('popup', 'The sign-in window was blocked. Allow pop-ups for this site and try again.');
      const mode = files ? 'files' : 'app';
      const verifier = randomString(48), state = 'ms.' + randomString(12), redirect = redirectUri(href);
      const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, response_mode: 'query', scope: SCOPES[mode],
        state, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256', prompt: 'select_account' });
      popup.location.href = LOGIN + '/authorize?' + q;
      const { code } = await waitForResult(state, popup);
      keep(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, scope: SCOPES[mode] }), mode);
    },
    signOut() { tok = null; save(); },
    // -> [{ id, name, modified (ms), size }], newest first; only App Builder files
    async list() {
      const r = await graph(`${folder()}/children?$select=id,name,lastModifiedDateTime,size,file&$top=200`);
      if (r.status === 404) return []; // no folder yet: nothing saved
      if (!r.ok) throw await fail(r, 'Couldn’t list your apps');
      const j = await r.json();
      return (j.value || []).filter((it) => it.file && /\.app\.(json|zip)$/i.test(it.name))
        .map((it) => ({ id: it.id, name: it.name, modified: Date.parse(it.lastModifiedDateTime) || 0, size: it.size || 0 }))
        .sort((a, b) => b.modified - a.modified);
    },
    // a new file by name (id null), or the same file again (id) -> { id, name }
    async save({ name, data, type, id = null }) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const base = id ? `/me/drive/items/${id}` : byName(name);
      if (bytes.length <= SIMPLE_MAX) {
        const r = await graph(`${base}/content`, { method: 'PUT', headers: { 'Content-Type': type }, body: bytes });
        if (!r.ok) throw await fail(r, 'Couldn’t save to OneDrive');
        const j = await r.json(); return { id: j.id, name: j.name };
      }
      const s = await graph(`${base}/createUploadSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });
      if (!s.ok) throw await fail(s, 'Couldn’t save to OneDrive');
      const { uploadUrl } = await s.json();
      let last = null;
      for (let at = 0; at < bytes.length; at += CHUNK) {
        const piece = bytes.subarray(at, Math.min(at + CHUNK, bytes.length));
        // the upload address already carries permission: no sign-in header
        last = await f(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${at}-${at + piece.length - 1}/${bytes.length}` }, body: piece });
        if (!last.ok && last.status !== 202) throw await fail(last, 'Couldn’t save to OneDrive');
      }
      const j = await last.json(); return { id: j.id, name: j.name };
    },
    async open(id) {
      const r = await graph(`/me/drive/items/${id}?$select=id,name,@microsoft.graph.downloadUrl`);
      if (!r.ok) throw await fail(r, 'Couldn’t open that app');
      const url = (await r.json())['@microsoft.graph.downloadUrl'];
      const d = await f(url); // a short-lived address that needs no sign-in
      if (!d.ok) throw await fail(d, 'Couldn’t open that app');
      return new Uint8Array(await d.arrayBuffer());
    },
  };
}
