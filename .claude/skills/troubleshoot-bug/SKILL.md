---
name: troubleshoot-bug
description: Investigate an GitHub Issues bug end-to-end — read the bug report, trace relevant code paths, query production logs, and synthesize a root cause analysis.
---

# Bug Troubleshooter (Logs + Code)

Investigate an GitHub Issues bug by reading the bug report, tracing relevant code paths, querying production logs, and synthesizing a root cause analysis.

## Input

The user provides an GitHub Issues work item / issue ID via `$ARGUMENTS`. Examples:
- `3922115`
- a full work item / issue URL

<!-- EXAMPLE (dha-rules-svc): the numeric-ID-from-URL parsing below assumes Azure DevOps work item URLs; map to your tracker's URL shape (Jira: issue key like PROJ-123; GitHub Issues: #123 or a full issue URL) -->

## Log query rules and reference

Before running any log query in this workflow, read `.claude/skills/log-query/SKILL.md` and apply every rule in its **Reference** section: base query, cross-service coordinates table, mandatory query rules (stats-first, field-named filters, row limits, 8-query ceiling), common indexed fields, and log-platform tool parameters. The bug-specific workflow below assumes those rules are in effect.

Default time window for bug investigation is `-2d`.

## Instructions

### Step 1: Parse the work item ID

Extract the identifier from `$ARGUMENTS`:
- If it is a plain number/key, use it directly.
- If it is a full issue URL, extract the identifier from the URL (map to your tracker's URL shape).
- If no argument is provided, ask the user for a work item / issue ID.

### Step 2: Read the bug report

1. Fetch the work item/issue using GitHub Issues's "get work item" tool, scoped to `poke-fighter`, with full detail/expansion.
2. Fetch comments using GitHub Issues's "list work item comments" tool, scoped to `poke-fighter`.
3. Display to the user: **Title**, **State**, **Assigned To**, **Created Date**, and a one-paragraph summary of the bug.

### Step 3: Form initial hypothesis and scope the investigation

From the bug description and comments, identify:

- **Symptoms**: What the reporter observed (error messages, missing data, unexpected behavior)
- **Affected area**: Which feature or flow is impacted
- **Scoping identifiers**: Extract any environment IDs, user IDs, entity IDs, or other identifiers mentioned in the bug. These are critical for filtering log queries.
- **Time window**: Extract specific timestamps or date ranges from the bug. Default to `-2d` if none found. Narrow to `-4h` around a specific incident if timestamps are available. Only widen to `-7d` if `-2d` shows nothing and the user confirms.
- **Hypothesis**: A 1-2 sentence theory about what might be going wrong.

Present the hypothesis and scoping info to the user.

**If no scoping identifiers were found in the bug**, ask the user to provide at least one (e.g., an environment ID, user ID, or entity ID) before proceeding. Running unscoped log queries risks huge result sets that blow up context.

### Step 4: Trace code paths and collect log statements

Trace the relevant code paths for this project's own architecture — start from `docs/index.md` or `.claude/rules/context.md` if this project has one.

1. **Keyword search**: Use Grep to search the source tree for terms from the bug description — feature names, error messages, entity names, endpoint paths.
2. **Trace the call chain**: Starting from the entry point (controller/handler), read through the code path down to the data layer.
3. **Collect log statements**: As you read each file, extract every logging call, recording:
   - The log level (Information, Warning, Error, Critical)
   - The **exact message template string** — this is what appears as the `Message` field in your log platform
   - The file and method it is in
   - What condition triggers it (null check, exception catch, validation failure, downstream call failure, etc.)
4. **Flag external dependencies**: Note any injected service-client interfaces found in the code path. For a dependency that isn't observable in your primary log platform (e.g. a third-party SaaS API, or a managed PaaS service with its own logging surface), trace its failures via the calling adapter's exception traces / sanitized error codes in this service's own logs, then that dependency's own platform logs. For a dependency that *is* observable in your log platform, see the cross-service coordinates table in the `log-query` skill.

Present a summary table of the code path and its log statements to the user.

### Step 5: Query logs for this service

Use the base query defined in the `log-query` skill's Reference section. Work in three tiers, always using scoping identifiers from Step 3:

**Tier 1 — Error/Warning overview** (stats first):
```
{base} (LogLevel="Warning" OR LogLevel="Error") EnvironmentId="{env_id}" earliest=-2d | stats count by Message | sort -count
```

**Tier 2 — Specific log messages** from Step 4:
For each key log message template, query its distinctive substring using the `Message` field:
```
{base} Message="*{distinctive substring}*" EnvironmentId="{env_id}" earliest=-2d | table _time, Message, SourceContext | sort -_time
```

**Tier 3 — Chronological trace** for a specific entity:
```
{base} EnvironmentId="{env_id}" Message="*{entity_id}*" earliest=-2d | table _time, LogLevel, Message, SourceContext | sort _time
```

After each query, summarize what the results show and what they mean for the hypothesis. Adjust the hypothesis if evidence contradicts it.

### Step 6: Cross-service investigation

Review the code paths from Step 4 for external dependency calls. For each one:

1. **Identify the dependency**: Map the interface name to either a log-observable service (using the cross-service coordinates table in the `log-query` skill's Reference section) or an unobservable managed/third-party dependency.
2. **Log-observable services**:
   - Try a correlation id first if available:
     ```
     {cross-service base} CorrelationId="{correlation_id}" earliest=-2d | table _time, <service-identifying fields>, LogLevel, Message | sort _time
     ```
   - Otherwise query the specific service directly, scoped to it and to `EnvironmentId="{env_id}"`, `(LogLevel="Warning" OR LogLevel="Error")`, stats-first.
3. **Unobservable managed/third-party dependencies**:
   - Errors from these will appear as exceptions in this service's own logs (e.g. a driver/SDK exception type). Query for them against this service's base query.
   - For any dependency whose own logs live outside your primary log platform (a managed PaaS service, a third-party SaaS API), direct the user to that platform's own console/logs for root cause — there is no query to run here in your log platform.
4. **Look for mismatches**: Compare what this service sent/expected with what was returned:
   - Downstream call returned an error status or an unexpected response
   - Data-layer read returned null or threw an exception
   - Auth/permission check failed at an upstream service

### Step 7: Synthesize root cause report

Compile all findings into this structured report:

---

**Bug Investigation Report: #{work_item_id} — {title}**

**Summary**
One paragraph: what was investigated, what was found, the conclusion.

**Hypothesis Evolution**
- Initial: {what you started with}
- Revised: {if changed by evidence}
- Confirmed root cause: {the actual root cause, or "Inconclusive" with explanation}

**Evidence Chain**
Numbered list of findings in discovery order:
1. [Source: Code/Logs-this-service/Logs-{service}/Issue Tracker/other platform] Finding — Significance

**Code Path**
```text
{Entry Point} -> {Service Method} -> {DataAccess or ServiceClient call}
```
Key files with line numbers.

**Log Queries Used**

| # | Query (abbreviated) | Time Range | Key Result |
|---|---|---|---|
| 1 | `{base} LogLevel="Error" ...` | -2d | Found N occurrences of ... |

**Recommended Fix**
If root cause identified:
- What to change (file paths, specific logic)
- Why this fixes it
- Risk / what else might be affected

If inconclusive:
- What was ruled out
- Next steps needed (manual DB queries, other team involvement, etc.)

---
