# Interview

The skill asks in **four short forms**, one topic each, through the `ask_user` tool.
Every field is pre-filled with what discovery found, so the user mostly confirms.
Only ask a field that discovery could not settle; drop a form when every field in it
is already certain. Never ask in plain text.

Contents: [Discovery](#discovery) · [Form 1](#form-1--stacks-and-test-commands) ·
[Form 2](#form-2--coverage-source) · [Form 3](#form-3--scope-and-safety) ·
[Form 4](#form-4--access-and-run-settings) · [Answer record](#answer-record)

## Discovery

Run these before the first form. They are read-only.

| Fact | Where to look |
|------|---------------|
| Repository and default branch | `gh repo view --json nameWithOwner,defaultBranchRef` |
| Stacks | `*.sln`/`*.csproj` (.NET), `package.json` (Node), `pyproject.toml`/`setup.cfg`/`requirements*.txt` (Python), `pom.xml`/`build.gradle*` (JVM), `go.mod` (Go). Note the folder of each; that is the stack root. |
| Package manager | `yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`, `packageManager` in `package.json`, `poetry.lock`, `uv.lock` |
| Test framework and layout | test dependencies in the manifests; where existing tests live (`test/`, `tests/`, `__tests__/`, `*.test.ts`, `src/test/java`, `*_test.go`) |
| Existing coverage in CI | grep `.github/workflows/*.y*ml` for `coverlet`, `XPlat Code Coverage`, `--coverage`, `coverageReporters`, `pytest-cov`, `jacoco`, `-coverprofile`, `upload-artifact`. Record the **workflow file**, the **artifact name** and the **report file + format**. |
| Committed coverage | `git ls-files | grep -iE 'coverage|lcov|cobertura'` |
| Conventions files | `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/*.md`, `CONTRIBUTING.md`, `GLOSSARY.md`, testing docs |
| Private dependencies | `NuGet.config` with non-nuget.org sources, `.npmrc`/`.yarnrc.yml` scopes on `npm.pkg.github.com`, `.gitmodules` (private submodules), `pip.conf`/extra index URLs, private Maven repos |
| gh-aw already in use | `.github/workflows/*.md` with a `.lock.yml` twin, `.github/aw/` |
| Generated or no-touch areas | migration folders, `generated/`, vendored code, `*.g.cs`, lockfiles; any "do not edit" rule in the conventions files |

## Form 1 — Stacks and test commands

One set of fields **per detected stack**. If there are more than two stacks, ask
first which stacks the workflow should cover (multi-select), then ask the rest.

| Field | Type | Default from discovery |
|-------|------|------------------------|
| Stacks to cover | multi-select | every detected stack |
| `<stack>` label | string | `backend`, `frontend`, or the folder name |
| Source glob | string | `<root>/src/**` |
| Test file locations (globs the agent may write) | string | from the existing test layout |
| Install/build command (run in setup, outside the sandbox) | string | per [stack-recipes.md](stack-recipes.md) |
| Single-test command the agent uses to verify | string | per stack-recipes.md, with a placeholder for the test path |
| Extra checks after tests (typecheck, lint, format) | string | scripts present in `package.json`, `ruff`, `dotnet format` |
| Test rules worth repeating to the agent | string | framework, mocking library, traits/markers found in conventions |

## Form 2 — Coverage source

The agent never measures coverage itself; a setup step must put a report on disk.
Ask per stack:

| Field | Type | Options |
|-------|------|---------|
| Where the report comes from | enum | `ci-artifact` — download from the latest successful run of an existing workflow on the default branch (preferred: cheapest and fresh) · `committed` — a report file already in the repo · `generate` — run the tests with coverage during setup (slowest; adds the full test run to every night) |
| Workflow file (ci-artifact) | string | detected workflow |
| Artifact name (ci-artifact) | string | detected artifact |
| Report path inside the artifact / repo | string | detected |
| Format | enum | `cobertura`, `lcov`, `istanbul-summary`, `istanbul-final`, `jacoco`, `go-coverprofile` |
| Path prefix | string | the stack root, when report paths are relative to it (LCOV from a sub-project); empty otherwise |

If the stack has **no coverage at all**, say so, recommend `generate`, and offer to
add a coverage reporter to the project's test configuration as a separate change.

When both `ci-artifact` and `committed` exist, use the artifact first and fall
back to the committed copy (the DT-Geminex pattern): committed snapshots go stale
when CI cannot push them.

## Form 3 — Scope and safety

| Field | Type | Default |
|-------|------|---------|
| Denylist globs (never picked, never written) | string | migrations, generated code, vendored code, any area the conventions mark as no-touch |
| Low-priority globs (tier 3: only when nothing else is left) | string | empty; suggest areas the user calls legacy or high tech debt |
| Conventions files the agent must read first | multi-select | discovered files |
| Max changed files per PR | integer | 5 |
| Max added lines per PR | integer | 300 |
| Minimum uncovered lines for a candidate | integer | 20 |
| Coverage goal sentence for the prompt | string | empty (e.g. "first above 40%, ultimately 80%") |

## Form 4 — Access and run settings

| Field | Type | Default |
|-------|------|---------|
| Engine | enum | `copilot` (secret `COPILOT_GITHUB_TOKEN`) · `claude` (`ANTHROPIC_API_KEY`) · `codex` (`OPENAI_API_KEY`) |
| Schedule | enum | `daily` (gh-aw scatters the time) · `weekly` · custom cron |
| Title prefix | string | `[test-coverage]` |
| Labels | string | `tests, automation, test-coverage` |
| Rejected label (blocks a target permanently) | string | `test-coverage-rejected` |
| Cool-down after a merge, days | integer | 30 |
| Draft PR expiry | string | `7d` |
| Agent timeout, minutes | integer | 45 |
| Private package feed / submodule access | enum | `none` · `GITHUB_TOKEN is enough` · `GitHub App token` (ask for the client-id variable and private-key secret names) · `PAT secret` (ask for the secret name) |

Only ask for secret **names**. Never ask for or echo a secret value.

## Answer record

Keep the answers in this shape in the session workspace (not in the target repo),
so a re-run or an edit starts from them:

```json
{
  "repo": "owner/name",
  "defaultBranch": "main",
  "stacks": [
    {
      "label": "backend",
      "root": "src",
      "sourceGlobs": ["src/**"],
      "testGlobs": ["tests/**"],
      "setup": "dotnet restore --locked-mode && dotnet build -c Release --no-restore",
      "verify": "dotnet test tests/<Project>/<Project>.csproj -c Release --no-restore",
      "extraChecks": [],
      "testRules": "xUnit, NSubstitute, [Trait(\"category\",\"unit\")]",
      "coverage": { "source": "ci-artifact", "workflow": "ci.yml", "artifact": "coverage", "file": "coverage.cobertura.xml", "format": "cobertura", "pathPrefix": "" }
    }
  ],
  "denylist": [],
  "lowPriority": [],
  "conventionFiles": [],
  "limits": { "files": 5, "lines": 300, "minUncovered": 20 },
  "engine": "copilot",
  "schedule": "daily",
  "titlePrefix": "[test-coverage]",
  "labels": ["tests", "automation", "test-coverage"],
  "rejectedLabel": "test-coverage-rejected",
  "cooldownDays": 30,
  "expires": "7d",
  "timeoutMinutes": 45,
  "privateAccess": { "kind": "none" }
}
```
