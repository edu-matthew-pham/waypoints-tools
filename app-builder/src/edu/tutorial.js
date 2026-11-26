// Guided tutorials, read straight from a Waypoints lesson (waypoints-tutorials content/<course>/<lesson>/lesson.md).
// The lesson stays the one source: the website shows it as a page, and App Builder shows the same steps beside the
// editor when a link opens it with ?lesson=<course>/<lesson> (or ?tutorial=<url of a lesson.md>). Off otherwise.
//
// What App Builder takes from the lesson (the tutorials' own format, tools/lesson-core.mjs there):
//   ## Step title              one tutorial step per section whose ```step block has try: { playground: appbuilder, keep }
//   ### Task title             a step with two or more tasks becomes one tutorial step per task
//   the section's text         shown in the step card (simple Markdown: lists, bold, italic, code, links)
//   check: { type: code, rules }   the step ticks itself when the rules pass on the sheet text (same rules as the page:
//                                  contains, event, lacks). No code check: the student just moves on with Next.
//   clip:                       the lesson clip's click and type selectors (data-ab labels) are what the tutorial
//                               points at, in order; its captions say what that pointer is for
//   try: { starter, level }     the first such step's starter is the project the tutorial starts from (one project
//                               all the way through, like the lesson's `keep:`), and its level is the level
// Steps that use a different project (Try the finished app) or no App Builder (a quiz) stay on the website.
// No DOM here, so tests run it in Node. Imports nothing from core/ or the editor.
import yaml from 'js-yaml';

const STEP_RE = /```step[ \t]*\n([\s\S]*?)\n```[ \t]*\n?/;

// A ```code file#region block inside the lesson is that file's region (the tutorials' inline code).
export function inlineFiles(text) {
  const files = {};
  const rest = text.replace(/^```code[ \t]+([\w.\-/]+)#([\w-]+)[ \t]*\n([\s\S]*?)\n```[ \t]*$\n?/gm, (_, file, name, body) => {
    files[file] = (files[file] || '') + `// region: ${name}\n${body}\n// endregion\n`;
    return '';
  });
  return { files, rest };
}

