# Extreme Weather Effects, Choice Lock Timing, Solar Beam — Design Spec

**Date:** 2026-09-01  
**Status:** Approved  
**Branch:** feat/ability-item-completion

## Background

Three issues were flagged in the post-merge review of the ability/item completion branch as non-blocking follow-up work:

1. Primordial Sea / Desolate Land / Delta Stream summon correctly but `damage.ts` doesn't apply their nullify/boost effects.
2. Choice lock is set at action-submit time (BattleRoom.ts) rather than after the move actually fires.
3. Solar Beam's charge-skip and power-halving checks test for `'sun'` but not `'harsh-sun'`.

---

## Scope

Three self-contained fixes, all touching server-side engine code. No shared-type changes required — `WeatherType` already includes `'harsh-sun' | 'heavy-rain' | 'strong-winds'`.

---

## Fix 1 — Extreme Weather: Nullify/Boost/Strong-Winds

### harsh-sun (Desolate Land)

| Move type | Effect |
|-----------|--------|
| Fire      | 1.5× damage (same modifier as regular sun) |
| Water     | Move fails before targeting — emit `move-failed { reason: 'harsh-sun' }`, return early |

### heavy-rain (Primordial Sea)

| Move type | Effect |
|-----------|--------|
| Water     | 1.5× damage (same modifier as regular rain) |
| Fire      | Move fails before targeting — emit `move-failed { reason: 'heavy-rain' }`, return early |

### strong-winds (Delta Stream)

After `effectiveness` is computed per-target in `BattleEngine.ts`, if the field weather is `'strong-winds'` and the target has the Flying type (including a Pokémon terastallized to Flying), clamp effectiveness:

- 4× → 2× (was double-super-effective; one layer removed)
- 2× → 1× (was super-effective; removed)
- ≤1× stays unchanged (neutrals and resists are unaffected)

This is applied by checking `defTypes.includes('Flying')` with `s.field.weather?.type === 'strong-winds'` immediately after `effectiveness` is computed, before the immunity checks.

### Supporting constants in `fieldState.ts`

**`WEATHER_ACCURACY`** — add harsh-sun and heavy-rain entries alongside existing sun/rain:

```
thunder:   { rain: true, 'heavy-rain': true, sun: 50, 'harsh-sun': 50 }
hurricane: { rain: true, 'heavy-rain': true, sun: 50, 'harsh-sun': 50 }
```

**`WEATHER_BALL_TYPE`** — add:

```
'harsh-sun': 'Fire'
'heavy-rain': 'Water'
```

### Implementation locations

| Change | File |
|--------|------|
| Nullification check (Fire in heavy-rain, Water in harsh-sun) | `BattleEngine.ts` — just before the `for (const targetSlotId of targetSlotIds)` loop, after move type is resolved |
| Boost modifier | `damage.ts` — extend the existing weather block to also match `'harsh-sun'` for Fire and `'heavy-rain'` for Water |
| Strong Winds effectiveness clamp | `BattleEngine.ts` — immediately after `effectiveness` is computed per-target |
| WEATHER_ACCURACY, WEATHER_BALL_TYPE | `fieldState.ts` |

---

## Fix 2 — Solar Beam / Solar Blade in harsh-sun

Two lines in `BattleEngine.ts` check the weather type as `'sun'` only.

**Line ~319** (charge-turn skip):
```ts
// Before:
const isSun = s.field.weather?.type === 'sun';
// After:
const isSun = s.field.weather?.type === 'sun' || s.field.weather?.type === 'harsh-sun';
```

**Line ~335** (power halving in non-sun weather):
```ts
// Before:
if (SOLAR_MOVES.has(move.id) && s.field.weather && s.field.weather.type !== 'sun') {
// After:
if (SOLAR_MOVES.has(move.id) && s.field.weather && !['sun', 'harsh-sun'].includes(s.field.weather.type)) {
```

No other files touched for this fix.

---

## Fix 3 — Choice Lock Timing

### Problem

