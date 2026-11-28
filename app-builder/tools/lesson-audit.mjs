// Lesson audit: a student who does only what the guided tutorial's ring says, through every guided build step of every
// App Builder lesson, each from the lesson's own starter for that step. Reports, per step:
//   built      the ring led all the way
//   checklist  the lesson's clip showed part and the step's text asks for the rest: the ring hands over to the card's
//              checklist (fine, as these lessons are written)
//   STUCK ...  the ring stopped, repeated itself or ran out of moves: worth a look (App Builder or the lesson's clip)
// plus any card flip-flopping and page errors. Exit code 1 if any step is STUCK, flips while idle or errors.
//
//   node tools/lesson-audit.mjs                       the published lessons (tutorials.learningwaypoints.com)
//   node tools/lesson-audit.mjs --content ../path/to/waypoints-tutorials/content   a local copy of the lessons
//   add a filter word to run only matching lessons, e.g. ... water
//   --video <folder>                                   also record each guided step as a video (one .webm per step,
//                                                      named <course>--<lesson>--<step>.webm), to watch what a student
//                                                      following the ring sees
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { page, openApp, close, region, loadProject, watchFlips, followRing } from '../tests/browser/helpers.mjs';
import { parseLesson, tutorialSections, TUTORIAL_LIST, LESSON_BASE } from '../src/edu/tutorial.js';

const args = process.argv.slice(2);
const content = args.includes('--content') ? args[args.indexOf('--content') + 1] : null;
const videos = args.includes('--video') ? args[args.indexOf('--video') + 1] : null;
const filter = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--content' && args[i - 1] !== '--video')[0] || '';
if (videos) mkdirSync(videos, { recursive: true });
const tidy = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

async function lessons() {
  if (content) {
    const out = {};
    for (const course of ['code/apps', 'code/data-apps']) {
      const dir = join(content, course);
      if (!existsSync(dir)) continue;
      for (const l of readdirSync(dir)) {
        const d = join(dir, l);
        if (!existsSync(join(d, 'lesson.md'))) continue;
        const files = {};
        for (const n of readdirSync(d)) if (statSync(join(d, n)).isFile() && /\.(md|json|txt|csv|yml)$/.test(n)) files[n] = readFileSync(join(d, n), 'utf8');
        out[`${course}/${l}`] = files;
      }
    }
    return out;
  }
  const list = tutorialSections(await (await fetch(TUTORIAL_LIST)).json());
  const out = {};
  for (const sec of list) for (const g of sec.groups) for (const l of g.lessons) {
    const r = await fetch(LESSON_BASE + l.slug + '/source.json');
    if (r.ok) out[l.slug] = (await r.json()).files;
  }
  return out;
}

const all = await lessons();
let bad = 0, total = 0, built = 0, handed = 0;
for (const [slug, files] of Object.entries(all)) {
  if (filter && !slug.includes(filter)) continue;
  let steps;
  try { steps = parseLesson(files['lesson.md']).steps; } catch { continue; } // no guided steps (e.g. Your own app)
  const lines = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.check || !s.targets.length) continue; // build steps with a clip and a code check
    total++;
    const p = await page({ lessons: { [slug]: files }, view: [1366, 768], video: videos ? join(videos, '.raw') : null });
    try {
      await openApp(p, '?lesson=' + slug);
      const [file, name] = s.start.split('#');
      await loadProject(p, JSON.parse(files[file].split('// region: ' + name + '\n')[1].split('\n// endregion')[0]));
      await p.click(`[data-ab='tutorial-step:${i + 1}']`);
      await p.waitForTimeout(300);
      const flips = await watchFlips(p);
      const r = await followRing(p, videos ? { pause: 900 } : {}); // slower on video, so it can be watched
      const during = await flips.count();
      await p.waitForTimeout(2000);
      const idle = (await flips.count()) - during;
      const outcome = r.built ? 'built' : r.stop === 'checklist' ? 'checklist' : 'STUCK ' + r.stop;
      const problem = outcome.startsWith('STUCK') || idle > 0 || p.errors.length;
      if (outcome === 'built') built++; else if (outcome === 'checklist') handed++;
      if (problem) bad++;
      lines.push(`  ${problem ? '✗' : '✓'} ${s.title}: ${outcome} (${r.moves} moves${during ? `, card moved ${during}×` : ''}${idle ? `, FLIPS WHILE IDLE ${idle}×` : ''})${p.errors.length ? ' errors: ' + p.errors.join(' / ') : ''}`);
    } catch (e) {
      bad++; lines.push(`  ✗ ${s.title}: the audit couldn't run it (${String(e.message).split('\n')[0]})`);
    } finally {
      await p.context().close();
      if (videos) { try { await p.video().saveAs(join(videos, `${tidy(slug.replace(/^code\//, ''))}--${tidy(s.title)}.webm`)); await p.video().delete(); } catch { /* no video */ } }
    }
  }
  if (lines.length) console.log(slug + '\n' + lines.join('\n'));
}
await close();
if (videos) { rmSync(join(videos, '.raw'), { recursive: true, force: true }); console.log(`\nVideos: ${videos}/ (one per guided build step)`); }
console.log(`\n${total} guided build steps: ${built} built by the ring, ${handed} handed to the checklist, ${bad} with problems.`);
process.exit(bad ? 1 : 0);
