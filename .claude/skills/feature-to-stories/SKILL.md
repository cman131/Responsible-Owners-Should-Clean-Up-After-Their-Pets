---
name: feature-to-stories
description: Use when a GitHub Issues Feature needs to be decomposed into User Story work items with dependency links. Re-runnable to add more stories to an existing Feature. Triggers when breaking down feature scope into implementation-ready stories before development begins.
---

# Feature to GitHub Issues Stories

Iteratively decompose a GitHub Issues Feature into implementation-ready User Story work items. Proposes a breakdown, iterates on granularity with the user, then creates stories and wires dependency links. Re-runnable to add stories to a Feature that already has some.

> **Note:** The tool calls and field names below illustrate Azure DevOps via MCP tools — swap in your `GitHub Issues`'s equivalent tool names and field paths (Jira: issue/epic/description; GitHub Issues: issue/labels/body).

## Input

Supplied via `$ARGUMENTS`. Expected: `<feature-id> [prd-path-or-description]`

Examples:
- `4008989 poke-fighter/plans/home-page-health-score-addin/prd.md`
- `4008989 "Add a saved-search-filter card to the customer portal dashboard"`

The second argument is optional but strongly recommended — it scopes what stories to add without duplicating existing ones.

## Instructions

### Step 1: Preflight

Check whether your issue tracker's work-item-lookup tool (`GitHub Issues`) is available in your tools. If not, stop:

> "The GitHub Issues integration is not connected. Enable it in your Claude Code MCP settings and restart before running this skill."

### Step 2: Load context

Run these in parallel:
1. Your issue tracker's work-item-lookup tool (`GitHub Issues`) — project `poke-fighter`, the Feature ID. Read its title and description.
2. Your issue tracker's batch-fetch-by-id or query tool (`GitHub Issues`) — list child User Stories already under this Feature.

Display to the user: Feature title, and the titles of any existing stories (so they know what is already covered). This prevents duplication on re-runs.

If the PRD path was supplied, read the PRD file and extract goals and scope.

### Step 3: Author story content

**Check for a project-local story-author agent:** does `.claude/agents/story-author.md` exist in the current repo?

- **If present:** Invoke the `story-author` agent using the Agent tool — see the invocation template below. The agent will search the repo for relevant patterns, write story files to `.claude/stories/`, and run INVEST + scorecard checks. After it finishes, read all files it wrote to `.claude/stories/` and use their content for the proposal in step 4.
- **If absent:** Author stories inline using the fallback rules below.

#### story-author invocation template

Use the Agent tool with `subagent_type: "story-author"` and a prompt like:

```
Create stories for the following feature scope. Write one story per logical unit of shippable work — do NOT combine everything into a single story.

Feature: <feature title>
Feature description: <feature description from the tracker>

Scope to cover (from PRD / user input):
<goals and scope extracted in step 2>

Already covered by existing stories (do not duplicate):
<list of existing story titles from step 2, or "none">

For each story: run INVEST + scorecard checks, split if either score ≤ 2, and save to .claude/stories/.
```

The agent scans the repo for relevant patterns before writing — this is its Context Discovery step and runs automatically.

#### Inline story authoring rules (fallback — use only if story-author agent is absent)

For each story, produce:
- **Title** — descriptive, ≤ 8 words, describes the outcome not the task
- **Goal** — 2–4 sentences: what is broken or needs to exist, in plain language. No implementation details.
- **ACs** — 2–5 items, each in Given/When/Then format with a binary pass/fail outcome

**Split signal** — split a story if any of these apply:
- More than 8 files expected to change
- More than 300 lines of expected output
- More than 7 ACs
- Touches 3+ distinct layers (e.g. UI + API + data model + messaging)

**Combine signal** — merge proposed stories if they share the same file set, represent one unit of shippable value, and together score green on both split signals above. Small adjacent pieces (e.g. a utility function and the display component that uses it) are usually one story.

### Step 4: Strip implementation details

Before proposing anything to the user, review every drafted story for implementation specifics. A story describes **what** needs to exist and how to verify it — never **how** to build it.

**Delete any of the following — do not keep as "helpful context":**

| Category | Examples |
|----------|---------|
| Source files / paths | `src/app/foo/foo.ts`, `config.json`, `routes.ts` |
| Named symbols | function names, class names, guard names, type aliases, config keys |
| Package / import paths | third-party library imports, internal shared-package names |
| `data-testid` values | `health-score-card`, `dismiss-button` |
| Framework APIs / modules | UI-framework component/module names, lifecycle hooks, decorators |
| API signatures / field names | exact method calls, response field names, request shapes |
| i18n / resource keys | resource-bundle keys, `_description` fields |
| Dev Notes sections | delete entirely — the engineer discovers files and patterns |
| Current-state inventory | "No shared package is present…" — one plain "why" sentence suffices |

