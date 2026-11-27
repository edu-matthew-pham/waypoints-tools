---
order: 5
unit: saving
title: A journal with drawings
summary: "Give every journal entry its own drawing: a table Entries with a picture field, a row added for each entry, a Table on the Journal screen with a thumbnail per row, and a click to see one big. Remember it between visits, tidy away the old list, and hand it in as a file with the drawings inside."
language: maths
shape: build
hook: "A photo app keeps every photo with its date and place, not just the latest one. A table with a picture field does the same: one row per entry, and the picture is part of the row."
pacing: { keyDelayMs: 40, cursorMs: 500, afterActionMs: 300, postRollMs: 1200 }
voice: { name: af_heart, speed: 1.1 }
app:
  command: node "$REPO_ROOT/tools/serve.mjs" "$REPO_ROOT/dist/_playground-appbuilder" 8764
  url: http://127.0.0.1:8764/index.html
  readySelector: "[data-ab='tab:design']"
  layout: full
---
In App Builder apps, the values journal learnt to keep a drawing, but only the latest one: draw a heart, then a star, and the heart is gone. One variable holds one thing.

Today every entry keeps its own drawing, in a **table**:

| value | note | drawing |
|---|---|---|
| Courage | asked a question in class | (a picture) |
| Kindness | helped a friend | (a picture) |

A **picture field** holds a picture in each row, just as a text field holds text. The table shows it as a small thumbnail.

## Try the finished app

```step
stage: info
insight: "Seeing each row keep its own drawing, and survive a Restart, shows what the table adds before building it."
try: { playground: appbuilder, starter: "app.json#try", tab: run, level: 4, height: 680 }
check: { type: reflect, text: "I added two entries with different drawings, clicked each row to see its drawing big, then pressed Restart and they were still there." }
```

Add two entries with different drawings. On the Journal screen, click each row: its drawing shows big underneath. Then press **↻ Restart**: the entries are still there.

If you didn't do *Draw how you showed it* in App Builder apps, this is the same values journal: Choose a value, Describe it (with a drawing), see your Journal.

## Build 1: a table with a picture field

```step
stage: run
app: true
query: { code: "@app.json#start", level: 4, id: drawings-1 }
caption: "A picture field"
clip:
  - caption: { text: "A table for the entries: type its name, then +.", say: "A table for the entries. Type its name, then plus." }
  - type: { selector: "[data-ab='new-table-name']", text: "Entries" }
  - click: { selector: "[data-ab='new-table-add']" }
  - caption: { text: "Three fields: value, note and drawing.", say: "Three fields. Value, note and drawing." }
  - click: { selector: "[data-ab='field-menu:Entries.name']" }
  - click: { selector: "[data-ab='menu:rename']" }
  - type: { selector: "input[aria-label='Field name']", text: "value" }
  - press: Enter
  - click: { selector: "[data-ab='add-field:Entries']" }
  - type: { selector: "input[aria-label='Field name']", text: "note" }
  - press: Enter
  - click: { selector: "[data-ab='add-field:Entries']" }
  - type: { selector: "input[aria-label='Field name']", text: "drawing" }
  - press: Enter
  - caption: { text: "drawing holds pictures, so choose Picture.", say: "Drawing holds pictures, so choose Picture." }
  - click: { selector: "[data-ab='field-menu:Entries.drawing']" }
  - click: { selector: "[data-ab='menu:picture']" }
  - expect: { selector: ".side", contains: "drawing" }
  - wait: 1200
insight: "A field's type says what each row holds there; a picture field is how a table keeps a drawing with every row."
try: { playground: appbuilder, starter: "app.json#start", keep: build, level: 4, height: 680 }
check:
  type: code
  text: "A table Entries with fields value, note and drawing (drawing set to Picture: it shows 🖼)."
  rules: { contains: ["table Entries = [value, note, drawing]"] }
```

1. On the left, under **Tables**, type *Entries* and click **+**.
2. Click the field *name*, choose **Rename**, and call it *value*.
3. Click **+** beside the fields to add *note*, then *drawing*.
4. Click *drawing* and choose **Picture**. It shows 🖼 instead of abc.

