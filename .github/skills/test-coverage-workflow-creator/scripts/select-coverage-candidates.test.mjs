// Run with: node --test .github/skills/test-coverage-workflow-creator/scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createResolver,
  globToRegExp,
  parseCobertura,
  parseGoCoverprofile,
  parseIstanbulFinal,
  parseIstanbulSummary,
  parseJacoco,
  parseLcov,
  parseReport,
  selectCandidates,
} from "./select-coverage-candidates.mjs";

const lines = (n, hit) =>
  Array.from({ length: n }, (_, i) => `<line number="${i + 1}" hits="${i < hit ? 1 : 0}"/>`).join("");

test("cobertura merges nested classes of one file and ignores method-level duplicates", () => {
  const xml = `<coverage><packages><package><classes>
    <class name="Foo" filename="src\\App\\Foo.cs"><methods><method><lines>${lines(4, 4)}</lines></method></methods>
      <lines>${lines(4, 4)}<line number="5" hits="0" branch="True" condition-coverage="50% (1/2)"/></lines></class>
    <class name="Foo/Nested" filename="src\\App\\Foo.cs"><lines><line number="10" hits="0"/></lines></class>
  </classes></package></packages></coverage>`;
  assert.deepEqual(parseCobertura(xml), [
    { path: "src/App/Foo.cs", totalLines: 6, coveredLines: 4, totalBranches: 2, coveredBranches: 1 },
  ]);
});

test("lcov counts lines and taken branches per record", () => {
  const text = ["SF:/home/runner/work/r/r/web/src/a.ts", "DA:1,1", "DA:2,0", "BRDA:2,0,0,-", "BRDA:2,0,1,3", "end_of_record"].join("\n");
  assert.deepEqual(parseLcov(text), [
    { path: "/home/runner/work/r/r/web/src/a.ts", totalLines: 2, coveredLines: 1, totalBranches: 2, coveredBranches: 1 },
  ]);
});

test("istanbul summary skips the total entry", () => {
  const files = parseIstanbulSummary({
    total: { lines: { total: 9, covered: 9 } },
    "/ci/web/src/b.ts": { lines: { total: 10, covered: 3 }, branches: { total: 0, covered: 0 } },
  });
  assert.deepEqual(files, [{ path: "/ci/web/src/b.ts", totalLines: 10, coveredLines: 3, totalBranches: 0, coveredBranches: 0 }]);
});

test("istanbul final derives lines from statement start lines", () => {
  const [file] = parseIstanbulFinal({
    "/ci/src/c.js": {
      path: "/ci/src/c.js",
      statementMap: { 0: { start: { line: 1 } }, 1: { start: { line: 1 } }, 2: { start: { line: 2 } } },
      s: { 0: 0, 1: 2, 2: 0 },
      b: { 0: [1, 0] },
    },
  });
  assert.equal(file.totalLines, 2);
  assert.equal(file.coveredLines, 1);
  assert.equal(file.totalBranches, 2);
  assert.equal(file.coveredBranches, 1);
});

test("jacoco joins package and source file names", () => {
  const xml = `<report><package name="com/acme"><class name="com/acme/X"/><sourcefile name="X.java">
    <counter type="LINE" missed="7" covered="3"/><counter type="BRANCH" missed="1" covered="1"/></sourcefile></package></report>`;
  assert.deepEqual(parseJacoco(xml), [
    { path: "com/acme/X.java", totalLines: 10, coveredLines: 3, totalBranches: 2, coveredBranches: 1 },
  ]);
});

test("go coverprofile counts statements and merges repeated blocks", () => {
  const text = ["mode: set", "example.com/m/pkg/a.go:1.1,3.2 4 0", "example.com/m/pkg/a.go:1.1,3.2 4 1", "example.com/m/pkg/a.go:5.1,6.2 2 0"].join("\n");
  assert.deepEqual(parseGoCoverprofile(text), [
    { path: "example.com/m/pkg/a.go", totalLines: 6, coveredLines: 4, totalBranches: 0, coveredBranches: 0 },
  ]);
});

test("unknown formats are rejected with the supported list", () => {
  assert.throws(() => parseReport("clover", ""), /Supported: cobertura/);
});

test("resolver maps absolute, prefixed and module paths to tracked files", () => {
  const resolve = createResolver(["web/src/a.ts", "pkg/a.go", "api/src/Foo.cs", "lib/src/Foo.cs"]);
  assert.equal(resolve("/home/runner/work/r/r/web/src/a.ts"), "web/src/a.ts");
  assert.equal(resolve("src/a.ts", "web"), "web/src/a.ts");
  assert.equal(resolve("example.com/m/pkg/a.go"), "pkg/a.go");
  assert.equal(resolve("C:\\agent\\api\\src\\Foo.cs"), "api/src/Foo.cs");
  assert.equal(resolve("Foo.cs"), null, "an ambiguous file name must not be guessed");
  assert.equal(resolve("Foo.cs", "lib"), "lib/src/Foo.cs");
});

test("globs support ** at any depth and brace alternatives", () => {
  assert.ok(globToRegExp("**/*.{test,spec}.ts").test("a.test.ts"));
  assert.ok(globToRegExp("**/*.{test,spec}.ts").test("x/y/a.spec.ts"));
  assert.ok(globToRegExp("src/Gateway.*/**").test("src/Gateway.Api/x/y.cs"));
  assert.ok(!globToRegExp("src/*.cs").test("src/a/b.cs"));
});

const file = (path, total, covered) => ({ path, totalLines: total, coveredLines: covered, totalBranches: 0, coveredBranches: 0 });

test("selection filters denied, excluded, test and small targets, then ranks by tier and capped gap", () => {
  const repoFiles = ["src/Big.cs", "src/Huge.cs", "src/Small.cs", "src/Legacy/Old.cs", "src/Gateway/G.cs", "src/Done.cs", "src/Picked.cs", "web/a.test.ts"];
  const reports = [
    {
      source: { stack: "backend" },
      files: [
        file("/ci/src/Big.cs", 400, 100),
        file("/ci/src/Huge.cs", 1000, 500),
        file("/ci/src/Small.cs", 10, 0),
        file("/ci/src/Legacy/Old.cs", 900, 0),
        file("/ci/src/Gateway/G.cs", 900, 0),
        file("/ci/src/Done.cs", 50, 50),
        file("/ci/src/Picked.cs", 900, 0),
        file("/ci/unknown/Nope.cs", 900, 0),
      ],
    },
    { source: { stack: "frontend" }, files: [file("web/a.test.ts", 100, 0)] },
  ];
  const config = {
    minUncoveredLines: 20,
    uncoveredCap: 300,
    denylist: ["src/Gateway/**"],
    tiers: [{ tier: 3, paths: ["src/Legacy/**"] }],
  };
  const { candidates, unresolved } = selectCandidates({ reports, repoFiles, excluded: ["src/Picked.cs"], config });
  assert.equal(unresolved, 1);
  assert.deepEqual(
    candidates.map((c) => [c.target, c.tier]),
    [
      ["src/Big.cs", 1],
      ["src/Huge.cs", 1],
      ["src/Legacy/Old.cs", 3],
    ],
  );
  assert.equal(candidates[0].linePct, 25);
});

test("a file reported by two test projects keeps its best coverage", () => {
  const { candidates } = selectCandidates({
    reports: [
      { source: { stack: "backend" }, files: [file("src/A.cs", 100, 10)] },
      { source: { stack: "backend" }, files: [file("src/A.cs", 100, 60)] },
    ],
    repoFiles: ["src/A.cs"],
    config: {},
  });
  assert.equal(candidates[0].uncoveredLines, 40);
});
