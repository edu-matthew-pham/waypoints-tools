// Pick a picture file and turn it into a data: URL small enough to keep inside the project file.
// Photos are shrunk to at most 800 px; GIFs are kept as they are (so animations still play).
import { h } from './dom.js';

const MAX_SIDE = 800;
const MAX_BYTES = 1_500_000;

export function pickPicture(onReady, notify) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = await toDataUrl(file);
      if (data.length > MAX_BYTES) { notify('That picture is too big. Try a smaller one (under about 1 MB).'); return; }
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
