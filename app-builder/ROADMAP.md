# App Builder: what we plan to add, and how

Guiding rules: every addition is **one registry entry** (component or catalog item) plus a test; each is placed in a **level** so
beginners don't see it until needed; and anything that can run without a screen (the interpreter) stays testable in Node.
Years 7–8 are the main audience, not the ceiling: advanced options can be added at higher levels (hidden from beginners)
so the tool can grow with older students and bigger projects (25 Nov 2026).

## 1. Components (the "Add an object" picker)

The picker groups tiles by category and only shows what the current level / lesson allows. Contract (see `core/components.js`):
`id, label, hint, category, base, props` in core; `ICONS[id]`, `RENDER[id].make/write` in `ui/component-ui.js`; a level in
`edu/features.js`; conditions/actions in `catalog.js`. `tests/components.test.js` fails if a step is missed.

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

## 8. Map view (wireflow) *(proposed 25 Nov 2026; built 26 Nov 2026 except Save a snapshot)*

Built: Map tab (all levels), screen cards with a small picture, arrows from `Go to screen` labelled with their conditions
(routes that would pass behind other screens go underneath), Start / Can't be reached / No way out / Not linked yet flags and a
plain list of things to check, + Add screen, click to open. `core/map.js` (`screenMap`, `mapProblems`) has no DOM, so lesson
checks can use it. Not yet: Save a snapshot, storyboard strip. Notes are shown as things to check, not errors, so planning
screens first doesn't look wrong.


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

## 10. Make your own media *(proposed 26 Nov 2026, agreed with Matthew; steps 1–3 built 26 Nov: the media store, Drawing and Photo, Recorder with trim, zip Save and Open; README › Media store, › Drawing and Photo, › Recorder, › Saving and opening. Recording video: not planned, see point 2)*

