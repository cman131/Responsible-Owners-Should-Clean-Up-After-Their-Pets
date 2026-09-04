---
name: pokemonname-events-flaky-tests
description: Commit pokemonName to status events, fix 2 flaky Hypnosis tests, fix 3 TypeScript errors
metadata:
  type: project
---

# Design: pokemonName in status events + test cleanup

**Date:** 2026-09-02  
**Branch:** feat/ability-item-completion  
**Scope:** Three small, independent fixes bundled into one clean commit.

---

## What's changing

### 1. pokemonName in status events

Two uncommitted changes already exist and just need committing:

- `packages/server/src/engine/effects.ts` — `applyStatus` return adds `pokemonName: member.nickname` to the `status-applied` event data
- `packages/server/src/engine/EffectEngine.ts` — sleep-cure block adds `pokemonName: pokemon.nickname` to the `status-cured` event data

No type changes needed: `TurnResolveEvent.data` is `Record<string, unknown>` so extra fields are always valid.

### 2. Flaky Hypnosis tests

Two tests in `packages/server/src/engine/__tests__/BattleEngine.test.ts` use `new BattleEngine()` (uncontrolled `Math.random`) with `hypnosis`, which has 60% accuracy — a 40% miss rate per run.

**Fix:** Replace `new BattleEngine()` with `new BattleEngine({ rng: () => 0 })` in both tests:
- Line ~253: "status-applied event for sleep includes pokemonName"
- Line ~446: "Hypnosis puts the target to sleep"

With `rng: () => 0`: accuracy roll = 0 < 0.60 → move lands. Sleep counter = `floor(0×3)+1 = 1` (valid, 1-turn sleep).

### 3. TypeScript errors

Two pre-existing TypeScript errors introduced earlier in this branch:

- `effectFactories.ts:116` — `(sideConditions[sideIdx] as Record<string, unknown>)[key]` fails because `SideConditions` doesn't overlap. Fix: change to `as any` (line 131 already does this).
- `adminHandlers.test.ts:213,227` — `([event]: [string])` fails strict tuple check. Fix: change to `([event]: any[])`.

---

## Testing

After all changes: `npm test` in `packages/server` → 608/608 pass, 0 TypeScript errors.
