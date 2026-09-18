---
name: prd-to-feature
description: Use when a PRD document needs to be converted into a GitHub Issues Feature under an existing Epic. Triggers when starting feature planning from a product requirements file and needing a GitHub Issues work item created before story decomposition.
---

# PRD to GitHub Issues Feature

Read a PRD and create a GitHub Issues Feature work item as a child of a target Epic.

> **Note:** The tool calls and field names below illustrate Azure DevOps via MCP tools — swap in your `GitHub Issues`'s equivalent tool names and field paths (Jira: issue/epic/description; GitHub Issues: issue/labels/body).

## Input

Supplied via `$ARGUMENTS`. Expected format: `<path-to-prd> <epic-id>`

Examples:
- `poke-fighter/plans/home-page-health-score-addin/prd.md 3701585`
- `../my-plans/plans/003-new-feature/prd.md 3900000`

If either argument is missing, ask for it before proceeding.

## Instructions

### Step 1: Preflight

Check whether your issue tracker's work-item-lookup tool (`GitHub Issues`) is available in your tools. If it is not, stop and say:

> "The GitHub Issues integration is not connected. Enable it in your Claude Code MCP settings and restart before running this skill."

### Step 2: Read the PRD

Read the file at the supplied path. Extract:
- **Product / area** — which product or team owns this work
- **Problem** — the user or business pain being addressed
- **Goals** — what success looks like
- **Scope** — what is included
- **Out of scope** — what is explicitly excluded

### Step 3: Draft and confirm

Draft:
- **Title** — concise, product-prefixed (e.g. `Customer Portal — Saved Search Filters`). No "Feature" label in the title — GitHub Issues shows the type already.
- **Description** — 4–6 sentences covering: problem, goals, scope, out-of-scope. Close with: `Source PRD: <path-as-supplied>`. Format as HTML (GitHub Issues renders HTML in description fields).

Present the draft to the user:

> **Proposed Feature**
> **Title:** `<title>`
> **Description:** `<description>`
>
> Does this look right, or do you want to adjust anything before I create it?

**Wait for the user's response before calling any GitHub Issues tools.**

### Step 4: Verify the Epic

Call your issue tracker's work-item-lookup tool (`GitHub Issues`) with `project: "poke-fighter"` and the Epic ID. Display its title so the user can confirm it is the right parent. If the work item does not exist or its `workItemType` is not `Epic`, stop and tell the user.

### Step 5: Create the Feature

Call your issue tracker's create-child-work-item tool (`GitHub Issues`):

```json
{
  "parentId": <epicId>,
  "project": "poke-fighter",
  "workItemType": "Feature",
  "items": [
    {
      "title": "<confirmed title>",
      "description": "<confirmed description>"
    }
  ]
}
```

Capture the returned Feature ID from the response.

If the description was not stored (check the returned item's description field — `System.Description` in Azure DevOps), set it immediately via your issue tracker's update-work-item tool (`GitHub Issues`):

```json
{
  "id": <featureId>,
  "updates": [
    { "op": "add", "path": "/fields/System.Description", "value": "<confirmed description>" }
  ]
}
```

If the parent link to the Epic was not established (check the returned item's parent relation — it should reference `<epicId>`), set it explicitly via your issue tracker's link-work-items tool (`GitHub Issues`):

```json
{
  "project": "poke-fighter",
  "updates": [
    {
      "id": <featureId>,
      "linkToId": <epicId>,
      "type": "parent",
      "comment": "Feature created from PRD under target Epic"
    }
  ]
}
```

Direction: `id` = the Feature (child), `linkToId` = the Epic (parent), `type` = `"parent"`.

### Step 6: Report and chain to story creation

Print:

> **Feature created: [#\<id\> — \<title\>](https://dev.azure.com/{your-org}/poke-fighter/_workitems/edit/\<id\>)**

Then immediately announce and invoke the `feature-to-stories` skill:

> Now using `feature-to-stories` to decompose Feature **\<id\>** into User Stories.

Invoke the `feature-to-stories` skill via the Skill tool with arguments `<featureId> <prd-path-as-supplied>`. Do **not** pass the epic-id — `feature-to-stories` does not consume it. Do **not** ask the user whether to continue — always chain automatically.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Creating before user confirms draft | Always wait for step 3 approval |
| Missing Source PRD line in description | Always close description with `Source PRD: <path>` |
| Not capturing Feature ID | You need it to report the URL and to feed `feature-to-stories` |
| Epic ID is actually a Feature or Story | Check `workItemType` in step 4; stop if wrong |
| Parent link not established by `parentId` | Verify after create; set explicitly with the link-work-items tool, type `"parent"`, if missing |
| Asking the user before chaining to stories | Always auto-invoke `feature-to-stories` — do not prompt first |
