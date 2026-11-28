# App Builder (prototype)


A small, no-event-cap tool for prototyping simple apps (Years 7-8). Apps are web pages (800×600) by default;
each project can switch to Phone (390×700). The stage scales down to fit the window. Screens, buttons, text and
inputs, driven by an event sheet: *when this happens, do that*. Runs in the browser, no accounts, no server.

**Use it:** https://tools.learningwaypoints.com/app-builder/  (one self-contained `index.html`; Chrome, Edge, Firefox, Safari)

    cd app-builder && npm test      # unit tests: the interpreter, education layer, files, links (node:test, no browser)
    npm install && npm run build    # rebuilds index.html from src/ (esbuild bundles app.js, style.css is inlined)
    npx playwright install chromium # once, for the browser tests
    npm run test:browser            # browser tests: real Chromium, files from disk (tests/browser/)
    npm run audit:lessons           # every published lesson, guided: a student who only follows the ring
    HEADED=1 SLOWMO=300 npm run audit:lessons water   # watch it in a browser window, slowed down, one lesson
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
(hides the level switch and Samples menu). Example: `?sample=water-start&level=2&lock=1`.
With no lesson link (the plain address, or **New**) everything is offered (Level 4), like a MakeCode or Construct
playground; a lesson link sets its own level. Embedding, stable labels and project reports: ROADMAP.md › Automation hooks.

Each lesson link keeps its own saved work in the browser, so students carry on where they were; **Start again**
(press twice) reloads the original. Save/Open still work for handing in a file.

## Guided tutorials (1.1)

`?lesson=code/apps/practice-tracker` opens App Builder with a step card beside the editor, read straight from that
Waypoints lesson as published on the tutorials site (`<lesson>/source.json`, the file Create's "Make your own version"
reads: `lesson.md` plus `app.json`), so the lesson stays the one source. `?tutorial=<url>` does the same for a lesson
page's address, a `source.json` or a `lesson.md` on learningwaypoints.com, the tutorials repo on GitHub, or localhost
(handy while writing one). With neither, nothing changes.

From the lesson it takes each build step (a `## Step` whose step block has `try: { playground: appbuilder, keep }`;
`### Tasks` become steps of their own) and shows:
- **the step's text**, as on the website (simple Markdown, built as text, never as HTML);
- **a tick** when the step's `check: { type: code, rules }` passes on the sheet text (the lesson page's rules: contains,
  event, lacks). Ticks are worked out from the whole project after every change, so racing ahead ticks later steps and
  undoing un-ticks. Steps without a code check just say "choose Next";
- **an amber ring** on the control to use next, following the lesson clip's clicks and typing in order, with the clip's
  caption beside it. It moves on when the student uses that control; if the control isn't showing, it points at its tab
  or at the control that opens it;
