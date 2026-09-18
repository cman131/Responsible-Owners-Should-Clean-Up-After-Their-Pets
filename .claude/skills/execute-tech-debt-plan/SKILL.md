---
name: execute-tech-debt-plan
description: Use when working on a specific tech-debt plan document under docs/tech-debt/ and wanting to run it end-to-end with automatic state management (New → InProgress → Complete).
---

# Execute Tech-Debt Plan

Drives a tech-debt plan document from `New` to `Complete` while managing the `## State` field, then delegates implementation to `superpowers:using-superpowers`.

## Input

`$ARGUMENTS` — optional path to a doc under `docs/tech-debt/`. Example:

```
docs/tech-debt/battle-ui/fixed-800px-layout-not-responsive.md
```

If no path is given, the skill finds one for you.

## Workflow

### Step 1 — Resolve target document

**Path provided:** Use it directly.

**No path provided:**
1. Glob `docs/tech-debt/**/*.md`
2. Read `## State` from each file
3. Collect all docs where state is `New`
4. If ≤10 results: present them via `AskUserQuestion` as selectable options
5. If >10 results: print a numbered list and ask the user to name one
6. If zero results: tell the user there are no `New` plans and exit

### Step 2 — Read and validate

Read the resolved document. Confirm it has a `## State` section. If not, stop and tell the user the file doesn't match the expected format — they may need to run `/author-tech-debt-plan` first.

### Step 3 — State guard

| Current state | Action |
|---------------|--------|
| `New` | Proceed |
| `InProgress` | Warn that a prior run may have been interrupted. Ask (via `AskUserQuestion`): **Resume from where it left off** or **Restart from scratch**. Either choice proceeds. |
| `Complete` | Warn that this plan is already marked done. Ask for explicit confirmation before continuing — it may have regressed. Only proceed if confirmed. |

### Step 4 — Flip to InProgress

Edit the document: replace the state line under `## State` from its current value to `InProgress`.

```
## State

InProgress
```

This single-line edit is the only modification made to the document before implementation begins. Commit nothing yet — the state is intentionally dirty until the work is done.

### Step 5 — Delegate to superpowers

Invoke `superpowers:using-superpowers` via the `Skill` tool with this prompt:

> Implement the tech-debt plan at `<resolved-path>`. Its `## State` has been set to `InProgress`. Read the full document — pay particular attention to `## Problem Details`, `## Suggested Fix`, and `## Related Files`. Use whatever superpowers apply (brainstorming, TDD, systematic-debugging, etc.) to complete the fix described in `## Suggested Fix`. **Your final two actions after all work is complete — including any branch decisions via `superpowers:finishing-a-development-branch` — must be: (1) edit `<resolved-path>` and change `## State` from `InProgress` to `Complete`; (2) move `<resolved-path>` to `docs/completed-tech-debt/<area>/<filename>` (same subdirectory name, same filename), creating the destination directory if it doesn't exist.**

> **Why this matters:** The `execute-tech-debt-plan` wrapper that set the state to `InProgress` cannot resume after a multi-turn workflow — this delegation is not a coroutine. You are responsible for the final state update and file move.

### Step 6 — Verify state and location (safety net)

This step runs only if the implementation did not complete the final actions itself (e.g., the workflow was interrupted mid-run).

1. **State check:** Read the current `## State` value in the document (check both `docs/tech-debt/` and `docs/completed-tech-debt/` locations):
   - If already `Complete`: proceed to location check.
   - If still `InProgress`: edit the document to replace `InProgress` → `Complete`.

2. **Location check:** If the file is still under `docs/tech-debt/`, move it to `docs/completed-tech-debt/<area>/<filename>`, creating the destination subdirectory if it doesn't exist:
   ```bash
   mkdir -p docs/completed-tech-debt/<area>
   mv docs/tech-debt/<area>/<filename> docs/completed-tech-debt/<area>/<filename>
   ```

**On abort or unrecoverable failure:** Leave `State` as `InProgress` and the file in place. Report what was done and what remains so the plan can be resumed later with `/execute-tech-debt-plan <path>`.

### Step 7 — Report

One-line summary:

```
✓ docs/completed-tech-debt/<area>/<file>.md → Complete
  Changed: <brief description of what was fixed>
```

Or, if aborted:

```
⚠ docs/tech-debt/<area>/<file>.md → InProgress (incomplete)
  Done: <what was completed>
  Remaining: <what was not completed>
```

## Document Format Reference

The expected format for a valid tech-debt plan:

```markdown
# Title

## State

New

## Summary

...

## Problem Details

...

## Impact

...

## Suggested Fix

...

## Related Files   ← optional

...
```

The `## State` section must contain exactly one of: `New`, `InProgress`, `Complete` (on the line immediately after `## State`, with a blank line above and below).

## Non-Goals

- Does not implement the fix itself — `superpowers:using-superpowers` does that
- Does not commit changes or open PRs
- Does not modify any section of the document other than `## State`
- Does not move docs to `docs/completed-tech-debt/` until `## State` reaches `Complete`
