#!/usr/bin/env node
// Turns the raw session lines captured from multikino.pl into a markdown table.
//
// Input file (--input): first line = the page's selected day (e.g. 2026-10-14T00:00:00),
// every other line = title|start|end|hall|language|format|bookingHref
//
// Usage:
//   node format-showtimes.mjs --date 2026-10-14 --input raw.txt [--after 18:00] [--before 23:00] [--now 2026-10-14T19:22]
//
// --now defaults to the current time in Europe/Warsaw. Sessions that already started
// are dropped, so asking for "today" never lists films the user can no longer attend.

import { readFileSync } from 'node:fs';

const BASE = 'https://www.multikino.pl';
// A session grouped under day D but starting before this hour runs after midnight, i.e. on D+1.
const AFTER_MIDNIGHT_BEFORE_HOUR = 6;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function warsawNow() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return parts.replace(' ', 'T'); // 2026-10-14T19:22
}

function addDay(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Wall-clock strings compare correctly as text: YYYY-MM-DDTHH:mm.
function startStamp(date, hhmm) {
  const hour = Number(hhmm.slice(0, 2));
  return `${hour < AFTER_MIDNIGHT_BEFORE_HOUR ? addDay(date) : date}T${hhmm}`;
}

export function parseSessions(text) {
  const [first, ...rest] = text.split(/\r?\n/).filter((l) => l.trim());
  const pageDay = first.slice(0, 10);
  const sessions = rest.map((line) => {
    const f = line.split('|');
    // Title may contain '|'; the six fields after it never do.
    const [start, end, hall, lang, format, href] = f.slice(-6);
    return { title: f.slice(0, -6).join('|'), start, end, hall, lang, format, href };
  });
  return { pageDay, sessions };
}

export function select({ sessions, date, now, after, before }) {
  const seen = new Set();
  return sessions
    .filter((s) => (seen.has(s.href) ? false : seen.add(s.href)))
    .map((s) => ({ ...s, stamp: startStamp(date, s.start) }))
    .filter((s) => s.stamp >= now)
    .filter((s) => !after || s.start >= after)
    .filter((s) => !before || s.start <= before)
    .sort((a, b) => a.title.localeCompare(b.title, 'pl') || a.stamp.localeCompare(b.stamp));
}

export function toMarkdown(rows, date) {
  if (!rows.length) return `No sessions left for ${date} in Multikino Kraków with these filters.`;
  const films = new Set(rows.map((r) => r.title)).size;
  const out = [
    `**Multikino Kraków — ${date}** · films: ${films}, sessions: ${rows.length}`,
    '',
    '| Film | Start | End | Version | Hall | Book |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const version = [r.lang, r.format].filter(Boolean).join(' · ');
    out.push(
      `| ${r.title.replaceAll('|', '\\|')} | ${r.stamp.replace('T', ' ')} | ${r.end} | ${version} | ${r.hall} | [book](${BASE}${r.href}) |`,
    );
  }
  return out.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.date || !a.input) {
    console.error('usage: format-showtimes.mjs --date YYYY-MM-DD --input raw.txt [--after HH:MM] [--before HH:MM] [--now YYYY-MM-DDTHH:mm]');
    process.exit(2);
  }
  const { pageDay, sessions } = parseSessions(readFileSync(a.input, 'utf8'));
  if (pageDay !== a.date) {
    console.error(`page showed ${pageDay}, expected ${a.date} - day button click did not take effect`);
    process.exit(3);
  }
  const rows = select({ sessions, date: a.date, now: a.now ?? warsawNow(), after: a.after, before: a.before });
  console.log(toMarkdown(rows, a.date));
}
