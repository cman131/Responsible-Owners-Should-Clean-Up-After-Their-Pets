---
name: tech-debt-scorer
description: Scans source code for tech debt signals, scores files and areas, and routes high-debt areas to story-author for cleanup story generation.
triggers:
  - tech debt
  - code quality scan
  - debt score
  - cleanup assessment
---

# Tech Debt Scorer

Detect, score, and route tech debt. Scores at **method and constructor level** — not whole files — so that cleanup stories map to small, meaningful units of work. Reports only the **top 3 improvements** to avoid overwhelming the user. When improvements exceed the threshold, generates a structured payload for the `story-author` agent to create a cleanup story.

## When to Use

- **Plan critique (Phase 3.5 step 5)**: Scan files the plan will modify — flag debt before building on it
- **On-demand scan**: `/tech-debt scan [path]` to audit a specific area
- **Post-improve check**: After the improve loop, scan the changed files for residual debt

## Scoring Model

Scoring targets **individual methods and the constructor** — not the file as a whole. This keeps findings actionable: each scored item maps to a small, specific cleanup task.

### Scan Units

For each target file, identify these scan units:

- **Constructor** — the constructor method or primary constructor declaration
- **Each public/exported method** — scored independently
- **Class-level signals** — a small set of signals that apply to the class/module as a whole (file length, god-class indicator)

### Debt Signals

Each signal has a **weight** (1-5) and a **scope** (method or class). These are the stack-neutral signals every project scans for; see `profiles/<your-stack>/tech-debt-scorer-addendum.md` for language-specific signals (specific linter rules, analyzer warnings) to add to this list.

#### Method-Level Signals (scored per method)

| Signal | Weight | How to Detect |
|--------|--------|---------------|
| **Long method (over 50 lines)** | 2 | Line count from signature to closing brace/end of block |
| **Long method (over 100 lines)** | 4 | Stacks with the >50-line signal |
| **Deep nesting > 4 levels** | 2 | Count brace/indentation depth within the method |
| **Duplicated logic** | 4 | A near-duplicate block (copy-pasted logic with only minor variation) inside the method or shared with a sibling method |
| **TODO/FIXME/HACK density** | 1 | Each occurrence inside the method (capped at 3 per method) |

#### Constructor Signals (scored once)

| Signal | Weight | How to Detect |
|--------|--------|---------------|
| **Dependencies > 5** | 3 | Count constructor parameters |
| **Dependencies > 8** | 5 | Stacks with the >5-dependency signal |
| **Constructor logic** | 2 | Constructor body >10 lines (setup logic that should be in a factory or init method) |

#### Class-Level Signals (scored once, added to the top method scores for threshold comparison)

