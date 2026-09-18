# Model Route Command

Recommend the fastest viable model for the current task. Start cheap, escalate only when needed.

## Usage

`/model-route [task-description] [--speed fast|balanced|thorough]`

## Routing Heuristic

**Default to the fastest model that can handle the task.** Only escalate when complexity demands it:

| Tier | Model | Speed | Risk | Best For |
|------|-------|-------|------|----------|
| **haiku** | claude-haiku-4-5-20251001 | Fastest | Low | Deterministic transforms, simple lookups, boilerplate, classification, formatting |
| **sonnet** | claude-sonnet-4-6 | Moderate | Low–Medium | Implementation, refactoring, code review, moderate reasoning, most dev tasks |
| **opus** | claude-opus-4-6 | Most capable | Medium–High | Architecture, deep analysis, ambiguous requirements, security, compliance, PII |

Higher tiers use more tokens and take longer. Default to the fastest tier that can handle the task.

## Routing Signals

Route on **two axes**: complexity (how hard) and risk (what breaks if you get it wrong).

### Complexity

**Haiku** (low):
- Mechanical, repetitive changes (rename, reformat, add boilerplate)
- Single-file edits with clear instructions
- Classification or extraction from structured data
- Text length < 10,000 chars, item count < 30

**Sonnet** (medium):
- Multi-file implementation with business logic
- Code review requiring understanding of patterns
- Bug investigation with moderate context
- Text length >= 10,000 chars or item count >= 30

**Opus** (high):
- Architecture decisions with trade-offs
- Ambiguous requirements needing interpretation
- Cross-system analysis (multiple services, data flows)

### Risk — Escalate Regardless of Complexity

Some changes are simple but high-consequence. **Escalate to opus** when the change touches:

- **Security-sensitive code paths**: Auth, token handling, permission checks, encryption, key management
- **Regulated/PII data handling**: Personal identifiers, consent records, data retention and audit-logging obligations
- **Financial/payment data**: Billing, payment processing, financial reconciliation logic
- **Irreversible external side effects**: Writes to external systems that can't be easily undone, migration logic, idempotency guards, public API/external contract changes (schema changes, message formats, OpenAPI specs)

**Escalate to sonnet** (minimum) when:
- Modifying shared interfaces consumed by multiple services
- Changing DI registrations or middleware pipeline order
- Editing long-running orchestration/workflow logic (replay safety)

## Speed Adjustment

| Speed | Strategy |
|-------|----------|
| `fast` | Bias toward haiku; only use sonnet for genuinely complex tasks; avoid opus |
| `balanced` (default) | Use the heuristic as-is |
| `thorough` | Bias toward quality; use sonnet as default; use opus freely for complex tasks |

## Required Output

For each recommendation, provide:

1. **Recommended model** — haiku, sonnet, or opus
2. **Confidence** — high, medium, or low
3. **Reasoning** — 1-2 sentences on why this model fits
4. **Fallback** — which model to try if the recommendation underperforms
5. **Speed tradeoff** — what you gain/lose by using this model vs the next tier

## Arguments

$ARGUMENTS:
- `[task-description]` optional free-text describing the task
- `--speed fast|balanced|thorough` optional speed preference (default: balanced)