No rows yet: the app will add them.

## Build 2: add a row for each entry

```step
stage: run
insight: "One Add a row action keeps the value, the words and the drawing together, so they can't get out of step."
try: { playground: appbuilder, starter: "app.json#sol-step-2", keep: build, level: 4, height: 680 }
check:
  type: code
  text: "When Add is clicked, a row is added to Entries with the value, the note and the drawing."
  rules: { event: [["when AddButton is clicked", "Add a row to table Entries", "value = Chosen", "note = NoteInput.text", "drawing = Drawing.picture"]] }
```

1. Open the **Describe** screen's events. In **AddButton is clicked**, add an action before *Go to screen*: **Tables**, **Add a row to** Entries.
2. Fill in its fields: value `Chosen`, note `NoteInput.text`, drawing `Drawing.picture`
3. Run it and add an entry. Watch Entries on the left: a row appears, with a thumbnail.

The old list and LastDrawing still work for now. You'll tidy them away once the table does their job.

## Build 3: show the table, see one big

```step
stage: run
app: true
query: { code: "@app.json#sol-step-3", level: 4, id: drawings-3 }
caption: "A Table, and a click on a row"
clip:
  - click: { selector: "[data-ab='screen:Journal']" }
  - caption: { text: "On the Journal screen, the List goes: a Table shows every field.", say: "On the Journal screen, the List goes. A Table shows every field." }
  - click: { selector: ".side [data-ab='object:List']" }
  - click: { selector: "[data-ab='delete']" }
  - click: { selector: "[data-ab='add-object']" }
  - click: { selector: "[data-ab='kind:table']" }
  - click: { selector: ".side [data-ab='object-menu']" }
  - click: { selector: "[data-ab='menu:rename']" }
  - type: { selector: ".side input.rename", text: "EntriesTable" }
  - press: Enter
  - caption: { text: "Where the list was: x 229, y 110, width 342, height 210. Shows: Entries.", say: "Put it where the list was. It shows Entries." }
  - type: { selector: "[data-ab='prop:x']", text: "229" }
  - press: Tab
  - type: { selector: "[data-ab='prop:y']", text: "110" }
  - press: Tab
  - type: { selector: "[data-ab='prop:w']", text: "342" }
  - press: Tab
  - type: { selector: "[data-ab='prop:h']", text: "210" }
  - press: Tab
  - click: { selector: "[data-ab='prop:source']" }
  - press: ArrowDown
  - press: Enter
  - caption: { text: "A row is clicked: show its drawing in LastImage, from ClickedItem.drawing.", say: "When a row is clicked, show its drawing. ClickedItem dot drawing." }
  - click: { selector: "[data-ab='tab:events']" }
  - click: { selector: ".view-events [data-ab='add-event']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-condition']" }
  - click: { selector: "[data-ab='group:object:EntriesTable']" }
  - click: { selector: "[data-ab='entry:onItemClicked']" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-action']" }
  - click: { selector: "[data-ab='group:object:LastImage']" }
  - click: { selector: "[data-ab='entry:setImageFrom']" }
  - type: { selector: "dialog[open] [data-ab='param:value']", text: "ClickedItem.drawing" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - expect: { selector: ".view-events event-sheet", contains: "ClickedItem.drawing" }
  - caption: { text: "Next, in On start: count Entries, and delete the old LastDrawing action.", say: "Next, in On start, count Entries, and delete the old LastDrawing action." }
  - wait: 1500
insight: "ClickedItem is the row that was clicked, so ClickedItem.drawing is that entry's own picture, whichever row it is."
try: { playground: appbuilder, starter: "app.json#sol-step-3", keep: build, level: 4, height: 680 }
check:
  type: code
  text: "The Journal shows Entries in a Table, counts Entries, and clicking a row shows that row's drawing in LastImage."
  rules: { contains: ["object EntriesTable (table) text \"\" shows Entries"], event: [["when On start of screen", "count(Entries)"], ["An item in EntriesTable is clicked", "Set LastImage picture to the one in ClickedItem.drawing"]] }
```

