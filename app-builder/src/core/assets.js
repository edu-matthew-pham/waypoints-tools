// Pictures. A project keeps its uploads in project.assets = [{ name, data, size? }]: data is a media reference
// (media:7f3a09c2, the file is in the browser's media store, see core/media.js) or, in older projects and saved
// files, a data: URL. Built-in pictures are always available and need no upload.
import { isRef, mediaSrc } from './media.js';
const svgUrl = (body, fill) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="${fill}" stroke="none">${body}</g></svg>`);

export const BUILTIN_IMAGES = {
  star:   svgUrl('<path d="M32 4l8.6 17.5 19.4 2.8-14 13.7 3.3 19.3L32 48.2 14.7 57.3 18 38 4 24.3l19.4-2.8z"/>', '#f5b301'),
  heart:  svgUrl('<path d="M32 56S6 40 6 22a13 13 0 0 1 26-4 13 13 0 0 1 26 4c0 18-26 34-26 34z"/>', '#e5484d'),
  trophy: svgUrl('<path d="M18 6h28v14a14 14 0 0 1-28 0z"/><path d="M18 10H8v4a10 10 0 0 0 10 10zM46 10h10v4a10 10 0 0 1-10 10z" opacity=".7"/><rect x="28" y="34" width="8" height="12"/><rect x="18" y="46" width="28" height="8" rx="2"/>', '#e0a100'),
  tick:   svgUrl('<circle cx="32" cy="32" r="28"/><path d="M18 33l9 9 19-20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>', '#2fa36b'),
  cross:  svgUrl('<circle cx="32" cy="32" r="28"/><path d="M22 22l20 20M42 22L22 42" stroke="#fff" stroke-width="7" stroke-linecap="round"/>', '#e5484d'),
  water:  svgUrl('<path d="M32 4C22 20 12 30 12 42a20 20 0 0 0 40 0C52 30 42 20 32 4z"/>', '#2f8fdd'),
  music:  svgUrl('<path d="M24 10l30-6v38a8 8 0 1 1-6-7.7V14l-18 3.6V48a8 8 0 1 1-6-7.7z"/>', '#7c3aed'),
  smile:  svgUrl('<circle cx="32" cy="32" r="28"/><circle cx="23" cy="26" r="4" fill="#4a3500"/><circle cx="41" cy="26" r="4" fill="#4a3500"/><path d="M20 38a14 14 0 0 0 24 0" fill="none" stroke="#4a3500" stroke-width="4" stroke-linecap="round"/>', '#f5c400'),
};

export const imageNames = (project) => [...Object.keys(BUILTIN_IMAGES), ...(project.assets || []).map((a) => a.name)];
// name (or a media reference, e.g. a picture a user drew) -> something an <img> can show
export function imageData(project, name) {
  if (isRef(name)) return mediaSrc(name);
  const up = (project.assets || []).find((a) => a.name === name);
  return up ? mediaSrc(up.data) : BUILTIN_IMAGES[name] ?? '';
}
// a free, tidy name from a file name: "My Cat (2).PNG" -> "my_cat_2"
export function assetName(project, fileName) {
  const base = (String(fileName).replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'picture').replace(/^(\d)/, 'p$1');
  const taken = new Set(imageNames(project));
  let name = base, n = 2;
  while (taken.has(name)) name = `${base}_${n++}`;
  return name;
}

// Sounds. Built-in sounds are files beside App Builder (sounds/<name>.mp3, served by the site, so every school gets
// the same ones with nothing to set up). The first set is App Builder's own, made by tools/make-sounds.mjs and
// released CC0 with the tool. More built-ins (for example FreePD tracks) can be listed in sounds/extra.json,
// loaded at start (addBuiltinSounds); uploads live in project.sounds = [{ name, data, title?, size? }], data as for pictures.
const OWN = 'Made for App Builder, CC0';
export const BUILTIN_SOUNDS = {
  chime:  { title: 'Chime', credit: OWN, effect: true },
  pop:    { title: 'Pop', credit: OWN, effect: true },
  win:    { title: 'Win jingle', credit: OWN, effect: true },
  oops:   { title: 'Oops', credit: OWN, effect: true },
  beat:   { title: 'Beat loop', credit: OWN },
  calm:   { title: 'Calm', credit: OWN },
  upbeat: { title: 'Upbeat', credit: OWN },
  sleepy: { title: 'Music box', credit: OWN },
};
// extra built-ins from sounds/extra.json: [{ name, file, title, credit }]
export function addBuiltinSounds(list) {
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !/^[a-z][a-z0-9_]*$/.test(s.name) || BUILTIN_SOUNDS[s.name] || !/^[\w.-]+\.(mp3|m4a|ogg)$/.test(s.file || '')) continue;
    BUILTIN_SOUNDS[s.name] = { title: String(s.title || s.name), credit: String(s.credit || ''), file: s.file };
  }
}
export const soundNames = (project) => [...Object.keys(BUILTIN_SOUNDS), ...(project.sounds || []).map((a) => a.name)];
// { src, title, credit } for a sound name, or null
export function soundInfo(project, name, base = 'sounds/') {
  const up = (project.sounds || []).find((a) => a.name === name);
  if (up) return { src: mediaSrc(up.data), title: up.title || up.name, credit: 'Uploaded' };
  const b = BUILTIN_SOUNDS[name];
  return b ? { src: base + (b.file || `${name}.mp3`), title: b.title, credit: b.credit } : null;
}
// a free, tidy name for an uploaded sound
export function soundAssetName(project, fileName) {
  const base = (String(fileName).replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sound').replace(/^(\d)/, 's$1');
  const taken = new Set(soundNames(project));
  let name = base, n = 2;
  while (taken.has(name)) name = `${base}_${n++}`;
  return name;
}

// Videos are links only (never uploaded: too big for a project). A link becomes:
//   { kind: 'file', src, page?, from }   a video file played in the browser's own player (Wikimedia Commons by default,
//                                       or any direct link to a .webm/.mp4/.ogv file, e.g. the Internet Archive)
//   { kind: 'youtube', src, from }       only when the app allows YouTube (project.allowYoutube; off by default)
//   { kind: 'blocked' | 'none', why }
// A Commons page link (commons.wikimedia.org/wiki/File:Name.webm) is turned into the file itself (Special:FilePath).
export function videoSource(link, { allowYoutube = false } = {}) {
  const raw = String(link ?? '').trim();
  if (!raw) return { kind: 'none', why: 'No video link yet' };
  let u;
  try { u = new URL(raw); } catch { return { kind: 'none', why: 'That isn’t a web link' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { kind: 'none', why: 'That isn’t a web link' };
  const host = u.hostname.replace(/^www\./, '');
  const yt = host === 'youtu.be' ? u.pathname.slice(1) : /(^|\.)youtube(-nocookie)?\.com$/.test(host)
    ? (u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] || '') : null;
  if (yt !== null) {
    if (!allowYoutube) return { kind: 'blocked', why: 'YouTube links are off for this app' };
    if (!/^[\w-]{6,20}$/.test(yt)) return { kind: 'none', why: 'That YouTube link has no video in it' };
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&enablejsapi=1&playsinline=1`, from: 'YouTube' };
  }
  if (host === 'commons.wikimedia.org' || host === 'commons.m.wikimedia.org') {
    const m = decodeURIComponent(u.pathname).match(/^\/wiki\/(?:File|Special:FilePath):(.+)$/) || decodeURIComponent(u.pathname).match(/^\/wiki\/Special:FilePath\/(.+)$/);
    if (!m) return { kind: 'none', why: 'Link to one video file on Wikimedia Commons (its File: page)' };
    const file = m[1].replace(/ /g, '_');
    return { kind: 'file', src: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`, page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`, from: 'Wikimedia Commons' };
  }
  if (/\.(webm|mp4|ogv|m4v|mov)$/i.test(u.pathname)) return { kind: 'file', src: u.href, from: host };
  return { kind: 'none', why: 'Use a link to a video file (.webm or .mp4), such as a Wikimedia Commons file' };
}