`BattleRoom.ts` sets `active.lockedMoveId` at action-submission time — before `resolveTurn()` runs. If a Pokémon holding a choice item is asleep, frozen, paralyzed (full), or flinching on a turn where it hasn't yet established a lock, the lock is set even though the Pokémon never actually used a move.

### Design

**Remove from `BattleRoom.ts`:**
The block that sets `lockedMoveId` on first move selection:
```ts
// Remove this:
if (isChoiceLocked && !active.lockedMoveId) {
  const moveSlot = active.moves[action.moveIndex];
  if (moveSlot) active.lockedMoveId = moveSlot.moveId;
}
```
Keep the enforcement block (the check that rejects actions when locked to a different move) — it reads `lockedMoveId` from state, which is set by the engine after the previous turn.

**Add to `BattleEngine.ts`:**
After the `move-used` event is pushed (PP is already spent, Terastallize is already applied) and before the hit/miss roll, set the lock if the attacker holds a choice item or has Gorilla Tactics:

```ts
const CHOICE_ITEMS_SET = new Set(['choice-band', 'choice-specs', 'choice-scarf']);
if ((CHOICE_ITEMS_SET.has(attacker.heldItem ?? '') || effectiveAbilityId(attacker) === 'gorilla-tactics')
    && !attacker.lockedMoveId) {
  attacker.lockedMoveId = move.id;
}
```

The existing `delete outgoing.lockedMoveId` in `performSwitch` (line 922) stays as-is — lock is still cleared on switch-out.

### Behaviour change summary

| Scenario | Before | After |
|----------|--------|-------|
| Choice mon asleep, first turn | Lock set on selection | No lock set (mon never moves) |
| Choice mon paralyzed (full), first turn | Lock set on selection | No lock set |
| Choice mon uses move, hits | Lock set on selection | Lock set after move-used event |
| Choice mon uses move, misses | Lock set on selection | Lock set after move-used event |
| Choice mon protected by opponent | Lock set on selection | Lock set after move-used event |
| Already-locked mon, correct move | Enforced correctly | Enforced correctly (no change) |
| Switch-out | Lock cleared | Lock cleared (no change) |

Miss and protect still lock the mon (move-used fires before hit/miss checks) — this matches Gen 5+ behaviour.

---

## Tests to add

Each fix should be covered by targeted tests in the existing test files:

| Test | File |
|------|------|
| Water move fails (move-failed event) under heavy-rain | `abilities.test.ts` |
| Fire move fails under harsh-sun | `abilities.test.ts` |
| Fire move gets 1.5× under harsh-sun | `damage.test.ts` |
| Water move gets 1.5× under heavy-rain | `damage.test.ts` |
| Electric 2× vs Flying → 1× under strong-winds | New or `damage.test.ts` / `abilities.test.ts` |
| Solar Beam skips charge turn in harsh-sun | `abilities.test.ts` |
| Solar Beam power not halved in harsh-sun | `abilities.test.ts` |
| Solar Beam power halved in heavy-rain | `abilities.test.ts` |
| Choice mon asleep first turn — no lock set | `constraints.test.ts` or `items.test.ts` |
| Choice mon uses move — lock set after | `constraints.test.ts` or `items.test.ts` |
| Weather Ball is Fire-type in harsh-sun | `fieldState.test.ts` or `abilities.test.ts` |
| Thunder always-hits in heavy-rain | `accuracy.test.ts` |

---

## Files changed

| File | Change |
|------|--------|
| `packages/server/src/engine/damage.ts` | Extend weather block for harsh-sun/heavy-rain |
| `packages/server/src/engine/fieldState.ts` | WEATHER_ACCURACY and WEATHER_BALL_TYPE additions |
| `packages/server/src/engine/BattleEngine.ts` | Nullification check, strong-winds clamp, Solar Beam fix, choice lock set |
| `packages/server/src/socket/BattleRoom.ts` | Remove lock-set on submission, keep enforcement |
| Test files (existing) | New test cases per table above |
