---
name: load-feature-context
description: Use when implementing or reviewing a story that belongs to a larger feature and the overarching design, goals, architecture, or gating decision needs to be in context before writing code.
---

# Feature Context Loader

Locate and load the Feature design doc relevant to the current story, then surface a focused summary so the feature's intent and constraints are active in context.

## Input

Optional: a feature slug, feature title, or feature file path via `$ARGUMENTS`.

## Instructions

### Step 1: Resolve which Feature doc to load

**Rule:** Try each source in order. If a source cannot resolve to an existing file, continue to the next source.

**Source A — Auto-detect from story**

1. If `$ARGUMENTS` looks like a story (check whether `.claude/stories/<arg>.md` exists — with or without `.md` extension), read that story file.
   Also check if a story is currently referenced in the conversation as the one being worked on.
2. Look for a line matching `**Parent Feature:** <slug>` in the story's Dev Notes section.
3. If found, check whether `.claude/features/<slug>.md` exists.
   - If it exists → load it and skip Sources B and C.
   - If it does not exist → continue to Source B.
4. If no `**Parent Feature:**` line is found → continue to Source B.

**Source B — Direct feature argument**

If `$ARGUMENTS` names a feature directly (not a story — i.e., `.claude/stories/<arg>.md` does not exist):

1. Check `.claude/features/<arg>.md` (add `.md` if not already present).
2. If the file exists → load it and skip Source C.
3. If the file does not exist → continue to Source C.

**Source C — Listing fallback**

1. List all files matching `.claude/features/*.md` (excluding `.gitkeep`).
2. If the list is empty — tell the user: "No feature docs exist yet in `.claude/features/`. Run `/author-feature` to create one." Then stop.
3. If the list has one or more files — present the list to the user and ask which feature to load.
4. Load the chosen file.

### Step 2: Read the Feature doc

Read the full content of the resolved feature file.

### Step 3: Present the feature summary

Output a structured summary to the user:

---

**Feature loaded:** `.claude/features/<slug>.md`

**Context / Problem**
_One paragraph from the feature doc._

**Goals**
_Bulleted list of goals (from Goals & Non-Goals)._

**Architecture & Approach**
_2–4 sentence summary of the key design decisions and patterns._

**Affected Areas**
_Concise list of surfaces this feature touches._

**Gating**
_The flag or entitlement name, or "None — ships to all customers on merge." If the feature doc has no Gating section, write "Not documented."_

**Constraints / Out of Scope**
_Brief summary, or "None documented."_

---

### Step 4: Flag relevant Open Questions

If the Feature doc contains an `Open Questions` section, treat any list item that is **not** crossed out, resolved with a clear answer, or marked with `~~strikethrough~~` as unresolved. Surface unresolved items:

> ⚠️ **Open questions in this feature — worth resolving before implementing this story:**
>
> - [list each open question verbatim]

If there are no open questions, skip this step entirely.

### Step 5: Confirm context is active

Close with:

> "Feature context loaded. The design above is now in context — refer to it as you implement the story. If the feature doc needs updating after this work, let me know."
