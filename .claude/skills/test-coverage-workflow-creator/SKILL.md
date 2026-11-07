---
name: test-coverage-workflow-creator
argument-hint: "path to target repo (default: current directory)"
description: >-
  Interview the user and generate a GitHub Agentic Workflow (gh-aw) that raises test
  coverage one small step per night: setup steps fetch the latest coverage report, a
  bundled script ranks uncovered files, and an AI agent adds unit tests for one of them
  and opens a draft PR limited to test files. Supports .NET, Node/TypeScript, Python,
  JVM and Go, with Cobertura, LCOV, Istanbul, JaCoCo and Go cover profiles. Use this
  skill whenever the user wants a "test coverage workflow", "nightly coverage agent",
  "coverage improver", "agent that writes tests every night", "automate raising
  coverage", wants to copy the DT-Geminex test-coverage.md / test-coverage.lock.yml
  idea to another repository, or asks to set up gh-aw for adding unit tests
  automatically, even if they do not say "gh-aw" or "workflow".
---

# Test Coverage Workflow Creator

You set up, in a target repository, an agentic workflow that raises test coverage by
one reviewable draft PR per run. The design is the one proven in DT-Geminex
(`.github/workflows/test-coverage.md`); this skill turns it into a repeatable,
interview-driven setup for any repository.

## How the generated workflow works

Explain this to the user up front, in a few lines, so the questions make sense:

1. **Pre-activation**: the run is skipped when a PR with the title prefix is already open,
   so drafts never pile up.
2. **Setup steps** (on the runner, with secrets, no AI):
   - Collect targets that must not be picked again. These come from the
     `Coverage target:` line in open, rejected-labelled or recently merged PRs.
   - Download the freshest coverage report.
   - Run `select-coverage-candidates.mjs`, which applies the denylist, priority tiers and
     size thresholds in code and writes `candidates.json` (at most 5).
   - Build and install dependencies, because the sandbox has no secrets.
3. **Agent** (sandboxed, read-only token, firewall-limited network): reads the repo
   conventions, picks one candidate, writes tests only, runs them, reviews its diff, then
   requests a PR or calls `noop`.
4. **Threat detection and safe outputs**: a separate job scans the patch, and only then
   creates the draft PR. It rejects files outside `allowed-files` and enforces a
   file-count limit and an expiry.

Why this shape: the agent never has to be trusted with scope (the script and
`safe-outputs` enforce it), it never sees a secret, and each PR is small enough to
review in minutes.

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| Target repository path | Yes | Local checkout to add the workflow to. Defaults to the current directory. |
| Previous answer record | No | JSON from an earlier run (see [references/interview.md](references/interview.md)) to update an existing setup. |

## Workflow

### 1. Check prerequisites

- The target is a git repo hosted on GitHub (`gh repo view`).
- `gh aw` is available (`gh aw version`). If not, tell the user to install it with
  `gh extension install github/gh-aw` and continue; compilation waits for step 6.
- If `.github/workflows/test-coverage.md` already exists, ask whether to update it
  (re-use its values as defaults) or stop.

### 2. Discover

