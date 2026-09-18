---
name: author-feature
description: Use when a body of work spans multiple stories and needs an overarching design captured first — turns a feature idea into a Feature design doc in .claude/features/ before any stories are written.
---

# Feature Author

Produce an overarching Feature design doc in `.claude/features/` by interviewing the user one question at a time, exploring the codebase, then writing a design-only document. Optionally hand off to `story-author` to generate the constituent stories, each linked back to the feature.

## Input

Optional: a feature name or short description via `$ARGUMENTS`. If omitted, ask the user what feature they want to document.

## Instructions

### Step 1: Explore repo context

Before asking any questions, search the codebase for the feature domain:

1. Read `docs/decisions/` — identify any ADRs relevant to the feature area.
2. Grep `src/` for terms from the feature description — service names, entity names, endpoint paths.
3. Read the most relevant files found (services, controllers, orchestrations). Reference file paths; never paste contents.
4. Check `.claude/features/` for any existing Feature docs that may overlap.

Present a 3–5 bullet summary of what you found so the user knows what context you're working from.

### Step 2: Interview the user (one question at a time)

Ask questions in this order, **one at a time**, waiting for each answer before asking the next. Use multiple-choice where natural.

1. **What problem does this feature solve, or what outcome does it enable?** (Open-ended — understand the why.)
2. **What is explicitly out of scope for this feature?** (Surfaces constraints early.)
3. **Which parts of the codebase does this touch?** (Confirm/correct your findings from Step 1.)
4. **Are there sequencing constraints or dependencies on other work?** (E.g., "blocked until X ships".)
5. **Gating decision** — ask explicitly:

> "Does this feature need to be gated behind a flag or entitlement? Here are the options:
>
> - **None** — safe to ship to 100% of customers immediately when it merges
> - **Feature flag** — name the flag, and note whether it's a temporary rollout flag (removed in a cleanup story) or long-lived
> - **Permanent entitlement** — name the system that manages it
>
> Which fits?"

If you still have open design questions after these, ask them now — one at a time.

### Step 3: Write the Feature doc

Derive a `kebab-case-slug` from the feature title. Write the doc to `.claude/features/<slug>.md` using this template:

```markdown
---
feature: <kebab-case-slug>
status: draft
created: <YYYY-MM-DD>
---

# Feature: <Title>

## Context / Problem

Why this work exists, what prompted it, intended outcome.

## Goals & Non-Goals

**Goals:** what success looks like.
**Non-goals:** what is explicitly out of scope.

## Architecture & Approach

The overarching design: components, data flow, key decisions, patterns to follow.
Reference existing code by path — do not paste file contents here.

## Affected Areas / Files

The surfaces this feature touches (services, orchestrations, controllers, contracts, data models).

## Gating (flag / entitlement)

The feature-level gating decision and its name. If none, state "None — ships to all customers on merge."

## Constraints / Out of Scope

Known constraints, sequencing dependencies, things deliberately deferred.

## Open Questions

Anything unresolved. Delete this section if empty — do not leave it as a placeholder.
```

Rules for the doc body:

- **Design only** — no story list, no task breakdown. Stories live in `.claude/stories/`.
- Reference existing code by path; never paste file content.
- Every section must contain real facts from the exploration and interview. Delete any section you cannot fill with facts.
- `Open Questions` must be kept honest — include only real unknowns, or omit the section entirely.

### Step 4: Self-review

After writing the file, check it against these gates before presenting it to the user:

- [ ] No placeholder text ("TBD", "TODO", "…")
- [ ] No story enumeration or task list — design only
- [ ] Every section has real content, not filler
- [ ] Gating section names the flag (or explicitly says "None")
- [ ] `Open Questions` omitted if there are no real unknowns
- [ ] File written to `.claude/features/<slug>.md`

Fix any violations inline.

### Step 5: Present and confirm

Show the user:

- The path the file was written to
- A concise summary: context, goals, approach, gating decision

Ask: "Does this look right? Let me know if you want to adjust anything before we write the stories."

### Step 6: Optional hand-off to story-author

After the user confirms the Feature doc, offer:

> "Want me to generate the constituent stories now? I'll use the story-author agent and link each story back to this feature."

If they say yes, use the Agent tool to invoke `story-author` with this prompt:

```
Create implementation-ready stories for the following feature.

Feature doc: .claude/features/<slug>.md  (read this file first)

Instructions:
- Decompose the feature into the smallest independently shippable stories.
- Each story's Dev Notes MUST include the line: **Parent Feature:** <slug>
  This is how the load-feature-context skill will find the feature later.
- The gating decision is already captured in the feature doc — every gated story must
  include an AC that tests behaviour with and without the flag, consistent with the
  feature-level decision.
- Follow all standard story-author rules (INVEST, scorecard, flag-gating ACs, etc.).
- Save each story to .claude/stories/<descriptive-slug>.md
```
