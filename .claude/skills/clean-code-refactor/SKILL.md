---
name: clean-code-refactor
description: Refactor a single method in a single file to follow clean code principles — single responsibility, command/query separation, and clear naming so the code reads like prose.
---

# Clean Code Refactor

Refactor a single method in a single file to follow clean code principles.

## Input

The user provides via `$ARGUMENTS`:
- A file path and method name to refactor (or enough context to identify them)

If only a file is provided, ask which method to refactor.

## Principles

Apply these principles during the refactor:

### Single Responsibility (SRP)
- Each method must do exactly one thing
- If a method contains branching, sequential business operations, or multiple concerns, extract private helper methods
- Helper methods should be clearly named to describe their single responsibility so code reads like well-written prose

### Command Query Separation (CQS)
- **Commands** change state but return nothing (void/Task)
- **Queries** return data but have no side effects
- A method should not both change state and return a value unless there is a compelling reason (e.g., atomic pop from a collection)

### Self-Documenting Code
- Method names should describe *what* they do, not *how* — the name replaces the need for a comment
- Avoid vague qualifiers like "IfEligible", "IfValid", "IfReady" — these are ambiguous and make the reader want to check the internals. Instead, name the specific conditions: `GetDevAgentBbidForAssignedConstituent` tells you exactly what's being checked without opening the method
- If you need a comment to explain a block of code, that block should be a method whose name is the comment

### Separate Infrastructure from Business Logic
- Parsing, deserialization, schema validation, and input extraction are infrastructure — they should be extracted from the main method into a helper (e.g., `TryParseEmailConsentChange`)
- The public method's body should only contain business-level operations, not plumbing
- Guard clauses for invalid input can stay in the public method if simple, but clusters of related guards (parse + validate + extract) should be grouped into a single descriptively-named helper

### Collapse Dependent Queries
- If query B depends on the result of query A (e.g., get BBID, then use BBID to get email), and both can fail, they are a **single concern** — collapse them into one helper that returns the final value or null
- The public method should not contain intermediate null checks for chained lookups — those belong inside the helper
- Name the collapsed helper after the *final result*, not the intermediate steps (e.g., `GetSuppressedEmailForConstituent`, not `GetDevAgentBbidAndThenPrimaryEmail`)

### Method Structure
- Public methods should read as a high-level narrative: a parse/extract step, then a sequence of clearly named business operation calls
- Keep public methods short — they orchestrate, they don't implement
- Push implementation details into private helpers
- Avoid deep nesting — use early returns (guard clauses) to reduce indentation

### SOLID Beyond SRP
- **Open/Closed**: If the method branches on type or category, consider whether a strategy or polymorphism is more appropriate (flag, don't force — the user decides)
- **Dependency Inversion**: If the method creates its own dependencies inline, flag it

## Process

1. **Read** the file and the target method completely
2. **Identify** violations of the principles above — list them briefly
3. **Draft** the refactored code internally
4. **Self-review the draft** — re-read the proposed public method as if it were new code and apply every principle again. Check: Are there still null checks that could be pushed into helpers? Are there dependent sequential steps that should be collapsed? Is there nested error handling that should be extracted? If any violations remain, fix them before presenting.
5. **Propose** the final refactored code, showing the full method and any extracted helpers
6. **Explain** each extraction in one line: what was extracted and why
7. **Apply** the changes after the user confirms, or immediately if they said to just do it

## Rules

- Do NOT rename the public method or change its signature — only refactor internals
- Do NOT change behavior — this is a structure-only refactor. If existing unit tests fail after the refactor, that means behavior changed. Fix the refactored code to preserve the original behavior — never modify tests to accommodate the refactor
- Do NOT add new dependencies or interfaces unless the user asks
- Do NOT add comments, docstrings, or type annotations to code you didn't change
- Do NOT over-extract — three lines of simple sequential logic don't need a method. Extract when there's a distinct responsibility, not just because code exists
- Preserve existing logging patterns and messages (fix typos if spotted)
- NEVER remove informational log statements — entry logs (method name + parameters), pivotal-step logs, and warning/error logs exist for production traceability. Consolidating duplicate logs into fewer calls is fine, but every log call that was present before the refactor must still fire under the same conditions after. If two logs are truly redundant, keep the more informative one.
- Match existing code style (indentation, bracing, naming conventions) of the file
