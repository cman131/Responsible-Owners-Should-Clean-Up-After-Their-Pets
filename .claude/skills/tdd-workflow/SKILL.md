---
name: tdd-workflow
description: Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage using Vitest, Vitest (vi.fn(), vi.spyOn()), and Vitest (expect).
---

# Test-Driven Development Workflow

This skill ensures all code development follows TDD principles with comprehensive test coverage.

## When to Activate

- Writing new features or functionality
- Fixing bugs or issues
- Refactoring existing code
- Adding API endpoints
- Creating new services, orchestrations, or handlers

## Core Principles

### 1. Tests BEFORE Code
ALWAYS write tests first, then implement code to make tests pass.

### 2. Coverage Requirements
- Minimum 80% line coverage on changed code
- All edge cases covered
- Error scenarios tested
- Boundary conditions verified

### 3. Test Types

#### Unit Tests
- Service methods and business logic
- Repository / data-access implementations
- Extension methods and utilities
- Model validation

#### Integration Tests
- Database data-access operations
- Message queue / event-bus handlers
- External API / OAuth integration flows

See `profiles/<your-stack>/rules-addendum.md` for this stack's actual integration surfaces (specific data store, message bus, and external adapters).

## TDD Workflow Steps

### Step 1: Define Acceptance Criteria
```text
Given [precondition]
When [action]
Then [expected outcome]
```

### Step 2: Write Failing Tests
For each acceptance criterion, write test(s) that express the expected behavior. The exact syntax is Vitest-specific (see the stack's `rules-addendum.md` for real syntax); the shape is the same everywhere:

```text
Vitest test class: OrderServiceTests

  test: ProcessOrderAsync_WithValidInput_PersistsOrder
    Arrange — build the service under test and a valid request payload
    Act     — result = await service.ProcessOrderAsync(request, cancellationToken)
    Assert (Vitest (expect)) — result is not null; result.Status equals "Processed"

  test: ProcessOrderAsync_WithNullCustomerId_ThrowsArgumentException
    Arrange — build a request with CustomerId = null
    Act     — call = () => service.ProcessOrderAsync(request, cancellationToken)
    Assert (Vitest (expect)) — calling it throws ArgumentException

  parameterized test (inputs: "", " "): ProcessOrderAsync_WithEmptyOrderId_ThrowsArgumentException
    Same Arrange/Act/Assert as above, varying only the input value — this is what
    Vitest's parameterized-test feature is for (e.g. Jest/Vitest's `it.each`,
    JUnit's `@ParameterizedTest`, or the equivalent attribute-driven data-row feature many
    .NET test frameworks provide).
```

### Step 3: Run Tests (They Should Fail)
```bash
pnpm test --filter "FullyQualifiedName~ClassName"
# Tests should fail — we haven't implemented yet
```

### Step 4: Implement Minimal Code
Write the minimum code to make tests pass. Follow this project's conventions (see `rules.md` and the stack's `rules-addendum.md`) — namespacing/module layout, constructor/DI style, interface-implementation pairing, DTOs at API boundaries.

### Step 5: Run Tests Again
```bash
pnpm test --filter "FullyQualifiedName~ClassName"
# Tests should now pass
```

### Step 6: Refactor
Improve code quality while keeping tests green:
- Remove duplication
- Extract helper methods for complex integration/data-access logic
- Ensure naming follows this project's conventions (see `rules.md`)

### Step 7: Verify Coverage
```bash
pnpm test
# Collect coverage (flags/report location are stack-specific — see rules-addendum.md)
# Parse the coverage report for changed files — verify 80%+ line coverage
```

### Step 8: Build Clean
```bash
pnpm --filter @poke-fighter/shared build && pnpm build
# Must pass with zero warnings
```

## Testability: Narrowest Visibility That's Still Testable, Test the Logic Not the Wrapper

### The Problem with the Most Restrictive Visibility
Business logic buried behind the most restrictive visibility modifier (e.g. `private`) can only be tested through whatever entry point calls it — an orchestration activity, a message-bus handler, a timer trigger, a controller action. These entry points are boilerplate: they deserialize input, call the real logic, serialize output. Testing through them means:
- You're testing framework plumbing (durable-orchestration replay, message delivery) instead of your code
- Setup is heavy — you need to mock orchestration contexts, message receivers, HTTP pipelines
- Failures are ambiguous — did the test fail because of your logic or the boilerplate?

