# Bug Handoff

Generate a single handoff-ready document covering every bug currently assigned to the invoking developer in GitHub Issues. The document is written so that any other team can pick up the work without prior context — no developer-private references, no internal-only links, no PII.

Use when the user asks to:
- "Hand off my bugs" / "generate a bug handoff doc"
- Produce a transfer document for active bugs assigned to me
- Summarize what I'm holding so someone else can take over

## Workflow

### 1. Fetch bugs assigned to me

Always pass `project: "poke-fighter"` to every GitHub Issues call.

Use GitHub Issues's "list my work items" tool:
- **project**: `poke-fighter`
- **type**: `assignedtome`

Take the returned IDs and fetch full details via GitHub Issues's "batch-fetch work items by ID" tool:
- **project**: `poke-fighter`
- **fields**: `System.Id`, `System.Title`, `System.WorkItemType`, `System.State`, `System.AssignedTo`, `System.CreatedDate`, `System.CreatedBy`, `System.IterationPath`, `System.AreaPath`, `System.Tags`, `Microsoft.VSTS.Common.Severity`, `Microsoft.VSTS.Common.Priority`, `Microsoft.VSTS.TCM.ReproSteps`, `System.Description`

Field names and the work-item link format used throughout this command (including the `**ADO:**` line in the output template below) assume Azure DevOps work items; map to your tracker's equivalent fields and URL structure (Jira: issue/epic/description; GitHub Issues: issue/labels/body).

Filter to:
- `System.WorkItemType == "Bug"`
- `System.State` in `{ "New", "Active", "Committed", "In Progress" }` — exclude `Closed`, `Resolved`, `Removed`, `Done`

If zero bugs match, tell the user plainly and do not write a file.

### 2. Fetch linked pull requests for each bug

For each surviving bug, re-fetch with relations expanded (or use the relations already on the batch response). Identify pull request links:
- Relation `rel == "ArtifactLink"`
- Relation attribute `name == "Pull Request"`
- The PR ID is encoded at the end of the relation URL — extract it

For each linked PR, capture:
- PR ID
- PR title — read from the relation's `comment` / `name` attribute if present; this becomes the one-line description in the Notes column of the output table
- The state from the relation attributes if present (`Active`, `Completed`, `Abandoned`) — leave unlabeled rather than guess

If the title or state is not encoded in the relation attributes, enrich via GitHub Issues's "get pull request by ID" tool to pull `title` and `status`. Skip this enrichment when the bug list is large (>5 bugs) to keep latency reasonable; in that case leave the affected Notes/State cells blank rather than guess.

### 3. Look for local documentation (auto-discover, then ask)

For each bug, gather context from any local documentation the developer has produced. Anything read here is for **the developer's own context only** — paraphrase it into the output document. Never include file paths, filenames, or links to local documentation in the generated doc, because recipients will not have access to it.

#### 3a. Auto-discover

Check the repo for a matching note (in order):

1. `docs/investigations/bug-{ID}*.md`
2. `docs/investigations/{ID}*.md`
3. `docs/investigations/*{ID}*.md`
4. `docs/runbook/*{ID}*.md`

If none of those folders exist or no files match by bug ID, move on. Do not grep the whole repo by default.

#### 3b. Ask the developer

After auto-discovery completes, ask the developer once, in a single prompt:

> "Do you have any local documentation (investigation notes, personal knowledge base, scratch files, etc.) for any of these bugs that I should incorporate? Provide one or more file paths or directory paths, or reply 'no'."

If the developer provides paths:
- Read each path; if a directory is provided, list it and look for files whose name contains a bug ID from the list
- Treat any file the developer references as authoritative context for the matching bug — paraphrase its content into the writeup

If the developer replies "no" (or any negative), skip and move on.

#### 3c. Extract usable context

From each matched local document, distill into the developer's notes:
- The root cause or current theory
- The decision state (in progress, blocked, set aside, ready to hand off)
- Caveats / gotchas / "don't do X" warnings
- Teams already engaged or expected to take it over

Compress all of that into **2-3 sentences of plain prose** per bug for the eventual writeup. No external paths, no internal-only links, no wikilinks. The writeup must read as if all knowledge originated from the tracker's work item itself.

