# Stat Changes & Status Conditions Design

**Date:** 2026-08-26

## Overview

Wire up tracking and application of stat stage changes and status conditions in the battle engine. The infrastructure (types, event names, `StatBoosts` on `PartyMember`) already exists but nothing is connected — `executeStatusMove` returns results that are never applied, Intimidate's `onSwitchIn` is a no-op, and there is no sleep expiry logic. This work closes that gap.

**In scope:** stat boosts from moves (raise/lower attack, raise speed, etc.), status conditions from moves (paralysis, poison, sleep), secondary effects from damaging moves (e.g. Flamethrower 10% burn), sleep duration and expiry, Intimidate wiring, contact ability hook infrastructure.

**Out of scope:** every individual ability implementation (follow-up work); healing moves beyond Roost (unchanged); weather-based status effects.

---

## 1. Data Model Changes

### VolatileStatusEntry

`PartyMember.volatileStatus` changes from `string[]` to a structured array:

```ts
interface VolatileStatusEntry {
  name: string;
  counter?: number;
}

// on PartyMember:
volatileStatus: VolatileStatusEntry[];
```

- **Toxic:** single entry `{ name: 'toxic', counter: 1 }`, counter increments by 1 each end-of-turn tick.
- **Sleep:** entry `{ name: 'sleep', counter: N }` where N is rolled randomly 1–3 on application. Counter decrements by 1 each end-of-turn; when it reaches 0, sleep is cured.
- **Other volatile statuses** (confusion, leech seed, etc.): entries without a counter, e.g. `{ name: 'confusion' }`.

All existing code that reads `volatileStatus` must be updated to the new shape.

### Move Schema Extension

Two optional fields added to the move data type in `shared`:

```ts
effect?: string;        // status id ('brn', 'par', 'psn') or stat key ('atk', 'spe')
effectChance?: number;  // integer 0–100 (percent probability of secondary effect)
```

Both fields are populated from game data during seeding for moves with secondary effects (e.g. Flamethrower: `effect: 'brn', effectChance: 10`). Moves without secondary effects omit both fields.

---

## 2. Core Helpers (`engine/effects.ts`)

A new file `packages/server/src/engine/effects.ts` provides shared helpers used by both the status-move path and the secondary-effect path.

### `applyStatus`

```ts
function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  state: BattleState
): TurnResolveEvent | null
```

- Calls `canApplyStatus` — returns `null` if immune or already statused.
- Sets `member.status`.
- For sleep: rolls sleep duration (1–3), pushes `{ name: 'sleep', counter: N }` to `member.volatileStatus`.
- Returns a `status-applied` event: `{ slotId, status }`.

### `applyStatBoost`

```ts
function applyStatBoost(
  member: PartyMember,
  slotId: string,
  deltas: Partial<Record<keyof StatBoosts, number>>
): TurnResolveEvent
```

- Clamps each stat in `deltas` so the resulting value stays within -6/+6.
- Merges into `member.statBoosts`.
- Returns a `stat-change` event: `{ slotId, changes: { atk: +2, ... } }`.

### `evaluateSecondaryEffect`

```ts
function evaluateSecondaryEffect(
  move: MoveData,
  attacker: PartyMember,
  attackerSlotId: string,
  target: PartyMember,
  targetSlotId: string,
  state: BattleState
): TurnResolveEvent | null
```

- Returns `null` if `move.effect` or `move.effectChance` are absent.
- Rolls `Math.random() * 100 < move.effectChance`.
- On success: if `move.effect` is a `StatusCondition`, calls `applyStatus`; if it is a stat key, calls `applyStatBoost`.
- Returns the resulting event, or `null` if the roll fails or the effect is blocked.

---

## 3. Status Move Wiring

`StatusMoveResult` in `moves.ts` gains a `targetsSelf` flag:

```ts
export interface StatusMoveResult {
  statusToApply?: string;
  statBoostDeltas?: Partial<Record<string, number>>;
  heals?: boolean;
  targetsSelf?: boolean;  // true for self-targeting moves (Swords Dance, Roost, etc.)
}
```

Each move in the switch sets `targetsSelf` appropriately (Swords Dance: `true`; Will-O-Wisp: `false`).

`BattleEngine.executeMove` currently returns early after emitting `move-used` for status-category moves. Instead it will:

1. Call `executeStatusMove(moveId, user, target, state)`.
2. Determine the affected member: `result.targetsSelf ? attacker : target`.
3. If `result.statusToApply` → call `applyStatus(member, slotId, status, state)`, push event.
4. If `result.statBoostDeltas` → call `applyStatBoost(member, slotId, deltas)`, push event.
5. If `result.heals` → existing heal logic (unchanged).

