// Sign-in helpers shared by the drive providers. No DOM beyond window.open; no library.
// A sign-in opens a small window; when the provider sends it back to auth.html (beside App Builder), that page passes
// the result to this page (postMessage, BroadcastChannel or a storage event: whichever the browser allows) and closes.

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function pkceChallenge(verifier) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
// the page the provider returns to: auth.html in the same folder as this App Builder
export const redirectUri = (href) => new URL('auth.html', href.split('#')[0].split('?')[0].replace(/[^/]*$/, '')).href;

// Open the sign-in window now (it must happen straight from the click, or the browser blocks it); point it later.
export function openPopup(name = 'appbuilder-signin') {
  const w = 480, hgt = 640;
  const left = Math.max(0, (screen.availWidth - w) / 2), top = Math.max(0, (screen.availHeight - hgt) / 2);
  return window.open('about:blank', name, `popup,width=${w},height=${hgt},left=${left},top=${top}`);
}

// Wait for auth.html to report the result for this state. Rejects if the window is closed first, or after 5 minutes.
export function waitForResult(state, popup) {
  return new Promise((resolve, reject) => {
    let bc = null, timer = 0, poll = 0;
    const done = (fn, v) => { clearTimeout(timer); clearInterval(poll); removeEventListener('message', onMsg); removeEventListener('storage', onStore); try { bc?.close(); } catch { /* */ } fn(v); };
    const take = (m) => {
      if (!m || m.state !== state) return;
      try { popup?.close(); } catch { /* */ }
      if (m.error) done(reject, new SignInError(m.error, m.error_description));
      else done(resolve, m);
    };
    const onMsg = (e) => { if (e.origin === location.origin && e.data?.appBuilderAuth) take(e.data.appBuilderAuth); };
    const onStore = (e) => { if (e.key === 'appbuilder.auth.result' && e.newValue) { try { take(JSON.parse(e.newValue)); } catch { /* */ } } };
    addEventListener('message', onMsg);
    addEventListener('storage', onStore);
    try { bc = new BroadcastChannel('appbuilder-auth'); bc.onmessage = (e) => take(e.data); } catch { /* */ }
    // a closed window (the student gave up) ends the wait; some sign-in pages cut the link to their window, so a
    // window that reads as closed gets a few seconds' grace for the result to arrive by another route
    let closedAt = 0;
    poll = setInterval(() => {
      let closed = false; try { closed = !popup || popup.closed; } catch { /* */ }
      if (!closed) { closedAt = 0; return; }
      if (!closedAt) closedAt = Date.now();
      else if (Date.now() - closedAt > 4000) done(reject, new SignInError('closed', 'The sign-in window was closed.'));
    }, 500);
    timer = setTimeout(() => done(reject, new SignInError('timeout', 'Signing in took too long.')), 5 * 60 * 1000);
  });
}

export class SignInError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}
// the readable part of an ID token (who signed in); not checked, only shown
export function tokenClaims(jwt) {
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch { return {}; }
}
// sessionStorage: kept for this tab only, so a shared computer forgets the sign-in when the tab closes
export const session = {
  get(k) { try { return JSON.parse(sessionStorage.getItem('appbuilder.drive.' + k) || 'null'); } catch { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem('appbuilder.drive.' + k); else sessionStorage.setItem('appbuilder.drive.' + k, JSON.stringify(v)); } catch { /* */ } },
};
