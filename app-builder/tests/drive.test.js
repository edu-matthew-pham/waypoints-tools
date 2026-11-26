// Saving to a student's own drive (src/drive): OneDrive through Microsoft Graph and Google Drive, checked against a
// pretend network, so no accounts are needed. Signing in itself needs a real browser and real app registrations.
import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createOneDrive } from '../src/drive/onedrive.js';
import { createGoogleDrive } from '../src/drive/gdrive.js';
import { pkceChallenge, redirectUri, tokenClaims } from '../src/drive/oauth.js';
import { configured } from '../src/drive/config.js';

const HERE = 'https://tools.learningwaypoints.com/app-builder/?lesson=code/apps/x#open=abc';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
// a pretend network: each request is recorded and answered by the first matching route
function net(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    const call = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body };
    calls.push(call);
    for (const [test, answer] of routes) if (test(call)) return answer(call);
    throw new Error('no route for ' + call.method + ' ' + call.url);
  };
  return { f, calls };
}
const later = Date.now() + 3600e3;

test('sign-in helpers: PKCE challenge, the return page beside App Builder, who signed in', async () => {
  // S256: base64url(SHA-256(verifier)), checked against Node's own crypto
  const v = 'a-verifier-of-at-least-forty-three-characters-long';
  assert.equal(await pkceChallenge(v), createHash('sha256').update(v).digest('base64url'));
  assert.equal(redirectUri(HERE), 'https://tools.learningwaypoints.com/app-builder/auth.html');
  assert.equal(redirectUri('http://localhost:8765/app-builder/index.html'), 'http://localhost:8765/app-builder/auth.html');
  const jwt = 'x.' + Buffer.from(JSON.stringify({ name: 'Ada', preferred_username: 'ada@school.edu' })).toString('base64url') + '.y';
  assert.equal(tokenClaims(jwt).preferred_username, 'ada@school.edu');
  assert.deepEqual(tokenClaims('nonsense'), {});
});

test('only drives with a client ID are offered (none: the Drive button stays hidden)', () => {
  assert.deepEqual(configured(), ['microsoft']);
});

test('OneDrive: lists only App Builder files, newest first; nothing saved yet is an empty list', async () => {
  const n = net([[(c) => c.url.includes('/special/approot/children'), () => json({ value: [
    { id: '1', name: 'old.app.json', lastModifiedDateTime: '2026-11-01T00:00:00Z', size: 10, file: {} },
    { id: '2', name: 'notes.txt', lastModifiedDateTime: '2026-11-20T00:00:00Z', size: 3, file: {} },
    { id: '3', name: 'new.app.zip', lastModifiedDateTime: '2026-11-25T00:00:00Z', size: 99, file: {} },
    { id: '4', name: 'folder.app.json', lastModifiedDateTime: '2026-11-26T00:00:00Z' }] }) ]]);
  const od = createOneDrive({ clientId: 'c', href: HERE, fetch: n.f, token: { access: 'A', expires: later, mode: 'app' } });
  assert.deepEqual((await od.list()).map((x) => x.name), ['new.app.zip', 'old.app.json']);
  assert.equal(n.calls[0].headers.Authorization, 'Bearer A');
  const empty = createOneDrive({ clientId: 'c', href: HERE, fetch: net([[() => true, () => json({}, 404)]]).f, token: { access: 'A', expires: later, mode: 'app' } });
  assert.deepEqual(await empty.list(), []);
});