If no local documentation is found and the developer has none to share, fall back to the tracker's description and repro steps — paraphrased, with customer-authored content stripped or replaced with placeholders.

### 4. Decide where to write the handoff document

Determine the output path in this order:

1. If the repo has a `docs/handoffs/` directory, default the output path to `docs/handoffs/bug-handoff-YYYY-MM-DD.md` (today's date)
2. Otherwise, ask the developer for an output path. Suggest `bug-handoff-YYYY-MM-DD.md` in the current working directory as the default.

If a file with the chosen name already exists, append a `-2`, `-3`, etc. suffix rather than overwriting.

### 5. Compose the handoff document

Single markdown file. Use this exact top-level structure:

```markdown
# Bug Handoff — YYYY-MM-DD

Active bugs currently assigned to {assignee first name}. Each entry below is self-contained and can be picked up by any team.

Total: {N} active bug(s).

---

## Bug {ID} — {Title}

**ADO:** https://dev.azure.com/{your-org}/poke-fighter/_workitems/edit/{ID}
**Severity:** {value or "—"} | **Priority:** {value or "—"} | **State:** {state}
**Filed:** YYYY-MM-DD by {reporter first name or "—"} | **Sprint:** {last segment of IterationPath or "no sprint"}

### What's happening
2-4 sentence plain-prose description of the bug. Paraphrase the tracker's description and repro steps. Customer-observable symptom first, then technical cause if known.

### Current status
2-3 sentences. Where things stand: investigation in progress, root cause identified, PR open, awaiting customer info, blocked on another team, etc. Capture decisions already made so the next team does not re-litigate them.

### Linked pull requests
| PR | State | Notes |
|---|---|---|
| PR ####### | Completed / Active / Abandoned / — | {captured PR title; leave blank if not available} |

(If no PRs are linked, replace the table with the single line: `No pull requests linked.`)

### Next steps
Numbered list of concrete actions for the receiving team. 2-5 items. Each item is short and action-oriented:
1. What to do next, with enough context to act on.
2. What NOT to do (and why), if relevant.
3. Caveats or surprises worth knowing.

---

## Bug {next ID} — {Title}
... (repeat structure for each bug) ...
```

Sort bugs by **Priority ascending** (1, 2, 3, 4), then by **Severity ascending**, then by **ID**. Bugs without priority sort last.

### 6. Apply formatting rules

- Plain markdown only — no emojis
- No references to local documentation paths, personal knowledge bases, or developer-private file locations anywhere in the file
- No wikilinks (`[[...]]`) or any link syntax that depends on developer-local tooling
- No references to internal-only systems the receiving team would not have access to (no developer-private dashboards, no personal scratch notes) — unless the link is broadly available org-wide
- Internal team member names (assignee, reporter, comment authors) are acceptable; first name only to keep it compact
- Tracker work item URLs and PR numbers are fine — those are accessible org-wide

### 7. Data-sensitivity rules

Before including any user-facing or customer data in the handoff doc, confirm it's safe to include per your project's data-sensitivity policy — redact or reference-by-id instead of pasting real values when in doubt.

### 8. Write the file and confirm

After writing:
1. Report the absolute file path to the developer
2. Report the bug count included
3. Offer to adjust scope (e.g., "Want me to include resolved bugs too, or drop the next-steps section?")

## Edge cases

- **No bugs assigned**: state plainly that the list is empty, and do not write a file.
- **Bug has no linked PR and no local documentation**: still include it. The "What's happening" section is built from the tracker's description; the "Current status" line should explicitly say "No prior investigation captured" so the receiving team knows they are starting fresh.
- **Bug is locked / restricted**: if the fetch fails for a specific bug, include a stub entry with the ID, title (if available), and a note that details could not be retrieved. Do not omit it silently.
- **Local documentation contradicts current tracker state**: trust the tracker. Use the local document only for the prose framing of "what was tried" — but reflect the current tracker state in the status line.
- **Bug references raw data values**: replace any customer-identifying values with `{placeholder}` equivalents rather than copying them through verbatim.