### The Solution: Widen Just Enough to Test Directly
Give business-logic methods the narrowest visibility that still lets the test project call them directly — the exact mechanism is stack-specific (C#'s `internal` + `InternalsVisibleTo`, Kotlin's `internal`, Java/Kotlin package-private with tests in the same package, TypeScript's lack of true internal visibility meaning exported-but-undocumented or a dedicated `internal/` barrel). See `profiles/<your-stack>/rules-addendum.md` for the concrete pattern this project uses.

```text
// ✅ CORRECT: Business logic has the narrowest testable visibility
class OrderService(orderRepository) implements IOrderService

  // Public entry point called by the controller — thin wrapper, no logic to test
  async ProcessOrderAsync(payload, cancellationToken):
      order = MapToDocument(payload)
      await PersistWithDeduplicationAsync(order, payload.CustomerId, cancellationToken)

  // Narrowest-testable-visibility business logic — test THIS directly
  [narrowest testable visibility] async PersistWithDeduplicationAsync(order, customerId, cancellationToken):
      // Real logic lives here — check for duplicate, apply concurrency token, upsert or skip
```

```text
// Test hits the narrowly-visible method directly — no controller context needed
Vitest test: PersistWithDeduplicationAsync_WhenDuplicateReceived_SkipsPersist
  Arrange — order = { Id: "order-1", IsDuplicate: true }   (simple, focused setup)
  Act     — await sut.PersistWithDeduplicationAsync(order, "customer-1", cancellationToken)
  Assert (Vitest (vi.fn(), vi.spyOn())) — repository.UpsertAsync was never called
```

### When to Use Which Visibility

| Visibility | Use for | Testability |
|-----------|---------|-------------|
| Fully public | API surface — interfaces, contracts, controller actions | Test through the interface |
| Narrowest-testable (package/module-internal) | Business logic, orchestration helpers, data transforms, validation | Test directly via the stack's cross-test-project visibility mechanism |
| Fully private | Truly trivial helpers (one-liner transforms, null coalescing) | Tested indirectly through the method that calls them |

### Separation of Concerns for Testing

Structure code so each layer is testable independently:

```text
Orchestration / Handler / Controller  ← Thin wrapper, minimal testing
    ↓ calls
Narrowly-visible service method       ← Business logic, primary test target
    ↓ calls
Data access / external client         ← Mocked in unit tests
```

**Don't test the wrapper when you mean to test the logic.** If a controller action calls `PersistWithDeduplicationAsync`, write tests for `PersistWithDeduplicationAsync` directly — not tests that spin up an HTTP pipeline just to reach that method.

**Do test the wrapper separately** only for its own concerns: retry policy, error mapping, request deserialization. Keep those tests minimal.

### Rules from Code Review

These rules apply to all tests written in TDD:

- **Test the implementation, not a simulation**: Tests must call real production code. A test that re-implements the same filter logic as the production method tests nothing — it only proves the language's collection APIs work. Invoke the actual method and assert on its real output.
- **No trivial/meaningless tests**: Every test must answer: "If I deleted or broke the production method, would this test fail?" If no, delete or rewrite the test.
- **Strict mock setups**: Use specific matchers for known values (Vitest (vi.fn(), vi.spyOn())'s argument-matcher/predicate feature). A wildcard "any value" matcher is only acceptable for cancellation/timeout tokens and infrastructure/opaque parameters.

## Test Quality & Hygiene

Before writing any test, and again after all tests pass, run through these checks.

### Deduplicate: Hunt for Redundant Tests

Before writing a new test, scan the test class for existing tests that cover the same behavior. After writing tests, review the full class and consolidate:

- **Same method, same assertion, different name** — delete the duplicate
- **Same setup, same act, overlapping asserts** — merge into one test
- **Tests that only differ by input** — consolidate into a single parameterized test

```text
❌ WRONG: Three separate tests that differ only by input
  test: Validate_WithEmptyString_ReturnsFalse       → ValidateAsync("")  → assert false
  test: Validate_WithWhitespace_ReturnsFalse        → ValidateAsync(" ") → assert false
  test: Validate_WithNull_ReturnsFalse              → ValidateAsync(null)→ assert false

✅ CORRECT: One parameterized test covers all invalid inputs
  parameterized test (inputs: null, "", " "): ValidateAsync_WithInvalidInput_ReturnsFalse
    result = await sut.ValidateAsync(input)
    Assert (Vitest (expect)) — result is false
```

### Use a Parameterized Test When Tests Share Structure

| Pattern | Use |
|---------|-----|
| Single test case | Single scenario, unique setup or assertion logic |
| Parameterized test with inline literal inputs | Same logic, different primitive inputs |
| Parameterized test with a data-source/fixture | Same logic, complex object inputs |

If you find yourself copy-pasting a single test case and changing one value, stop — it's a parameterized test.

### Verify Side Effects with the Mock, Assert Results on the Object

Two distinct assertion strategies depending on what the method does:

**Commands (side effects)** — use Vitest (vi.fn(), vi.spyOn())'s verify/assert-called feature to confirm the right calls happened with the right arguments:

```text
Vitest test: DeleteOrderAsync_PersistsDeletion
  Act — await sut.DeleteOrderAsync("order-1", "customer-1", cancellationToken)
  Assert (Vitest (vi.fn(), vi.spyOn())) — repository.UpsertAsync was called exactly once with
    an order where Id == "order-1" and IsDeleted == true
```

**Queries (return values)** — assert against the returned object, don't just check that mocks were called:

```text
❌ WRONG: Verifying the mock was called but never checking what was returned
  test: GetOrderAsync_WhenExists_Works
    repository.GetByIdAsync(anyId) returns { Id: "order-1", ProductId: "prod-42" }
    await sut.GetOrderAsync("order-1", cancellationToken)
    Assert (Vitest (vi.fn(), vi.spyOn())) — repository.GetByIdAsync was called with "order-1"
    // Never checked the return value — what did GetOrderAsync actually produce?

✅ CORRECT: Assert on the returned object
  test: GetOrderAsync_WhenExists_ReturnsMappedOrder
    repository.GetByIdAsync("order-1") returns { Id: "order-1", ProductId: "prod-42" }
    result = await sut.GetOrderAsync("order-1", cancellationToken)
    Assert (Vitest (expect)) — result is not null; result.Id == "order-1"; result.ProductId == "prod-42"
```

**Mixed (command + return)** — some methods do both. Verify the side effect AND assert the return value:

```text
Vitest test: SyncOrderAsync_PersistsAndReturnsUpdatedOrder
  Arrange — order = { Id: "order-42", IsActive: false }; repository.GetByIdAsync("order-42") returns order
  Act     — result = await sut.SyncOrderAsync("order-42", cancellationToken)
  Assert (Vitest (expect)) — result.IsActive is true
  Assert (Vitest (vi.fn(), vi.spyOn())) — repository.UpsertAsync was called exactly once with an order where IsActive == true
```

### Self-Testing Tests Are Worthless

A test that contains its own implementation is not testing production code — it's testing itself.

```text
❌ WRONG: Test contains the same logic as the production code
  test: GetProcessedOrders_FiltersCorrectly
    orders = [ {Status: Processed}, {Status: Pending}, {Status: Processed} ]
    // This IS the production logic copy-pasted — tests nothing
    result = orders.filter(o => o.Status == Processed)
    Assert — result has 2 items

✅ CORRECT: Calls the real method, asserts real output
  test: GetProcessedOrdersAsync_ReturnsOnlyProcessedOrders
    // Arrange — seed data through the mock
    repository.QueryAsync(anyQuery) returns [ {Status: Processed}, {Status: Pending}, {Status: Processed} ]
    // Act — call the REAL production method
    result = await sut.GetProcessedOrdersAsync("customer-1", cancellationToken)
    // Assert
    Assert (Vitest (expect)) — result has 2 items; every item has Status == Processed
```

## Testing Patterns

### Service Test Pattern (using Vitest (vi.fn(), vi.spyOn()) and Vitest (expect))
```text
class OrderServiceTests
  repository = mock<IOrderRepository>()
  requestContext = mock<IRequestContext>()
  sut = new OrderService(repository, requestContext)

  test: GetOrderAsync_WhenExists_ReturnsOrder
    expected = { Id: "order-1" }
    repository.GetByIdAsync("order-1") returns expected
    result = await sut.GetOrderAsync("order-1", cancellationToken)
    Assert (Vitest (expect)) — result is equivalent to expected

  test: GetOrderAsync_WhenNotFound_ReturnsNull
    repository.GetByIdAsync(anyId) returns null
    result = await sut.GetOrderAsync("missing", cancellationToken)
    Assert (Vitest (expect)) — result is null
```

### Repository Test Pattern
```text
class OrderRepositoryTests
  dataStoreConnection = mock<IDataStoreConnection>()
  sut = new OrderRepository(dataStoreConnection)

  test: UpsertAsync_WithValidOrder_PersistsDocument
    order = { Id: "order-1", CustomerId: "customer-1" }
    await sut.UpsertAsync(order, cancellationToken)
    Assert (Vitest (vi.fn(), vi.spyOn())) — dataStoreConnection.UpsertItemAsync was called exactly once with an order where Id == "order-1"

  test: UpsertAsync_WithConcurrencyConflict_ThrowsConcurrencyException
    dataStoreConnection.UpsertItemAsync(anyOrder) throws a precondition-failed/conflict error from the data store
    call = () => sut.UpsertAsync({ Id: "order-1" }, cancellationToken)
    Assert (Vitest (expect)) — calling it throws ConcurrencyException
```

### Idempotency Test Pattern
```text
Vitest test: ProcessOrderAsync_WhenCalledTwice_ProducesSameResult
  payload = { Id: "order-1", CustomerId: "customer-1" }
  // Act — process the same payload twice
  await sut.ProcessOrderAsync(payload, cancellationToken)
  await sut.ProcessOrderAsync(payload, cancellationToken)
  // Assert — upsert called (not insert), final state is identical
  Assert (Vitest (vi.fn(), vi.spyOn())) — repository.UpsertAsync was called exactly twice
```

## Test File Organization

Test files mirror the source tree: one test class/module per production class/module, grouped by the same feature folders (e.g. business-logic, infrastructure/data-access, controllers) inside each test project/module.

`@poke-fighter/server, @poke-fighter/client, @poke-fighter/shared` — see `profiles/<your-stack>/commands-test-addendum.md` for this project's actual test projects/modules and naming convention.

## Mock Setup Rules

### Use Specific Matchers (Not "Any Value" for Known Values)
```text
❌ WRONG: Overly permissive — hides bugs
  mock.Setup(s => s.GetAsync(anyString, anyCancellationToken)).Returns(expected)

✅ CORRECT: Specific — fails if wrong value passed
  mock.Setup(s => s.GetAsync(matches(id => id == "expected-id"), anyCancellationToken)).Returns(expected)
```

### A Wildcard "Any Value" Matcher Is Acceptable For
- Cancellation / timeout tokens
- Infrastructure/opaque parameters that carry no business-meaningful data (e.g. request-options objects)
- Other genuinely opaque parameters

## Common Testing Mistakes to Avoid

### Testing the Simulation, Not the Code
```text
❌ WRONG: Re-implements production logic in the test
  filtered = testData.filter(o => o.Status == Processed)
  Assert — filtered has 3 items

✅ CORRECT: Calls the real production method
  result = await sut.GetProcessedOrdersAsync("customer-1", cancellationToken)
  Assert — result has 3 items
```

### Trivial Tests That Can't Catch Regressions
```text
❌ WRONG: Tests the language's collection APIs, not production code
  list = [1, 2, 3]
  Assert — list.filter(x => x > 1) has 2 items

✅ CORRECT: Tests actual behavior
  result = await sut.FilterActiveOrdersAsync(orders, cancellationToken)
  Assert — result has 2 items; every item IsActive
```

## Coverage Severity Guide

| Category | Threshold | Action |
|----------|-----------|--------|
| New public methods / business logic | Must have tests | CRITICAL if missing |
| Changed code | 80%+ line coverage | WARNING if below |
| Guard clauses, simple accessors | Low coverage acceptable | Note but don't flag |
| Auto-generated code, DTOs, application entry-point/bootstrap files | Ignore | Skip coverage analysis |

## Mutation Testing Validation

TDD ensures the code works. Mutation testing ensures the tests are **meaningful** — that they would actually catch a real bug, not just pass against the current implementation. A test suite can be green with 80%+ coverage and still miss real logic errors if assertions are too loose or branches aren't meaningfully exercised.

After completing TDD for a method, check `.claude/mutation-scores.jsonl` for prior mutation scores:

- **No entry exists**: Suggest running the mutation-tester agent to validate test strength
- **Prior score >= 0.90**: Tests are strong — no action needed
- **Prior score 0.75-0.89**: Tests are adequate but have minor gaps — note for awareness
- **Prior score < 0.75**: Tests need strengthening — recommend running mutation testing before considering TDD complete

This is optional and should not block TDD completion. It's a quality signal, not a gate.

---

**Remember**: Tests are not optional. Write them first. They are the safety net that enables confident refactoring and production reliability. Every test should answer: "If I broke the production code, would this test catch it?" Mutation testing answers that question empirically.