// file#region: the lines between `// region: name` and `// endregion` (any comment style the tutorials use)
export function region(text, name) {
  const marker = /^\s*(?:#|\/\/|<!--|\/\*|%%)\s*(end)?region\b\s*:?\s*([\w-]*)/;
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (!name) return lines.filter((l) => !marker.test(l)).join('\n').trim();
  const out = [];
  let on = false;
  for (const line of lines) {
    const m = line.match(marker);
    if (m && !m[1] && m[2] === name) { on = true; continue; }
    if (m && m[1] && on) break;
    if (on) out.push(line);
  }
  if (!out.length) throw new Error(`region "${name}" not found`);
  return out.join('\n').trim();
}

// What the student is pointed at, from a lesson clip: click and type actions, each with the caption before it.
export function targetsOf(clip) {
  const out = [];
  let caption = '';
  for (const a of Array.isArray(clip) ? clip : []) {
    if (!a || typeof a !== 'object') continue;
    if (a.caption) caption = typeof a.caption === 'string' ? a.caption : a.caption.text || '';
    const sel = a.click?.selector || a.type?.selector;
    if (sel) out.push({ selector: sel, action: a.click ? 'click' : 'type', caption });
  }
  return out;
}

// The same rules as the lesson page (waypoints-tutorials tools/lesson-core.mjs, kind 'appbuilder'): spaces ignored;
// contains anywhere; each event list all on one event line; lacks nowhere.
export function evalRules(rules, text) {
  const flat = (s) => String(s).replace(/\s+/g, '');
  const lines = String(text).split('\n').filter((l) => l.startsWith('event:')).map(flat);
  const all = flat(text);
  const out = [];
  for (const f of rules?.contains || []) out.push({ label: `Has ${f}`, ok: all.includes(flat(f)) });
  for (const fs of rules?.event || []) { const list = [].concat(fs); out.push({ label: `One event with ${list.join(' + ')}`, ok: lines.some((l) => list.every((f) => l.includes(flat(f)))) }); }
  for (const f of rules?.lacks || []) out.push({ label: `No ${f}`, ok: !all.includes(flat(f)) });
  return out;
}
export const passes = (rules, text) => evalRules(rules, text).every((r) => r.ok);

// lesson.md text -> { title, starter: 'app.json#start', level, steps: [{ title, body, check, targets }], files }
export function parseLesson(raw) {
  raw = String(raw).replace(/\r\n/g, '\n');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fm) throw new Error('This isn’t a lesson: it should start with --- frontmatter ---.');
  const meta = yaml.load(fm[1]) || {};
  let { files, rest } = inlineFiles(raw.slice(fm[0].length));
  rest = rest.replace(/^```teacher[ \t]*\n[\s\S]*?\n```[ \t]*$\n?/gm, ''); // teacher notes never reach students
  const sections = rest.split(/^## /m).slice(1);
  let keep, starter, level;
  const steps = [];
  for (const chunk of sections) {
    const nl = chunk.indexOf('\n');
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    let body = nl === -1 ? '' : chunk.slice(nl + 1);
    const m = body.match(STEP_RE);
    if (!m) continue;
    let config;
    try { config = yaml.load(m[1]) || {}; } catch { continue; }
    body = body.replace(m[0], '');
    const t = config.try;
    if (t?.playground !== 'appbuilder' || !t.keep) continue;
    if (keep === undefined) { keep = t.keep; starter = t.starter; level = t.level; }
    else if (t.keep !== keep) continue;
    const targets = targetsOf(config.clip);
    const secs = body.split(/^### /m);
    const lead = secs.shift().trim();
    if (secs.length >= 2) {
      secs.forEach((s, n) => {
        const nl2 = s.indexOf('\n');
        const task = Array.isArray(config.tasks) ? config.tasks[n] || {} : {};
        steps.push({ title: (nl2 === -1 ? s : s.slice(0, nl2)).trim(), part: title, body: [n === 0 ? lead : '', nl2 === -1 ? '' : s.slice(nl2 + 1).trim()].filter(Boolean).join('\n\n'),
          check: codeCheck(task.check), targets: n === 0 ? targets : targetsOf(task.clip) });
      });
    } else steps.push({ title, body: body.trim(), check: codeCheck(config.check), targets });
  }
  if (!steps.length) throw new Error('This lesson has no App Builder build steps to guide.');
  return { title: meta.title ? String(meta.title) : 'Tutorial', starter: starter || '', level: Number(level) || null, steps, files };
}
const codeCheck = (c) => (c && c.type === 'code' && c.rules ? { text: String(c.text || ''), rules: c.rules } : null);

// Which steps are done: a step with a check is done while its rules pass (so undoing un-ticks it).
export const ticks = (tutorial, text) => tutorial.steps.map((s) => (s.check ? passes(s.check.rules, text) : null));

// Where a tutorial comes from. ?lesson=code/apps/practice-tracker reads the lesson from the tutorials repo;
// ?tutorial=<url> any lesson.md on an allowed site (Waypoints, the tutorials repo, or a local copy while writing one).
export const LESSON_BASE = 'https://raw.githubusercontent.com/edu-matthew-pham/waypoints-tutorials/main/content/';
const ALLOWED = [/^https:\/\/([a-z0-9-]+\.)*learningwaypoints\.com\//, /^https:\/\/raw\.githubusercontent\.com\/edu-matthew-pham\//, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//];
export function tutorialUrl(params, here) {
  const lesson = params.get('lesson');
  if (lesson) {
    if (!/^[\w-]+(\/[\w-]+)+$/.test(lesson)) return { error: `"${lesson}" isn’t a lesson name like code/apps/practice-tracker.` };
    return { url: LESSON_BASE + lesson + '/lesson.md', id: lesson };
  }
  const t = params.get('tutorial');
  if (!t) return null;
  let url;
  try { url = new URL(t, here).href; } catch { return { error: 'That tutorial link couldn’t be read.' }; }
  if (!ALLOWED.some((re) => re.test(url))) return { error: 'Tutorials open only from Learning Waypoints or its tutorials repo.' };
  return { url, id: url.replace(/^https?:\/\//, '').replace(/\/lesson\.md$/, '') };
}

// The starter project: `file#region` beside the lesson (or inline in it).
export async function loadStarter(tutorial, lessonUrl, fetchText) {
  if (!tutorial.starter) return null;
  const [file, name] = tutorial.starter.split('#');
  const text = tutorial.files[file] ?? await fetchText(new URL(file, lessonUrl).href);
  return JSON.parse(region(text, name));
}
