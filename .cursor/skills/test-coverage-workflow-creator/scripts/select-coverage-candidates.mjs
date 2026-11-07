// Ranks the coverage gaps a nightly test-coverage agent may work on.
// Copied into the target repository by the test-coverage-workflow-creator skill.
//
// Usage (from the repository root):
//   node .github/scripts/select-coverage-candidates.mjs \
//     --config .github/test-coverage/config.json \
//     [--exclude excluded-targets.json] [--out candidates.json]
//
// Every report listed in config.sources is parsed into per-file line/branch
// counts, mapped onto files tracked by git, filtered by the denylist and the
// exclusion list, then ranked. The filtering happens here, in code, so the
// agent never has to be trusted to honour it: it only sees what survives.
//
// Supported formats: cobertura, lcov, istanbul-summary, istanbul-final,
// jacoco, go-coverprofile.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_NOT_SOURCE = [
  "**/*.d.ts",
  "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs}",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/test/**",
  "**/tests/**",
  "**/*Tests.cs",
  "**/*Test.java",
  "**/*_test.go",
  "**/test_*.py",
  "**/*_test.py",
  "**/Migrations/**",
  "**/*.generated.*",
  "**/*.g.cs",
  "**/*.Designer.cs",
];

const escapeRe = (s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&");

export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      const slashAfter = glob[i + 2] === "/";
      source += slashAfter ? "(?:.*/)?" : ".*";
      i += slashAfter ? 2 : 1;
    } else if (ch === "*") source += "[^/]*";
    else if (ch === "?") source += "[^/]";
    else if (ch === "{" && glob.indexOf("}", i) > i) {
      const end = glob.indexOf("}", i);
      source += `(?:${glob.slice(i + 1, end).split(",").map(escapeRe).join("|")})`;
      i = end;
    } else source += escapeRe(ch);
  }
  return new RegExp(`^${source}$`);
}

const globCache = new Map();
function matchesAny(globs = [], value) {
  return globs.some((g) => {
    if (!globCache.has(g)) globCache.set(g, globToRegExp(g));
    return globCache.get(g).test(value);
  });
}

function normalize(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

// --- Parsers: each returns [{ path, totalLines, coveredLines, totalBranches, coveredBranches }]

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Cobertura reports one <class> per class, so a file with nested or partial
// classes appears several times. Lines are merged per file before counting so
// a fully covered main class cannot hide an uncovered nested one.
export function parseCobertura(xml) {
  const files = new Map();
  const classRe = /<class\s[^>]*\/>|<class\s[^>]*>[\s\S]*?<\/class>/g;
  for (const block of xml.match(classRe) ?? []) {
    const open = block.slice(0, block.indexOf(">") + 1);
    const filename = attr(open, "filename");
    if (!filename) continue;
    const path = normalize(decodeXml(filename));
    const entry = files.get(path) ?? { lines: new Map(), branches: new Map() };
    // Method-level <line> entries duplicate the class-level ones.
    const classLines = block.replace(/<methods>[\s\S]*?<\/methods>/, "");
    for (const line of classLines.match(/<line\s[^>]*>/g) ?? []) {
      const nr = Number(attr(line, "number"));
      const hits = Number(attr(line, "hits") ?? 0);
      entry.lines.set(nr, Math.max(entry.lines.get(nr) ?? 0, hits));
      const m = attr(line, "condition-coverage")?.match(/\((\d+)\/(\d+)\)/);
      if (m) {
        const prev = entry.branches.get(nr) ?? [0, 0];
        entry.branches.set(nr, [Math.max(prev[0], Number(m[1])), Math.max(prev[1], Number(m[2]))]);
      }
    }
    files.set(path, entry);
  }
  return [...files].map(([path, e]) => ({
    path,
    totalLines: e.lines.size,
    coveredLines: [...e.lines.values()].filter((h) => h > 0).length,
    totalBranches: [...e.branches.values()].reduce((s, b) => s + b[1], 0),
    coveredBranches: [...e.branches.values()].reduce((s, b) => s + b[0], 0),
  }));
}

export function parseLcov(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      cur = { path: normalize(line.slice(3)), lines: new Map(), branches: [0, 0] };
    } else if (!cur) continue;
    else if (line.startsWith("DA:")) {
      const [nr, hits] = line.slice(3).split(",");
      cur.lines.set(nr, Math.max(cur.lines.get(nr) ?? 0, Number(hits)));
    } else if (line.startsWith("BRDA:")) {
      const taken = line.slice(5).split(",")[3];
      cur.branches[1] += 1;
      if (taken !== "-" && Number(taken) > 0) cur.branches[0] += 1;
    } else if (line === "end_of_record") {
      out.push({
        path: cur.path,
        totalLines: cur.lines.size,
        coveredLines: [...cur.lines.values()].filter((h) => h > 0).length,
        totalBranches: cur.branches[1],
        coveredBranches: cur.branches[0],
      });
      cur = null;
    }
  }
  return out;
}

