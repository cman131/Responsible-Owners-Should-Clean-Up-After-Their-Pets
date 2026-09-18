# /learn - Extract Reusable Patterns

Analyze the current session and extract any patterns worth saving as learned skills.

## Trigger

Run `/learn` at any point during a session when you've solved a non-trivial problem.

## What to Extract

Look for:

1. **Error Resolution Patterns**
   - What error occurred?
   - What was the root cause?
   - What fixed it?
   - Is this reusable for similar errors?

2. **Debugging Techniques**
   - Non-obvious debugging steps
   - Tool combinations that worked
   - Diagnostic patterns

3. **Workarounds**
   - Library quirks
   - API limitations
   - Version-specific fixes

4. **Project-Specific Patterns**
   - Codebase conventions discovered
   - Architecture decisions made
   - Integration patterns

5. **Token Efficiency Patterns**
   - Model routing decisions that improved speed (e.g., haiku sufficed where sonnet was expected)
   - Slow sessions caused by unnecessary file reads or redundant analysis
   - Prompt caching opportunities discovered (repeated system prompts > 1024 tokens)
   - Batch processing strategies that reduced total token usage
   - Scope classification shortcuts (e.g., config-only scope skips build/test)

## Save Location Decision

Decide where the pattern belongs:

| Scope | When | Path |
|-------|------|------|
| **Project** | Framework/language conventions, file structure, code style specific to this repo | `.claude/skills/learned/` (this repo) |
| **Global** | Security practices, general best practices, tool workflow preferences | `~/.claude/skills/learned/` (user home) |

Default to **project** scope — it's safer to keep patterns narrow.

## Output Format

Create a skill file at the chosen location as `[pattern-name].md`:

```markdown
---
id: pattern-name-here
trigger: "when [specific condition]"
confidence: 0.5
domain: error-resolution | debugging | workaround | project-specific | token-efficiency
source: session-observation
scope: project | global
---

# [Descriptive Name]

**Context:** [One-line description of what this covers]

## Architecture
[How the system works — components, interfaces, data flow, configuration.
State facts in objective active voice, present tense.]

## Behavior
[Runtime behavior — what happens when, sequences, defaults, edge cases.
Use code references (file:line) sparingly and only for non-obvious locations.]

## Known Risks
[Optional. Factual gaps or failure modes. State the gap, not the fix.]

## When to Use
[Trigger conditions — what work should activate this skill]
```

### Writing Style

- **Objective active voice, present tense**: "The service processes chunks of 50" not "chunks were added" or "it will process"
- **State facts, not history**: Describe how the system works today. No "previously", "now", "was changed to", "used to"
- **Be concise**: One clear sentence beats three hedging ones. Target under 150 lines per skill
- **Code references over prose**: A file path and line number communicates faster than a paragraph
- **No filler metadata**: Drop extraction dates — they become stale. The git log has history

## Quality Evaluation

Before saving, evaluate the pattern on these dimensions (1-5 scale):

| Dimension | Question |
|-----------|----------|
| **Reusability** | Will this apply to future sessions? |
| **Specificity** | Is the trigger condition precise enough? |
| **Correctness** | Is the solution verified and accurate? |
| **Signal** | Does this add real value vs noise? |
| **Uniqueness** | Is this already covered by existing skills? |

**Minimum threshold**: Average score >= 3.0 to save. Below that, skip it.

## Process

1. Review the session for extractable patterns
2. Check `~/.claude/metrics/costs.jsonl` for token efficiency insights — look for:
   - Tools with disproportionate token usage (candidate for prompt caching or skipping)
   - Patterns of redundant reads or repeated calls (cache opportunities)
   - Sessions where a simpler model would have sufficed (routing improvements)
3. Identify the most valuable/reusable insight
4. Evaluate quality (must pass threshold)
5. Decide scope (project vs global) — token efficiency patterns are typically **global** scope
6. Draft the skill file with frontmatter
7. Ask user to confirm before saving
8. Save to the appropriate learned skills directory

## Content Rules

Learned skills are **stateful architectural reference documents**. They describe how the system works right now.

### Voice & Tense
- Objective active voice, present tense throughout
- No history: "previously", "was changed", "now", "used to", "has been updated"
- No future: "planned", "TODO", "will be added", "future work"
- No status markers: "✅ FIXED", "~~done~~", "Implemented — Phase 1"
- No PR/branch references — the skill is timeless

### Structure
- **Architecture / Behavior** sections state facts about how the system works
- **Known Risks** section (optional) states gaps factually without prescribing fixes
- **When to Use** section lists trigger conditions

### Conciseness
- Target under 150 lines per skill file
- One clear sentence over three hedging ones
- Code references (`file:line`) over prose descriptions
- Tables over paragraphs when listing multiple items
- Drop extraction dates — git log has history

### Updates
When code changes invalidate a skill, rewrite affected sections as current facts. Remove all language referencing the old state.

## Notes

- Don't extract trivial fixes (typos, simple syntax errors)
- Don't extract one-time issues (specific API outages, etc.)
- Focus on patterns that will save time in future sessions
- Keep skills focused — one pattern per skill file
- Confidence starts at 0.5 for new patterns (moderate)