1. Open the **Journal** screen. Click the **List** and delete it.
2. **+ Add object**, **Table**. Rename it *EntriesTable*, put it where the list was (x 229, y 110, width 342, height 210), and set **Shows** to Entries.
3. In **On start of screen**, change the Count to `"Entries: " & count(Entries)` and delete *Set LastImage picture to the one in LastDrawing*.
4. Add an event: **EntriesTable**, **An item in EntriesTable is clicked** → **LastImage**, **Set LastImage picture to the one in** `ClickedItem.drawing`
5. Run it, add two entries, and click each row.

## Build 4: remember it, then tidy up

```step
stage: run
insight: "Remembering the table keeps every entry and drawing between visits; deleting the old list and variable leaves one place for each entry, so nothing can get out of step."
try: { playground: appbuilder, starter: "app.json#sol-step-4", keep: build, level: 4, height: 680 }
check:
  type: code
  text: "Entries is remembered between visits, and the old Journal list and LastDrawing are gone."
  rules: { contains: ["table Entries =", "(remembered)"], lacks: ["list Journal", "LastDrawing"] }
```

1. Click the **💾** beside *Entries*, as in [Saving between visits](../saving/). The entries and their drawings are kept in this browser.
2. On Describe, in **AddButton is clicked**, delete the action that adds to the list Journal and the one that sets LastDrawing.
3. Delete the list *Journal* and the variable *LastDrawing* in the sidebar. Nothing uses them now.
4. Run it, add an entry, then **↻ Restart**. Is it still there? Does each row still show its own drawing?

The drawings are kept in this browser, like the rows. **Forget saved data** removes both.

## Check: Nib and handing it in

```step
stage: investigate
insight: "Tracing which picture a row click shows, and what a Share link carries, separates the app from the data it keeps."
tasks:
  - check:
      type: bug
      code: "working.txt#nib"
      text: "Whichever row Nib clicks, the big picture is always the newest drawing. Click the line where Nib goes wrong."
      answer: 3
      fault: logic
      misconception: one-variable-for-all-rows
      explain: "Line 3: LastDrawing is one variable, holding the drawing from the last Add. The clicked row's own drawing is ClickedItem.drawing."
  - check:
      type: question
      q: "Kai finishes the journal, adds five entries with drawings, and sends the teacher a Share link. What does the teacher see?"
      options: ["The journal app, with none of Kai's entries", "The journal app with Kai's five entries", "Kai's five drawings, without the app", "An error, because the app has drawings"]
      answer: 0
      feedback: [null, "The entries were made while the app ran, and they're kept in Kai's browser. Does the link include them?", "The link is for the app itself.", "Drawing in an app is fine; the link just doesn't carry what was drawn."]
      explain: "A Share link carries the app, not what it kept while running: those entries are in Kai's browser. To hand in the entries too, Save and include what the app kept: one file (.zip) with the app, the rows and the drawings."
```

### Nib's slip

Nib made the table and the row click, but kept the event from the last lesson.

### Sharing

A Share link is quick, but what goes inside it?

## Hand it in

```step
stage: modify
insight: "Saving with what the app kept puts the app, the rows and the drawings into one file the teacher can open."
try: { playground: appbuilder, starter: "app.json#built", keep: build, level: 4, height: 680 }
check: { type: reflect, text: "I saved my journal with what the app kept (a .zip) and handed it in, or sent a Share link if my teacher only wanted the app." }
```

1. Add two or three entries with drawings, if you haven't.
2. Click **Save** at the top and choose **Save to this computer…**. When it asks, choose to **include what the app kept**. You get one file, a `.zip`, with the app, the rows and the drawings inside.
3. Hand in the file the way your class usually does. Your teacher opens it with **Open** in App Builder.

If your teacher only wants to try the app, **Share** gives a link instead, without your entries.
