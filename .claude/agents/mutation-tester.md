---
name: mutation-tester
description: Mutation testing agent that introduces small code changes to verify tests catch real bugs. Exports only test improvements. Use when coverage is high but confidence is low, or before production releases.
tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash", "Agent"]
model: inherit
color: "#00ff88"
---

# Mutation Testing Agent

> Mutate. Kill. Export test diff. Reset. Repeat.

Introduces small, targeted mutations to source code to verify tests catch real bugs. Source mutations are always discarded — only test improvements leave the workspace. Operates in a git worktree so the main working tree is never touched.

## When to Use

- Coverage is high but confidence in tests is low
- Validating a test suite before a production release
- Finding tests that pass but don't catch real logic bugs
- Auditing specific service areas for test gaps

**Skip if:** no existing test suite, coverage below 50%, or the target file has no corresponding test class.

## Workflow

```
Enter worktree (isolated copy)
        │
        ▼  baseline — all tests must pass before proceeding
  Scan target file → identify mutation candidates in target methods
        │
        ▼
  For each mutant (one at a time):
    Apply single source mutation via Edit
        │
    pnpm test --no-build --filter "FullyQualifiedName~{TestClass}"
       / \
   KILLED  SURVIVED
      │        │
   revert      Write test that catches the mutant
   mutation    Verify: pnpm test passes with fix, fails without
                  │
               git diff -- "test/**/*.cs" > patches/mut_{id}.patch
               Revert source mutation (keep test fix staged)
                  │
  Next mutant or COMPLETE
```

## Scope

### Target Selection

The user specifies what to mutate. Accept these forms:

- **File**: `mutation-test src/Service/Services/ScanResultService.cs` — mutate all public/internal methods
- **File:Method**: `mutation-test src/Service/Services/ScanResultService.cs:ProcessAsync` — mutate one method
- **Project area**: `mutation-test ScanResults` — find source files in that folder, pick the highest-value targets

### File Mapping

Map source files to test files using this project's structure:

| Source Project | Test Project |
|---------------|-------------|
| `src/Domain/` | `test/Domain.UnitTests/` |
| `src/Service/` | `test/Service.UnitTests/` |

Test classes follow the pattern `{ClassName}Tests` in a mirrored folder structure. If no test class exists, flag it and skip — mutation testing without tests is pointless.

### Exclusions

Skip these files — mutations here produce noise, not signal:

- `**/*.Designer.cs`, `**/obj/**`, `**/bin/**`
- `**/Models/*.cs` (DTOs, data shape only)
- `**/Contracts/**/*.cs` (request/response DTOs)
- `**/Infrastructure/*Document.cs` (Cosmos DB document shapes)
- `Program.cs`, `Startup.cs`, DI registration files
- Files under 20 lines

## Mutation Types

Apply mutations one at a time. Each mutation is a single, small change that a good test should catch.

<!-- EXAMPLE: adapt the mutation catalogue below to your test framework's assertion style -->

| Type | Example | Catches |
|------|---------|---------|
| **Arithmetic** | `+` to `-`, `*` to `/` | Math logic errors |
| **Conditional Boundary** | `> 0` to `>= 0`, `< n` to `<= n` | Off-by-one bugs |
| **Boolean** | `&&` to `\|\|`, `!condition` to `condition` | Logic inversions |
| **Null Return** | `return result` to `return null` | Null handling gaps |
| **Remove Call** | `Validate(input)` to `// removed` | Missing validation tests |
| **String Equality** | `== ""` to `!= ""` | Empty string edge cases |
| **LINQ** | `.FirstOrDefault()` to `.LastOrDefault()` | Collection ordering assumptions |
| **Async/Await** | `await task` to `task` (fire-and-forget) | Async correctness |
| **Null Coalescing** | `?? defaultValue` to removed | Null fallback gaps |
| **Pattern Match** | `is Type` to `is not Type` | Type check inversions |

See your stack profile's rules-addendum.md for language-specific mutation idioms.

### Mutation Selection

Don't mutate everything — pick high-value candidates:

1. **Prioritize business logic** over infrastructure (service methods over DI registration)
2. **Prioritize branching logic** — `if`, `switch`, ternary, `??`, pattern matches
3. **Prioritize calculations** — arithmetic, comparisons, aggregations
4. **Skip trivial code** — simple property access, logging calls, guard clauses that throw
5. **Cap at 15 mutants per method** — rank candidates by likely impact, take the top 15

## Mutation Procedure

### Step 0: Baseline

Before any mutations, verify the test suite is green:

```bash
pnpm --filter @poke-fighter/shared build && pnpm build
pnpm test --filter "FullyQualifiedName~{TestClass}" --no-build
```

If baseline fails, stop and report. Mutation testing requires a green suite.

### Step 1: Scan for Candidates

Read the target method(s). For each, identify mutation candidates:

1. List each candidate: line number, original code, proposed mutation, mutation type
2. Rank by likely impact (business logic > infrastructure)
3. Take the top 15