**Rewrite ACs that prescribe the *how* as observable outcomes:**

| Before | After |
|--------|-------|
| "resolved via a lookup function → i18n key → a display pipe/filter" | "the correct band label is displayed" |
| "calls the router's navigate method with the dashboard route" | "the user navigates to the dashboard" |
| "handle a 404 response via a status-code check that maps to an empty state" | "no card is shown" |

**If story-author wrote `.claude/stories/` files:** edit those files directly before reading them for the proposal.
**If authored inline:** revise the content before presenting it.

### Step 5: Propose the breakdown — DO NOT CREATE YET

Present a table of proposed stories. Include a call-out explaining any non-obvious grouping decisions (e.g. "scaffold + display + utility combined because they form one shippable unit and share the same files"):

```
## Proposed story breakdown for Feature #<id>

| # | Title | Scope (one line) | Depends on |
|---|-------|-----------------|------------|
| 1 | <title> | <scope> | — |
| 2 | <title> | <scope> | Story 1 |
| 3 | <title> | <scope> | Story 1 |

**Grouping notes:**
- Stories 2 and 3 depend on Story 1 (predecessor) because …

Does this breakdown look right? You can ask me to merge stories, split a story, rename them, or change the dependency links before I create anything in GitHub Issues.
```

**Do not call the create-child-work-items tool until the user explicitly approves.**

### Step 6: Iterate on granularity

The user may:
- Merge two stories → combine their goals and ACs, remove the merged row
- Split a story → divide its ACs into two rows, choose a dependency direction
- Rename → update the title only
- Change a dependency link → update the Depends on column

Revise the table and present it again. Repeat until the user approves. Typical session: 1–2 rounds of revision.

### Step 7: Create the stories

Once the user approves the breakdown, create all stories in one call per batch via your issue tracker's create-child-work-items tool (`GitHub Issues`):

```json
{
  "parentId": <featureId>,
  "project": "poke-fighter",
  "workItemType": "User Story",
  "items": [
    { "title": "<title 1>" },
    { "title": "<title 2>" },
    { "title": "<title 3>" }
  ]
}
```

Capture each returned story ID. Map titles → IDs for the linking step.

Then set the title and description for each story via your issue tracker's update-work-item tool (`GitHub Issues`):

```json
{
  "id": <storyId>,
  "updates": [
    { "op": "add", "path": "/fields/System.Title", "value": "<final approved title>" },
    { "op": "add", "path": "/fields/System.Description", "value": "<description — see below>" }
  ]
}
```

**Description source:**
- If story-author wrote files to `.claude/stories/`: read the relevant `.md` file and convert its Goal + Acceptance Criteria sections to HTML for the description body.
- If authored inline: construct the HTML from the goal sentences and Given/When/Then ACs you wrote and cleaned in steps 3–4.

### Step 8: Wire dependency links

For each approved predecessor relationship, call your issue tracker's link-work-items tool (`GitHub Issues`):

```json
{
  "project": "poke-fighter",
  "updates": [
    {
      "id": <dependent-story-id>,
      "linkToId": <predecessor-story-id>,
      "type": "predecessor",
      "comment": "<why this story depends on the predecessor>"
    }
  ]
}
```

Batch all links for the same predecessor into a single call's `updates` array.

### Step 9: Report

Print the final story map:

```
## Stories created under Feature #<featureId>

| # | Story | ADO | Depends on |
|---|-------|-----|------------|
| 1 | <title> | [#id](https://dev.azure.com/{your-org}/poke-fighter/_workitems/edit/<id>) | — |
| 2 | <title> | [#id](...) | #<id1> |
| 3 | <title> | [#id](...) | #<id1> |
```

If any **open blockers** were surfaced during authoring (missing permission codes, unknown URLs, unresolved constants), list them:

```
## Open blockers
- **<Story #id>** — <what is unknown and needs resolution before implementation>
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Creating stories before user approves breakdown | Step 5 is a full stop — no GitHub Issues calls until approval |
| Not loading existing children on re-run | Step 2 prevents duplication; always load first |
| Wiring links with wrong direction | `id` = the dependent story, `linkToId` = the predecessor |
| One link-work-items call per link | Batch all links for the same predecessor in one call |
| Forgetting to set descriptions after create | The create-tool may not persist rich descriptions; set with the update-work-item tool afterward |
| Omitting open blockers | Anything that would cause an implementer to stop mid-story goes in the blockers list |
