# Move Effect Dispatch — Design Spec

**Date:** 2026-08-28
**Status:** Approved
**Implements:** docs/upcoming-features/01-move-effect-dispatch.md

---

## Problem

`engine/moves.ts` contains a 15-case hardcoded `switch (moveId)` returning a `StatusMoveResult` struct.
`BattleEngine.executeMove` then manually interprets that struct (~60 lines). Every other status move in
`data/moves.json` silently no-ops: PP is spent, `move-used` fires, nothing else happens.

The `Move.effectId` field exists on every moves.json entry and was designed as the dispatch key, but
nothing reads it in `executeMove`.

---

## Chosen Approach

**Handler as pure composer.** A `MoveEffectRegistry` (class, injected into BattleEngine) maps effectIds
to `MoveEffectHandler` functions. Each handler receives a fully-prepared `MoveContext` (pre-resolved
targets, cloned BattleState, user, move) and composes the existing helpers from `effects.ts`
(`applyStatus`, `applyStatBoost`, `applyVolatile`). Handlers return `{ events: TurnResolveEvent[] }`;
state mutation happens in-place on the already-cloned objects in `MoveContext`, consistent with the
existing engine convention.

BattleEngine's ~60-line status-move interpretation block collapses to: resolve context → call handler
→ push events.

---

## New Files

### `engine/MoveEffectRegistry.ts`

Core interfaces and registry class.

```typescript
export interface MoveContext {
  battle: BattleState;       // already-cloned working copy
  user: PartyMember;         // mutable reference into battle
  userSlotId: string;
  userTeamIndex: number;     // 0 or 1 — needed by side-condition factories
  targets: PartyMember[];    // pre-resolved; empty for field/side moves
  targetSlotIds: string[];
  move: Move;
}

export interface MoveEffectOutput {
  events: TurnResolveEvent[];
}

export type MoveEffectHandler = (ctx: MoveContext) => MoveEffectOutput;

export class MoveEffectRegistry {
  private readonly map = new Map<string, MoveEffectHandler>();
  register(effectId: string, handler: MoveEffectHandler): void;
  get(effectId: string): MoveEffectHandler | undefined;
}
```

`targets` is empty for `allySide`, `foeSide`, and `all` move targets (Reflect, Stealth Rock, Sunny Day)
— those handlers read `ctx.battle.field` directly. `userTeamIndex` lets side-condition factories
determine ally vs foe side without searching `battle.teams`.

### `engine/effectFactories.ts`

Factory functions returning `MoveEffectHandler` closures. Each composes helpers from `effects.ts`.

| Factory | Signature | Example moves |
|---------|-----------|--------------|
| `statModSelf` | `(stat, stages)` | Swords Dance, Nasty Plot, Agility, Barrier, Amnesia |
| `statModTarget` | `(stat, stages)` | Leer, Growl, Screech, Charm, Fake Tears, Flash |
| `multiStatModSelf` | `(boosts)` | Bulk Up, Calm Mind, Dragon Dance, Quiver Dance, Shell Smash |
| `applyStatusTarget` | `(status)` | Will-O-Wisp, Thunderwave, Toxic, Spore, Glare, Hypnosis |
| `applyVolatileTarget` | `(volatile, counter?)` | Confuse Ray, Supersonic, Leech Seed, Yawn (counter=2) |
| `applyVolatileSelf` | `(volatile)` | Protect, Focus Energy, Aqua Ring (stubs; doc 04 wires logic) |
| `healPercent` | `(fraction)` | Roost, Recover, Soft-Boiled, Milk Drink |
| `setWeather` | `(type, turns)` | Sunny Day, Rain Dance, Sandstorm, Hail, Snowscape |
| `setTerrain` | `(type)` | Electric Terrain, Grassy Terrain, Misty Terrain, Psychic Terrain |
| `setSideCondition` | `(key, value, side)` | Reflect, Light Screen, Aurora Veil, Stealth Rock, Sticky Web |
| `trickRoom` | `()` | Trick Room |
| `gravity` | `()` | Gravity |
| `custom` | `(fn)` | Escape hatch — Spikes, Toxic Spikes, any unique logic |

`applyVolatileTarget` takes an optional `counter` so Yawn can be expressed as
`applyVolatileTarget('yawn', 2)` without a bespoke handler.

`resolveTypes` is a local helper that reads a pokémon's effective types (terastallized or base) from
the already-cloned BattleState — same logic BattleEngine already has inline.

### `engine/registrations.ts`

Exports `buildDefaultRegistry(): MoveEffectRegistry`. Imports factories and registers all 15 existing
moves plus ~30 obvious data-driven cases.

