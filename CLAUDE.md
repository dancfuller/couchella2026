# Couchella 2026

Static, no-build web app showing **livestream schedules** for Coachella 2026 (two
weekends) and Stagecoach 2026. Per-stage set times across multiple timezones, a
live "now playing" indicator, and links to each stage's livestream. Pure vanilla
HTML/CSS/JS — no framework, no bundler, no dependencies, no package.json.

## Running / deploying

- **Run locally:** open any `.html` file directly in a browser, or serve the
  folder (`python -m http.server`) and visit `index.html`. There is no build step.
  Opening from `file://` must keep working — load data with `<script src>`,
  never `fetch()`.
- **Deploy:** push to `main`. The repo (`github.com/dancfuller/couchella2026`) is
  served by GitHub Pages at `https://dancfuller.github.io/couchella2026/`; the live
  site is whatever is on `main`. No CI, no artifacts — the committed files *are*
  the site. Confirm a deploy with
  `gh api repos/dancfuller/couchella2026/pages/builds/latest` (status `built`,
  commit = your SHA).

## File layout

```
index.html                 Day picker / landing page. Toggles festival
                           (Coachella ↔ Stagecoach) and weekend (1 ↔ 2),
                           links to day pages with an explicit ?w=.

friday.html                Coachella schedule pages — one per day. Each carries
saturday.html              the FULL CSS + JS (see "triplicated" below) and loads
sunday.html                its schedule from data/coachella-<day>.js.

stagecoach-friday.html     Stagecoach schedule pages — same structure, one
stagecoach-saturday.html   weekend, loads data/stagecoach-<day>.js.
stagecoach-sunday.html

data/<festival>-<day>.js   Schedule data, one file per festival day (both
                           Coachella weekends in one file). Generated format —
                           edit with tools/import.html. See "Schedule data".

tools/import.html          Open from disk: paste a schedule, see errors + a diff
                           vs committed data, copy/download the new data file.
tools/schedule-lib.js      Parse / validate / merge / diff / serialize (shared by
                           import.html and check-schedules.js).
tools/check-schedules.js   `node tools/check-schedules.js` — validates all data.
tools/CLAUDE.md            Internals of the import tooling.

couchella-logo.svg         Wordmark logos (rendered white via `filter:invert(1)`).
stagecouch-logo.svg

TODO.md                    Forward-looking ideas (companion-app features +
                           refactors). Not a work queue for the current tool.
```

## Critical convention: the day pages are triplicated

`friday/saturday/sunday.html` (and the three stagecoach files) each carry the
**entire** CSS and JS — only `SCHEDULE_KEY`, the title/header colour, and the
`<script src="data/...">` line differ (Stagecoach also: `W=1`, 3-column single-row
grid, empty `ABBREV`, no weekend label). **Any change to layout, styling, clock, timezone, or now-playing
logic must be applied to all three (or all six) files identically.** This is the
single biggest gotcha here. See `TODO.md` item #5 for sharing the CSS/JS; until
that lands, edit in lockstep.

When you change shared markup/CSS/JS in one day file, make the same edit in the
others in the same commit.

## Schedule data

- One file per festival day: `data/coachella-friday.js` … `data/stagecoach-sunday.js`.
  Each assigns `window.SCHEDULES[key] = {weekends: {"1": {showDate, stages}, "2": …}}`,
  stages = `[{stage, href, acts: [["8:30 PM", "Artist"], …]}]`. JSON-style
  double-quoted strings — apostrophes in names need no escaping.
- **Times are Eastern (ET) wall-clock**, acts in time order; 12:00–6:59 AM acts
  belong to the previous evening. The weekday/date label is derived from
  `showDate` — there is no separate label to keep in sync.
- `href: ""` = no Watch button (validator warns).
- **Updating a schedule:** open `tools/import.html` from disk → pick schedule +
  weekend → paste (plain text or JSON; PT sources can be converted) → fix any
  errors, read the diff (removals are called out) → Download/Copy over
  `data/<key>.js` → `node tools/check-schedules.js` → `git diff` → commit + push.
  Pasting one weekend never touches the other; stages missing from the paste are
  kept unless you untick that option.
- **Never hand-merge schedule data into the HTML pages** — there is none there
  any more. If a data file fails to load, the page shows a red "Schedule data
  failed to load" message instead of rendering.
