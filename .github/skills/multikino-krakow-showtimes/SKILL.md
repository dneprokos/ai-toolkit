---
name: multikino-krakow-showtimes
description: >-
  List what is playing at Multikino Kraków on a chosen day, with start date-time per session,
  hiding sessions that already started so the user only sees films they can still attend.
  Use when the user asks what movies/films/seanse are on at Multikino in Kraków, "what can I
  watch tonight/tomorrow/on Friday", "repertuar Multikino Kraków", or wants cinema showtimes
  for a date, optionally after/before a time.
argument-hint: "date (required: YYYY-MM-DD, today, tomorrow, weekday); optional after/before HH:MM"
---

# Multikino Kraków showtimes

Show films and session start times for one day at Multikino Kraków (cinema id `0005`).

## Input / output

- **Input:** `date` — required. Accept `YYYY-MM-DD`, `today`, `tomorrow`, or a weekday name (next occurrence). If missing, ask for it; do not guess.
- **Optional:** `after` / `before` as `HH:MM`, when the user says "after 18:00", "evening", etc. ("evening" → after 17:00.)
- **Output:** table of films with start date-time, end time, language/format, hall, booking link.

## Why a browser

multikino.pl's showtimes API returns 401 without the site's own session, and the repertoire page embeds no showtimes. The page fills them in client-side, so render it with `playwright-cli` and read the DOM like a user would. Do not try to extract tokens or call the API directly.

## Steps

1. **Resolve the date** to `YYYY-MM-DD` using the current date in Europe/Warsaw. Multikino publishes about a week ahead: the site offers today through today+6. If the date is outside that window (past, or more than 6 days out), say so and stop. Do not fabricate.

2. **Open the page** (one named session so it can be closed):
   ```bash
   playwright-cli -s=mk open "https://www.multikino.pl/repertuar/krakow/teraz-gramy"
   ```

3. **Select the day.** Day buttons carry `data-day="YYYY-MM-DDT00:00:00"`:
   ```bash
   playwright-cli -s=mk eval "() => { const b=document.querySelector('button[data-day=\"<DATE>T00:00:00\"]'); if(!b) return 'NO_BUTTON'; b.click(); return 'ok' }"
   ```
   `NO_BUTTON` means the date is not published yet. Report that and stop. Wait ~3 s for the list to re-render.

4. **Extract sessions.** The single-day view already lists every session for that day. Do **not** click "POKAŻ WSZYSTKIE SEANSE": it switches the cards to a multi-day view. The DOM contains each session twice (desktop + mobile layout), so the snippet dedupes by booking href:
   ```bash
   playwright-cli -s=mk eval "() => { const seen=new Set(); const out=[]; document.querySelectorAll('.showing-listing__item').forEach(f=>{ const title=(f.querySelector('.showing-film-card__title-wrapper')?.innerText||'').split('\n')[0].trim(); f.querySelectorAll('a.session').forEach(a=>{ const href=a.getAttribute('href'); if(seen.has(href))return; seen.add(href); const q=s=>(a.querySelector(s)?.innerText||'').trim(); out.push([title,q('.session-time__start'),q('.session-time__end'),q('.session-special-attributes__screen-name'),q('.session-additional-attributes__lang'),q('.session-additional-attributes__session'),href].join('|')) }) }); return document.querySelector('.filter-dates-button.active').dataset.day+'\n'+out.join('\n') }"
   ```
   The result is a quoted string with `\n` escapes. Write its decoded content to a scratch file, e.g. `raw.txt`: first line is the selected day, then one `title|start|end|hall|lang|format|href` line per session.

5. **Filter and format** with the helper. It drops sessions that already started (using Europe/Warsaw "now"), applies `--after`/`--before`, sorts by film then start, and refuses if the page showed a different day than requested (exit 3 → redo step 3):
   ```bash
   node .github/skills/multikino-krakow-showtimes/scripts/format-showtimes.mjs --date <DATE> --input raw.txt [--after HH:MM] [--before HH:MM]
   ```
   Sessions starting before 06:00 are after-midnight shows and are dated the next calendar day.

6. **Close the browser** and present the helper's table as-is:
   ```bash
   playwright-cli -s=mk close
   ```

## Rules

- Only the Kraków cinema. If the user names another city, the cinema id and URL slug differ; this skill does not cover it.
- Never invent sessions. If the page fails to load or the selectors return nothing, say so and show the repertoire URL for the user to check.
- An empty result for today late in the evening is normal: tell the user nothing is left today, offer tomorrow.
- Times are local Kraków time. Seat availability and prices are not shown.
- Read-only: never click booking links or log in.

## Example

User: "what can I see tonight after 20:00?" (today = 2026-10-14)

```
**Multikino Kraków — 2026-10-14** · films: 2, sessions: 3

| Film | Start | End | Version | Hall | Book |
|---|---|---|---|---|---|
| DIGGER | 2026-10-14 20:00 | 22:35 | NAPISY · 2D | Sala 10 | [book](...) |
| LALKA | 2026-10-14 20:10 | 23:22 | DŹWIĘK POLSKI · 2D - SUPERHIT | Sala 12 | [book](...) |
| LALKA | 2026-10-14 21:00 | 00:12 | DŹWIĘK POLSKI · 2D - SUPERHIT | Sala 6 | [book](...) |
```