- **Try it ticks** from the clip's `expect:` lines on the running app (preview or Run tab): once the step is built, the
  ring points at what to click in the app, and the tick comes when the app shows the clip's value or the object changes
  from how it was designed (students type their own numbers, not the clip's);
- **watching variables:** then, if the step's text names a variable in bold or italics (*Minutes*), the ring points at
  its live value on the left (or at the Events tab, since values show only while the app runs);
- **Try the finished app:** an App Builder step before the build starts, with its own starter, becomes step 1 with an
  "Open the finished app" button: it runs in a player over the editor, so the student's own app is never swapped.
  Its "Start building" button closes it and moves on.
- **Still to do:** while a step is being built, its check is listed in plain words (a Text input, a Button called
  SaveButton…), each ticking as it's done. For objects the ring follows this list rather than the clip, which may add
  them in another order: Add object, the right tile, then renaming the newest default-named one (Button1 → SaveButton).
  Missing variables come next ("Make a variable called Goal, starting at 8"), since a clip's expressions may use one
  the text asks for. A clip move to another screen comes before both. For events the clip leads: its typing shows
  "Type: …", a dropdown it sets by a letter shows "Choose: …", an Escape it presses points at Cancel, and a dialog it
  finishes with Enter points at Done. The ring scrolls its target into view. When the clip has shown its part and the
  step's text has the rest, the ring points at what's left on the checklist (never at Add event, which would add
  empty events);
- **Step done:** when a step is complete, a green "Step done! Next: …" banner (with its own Next) and a glow; if the card
  is hidden, its Tutorial button turns green. Back and Next stay pinned at the bottom of the card;
- **Stuck?** (closed until opened): the clip's captions as a short how-to, and "Watch how it's done", the lesson's own
  video of that step (`clips/step-N.mp4` beside the lesson page on the tutorials site; only for lessons opened from there).

Nothing is locked: Back, Next and the step dots always work. The tutorial starts from the first build step's starter
(`app.json#start` beside the lesson), keeps its work and step in the browser under its own name, and uses the step's
level. The card can be moved to the other side (it also moves itself off whatever the ring points at), made smaller, or
hidden (a Tutorial button brings it back). On phones it's a strip along the bottom. Steps that aren't App Builder (a quiz) stay on the website. Code: `src/edu/tutorial.js` (reading the
lesson, ticks; no DOM, tested in Node against a copy of the practice tracker lesson) and `src/ui/tutorial-panel.js`.

**The list of tutorials** (1.8): a **Tutorials** button in the top bar (beside Samples; not on locked lesson links)
opens "Guided tutorials". The list comes from the tutorials site, `https://tutorials.learningwaypoints.com/appbuilder-tutorials.json`,
which its full publish generates from every lesson with an App Builder try box (courses in pathway order, lessons in
course order; shape `v: 1`, read by `parseTutorialList` in `src/edu/tutorial.js`). So new lessons appear by
themselves and App Builder keeps no copy. Lessons are grouped by course and unit, with "extra" for optional ones,
"started" for any with work or a step kept in this browser, and "open now". Choosing one opens it with `?lesson=`; the
app being built stays in this browser, as each tutorial keeps its own. Inside a tutorial, "Leave the tutorial" goes
back to normal building. If the list can't be loaded (no internet), the dialog says so; nothing else changes.
Since 1.9 the list shows in **sections**, one at a time as tabs (e.g. First apps, More apps, Data apps), so a long
pathway isn't daunting. A unit in the list may name its section (`"section": "First apps"`); units without one fall in
their course's own section. The dialog opens on the section you're in, else the last one you've started something in.

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
    src/player.js           Player: runs project JSON in a container; only core/ and the stage (a test checks)
    src/run-engine.js       Runner: the editor's Player, adding live values in the sidebar + Problems panel
    src/edu/features.js     levels and lesson allow lists (the education layer; core only carries project.features)
    src/edu/tutorial.js     guided tutorials: a Waypoints lesson.md -> steps, ticks, pointers (no DOM)
    src/ui/tutorial-panel.js  the tutorial's step card and pointer ring
    src/panels/side.js      project tree (screens > objects > copies) and variables
    src/views/design.js     Design tab: drag-and-drop stage + properties
    src/views/events.js     Events tab: editable sheet beside a live preview; on-screen picker
    src/views/run.js        Run tab: full-size app + read-only sheet that flashes as rows run
    src/views/map.js        Map tab: every screen as a small picture, arrows from Go to screen actions
    src/core/map.js         screenMap(project): links, start, unreachable screens, dead ends (no DOM; tests and checks use it)
    src/core/shared.js      the All screens sheet: which shared events apply to a screen (objects matched by name)
    src/core/functions.js   functions: the model and helpers (where one is called, is it a plain list of actions)
    src/core/media.js       media references (media:7f3a09c2): finding them, ref -> loaded URL, data: URL <-> bytes
    src/media-store.js      the media store in IndexedDB: keep, load on start, move old uploads, tidy, forget
    src/project-file.js     Save and Open: .json, or a .zip with project.json + media/
    src/carry.js            Continue on another device: { project, remembered, progress } in a link or a file (no DOM)
    src/drive/              Your drive: config.js (client IDs), oauth.js (sign-in window), onedrive.js, gdrive.js
    src/ui/drive-dialog.js  the Drive dialog (sign in, save, your apps, open)
    auth.html               where Microsoft sends the student back after signing in; privacy.html: the privacy page
    src/core/zip.js         small zip writer (stored) and reader (stored or deflated)
    src/ui/screen-items.js  what the stage draws for one screen (shared by Design and Map)
    src/app.js              shell: top bar, tabs, save/open, wiring
    src/samples.js          Practice tracker, Daily chores
    tests/                  interpreter and features tests

`core/` has no DOM, so it runs in Node: tests today, checking student projects tomorrow. It imports only `core/`, and
the player only `core/` and `ui/` (`tests/layers.test.js`), so the event-sheet engine stays reusable apart from the
editor and the education layer (levels, lessons). Where media comes from (the built-in sound folder, `extra.json`) is
set in `app.js` (MEDIA_SOURCES), not in core.

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

## Functions (Level 4)

A function is a named list of actions any event can call, with parameters: **+ Function** under All screens in the
side panel, then add parameters (`text`) and actions in the Events tab. An event runs it with **Call SaveEntry with
text = Entry.text**; the function's actions run there and then, and the event carries on. Inside, a parameter is a
plain name (`"Saved: " & text`). It works on any screen, with objects matched by name, as in Construct: on a screen
without an object, a check on it is false and an action on it does nothing. The function shows a warning on any part
that uses an object a calling screen doesn't have.

It starts as a plain list of actions. Small buttons on the function's name line open up more when a student needs it:

- **+ Check**: conditions, sub-events and Otherwise inside the function (it becomes a small event sheet, and stays one).
- **+ Give back a value**: adds **Set return value**, so the function can be used as a value: `Total(price, qty)`.
- **Only the picked ones** (Copy picked): the function works on the copies the calling event picked (only the clicked
  Tile) instead of starting with every copy, as in Construct.

Names are single words (they become real function names in code);
a parameter can't share a name with a whole-app variable. A call stops after 50 calls inside calls (a function that
calls itself without a way to stop). The Map follows calls; the sheet text has a `function Name(params)` line.