- `index.html` still hard-codes the date labels on its buttons (`WEEKS`,
  `STAGECOACH`) — update them if show dates change.

## How a day page works (the inline `<script>`)

All logic lives in one IIFE per day file. Key pieces:

- **Data** — `SCHEDULE_KEY` picks `window.SCHEDULES[key]` (from the `data/` script
  loaded just before) and builds `STAGES`/`SHOW_DATES`/`DATES` per weekend. All
  interpolated strings go through `esc()` (which escapes quotes, so hrefs are
  attribute-safe).
- **Weekend selection** — `?w=1|2` query param (every day-picker link carries
  it), else by today's date: W2 from `WEEKEND_CUTOVER` (2026-04-14). Day pages
  deliberately do **not** read `localStorage` for this — a remembered choice
  used to pin bookmarks to the wrong weekend. The header shows "Weekend N"
  (`#wk-label`). Stagecoach pages hard-code `W=1`.
- **Day picker defaults** (`index.html`) — only explicit clicks are saved
  (`weekend`/`festival` + `weekendAt`/`festivalAt` timestamps) and they expire
  after `PICK_TTL` (12 h). Otherwise festival and weekend come from the date
  (`STAGECOACH_CUTOVER` 2026-04-20, `WEEKEND_CUTOVER` 2026-04-14).
  `WEEKEND_CUTOVER` is **mirrored** in the three Coachella day pages — change
  all four together.
- **Timezones** — `SUPPORTED_TZ` list drives the dropdown. Authored ET times are
  turned into a UTC instant (`edtStringToUTC`, anchored at `SHOW_DATE` 04:00Z =
  midnight ET) then formatted into the viewer's chosen tz. Choice persists in
  `localStorage.tz`. After-midnight times (h < 7) roll into the next day.
- **Now-playing** — runs only on the actual show date (`isShowDay`). An act is
  `.now-playing` from its start until 20 min before the next act (`PLAY_BUF`),
  `.next-up` for 10 min before it starts (`NEXT_BUF`); last act is capped at
  4:00 AM ET (`END`). In gaps, a dashed `.now-marker` shows above the next act
  (not before a stage's first act — deliberate). Recomputes every 30 s. Assumes
  acts are in time order — the validator enforces it.
- **Mirrored rules** — the 7 AM roll-over, 4 AM `END`, and the grid capacity
  (Coachella 7 stages, Stagecoach 2) also live in `tools/schedule-lib.js`
  (`ROLLOVER_HOUR`, `END_HOUR`, `MAX_STAGES`). Change both sides together.
- **Responsive layouts** — three distinct modes:
  - Desktop grid (`.grid-wrap`) with per-column **autofit** that shrinks type via
    `fit-1`…`fit-7` classes (`FIT_MAX`) until each column's acts fit vertically.
    If a column still overflows at `fit-7` it gets `fit-scroll` (scrolls) — acts
    must never be clipped by `.col{overflow:hidden}`. Autofit re-runs on resize,
    tz change, and whenever `update()` changes now-playing classes
    (`refitIfLiveChanged`), since bold/bullet styling can wrap names.
  - Mobile portrait (`.mob-outer`, ≤768px): one stage panel at a time with a
    swipeable tab nav and its own large clock.
  - Mobile landscape (orientation + max-height:500px): a compact "billboard"
    that reuses the desktop grid.

## Conventions

- **Vanilla only.** No npm, no frameworks, no external CDNs. Keep it dependency-free.
  (`tools/check-schedules.js` uses plain Node with no packages.)
- **Commit straight to `main`** and push. Do not open PRs (project workflow).
- **Before committing data changes** run `node tools/check-schedules.js`; it must
  report 0 errors.
- Logos are SVG wordmarks shown white via `filter: invert(1)`; keep that when
  adding logo usages.
- Keep logo SVGs vector-only. Inkscape traces keep their source bitmap as an
  embedded `<image>` (hidden or off-canvas) — delete it before committing.
  `stagecouch-logo.svg` was 694 KB from two such leftovers; it's ~22 KB without.
- Update this file in the same commit when you change how something works (e.g.
  the triplication strategy, the timezone anchor, or now-playing windows).
