# Stack recipes

Building blocks for `<<FETCH_COVERAGE_STEPS>>`, `<<BUILD_STEPS>>`, `<<VERIFY_COMMANDS>>`,
`<<NETWORK_ECOSYSTEMS>>` and `<<STACK_TEST_RULES>>`. Adapt the commands to what the repo
already does in CI: copying its working install/build commands is safer than inventing new ones.

Contents: [Sandbox rules](#sandbox-rules) · [Coverage fetch](#coverage-fetch) · [.NET](#net) ·
[Node / TypeScript](#node--typescript) · [Python](#python) · [JVM](#jvm) · [Go](#go) ·
[Private access](#private-access)

## Sandbox rules

These come from running the DT-Geminex workflow and apply to every stack:

- Custom `steps:` run **before** the agent, on the runner, with secrets. The agent then runs
  in the AWF firewall sandbox: no secrets, network limited to `network.allowed`, an empty
  `HOME`, and only `/tmp/gh-aw` and the workspace mounted read-write.
- So: install and build everything in `steps:`. The agent must only *rebuild* and *run
  tests*, never restore from a private feed.
- Package caches must live under `/tmp/gh-aw` (for example `NUGET_PACKAGES=/tmp/gh-aw/nuget`)
  or the agent cannot see them. Write such variables to `$GITHUB_ENV` in a setup step.
- `network.allowed` ecosystem names: `defaults`, `dotnet`, `node`, `python`, `java`, `go`,
  `rust`. Add one per covered stack.
- Big builds can run out of disk; keep the "Free disk space" step.

## Coverage fetch

Write the report to the path in `config.json` `sources[].report`, under
`/tmp/gh-aw/test-coverage/<stack>/`. Combine the sources per stack.

**ci-artifact** (with a committed fallback when one exists):

```yaml
  - name: Fetch the freshest <stack> coverage
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      set -uo pipefail
      mkdir -p /tmp/gh-aw/test-coverage/<stack>
      # Optional fallback: cp <committed report> /tmp/gh-aw/test-coverage/<stack>/
      run_id=$(gh run list --workflow <workflow-file> --branch <default-branch> --event push \
        --status success --limit 1 --json databaseId --jq '.[0].databaseId' || true)
      if [ -n "${run_id:-}" ]; then
        gh run download "$run_id" -n <artifact-name> -D /tmp/gh-aw/test-coverage/<stack> || true
      fi
      ls -R /tmp/gh-aw/test-coverage/<stack>
```

Artifacts unpack with their internal folder structure; set `report` to the real file path
inside, not just the folder. Artifacts expire (90 days by default), which is why the fallback
matters for repos with infrequent pushes.

**committed**: a single `cp <path> /tmp/gh-aw/test-coverage/<stack>/`.

**generate**: run the coverage command from the stack section below in a setup step
**after** the build step, writing into `/tmp/gh-aw/test-coverage/<stack>/`. Place the
"Select candidate targets" step after it.

## .NET

- Setup:
  ```yaml
  - uses: actions/setup-dotnet@v5
    with:
      dotnet-version: "<from global.json or csproj TargetFramework>"
  - name: Use a NuGet package cache the agent sandbox can read
    run: |
      mkdir -p /tmp/gh-aw/nuget
      echo "NUGET_PACKAGES=/tmp/gh-aw/nuget" >> "$GITHUB_ENV"
  - name: Restore and build
    working-directory: <root>
    env:
      DOTNET_CLI_TELEMETRY_OPTOUT: "1"
    run: |
      dotnet restore            # --locked-mode when packages.lock.json exists
      dotnet build -c Release --nologo --no-restore
  ```
- Coverage (generate): `dotnet test -c Release --no-build --collect:"XPlat Code Coverage" --results-directory /tmp/gh-aw/test-coverage/backend`
  writes one Cobertura file per test project under a GUID folder. Merge them with
  ReportGenerator (`-reporttypes:Cobertura`) or point `report` at the merged file.
- Verify: `dotnet test --project <test project> -c Release --no-restore` (Microsoft Testing
  Platform, `--filter-class`) or `dotnet test <test project> -c Release --no-restore --filter "FullyQualifiedName~<Class>"`
  (VSTest). Check which runner the repo uses: the filter syntax differs and the wrong one fails.
  Keep `--no-restore`, never `--no-build`, so the new tests are compiled.
- Network: `dotnet`.

## Node / TypeScript

- Setup:
  ```yaml
  - uses: actions/setup-node@v6
    with:
      node-version: "<from .nvmrc / engines>"
  - run: corepack enable            # yarn berry / pnpm
  - name: Install dependencies
    working-directory: <root>
    run: <yarn install --immutable | pnpm install --frozen-lockfile | npm ci>
  ```
- Coverage (generate): Jest `--coverage --coverageReporters=json-summary` → `istanbul-summary`;
  Vitest `--coverage --coverage.reporter=lcov` → `lcov`. Both report absolute paths, which the
  selector resolves.
- Verify: `<pm> jest <test file> --coverage=false` or `<pm> vitest run <test file>`, then the
  repo's typecheck / lint / format scripts.
- Network: `node`.

## Python

- Setup: `actions/setup-python@v5`, then the repo's install (`pip install -e .[test]`,
  `poetry install`, `uv sync`). Create the venv inside the workspace so the agent can use it.
- Coverage (generate): `pytest --cov=<package> --cov-report=xml:/tmp/gh-aw/test-coverage/python/coverage.xml`
  → `cobertura`. Report paths are relative to the `<source>` root; set `pathPrefix` to it.
- Verify: `pytest <test file> -q --no-cov`.
- Network: `python`.

## JVM

- Setup: `actions/setup-java@v4` with the repo's distribution and version, then
  `./mvnw -B -DskipTests install` or `./gradlew assemble testClasses`. Pre-fetch everything:
  the agent cannot reach private Maven repos.
- Coverage (generate): JaCoCo XML (`jacoco:report`, `jacocoTestReport`) → `jacoco`. Paths are
  package-relative (`com/acme/X.java`); the suffix resolver handles them.
- Verify: `./mvnw -B -o test -Dtest=<Class>` or `./gradlew test --offline --tests <Class>`.
- Network: `java`.

## Go

- Setup: `actions/setup-go@v5` with `go-version-file: go.mod`, then `go mod download` and
  `go build ./...`. Set `GOMODCACHE=/tmp/gh-aw/gomod` and `GOCACHE=/tmp/gh-aw/gocache` via
  `$GITHUB_ENV` so the agent sees the caches.
- Coverage (generate): `go test ./... -coverprofile=/tmp/gh-aw/test-coverage/go/cover.out`
  → `go-coverprofile` (statements are used as lines; no branch data).
- Verify: `go test ./<pkg>/ -run <TestName> -count=1`.
- Network: `go`.

## Private access

| Need | Step |
|------|------|
| GitHub Packages in the same org | `GITHUB_TOKEN` in the setup step env (for example `NuGetPackageSourceCredentials_<source>=Username=x;Password=${{ secrets.GITHUB_TOKEN }}`, or an `.npmrc` auth step). Add `packages: read` only if the compiler asks; `permissions: read-all` covers it. |
| Private submodules or cross-repo packages | `actions/create-github-app-token@v3` with `client-id: ${{ vars.<VAR> }}`, `private-key: ${{ secrets.<SECRET> }}`, `owner`, `repositories`; then `git -c "url.https://x-access-token:${APP_TOKEN}@github.com/.insteadOf=https://github.com/" submodule update --init --recursive` |
| A PAT | the same, reading `${{ secrets.<NAME> }}`; prefer an App token, which is scoped and short-lived |

Tokens stay in `steps:`; they never reach the agent prompt or the sandbox.