Do the read-only discovery in [references/interview.md](references/interview.md#discovery)
so that every question has a sensible default. Briefly tell the user what you found
(stacks, test layout, coverage sources, conventions files, private dependencies).

### 3. Interview

Ask the four forms from [references/interview.md](references/interview.md) with
`AskUserQuestion`, in order: stacks and test commands → coverage source → scope and
safety → access and run settings. Pre-fill every field from discovery (put the detected
value first, labelled "(Recommended)") and skip any form whose answers are already
certain. Store the answers as the answer record in the scratchpad directory.

The most important answers are the **coverage source** and the **setup commands**. A wrong
report path silently yields zero candidates, and a missing install step makes the agent fail
inside the sandbox. Probe these if anything is vague.

### 4. Preview the plan

Before writing files, show the user:

- the files to be created (below)
- the setup steps in order, the allowed and excluded globs, the limits, and the schedule
- the secrets and variables the workflow will need (names only)

Wait for confirmation. Adjust and re-preview when the user changes something.

### 5. Generate

Create in the target repo:

| File | Source |
|------|--------|
| `.github/workflows/test-coverage.md` | [templates/test-coverage.md.template](templates/test-coverage.md.template) with every `<<PLACEHOLDER>>` filled |
| `.github/scripts/select-coverage-candidates.mjs` | copy of [scripts/select-coverage-candidates.mjs](scripts/select-coverage-candidates.mjs), unchanged |
| `.github/scripts/select-coverage-candidates.test.mjs` | copy of the test file, so the target repo can keep the script honest |
| `.github/test-coverage/config.json` | built from the answers; shape in [templates/config.example.json](templates/config.example.json) |

If the repo already uses `.github/scripts` or another script folder differently, follow the
repo's convention and update the paths in the workflow.

Filling the template:

- Use [references/stack-recipes.md](references/stack-recipes.md) for the fetch, build and
  verify steps per stack. Prefer the commands the repo's existing CI already runs.
- `<<ALLOWED_FILES>>` lists only test globs. `<<EXCLUDED_FILES>>` lists the denylist and
  matching test globs for denied areas. Both are YAML list items indented to match.
- `<<COOLDOWN_SECONDS>>` is cool-down days × 86400.
- `<<CONVENTION_FILES>>`, `<<STACK_TEST_RULES>>` and `<<VERIFY_COMMANDS>>` are markdown
  bullets. Keep stack-specific rules under a label (`- Backend: ...`).
- Drop `<<COVERAGE_GOAL>>` when there is no goal, and remove any optional block that does
  not apply. Leave no `<<` marker behind: search the output for `<<` before moving on.
- `config.json`: `sources[].report` must be the exact file path the fetch step produces;
  `include` is the source globs; `denylist` and `tiers[].paths` come from Form 3.

### 6. Validate

Run, from the target repo root, and fix anything that fails:

1. `node --test .github/scripts/select-coverage-candidates.test.mjs`
2. When a coverage report is reachable locally (committed, or downloadable with
   `gh run download`), run the selector against it with the real config and show the
   candidates. If there are zero, find out why before going on: usually the report path, the
   format, `pathPrefix`, or an `include` glob that matches nothing.
3. `gh aw compile test-coverage`. This produces `.github/workflows/test-coverage.lock.yml`.
   Never hand-edit the lock file; change the `.md` and recompile. The lock file header lists
   the secrets the workflow needs; cross-check them against the plan.

### 7. Hand over

Tell the user what is left for them, as a checklist:

- [ ] Add the engine secret (for Copilot: `COPILOT_GITHUB_TOKEN`) and any private-access
      secrets or variables.
- [ ] Create the labels (`gh label create`), including the rejected label.
- [ ] Commit the `.md`, the `.lock.yml`, the script, its test and the config. Offer the
      `git-workflow-orchestrator` skill. Do not commit or push without the user's go-ahead.
- [ ] After merging to the default branch, start a first run manually
      (`gh aw run test-coverage` or `gh workflow run test-coverage.lock.yml`) and review the
      draft PR.
- [ ] Explain the review loop. If a PR is bad, close it with the rejected label so its target
      is never picked again. A closed PR without the label lets the target come back once
      the PR is no longer open.

## Rules

- Generated PRs may only touch test files. Keep production paths out of `allowed-files`,
  even if the user asks for "small fixes too". Suggest a separate workflow for that instead.
- Keep secrets in `steps:`. Never place a secret, token, or credential in the prompt body,
  in `config.json`, or in the answer record.
- Do not weaken the sandbox to make something work: no `network: { allowed: ["*"] }`, and no
  `strict: false`. Move the failing work into a setup step instead.
- When adapting DT-Geminex specifics (Geminex paths, HSC, gateway exclusions, private
  `MetsoOutotec` actions), keep the *pattern*, not the names.