Settled with Matthew (26 Nov 2026): load the media an app uses into memory when it opens and keep new media in the
background (events stay instant); move uploads out of a project whenever it opens, keeping data: URLs readable; camera
and mic switched on per app by a project setting in Design (like Allow YouTube links); a hand-written zip (store-only
writer, Open also reads compressed zips with the browser's own DecompressionStream). If odd zips ever cause trouble,
the fallback is the fflate library (about 8 KB, MIT notice to ship with it).

Apps where the user makes the content: a drawing gallery, a plant or science photo log, voice notes, a sound board.
The same principle as tables: a row holds a *reference* to a picture or recording, and the file lives elsewhere, the way
real apps and databases keep images. Construct 3 covers the same ground (Drawing Canvas, User Media for camera and mic,
its Local Storage plugin on IndexedDB, `.c3p` projects as a zip with image and sound folders), so this keeps App Builder
a fair stepping stone to it.

1. **Media store.** Pictures and recordings are kept in IndexedDB (site data for this site only, like localStorage: in
   the browser profile on that device, nothing sent, not the cache; usually hundreds of MB rather than about 5 MB, and
   files rather than base64 text). Table fields and lists hold a short reference, `media:7f3a`, shown as a thumbnail or a
   play button in the sidebar and the JSON view. Variables and text or number tables stay in localStorage (instant to
   read, so the runtime stays simple). Uploaded pictures and sounds move there too (today they sit in the project as
   data: URLs and can fill the 5 MB). Media nothing points to any more is tidied up. Ask for persistent storage; show
   how much is used and warn before it runs out.
2. **Make media**, in this order: a **Drawing** object (pen, colours, clear, undo; `Drawing.picture`) and a **Photo**
   object (camera snapshot, shrunk to a small JPEG) with a **picture** field type and **Set image to** an expression
   (`ClickedItem.picture`); then a **Recorder** object (record, stop, play back; a time cap of about 10–20 s) with a
   **sound** field type, played by Set sound to the one named (taking a reference too); video last, as it is several
   MB a minute. *(Built 26 Nov except video. The Recorder caps at 20 s and has a basic trim: a play range on the
   reference, `media:7f3a09c2#t=1,4.5`, with no re-encoding. Recording video is not planned (Matthew, 26 Nov): other tools,
   or perhaps a separate tool of its own one day; App Builder keeps video link-only.)*
3. **Save and Open** (option 2: design plus the data made while running). Save writes one zip: `project.json` (rows
   say `picture = media/7f3a.png`) plus a `media/` folder; plain JSON as now when there is no media. A tick box chooses
   "include data made while running" or design only (a teacher sending out a starter). Open puts each file back into
   IndexedDB, giving it a new id (and updating the rows) if that id is taken. A student hands in one file with the app
   and what they made with it. *(Built 26 Nov: Save asks only when something was kept; Open also reads zips
   re-compressed on a computer.)*
4. **Privacy and school rules.** Camera and mic are off unless the teacher turns them on for the app (like Allow YouTube
   links); the browser asks permission and some school devices block it, so say so plainly when it does. Media stays in
   that browser; Forget saved data clears it. Lessons use photos of objects and made-up recordings, not students' faces
   or personal stories. Shared computers that wipe profiles at log-out lose it all: Save is the backup.

## 11. Sharing events between screens *(proposed and agreed 26 Nov 2026)*

Construct has two ways to avoid writing the same events again: **functions** and **including one event sheet in another**.
App Builder has neither yet, so a Home button on four screens needs the same event four times. Both are smaller jobs than
§10, so they go first (Matthew, 26 Nov 2026).

**All screens sheet** (Level 3+; *built and live 26 Nov 2026*). One extra event sheet whose events run on every screen, alongside that screen's own
(they run first). It covers the usual reasons for an include (shared navigation, a timer, key shortcuts) without students
managing which sheet includes which. Objects are matched **by name** (option a): "HomeButton is clicked → Go to screen
Home" works on every screen that has a HomeButton. An event that mentions an object the current screen doesn't have is
skipped on that screen (quietly: it isn't a mistake). Shared objects (one HomeButton drawn on every screen, like
Construct's global layers) were considered and left for later: they need new Design tab and layer work. The Map draws a
shared Go to screen as an arrow from each screen it applies to.

**Functions** (Level 4, advanced; *design agreed 26 Nov 2026; built and live 26 Nov, see README › Functions*). Whole-app, named, with parameters: "Define function
SaveEntry(text)", then an action "Call SaveEntry with …". Matches Construct's functions, with less switched on at first:
- **Where:** a Functions row in the side panel under All screens; each function opens in the Events tab.
- **Body:** a small event sheet (conditions, sub-events and Else allowed). Students first see it as a list of actions
  (a sequence); sub-events inside functions are switched on later, like Else and sub-events now.
- **Built now, switched on later:** return values ("Set return value", then `Total(price, qty)` as a value) and
  **Copy picked** (the function works on the objects the calling event picked, e.g. only the clicked Tile; off by default,
  so a call starts fresh, as in Construct).
- **Parameters** have no type, like variables (so §10 media references pass through). Inside the function they are plain
  names (`text`) and can't share a name with a whole-app variable. Objects are not passed in: Copy picked does that job.
- **Objects** are matched by name, like All screens: actions on an object the calling screen doesn't have are skipped quietly.
- **Names** are single words (`SaveEntry`), so they become real function names in "show as code".
- **Not planned:** asynchronous functions (App Builder has no Wait; things that take time end in a trigger, like "has
  ended"), mapped functions, object-only custom actions.
- The Map follows calls: a function that goes to a screen gives an arrow from every screen that calls it.

**Families (later, Level 4).** A family groups different objects (HomeButton, SaveButton, BackButton as `MenuButtons`) so
one event works on all of them, as in Construct 3 (note: families have been limited to paid Construct licences, so check
before relying on them in a Construct unit). Groups that change while the app runs use object variables instead (`selected
= true`), so no separate tags or HTML-style classes. Plan ahead now: objects and families share one set of names (rename
checks cover both), and an All screens event that mentions a family runs on a screen with any of its members. In "show as
code" a family becomes an HTML class. Also plan class projects that use families (Matthew, 26 Nov 2026).

**An object on every screen (later; idea agreed 26 Nov 2026).** Like Construct's Global objects, but suited to apps: add
an object once (a nav bar, header, Home button, later a Sound that keeps playing) and it appears on every screen as one
copy that keeps its text, position and variables when the screen changes. Pairs with the All screens sheet (shared
object + shared events). Now, objects reset when you go to a screen; whole-app variables and All screens events cover
most needs, so this waits. Check then: how it shows in Design (edited once, not per screen), a screen that hides it, and
names (it would clash with a same-named object on a screen).

## 12. An everyday tool, like Word or Sites *(idea, 26 Nov 2026, Matthew; not planned in detail)*

Taught in Year 7, then used by any student in any subject, the way they use Word, Excel or Google Sites: a science data
logger, a revision quiz, a budget, a timeline. No accounts, so school approval is easier. Gaps, biggest first:
1. **Share by link.** A link that opens just the working app (the standalone player, `src/player.js`). Most apps fit in
   the link itself, compressed after `#`, so no server; apps with photos or recordings need the file (or 2).
2. **Work in one browser.** Projects live on one device unless saved; saving to Google Drive or OneDrive would close the
   gap without App Builder running accounts.
3. **Easy layout and good-looking defaults** (§5; and the visual refresh before v1).
4. **Templates:** a gallery of starting points (quiz, tracker, photo log), fed by the samples plan.
5. **Teacher confidence:** a "for teachers" page (what it is, privacy, collecting work) and time being reliable in class.
6. **iPad and phone,** at least for running apps.

## Suggested order

Done (24–25 Nov 2026): toggle, slider, keys, timers, image and assets, lists, tables, linked tables, nested view, paste
rows, Sound and Video. Next (26 Nov 2026, Matthew: both are useful whatever classes say; map view first as the smaller job):

1. §8 Map view (built and live 26 Nov; snapshot still to do).
2. §11 All screens sheet (built and live 26 Nov), then §11 Functions (built and live 26 Nov; agreed 26 Nov: smaller than media, help every app; media doesn't need
   them and they don't need media).
3. §10 media store in IndexedDB (built 26 Nov; upload caps raised from about 1 MB to about 5 MB for pictures and sounds).
4. §10 Drawing and Photo, with the picture field and Set image to an expression (built 26 Nov; Level 3).
5. §10 Recorder and the sound field (with a basic trim: start and end marks, no re-encoding; Matthew 26 Nov: useful if cheap); zip Save and Open with the data made while running (built 26 Nov).
6. §9 AI help, once how AI is used in class is decided.  7. Layout and tabs, yes/no fields, Grid.
Alongside: Data apps tried with a class; its feedback can reorder this.

## Testing *(flagged 26 Nov 2026, Matthew: later)*

Now: `npm test` covers the logic (running events, expressions, renames, sheet text, map, levels) with no browser,
which is where most risky behaviour is. Gaps: nothing tests the editor itself (side panel, dialogs, Events tab), the
built `index.html` isn't checked against `src/`, and tests only run when someone remembers. The README's
`npm run test:ui` / `tools/embed-test.mjs` don't exist in the repo (out of date, or lost).

1. **A check on every push** (GitHub Actions, about 20 minutes to set up): run the tests, rebuild, fail if
   `index.html` is out of date. Worth doing first once several chats push to main.
2. **A few browser checks** (5–10) using the `data-ab` labels: add an event, make and call a function, run, check
   the result. Before a class trial, when an editor bug costs a lesson.
3. **Golden sheet text** for the samples plus a project with functions, so wording changes that lesson checks rely
   on can't slip through.

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

## Core kept reusable *(26 Nov 2026, Matthew: small, low-priority; Project doc handoff-app-builder-core-split)*

Keep the event-sheet core usable apart from the education tool (in case it ever leads to a separate low-code product).
Done 26 Nov, with no change to behaviour or the project format: levels moved to `src/edu/features.js`; `src/player.js`
runs a project with only `core/` and the stage (the editor's Runner wraps it); the sound folder and extra list are
set in `app.js`; `tests/layers.test.js` keeps core and the player from reaching the editor or `edu/`.
Left, on purpose:
- `core/project.js` still writes `features: { level: 4 }` into new and older projects. That is part of the project
  format, so it stays; core just carries it. A separate product could ignore it.
- `videoSource` (core/assets.js) still knows Wikimedia Commons and YouTube link forms. That is link recognition rather
  than a list of media, so it stays in core; which sources are allowed is already a project setting (Allow YouTube links).
- Lesson URL settings (`?level`, `?allow`, `?lock`, `?sample`) and the Waypoints embed messages stay in the app shell
  (`app.js`, `embed.js`), which is the education tool.

## Considered, not planned

- **Editing media** (Matthew, 26 Nov 2026): picture editing fits (drawing on a picture is built; simple edits such as crop
  or rotate could come later). Sound and video editing is left to tools made for it (Audacity, an online trimmer), then
  uploaded or linked: no point reinventing them. The one exception is a basic trim of recordings (§10 step 5).
- **Recording or uploading video** (Matthew, 26 Nov 2026): video is a hook, not a necessity, for learning to build
  apps. A size cap only works with compression on upload, and compressing in the browser isn't cheap (real-time
  re-recording, WebCodecs plus an MP4 muxer, or ffmpeg.wasm at ~30 MB). So App Builder keeps video link-only. A
  **separate video tool** might be worth more anyway: students sharing videos for discussion, or questions placed in a
  video (like Edpuzzle). Note that sharing between students needs a server, unlike today's tools, which keep
  everything in the browser.

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