| Signal | Weight | How to Detect |
|--------|--------|---------------|
| **Long file (over 300 lines)** | 2 | Line count |
| **Long file (over 500 lines)** | 4 | Stacks with the >300-line signal |
| **God class indicators** | 4 | 10+ public methods OR methods touch 4+ unrelated field groups |
| **Missing test coverage** | 3 | No corresponding test class/module in `test/` |
| **High churn + high complexity overlap** | 4 | File/method was touched by an elevated number of commits in a recent window (`git log --since=<window> -- <file>` commit count above this project's threshold) **and** already scores Moderate or higher on another signal — frequent change to already-complex code is a leading indicator of regression risk |

### Scoring Rules

- **Per-method score**: Sum of method-level signal weights for that method
- **Constructor score**: Sum of constructor signal weights
- **Class-level score**: Sum of class-level signal weights (reported separately, not inflated into every method)
- **Top 3 only**: After scoring all methods + constructor, **rank by score descending and keep only the top 3**. Discard the rest. This is the output.

### Thresholds (applied per method/constructor score + class-level score)

| Score | Level | Action |
|-------|-------|--------|
| **0-3** | Clean | No action needed |
| **4-7** | Moderate | Flag in plan critique or PR notes |
| **8-11** | Elevated | Recommend cleanup unit in the plan |
| **12+** | High | Route to `story-author` for a cleanup story |

## Ignoring Debt

Users can suppress debt signals at three levels:

### 1. Inline Suppression (per-signal, per-file)

Add a comment in the source file to suppress a specific signal:

```text
// tech-debt-ignore: file-length — Orchestration requires all steps in one file
```

The comment must include the signal slug and a justification. Signals without justification are still reported. Recognized slugs match the signal names in kebab-case: `file-length`, `constructor-deps`, `deep-nesting`, `missing-tests`, `todo-fixme`, `duplicated-logic`, `god-class`, `high-churn-complexity`.

### 2. Ignore File (persistent, per-project)

Create `.claude/tech-debt-ignore.json` to permanently suppress files, folders, or specific signals:

```json
{
  "ignore_files": [
    "src/Legacy/OldService.ext"
  ],
  "ignore_folders": [
    "src/Generated/"
  ],
  "ignore_signals": {
    "src/Entities/Order.ext": [
      "file-length"
    ]
  }
}
```

- **`ignore_files`**: Skip these files entirely — they won't appear in the report
- **`ignore_folders`**: Skip all matching source files under these paths
- **`ignore_signals`**: Suppress specific signals for specific files (the file is still scanned for other signals)

### 3. Scan-Time Skip (`--skip-debt`)

Pass `--skip-debt` to the `/tech-debt` command or set it in the plan critique context to skip the tech debt scan entirely. The plan critique will note "Tech debt scan: skipped by user" instead of a score.

In the agentic-engineer workflow, if the user says "ignore debt" or "skip debt" when prompted, record that preference for the rest of the session — don't ask again on subsequent plan critiques in the same conversation.

### Reporting Suppressed Items

Suppressed signals still appear in the report but are marked and excluded from the score:

```text
File: src/Core/Services/BigService.ext
Score: 8 (12 before suppressions)
Signals:
  - file-length: 2 — 340 lines
  - constructor-deps: 3 — 6 parameters
  - missing-tests: 3 — no test class found
  - ~~todo-fixme: 4 — 4 occurrences~~ SUPPRESSED (inline: "tracked in ADO #12345")
```

This keeps suppressed debt visible without blocking the workflow.

## Scan Procedure

### Step 1: Identify Target Methods

Only score what the user is about to touch. Don't scan the whole file.

Based on invocation context:
- **Plan critique**: Score only the **methods and constructor that the plan's units will modify**. If Unit 1 says "refactor `BuildEngagementsAsync`", score that method — not every method in the file.
- **On-demand** (`/tech-debt scan File.ext`): Score the constructor + all public/exported methods in the file (full scan).
- **On-demand** (`/tech-debt scan File.ext:MethodName`): Score only that method.
- **Post-improve**: Run `git diff -U0` to get per-file hunks with changed line ranges. Parse the `@@ -a,b +c,d @@` headers to extract modified line ranges, then match those ranges against method/constructor boundaries (by signature line) to identify which methods were touched. Score only those methods.

Filter to `**/*.{ts,tsx}` files in `src/` only (see `profiles/<your-stack>/tech-debt-scorer-addendum.md` for this stack's exact glob). Exclude auto-generated files and build-output directories (e.g. `obj/`, `bin/`, `dist/`, `node_modules/`).

### Step 2: Quick Pass — Score Methods and Constructor

For each target file:

1. **Read the file** — use content already in context for initial analysis to save tokens, but always perform a fresh read of the relevant hunks before computing final scores (to catch intervening edits)
2. **Identify the constructor and each public/exported method** — note their line ranges
3. **Score the constructor** using constructor signals
4. **Score each method** using method-level signals
5. **Score the class** once using class-level signals
6. **Rank all scored items** (methods + constructor) by score descending
7. **Fresh-read verification** — before finalizing, re-read the line ranges of the top 3 candidates from disk to confirm scores reflect the current file state (catches edits made between initial read and scoring)
8. **Keep only the top 3** — discard everything else

This is a quick pass. Don't deep-analyze every method — scan for signal patterns, score, rank, move on.

### Step 3: Categorize the Top 3

Tag each signal in the top 3 with a debt category:

| Category | Signals |
|----------|---------|
| **Design debt** | God class, deep nesting, method length, duplicated logic |
| **Architecture debt** | See `profiles/<your-stack>/tech-debt-scorer-addendum.md` for this stack's architecture-boundary signals (e.g. persistence/domain types leaking through an API response) |
| **Test debt** | Missing test coverage |
| **Maintainability debt** | File size, constructor deps, constructor logic, TODO/FIXME density |
| **Safety debt** | High churn + high complexity overlap |

### Step 4: Report

Present a compact summary the user can act on. **Do not show signal details, categories, or suggested fixes** — just enough to choose.

**Method-level issues take priority.** Only surface class-level issues if there are fewer than 3 method-level findings to fill the top 3 slots. This keeps focus on actionable, scoped work.

```markdown
## Tech Debt — {ClassName}

| # | Scope | Location | Score | Issue |
|---|-------|----------|-------|-------|
| 1 | {MethodName} | line {start}-{end} | {N} | {one-line summary} |
| 2 | {MethodName} | line {start}-{end} | {N} | {one-line summary} |
| 3 | {Constructor} | line {start}-{end} | {N} | {one-line summary} |

Generate cleanup stories? (all / 1,2 / none)
```

If nothing scores above 0, report "Clean — no improvements needed." and stop.

### Step 5: Route to Story Author

When the user picks items by number, generate a `STORY_REQUEST` per selected item and invoke the `story-author` agent:

```text
STORY_REQUEST:
  epic: tech-debt-cleanup
  goal: Clean up {ClassName}.{MethodName} (score: {score})
  affected_files:
    - {file}: lines {start}-{end}
  tech_debt:
    - {category}: {signal detail} (weight: {W})
    - {category}: {signal detail} (weight: {W})
  constraints:
    - Do not change public API contracts or method signatures unless extracting to a new service
    - Maintain all existing test coverage
    - Preserve this project's concurrency and write-safety semantics in data-access code
  out_of_scope:
    - Feature changes — this is cleanup only
    - Other methods in the same file
```

Each selected item generates a separate story in `.claude/stories/tech-debt-{class}-{method-slug}.md`.

## Integration Points

### Plan Critique (Phase 3.5)
The agentic-engineer calls this skill during the tech debt scan step. Look at the top 3 method/constructor scores:
- All top 3 score 0-3 (clean): No action
- Any score 4-7 (moderate): Flag in critique results
- Any score 8-11 (elevated): Add a prep unit to the plan to clean up that method before building on it
- Any score 12+ (high): Ask user — clean first (route to `story-author`), proceed with risk, or ignore debt for session

### Improve Loop
After the improve loop exits, optionally re-scan methods that were modified. If any method's score increased, flag it.

### Standalone
Invoke directly to audit a specific file or class:
```text
/tech-debt scan src/BusinessLogic/OrderService.ext
```

## Speed Rules

- **Top 3 cap** — never report more than 3 items. Rank, cut, move on.
- **Don't re-read files** already in context — use what you have
- **Quick method scan** — identify methods by this stack's function/method signature pattern (see `profiles/<your-stack>/tech-debt-scorer-addendum.md` for the exact regex), estimate line count by brace/block matching. Don't parse every line of every method.
- **Skip small methods** — methods under 15 lines get no method-level signals. Only check class-level signals for them.
- **Batch Grep** — detect multiple signals in one pass where patterns overlap (e.g., `TODO|FIXME|HACK` as one regex)
- **Stop early** — if the file is under 100 lines with ≤3 constructor deps, report "Clean" immediately

## Key Areas to Watch

Empty by default — add your project's known trouble spots here as they're discovered (e.g. "the payment reconciliation module has had 4 debt-driven incidents").
