---
order: 1
unit: respond
title: A practice tracker
summary: "Build a prototype of a practice tracker: type how many minutes you practised, click Save, and the app adds it to your total. A variable remembers the total, a button event changes it, and the screen only shows the new total when an event sets the text."
language: maths
shape: build
hook: "Apps that track things, like steps, screen time or practice, all do the same small job underneath: remember a number, change it when you do something, and show it."
pacing: { keyDelayMs: 40, cursorMs: 500, afterActionMs: 300, postRollMs: 1200 }
voice: { name: af_heart, speed: 1.1 }
app:
  command: node "$REPO_ROOT/tools/serve.mjs" "$REPO_ROOT/dist/_playground-appbuilder" 8751
  url: http://127.0.0.1:8751/index.html
  readySelector: "[data-ab='tab:design']"
  layout: full
explainClip:
  query: { code: "@app.json#done", tab: run, id: explain }
  caption: "Save, then show"
  say: "The Save event changes the variable, then sets the text."
  clip:
    - caption: { text: "Minutes is a variable: it starts at 0.", say: "Minutes is a variable. It starts at zero." }
    - wait: 800
    - type: { selector: ".view-run [data-ab='widget:TextInput'] input", text: "15" }
    - click: { selector: ".view-run [data-ab='widget:SaveButton']" }
    - caption: { text: "Save runs one event: add 15 to Minutes, then set the text.", say: "Clicking Save runs one event. It adds fifteen to Minutes, then sets the text." }
    - wait: 900
    - click: { selector: ".view-run [data-ab='widget:SaveButton']" }
    - click: { selector: ".view-run [data-ab='widget:SaveButton']" }
    - expect: { selector: ".view-run [data-ab='widget:TotalText']", contains: "45" }
    - caption: { text: "Three saves: 45 minutes. The screen changes because the event sets the text.", say: "Three saves make forty-five. The screen changes because the event sets the text." }
    - wait: 1600
---
A **prototype** is an early version of an app that you can click through and test, before anyone spends weeks building the real thing. In this course you'll build prototypes with **App Builder**, which runs right here on the page.

An App Builder app has two halves:

- The **design** is the screen: the text, boxes and buttons the user sees.
- The **events** are what make it work. Each **event** is a row: on the left, *when* something happens; on the right, *what to do* then.

Today's app remembers your practice total in a **variable**: a named box that holds a number for the whole app.

![The practice tracker: a title, a box to type minutes, a Save button, and a line saying "You've practised 45 minutes".](app.svg)

## Try the finished app

```step
stage: info
insight: "Using the working app first gives students the goal before anything is taken apart: every later step builds back towards it."
try: { playground: appbuilder, starter: "app.json#done", tab: run, level: 2, height: 600 }
check: { type: reflect, text: "I saved some minutes and watched the total and the Minutes value change." }
```

This is the app you'll build, open on the **Run** tab. Type some minutes and click **Save** a few times. On the left, beside *Minutes*, you can see its value now, next to the value it started at.

## Build 1: make the screen

```step
stage: run
app: true
query: { code: "@app.json#start", level: 2, id: build-1 }
caption: "Add, then name"
clip:
  - caption: { text: "Add object, then Button.", say: "Add an object. This one is a Button." }
  - click: { selector: "[data-ab='add-object']" }
  - click: { selector: "[data-ab='kind:button']" }
  - caption: { text: "Give it a name that says what it is: SaveButton.", say: "Give it a name that says what it is. SaveButton." }
  - click: { selector: ".side [data-ab='object-menu']" }
  - click: { selector: "[data-ab='menu:rename']" }
  - type: { selector: ".side input.rename", text: "SaveButton" }
  - press: Enter
  - expect: { selector: ".side", contains: "SaveButton" }
  - wait: 800
insight: "Laying out the screen first, with names that say what each thing is, makes the events in the next steps easy to read."
try: { playground: appbuilder, starter: "app.json#start", keep: build, level: 2, height: 640 }
check:
  type: code
  text: "The screen has a text input, a button called SaveButton and a text called TotalText."
  rules: { contains: ["(text input)", "object SaveButton (button)", "object TotalText (text)"] }
```

