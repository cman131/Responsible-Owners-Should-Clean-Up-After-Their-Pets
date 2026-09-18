---
name: verify-production
description: Validate that a deployed story/PR is behaving correctly in production by tracing its code changes, querying production logs for the signals they emit, and surfacing admin/support endpoints to verify state.
---

# Verify Production Deployment

Validate that a deployed user story / PR is behaving correctly in production by tracing the PR's code changes, identifying the log signals they emit, querying production logs for those signals, and surfacing any admin/support endpoints the user can run to further verify state.

## Input

The user provides a work item ID, a PR ID, a full URL for either, or both. Examples:
- `3912345` (work item ID)
- `PR 1234` (PR ID)
- a full work item URL
- a full pull request URL

<!-- EXAMPLE (dha-rules-svc): the URL shapes above assume Azure DevOps work items and pull requests; map to your tracker's equivalent (Jira issue + GitHub PR, or GitHub Issues + GitHub PR) -->

If the user provides only a work item, locate the linked PR(s) via GitHub Issues's "get work item" tool with relations expanded, and look for artifact-link relations pointing to pull requests. If the user provides only a PR, read the PR description/linked work items to find the story. If neither is provided, ask the user.

## Log query rules and reference

Before running any log query in this workflow, read `.claude/skills/log-query/SKILL.md` and apply every rule in its **Reference** section: base query, cross-service coordinates table, mandatory query rules (stats-first, field-named filters, row limits, 8-query ceiling), common indexed fields, and log-platform tool parameters. The verification-specific tiers below assume those rules are in effect.

Default time window for verification is `-2d`; narrow to `-4h` when a deploy time is known.

## Instructions

### Step 1: Parse inputs and resolve work item ↔ PR pairing

1. Extract the work item ID and/or PR ID from the user's input.
2. If only one is provided, resolve the other:
   - **Work item → PR**: GitHub Issues's "get work item" tool with relations expanded, then look for an artifact-link relation pointing to a pull request and extract the PR ID.
   - **PR → work item**: GitHub Issues's "get pull request by ID" tool returns linked work items in its description and work-item links.
3. Display to the user: **Work item title + type + state**, **PR title + status + merge commit**.

### Step 2: Read the PR diff

1. Fetch PR metadata: GitHub Issues's "get pull request by ID" tool — capture the repo, source/target branches, and merge commit.
2. Fetch the file changes: GitHub Issues's "get pull request changes" tool.
3. Classify each changed file into one of:
   - **Controller / endpoint** (routes, HTTP surface) — new or changed endpoints
   - **Service** (business logic)
   - **Data access** (database reads/writes)
   - **Service client** (external HTTP call)
   - **External adapter** (external query)
   - **Contracts / DTOs** (likely not runtime-observable)
   - **Tests / docs** (skip for runtime verification)

Present the classified change summary to the user.

### Step 3: Map changes to observable code paths

For each non-test changed file, read it with the `Read` tool and extract:

1. **Entry points introduced/modified**: new or changed routes/handlers. Record the HTTP method + route.
2. **Log statements**: every logging call in the changed methods. Capture:
   - Log level
   - Exact **message template** (this is what the `Message` field matches on in your log platform)
   - File + method
3. **External dependency calls**: any injected service-client interfaces. These are cross-dependency verification targets. Trace the relevant code paths for this project's own architecture — start from `docs/index.md` or `.claude/rules/context.md` if this project has one — to find the concrete adapters and their downstream dependencies.
4. **Data writes**: create/upsert calls against the data store. Note the container/collection/table.

Summarize as a table: **File → Entry Point → Log Messages → Downstream Calls → Data Writes**.

### Step 4: Identify relevant admin/support endpoints

Check for internal/admin-facing controllers or services that can inspect state touched by the PR:

1. Search for admin/support controllers in this project (naming and location are project-specific — check `docs/api/index.md` or `.claude/rules/context.md` if this project has one).
2. For each admin/support controller, read the file and match its endpoints against the entities/flows modified by the PR.
3. Produce a short list of **suggested admin/support calls**: endpoint URL, what it will show, how it validates this specific change.

If no admin/support endpoints match, state that explicitly rather than speculating.

### Step 5: Ask for a scoping identifier

Before running log queries, ask the user for at least one of:
- An environment/tenant ID that exercised the change in production
- A specific time window (e.g., "first customer call was at 14:00 EDT today")
- An entity ID touched by the change

Do not run unscoped log queries — they blow up context and rarely answer the verification question.

### Step 6: Query logs for evidence the new code ran

Use the base query from the `log-query` skill's Reference section plus the scoping filter from Step 5.

Run in this order:

**Tier 1 — Did the entry point get hit?** (stats)
- For a new HTTP endpoint:
  ```
  {base} RequestPath="{new_route}" {scoping_filter} earliest=-2d | stats count by LogLevel, SourceContext | sort -count
  ```

**Tier 2 — Were the new log statements emitted?** (stats, then raw)
For each distinctive log message template from Step 3:
```
{base} Message="*{distinctive substring}*" {scoping_filter} earliest=-2d | stats count by LogLevel, SourceContext
```
If count > 0 and manageable, follow up with a raw-log query to see the actual events.

**Tier 3 — Any errors/warnings from the new SourceContexts?**
```
{base} SourceContext="{new_class}" {scoping_filter} (LogLevel="Warning" OR LogLevel="Error") earliest=-2d | stats count by Message | sort -count
```

**Tier 4 — Cross-service / external dependency check** (only if Step 3 identified adapter calls)
- For log-observable dependencies: map to the row in the `log-query` skill's cross-service coordinates table and query the same `-2d` window, ideally by correlation id:
  ```
  {cross-service base} CorrelationId="{correlation_id}" earliest=-2d | table _time, <service-identifying fields>, LogLevel, Message | sort _time
  ```
- For unobservable managed/third-party dependencies: search for exception traces / sanitized error codes in this service's own logs, and direct the user to that dependency's own platform logs for root cause.

After each tier, summarize what the results mean for whether the change is working. Stop and check in with the user before exceeding 8 total queries.

### Step 7: Synthesize the verification report

Compile findings into this structured report:

---

**Production Verification: Story #{id} / PR #{pr_id} — {title}**

**Scope of change**
- Files changed: N (controller: X, service: Y, data access: Z, ...)
- New entry points: {routes / handlers}
- New log signals: N distinct message templates

**Evidence the change is live**

| Signal | Query | Result | Verdict |
|---|---|---|---|
| New endpoint hit | `RequestPath="/v1/{resource}"` (or relevant route) | N calls in last 2d, 0 errors | ✓ exercised |
| New log emitted | `Message="*foo bar*"` | N events, latest at {time} | ✓ emitted |
| Error rate from new code | `SourceContext="..." LogLevel=Error` | N errors | ✓ clean / ⚠ investigate |
| Downstream call | `CorrelationId=...` across services | ... | ... |

**Admin/support endpoints to validate state**
- List each relevant endpoint — {what it shows}, {how it validates this change}
- (or: "No admin/support endpoints cover this change — recommend adding one" if none exist)

**Open questions / gaps**
- Signals not yet observed (e.g., an error branch never triggered — cannot confirm error handling works)
- Next verification steps if the user wants deeper coverage

---
