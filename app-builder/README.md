# App Builder (prototype)


A small, no-event-cap tool for prototyping simple apps (Years 7-8). Apps are web pages (800×600) by default;
each project can switch to Phone (390×700). The stage scales down to fit the window. Screens, buttons, text and
inputs, driven by an event sheet: *when this happens, do that*. Runs in the browser, no accounts, no server.

**Use it:** https://tools.learningwaypoints.com/app-builder/  (one self-contained `index.html`; Chrome, Edge, Firefox, Safari)

    cd app-builder && npm test      # headless tests of the interpreter (node:test, no dependencies)
    npm install && npm run build    # rebuilds index.html from src/ (esbuild bundles app.js, style.css is inlined)
    python3 -m http.server 8080     # run locally from the repo root, then open /app-builder/

`src/` is the source; `index.html` is built from it (`tools/build.mjs`) and committed, so the site needs no build step.
Rebuild and commit `index.html` with every change to `src/`.

## Lesson links

Add these to `https://tools.learningwaypoints.com/app-builder/`:

| Link | Opens |
|---|---|
| `?sample=tracker` / `?sample=tracker-start` | Practice tracker: finished / design only (no events or variables) |
| `?sample=chores` / `?sample=chores-start` | Chores checklist |
| `?sample=water` / `?sample=water-start` | Water tracker |
| `?sample=journal` / `?sample=journal-start` | Values journal |
| `?sample=creatures` / `?sample=creatures-start` | Creature stats |
| `?sample=goal`, `?sample=copies` | Other samples (`music` and `practice` still work) |

