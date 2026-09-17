# tools/ — schedule import tooling

Everything here is vanilla and runs without a server or packages:
`import.html` opens straight from disk (`file://`); `check-schedules.js` runs
with plain `node`. Nothing here is loaded by the public site.

## Pieces

- **`schedule-lib.js`** — the only place schedule rules live on the tooling side.
  UMD-ish: `module.exports` under Node, `window.ScheduleLib` in the browser.
  - `parseTime` is lenient on input (`8:30pm`, `8 p.m.`); stored data must be the
    canonical `"8:30 PM"` form — `validateWeekend` rejects anything else, because
    the day pages' own regex/roll-over logic expects it.
  - `showMinute` implements the day pages' roll-over (`ROLLOVER_HOUR` 7) and
    `END_HOUR` 4 mirrors `END`. **These mirror the day pages** — change both.
  - `validateSchedule` → `[{level, where, msg}]`. *Errors* = things that break
    rendering or now-playing (bad time, out of order/duplicate start, bad href,
    wrong weekday for `showDate`, missing weekend). *Warnings* = human review
    (no stream link, act ≥ 4 AM, more stages than the grid holds, repeated act).
  - `parsePaste(text, {sourceTz})` — JSON (stages array / `{stages}` / one-weekend
    `{weekends}`) or the plain-text block format. Always sorts acts by show time
    and says so in `notes`. `PT` shifts +3 h.
  - `mergeStages(current, pasted, {keepMissing})` — matches stages by name
    (case-insensitive). Keeps the current `href` when the paste has none; keeps
    unpasted stages (in place) unless `keepMissing:false`.
  - `diffStages` matches acts **by name** within a stage, so a renamed act shows
    as removed + added, and a time change shows as `time`.
  - `serialize(key, sched)` is the canonical file format. It must stay
    byte-stable: committed data files are exactly `serialize(load(file))`, so a
    no-op import produces no git diff. If you change the format, regenerate all
    six files in the same commit.
  - `toText(stages)` is the inverse of the text format ("Put current schedule in
    the paste box").
- **`import.html`** — loads the lib + all six `../data/*.js` via `<script src>`.
  Only rewrites the selected weekend; the other weekend is copied from the
  committed data. Removals (acts or whole stages) are surfaced as warnings, since
  silently losing data is the failure this tool exists to prevent. It never
  writes files — Copy/Download only.
  - The paste is **kept** when you switch schedule/weekend (so "paste first, then
    pick the target" works), but `pastedFor` remembers what it was entered for and
    a warning names the new target until you edit the paste or reload current data.
  - "weekend N missing" for a weekend *other* than the target is downgraded to a
    warning so you can rebuild a file one weekend at a time.
- **`check-schedules.js`** — runs each data file in a `vm` sandbox with a fake
  `window`, validates, exits 1 on any error.

## Gotchas

- A data file that throws while loading leaves `window.SCHEDULES[key]` undefined;
  the day page shows a red load-error message, `import.html` lists it under
  "Committed schedules", and `check-schedules.js` reports it.
- Validation of the *other* weekend is not shown while importing (only the target
  weekend's issues), so pre-existing problems there don't block an import — the
  "Committed schedules" panel and `check-schedules.js` still show them.
