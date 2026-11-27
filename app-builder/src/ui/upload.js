// Pick a picture or sound file and turn it into a data: URL (the caller keeps it in the media store, media-store.js).
// Photos are shrunk to at most 800 px; GIFs are kept as they are (so animations still play).
// Size caps: with the media store (hundreds of MB) files can be bigger; without it uploads stay inside the project,
// which has about 5 MB in all, so the old, smaller caps apply.
import { h } from './dom.js';
import { available } from '../media-store.js';

const MAX_SIDE = 800;
const mbText = (n) => `${Math.round(n / 1e6)} MB`;
// caps in bytes of the file itself: [with the media store, without it]
const PICTURE_CAP = [5_000_000, 1_000_000];
const SOUND_CAP = [5_000_000, 1_000_000];
const cap = async ([big, small]) => ((await available()) ? big : small);
const dataBytes = (url) => Math.round((url.length - url.indexOf(',') - 1) * 0.75);

export function pickPicture(onReady, notify) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = await toDataUrl(file);
      const max = await cap(PICTURE_CAP);
      if (dataBytes(data) > max) { notify(`That picture is too big. Try a smaller one (under about ${mbText(max)}).`); return; }
      onReady({ fileName: file.name, data });
    } catch {
      notify('Could not read that picture.');
    }
  });
  input.click();
}

function readAsDataUrl(file) {
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(file); });
}

async function toDataUrl(file) {
  const raw = await readAsDataUrl(file);
  if (file.type === 'image/gif') return raw;
  const img = new Image();
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = raw; });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && raw.length < 400_000) return raw;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png');
}

// Pick a sound file. Capped at about 5 MB (a few minutes of MP3), or about 1 MB with no media store.
export function pickSound(onReady, notify) {
  const input = h('input', { type: 'file', accept: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.ogg,.wav' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const max = await cap(SOUND_CAP);
      if (file.size > max) { notify(`That sound is too big (keep it under about ${mbText(max)}: a shorter clip, or an MP3 at a lower quality).`); return; }
      const data = await readAsDataUrl(file);
      onReady({ fileName: file.name, data });
    } catch {
      notify('Could not read that sound.');
    }
  });
  input.click();
}

// Pick a web page (.html) for an Embed: one self-contained file. Read as text; the caller keeps it (keepPage).
// Capped at about 2 MB (a simulation is usually well under 200 KB), or about 500 KB with no media store.
const PAGE_CAP = [2_000_000, 500_000];
export const pageCap = () => cap(PAGE_CAP);
export function pickPage(onReady, notify) {
  const input = h('input', { type: 'file', accept: 'text/html,.html,.htm' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const max = await cap(PAGE_CAP);
      if (file.size > max) { notify(`That page is too big (keep it under about ${(max / 1e6).toFixed(1)} MB: one file, without big pictures inside it).`); return; }
      onReady({ fileName: file.name, html: await file.text() });
    } catch {
      notify('Could not read that page.');
    }
  });
  input.click();
}