Combine with `&level=2` (blocks offered), `&allow=onClicked,addTo,setText` (a lesson's own block list) and `&lock=1`
(hides the level switch and Samples menu). Example: `?sample=water-start&level=2&lock=1`. Embedding, stable labels and project reports: ROADMAP.md › Automation hooks.

Each lesson link keeps its own saved work in the browser, so students carry on where they were; **Start again**
(press twice) reloads the original. Save/Open still work for handing in a file.

## Layout

    src/core/expr.js        safe expression parser/evaluator (no eval) + static checker
    src/core/components.js  component registry (data): Button, Text, Text input, List, Table ...; categories, hints, defaults
    src/ui/component-ui.js  icons and how each component is drawn
    src/ui/object-picker.js tile picker for "Add an object"
    src/core/catalog.js     every condition and action: label template, params, one small function
    src/core/project.js     project JSON model and helpers
    src/core/runtime.js     interpreter: triggers, every tick, picking, sub-events, Else, screens
    src/ui/stage.js         draws items as DOM; design mode adds select/drag/resize; pick mode
    src/ui/event-sheet.js   <event-sheet> custom element: edit | readonly, flash(id), pickobject event
    src/state.js            shared state + the few callbacks views use to talk to the shell
    src/history.js          undo/redo as JSON snapshots
    src/run-engine.js       Runner: runs a copy of the project in a Stage, Watch + Problems panels
    src/panels/side.js      project tree (screens > objects > copies) and variables
    src/views/design.js     Design tab: drag-and-drop stage + properties
    src/views/events.js     Events tab: editable sheet beside a live preview; on-screen picker
    src/views/run.js        Run tab: full-size app + read-only sheet that flashes as rows run
    src/views/map.js        Map tab: every screen as a small picture, arrows from Go to screen actions
    src/core/map.js         screenMap(project): links, start, unreachable screens, dead ends (no DOM; tests and checks use it)
    src/core/shared.js      the All screens sheet: which shared events apply to a screen (objects matched by name)
    src/ui/screen-items.js  what the stage draws for one screen (shared by Design and Map)
    src/app.js              shell: top bar, tabs, save/open, wiring
    src/samples.js          Practice tracker, Daily chores
    tests/                  interpreter and features tests

`core/` has no DOM, so it runs in Node: tests today, checking student projects tomorrow.

## Map

The **Map** tab shows every screen as a small picture, with an arrow for each **Go to screen** action, labelled with the
conditions it sits under. Arrows can't be drawn by hand: they come only from events, so the map always matches the app.
When several events go between the same two screens, one arrow sums them up by what starts each event, for example
"6 ways: 4 clicks, 1 timer, 1 check" (kinds: clicks, keys, timers, on start, changes, media ends, and checks for events with
no trigger, tested every tick; a sub-event counts as its parent's trigger). The screen's card lists every event in full.
Screens are laid out by how many steps they are from the first screen (where the app starts); screens nothing leads to sit
in a last column. It notes screens that can't be reached, screens with no way out, and links to a deleted screen, as things
to check rather than errors (a planned screen is "not linked yet"). **+ Add screen** makes a new, empty screen ready to
name, so a class can lay out every screen first; or build one screen at a time. Click a screen to open it.
Open it directly with `?tab=map`. Labels: `tab:map`, `map-add-screen`, `map-card:<screen>`, `map-open:<screen>`.

## Event model (same ideas as an event sheet)

- Trigger conditions (On start of screen, X is clicked, text changes) run the moment it happens.
- Everything else (Every tick, Variable..., compare) is re-checked every tick, top to bottom.
- A condition can *pick* copies of an object; actions and sub-events then use only those.
- Sub-events run only if the parent passed. Actions run before sub-events. Else runs if the event above didn't.
- Go to screen happens after the current event finishes. Variables survive; objects on screens reset.

See [`ROADMAP.md`](ROADMAP.md) for planned components, input events (keyboard, pointer), timers, lists and layout.

Expressions: `&` joins text, `+ - * /` for numbers, `Name.property`, helpers like `round()` and `random()`, and
`if(test, value if true, value if false)` with `= ≠ < ≤ > ≥`. At Level 3+ a **Choose between two values** button in the
guided dialog writes the `if()` from fill-in blanks.

## Adding a feature

Add an entry to `CONDITIONS` or `ACTIONS` in `catalog.js` (label with `{param}` placeholders, params, run/test).
The editor menu, controls, validation and the interpreter pick it up with no UI code.

## Guided editing and levels

- **Guided** (default): events read as clean sentence cards. Click a condition or action to change it in a dialog (fill-in-the-blanks, name chips, validation, pick-on-screen). Click an event to reveal `+ Condition`, `+ Action` and the `...` menu. **Quick edit** keeps the inline controls for confident users.
- **Levels** (`core/features.js`): 1 Starter, 2 Conditions, 3 Copies, 4 Everything. They only change what the add menus and panels *offer*; nothing already built is hidden or removed. Projects without `features` show everything.
- **Lesson allow-lists**: `project.features.allow = { cond: [...], act: [...] }`, or link students in with `?level=1&allow=onClicked,addTo,setText&lock=1`. `lock=1` hides the level switch.
- New catalog entries must be placed in a level in `features.js` (a test fails if one is forgotten).

## Not done yet (ideas, in rough priority)

- Image object + small asset panel (upload, built-in icons)
- Layout: stacks / flex, containers, Tabs component (keeps state; screens reset), scrolling, repeater bound to a list, gallery
- Sandboxed Custom HTML/CSS/JS widget (iframe + postMessage); later a Run script action and a read-only Show as JavaScript view
- Screen stack with Back, a progress bar widget
- Rename objects (and update references); expression autocomplete; condition invert
- `eventsheet` task modes for lesson pages: trace a tick, Parsons ordering, find the bug
- Headless project checks ("click 3 times; count should be 3") for the Waypoints pages
- Touch/tablet testing, accessibility pass

## Licence

**Free for education. Commercial use by permission only.**

- Code: [PolyForm Noncommercial 1.0.0](../LICENSE). Any non-commercial use is allowed, and the licence names educational
  institutions explicitly. Selling it, bundling it into a paid product or running it as a paid service needs written permission.
- Lessons and other written content (when published alongside this tool): CC BY-NC-SA 4.0
  (https://creativecommons.org/licenses/by-nc-sa/4.0/). 
- This is a plain-language summary; the licence text is what applies.

## Tables (25 Nov 2026)

A table is a whole-app variable holding records: one row each, with the same named fields (text or number).
Level 4 (or a lesson allow-list that names a table action). Plan: tutorials Project doc `data-apps-and-tables-plan`.

- **Sidebar:** Tables section with a small spreadsheet per table (type into cells, Tab to move, `+ Row`, `+` for a field,
  the field's menu to rename, change type, move or delete it). `{ } JSON` shows the rows as JSON (read-only).
  While the app runs, the live rows show under it and changed cells flash.
- **Table object** (Data): shows a table, a column per field (Properties: Shows table, Columns to show). Clicking a row
  fires "An item in … is clicked": `ClickedIndex`, `ClickedItem.title`.
- **Events:** For each row in table (LoopItem is the row, `LoopItem.title` one field); Add a row (one box per field);
  Set a field of row N; Remove row N; Clear; Sort by a field (numbers by size, text A to Z ignoring capitals, stable).
  No built-in filter: filtering is For each + a condition + Add a row to a results table.
- **Expressions:** `item(Songs, 2).artist`, `count(Songs)`, `LoopItem.length`, `contains(text, part)`. A variable can
  hold one row (`Set variable NowPlaying to item(Songs, ClickedIndex)`, then `NowPlaying.title`).
- **Remember between visits:** the 💾 toggle on any variable, list or table (level 3+) keeps its value in this browser
  (localStorage, under this copy's own key). Run has **Forget saved data**. Storage blocked: the app still runs.
- **Sheet text:** `table Songs = [title, artist, length] 3 rows (remembered)`; Add a row reads
  `Add a row to table Songs: title = Title.text, length = int(Length.text)`.
- Tests: `tests/tables.test.js`.
- **Paste rows:** paste cells copied from a spreadsheet into any cell (fills from there, adding rows) or use
  **Paste rows** (adds them after the last row). A first row repeating the field names is skipped; a number field given
  text stops the paste and says where.
- **The clicked row** of a Table (or List) object stays highlighted until the data it shows changes.
- **Linked tables (advanced):** a field's menu offers **Links to <table>** (not on the first field). The field then holds
  the other table's first-field value (its key) and is edited with a dropdown; a value that matches no row shows as
  missing. Renaming a key in the sidebar updates the rows that link to it; renaming the table updates the link; deleting it
  turns the field back into text. To the app it is text, so "the songs in this playlist" is For each + a condition.
  Sheet text: `table Songs = [title, playlist (links to Playlists)] 3 rows`.
- **Nested view (read only):** the JSON view of a table that others link to can show it nested ("Songs grouped by
  playlist"): each row with its linked rows inside, to look at and copy. The app still stores the tables flat.

## Sound and Video (25 Nov 2026)

- **Sound object** (Media, level 2+): a play button with the sound's title and credit. Properties: the sound, Listen,
  + Upload sound (up to about 1 MB, kept in the project). Built-in sounds are files in `sounds/` beside App Builder:
  eight of App Builder's own (chime, pop, win, oops, beat, calm, upbeat, sleepy), made by `tools/make-sounds.mjs` and
  released CC0, plus any listed in `sounds/extra.json` (`[{ name, file, title, credit }]`), which App Builder reads at
  start. The manual workflow **App Builder: add FreePD sounds** downloads FreePD tracks (CC0; FreePD closed in 2025,
  so from a mirror you have checked), trims them to 30 s and lists them there.
- **Video object** (Media, level 2+): a link, never an upload. A Wikimedia Commons file page (or any `.webm`/`.mp4`
  link) plays in the browser's own player with a credit link to its page. YouTube (youtube-nocookie) plays only when the
  app's **Allow YouTube links** box is ticked (off by default).
- **Events:** Play (from the start), Stop, Set sound to (a picker), "is playing", "finishes playing"; at level 3,
  Set sound to the one named (an expression, so a table field can name each row's sound: `ClickedItem.sound`); Set video
  to (a link expression); Open link in a new tab. A browser plays sound only after the user has clicked something.
- Sheet text: `object Music (sound) text "" sound calm`, `object Clip (video) text "" link "https://…"`.
- Tests: `tests/media.test.js`.
