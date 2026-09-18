---
name: author-tech-debt-plan
description: Use when writing a new tech-debt plan document for the poke-fighter project under docs/tech-debt/ — guides discovery, code exploration, and structured writing.
---

# Author Tech-Debt Plan

Guides creation of a new tech-debt plan document that conforms to the format expected by `execute-tech-debt-plan`. Explores the code to ground the write-up rather than writing from assumptions.

## Workflow

### Step 1 — Get the description

Ask the user for a brief description of the debt, bug, or UX gap. One sentence or a paragraph is fine — you will explore the code to fill in specifics.

If the user has already described it in the message that triggered this skill, skip this step and use what they provided.

### Step 2 — Explore the code

Use `Grep`, `Glob`, and `Read` to locate the affected files and understand the problem concretely. Target:

- The specific file(s) and line numbers where the issue lives
- The exact code pattern causing the problem
- Related files that a fix would touch

Do not rely on assumptions — every `## Problem Details` entry must cite an actual file and line number.

### Step 3 — Choose the area

Ask the user which subdirectory under `docs/tech-debt/` this belongs in:

| Area | When to use |
|------|-------------|
| `admin` | Admin panel, NPC control, battle creation flows |
| `battle-bugs` | Incorrect game behavior, engine errors, socket race conditions |
| `battle-setup` | Team building, party configuration, BattleConfigurator |
| `battle-ui` | Player-facing battle screen, overlays, Phaser scene |
| `team-builder` | Team builder page, bank/slot editor, search |
| *(new folder)* | Ask the user for a name if none of the above fits |

Use `AskUserQuestion` with these as selectable options plus "Other (new folder)".

### Step 4 — Draft the document

Fill in `tech-debt-template.md` from this skill directory:

- **Title**: Short, descriptive noun phrase. No numeric prefix.
- **State**: Always `New` for a newly authored plan.
- **Summary**: One clear paragraph — what the debt is, where it is, why it matters.
- **Problem Details**: The concrete code-level evidence. Include the file path, relevant line number, and a code snippet.
- **Impact**: Bullet list of real effects on users or developers.
- **Suggested Fix**: Actionable numbered steps or a code diff sketch. Don't prescribe implementation details that aren't clear from the code.
- **Related Files**: Every file the fix will likely touch, based on what you found in Step 2.

Present the draft to the user before writing.

### Step 5 — Write the file

Derive a kebab-case slug from the title (match the style of existing filenames in the same subdirectory — e.g. `fixed-800px-layout-not-responsive.md`, `leech-seed-volatile-key-mismatch.md`).

Write to: `docs/tech-debt/<area>/<slug>.md`

### Step 6 — Report

```
✓ Created docs/tech-debt/<area>/<slug>.md
  Run /execute-tech-debt-plan docs/tech-debt/<area>/<slug>.md to implement it.
```

## Template

The full template is at `tech-debt-template.md` in this skill directory. Use it as the structural skeleton — do not add or remove sections without user input.

## Common Mistakes

- **Writing from assumptions** — always read the actual code before filling in `## Problem Details`
- **Vague Summary** — "the UI is bad" is not a summary; name the specific component, behavior, and consequence
- **Missing file:line references** — every claim in `## Problem Details` needs a real file path and line
- **Overly prescriptive Suggested Fix** — describe what to change, not how to build it from scratch; leave room for implementation judgment
- **Wrong area** — `battle-bugs` is for behavior errors; layout or UX issues go in `battle-ui` or the relevant panel area