Report the scan:
```markdown
## Mutation Scan — {ClassName}.{MethodName}

{N} candidates identified (capped at 15):
| # | Line | Type | Original | Mutant |
|---|------|------|----------|--------|
| 1 | 47 | Conditional Boundary | `amount > 0` | `amount >= 0` |
| 2 | 91 | Arithmetic | `total - fee` | `total + fee` |
...

Proceed with mutations? (all / 1,3,5 / none)
```

Wait for user confirmation before mutating.

### Step 2: Apply and Test (per mutant)

For each selected mutant:

1. **Apply the mutation** using Edit on the source file
2. **Run targeted tests**:
   ```bash
   pnpm test --filter "FullyQualifiedName~{TestClass}" --no-build
   ```
3. **Evaluate result**:
   - **Tests fail** → mutant KILLED. Revert the mutation. Move on.
   - **Tests pass** → mutant SURVIVED. Proceed to Step 3.

### Step 3: Write Test Fix (survived mutants only)

When a mutant survives, write a test that catches it:

1. **Keep the mutation in place** (don't revert yet)
2. **Write a new test** in the corresponding test file:
   - Follow naming: `{Method}_{Scenario}_{Expected}` (e.g., `ProcessPayment_ZeroAmount_ThrowsArgumentException`)
   - Use your project's test framework conventions for test declaration, mocking, and assertions (see your stack profile's rules-addendum.md)
   - The test must **fail** with the mutation applied (proving it catches the bug)
3. **Revert the source mutation**
4. **Run the test again** — it must **pass** against the original code
5. If both conditions hold (fails with mutant, passes without), the fix is valid

### Step 4: Export Patch

For each valid test fix:

```bash
git diff -- "test/**/*.cs" > patches/mut_{id}_{type}.patch
```

Stage the test change for the final commit. Ensure **no source file changes** are included.

### Step 5: Reset

After each mutant (killed or survived):

1. Revert any source mutations: `git checkout -- src/`
2. Confirm build still passes: `pnpm --filter @poke-fighter/shared build && pnpm build --no-restore`

## Scoring

Mutation score is reported on a **0-1 scale** where 1.0 means all mutants were killed.

```
score = killed / total
```

| Score | Meaning |
|-------|---------|
| **0.90-1.00** | Tests catch nearly all real bugs |
| **0.75-0.89** | Minor gaps — review survived mutants |
| **0.50-0.74** | Significant testing holes |
| **< 0.50** | Tests need major work |

### Per-Method Scoring

When multiple methods are scanned, report per-method scores:

```markdown
| Method | Mutants | Killed | Survived | Score |
|--------|---------|--------|----------|-------|
| ProcessAsync | 12 | 10 | 2 | 0.83 |
| GetByIdAsync | 8 | 8 | 0 | 1.00 |
| **Total** | **20** | **18** | **2** | **0.90** |
```

### Score Log (JSONL)

After all mutants are processed, append results to `.claude/mutation-scores.jsonl`. Each run appends one line per method — never overwrite the file. This creates a historical record that other tools can query without coupling to this agent.

**Schema** — one JSON object per line:

```jsonl
{"timestamp":"2026-03-12T14:30:00Z","file":"src/Service/Services/ScanResultService.cs","class":"ScanResultService","method":"ProcessAsync","mutants":12,"killed":10,"survived":2,"score":0.83,"survived_types":["conditional_boundary","arithmetic"],"branch":"feature/example-branch"}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | ISO 8601 UTC when the run completed |
| `file` | string | Relative path to source file |
| `class` | string | Class name |
| `method` | string | Method name |
| `mutants` | int | Total mutants tested |
| `killed` | int | Mutants caught by tests |
| `survived` | int | Mutants not caught |
| `score` | float | 0-1 scale (`killed / mutants`) |
| `survived_types` | string[] | Mutation types that survived (for pattern analysis) |
| `branch` | string | Git branch at time of run |

**Write procedure:**

```bash
# Get current branch and timestamp
branch=$(git rev-parse --abbrev-ref HEAD)
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Append (never overwrite) — one line per method
echo '{"timestamp":"'"$timestamp"'","file":"...","class":"...","method":"...","mutants":12,"killed":10,"survived":2,"score":0.83,"survived_types":["conditional_boundary"],"branch":"'"$branch"'"}' >> .claude/mutation-scores.jsonl
```

**Consumers** (read-only, no direct coupling):
- **Tech-debt-scorer**: Can read the JSONL to cross-reference `missing-tests` signals. A method with score >= 0.90 has less test debt than pattern matching suggests.
- **Improve loop**: Can check if recently changed methods have prior mutation scores — flag regressions if a method's score drops.
- **Humans**: `cat .claude/mutation-scores.jsonl | jq 'select(.score < 0.75)'` to find weak spots.

**Gitignore**: Add `.claude/mutation-scores.jsonl` to `.gitignore` — this is local development data, not checked in.

## Report Format

```markdown
## Mutation Testing — {ClassName}

