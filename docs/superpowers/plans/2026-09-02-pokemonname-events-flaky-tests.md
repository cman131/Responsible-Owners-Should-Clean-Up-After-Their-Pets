# pokemonName Events + Flaky Test Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the pokemonName additions to status events and fix three test/typecheck issues left over from the ability-item-completion work.

**Architecture:** Two commits — one for the pokemonName feature (logic + test fixes), one for TypeScript cleanup. All changes are single-line or minimal. No new hooks, no new files.

**Tech Stack:** TypeScript, Vitest — `packages/server` (engine + socket tests).

**Test command:** Run from `packages/server/`: `npm test` (all 608 tests pass). Typecheck: `npm run typecheck`.

---

### Task 1: Fix Flaky Hypnosis Tests + Commit pokemonName Changes

**Files:**
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts` (lines 256 and 449)
- Already modified (uncommitted): `packages/server/src/engine/effects.ts`
- Already modified (uncommitted): `packages/server/src/engine/EffectEngine.ts`

The two Hypnosis tests use `new BattleEngine()` (real `Math.random`). Hypnosis has 60% accuracy — a 40% miss chance per run makes them flaky. Fixing both to `new BattleEngine({ rng: () => 0 })` makes accuracy roll = 0 < 0.60 → always lands. Sleep counter = `Math.floor(0 * 3) + 1 = 1` (valid single-turn sleep).

- [ ] **Step 1: Verify failures reproducibly**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|Hypnosis|sleep includes"
```

Expected: at least one of the two tests fails (intermittent — may need a couple runs if they happen to pass).

- [ ] **Step 2: Fix the "status-applied event for sleep includes pokemonName" test (line 256)**

In `packages/server/src/engine/__tests__/BattleEngine.test.ts`, change line 256:

```typescript
// Before:
    const engine = new BattleEngine();

// After:
    const engine = new BattleEngine({ rng: () => 0 });
```

- [ ] **Step 3: Fix the "Hypnosis puts the target to sleep" test (line 449)**

In `packages/server/src/engine/__tests__/BattleEngine.test.ts`, change line 449:

```typescript
// Before:
    const { newState } = new BattleEngine().resolveTurn(state, {

// After:
    const { newState } = new BattleEngine({ rng: () => 0 }).resolveTurn(state, {
```

- [ ] **Step 4: Run just BattleEngine.test.ts to verify all 97 tests pass**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts --reporter=verbose 2>&1 | tail -5
```

Expected:
```
Test Files  1 passed (1)
      Tests  97 passed (97)
```

- [ ] **Step 5: Run full test suite to confirm no regressions**

```
cd packages/server && npm test 2>&1 | tail -5
```

Expected:
```
Test Files  30 passed (30)
      Tests  608 passed (608)
```

- [ ] **Step 6: Commit all three files**

```
git add packages/server/src/engine/effects.ts packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "$(cat <<'EOF'
fix: add pokemonName to status events; use controlled rng in Hypnosis tests

status-applied and status-cured events now include pokemonName for display.
Two Hypnosis tests switched to rng:()=>0 to eliminate 40% flake rate.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fix TypeScript Errors

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts` (line 116)
- Modify: `packages/server/src/socket/__tests__/adminHandlers.test.ts` (lines 213, 227)

- [ ] **Step 1: Run typecheck to see current errors**

```
cd packages/server && npm run typecheck 2>&1
```

Expected: 3 errors in `effectFactories.ts` and `adminHandlers.test.ts`.

- [ ] **Step 2: Fix effectFactories.ts line 116**

In `packages/server/src/engine/effectFactories.ts`, change line 116:

```typescript
// Before:
    const currentValue = (ctx.battle.field.sideConditions[sideIdx] as Record<string, unknown>)[key as string];

// After:
    const currentValue = (ctx.battle.field.sideConditions[sideIdx] as any)[key as string];
```

- [ ] **Step 3: Fix adminHandlers.test.ts lines 213 and 227**

In `packages/server/src/socket/__tests__/adminHandlers.test.ts`, change both occurrences of the array destructure pattern:

Line 213:
```typescript
// Before:
      .find(([event]: [string]) => event === 'data:results');

// After:
      .find(([event]: any[]) => event === 'data:results');
```

Line 227:
```typescript
// Before:
      .find(([event]: [string]) => event === 'data:results');

// After:
      .find(([event]: any[]) => event === 'data:results');
```

- [ ] **Step 4: Run typecheck to verify 0 errors**

```
cd packages/server && npm run typecheck 2>&1
```

Expected: no output (clean exit).

- [ ] **Step 5: Run full test suite one final time**

```
cd packages/server && npm test 2>&1 | tail -5
```

Expected:
```
Test Files  30 passed (30)
      Tests  608 passed (608)
```

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/socket/__tests__/adminHandlers.test.ts
git commit -m "$(cat <<'EOF'
fix: resolve TypeScript errors in effectFactories and adminHandlers test

SideConditions cast uses `as any` (consistent with line 131).
adminHandlers.test find() callback destructure broadened to any[].

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Commit effects.ts/EffectEngine.ts pokemonName changes → Task 1 Step 6
- ✅ Fix flaky Hypnosis test at line ~253 → Task 1 Step 2
- ✅ Fix flaky Hypnosis test at line ~446 → Task 1 Step 3
- ✅ Fix effectFactories.ts:116 TypeScript error → Task 2 Step 2
- ✅ Fix adminHandlers.test.ts:213 TypeScript error → Task 2 Step 3
- ✅ Fix adminHandlers.test.ts:227 TypeScript error → Task 2 Step 3

**Placeholder scan:** None found.

**Type consistency:** No new types introduced.