## Adding a feature

Add an entry to `CONDITIONS` or `ACTIONS` in `catalog.js` (label with `{param}` placeholders, params, run/test).
The editor menu, controls, validation and the interpreter pick it up with no UI code.

## Guided editing and levels

- **Guided** (default): events read as clean sentence cards. Click a condition or action to change it in a dialog (fill-in-the-blanks, name chips, validation, pick-on-screen). Click an event to reveal `+ Condition`, `+ Action` and the `...` menu. **Quick edit** keeps the inline controls for confident users.
- **Levels** (`edu/features.js`): 1 Starter, 2 Conditions, 3 Copies, 4 Everything. They only change what the add menus and panels *offer*; nothing already built is hidden or removed. Projects without `features` show everything.
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
  + Upload sound (up to about 5 MB, kept in the media store, see below; about 1 MB in a browser without it). Built-in sounds are files in `sounds/` beside App Builder:
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

**Colours while the app runs** (1.11, from Level 2): *Set {target} colour to …* for a Box (its fill), a Text (its
words) and a Button (its fill; the label turns white or dark to stay readable), and *Set screen background to …*
(kept across screens until set again; as designed until an event sets it). A colour is a name in quotes (`"black"`,
`"light blue"`) or a code (`"#1c2333"`); anything else is an error in that event, not a crash (`src/core/colour.js`).
Text and Button also get a Colour in Design ("Usual" goes back to the app's own style).

**Toggle: Tick box look** (1.10): Properties › Look: Switch (the default) or Tick box. Either is on or off:
`Toggle.on` is true or false, and *is switched*, *is on* and *Set on* work the same; a tick box suits lists of things
to do, a switch suits settings. It is a real checkbox for screen readers. Sheet text adds "(tick box)". (Note for
lessons: `if()` needs a comparison, so `if(BedJob.on = true, "Done!", "Not yet")`.)

**Show a player** (1.5): a Sound's Properties tick, on by default. Untick it for background music or sound effects: the
Sound takes no space while the app runs and still plays from events (Play, Stop), like Construct's Audio. In Design it
shows faded, labelled "no player: plays from events", so it can still be found and selected. Its credit (the open
licences ask for one) then shows in a line under the running app. The sheet text adds "(no player)".

## Embed (ROADMAP §13, 28 Nov 2026; 1.12, the bridge 1.13; Level 4)

**Embed object** (Media, Level 4): a simulation or tool made as one self-contained HTML file (often by an AI chat, with
App Builder's events built around it), or a website. Properties › Shows: one of the app's **web pages** or **A website
(link)**; **+ Paste HTML** (a box to paste a whole file, and a name) or **+ Upload .html** (up to about 2 MB; about
500 KB with no media store).

- **Pages** live in `project.pages = [{ name, data, size? }]`, like uploads: kept in the media store as
  `text/html;charset=utf-8`, listed under **Web pages (whole app)** in the sidebar (only once there is one), and saved
  in the zip as `embeds/<name>.html`, so they can be opened and edited outside App Builder and opened again. Projects
  without an Embed don't get a `pages` list, so they and their sheet text are unchanged.
- **Sandbox** (`src/ui/component-ui.js`, `PAGE_SANDBOX`): a page runs in an iframe with `sandbox="allow-scripts"` only,
  set before its `src` (the page's object URL). No `allow-same-origin`, so it gets a blank origin of its own and can't
  read App Builder's localStorage or IndexedDB (projects, media, drive sign-in) or reach the page around it; no
  `allow-top-navigation`, `allow-popups` or `allow-forms`. App Builder itself is unchanged: student logic still runs in
  its own interpreter, with no eval; embedded HTML is the only code it didn't write, and only inside that iframe.
  `tests/browser/embed.test.mjs` checks a page that tries all of this gets nowhere.
- **Websites:** PhET, Desmos, GeoGebra and Wikimedia Commons (and their subdomains), https only. Any other site needs
  the app's **Allow any website** tick (off by default, like Allow YouTube links). A website keeps its own origin
  (`allow-scripts allow-same-origin allow-forms allow-popups`: same-origin means its own site there), and gets an
  **Open … ↗** link in its corner for sites that refuse to show inside another page.
- **Design** shows a placeholder (nothing runs while editing); the Run tab and shared apps show the real thing.
- **Share by link:** apps with their own pages, or linking a site off the list, are shared as a file (Share says so),
  so pasted HTML never gets a learningwaypoints.com link.
- Sheet text: `object Sim (embed) text "" page "pendulum" sends period, length listens gravity`; events read
  `when Sim sends period` and `Send gravity = 1.6 to Sim`. Tests: `tests/embed.test.js`, `tests/browser/embed.test.mjs`.
- **The bridge** (1.13, `src/core/embed-bridge.js`): Properties › **Sends** and **Listens for** list the names (`period,
  length`; letters, numbers and _, not the Embed's own x, y, w, h, text, visible, page). The page posts
  `parent.postMessage({ name: 'period', value: 2.01 }, '*')`: **Sim sends period** runs, and `Sim.period` is the latest
  value (an error until it has sent one). **Send gravity = 1.6 to Sim** posts `{ name, value }` to the page (to a
  website only at its own origin). Messages are data: only from that iframe's own window (`ui/stage.js`; a page's origin
  is "null", so the window is the check), only a listed name, only one number, text (up to 1000 letters), true or false;
  nothing in them is evaluated. Level 4.
- **Copy a prompt for an AI chat** (Properties): asks for one self-contained HTML file that sends and listens by these
  names (`embedPrompt`). No AI in App Builder.
- **Sample: Pendulum lab (Embed)**: a ready-made pendulum page (sends period and length, listens for gravity), Earth,
  Moon and Mars buttons, Record reading into a Readings table and a question. `PENDULUM_HTML` in `src/samples.js`.
- Build note: `tools/build.mjs` writes any `<script` inside the bundle as `<\x73cript` (a sample's HTML would otherwise
  stop the page's own script element from closing) and checks index.html has exactly one script element.

## Media store (ROADMAP §10, step 1, 26 Nov 2026)

Uploaded pictures and sounds are kept as files in the browser's IndexedDB (database `appbuilder-media`): this site's
own storage in this browser on this device, nothing sent anywhere, usually hundreds of MB. The project (in localStorage,
about 5 MB) holds only a reference in the upload's `data`, `media:7f3a09c2`, plus its `size`. Older projects and saved
files have a `data:` URL there instead, which still works.

- **Load on start.** IndexedDB answers later, but events need answers now. So when a project opens, App Builder loads
  the files it and its remembered values use into memory (object URLs), then shows it. New uploads are kept in the
  background and show straight away. Events, the stage and the sidebar stay simple and synchronous.
- **Move on open.** Uploads still inside a project (data: URLs) move to the store whenever a project opens: at start,
  Open, a lesson starter, an embedding page.
- **Save** puts uploads back inside the `.json` as data: URLs, so a saved file is complete on its own and opens
  anywhere (a zip with a `media/` folder comes with step 3).
- **Missing files** (a project copied from another computer, or the site's data cleared) show nothing, with a plain
  notice to open a saved file.
- **Tidy** runs once when App Builder opens, never while someone works, so Undo can always bring a picture back. It
  deletes files that no App Builder project or remembered value in this browser points to (every lesson link keeps its
  own) and that are more than a day old (another tab may still be using them).
- App Builder asks the browser to keep its storage (`navigator.storage.persist`; the browser may say no), the sidebar
  shows how much is used, and it warns at 80% full or when a file can't be kept.
- No IndexedDB (blocked, some private windows): uploads stay inside the project as before.
- Browser check used: a one-off Playwright script (old project moves out, picture loads, Save round-trips, new upload,
  Open in a fresh browser, tidy keeps another lesson's file, missing-file notice). See ROADMAP › Testing.

## Drawing and Photo (ROADMAP §10, step 2, 26 Nov 2026; Level 3)

**Choose a photo** (1.5): a button on every Photo, beside the shutter, that opens the device's file picker (images
only, up to about 5 MB like uploads). The picture is shrunk like the camera's photos (at most 1280 px, JPEG), kept in
the media store, shown in the Photo, set as `Photo.picture`, and runs *A photo is taken with*, just like the shutter.
It works with Allow camera off, so it is the way in where cameras are blocked.

**Choose a sound** (1.7): the Recorder's match for Choose a photo. A button in the Recorder's row opens the device's
file picker (MP3, M4A, OGG, WAV, WebM; up to about 5 MB like uploads, and no 20-second limit, so a whole song is fine).
The file is handled like a finished recording: kept in the media store, the trim handles and ▶ appear, `Recorder.sound`
and `Recorder.length` are set, and *finishes a recording* runs. It works with Allow microphone off, so it is the way in
where microphones are blocked.

Pictures made while the app runs. Like an upload, each one is a file in the media store, and the app holds a reference
(`media:7f3a09c2`) that can go in a variable, a list or a table, and is shown by an Image.

- **Drawing**: the user draws with a finger or the mouse. Properties: pen colour, pen size, and a picture to draw on
  (for labelling a photo or a diagram). Actions: Clear, Undo the last line, Set pen colour, Set pen size, Set background
  to the picture in (e.g. `Photo.picture`). Trigger: *is drawn on* (after each line). `Drawing.lines` counts the lines;
  `Drawing.picture` is the drawing (with its background), made when it is read and the same reference until the drawing
  changes, so reading it twice doesn't make two files. An empty drawing gives its background, or "" with none.
- **Photo**: the camera. Off unless **Allow camera** is ticked (project setting, shown in the Photo's properties, like
  Allow YouTube links). Starts only when the user taps it; the browser also asks. A refused or missing camera (some
  school devices block it) gets a plain message on the object. A built-in **take-photo button** (a round shutter, shown once the camera is on; untick *Show a take-photo button* to use your own) runs *A photo is taken with* (only the built-in button runs it, so an event can't loop by taking a photo when one is taken). Action: *Take a photo with*; `Photo.picture` is the last
  photo (a JPEG, at most 640 px), `Photo.ready` is whether the camera is on. The camera turns off when the screen or Run
  stops.
- **Set picture to the one in** (Image): any expression giving a picture: `Drawing.picture`, `ClickedItem.picture`, or a
  picture's name. Anything else is a plain error.
- **Picture fields** in tables: the sidebar cell picks one of the app's pictures; while the app runs a row can hold a
  made picture. Tables, lists and the live table in the sidebar show references as thumbnails.
- How it works: the page holds the pixels; the runtime asks for a picture through `hooks.snapshot(id)` (synchronous:
  the file shows from memory at once and is written to the store in the background, `media-store.js keepNow`). The
  player alone (no store) keeps made pictures as data: URLs. Clear and Undo reach the page as counters (`clearSeq`,
  `undoSeq`), like Play and Stop do for sounds.
- Save keeps them in the zip when "what the app kept while running" is included (see Saving and opening). Forget saved
  data deletes the files only those values used. Browser check used: a one-off Playwright script with Chrome's fake
  camera (draw, keep in a remembered table, photo, reload, camera off on leaving Run, camera not allowed).

## Recorder (ROADMAP §10, step 3, 26 Nov 2026; Level 3)

- Off unless **Allow microphone** is ticked (project setting, in the Recorder's properties). The user taps ● to record
  and ■ to stop; it stops by itself at 20 seconds. The browser asks first; a refused or missing microphone gets a plain
  message on the object.
- After a recording: ▶ plays it, and two handles **trim** the start and end. Trim doesn't change the file: the
  reference gets a play range, `media:7f3a09c2#t=1.2,4.5`, which browsers play as just that part (a media fragment).
  A row kept earlier keeps its own range. The stage reports the end of a trimmed part as the sound ending, so *ends*
  triggers still run.
- Trigger: *finishes a recording*. `Recorder.sound` is the recording (with its trim), `Recorder.length` its length in
  seconds, `Recorder.recording` whether it is recording now.
- A **sound** field type for tables; *Set sound to the one named* takes a recording too (`ClickedItem.sound`). Tables
  and lists show a recording as "🔊 Recording" (the media store knows each file's type, so a recording isn't shown as a
  picture).
- Recordings are WebM/Opus where the browser can (MP4 on Safari). A file nothing uses any more is tidied as usual.

## Saving and opening (ROADMAP §10, step 3, 26 Nov 2026)

- **Save and Save as…** (26 Nov): in Chrome and Edge (File System Access API) the first Save opens the computer's own
  Save box (Google Drive on a Chromebook, a synced OneDrive folder, anywhere), later Saves and Ctrl+S update that same
  file, and Save as… (the ▾ beside Save, Ctrl+Shift+S) always asks. Open uses the Open box, so Save goes back to the
  file you opened. Loading another app, a reload, or the app gaining its first picture (a .json can't hold it) makes the
  next Save ask again. Elsewhere (Safari, Firefox, some embedded pages) Save downloads a file each time, as before.

- **No pictures or recordings:** Save writes `name.app.json`, as before.
- **With them:** `name.app.zip`, an ordinary zip: `project.json` (keeps its `media:` references, plus `mediaFiles`,
  reference -> file and type) and `media/<id>.<ext>` for each file (`src/project-file.js`, `src/core/zip.js`).
- **What the app kept while running** (Remember between visits values, and the drawings, photos and recordings in
  them): when there is any, Save asks, ticked by default; untick it to save just the app (a starter to share). It goes
  in `project.json` as `"remembered": { name: value }`, and Open puts it back for this App Builder.
- **Open** reads `.json` (old ones with data: uploads too) and `.zip`, including a zip someone unzipped and zipped again
  on Windows or macOS (compressed: read with the browser's own DecompressionStream). Each file goes back into the media
  store under its reference; if this browser has a different file under that reference, it gets a new one and the
  project is updated. With no media store, files go inside the project as data: URLs.
- The zip code is hand-written (store-only writer, no dependency; Matthew, 26 Nov). If odd zips ever cause trouble, the
  fallback is the fflate library. Tests: `tests/zip.test.js` (including a compressed zip and damage).

## Run and Stop (26 Nov 2026)

While the app runs, the Run tab reads **■ Stop**; clicking it stops the app and goes back to the tab you came from.
Restart (on the Run tab) starts it again from the beginning. Leaving the Run tab any other way also stops it.

## Versions (26 Nov 2026)

`src/version.js` holds the version, shown under the sidebar and written into saved files (`"appBuilder"` in
`project.json`). **v1 (git tag `app-builder-v1`) is what the tutorials are built on**: they copy App Builder in from that
tag once, and main keeps moving without touching lessons or clips. Fixes to v1 are 1.0.1, 1.0.2… (tag
`app-builder-v1.0.1`…), taken into the tutorials only when a lesson needs them (each copy re-records every App Builder clip).
New features are 1.1, 1.2…. Promise: projects saved in v1 keep opening in later versions. `tests/v1-compat.test.js` opens and
runs a frozen v1 project (`tests/fixtures/v1-project.json`, made by `tools/make-v1-fixture.mjs`) and checks its sheet text,
which the tutorials' lesson checks read. If it fails, add an upgrade step in `checkProject`; don't edit the fixture.

## Recent apps and Undo after New (26 Nov 2026)

Loading another app (New, a sample, Open, Start again, a recent app) never loses the one you had: it goes into **Recent**
(the toolbar button beside Open; the last 5 apps, kept in this browser under `<store key>.recent`, so the media tidy-up
keeps their pictures and sounds), and **Undo** straight after brings it back. Empty apps aren't kept. Locked lesson links
show no Recent button.

## Share by link (26 Nov 2026)

**Share** (toolbar) makes a link with the whole app inside it, after the `#`, compressed (`src/core/share-link.js`;
deflate-raw with CompressionStream, base64url): nothing is uploaded and there's no server. `index.html#play=…` opens
just the working app, full size (`src/play-page.js`, the Player only), with Restart and **Open a copy in App Builder**
(`#open=…`: loads it as the viewer's own copy; their current app goes to Recent). The original never changes; a changed
app needs a new link. A shared app's Remember between visits data stays in each viewer's browser (its own key per link).
Apps with their own pictures or sounds (uploads, recordings) are too big for a link: Share says so and offers Save.
So are apps with their own web pages (Embed), or an Embed linking a site off the usual list.
Typical links are 1–3k characters; over 8k, the dialog warns that some chat apps cut long links. Inside the tutorials,
the link points at the tutorials site's copy of App Builder, so a student can send a teacher their app from a lesson.

## Continue on another device (26 Nov 2026)

For carrying on at home or on another computer, with no accounts and no server (`src/carry.js`). One shape travels:
the app, what Remember between visits kept, and, in a guided tutorial, the step and what's been tried
(`progress`: `{ tutorial, link, step, tried, title }`, read from the tutorial panel's own keys).
- **Other device** (toolbar) makes a link, `<the tutorial's address>#continue=…`, plus a QR code for tablets (links up
  to 2,000 characters; `qrcode-generator`, MIT, bundled). Opening it loads the app as the student's own (the app they
  had on that computer goes to Recent), puts back what it kept, and carries on at the same tutorial step. It's a copy
  made at that moment: nothing syncs back.
- Apps with their own pictures or recordings (or kept data holding them) don't fit in a link: Other device offers Save,
  suggesting the student's OneDrive or Google Drive folder, then Open… on the other computer.
- **Saved files carry the step too** (`progress` in `project.json`, beside `remembered`). Opening one in the same
  tutorial carries on at that step. Opened anywhere else (plain App Builder at home, say), App Builder asks: **Go to the
  tutorial** (the app, its kept data and the step are put in place for that tutorial's page first, and anything already
  being built there goes to that page's Recent) or **Just the app**. Older files and links without progress open as
  before.
- Signing in to save straight to a student's own drive could come later as one more place for the same shape
  (ROADMAP › Sign in to save to your drive).

## Your drive: OneDrive and Google Drive (26 Nov 2026)

Like Construct 3's cloud saving: students sign in with Microsoft or Google only to let App Builder use their own drive.
No App Builder accounts, no server, nothing kept by App Builder (`privacy.html`).
- **Save ▾ and Open ▾** (toolbar) offer each drive that has a client ID in `src/drive/config.js`, beside this
  computer: Save to OneDrive… / Save to Google Drive… / Save to this computer…, and Open from… the same. (No client
  IDs: Save and Open work as before.) The account and **Sign out** are in both menus and the dialog.
  - A drive's dialog signs in first if needed. **Save** mode: save as a new app (a name, the app's own by default;
    a number is added if it's taken) or **Save over** one already there (asks first; the file keeps its name).
    **Open** mode: the apps there, each with Open.
  - Both list a 🗑 **Delete** for each app: it asks, then moves it to the drive's bin (OneDrive recycle bin, Google
    Drive bin), never deleting it for good.
  - **Save** (and Ctrl+S) goes back to wherever the app was last saved or opened: a drive file or a file on this
    computer. Not saved anywhere yet, it opens the Save ▾ menu. Ctrl+Shift+S opens the menu.
  - A drive save holds everything Continue does: the app, what it kept, the tutorial step.
- **Where files go:** an App Builder folder in the student's own drive.
  - OneDrive asks for `Files.ReadWrite.AppFolder` (Apps/App Builder). Microsoft's docs disagree on whether school
    accounts allow it, so if one refuses, the dialog asks once more for `Files.ReadWrite` and uses the same folder by
    path.
  - Google asks for `drive.file` (only files App Builder made) and keeps them in a folder called App Builder.
- **Sign-in:**
  - Microsoft: the authorization code flow with PKCE for a single-page app, by hand (no library). The sign-in window
    returns to `auth.html`, which hands the code back to the page and closes.
  - Google: Google Identity Services, loaded from Google only when a student chooses Google. Google gives a page no
    lasting token, so after an hour the student signs in again (usually one click).
  - Tokens are kept in `sessionStorage`, so closing the tab on a shared computer signs out.
- **Schools:** an admin may have to allow App Builder first. The dialog says so when a sign-in is refused for that
  reason, and Save to a file still works.
- Tests: `tests/drive.test.js` (against a pretend network). Signing in itself needs real registrations.

### Getting the client IDs

Register with an account you own (not a school account), since the tool is yours. Client IDs aren't secret: they go
in `src/drive/config.js`.

**Microsoft (Microsoft Entra)**
1. You need a directory (tenant): a personal Microsoft account alone can't register apps any more. Sign up for a free
   Azure account (azure.microsoft.com/free) with your personal Microsoft account; it makes a Default Directory with
   you as its admin. (Or use an existing tenant you own.)
2. Go to entra.microsoft.com › Applications › App registrations › **New registration**.
   - Name: App Builder (students see this when they sign in).
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**. Choose
     this now: it is hard to change later.
   - Redirect URI: platform **Single-page application (SPA)**,
     `https://tools.learningwaypoints.com/app-builder/auth.html`.
3. Register. On the Overview page, copy **Application (client) ID**: that's the client ID.
4. Authentication: add more SPA redirect URIs for every other address App Builder runs at, each ending in
   `auth.html` (for local testing, `http://localhost:8765/app-builder/auth.html`; the tutorials site's copy, if it
   offers Drive). No client secret, and leave implicit grant off.
5. API permissions › Add › Microsoft Graph › Delegated: `Files.ReadWrite.AppFolder`, `Files.ReadWrite`,
   `offline_access`, `openid`, `profile`. Don't grant admin consent for your own directory: schools grant it in theirs.
6. Branding: home page `https://tools.learningwaypoints.com/app-builder/`, privacy
   `https://tools.learningwaypoints.com/app-builder/privacy.html`.
7. Test with your personal Outlook account (no one else's approval needed), then a CGGS account: CGGS's admin will
   probably have to consent first. For other schools, Microsoft's publisher verification (a free Microsoft Partner
   ID) makes the sign-in screen show you as a verified publisher.

**Google (Google Cloud)**
1. console.cloud.google.com with your own Google account › new project "App Builder".
2. APIs & Services › Library › enable **Google Drive API**.
3. Google Auth Platform (OAuth consent screen):
   - Audience **External**, app name App Builder, your email.
   - Home page and privacy page as above; authorised domain `learningwaypoints.com`.
   - Scopes: `drive.file`, `openid`, `email`, `profile`.
   - Leave it in **Testing** and add test users (up to 100) by email. No Google verification is needed while testing.
4. Clients › Create client › **Web application**.
   - Authorised JavaScript origins: `https://tools.learningwaypoints.com` (and `http://localhost:8765` for local
     testing). No redirect URIs needed.
   - Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. Before other schools use it: publish the app, and Google's brand verification (name, logo, privacy page).
   `drive.file` is a non-sensitive scope, so no security assessment. Google Workspace for Education admins have to
   allow App Builder for under-18 accounts.

