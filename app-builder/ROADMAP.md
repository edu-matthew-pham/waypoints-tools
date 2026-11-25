# App Builder: what we plan to add, and how

Guiding rules: every addition is **one registry entry** (component or catalog item) plus a test; each is placed in a **level** so
beginners don't see it until needed; and anything that can run without a screen (the interpreter) stays testable in Node.
Years 7–8 are the main audience, not the ceiling: advanced options can be added at higher levels (hidden from beginners)
so the tool can grow with older students and bigger projects (25 Nov 2026).

## 1. Components (the "Add an object" picker)

The picker groups tiles by category and only shows what the current level / lesson allows. Contract (see `core/components.js`):
`id, label, hint, category, base, props` in core; `ICONS[id]`, `RENDER[id].make/write` in `ui/component-ui.js`; a level in
`features.js`; conditions/actions in `catalog.js`. `tests/components.test.js` fails if a step is missed.

| Category | Components | Level | Notes |
|---|---|---|---|
| Basics | Button, Text, Text input *(done)* | 1-2 | |
| Choices | Toggle (on/off), Slider, Dropdown, Checkbox | 2 | Each has a value you can compare and an "on changed" trigger. Reuse `onChanged`. |
| Media | Image (+ asset panel, built-in icons), Emoji/icon | 2 | Assets stored as data URLs in the project file (size cap and warning). |
| Data | List (shows items), Repeater (one row per list item), Gallery | 3-4 | Needs the list value type and "for each" first (section 4). |
| Layout | Stack (row/column), Container, Tabs, Scroll area | 3-4 | Needs children inside containers (section 5). |
| Advanced | Custom HTML widget (sandboxed iframe) | 4 | Escape hatch; talks to events through postMessage. |

## 2. Input events

All new triggers are catalog entries with a `trigger: true` flag, so the existing rules apply (first condition, top level only).
Pointer Events cover mouse, pen and touch with one code path, so nothing depends on a mouse.

| Event | Kind | Level | How |
|---|---|---|---|
| Object **pressed** / **released** | trigger | 2 | `pointerdown` / `pointerup` on the object |
| Object **double-clicked**, **long-pressed** | trigger | 3 | Timer on pointerdown (long press 500 ms) |
| Pointer **enters / leaves** object (hover) | trigger | 3 | Desktop only; hidden on touch devices |
| **Key pressed** `{key}` / **key released** | trigger | 2-3 | Keys offered in a picker: Enter, Escape, Space, arrows, letters, digits. `Enter` in a text input is the beginner case ("submit"). |
| **Key is down** `{key}` | condition, every tick | 3 | Held keys; same mechanism as every-tick events |
| Text input **changed** / **submitted** | trigger | 2 | `onChanged` exists; add `onSubmitted` (Enter) |
| Object **is visible / is hovered / has focus** | condition | 3 | |
| **Swipe** left/right/up/down on screen or object | trigger | 4 | Pointer delta threshold |

Runtime: add `rt.key(name, down)`, `rt.hover(id, over)`, `rt.pointer(id, 'down'|'up')` next to `rt.click`. Keys only reach the
app when the preview has focus, so the preview shows "Click the app, then press keys" until it does. Headless tests feed these
calls directly, just like clicks today.

## 3. Time and chance

| Item | Kind | Level |
|---|---|---|
| **Every N seconds** | trigger | 2 |
| **After N seconds** (once) | trigger | 2 |
| **Wait N seconds, then...** | action | 3 |
| Random number / pick from list | expression function (`random` exists) | 2 |
| Current time / date | expression functions | 3 |

Time runs from the interpreter's tick counter, not the wall clock, so tests are deterministic (`rt.advance(ms)`).

## 4. Data

- **Lists** as a value type: `add / remove / clear / count / item N / for each`. "For each" works like picking: it narrows to one
  item, runs the actions, and sub-events inherit it. The expression language gets `list.count` and `list[1]` (no loops, no eval).