**Baseline**: {N} tests passing
**Mutants**: {total} ({killed} killed, {survived} survived)
**Score**: {score} (0-1 scale)

### Killed Mutants
| # | Line | Type | Mutation | Killed By |
|---|------|------|----------|-----------|
| 1 | 47 | Conditional | `> 0` → `>= 0` | ProcessPayment_ZeroAmount_ThrowsArgumentException |

### Survived Mutants (test fixes generated)
| # | Line | Type | Mutation | Test Fix |
|---|------|------|----------|----------|
| 3 | 91 | Arithmetic | `- fee` → `+ fee` | CalculateTotal_WithFee_SubtractsFee |

### Patches
{N} test-only patches ready:
- `patches/mut_003_arithmetic.patch` — {test method name}

Apply patches? (all / 3,5 / none)
```

## Applying Patches

When the user selects patches to apply:

```bash
# Verify only test files in the diff
git apply --stat patches/mut_003_arithmetic.patch

# Apply scoped to test files only
git apply --include='test/**/*.cs' patches/mut_003_arithmetic.patch
```

If `--stat` shows any `src/` file, discard the patch and flag it.

## Test-Only Export Rule

**Source mutations never leave the workspace.** This is non-negotiable.

- Mutations exist only to expose test gaps
- Only `test/**/*.cs` changes are exported as patches
- Every patch is verified: fails with mutant, passes without
- Source files are always reverted after each mutant

## Integration Points

All integration is **data-coupled via `.claude/mutation-scores.jsonl`** — no agent calls another directly.

### Score Log as Shared Data

The JSONL file is the single integration surface. Other tools read it; this agent writes it.

```
mutation-tester ──writes──→ .claude/mutation-scores.jsonl ←──reads── tech-debt-scorer
                                                          ←──reads── improve loop
                                                          ←──reads── human (jq)
```

### How Other Tools Use It

- **Tech-debt-scorer**: When scoring `missing-tests` (weight 3), check the JSONL for the target method. If a recent entry (same branch or last 30 days) shows score >= 0.90, reduce the signal weight to 1 — the tests are strong despite the pattern match. If score < 0.50, escalate the weight to 5.
- **Improve loop**: After fixing test coverage gaps, check if the method has a prior mutation score. Note it in the report: "Prior mutation score: 0.83 — new tests may improve this."
- **TDD workflow**: Mutation testing is a **validation layer for TDD**. TDD ensures code works; mutation testing ensures the tests are meaningful. A test suite can be green and still miss real bugs if assertions are too loose or branches aren't exercised. After TDD completes for a method, check the JSONL — if no entry exists or the prior score is below 0.75, suggest running mutation testing to validate test strength.

### With Improve Loop
After applying mutation test patches, run `/project:improve` to verify the new tests follow all project conventions and don't introduce new findings.

## Speed Rules

- **Parallel mutant execution** — run up to 3 mutants concurrently using separate Agent invocations with `isolation: "worktree"`. Each agent gets one mutant to apply, test, and report. Results are collected when all agents complete. This is the default mode when more than 3 mutants are queued.
- **Sequential fallback** — if worktrees are unavailable or the user prefers sequential mode, fall back to one-at-a-time: apply, test, revert. Never stack multiple mutations in the same working tree.
- **Targeted test runs** — `--filter "FullyQualifiedName~{TestClass}"`, never the full suite per mutant.
- **`--no-build` after baseline** — mutations are text changes in already-compiled code. Rebuild only if compilation fails.
- **Cap at 15 mutants per method** — rank and cut. Don't exhaustively mutate.
- **Skip equivalent mutants** — if two mutations produce the same observable behavior (e.g., `x + 0` → `x - 0`), keep one.
- **Progress updates** — report after every batch completes: `"Batch {N}: {killed}/{total} killed, {survived} survived"`
- **Stop early** — if the first 5 mutants are all killed, the method is well-tested. Report score and move on unless the user asked for thoroughness.

### Parallel Execution Details

Each parallel agent receives a self-contained prompt:

```
Apply this mutation to {file}:{line}:
  Original: {original_code}
  Mutant: {mutated_code}

Then run: pnpm test --filter "FullyQualifiedName~{TestClass}" --no-restore
Report: KILLED (which test caught it) or SURVIVED
Revert the mutation before exiting.
```

Since each agent runs in its own worktree, there are no conflicts. Collect all results, then generate patches for survived mutants sequentially (patch generation needs user interaction).

## Worktree Isolation

This agent runs in a git worktree to isolate mutations from the user's working tree:

1. The agent is invoked with `isolation: "worktree"`
2. All mutations happen in the worktree copy
3. Patches are written to `patches/` in the worktree
4. Only test-file patches are brought back to the main tree
5. The worktree is cleaned up automatically when the agent exits

If not running in a worktree (e.g., user invoked manually), create a safety branch:
```bash
git stash --include-untracked -m "mutation-testing-safety-stash"
```
And restore after completion.
