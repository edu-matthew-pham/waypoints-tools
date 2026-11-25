// Share by link: the whole app travels inside the link, after the #, compressed, so there's no server and nothing is
// stored anywhere. index.html#play=… opens just the working app; index.html#open=… opens a copy in App Builder.
// Pictures and sounds of the app's own (uploads, recordings) are too big for a link: those apps are shared as a file.
// No DOM; CompressionStream exists in browsers and in Node 18+.

const b64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

// What a shared app leaves out: nothing it needs to run (uploads are checked separately).
export const canShareByLink = (project) => !(project.assets || []).length && !(project.sounds || []).length;

// project -> "z.<base64url of deflated JSON>" (or "j.<base64url of JSON>" where compression isn't available)
export async function encodeApp(project) {
  const json = new TextEncoder().encode(JSON.stringify(project));
  if (typeof CompressionStream === 'function') return 'z.' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j.' + b64url(json);
}
export async function decodeApp(text) {
  const [kind, data] = [String(text).slice(0, 2), String(text).slice(2)];
  let bytes = unb64url(data);
  if (kind === 'z.') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can’t open shared apps');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'j.') throw new Error('This link isn’t a shared app');
  return JSON.parse(new TextDecoder().decode(bytes));
}
// a short, stable name for a shared app's own "remember between visits" storage in the viewer's browser
export function linkKey(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
