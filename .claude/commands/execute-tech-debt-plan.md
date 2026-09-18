# Execute Tech-Debt Plan

Drive a tech-debt plan document to completion, managing its State field automatically.

## Usage

`/execute-tech-debt-plan [path]`

- `[path]` — optional path to a doc under `docs/tech-debt/`. If omitted, the skill lists all `New` plans for you to pick from.

## Instructions

1. Load the `execute-tech-debt-plan` skill from `.claude/skills/execute-tech-debt-plan/SKILL.md`
2. Pass `$ARGUMENTS` as the path input (may be empty)
3. Follow the skill workflow exactly

## Arguments

$ARGUMENTS:
- `[path]` optional relative path to a tech-debt plan document (e.g. `docs/tech-debt/battle-ui/fixed-800px-layout-not-responsive.md`)