---

## 4. Secondary Effect Evaluation

After damage is applied for any damaging move (physical or special), `BattleEngine.executeMove` calls:

```ts
const secondaryEvent = evaluateSecondaryEffect(move, attacker, attackerSlotId, target, targetSlotId, s);
if (secondaryEvent) events.push(secondaryEvent);
```

This is called once per target in the existing target loop, after the damage event is pushed and before the faint check.

---

## 5. Ability Hooks

### `onAfterHit` (new hook)

```ts
onAfterHit?: (ctx: AttackContext & { isPhysical: boolean }) => { statusToApply?: string } | null;
```

Called on the **defender's** ability after they take damage. `BattleEngine.executeMove` calls this immediately after damage is applied:

```ts
const defenderAbilityHooks = getAbilityHooks(target.ability);
const afterHitResult = defenderAbilityHooks.onAfterHit?.({ user: target, state: s, moveType: move.type, basePower: move.basePower, target: attacker, isPhysical });
if (afterHitResult?.statusToApply) {
  const event = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, s);
  if (event) events.push(event);
}
```

Contact abilities (Static → par, Flame Body → brn) are implemented by adding entries to `ABILITY_HOOKS` — this work establishes the hook; individual abilities are follow-up.

### `onSwitchIn` return type

`onSwitchIn` is updated to return stat deltas:

```ts
onSwitchIn?: (ctx: AbilityContext) => { statBoostDeltas?: Partial<StatBoosts> } | null;
```

`BattleEngine.executeSwitch` calls this on the incoming Pokémon's ability. For Intimidate, the result `{ statBoostDeltas: { atk: -1 } }` is applied to each opponent's active Pokémon via `applyStatBoost`.

**Intimidate** is the one ability implemented in this work:

```ts
intimidate: {
  onSwitchIn: () => ({ statBoostDeltas: { atk: -1 } }),
},
```

---

## 6. Sleep & Status Expiry

`tickStatus` is updated to accept the volatile entry for the current status condition:

```ts
export function tickStatus(
  status: StatusCondition,
  maxHp: number,
  volatileEntry?: VolatileStatusEntry
): StatusTickResult
```

- **Toxic:** reads `volatileEntry.counter` for the escalating damage formula (replaces the string-counting approach).
- **Sleep:** returns `cured: true` when `volatileEntry.counter` is 0 or undefined. The engine checks the counter before decrementing — if counter is already 0, the pokemon wakes up; otherwise decrement and leave asleep. This ensures a counter of 1 gives 1 full turn asleep (cured at the end of the following turn), matching the intended 1–3 turn range.

In `BattleEngine.endOfTurn`, for each active Pokémon:

1. If status is `'tox'`: find/increment the toxic volatile entry counter, pass to `tickStatus`.
2. If status is `'slp'`: find the sleep volatile entry. Call `tickStatus` with current counter. If `tick.cured`:
   - Remove the sleep volatile entry.
   - Clear `active.status`.
   - Push a `status-cured` event.
   Otherwise: decrement the counter by 1.

---

## 7. Events

No new event types are needed — `status-applied`, `status-cured`, and `stat-change` already exist in `TurnResolveEvent`. The `data` payloads:

| Event | Key fields |
|---|---|
| `status-applied` | `slotId`, `status` |
| `status-cured` | `slotId`, `status` |
| `stat-change` | `slotId`, `changes: Record<string, number>` |

---

## Files Touched

| File | Change |
|---|---|
| `shared/src/types/battle.ts` | `VolatileStatusEntry` type, update `PartyMember.volatileStatus` |
| `shared/src/schemas/move.schema.ts` | Add `effect`, `effectChance` optional fields |
| `server/src/engine/effects.ts` | New file: `applyStatus`, `applyStatBoost`, `evaluateSecondaryEffect` |
| `server/src/engine/moves.ts` | Add `targetsSelf` to `StatusMoveResult` |
| `server/src/engine/status.ts` | Update `tickStatus` signature, sleep/toxic counter logic |
| `server/src/engine/abilities.ts` | `onAfterHit` hook type, `onSwitchIn` return type, Intimidate implementation |
| `server/src/engine/BattleEngine.ts` | Wire status move results, secondary effects, ability hooks, sleep/toxic expiry |
| `server/src/engine/__tests__/effects.test.ts` | New test file for helpers |
| `server/src/engine/__tests__/BattleEngine.test.ts` | Integration tests for stat changes and status application |
| `server/src/engine/__tests__/fixtures.ts` | Update `makePokemon` volatile status shape |
