---
order: 11
unit: tidy
title: Creature scores
summary: "Functions that give back a value: BarWidth(stat) works out a bar's width once, for all three bars, and Overall(power, speed, defence) gives back one score for each creature. Find out what happens when a function works something out but never gives it back."
language: maths
shape: build
hook: "A shop works out a price with tax, a game works out damage, a fitness app works out a score. Each is one calculation used in many places, written once and asked for by name."
pacing: { keyDelayMs: 40, cursorMs: 500, afterActionMs: 300, postRollMs: 1200 }
voice: { name: af_heart, speed: 1.1 }
app:
  command: node "$REPO_ROOT/tools/serve.mjs" "$REPO_ROOT/dist/_playground-appbuilder" 8765
  url: http://127.0.0.1:8765/index.html
  readySelector: "[data-ab='tab:design']"
  layout: full
explainClip:
  query: { code: "@app.json#done", tab: run, id: explain }
  caption: "Ask a function for a value"
  say: "A function can work something out and give the answer back, wherever it's asked."
  clip:
    - caption: { text: "Each bar asks BarWidth for its width.", say: "Each bar asks BarWidth for its width." }
    - wait: 600
    - click: { selector: ".view-run [data-ab='widget:Creature'][data-id='k0']" }
    - caption: { text: "Overall gives back one score from three stats.", say: "Overall gives back one score from three stats." }
    - wait: 900
    - click: { selector: ".view-run [data-ab='widget:Creature'][data-id='k1']" }
    - expect: { selector: ".view-run [data-ab='widget:OverallText']", contains: "60" }
    - caption: { text: "Same functions, Tide's stats: a different answer.", say: "Same functions, Tide's stats, a different answer." }
    - wait: 1400
---
In *Tidy up the journal*, a function **did** something: Pick set Chosen and went to Describe. A function can also **work something out and give it back**, like a calculator button:

- `BarWidth(80)` gives back `160`, the width of a bar for a stat of 80.
- `Overall(80, 60, 30)` gives back `57`, one score for three stats.

You use it wherever a value goes, in a value box, just like `count(Journal)` or `round(2.6)`. Today's app is the creature stats viewer, tidied and given an overall score.

## Try the finished app

```step
stage: info
insight: "Seeing the bars and the overall score change per creature shows what the two functions work out before building them."
try: { playground: appbuilder, starter: "app.json#try", tab: run, level: 4, height: 640 }
check: { type: reflect, text: "I clicked each creature and watched its bars and its Overall score change." }
```

Click each creature. The bars and the **Overall** score at the bottom change. Which creature has the highest score?

## Spot the repetition

```step
stage: investigate
insight: "Seeing that the three bar widths share one calculation, with only the stat changing, tells you what the function works out and what goes in as its parameter."
check:
  type: question
  q: "Open the Events tab. The three bar actions each set a width. What is different between them?"
  options: ["Only the stat: power, speed or defence", "The number they divide by", "The number they times by", "Nothing: all three are the same"]
  answer: 0
  feedback: [null, "All three divide by 100.", "All three times by 200.", "Each one reads a different stat."]
  explain: "All three work out stat / 100 * 200. Only the stat changes, so it becomes the parameter, and the calculation goes in the function once."
```

Look at the last three actions of **Creature is clicked**: *Set PowerBar width to* … and the two after it.

## Build 1: BarWidth gives back a width

```step
stage: run
app: true
query: { code: "@app.json#start", level: 4, id: scores-1 }
caption: "A function that gives back a value"
clip:
  - caption: { text: "+ Function: BarWidth, with a parameter, stat.", say: "Add a function, BarWidth, with a parameter, stat." }
  - click: { selector: "[data-ab='add-function']" }
  - type: { selector: ".side input.rename", text: "BarWidth" }
  - press: Enter
  - click: { selector: "[data-ab='add-param']" }
  - type: { selector: "[data-ab='param-new']", text: "stat" }
  - press: Enter
  - caption: { text: "+ Give back a value adds Set return value: stat / 100 * 200.", say: "Give back a value adds Set return value. Stat divided by 100, times 200." }
  - click: { selector: "[data-ab='fn-give-value']" }
  - click: { selector: ".view-events [data-ab='item:setReturn']" }
  - type: { selector: "dialog[open] [data-ab='param:value']", text: "stat / 100 * 200" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - caption: { text: "Back on the screen's events: the PowerBar width is now BarWidth(Creature.power).", say: "Back on the screen's events. The PowerBar width is now BarWidth of Creature dot power." }
  - click: { selector: "[data-ab='sheet:screen']" }
  - click: { selector: ".view-events [data-ab='item:setSize'] >> nth=0" }
  - type: { selector: "dialog[open] [data-ab='param:value']", text: "BarWidth(Creature.power)" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - expect: { selector: ".view-events event-sheet", contains: "BarWidth" }
  - caption: { text: "Then the same for speed and defence.", say: "Then the same for speed and defence." }
  - wait: 1200
insight: "Set return value is the answer the function hands back; BarWidth(Creature.power) asks for it with this creature's power."
try: { playground: appbuilder, starter: "app.json#start", keep: build, level: 4, height: 640 }
check:
  type: code
  text: "A function BarWidth(stat) gives back stat / 100 * 200, and all three bars use it."
  rules: { contains: ["function BarWidth(stat)"], event: [["Set return value to stat / 100 * 200"], ["when Creature is clicked", "BarWidth(Creature.power)", "BarWidth(Creature.speed)", "BarWidth(Creature.defence)"]], lacks: ["Creature.power / 100 * 200", "Creature.speed / 100 * 200", "Creature.defence / 100 * 200"] }
```

