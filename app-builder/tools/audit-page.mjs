// The lesson audit as a web page: every guided build step's video, grouped by lesson in course order, with what
// happened. Published at tools.learningwaypoints.com/app-builder/audit/ by .github/workflows/pages.yml after each
// weekly audit (unlisted: noindex, no links to it from App Builder).
//
//   node tools/lesson-audit.mjs --video videos --report report.json
//   node tools/audit-page.mjs videos report.json audit-page
//
// With ffmpeg on the path, videos become .mp4 (plays everywhere, about a third the size) with a still frame each;
// without it the .webm files are used as they are.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [videos, reportFile, out] = process.argv.slice(2);
if (!videos || !reportFile || !out) { console.error('usage: node tools/audit-page.mjs <videos> <report.json> <out>'); process.exit(2); }
const report = JSON.parse(readFileSync(reportFile, 'utf8'));
mkdirSync(join(out, 'videos'), { recursive: true });
let ffmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ffmpeg = false; }
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// videos: .mp4 and a still frame near the end (the finished step), or the .webm as it is
for (const l of report.lessons) for (const s of l.steps) {
  const src = s.video && join(videos, s.video);
  if (!src || !existsSync(src)) { s.src = null; continue; }
  const base = s.video.replace(/\.webm$/, '');
  if (ffmpeg) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=1100:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(out, 'videos', base + '.mp4')]);
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString()) || 0;
    s.seconds = Math.round(dur);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, dur - 1.5)), '-i', src, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', join(out, 'videos', base + '.jpg')]);
    s.src = `videos/${base}.mp4`; s.poster = `videos/${base}.jpg`;
  } else {
    copyFileSync(src, join(out, 'videos', s.video));
    s.src = `videos/${s.video}`;
  }
}

const kind = (s) => s.problem ? 'stuck' : s.outcome === 'built' ? 'built' : 'hand';
const said = (s) => s.problem ? `Problem: ${s.outcome.replace(/^STUCK\s*/, '')}` : s.outcome === 'built' ? 'Guide leads all the way' : 'Hands over to the checklist';
const course = (slug) => slug.startsWith('code/data-apps/') ? 'Data apps' : slug.startsWith('code/apps/') ? 'App Builder apps' : 'Other';
const id = (slug) => slug.replace(/^code\//, '').replace(/[^a-z0-9]+/gi, '-');
const when = new Date(report.when);
const date = isNaN(when) ? '' : when.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' });
const courses = [...new Set(report.lessons.map((l) => course(l.slug)))];

const step = (s) => `
      <figure class="step ${kind(s)}">
        ${s.src ? `<video controls preload="none" playsinline${s.poster ? ` poster="${esc(s.poster)}"` : ''} src="${esc(s.src)}"></video>` : '<div class="novid">No video</div>'}
        <figcaption><strong>${esc(s.title)}</strong><span class="tag">${esc(said(s))}</span><span class="meta">${s.moves} moves${s.seconds ? ` · ${s.seconds}s` : ''}</span></figcaption>
      </figure>`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Guided tutorial runs</title>
<style>
:root{color-scheme:light dark;--bg:light-dark(#ffffff,#070f26);--ink:light-dark(#10223a,#e8edf7);--muted:light-dark(#55627a,#9aa7c0);--line:light-dark(#dfe4ee,#1f2c4d);--card:light-dark(#f6f8fc,#0d1a3a);--band:#0b1f4b;--ok:light-dark(#15803d,#4ade80);--hand:light-dark(#b45309,#fbbf24);--bad:#e0115f}
*{box-sizing:border-box;min-width:0}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-x:clip}
h1,h2,h3{line-height:1.15;text-wrap:balance;margin:0}
.band{padding:clamp(24px,4vw,48px) max(5vw,16px)}
.top{background:var(--band);color:#fff}
.top h1{font-size:clamp(28px,4.2vw,42px)}
.top p{max-width:70ch;color:#c9d4ee;margin:10px 0 0}
.figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px;max-width:900px}
.fg{background:rgba(255,255,255,.08);border-radius:12px;padding:12px 14px}
.fg b{display:block;font-size:clamp(26px,3.4vw,34px);line-height:1}
.fg span{font-size:13px;color:#c9d4ee}
.fg.ok b{color:#4ade80}.fg.hand b{color:#fbbf24}.fg.bad b{color:#ff6b9a}
nav{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:10px max(5vw,16px);display:flex;gap:8px;overflow-x:auto}
nav a{flex:none;font-size:14px;color:var(--ink);text-decoration:none;padding:6px 12px;border-radius:999px;background:var(--card);white-space:nowrap}
nav a:hover,nav a:focus-visible{outline:2px solid var(--ok)}
main{max-width:1240px;margin:0 auto}
h2{font-size:26px;margin:18px 0 4px}
.lesson{scroll-margin-top:64px}
.lesson h3{font-size:19px;margin:22px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:16px}
.step{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.step video,.novid{width:100%;aspect-ratio:1366/768;background:#000;display:block}
.novid{display:grid;place-content:center;color:#9aa7c0}
figcaption{padding:10px 12px 12px;display:grid;gap:4px}
figcaption strong{font-weight:600}
.tag{font-size:13px;font-weight:600}
.built .tag{color:var(--ok)}.hand .tag{color:var(--hand)}.stuck .tag{color:var(--bad)}
.meta{font-size:13px;color:var(--muted)}
.note{color:var(--muted);font-size:14px;max-width:78ch}
@media(max-width:600px){.figs{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body>
<header class="band top">
  <h1>Guided tutorials: a student who only follows the highlight</h1>
  <p>Every guided build step in the published App Builder lessons, recorded ${esc(date)} on App Builder ${esc(report.version)}. The student is scripted: it does exactly what the highlight and its bubble say, about one move a second. Updated by the weekly lesson audit.</p>
  <div class="figs">
    <div class="fg"><b>${report.total}</b><span>guided build steps</span></div>
    <div class="fg ok"><b>${report.built}</b><span>guide leads all the way</span></div>
    <div class="fg hand"><b>${report.handed}</b><span>hand over to the checklist</span></div>
    <div class="fg${report.problems ? ' bad' : ''}"><b>${report.problems}</b><span>with problems</span></div>
  </div>
</header>
<nav aria-label="Lessons">${report.lessons.map((l) => `<a href="#${esc(id(l.slug))}">${esc(l.title)}</a>`).join('')}</nav>
<main class="band">
  <p class="note">"Hands over to the checklist" is expected: the lesson's clip shows part of the step and its text asks for the rest, so the guide stops and the card's checklist takes over. Videos load when you press play.</p>
  ${courses.map((c) => `<section><h2>${esc(c)}</h2>${report.lessons.filter((l) => course(l.slug) === c).map((l) => `
    <div class="lesson" id="${esc(id(l.slug))}"><h3>${esc(l.title)}</h3><div class="grid">${l.steps.map(step).join('')}
    </div></div>`).join('')}</section>`).join('')}
</main>
<script>{ for (const v of document.querySelectorAll('video')) v.addEventListener('play', () => { for (const o of document.querySelectorAll('video')) if (o !== v) o.pause(); }); }</script>
</body></html>
`;
writeFileSync(join(out, 'index.html'), html);
console.log(`Audit page: ${out}/index.html (${report.lessons.reduce((n, l) => n + l.steps.filter((s) => s.src).length, 0)} videos${ffmpeg ? ', .mp4' : ', .webm (no ffmpeg)'})`);