Key registrations:
- All 15 existing moves ported from the hardcoded switch
- Agility, Barrier, Acid Armor, Amnesia, Iron Defense → `statModSelf`
- Dragon Dance, Quiver Dance, Shell Smash, Coil → `multiStatModSelf`
- Leer, Growl, Screech, Charm, Fake Tears, Flash, Sand Attack → `statModTarget`
- Recover, Soft-Boiled, Milk Drink, Moonlight, Synthesis → `healPercent(0.5)`
- Sunny Day, Rain Dance, Sandstorm, Hail, Snowscape → `setWeather`
- Four terrains → `setTerrain`
- Reflect, Light Screen, Aurora Veil → `setSideCondition(..., 'ally')`
- Stealth Rock, Sticky Web → `setSideCondition(..., 'foe')`
- Spikes, Toxic Spikes → `custom()` (increment counter 0→1→2→3)
- Trick Room, Gravity → `trickRoom()`, `gravity()`

Moonlight and Synthesis are registered at 0.5 for now; doc 05 will replace them with
weather-aware `custom()` handlers.

---

## Modified Files

### `engine/BattleEngine.ts`

**Constructor:** Adds optional `registry` parameter defaulting to `buildDefaultRegistry()`.

```typescript
constructor({ registry }: { registry?: MoveEffectRegistry } = {}) {
  this.registry = registry ?? buildDefaultRegistry();
}
```

**`executeMove` status branch** — replaces the ~60-line struct-interpretation block:

```typescript
if (move.category === 'status') {
  const { targets, targetSlotIds } = this.resolveStatusTargets(s, attackerSlotId, action, move);
  const ctx: MoveContext = {
    battle: s, user: attacker, userSlotId: attackerSlotId,
    userTeamIndex: s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId)),
    targets, targetSlotIds, move,
  };
  const handler = this.registry.get(move.effectId ?? move.id);
  if (handler) {
    events.push(...handler(ctx).events);
  } else {
    console.warn(`[MoveEffectRegistry] No handler for effectId="${move.effectId ?? move.id}"`);
    events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'unimplemented' } });
  }
  return { newState: s, events };
}
```

**`resolveStatusTargets`** — new private method:
- `allySide | foeSide | all` → `{ targets: [], targetSlotIds: [] }` (handler reads `battle.field`)
- `self | allyTeam | allies` → `{ targets: [attacker], targetSlotIds: [attackerSlotId] }`
- `adjacentAllyOrSelf | adjacentAlly` → treated as `self` (no ally targeting in current 1v1 scope)
- everything else (`normal`, `allAdjacentFoes`, `any`, `randomNormal`, `scripted`) →
  resolves foe(s) via `action.targetSlotId` or `getSpreadTargets`

### `shared/src/types/events.ts`

Adds three new entries to the `TurnResolveEvent.type` union:

- `'move-failed'` — `data: { moveId, reason }`. `reason: 'unimplemented'` for registry misses;
  handler-specific string (e.g. `'already-confused'`, `'no-target'`) for logic failures.
- `'side-condition-set'` — `data: { side: 0 | 1, condition: string, value: number | boolean }`.
  Emitted by `setSideCondition` and the Spikes/Toxic Spikes `custom()` handlers (Reflect, Light Screen,
  Aurora Veil, Stealth Rock, Spikes, Toxic Spikes, Sticky Web).
- `'field-effect-set'` — `data: { effect: 'trickroom' | 'gravity', turnsRemaining: number }`.
  Emitted by `trickRoom()` and `gravity()`.

`weather-change` and `terrain-change` already exist in the union and are reused by `setWeather`
and `setTerrain` respectively.

### `engine/moves.ts`

Deleted. The 15 existing behaviors are ported to `registrations.ts`; `StatusMoveResult` and
`executeStatusMove` are no longer imported anywhere.

---

## Mutation Convention

Handlers mutate the objects they receive via `MoveContext` in-place. Since `BattleEngine.executeMove`
operates on a `structuredClone(state)`, this is safe. This is consistent with the existing
`applyStatus`, `applyStatBoost`, `applyVolatile` helpers in `effects.ts` — handlers compose from
those directly.

---

## Testing

### `engine/__tests__/effectFactories.test.ts` (new)

Unit tests for each factory using `makePokemon()` from existing fixtures. No BattleEngine, no
DataLoader. Call factory → build minimal MoveContext → assert events and state mutations.

### `engine/__tests__/MoveEffectRegistry.test.ts` (new)

- `buildDefaultRegistry()` contains expected effectIds
- Handler found → returns events
- Handler not found → BattleEngine emits `move-failed` with `reason: 'unimplemented'`

### `engine/__tests__/BattleEngine.test.ts` (extended)

≥20 smoke tests for previously-failing moves: Reflect, Agility, Leer, Growl, Dragon Dance, Rain Dance,
Recover, Stealth Rock, Glare, Flash, Shell Smash, Trick Room, etc. Each follows the existing pattern:
`make1v1State()` → assign move → `resolveTurn` → assert events + state.

All 15 existing status-move tests pass unchanged.

---

## Non-Goals (this doc)

- Handler implementations for doc 03 (secondary effects on damaging moves)
- Handler implementations for doc 04 (Protect, Substitute, Disable, Taunt, Encore)
- Handler implementations for doc 05 (field state: weather-aware healing, terrain effects)
- Handler implementations for doc 06 (full hazard entry damage)
- Accuracy rolls, damage formula, critical hits (doc 02)
- Force-switch mechanics (doc 07)