1. In the sidebar, under **Functions**, click **+ Function** and name it *BarWidth*.
2. **+ Parameter**: *stat*.
3. Click **+ Give back a value**. It adds **Set return value to**: fill in `stat / 100 * 200`
4. Click **This screen: Creatures**. In **Creature is clicked**, click *Set PowerBar width to …* and change the value to `BarWidth(Creature.power)`
5. Do the same for SpeedBar (`BarWidth(Creature.speed)`) and DefenceBar (`BarWidth(Creature.defence)`).
6. Run it and click each creature. The bars should look exactly as before.

Want wider bars? Change 200 in one place, BarWidth, and all three follow.

## What does it give back?

```step
stage: investigate
insight: "Working out one call by hand shows that the value in the brackets becomes stat for that one call."
check:
  type: question
  q: "Zip's speed is 95. What does BarWidth(Creature.speed) give back when Zip is clicked?"
  options: ["190", "95", "200", "47.5"]
  answer: 0
  feedback: [null, "That's the stat going in. What does the function do with it?", "That's the widest a bar can be, for a stat of 100.", "That's 95 / 2. Try 95 / 100, then times 200."]
  explain: "For this call, stat is 95: 95 / 100 * 200 = 190. The next call gives stat a different value."
```

## Build 2: Overall gives back a score

```step
stage: run
insight: "A function can take several parameters and give back one answer; the call fills them in order."
try: { playground: appbuilder, starter: "app.json#sol-step-3", keep: build, level: 4, height: 640 }
check:
  type: code
  text: "A function Overall(power, speed, defence) gives back the rounded average, and OverallText shows it for the clicked creature."
  rules: { contains: ["function Overall(power, speed, defence)"], event: [["Set return value to", "power + speed + defence"], ["when Creature is clicked", "Set OverallText text to", "Overall(Creature.power, Creature.speed, Creature.defence)"]] }
```

1. **+ Function**: *Overall*, with three parameters: *power*, *speed*, *defence* (in that order).
2. **+ Give back a value**: `round((power + speed + defence) / 3)` (the average, rounded to a whole number).
3. In **Creature is clicked**, add **Set OverallText text to** `"Overall: " & Overall(Creature.power, Creature.speed, Creature.defence)`
4. Run it. Which creature scores highest?

The call fills the parameters in order: the first value goes into *power*, the second into *speed*, the third into *defence*.

## Check: Nib's Overall

```step
stage: investigate
insight: "Nib's version works out the answer but never hands it back, which shows that Set return value is what turns a function into a value."
tasks:
  - check:
      type: bug
      code: "working.txt#nib"
      text: "Clicking a creature shows the problem \"Overall doesn't give a value back yet\". Click the line where Nib goes wrong."
      answer: 2
      fault: logic
      misconception: work-out-without-return
      explain: "Line 2: Nib puts the answer in a variable, so Overall works it out and then keeps it. Only Set return value hands it back to the place that asked."
  - check:
      type: question
      q: "Blaze has power 80, speed 60 and defence 30. What does Overall give back?"
      options: ["57", "170", "56", "60"]
      answer: 0
      feedback: [null, "That's the total. Overall divides by 3.", "170 / 3 is 56.67. What does round do?", "That's Tide's score."]
      explain: "(80 + 60 + 30) / 3 = 56.67, and round gives 57."
```

### Nib's slip

Nib's Overall does the maths, but the app says it doesn't give a value back.

### Blaze's score

Work it out before you click Blaze.

## Make it yours: a rank

```step
stage: modify
insight: "A function can decide what to give back, with an If inside it, and one function's answer can go straight into another."
try: { playground: appbuilder, starter: "app.json#done", keep: build, level: 4, height: 640 }
check:
  type: code
  text: "A function Rank(score) gives back one word when the score is high and another otherwise (an If and an Else), and the creature's rank is shown."
  rules: { contains: ["function Rank(score)"], event: [["when Compare score", "Set return value to"], ["else", "Set return value to"], ["when Creature is clicked", "Rank(Overall("]] }
```

Make a function *Rank(score)* that gives back a word for a score, such as *Strong* for 60 or more and *Still training* below that:

1. **+ Function** *Rank*, parameter *score*.
2. In its event, a condition: **Compare** `score` **≥** `60`, then **Set return value to** `"Strong"`.
3. From the event's **⋯** menu, **Add an Else below**, with **Set return value to** `"Still training"`.
4. Show it beside the score: add `& " (" & Rank(Overall(Creature.power, Creature.speed, Creature.defence)) & ")"` to the end of the OverallText value.

`Rank(Overall(…))` asks Overall first, then hands its answer straight to Rank.