1. On the **Design** tab, choose **+ Add object**, then **Text**. In **Properties**, change its text to *Practice tracker*.
2. Add a **Text input**: the box the user types in.
3. Add a **Button** and set its text to *Save*.
4. Add one more **Text** below. Set its text to *You've practised 0 minutes*.
5. Name things for what they are: select the button, click **⋯** beside it, choose **Rename** and call it *SaveButton*. Rename the last text *TotalText*.

Drag things where you want them, or use the arrow keys (Alt and the arrows change the size). Your work carries on into the next steps.

## Build 2: count with a variable

```step
stage: run
app: true
query: { code: "@app.json#sol-step-2", level: 2, id: build-2 }
caption: "A variable and a click event"
clip:
  - caption: { text: "A variable remembers a number: Minutes, starting at 0.", say: "A variable remembers a number. Minutes, starting at zero." }
  - type: { selector: "[data-ab='new-variable-name']", text: "Minutes" }
  - press: Enter
  - click: { selector: "[data-ab='tab:events']" }
  - caption: { text: "When SaveButton is clicked…", say: "When SaveButton is clicked." }
  - click: { selector: ".view-events [data-ab='add-event']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-condition']" }
  - click: { selector: "[data-ab='group:object:SaveButton']" }
  - click: { selector: "[data-ab='entry:onClicked']" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - caption: { text: "…add 15 to Minutes.", say: "Add fifteen to Minutes." }
  - click: { selector: ".view-events .ev.sel [data-ab='add-action']" }
  - click: { selector: "[data-ab='group:Variables']" }
  - click: { selector: "[data-ab='entry:addTo']" }
  - type: { selector: "dialog[open] [data-ab='param:value']", text: "15" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - expect: { selector: ".view-events event-sheet", contains: "Minutes" }
  - wait: 800
insight: "Students hit the lesson's idea themselves: the variable changes but the screen doesn't, because nothing sets the text."
try: { playground: appbuilder, starter: "app.json#sol-step-2", keep: build, level: 2, height: 640 }
check:
  type: code
  text: "A variable called Minutes, and an event: when SaveButton is clicked, add to Minutes."
  rules: { contains: ["variable Minutes ="], event: [["when SaveButton is clicked", "to variable Minutes"]] }
```

1. Under **Variables** on the left, type *Minutes* in the New variable box, keep its starting value 0, and press **Enter**.
2. Open the **Events** tab and choose **+ Add event**.
3. Choose **+ Condition**, then **SaveButton**, then **SaveButton is clicked**.
4. Choose **+ Action**, then **Variables**, then **Add … to variable**. Type 15, check it says Minutes, and choose **Done**.
5. Click **Save** in the preview a few times. Does the screen change?

It doesn't. On the left, beside *Minutes*, its value now goes up, but nothing has told the text to change. The screen only shows something new when an event sets the text.

## Build 3: show the total

