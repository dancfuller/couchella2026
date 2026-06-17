# Couchella 2026

Static, no-build web app showing **livestream schedules** for Coachella 2026 (two
weekends) and Stagecoach 2026. Per-stage set times across multiple timezones, a
live "now playing" indicator, and links to each stage's livestream. Pure vanilla
HTML/CSS/JS — no framework, no bundler, no dependencies, no package.json.

## Running / deploying

- **Run locally:** open any `.html` file directly in a browser, or serve the
  folder (`python -m http.server`) and visit `index.html`. There is no build step.
- **Deploy:** push to `main`. The repo (`github.com/dancfuller/couchella2026`) is
  served as static files; the live site is whatever is on `main`. No CI, no
  artifacts — the committed files *are* the site.

## File layout

```
index.html                 Day picker / landing page. Toggles festival
                           (Coachella ↔ Stagecoach) and weekend (1 ↔ 2),
                           persists choice in localStorage, links to day pages.

friday.html                Coachella schedule pages — one per day. Each is
saturday.html              SELF-CONTAINED: full CSS + JS + that day's STAGES
sunday.html                data inline. Holds BOTH weekends (W1/W2) in one file.

stagecoach-friday.html     Stagecoach schedule pages — same structure as the
stagecoach-saturday.html   Coachella day pages, one weekend only.
stagecoach-sunday.html

couchella-logo.svg         Wordmark logos (rendered white via `filter:invert(1)`).
stagecouch-logo.svg

TODO.md                    Forward-looking ideas (companion-app features +
                           refactors). Not a work queue for the current tool.
```

## Critical convention: the day pages are triplicated

`friday/saturday/sunday.html` (and the three stagecoach files) each carry the
**entire** CSS and JS — only the inline `STAGES` schedule data and the day's
`DATES`/`SHOW_DATES` differ. **Any change to layout, styling, clock, timezone, or
now-playing logic must be applied to all three (or all six) files identically.**
This is the single biggest gotcha here. See `TODO.md` item #5 for the planned
de-duplication; until that lands, edit in lockstep.

When you change shared markup/CSS/JS in one day file, make the same edit in the
others in the same commit.

## How a day page works (the inline `<script>`)

All logic lives in one IIFE per day file. Key pieces:

- **`STAGES`** — object keyed by weekend (`1`/`2`) for Coachella, each value an
  array of `{stage, href, acts}`. `href` is the livestream URL; `acts` is an
  array of `['8:30 PM', 'Artist Name']` pairs. **Times are authored in Eastern
  (ET) wall-clock** and converted from there. Edit Weekend 2 entries where the
  lineup/set-times differ from Weekend 1.
- **Weekend selection** — `?w=2` query param, else `localStorage.weekend`,
  default 1. The day picker sets these.
- **Timezones** — `SUPPORTED_TZ` list drives the dropdown. Authored ET times are
  turned into a UTC instant (`edtStringToUTC`, anchored at `SHOW_DATE` 04:00Z =
  midnight ET) then formatted into the viewer's chosen tz. Choice persists in
  `localStorage.tz`. After-midnight times (h < 7) roll into the next day.
- **Now-playing** — runs only on the actual show date (`isShowDay`). An act is
  `.now-playing` from its start until 20 min before the next act (`PLAY_BUF`),
  `.next-up` for 10 min before it starts (`NEXT_BUF`); last act is capped at
  4:00 AM ET (`END`). In gaps, a dashed `.now-marker` shows above the next act.
  Recomputes every 30 s.
- **Responsive layouts** — three distinct modes:
  - Desktop grid (`.grid-wrap`) with per-column **autofit** that shrinks type via
    `fit-1`…`fit-6` classes until each column's acts fit vertically.
  - Mobile portrait (`.mob-outer`, ≤768px): one stage panel at a time with a
    swipeable tab nav and its own large clock.
  - Mobile landscape (orientation + max-height:500px): a compact "billboard"
    that reuses the desktop grid.

## Conventions

- **Vanilla only.** No npm, no frameworks, no external CDNs. Keep it dependency-free.
- **Commit straight to `main`** and push. Do not open PRs (project workflow).
- Logos are SVG wordmarks shown white via `filter: invert(1)`; keep that when
  adding logo usages.
- Update this file in the same commit when you change how something works (e.g.
  the triplication strategy, the timezone anchor, or now-playing windows).
