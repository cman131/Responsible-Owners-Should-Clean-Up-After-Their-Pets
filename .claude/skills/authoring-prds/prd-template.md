# PRD: [Feature Name]

**Author:** [Name]
**Status:** Draft
**Last Updated:** [YYYY-MM-DD]
**Product Area:** SKY Platform — Data Intelligence
**Parent PRD:** [Data Health Agent — Product Vision](../../product-vision.md)

---

## 1. Problem Statement

### Current State
<!-- What is the world like today, without this feature? Describe the gap or pain point from the customer's
     perspective. Be specific — name the workflow that's broken, the data that's missing, the action that
     can't be taken. No solution language here. -->

### Impact
<!-- What does this problem cost? Who suffers, and how? Connect the gap to downstream effects:
     lost trust, blocked workflows, deferred adoption of higher-value capabilities. -->

### Desired Outcome
<!-- What does success look like after this feature ships? A numbered list of concrete outcomes works well.
     Frame outcomes from the customer's perspective — what can they now do, see, or trust that they couldn't
     before? -->

---

## 2. Goals and Non-Goals

### Goals
<!-- Numbered, bold-lead-in statements. Each goal should be a discrete, independently testable outcome.
     Tie each goal to a user need, not a technical deliverable. -->

1. **[Goal title]** — one-sentence description.

### Non-Goals
<!-- Explicit scope cuts. Be specific: name the thing that's out of scope and, where helpful, note whether
     it's deferred (to a future slice) or permanently excluded. Non-goals prevent scope creep and set
     reviewer expectations. -->

1. **[Non-goal title].** One sentence explaining what is out of scope and why (or that it's deferred).

---

## 3. User Stories

### Personas

#### [Primary Persona Name] (primary)
One paragraph: who they are, what they own, and what their relationship to this feature is.

#### [Secondary Persona Name] (secondary)
One paragraph.

### Stories

<!-- "As a [persona], I want [action] so that [value/outcome]."
     Number stories S1, S2, ... Keep each story atomic — one user, one want, one outcome.
     Cover the main happy paths and the most critical edge cases. -->

**S1.** As a [persona], I want [action] so that [outcome].

---

## 4. Proposed Solution

<!-- Prose description of the feature, organized by surface or user flow.
     Write at the "what the customer sees and does" level — not the "how the service works" level.
     It's fine to name which existing services are involved (Broadcast Service, Databricks, etc.),
     but do not describe API contracts, payload shapes, or internal mechanics.
     Reference the drill-in template below for how to structure sub-sections. -->

### 4.1 [Surface or Feature Area]

<!-- Describe the user-facing behavior of this surface/flow. -->

---

## 5. External Dependencies

<!-- Table listing every external system this feature relies on.
     "Purpose" = what this feature needs from it, in customer-facing terms. No API details.
     If another initiative in this repo must ship first, add it as a row and mark it **Prerequisite**. -->

| Dependency | Purpose |
|------------|---------|
| [System name] | [What this feature needs it for] |

---

## 6. Acceptance Criteria

<!-- Group ACs by functional area (matching §4 sub-sections is a good default).
     Each AC is numbered sequentially (AC-1, AC-2, ...) across the whole document.
     ACs should be testable, behavioral statements: "The dashboard displays X" not "GET /api/x returns X."
     For ACs that depend on an unresolved open question, add a parenthetical:
     "(Contingent on OQ-N; degrades to [fallback behavior] if unresolved.)" -->

### [Functional Area]

**AC-1.** [Behavioral statement.]

---

## 7. Success Metrics

<!-- Split into leading (weeks to months post-launch) and lagging (quarters post-launch) indicators.
     Every row needs a measurement method — not just a number.
     If you don't have baseline data to ground a target, mark the Target as "TBD — pending baseline data"
     rather than inventing a plausible-sounding number. -->

### Leading Indicators (weeks to months post-launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| [Metric name] | [Target or "TBD — pending baseline data"] | [How measured] |

### Lagging Indicators (quarters post-launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| [Metric name] | [Target or "TBD — pending baseline data"] | [How measured] |

---

## 8. Open Questions

<!-- §8.1 preserves decisions already reached — do not delete these; they are the audit trail.
     §8.2 lists only what is genuinely unanswerable today.
     Every open item needs an Owner (Engineering or Product) and a Priority (High/Medium/Low).
     High-priority open items that block ACs should have a contingency noted in §6. -->

### 8.1 Resolved Decisions

| # | Topic | Decision |
|---|-------|----------|
| OQ-N | [Short topic label] | [What was decided and why, in one sentence.] |

### 8.2 Open Items

| # | Question | Owner | Priority |
|---|----------|-------|----------|
| OQ-N | [The open question, written as a complete sentence.] | Engineering / Product | High / Medium / Low |

---

## Appendix — Related Documents

- Product Vision: `../../product-vision.md`
- [Link to any other relevant plan documents]
