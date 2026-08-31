# Switching Mechanics 7.1 — Switch Correctness Fundamentals

**Date:** 2026-08-31
**Status:** Approved
**Source spec:** `docs/upcoming-features/07-switching-mechanics.md` (FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-12, FR-13, FR-14)
**Follows:** doc 06 (screens & hazards)
**Feeds:** 7.2 (pivot moves), 7.3 (Pursuit + Baton Pass)

---

## Problem

The current switch implementation has two classes of correctness gaps:

1. **Forced switches bypass the engine entirely.** `BattleRoom.submitAction` handles forced switches (post-faint, phasing moves) with ~30 lines of inline logic that duplicate `executeSwitch` but skip `applyEntryHazards`, `onSwitchIn` ability hooks, and the volatile/boost cleanup.

2. **Missing ability hooks.** `onSwitchOut` does not exist in `AbilityHooks`. Regenerator, Natural Cure, Slow Start, and Truant do not fire on switch-out. `onSwitchIn` only implements Intimidate; Download, Trace, and Screen Cleaner are absent.

Additionally: switches emit `volatile-applied` with `data.note === 'switch'` instead of a dedicated event type, and the toxic counter volatile clears on switch-out (Gen 4 behavior) rather than persisting (Gen 5+ behavior).

---

## Scope

**In scope (7.1):**
- FR-1: Switch-out cleanup (stat boosts + volatiles) — extend to forced/phased paths
- FR-2: Toxic counter persists through switch (Gen 5+ behavior)
- FR-3: `onSwitchOut` hook in `AbilityHooks`
- FR-4: Regenerator, Natural Cure, Slow Start, Truant `onSwitchOut` implementations
- FR-5: Download, Trace, Screen Cleaner `onSwitchIn` implementations
- FR-6: Verify `applyEntryHazards` fires before `onSwitchIn` on all paths
- FR-12: Route forced switches through engine via `processForceSwitch`
- FR-13: Phasing moves use the corrected forced-switch path
- FR-14: `pokemon-switched` dedicated event type

**Out of scope (deferred):**
- 7.2: Pivot moves (U-turn, Volt Switch, Flip Turn, Teleport, Parting Shot, Chilly Reception)
- 7.3: Pursuit interception, Baton Pass transfer
- Doc 08: Weather-summoning ability hooks (`onSwitchIn` call site is wired here; implementations deferred)

---

## Architecture decision

**Approach: Full engine ownership via `processForceSwitch`.**

BattleEngine exposes a public `processForceSwitch` method. BattleRoom delegates all forced-switch state transitions to the engine, never touching `BattleState` directly for switches. This matches the existing pattern where BattleRoom calls `engine.resolveTurn()` and merges the returned state and events.

Both voluntary (`executeSwitch`) and forced (`processForceSwitch`) paths share a private `performSwitch` helper that contains the canonical switch sequence. No logic duplication.

---

## Data model changes

### `shared/types/events.ts`

Add to `TurnResolveEvent` type union:
```typescript
| { type: 'pokemon-switched'; data: { slotId: string; outInstanceId: string; inInstanceId: string; reason: 'voluntary' | 'forced' | 'phased' } }
```

`'pivot'` and `'baton-pass'` reasons are added in 7.2/7.3.

### `shared/types/battle.ts` — `PartyMember`

Add one optional field:
```typescript
tracedAbilityId?: string;
```

Set by the Trace ability on switch-in. All ability lookups use a helper `effectiveAbilityId(pokemon): string` (defined in `engine/abilities.ts`) that returns `pokemon.tracedAbilityId ?? pokemon.abilityId`. This makes Trace's copied ability apply to all future hooks without touching every lookup site individually.

### `engine/abilities.ts` — `AbilityHooks`

Add:
```typescript
onSwitchOut?: (ctx: SwitchContext) => SwitchOutResult | null;
```

Supporting types (defined in `engine/abilities.ts`, alongside `AbilityHooks`):
```typescript
interface SwitchContext {
  battle: BattleState;
  slotId: string;
  pokemon: PartyMember;
}

interface SwitchOutResult {
  hpDelta?: number;       // positive = heal (Regenerator)
  clearStatus?: boolean;  // true = clear status condition (Natural Cure)
  events: TurnResolveEvent[];
}
```

Extend `SwitchInResult` (returned by `onSwitchIn`) to include:
```typescript
traceAbilityId?: string;  // set by Trace; applied to tracedAbilityId on the PartyMember
```

### `engine/volatileClearRules.ts`

Remove `'toxic'` from `SWITCH_CLEAR_NAMES`. The toxic counter volatile now persists through switch-out (Gen 5+ behavior). Sleep (`'sleep'`) remains in the list — the sleep counter resets on switch-out in Gen 5+.

### `socket/BattleRoom.ts` — `awaitingForcedSwitches`

Change from `Set<string>` to `Map<string, 'forced' | 'phased'>` to track the reason alongside each awaiting slot. The reason flows into `processForceSwitch` and ultimately into the `pokemon-switched` event payload.

---

## Switch sequence (canonical, all paths)

The private `performSwitch(state, slotId, targetInstanceId, reason)` helper runs this sequence:

1. **`onSwitchOut`** — fire for departing Pokémon's effective ability before any state mutation
2. **Apply `SwitchOutResult`** — apply `hpDelta` (Regenerator), `clearStatus` (Natural Cure), collect events
3. **Switch-out cleanup** — clear volatiles per `SWITCH_CLEAR_NAMES`/`SWITCH_CLEAR_PREFIXES`, reset `statBoosts` to zeros, delete `lastMoveId`. Toxic counter persists (no longer in clear list).
4. **Update slot** — set `slot.activePokemonIndex` to incoming Pokémon's index
5. **`applyEntryHazards`** — fire before ability hooks
6. **`onSwitchIn`** — fire for incoming Pokémon's effective ability, apply `statBoostDeltas` and `traceAbilityId`
7. **Emit `pokemon-switched`** — `{ slotId, outInstanceId, inInstanceId, reason }`

