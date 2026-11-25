// Used by .github/workflows/app-builder-freepd.yml: download FreePD tracks from a mirror, check each is audio,
// keep the first SECONDS_KEEP seconds (fading out), save app-builder/sounds/<name>.mp3 and list it in sounds/extra.json.
// TRACKS: one per line,  name | title | path under the mirror
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BUILTIN_SOUNDS } from '../src/core/assets.js';

const SOUNDS = join(dirname(fileURLToPath(import.meta.url)), '..', 'sounds');
const mirror = new URL(process.env.MIRROR || 'https://a.ocv.me/pub/stuff/music/freepd/');
const keep = Math.max(5, Math.min(120, Number(process.env.SECONDS_KEEP) || 30));
const lines = String(process.env.TRACKS || '').split('\n').map((l) => l.trim()).filter(Boolean);
if (!lines.length) throw new Error('No tracks given.');

const listPath = join(SOUNDS, 'extra.json');
const list = JSON.parse(readFileSync(listPath, 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'freepd-'));
let bad = 0;
for (const line of lines) {
  const [name, title, path] = line.split('|').map((x) => x.trim());
  if (!/^[a-z][a-z0-9_]*$/.test(name || '')) { console.error(`✗ "${line}": the name must be lower case letters, numbers and _`); bad++; continue; }
  if (BUILTIN_SOUNDS[name]) { console.error(`✗ ${name}: App Builder already has a sound with that name`); bad++; continue; }
  if (!title || !path || path.includes('..') || !/\.mp3$/i.test(path)) { console.error(`✗ "${line}": expected  name | title | folder/File name.mp3`); bad++; continue; }
  const url = new URL(path.split('/').map(encodeURIComponent).join('/'), mirror);
  if (url.origin !== mirror.origin) { console.error(`✗ ${name}: that path leaves the mirror`); bad++; continue; }
  const raw = join(tmp, `${name}.download`);
  try {
    execFileSync('curl', ['-fsSL', '--max-time', '120', '--max-filesize', '40000000', '-o', raw, url.href]);
    const fmt = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name:stream=codec_type', '-of', 'csv=p=0', raw]).toString();
    if (!/audio/.test(fmt)) throw new Error(`not audio (${fmt.trim()})`);
    const file = `${name}.mp3`;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-t', String(keep), '-af', `afade=t=out:st=${keep - 2}:d=2`,
      '-ac', '1', '-ar', '32000', '-b:a', '64k', '-map_metadata', '-1', '-vn', join(SOUNDS, file)]);
    const entry = { name, file, title, credit: 'FreePD, CC0' };
    const at = list.findIndex((x) => x.name === name);
    if (at >= 0) list[at] = entry; else list.push(entry);
    console.log(`✓ ${name}: ${title} (${url.href})`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message.split('\n')[0]}`);
    bad++;
  }
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n');
if (bad) process.exitCode = 1;