export function parseIstanbulSummary(json) {
  return Object.entries(json)
    .filter(([key]) => key !== "total")
    .map(([key, v]) => ({
      path: normalize(key),
      totalLines: v.lines?.total ?? 0,
      coveredLines: v.lines?.covered ?? 0,
      totalBranches: v.branches?.total ?? 0,
      coveredBranches: v.branches?.covered ?? 0,
    }));
}

// coverage-final.json has statements, not lines; a line counts as covered when
// any statement starting on it ran, which matches how Istanbul derives lines.
export function parseIstanbulFinal(json) {
  return Object.entries(json).map(([key, v]) => {
    const lines = new Map();
    for (const [id, loc] of Object.entries(v.statementMap ?? {})) {
      const nr = loc.start.line;
      lines.set(nr, Math.max(lines.get(nr) ?? 0, v.s?.[id] ?? 0));
    }
    const branchCounts = Object.values(v.b ?? {}).flat();
    return {
      path: normalize(v.path ?? key),
      totalLines: lines.size,
      coveredLines: [...lines.values()].filter((h) => h > 0).length,
      totalBranches: branchCounts.length,
      coveredBranches: branchCounts.filter((c) => c > 0).length,
    };
  });
}

export function parseJacoco(xml) {
  const out = [];
  const pkgRe = /<package\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/package>/g;
  for (const [, pkg, body] of xml.matchAll(pkgRe)) {
    const fileRe = /<sourcefile\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/sourcefile>/g;
    for (const [, name, fileBody] of body.matchAll(fileRe)) {
      const counter = (type) => {
        const m = fileBody.match(
          new RegExp(`<counter\\s+type="${type}"\\s+missed="(\\d+)"\\s+covered="(\\d+)"`),
        );
        return m ? [Number(m[1]), Number(m[2])] : [0, 0];
      };
      const [lm, lc] = counter("LINE");
      const [bm, bc] = counter("BRANCH");
      out.push({
        path: normalize(pkg ? `${pkg}/${name}` : name),
        totalLines: lm + lc,
        coveredLines: lc,
        totalBranches: bm + bc,
        coveredBranches: bc,
      });
    }
  }
  return out;
}

// Go profiles count statements per block, not lines; statements are used as
// the line measure and branch coverage is not available.
export function parseGoCoverprofile(text) {
  const blocks = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+):(\d+\.\d+,\d+\.\d+) (\d+) (\d+)$/);
    if (!m) continue;
    const [, path, range, stmts, count] = m;
    const key = `${path}:${range}`;
    blocks.set(key, {
      path: normalize(path),
      stmts: Number(stmts),
      hit: (blocks.get(key)?.hit ?? false) || Number(count) > 0,
    });
  }
  const files = new Map();
  for (const b of blocks.values()) {
    const f = files.get(b.path) ?? { total: 0, covered: 0 };
    f.total += b.stmts;
    if (b.hit) f.covered += b.stmts;
    files.set(b.path, f);
  }
  return [...files].map(([path, f]) => ({
    path,
    totalLines: f.total,
    coveredLines: f.covered,
    totalBranches: 0,
    coveredBranches: 0,
  }));
}

const PARSERS = {
  cobertura: (raw) => parseCobertura(raw),
  lcov: (raw) => parseLcov(raw),
  "istanbul-summary": (raw) => parseIstanbulSummary(JSON.parse(raw)),
  "istanbul-final": (raw) => parseIstanbulFinal(JSON.parse(raw)),
  jacoco: (raw) => parseJacoco(raw),
  "go-coverprofile": (raw) => parseGoCoverprofile(raw),
};

export function parseReport(format, raw) {
  const parse = PARSERS[format];
  if (!parse) {
    throw new Error(`Unknown coverage format "${format}". Supported: ${Object.keys(PARSERS).join(", ")}`);
  }
  return parse(raw);
}

// --- Path resolution