test('OneDrive: a small app saves in one request (by name, then by id); a big one goes up in pieces', async () => {
  const n = net([
    [(c) => c.method === 'PUT' && c.url.startsWith('https://graph.microsoft.com'), (c) => json({ id: c.url.includes('/items/') ? 'same' : 'new1', name: 'My app.app.json' })],
    [(c) => c.url.endsWith('/createUploadSession'), () => json({ uploadUrl: 'https://upload.example/s1' })],
    [(c) => c.url === 'https://upload.example/s1', (c) => { const [, , end, total] = c.headers['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/); return +end + 1 === +total ? json({ id: 'big', name: 'Big.app.zip' }, 201) : json({}, 202); }],
  ]);
  const od = createOneDrive({ clientId: 'c', href: HERE, fetch: n.f, token: { access: 'A', expires: later, mode: 'app' } });
  assert.deepEqual(await od.save({ name: 'My app.app.json', data: '{}', type: 'application/json' }), { id: 'new1', name: 'My app.app.json' });
  assert.match(n.calls[0].url, /\/me\/drive\/special\/approot:\/My%20app\.app\.json:\/content$/);
  await od.save({ name: 'My app.app.json', data: '{}', type: 'application/json', id: 'same' });
  assert.match(n.calls[1].url, /\/me\/drive\/items\/same\/content$/);
  const big = new Uint8Array(9 * 1024 * 1024);
  assert.deepEqual(await od.save({ name: 'Big.app.zip', data: big, type: 'application/zip' }), { id: 'big', name: 'Big.app.zip' });
  const pieces = n.calls.filter((c) => c.url === 'https://upload.example/s1');
  assert.equal(pieces.length, 3);
  assert.ok(pieces.every((c) => !c.headers.Authorization), 'the upload address carries its own permission');
  assert.ok(pieces.slice(0, -1).every((c) => c.body.length % (320 * 1024) === 0));
});

test('OneDrive: opening downloads through the short-lived address', async () => {
  const n = net([
    [(c) => c.url.includes('/items/7?'), () => json({ id: '7', '@microsoft.graph.downloadUrl': 'https://dl.example/7' })],
    [(c) => c.url === 'https://dl.example/7', () => new Response(new Uint8Array([1, 2, 3]))],
  ]);
  const od = createOneDrive({ clientId: 'c', href: HERE, fetch: n.f, token: { access: 'A', expires: later, mode: 'app' } });
  assert.deepEqual([...await od.open('7')], [1, 2, 3]);
  assert.ok(!n.calls[1].headers.Authorization);
});

test('OneDrive: an expired token is refreshed; with no way to refresh, it asks to sign in again', async () => {
  const n = net([
    [(c) => c.url.endsWith('/oauth2/v2.0/token'), (c) => { assert.equal(c.body.get('grant_type'), 'refresh_token'); return json({ access_token: 'B', expires_in: 3600, refresh_token: 'R2' }); }],
    [(c) => c.url.includes('/children'), () => json({ value: [] })],
  ]);
  const od = createOneDrive({ clientId: 'c', href: HERE, fetch: n.f, token: { access: 'A', expires: 0, refresh: 'R1', mode: 'app', name: 'Ada' } });
  await od.list();
  assert.equal(n.calls[1].headers.Authorization, 'Bearer B');
  assert.equal(od.account().name, 'Ada', 'who signed in is kept across a refresh');
  const gone = createOneDrive({ clientId: 'c', href: HERE, fetch: n.f, token: { access: 'A', expires: 0, mode: 'app' } });
  await assert.rejects(gone.list(), (e) => e.code === 'signin');
  assert.ok(!gone.signedIn());
});

test('OneDrive: an account that refuses the app folder asks for the wider permission; with it, the same folder by path', async () => {
  const no = createOneDrive({ clientId: 'c', href: HERE, fetch: net([[() => true, () => json({ error: { code: 'accessDenied', message: 'Access denied' } }, 403)]]).f, token: { access: 'A', expires: later, mode: 'app' } });
  await assert.rejects(no.list(), (e) => e.needFiles === true);
  const n = net([[() => true, (c) => (c.method === 'PUT' ? json({ id: '9', name: 'a.app.json' }) : json({ value: [] }))]]);
  const yes = createOneDrive({ clientId: 'c', href: HERE, fetch: n.f, token: { access: 'A', expires: later, mode: 'files' } });
  await yes.list(); await yes.save({ name: 'a.app.json', data: '{}', type: 'application/json' });
  assert.match(n.calls[0].url, /\/me\/drive\/root:\/Apps\/App Builder:\/children/);
  assert.match(n.calls[1].url, /\/me\/drive\/root:\/Apps\/App Builder\/a\.app\.json:\/content$/);
});

test('Google Drive: makes its App Builder folder once, lists it, saves new and again, opens', async () => {
  let folderMade = 0;
  const qOf = (c) => new URL(c.url).searchParams.get('q') || '';
  const n = net([
    [(c) => c.url.includes('/drive/v3/files?') && qOf(c).includes("mimeType='application/vnd.google-apps.folder'"), () => json({ files: folderMade ? [{ id: 'F' }] : [] })],
    [(c) => c.method === 'POST' && c.url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id'), () => { folderMade++; return json({ id: 'F' }); }],
    [(c) => c.url.includes('/drive/v3/files?') && qOf(c).includes("'F' in parents"), () => json({ files: [{ id: 'a', name: 'x.app.json', modifiedTime: '2026-11-26T00:00:00Z', size: '12' }, { id: 'b', name: 'other.pdf' }] })],
    [(c) => c.url.includes('uploadType=resumable'), () => new Response(null, { status: 200, headers: { Location: 'https://up.example/1' } })],
    [(c) => c.url === 'https://up.example/1', () => json({ id: 'a', name: 'x.app.json' })],
    [(c) => c.url.endsWith('/files/a?alt=media'), () => new Response(new Uint8Array([7]))],
  ]);
  const g = createGoogleDrive({ clientId: 'c', fetch: n.f, token: { access: 'G', expires: later } });
  assert.deepEqual((await g.list()).map((x) => [x.id, x.size]), [['a', 12]]);
  assert.equal(folderMade, 1);
  assert.deepEqual(await g.save({ name: 'x.app.json', data: '{}', type: 'application/json' }), { id: 'a', name: 'x.app.json' });
  const start = n.calls.find((c) => c.url.includes('uploadType=resumable'));
  assert.equal(start.method, 'POST'); assert.deepEqual(JSON.parse(start.body).parents, ['F']);
  await g.save({ name: 'x.app.json', data: '{}', type: 'application/json', id: 'a' });
  assert.equal(n.calls.filter((c) => c.url.includes('uploadType=resumable')).at(-1).method, 'PATCH');
  assert.deepEqual([...await g.open('a')], [7]);
  assert.equal(folderMade, 1, 'the folder is found again, not made twice');
});

test('Google Drive: after an hour (no lasting token for a page) it asks to sign in again', async () => {
  const g = createGoogleDrive({ clientId: 'c', fetch: net([]).f, token: { access: 'G', expires: 0 } });
  await assert.rejects(g.list(), (e) => e.code === 'signin');
  const h = createGoogleDrive({ clientId: 'c', fetch: net([[() => true, () => json({}, 401)]]).f, token: { access: 'G', expires: later } });
  await assert.rejects(h.list(), (e) => e.code === 'signin');
  assert.ok(!h.signedIn());
});