```step
stage: run
app: true
query: { code: "@app.json#sol-step-3", level: 2, id: build-3 }
caption: "Set the text"
clip:
  - click: { selector: "[data-ab='tab:events']" }
  - caption: { text: "The same event: set TotalText's text to show Minutes.", say: "In the same event, set TotalText's text to show Minutes." }
  - click: { selector: ".view-events [data-ab='item:addTo']" }
  - click: { selector: "dialog[open] [data-ab='cancel']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-action']" }
  - click: { selector: "[data-ab='group:object:TotalText']" }
  - click: { selector: "[data-ab='entry:setText']" }
  - type: { selector: "dialog[open] [data-ab='param:value']", text: "\"You've practised \" & Minutes & \" minutes\"" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - wait: 600
  - click: { selector: ".view-events .preview-col [data-ab='widget:SaveButton']" }
  - expect: { selector: ".view-events .preview-col [data-ab='widget:TotalText']", contains: "15" }
  - caption: { text: "Now the screen changes, because the event sets the text.", say: "Now the screen changes, because the event sets the text." }
  - wait: 900
insight: "Adding Set text fixes what students just saw, and int() makes the typed number count."
try: { playground: appbuilder, starter: "app.json#sol-step-3", keep: build, level: 2, height: 640 }
check:
  type: code
  text: "The same event sets TotalText to show the total, and adds what was typed: int(TextInput.text)."
  rules: { event: [["when SaveButton is clicked", "to variable Minutes", "Set TotalText text to", "Minutes"], ["when SaveButton is clicked", "Add int(TextInput.text) to variable Minutes"]] }
```

1. Click the event, choose **+ Action**, then **TotalText**, then **Set TotalText text to …**. Type exactly: `"You've practised " & Minutes & " minutes"`
2. Click Save in the preview. Now it changes.
3. Use what the user typed: click the **Add 15** action and change 15 to `int(TextInput.text)`. A text input holds text, even when you type 20; `int()` turns it into a number.

Your work is kept in this browser. **Save** at the top keeps a copy as a file on your computer if you want one.

## Check: how the text is made

```step
stage: investigate
insight: "Reading the Set text expression and Nib's mistake both point at the move: the screen shows whatever the last Set text said, and only an event changes it."
tasks:
  - check:
      type: question
      q: "Minutes is 45. The Set text action says \"You've practised \" & Minutes & \" minutes\". What does the screen show?"
      options: ["You've practised 45 minutes", "You've practised Minutes minutes", "You've practised & 45 & minutes", "45"]
      answer: 0
      feedback: [null, "Minutes isn't inside the quote marks, so App Builder uses its value, not the word.", "The & signs join the pieces. They don't appear on the screen.", "The words inside the quote marks are shown too."]
      explain: "Words in quote marks are shown as they are. Minutes, outside the quotes, is replaced by its value. The & signs join the pieces into one line."
  - check:
      type: bug
      code: "working.txt#nib"
      text: "Nib's screen never changes from 0 minutes. Click the line that explains why."
      answer: 2
      fault: logic
      misconception: text-updates-itself
      explain: "Line 2: On start of screen runs once, when the app opens. After that nothing sets the text again, so it keeps saying 0. Nib needs a Set text action in the Save event too."
```

### Read the text

### Find Nib's mistake

## Make it yours: Reset and sessions

```step
stage: modify
insight: "A Reset button and a second counter need both moves again: change a variable, then set the text. Doing them without steps is the check that the move has stuck."
try: { playground: appbuilder, starter: "app.json#done", keep: build, level: 2, height: 640 }
tasks:
  - check:
      type: code
      text: "A button called ResetButton whose event sets Minutes to 0 and sets TotalText's text."
      rules: { contains: ["object ResetButton (button)"], event: [["when ResetButton is clicked", "Set variable Minutes to 0", "Set TotalText text to"]] }
  - check:
      type: code
      text: "A second variable, Sessions, goes up by 1 on each Save and is shown on the screen, and Reset sets it back to 0."
      rules: { contains: ["variable Sessions ="], event: [["when SaveButton is clicked", "Add 1 to variable Sessions", "Sessions"], ["when ResetButton is clicked", "Set variable Sessions to 0"]] }
```

### A Reset button

Carry on with your tracker. Add a **Button** with the text *Reset* and rename it *ResetButton*. Its event needs two actions: **Set variable Minutes to 0**, then set TotalText's text again (or the screen keeps the old total).

### Count the sessions

Add a second variable, *Sessions*, that goes up by 1 each time you click Save. Show it in a new Text, such as *Sessions: 3*. Make Reset clear it too.

Then show your tracker to someone. Ask them to use it without help. What did they try that you didn't expect?