// Reports carry absolute CI paths, paths relative to a sub-project, or Go
// module paths. A reported path is matched to a git-tracked file, first with
// the source's pathPrefix, then by its longest unambiguous suffix.
export function createResolver(repoFiles) {
  const tracked = new Set(repoFiles);
  const byBase = new Map();
  for (const f of repoFiles) {
    const base = f.slice(f.lastIndexOf("/") + 1);
    byBase.set(base, [...(byBase.get(base) ?? []), f]);
  }
  return (reported, pathPrefix = "") => {
    const path = normalize(reported);
    const prefix = normalize(pathPrefix).replace(/\/$/, "");
    const prefixed = prefix ? `${prefix}/${path}` : path;
    if (tracked.has(prefixed)) return prefixed;
    if (tracked.has(path)) return path;
    const segments = path.split("/").filter(Boolean);
    const sameName = byBase.get(segments.at(-1)) ?? [];
    for (let start = 0; start < segments.length; start++) {
      const suffix = segments.slice(start).join("/");
      const hits = sameName.filter((f) => f === suffix || f.endsWith(`/${suffix}`));
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) {
        const scoped = prefix ? hits.filter((f) => f.startsWith(`${prefix}/`)) : [];
        return scoped.length === 1 ? scoped[0] : null;
      }
    }
    return null;
  };
}

// --- Selection

function pct(covered, total) {
  return total ? Math.round((covered / total) * 1000) / 10 : null;
}

function tierOf(config, path) {
  const tiers = (config.tiers ?? []).filter((t) => matchesAny(t.paths, path));
  return tiers.length ? Math.max(...tiers.map((t) => t.tier)) : 1;
}

// A PR is capped in size, so a gap bigger than the cap is no more attractive
// than one that just fits; beyond it the least-covered file wins.
function score(candidate, config) {
  return Math.min(candidate.uncoveredLines, config.uncoveredCap ?? Infinity);
}

const coverageOf = (f) => f.coveredLines / (f.totalLines || 1);

export function selectCandidates({ reports, repoFiles, excluded = [], config }) {
  const resolve = createResolver(repoFiles);
  const notSource = config.notSource ?? DEFAULT_NOT_SOURCE;
  const byTarget = new Map();
  let unresolved = 0;

  for (const { source, files } of reports) {
    for (const f of files) {
      const path = resolve(f.path, source.pathPrefix);
      if (!path) {
        unresolved++;
        continue;
      }
      // The same file may appear in several reports (for example one per test
      // project); keep the best-covered view so a file is not under-reported.
      const prev = byTarget.get(path);
      if (prev && coverageOf(prev) >= coverageOf(f)) continue;
      byTarget.set(path, { ...f, path, stack: source.stack });
    }
  }

  const candidates = [...byTarget.values()]
    .filter((c) => c.totalLines > 0 && c.coveredLines < c.totalLines)
    .filter((c) => !config.include?.length || matchesAny(config.include, c.path))
    .filter((c) => !matchesAny(notSource, c.path))
    .filter((c) => !matchesAny(config.denylist, c.path))
    .filter((c) => !excluded.includes(c.path))
    .map((c) => ({
      target: c.path,
      stack: c.stack,
      tier: tierOf(config, c.path),
      uncoveredLines: c.totalLines - c.coveredLines,
      totalLines: c.totalLines,
      linePct: pct(c.coveredLines, c.totalLines),
      branchPct: pct(c.coveredBranches, c.totalBranches),
    }))
    .filter((c) => c.uncoveredLines >= (config.minUncoveredLines ?? 0))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        score(b, config) - score(a, config) ||
        a.linePct - b.linePct ||
        a.target.localeCompare(b.target),
    )
    .slice(0, config.limit ?? 5)
    .map((c, i) => ({ rank: i + 1, ...c }));

  return { candidates, unresolved };
}

// --- CLI

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main() {
  if (!arg("config")) {
    console.error(
      "Usage: select-coverage-candidates.mjs --config <config.json> [--exclude <excluded.json>] [--out <candidates.json>]",
    );
    process.exit(2);
  }
  const config = JSON.parse(readFileSync(arg("config"), "utf8"));
  const excluded = arg("exclude") ? JSON.parse(readFileSync(arg("exclude"), "utf8")) : [];
  const reports = [];
  for (const source of config.sources ?? []) {
    if (!existsSync(source.report)) {
      console.warn(`No ${source.format} report for "${source.stack}" at ${source.report}; skipping.`);
      continue;
    }
    reports.push({ source, files: parseReport(source.format, readFileSync(source.report, "utf8")) });
  }
  if (!reports.length) console.error("No coverage report could be read; nothing to select.");
  const repoFiles = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
  const { candidates, unresolved } = selectCandidates({ reports, repoFiles, excluded, config });
  writeFileSync(arg("out") ?? "candidates.json", `${JSON.stringify(candidates, null, 2)}\n`);
  if (unresolved) console.warn(`${unresolved} reported file(s) could not be mapped to a tracked file.`);
  console.log(`Selected ${candidates.length} candidate(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