- **Remember between visits** (localStorage-backed variables; fails safe when storage is blocked). *Built 25 Nov 2026.*
- **Tables (records you can see)** *(proposed 24 Nov 2026; built 25 Nov 2026, see README › Tables; paste rows, the highlighted
  row, the linked-table field type and the nested view built the same day)*: a list of records, each row with the same named fields. Construct's
  Array, Dictionary and JSON are invisible until the debugger; here the data shape is always on screen.
  - Sidebar: edited like a small spreadsheet (columns are fields, rows are records).
  - While running: the table's live values show in the sidebar (as variables' values do), the row in use highlighted, so
    For each is seen stepping through rows.
  - A **Table** object shows one on screen; clicking a row works like a list item (ClickedIndex).
  - Expressions `item(Songs, 2).artist`, `LoopItem.artist`; actions add row, set field, remove row, sort by field. No
    built-in filter: filtering is For each + a condition + add a row to a results table (it's the algorithm to learn).
  - Fields are text or number (number makes sort and totals behave); yes/no later.
  - One record alone (a dictionary) shows as a two-column field/value table: no separate concept.
  - Saves as JSON with "Remember between visits". Sheet text gets `table Songs = [title, artist, length] 3 rows` for lesson checks.
  - Full spec and the Data apps course outline: tutorials Project doc `data-apps-and-tables-plan`.
- **Linked tables** *(advanced option, proposed 25 Nov 2026; field type built 25 Nov 2026: Links to <table>, README › Tables)*: two tables joined by a shared value, such as Playlists (name)
  and Songs (title, artist, playlist). "Songs in this playlist" is For each + a condition, as students already know. Later, a
  field type that links to another table (a dropdown of its rows when editing). Relational thinking without nesting; leads
  towards SQL. Higher level only, so beginners never see it.
- **Nested view of linked tables** *(advanced, proposed and built 25 Nov 2026)*: in the read-only JSON view, an option such as
  "Show Songs grouped by playlist" builds the nested version from two linked tables, to look at and copy, never to edit or
  store. Shows "store flat, send nested". Tutorials use it to show the idea; writing that conversion in code stays a task
  for the Python and web courses. Only after linked tables.
- **Grid** *(later idea)*: a table found by row and column number (`cell(Seats, 2, 3)`), for seating plans, bingo cards or
  timetables. Same sidebar editor in a second mode. Only if real projects ask for it.
- **Tables inside tables** (nesting): not planned for now. Hard to show and edit, and expressions get long
  (`item(item(Playlists, 1).songs, 2)`); linked tables cover most needs. Revisit if advanced projects need it.
- **Screen stack**: "Go back" action alongside "Go to screen".
- **Rename** objects, variables and screens with references updated in events and expressions (rewrite identifiers via the tokenizer).

## 5. Layout

Objects get an optional `children` array and a layout mode on containers (stack / free). Stage coordinates stay for free layout;
stack layout ignores x/y and uses gap, padding, alignment. Tabs hold named panels and **keep state** when switching (screens reset;
tabs don't). Scroll areas clip and scroll. Design mode shows a tree in the sidebar for nesting.

## 6. Sound, video, notifications, output (later)

Play sound (built-in set), vibrate, show a toast message, copy text. Each is a small action; sound needs a user gesture first.

- **Sound object** *(proposed and built 25 Nov 2026, README › Sound and Video. FreePD closed in 2025, so the built-in
  pack is eight sounds made in code (CC0, `tools/make-sounds.mjs`); FreePD tracks can be added from a mirror by the
  manual workflow once the mirror is checked)*: plays a sound by name, like the Image object shows a picture.
  - **Built-in starter pack:** about 6–8 short instrumental tracks (trimmed to about 30 s) from FreePD (CC0, no credit
    required; credit kept anyway: title and "FreePD, CC0" beside each), served by the site, so every school gets the same
    tracks with nothing to set up. Works offline, so clips and lesson checks can use it.
  - **Uploads:** a teacher's or student's own audio (a school band, a composition), stored in the project like pictures,
    with a size cap per upload (project storage in the browser is about 5 MB in all; built-in tracks don't count).
  - Actions: play, stop; a "Sound is playing" condition and an "ended" trigger later. A table field can name a track, so a
    playlist row plays its sound when clicked (Data apps course).
- **Video object** *(built 25 Nov 2026, with Open link; Safari/iPad playback of Commons WebM still to check)*: link only, never uploaded (video is too big for project storage).
  - Default source: **Wikimedia Commons** (or any direct video file link, e.g. the Internet Archive or a school's own web
    storage), played in the browser's own player: no ads, no recommendations, no tracking, clear licences. Show the file's
    credit and licence (often CC BY-SA). Check Safari/iPad playback of Commons' WebM files before relying on it.
  - **YouTube** (youtube-nocookie) as an opt-in setting, off by default: a school that is happy with YouTube turns it on.
  - An **Open link** action (new tab) as a fallback that works anywhere.

## 7. Teaching and checking

- Lesson mode tasks: *trace a tick*, *put the events in order* (Parsons), *find the bug*.
- Headless project checks for lesson pages: "click 3 times, then `minutes` should be 30".
- Events -> JavaScript read-only view, then a *Run script* action (Level 4), so students can graduate to code.
- Teacher view: share a project link with `?level=` / `?allow=` / `?lock=1` (done); later, a starter-project link.

## 8. Map view (wireflow) *(proposed 25 Nov 2026, agreed in principle; not built)*

A **Map** tab beside Design and Events: a wireflow of the whole app.
- Every screen as a card with a small live render of its layout; clicking a card opens that screen.
- Arrows drawn **automatically from events**: each `Go to screen` action becomes an arrow from its screen to the target,
  labelled with its trigger (for example "SaveButton is clicked").
- Flags **unreachable** screens (nothing goes to them) and **dead ends** (no way out).
- An **Add screen** button on the map, so every screen can be named before it has content.

Decided:
- **Read-only for links.** No drawing arrows on the map: links come only from ordinary events (a button's
  `is clicked` → `Go to screen`), so students learn the real event from lesson one. Skeleton-first and screen-first both
  work; the map shows whatever exists.
- No separate sketch mode: placing objects with no events is already a UI prototype.

- **A tool, not a method.** The Map shows what exists; it doesn't prescribe how students plan. Teachers can use it for
  skeleton-first planning, alongside a paper plan, for debugging, or not at all. Tutorials use it where it helps (for
  example, spotting a dead end) and leave planning approaches to the teacher's own unit.

Also on the map: **Save a snapshot** (optional) keeps the map as it is now, so it can be shown beside the current app
later with screens and links added, removed or changed highlighted.

Why: debugging (missing links and dead ends at a glance); a picture of the whole app that can't drift from it; checks
(sheet text already holds the screen-change events, so a rule such as "every screen reachable" is cheap).

Later (optional): a **storyboard strip** (click a route through the map, such as Home → Add → Saved, and lay it out left
to right with a caption box under each frame); a per-screen note of which variables and lists it reads or writes
(probably too much for Years 7–8).

## 9. AI help *(proposed 25 Nov 2026; not built)*

Aim: the middle ground between no AI and open-ended vibe coding. Students may get help from AI, but they still add and
understand every event themselves. Same rule as Create in the tutorials: **no AI required; the only AI route is a copyable
prompt.** No API keys, no backend, works with whatever AI the school allows, and every lesson works without it.

Why (checked 25 Nov 2026):
- Research on vibe coding with novices: what helps is how AI use is scaffolded, not access to it. Unrestricted AI lets
  students hand over the thinking that builds understanding; making students explain the code before they can keep it
  roughly halved later failures without AI (77% vs 39% in one 2026 study).
- Classroom tools (for example CodeHS Vibe Coding) offer teacher on/off switches and visibility of AI chats, but nothing
  that makes students explain or limits how much the AI writes. That is left to each teacher.
- Close relatives: MIT Aptly (App Inventor; AI writes the blocks), Cognimates Scratch Copilot, TutoriaLLM (Blockly; AI
  *highlights* the block in the toolbox instead of placing it). TutoriaLLM's maker found children leaned on AI entirely
  when it built the program for them, so he switched to pointing. None of these use event sheets.

Planned, lightest first:
1. **Search by meaning, no AI.** Tag every condition and action with plain phrases ("when clicked", "save between
   visits", "count up"); a search box highlights the matching entry (reuse the `data-ab` labels). Start here.
2. **Copy for AI.** One button copies the current sheet text plus a short guide to App Builder's events and actions, and
   asks the AI to answer in event-sheet terms ("Add: On SaveButton clicked → Add 1 to score"). Students build what it
   suggests themselves. Line under the button: "Use an AI tool your school allows, if your teacher says you can."
3. *(optional, later)* **Paste back.** Paste the AI's reply; App Builder lists the suggested events for students to accept
   **one at a time** (never a one-click import), perhaps with a short "what does this do?" box first.

Not planned: built-in LLM calls (keys, costs, privacy for under-13s, upkeep). An in-browser model for option 1
(Transformers.js, about 20–30 MB) only if plain phrase matching proves too weak.

## Suggested order

1. Toggle, Slider (small, prove the registry).  2. Key pressed + Enter-submits + pressed/released.  3. Timers.
4. Image + asset panel.  5. Lists + for-each + Repeater.  6. Rename.  7. Layout/Tabs.  8. Custom HTML widget and JS view.

## Automation hooks *(done, 24 Nov 2026)*

For lessons, tests and (later) guided tutorials:
- **Stable labels:** every button, menu item, tile, dialog button and field carries `data-ab="..."` (for example `add-event`,
  `add-condition`, `group:System`, `group:object:SaveButton`, `entry:onClicked`, `param:value`, `done`, `tab:events`,
  `object:SaveButton`, `prop:x`, `menu:delete`). Every object on the app itself carries `widget:<Name>` (copies share it; tell
  them apart with `data-id`). Change a label only with the lessons and tests that use it.
- **Open a project from the page:** `?sample=<id>` (and `-start`), `?code=<project JSON>` with `?id=` or `?store=` (each keeps its
  own saved work), or `postMessage({ type: 'appbuilder', cmd: 'start' | 'reset' | 'get', project })` (src/embed.js).
- **Report back:** `{ type: 'appbuilder', event: 'project', project, sheet }` after every change, and for Waypoints lesson steps
  `{ wp: 'run', kind: 'appbuilder', id, quiet, code: sheet }`. `sheet` is one plain line per event (core/sheet-text.js).
- **No drag needed:** arrow keys move the selected object (Shift: 10 px), Alt + arrows resize it, the Properties panel has X, Y,
  Width and Height boxes, and events are reordered from their ⋯ menu.
- Tests: `tools/embed-test.mjs` (also in `npm run test:ui`).

## Considered, not planned

- **Code snippets (HTML/CSS/JS inside App Builder)** *(25 Nov 2026)*: speculative, probably never. Teachers usually move a
  class to text code at a unit boundary rather than mixing the two; "show as code" (a read-only JavaScript view of the
  events) plus the App Builder → web bridge course is the link to text code. If ever revisited: Level 4+ only, run in a
  Web Worker or sandboxed iframe that returns values only (no page access), and expect sheet-text checks not to see inside.

## Later ideas

- **Guided tutorials as Markdown** (like MakeCode tutorials): `## Step` sections with text and hints, `@highlight <data-ab label>`
  to point at a control, and a `wait for:` line matched against the sheet text so the step ticks itself. A generator could draft one
  from any finished project (one step per object, then per event), for a teacher to edit.
- **From Thunkable:** open the app being built on a phone (QR code beside the link, never instead of it), share a finished app as a
  play-only link, and screen templates for prototype lessons. Not native device APIs, app stores or a block editor.
- **Code snippets (HTML/CSS/JS inside App Builder): speculative, probably never** (25 Nov 2026). Classes usually move to
  text code at a unit boundary; the read-only JS view plus a web bridge course is the link. If ever revisited: Level 4+
  only, run in a Web Worker or sandboxed iframe that returns values only, and expect sheet-text checks not to see inside.
