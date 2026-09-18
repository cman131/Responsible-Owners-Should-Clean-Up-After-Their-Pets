# Playbook: Capture a deferred decision as a Proposed ADR and track it to resolution

Step-by-step guide for when a decision needs to be **recorded but not yet made** — you want the options and your current leaning captured now, plus a work item that forces a real decision later. Load the `architecture.md` skill alongside this playbook for ADR format and governance; the `es-pm-ado-work-items` skill covers the Azure DevOps work-item mechanics.

This playbook owns only the connective tissue: the Proposed-ADR-plus-tracking-story practice. It delegates *how to write an ADR* to `architecture.md` and *how to create ADO work items* to `es-pm-ado-work-items` — do not restate either here.

## When to use

- A PR review, design discussion, or code change surfaces a decision the team wants to defer.
- You want the trade-offs and a recommendation on record immediately, so the question is not re-litigated, and a tracked work item so the deferral does not rot.

## Prerequisites

- The repo uses ADRs (an ADR template and a decision index/log — see `architecture.md`).
- Azure DevOps access, and tooling to read and create work items (ADO MCP, `az boards`, or the web UI).
- If the triggering context is a PR or commit, access to read its discussion/diff to ground the ADR's options.

## Step 1: Write the Proposed ADR

Follow the ADR format from `architecture.md` and the repo's template. Specifics for a deferred decision:

1. Set **Status: Proposed**. A Proposed ADR still carries a recommendation — the Decision section states which option you lean toward and *why*, then explicitly defers the final call to team discussion.
2. Lay out the realistic options with honest trade-offs (good/bad bullets per option). Ground them in the triggering PR/commits and any relevant standards — reference those sources rather than copying them.
3. Write the Decision section as a deferral: the lean, plus "decision pending — the team should choose and update this ADR to Accepted."
4. Add a row to the decision index/log (newest first, per the repo convention).
5. Commit on a branch and open the PR for the ADR.

One ADR per decision. If a single PR raised several independent decisions, write one Proposed ADR each — they will get one tracking story each in Step 4.

## Step 2: Determine the parent feature

The tracking stories hang under the Feature that owns the current work. Discover it before prompting:

1. **Look at active work first.** Scan recent commit history and recent PRs for linked work items — typically Azure Boards references such as `AB#NNNN` in commit messages or PR descriptions, or PR-to-work-item links in ADO. An ADR/docs branch usually carries no work-item link of its own, so look across recent history rather than only the current branch.
2. **Resolve each linked item in ADO and propose a feature:**
   - Linked item is a **User Story** → propose its **parent Feature** as the parent for the new tracking stories.
   - Linked item is a **Feature** → propose that Feature directly.
3. **Otherwise, prompt the user** for the feature ID.
4. **Confirm the proposed feature with the user** before creating anything — even when discovery found an unambiguous match.

## Step 3: Inherit area and iteration paths from the feature

Read the chosen Feature's `System.AreaPath` and `System.IterationPath` and apply those same values to the tracking stories.

Inherit from the Feature itself — do not sample the Feature's child work items to guess the paths.

## Step 4: Create one tracking story per Proposed ADR

For each Proposed ADR, create a work item:

- **Type:** User Story, parented to the Feature from Step 2, with the area and iteration paths from Step 3.
- **Title:** use the template
  > `Decide on "ADR-{number}: {topic}" then make the resulting Story/PRD/plan/code changes`

  Keep `{topic}` brief — the ADR title if it is already short, otherwise a few words capturing its essence.
- **Description:** a short summary, a link to the ADR, and a "Done when" line. **Do not paste the ADR body** — the ADR is the source of truth; the story points to it. A good "Done when": the team picks an option, the ADR is updated to Accepted, and any resulting Story/PRD/plan/code changes are captured.
- **Link to the ADR:** the story description links to the ADR (path or PR). This direction is always required.

## Step 5: Add the tracking link back into the ADR (only when the ADR is still unmerged)

Whether to write the story ID back into the ADR depends on where the ADR is in its life:

- **The ADR is new in this flow** — you wrote it in Step 1 and its branch has not yet merged to master. Add the tracking link to the ADR now (e.g. a `- Tracking: AB#NNNN` line in the ADR's Links section) so it ships in the *same* commit/PR. The round-trip costs nothing here because the ADR is already open for edit.
- **The ADR was created by an earlier, already-merged PR** — you are only running Steps 2–4 against an existing Proposed ADR. Do **not** open a new PR just to add the back-link. The story already links to the ADR (Step 4), and that one direction is enough; a whole PR to insert one ADO link is not worth the churn. If the ADR file is later edited for another reason, add the back-link opportunistically then.

## Conventions

- **Status is `Proposed`** while the decision is pending; the ADR moves to `Accepted` once the team decides.
- **One Proposed ADR and one tracking story per decision.**
- **Story title** follows the `Decide on "ADR-{number}: {topic}" …` template.
- **Story description links to the ADR — never copies it.**
- **The story→ADR link is always created; the ADR→story back-link is added only when the ADR is still unmerged** — never open a PR solely to add it.
- **Area and iteration paths are inherited from the parent Feature.**