---

## Switch-out ability hooks

### Regenerator
```
hpDelta = Math.floor(pokemon.maxHp / 3)
hpDelta = Math.min(hpDelta, pokemon.maxHp - pokemon.currentHp)
emit: { type: 'heal', data: { slotId, amount: hpDelta, reason: 'regenerator' } }
```

### Natural Cure
```
if (pokemon.status) → clearStatus = true
emit: { type: 'status-cured', data: { slotId, status: pokemon.status, reason: 'natural-cure' } }
```

### Slow Start / Truant
Remove the ability-applied volatile (`'slow-start'` / `'truant'`) from `volatileStatus` before the general cleanup pass. These are not in `SWITCH_CLEAR_NAMES` (they're ability-specific), so the `onSwitchOut` hook handles them explicitly.

---

## Switch-in ability hooks

### Download
Compare the active foe's effective Def stat vs effective SpD stat (with current boosts applied):
- Foe effective Def < foe effective SpD → `statBoostDeltas: { atk: +1 }`
- Foe effective SpD ≤ foe effective Def → `statBoostDeltas: { spa: +1 }` (tie goes to SpA, Gen 5+ ruling)

In 1v1, "active foe" is the single opponent slot.

### Trace
1. Get the active foe's `effectiveAbilityId`
2. Set `traceAbilityId` to that ability ID (applied to `tracedAbilityId` on the PartyMember by `performSwitch`)
3. Re-invoke `onSwitchIn` for the traced ability (one level only — if the traced ability is also Trace, skip to avoid infinite loops)
4. Emit via `volatile-applied` with `data: { type: 'trace', slotId, tracedAbilityId }`

### Screen Cleaner
Remove Reflect, Light Screen, and Aurora Veil from both sides' `sideConditions`. For each screen removed, emit `{ type: 'screen-broken', data: { side, screen } }` — the same event type already used by Brick Break and Defog.

---

## Forced-switch path fix

### `BattleEngine.processForceSwitch` (new public method)
```typescript
public processForceSwitch(
  state: BattleState,
  slotId: string,
  targetInstanceId: string,
  reason: 'forced' | 'phased'
): TurnResult
```

Calls `performSwitch(state, slotId, targetInstanceId, reason)` and returns `{ newState, events }`.

### `BattleRoom.submitAction` change

Replace the ~30-line inline forced-switch block with:
```typescript
const reason = this.awaitingForcedSwitches.get(slotId)!;
const result = this.engine.processForceSwitch(this.battle, slotId, action.targetInstanceId, reason);
this.battle = result.newState;
this.awaitingForcedSwitches.delete(slotId);
this.broadcastEvents(result.events);
```

### Phasing moves (FR-13)

Whirlwind, Roar, Dragon Tail, Circle Throw already push into `awaitingForcedSwitches` via the `forceSwitch` factory. Once `BattleRoom.submitAction` delegates to `processForceSwitch`, phasing moves get correct cleanup and hazard application automatically. The `forceSwitch` factory sets reason `'phased'` when populating the map.

---

## Event type migration (FR-14)

**Engine:** The single `performSwitch` call site emits `pokemon-switched` instead of `volatile-applied`. All voluntary, forced, and phased switches produce this event.

**Client:** `eventToText` (or equivalent) gains a `pokemon-switched` handler:
> "[PlayerName]'s [OutPokémon] was withdrawn! [PlayerName] sent out [InPokémon]!"

The old `volatile-applied` branch checking `data.note === 'switch'` is removed.

**Tests:** Existing assertions on `volatile-applied` switch events are updated to `pokemon-switched`.

---

## Testing

New tests (engine-level, alongside existing `BattleEngine.test.ts` or in a dedicated `switching.test.ts`):

| Scenario | Assertion |
|---|---|
| Voluntary switch with confusion | Incoming Pokémon has no confusion volatile |
| Voluntary switch with +3 Atk | Incoming Pokémon has `statBoosts.atk === 0` |
| Tox counter on switch-out | Counter volatile persists; status field remains `'tox'` |
| Regenerator switch-out | Departing Pokémon healed 1/3 max HP; `heal` event emitted |
| Natural Cure switch-out | Departing Pokémon status cleared; `status-cured` event emitted |
| Forced switch (post-faint) | Incoming Pokémon takes Stealth Rock damage |
| Forced switch (post-faint) | Intimidate fires for incoming Pokémon with Intimidate |
| Phased switch (Roar) | Randomly-selected replacement takes hazard damage |
| Download vs Def < SpD foe | +1 Atk applied |
| Download vs SpD ≤ Def foe | +1 SpA applied |
| Trace copies Intimidate | `tracedAbilityId` set; foe gets −1 Atk |
| Screen Cleaner | Reflect/Light Screen/Aurora Veil removed from both sides |
| Switch event type | All switches emit `pokemon-switched`; no `volatile-applied note:'switch'` |

---

## Open questions resolved

1. **Toxic counter on switch-out:** Gen 5+ — counter does NOT reset. Implemented by removing `'toxic'` from `SWITCH_CLEAR_NAMES`.
2. **Trace recursion:** Trace copies the foe's ability and re-invokes `onSwitchIn` one level only. If the traced ability is also Trace, the second invocation is skipped.
3. **Download tie:** Tie (Def === SpD) awards +1 SpA, matching Gen 5+ competitive ruling.
