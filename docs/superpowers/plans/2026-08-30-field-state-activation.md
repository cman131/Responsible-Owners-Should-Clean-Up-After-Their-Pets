# Field State Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire field state (weather residual/expiry, terrain combat effects, Trick Room, Gravity) so that moves that set these fields produce actual in-battle consequences.

**Architecture:** All field-state logic centralised in BattleEngine.ts (endOfTurn, buildActionOrder, executeMove), backed by a new `fieldState.ts` helper module that exports `isGrounded()` and lookup maps. `applyStatus` gains an optional `field` param for terrain immunity checks.

**Tech Stack:** TypeScript, Vitest (test runner via `pnpm --filter @poke-fighter/server test`), pnpm workspace monorepo.

---

## File Map

| File | Role |
|------|------|
| `packages/shared/src/types/events.ts` | Add 8 new event type strings; remove 3 old ones |
| `packages/server/src/engine/fieldState.ts` | **New** — `isGrounded()`, `WEATHER_ACCURACY`, `SOLAR_MOVES`, `WEATHER_BALL_TYPE`, `GRAVITY_BLOCKED_MOVES`, `GRASSY_TERRAIN_HALVED` |
| `packages/server/src/engine/__tests__/fieldState.test.ts` | **New** — unit tests for `isGrounded` |
| `packages/server/src/engine/effectFactories.ts` | Update `setWeather`, `setTerrain`, `trickRoom`, `gravity` to emit new event types |
| `packages/server/src/engine/__tests__/effectFactories.test.ts` | Update 4 event-name assertions |
| `packages/server/src/engine/effects.ts` | `applyStatus` gets optional `field?: FieldState` param + terrain immunity; `evaluateSecondaryEffect` gets optional `field?` param |
| `packages/server/src/engine/__tests__/effects.test.ts` | Add terrain immunity tests |
| `packages/server/src/engine/EffectEngine.ts` | Thread `state.field` into `applyStatus` call for Yawn |
| `packages/server/src/engine/BattleEngine.ts` | All combat hook changes (15 mechanical additions across 3 methods) |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | New tests for all BattleEngine behaviours |

---

## Task 1: Shared event types

**Files:**
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Update `TurnResolveEvent.type` union**

In `packages/shared/src/types/events.ts`, replace this section of the `TurnResolveEvent` interface:

```typescript
// OLD — replace these three:
| 'weather-change'
| 'terrain-change'
| 'field-effect-set'
```

with:

```typescript
// NEW — eight specific types:
| 'weather-started'
| 'weather-ended'
| 'terrain-started'
| 'terrain-ended'
| 'trickroom-started'
| 'trickroom-ended'
| 'gravity-started'
| 'gravity-ended'
```

The full updated union in `TurnResolveEvent`:
```typescript
export interface TurnResolveEvent {
  type:
    | 'move-used'
    | 'move-blocked'
    | 'move-failed'
    | 'damage-dealt'
    | 'heal'
    | 'status-applied'
    | 'status-cured'
    | 'stat-change'
    | 'weather-started'
    | 'weather-ended'
    | 'terrain-started'
    | 'terrain-ended'
    | 'side-condition-set'
    | 'trickroom-started'
    | 'trickroom-ended'
    | 'gravity-started'
    | 'gravity-ended'
    | 'volatile-applied'
    | 'volatile-cured'
    | 'terastallize'
    | 'faint'
    | 'miss'
    | 'crit'
    | 'endure-survived';
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Verify TypeScript compiles (finds no new errors beyond the three test assertions we'll fix next)**

```bash
pnpm --filter @poke-fighter/server exec tsc --noEmit
```

TypeScript itself won't error on the old string literals in `data` payloads — the test assertions are the only places that will fail.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat(events): replace weather-change/terrain-change/field-effect-set with specific started/ended event types"
```

---

## Task 2: `fieldState.ts` — `isGrounded` and lookup maps

**Files:**
- Create: `packages/server/src/engine/fieldState.ts`
- Create: `packages/server/src/engine/__tests__/fieldState.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/engine/__tests__/fieldState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isGrounded, WEATHER_ACCURACY, SOLAR_MOVES, WEATHER_BALL_TYPE, GRAVITY_BLOCKED_MOVES, GRASSY_TERRAIN_HALVED } from '../fieldState.js';
import { makePokemon } from './fixtures.js';

describe('isGrounded', () => {
  it('returns true for a Normal-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Normal'], false)).toBe(true);
  });

  it('returns false for a Flying-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Flying'], false)).toBe(false);
  });

  it('returns false for a Water/Flying-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Water', 'Flying'], false)).toBe(false);
  });

  it('returns false for a Pokémon with Levitate ability', () => {
    const mon = makePokemon({ ability: 'levitate' });
    expect(isGrounded(mon, ['Ghost'], false)).toBe(false);
  });

  it('returns false for a Pokémon with Magnet Rise volatile', () => {
    const mon = makePokemon();
    mon.volatileStatus.push({ name: 'magnet-rise' });
    expect(isGrounded(mon, ['Normal'], false)).toBe(false);
  });

  it('returns true for a Flying-type when gravity is active', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Flying'], true)).toBe(true);
  });

  it('returns true for a Levitate Pokémon when gravity is active', () => {
    const mon = makePokemon({ ability: 'levitate' });
    expect(isGrounded(mon, ['Normal'], true)).toBe(true);
  });

  it('returns true for a Magnet Rise Pokémon when gravity is active', () => {
    const mon = makePokemon();
    mon.volatileStatus.push({ name: 'magnet-rise' });
    expect(isGrounded(mon, ['Normal'], true)).toBe(true);
  });
});

describe('lookup maps', () => {
  it('WEATHER_ACCURACY: thunder always hits in rain', () => {
    expect(WEATHER_ACCURACY['thunder']?.['rain']).toBe(true);
  });

  it('WEATHER_ACCURACY: thunder is 50% in sun', () => {
    expect(WEATHER_ACCURACY['thunder']?.['sun']).toBe(50);
  });

  it('WEATHER_ACCURACY: blizzard always hits in snow', () => {
    expect(WEATHER_ACCURACY['blizzard']?.['snow']).toBe(true);
  });

  it('WEATHER_ACCURACY: hurricane always hits in rain', () => {
    expect(WEATHER_ACCURACY['hurricane']?.['rain']).toBe(true);
  });

  it('SOLAR_MOVES contains solarbeam and solarblade', () => {
    expect(SOLAR_MOVES.has('solarbeam')).toBe(true);
    expect(SOLAR_MOVES.has('solarblade')).toBe(true);
  });

  it('WEATHER_BALL_TYPE maps weather to type', () => {
    expect(WEATHER_BALL_TYPE['sun']).toBe('Fire');
    expect(WEATHER_BALL_TYPE['rain']).toBe('Water');
    expect(WEATHER_BALL_TYPE['sand']).toBe('Rock');
    expect(WEATHER_BALL_TYPE['snow']).toBe('Ice');
  });

  it('GRAVITY_BLOCKED_MOVES contains fly and bounce', () => {
    expect(GRAVITY_BLOCKED_MOVES.has('fly')).toBe(true);
    expect(GRAVITY_BLOCKED_MOVES.has('bounce')).toBe(true);
    expect(GRAVITY_BLOCKED_MOVES.has('highjumpkick')).toBe(true);
  });

  it('GRASSY_TERRAIN_HALVED contains earthquake', () => {
    expect(GRASSY_TERRAIN_HALVED.has('earthquake')).toBe(true);
    expect(GRASSY_TERRAIN_HALVED.has('magnitude')).toBe(true);
    expect(GRASSY_TERRAIN_HALVED.has('bulldoze')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — `Cannot find module '../fieldState.js'`

- [ ] **Step 3: Create `fieldState.ts`**

Create `packages/server/src/engine/fieldState.ts`:

```typescript
import type { PartyMember, PokemonType, WeatherType } from '@poke-fighter/shared';

export function isGrounded(
  pokemon: PartyMember,
  effectiveTypes: PokemonType[],
  gravityActive: boolean,
): boolean {
  if (gravityActive) return true;
  if (effectiveTypes.includes('Flying')) return false;
  if (pokemon.ability === 'levitate') return false;
  if (pokemon.volatileStatus.some(v => v.name === 'magnet-rise')) return false;
  return true;
}

export const WEATHER_ACCURACY: Partial<Record<string, Partial<Record<WeatherType, number | true>>>> = {
  thunder:   { rain: true, sun: 50 },
  blizzard:  { snow: true },
  hurricane: { rain: true, sun: 50 },
};

export const SOLAR_MOVES = new Set(['solarbeam', 'solarblade']);

export const WEATHER_BALL_TYPE: Partial<Record<WeatherType, PokemonType>> = {
  sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice',
};

export const GRAVITY_BLOCKED_MOVES = new Set([
  'fly', 'bounce', 'skydrop', 'skyattack', 'jumpkick', 'highjumpkick',
]);

export const GRASSY_TERRAIN_HALVED = new Set(['earthquake', 'magnitude', 'bulldoze']);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/fieldState.ts packages/server/src/engine/__tests__/fieldState.test.ts
git commit -m "feat(engine): add fieldState.ts with isGrounded and lookup maps"
```

---

## Task 3: Update effectFactories — setWeather and setTerrain event names

**Files:**
- Modify: `packages/server/src/engine/__tests__/effectFactories.test.ts`
- Modify: `packages/server/src/engine/effectFactories.ts`

- [ ] **Step 1: Update test assertions (these will fail against the current implementation)**

In `packages/server/src/engine/__tests__/effectFactories.test.ts`, find and update:

```typescript
// FIND (line ~207):
expect(events[0]!.type).toBe('weather-change');
// REPLACE WITH:
expect(events[0]!.type).toBe('weather-started');

// FIND (line ~208):
expect(events[0]!.data['weather']).toBe('rain');
// ADD below it (turnsRemaining check):
expect(events[0]!.data['turnsRemaining']).toBe(5);

// FIND (line ~219):
expect(events[0]!.type).toBe('terrain-change');
// REPLACE WITH:
expect(events[0]!.type).toBe('terrain-started');
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — `expected 'weather-change' to be 'weather-started'` and `expected 'terrain-change' to be 'terrain-started'`.

- [ ] **Step 3: Update `setWeather` and `setTerrain` in `effectFactories.ts`**

In `packages/server/src/engine/effectFactories.ts`:

```typescript
export function setWeather(type: WeatherType, turns: number): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.weather = { type, turnsRemaining: turns, fromAbility: false };
    return { events: [{ type: 'weather-started', data: { weather: type, turnsRemaining: turns } }] };
  };
}

export function setTerrain(type: TerrainType): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.terrain = { type, turnsRemaining: 5 };
    return { events: [{ type: 'terrain-started', data: { terrain: type } }] };
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/__tests__/effectFactories.test.ts
git commit -m "feat(engine): setWeather emits weather-started, setTerrain emits terrain-started"
```

---

## Task 4: Update effectFactories — trickRoom and gravity event names

**Files:**
- Modify: `packages/server/src/engine/__tests__/effectFactories.test.ts`
- Modify: `packages/server/src/engine/effectFactories.ts`

- [ ] **Step 1: Update trickRoom test — add started/ended event checks and remove field-effect-set assertion**

In `packages/server/src/engine/__tests__/effectFactories.test.ts`, replace the entire `describe('trickRoom', ...)` block:

```typescript
describe('trickRoom', () => {
  it('activates trick room for 5 turns and emits trickroom-started', () => {
    const state = make1v1State();
    const ctx = makeCtx({ battle: state });
    const { events } = trickRoom()(ctx);
    expect(state.field.trickroom).toBe(5);
    expect(events[0]!.type).toBe('trickroom-started');
  });

  it('deactivates trick room when already active and emits trickroom-ended', () => {
    const state = make1v1State();
    state.field.trickroom = 3;
    const ctx = makeCtx({ battle: state });
    const { events } = trickRoom()(ctx);
    expect(state.field.trickroom).toBe(0);
    expect(events[0]!.type).toBe('trickroom-ended');
  });
});
```

Also replace `describe('gravity', ...)`:

```typescript
describe('gravity', () => {
  it('activates gravity for 5 turns and emits gravity-started', () => {
    const state = make1v1State();
    const ctx = makeCtx({ battle: state });
    const { events } = gravity()(ctx);
    expect(state.field.gravity).toBe(5);
    expect(events[0]!.type).toBe('gravity-started');
  });

  it('deactivates gravity when already active and emits gravity-ended', () => {
    const state = make1v1State();
    state.field.gravity = 2;
    const ctx = makeCtx({ battle: state });
    const { events } = gravity()(ctx);
    expect(state.field.gravity).toBe(0);
    expect(events[0]!.type).toBe('gravity-ended');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — `expected 'field-effect-set' to be 'trickroom-started'` (and gravity variant).

- [ ] **Step 3: Update `trickRoom` and `gravity` in `effectFactories.ts`**

```typescript
export function trickRoom(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.battle.field.trickroom > 0) {
      ctx.battle.field.trickroom = 0;
      return { events: [{ type: 'trickroom-ended', data: {} }] };
    }
    ctx.battle.field.trickroom = 5;
    return { events: [{ type: 'trickroom-started', data: {} }] };
  };
}

export function gravity(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.battle.field.gravity > 0) {
      ctx.battle.field.gravity = 0;
      return { events: [{ type: 'gravity-ended', data: {} }] };
    }
    ctx.battle.field.gravity = 5;
    return { events: [{ type: 'gravity-started', data: {} }] };
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/__tests__/effectFactories.test.ts
git commit -m "feat(engine): trickRoom/gravity factories emit started/ended event types"
```

---

## Task 5: `applyStatus` terrain immunity + thread field through all call sites

**Files:**
- Modify: `packages/server/src/engine/effects.ts`
- Modify: `packages/server/src/engine/__tests__/effects.test.ts`
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Write failing tests for terrain status immunity**

In `packages/server/src/engine/__tests__/effects.test.ts`, add at the end of the `describe('applyStatus', ...)` block:

```typescript
  it('returns null when Misty Terrain is active and target is grounded (any status)', () => {
    const mon = makePokemon({ ability: '' });
    const field = { terrain: { type: 'misty' as const, turnsRemaining: 5 }, trickroom: 0, gravity: 0, sideConditions: [null, null] as any };
    const event = applyStatus(mon, 'slot-a1', 'par', ['Normal'], undefined, field);
    expect(event).toBeNull();
    expect(mon.status).toBeUndefined();
  });

  it('returns null when Electric Terrain is active and grounded target would fall asleep', () => {
    const mon = makePokemon({ ability: '' });
    const field = { terrain: { type: 'electric' as const, turnsRemaining: 5 }, trickroom: 0, gravity: 0, sideConditions: [null, null] as any };
    const event = applyStatus(mon, 'slot-a1', 'slp', ['Normal'], undefined, field);
    expect(event).toBeNull();
    expect(mon.status).toBeUndefined();
  });

  it('allows burn under Electric Terrain (only sleep is blocked)', () => {
    const mon = makePokemon({ ability: '' });
    const field = { terrain: { type: 'electric' as const, turnsRemaining: 5 }, trickroom: 0, gravity: 0, sideConditions: [null, null] as any };
    const event = applyStatus(mon, 'slot-a1', 'brn', ['Normal'], undefined, field);
    expect(event).not.toBeNull();
    expect(mon.status).toBe('brn');
  });

  it('allows sleep on a Flying-type under Misty Terrain (not grounded)', () => {
    const mon = makePokemon({ ability: '' });
    const field = { terrain: { type: 'misty' as const, turnsRemaining: 5 }, trickroom: 0, gravity: 0, sideConditions: [null, null] as any };
    const event = applyStatus(mon, 'slot-a1', 'slp', ['Flying'], undefined, field);
    expect(event).not.toBeNull();
    expect(mon.status).toBe('slp');
  });

  it('blocks status on Flying-type when gravity is active under Misty Terrain', () => {
    const mon = makePokemon({ ability: '' });
    const field = { terrain: { type: 'misty' as const, turnsRemaining: 5 }, trickroom: 0, gravity: 5, sideConditions: [null, null] as any };
    const event = applyStatus(mon, 'slot-a1', 'brn', ['Flying'], undefined, field);
    expect(event).toBeNull();
  });
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — type error or test failure (`applyStatus` does not accept 6 arguments yet).

- [ ] **Step 3: Update `applyStatus` signature and add terrain checks**

In `packages/server/src/engine/effects.ts`, add `FieldState` to the import and update `applyStatus`:

```typescript
import type {
  PartyMember, StatBoosts, StatusCondition, PokemonType, TurnResolveEvent, Move, BattleState, Secondary, FieldState,
} from '@poke-fighter/shared';
import { canApplyStatus } from './status.js';
import { isGrounded } from './fieldState.js';

export function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
  options?: { bypassSub?: boolean },
  field?: FieldState,
): TurnResolveEvent | null {
  if (!options?.bypassSub && member.volatileStatus.some(v => v.name === 'substitute')) return null;
  if (!canApplyStatus({ status, types, currentStatus: member.status, ability: member.ability })) {
    return null;
  }
  // Terrain immunity checks (only when field state is provided)
  if (field) {
    const gravityActive = field.gravity > 0;
    if (field.terrain?.type === 'misty' && isGrounded(member, types, gravityActive)) return null;
    if (status === 'slp' && field.terrain?.type === 'electric' && isGrounded(member, types, gravityActive)) return null;
  }
  member.status = status;
  if (status === 'slp') {
    const counter = Math.floor(Math.random() * 3) + 1;
    member.volatileStatus.push({ name: 'sleep', counter });
  }
  return { type: 'status-applied', data: { slotId, status } };
}
```

Also update `evaluateSecondaryEffect` to accept and pass field:

```typescript
export function evaluateSecondaryEffect(
  move: Move,
  target: PartyMember,
  targetSlotId: string,
  targetTypes: PokemonType[],
  field?: FieldState,
): TurnResolveEvent | null {
  if (!move.effect || move.effectChance === undefined) return null;
  if (Math.random() * 100 >= move.effectChance) return null;
  if (STATUS_CONDITIONS.has(move.effect)) {
    return applyStatus(target, targetSlotId, move.effect as StatusCondition, targetTypes, undefined, field);
  }
  return null;
}
```

Also update the `applySecondaries` `'status'` case to thread `ctx.battle.field`:

```typescript
case 'status': {
  if (ctx.rng() * 100 >= sec.chance) break;
  const member = sec.target === 'user' ? ctx.user : ctx.target;
  const slotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
  const types = sec.target === 'user' ? ([] as PokemonType[]) : ctx.targetTypes;
  const evt = applyStatus(member, slotId, sec.status as StatusCondition, types, undefined, ctx.battle.field);
  if (evt) events.push(evt);
  break;
}
```

- [ ] **Step 4: Thread field in `applyStatusTarget` factory (`effectFactories.ts`)**

```typescript
export function applyStatusTarget(status: StatusCondition): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    const bypassSub = ctx.move.soundMove === true;
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyStatus(ctx.targets[i]!, ctx.targetSlotIds[i]!, status, ctx.targetTypes[i]!, { bypassSub }, ctx.battle.field);
      if (event) events.push(event);
    }
    return { events };
  };
}
```

- [ ] **Step 5: Thread field in `EffectEngine.runEndOfTurn` Yawn → sleep call**

In `packages/server/src/engine/EffectEngine.ts`, change `_state` to `state` in the `runEndOfTurn` signature, then pass `state.field` to the Yawn sleep application:

```typescript
runEndOfTurn(
  pokemon: PartyMember,
  slotId: string,
  state: BattleState,   // was _state
  allSlots: SlotContext[],
): EndOfTurnResult {
```

Then find the Yawn block and update:

```typescript
    const yawnEntry = pokemon.volatileStatus.find(v => v.name === 'yawn');
    if (yawnEntry) {
      yawnEntry.counter = (yawnEntry.counter ?? 1) - 1;
      if ((yawnEntry.counter ?? 0) <= 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'yawn');
        const evt = applyStatus(pokemon, slotId, 'slp', [], undefined, state.field);
        if (evt) events.push(evt);
      }
    }
```

- [ ] **Step 6: Thread field in `BattleEngine.executeMove` status call sites**

In `packages/server/src/engine/BattleEngine.ts`, update these two existing `applyStatus` calls inside `executeMove`:

**Protect-contact variant call** (inside the Protect-contact-effects block, `variantEffects.status` branch):
```typescript
const evt = applyStatus(attacker, attackerSlotId, variantEffects.status as StatusCondition, attackerTypes, undefined, s.field);
```

**Defender ability after-hit call**:
```typescript
const event = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, attackerTypes, undefined, s.field);
```

**`evaluateSecondaryEffect` call** (after the per-target hit loop):
```typescript
const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes, s.field);
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/effects.test.ts packages/server/src/engine/effectFactories.ts packages/server/src/engine/EffectEngine.ts packages/server/src/engine/BattleEngine.ts
git commit -m "feat(engine): terrain status immunity — Misty blocks all status, Electric blocks sleep for grounded Pokémon"
```

---

## Task 6: `endOfTurn` — weather residual chip damage

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/server/src/engine/__tests__/BattleEngine.test.ts`, add a new `describe` block:

```typescript
describe('endOfTurn — weather residual', () => {
  it('deals 1/16 maxHp chip to non-Rock/Ground/Steel Pokémon in sandstorm', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 3, fromAbility: false };
    // p1 is Charizard (Fire/Flying) — not immune
    // p2 is default Normal — not immune
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['source'] === 'weather');
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
    // chip = floor(100 / 16) = 6
    expect(damageEvents[0]!.data['damage']).toBe(6);
  });

  it('does not chip Rock-type Pokémon in sandstorm', () => {
    // speciesId 95 = Onix (Rock/Ground) — immune to sand chip.
    // If Onix is not in the data file, this test will fail (getSpecies returns undefined → types=['Normal']
    // → chip fires → test fails). Verify speciesId 95 is present in your Pokémon data before running.
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 3, fromAbility: false };
    state.teams[1]!.slots[0]!.party[0] = makePokemon({ speciesId: 95, speciesName: 'onix' });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2WeatherDmg = events.filter(e =>
      e.type === 'damage-dealt' &&
      e.data['source'] === 'weather' &&
      e.data['slotId'] === 'slot-b1'
    );
    expect(p2WeatherDmg).toHaveLength(0);
  });

  it('deals 1/16 maxHp chip to non-Ice Pokémon in snow', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'snow', turnsRemaining: 3, fromAbility: false };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['source'] === 'weather');
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('does not chip Ice-type Pokémon in snow', () => {
    // speciesId 144 = Articuno (Ice/Flying) — immune to snow chip.
    // Verify speciesId 144 is in your data file before running.
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'snow', turnsRemaining: 3, fromAbility: false };
    state.teams[1]!.slots[0]!.party[0] = makePokemon({ speciesId: 144, speciesName: 'articuno' });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2WeatherDmg = events.filter(e =>
      e.type === 'damage-dealt' &&
      e.data['source'] === 'weather' &&
      e.data['slotId'] === 'slot-b1'
    );
    expect(p2WeatherDmg).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — no weather residual damage events emitted.

- [ ] **Step 3: Add weather residual pass to `endOfTurn` in `BattleEngine.ts`**

In `BattleEngine.ts`, add `isGrounded` and lookup imports at the top:

```typescript
import { isGrounded } from './fieldState.js';
```

Then in `endOfTurn`, BEFORE the existing `if (s.field.weather)` block, add the residual damage pass:

```typescript
    // Weather residual damage — sand chips non-Rock/Ground/Steel; snow chips non-Ice
    const activeWeather = s.field.weather?.type;
    if (activeWeather === 'sand' || activeWeather === 'snow') {
      for (const team of s.teams) {
        for (const slot of team.slots) {
          const active = slot.party[slot.activePokemonIndex];
          if (!active || active.fainted) continue;
          const types = this.resolveEffectiveTypes(active);
          const immune =
            (activeWeather === 'sand' && types.some(t => ['Rock', 'Ground', 'Steel'].includes(t))) ||
            (activeWeather === 'snow' && types.includes('Ice'));
          if (!immune) {
            const chip = Math.floor(active.maxHp / 16);
            const actual = Math.min(chip, active.currentHp);
            active.currentHp -= actual;
            events.push({ type: 'damage-dealt', data: { source: 'weather', slotId: slot.slotId, damage: actual, remainingHp: active.currentHp } });
            if (active.currentHp <= 0) {
              active.fainted = true;
              active.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: slot.slotId, instanceId: active.instanceId } });
            }
          }
        }
      }
    }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): weather residual chip damage — sand chips non-Rock/Ground/Steel, snow chips non-Ice"
```

---

## Task 7: `endOfTurn` — Grassy Terrain EoT heal

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing test**

Add to the BattleEngine test file:

```typescript
describe('endOfTurn — Grassy Terrain', () => {
  it('heals grounded Pokémon by 1/16 maxHp each turn', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 5 };
    // Damage p1 first so there's HP to heal
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 84; // 16 missing
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const healEvents = events.filter(e => e.type === 'heal' && e.data['reason'] === 'grassy-terrain');
    expect(healEvents.length).toBeGreaterThanOrEqual(1);
    // heal = floor(100 / 16) = 6
    expect(healEvents[0]!.data['amount']).toBe(6);
  });

  it('does not heal a Flying-type (not grounded)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 5 };
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 80;
    // Give p1 Flying type by overriding speciesName to something Flying (Pidgey = 16)
    state.teams[0]!.slots[0]!.party[0]!.speciesId = 16;
    state.teams[0]!.slots[0]!.party[0]!.speciesName = 'pidgey';
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const grassyHealP1 = events.filter(e =>
      e.type === 'heal' && e.data['reason'] === 'grassy-terrain' && e.data['slotId'] === 'slot-a1'
    );
    expect(grassyHealP1).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — no grassy-terrain heal events.

- [ ] **Step 3: Add Grassy Terrain EoT heal pass to `endOfTurn`**

In `BattleEngine.ts`, after the weather residual block (and still before the `if (s.field.weather)` decrement block), add:

```typescript
    // Grassy Terrain EoT heal — 1/16 maxHp for every grounded Pokémon
    if (s.field.terrain?.type === 'grassy') {
      const gravityActive = s.field.gravity > 0;
      for (const team of s.teams) {
        for (const slot of team.slots) {
          const active = slot.party[slot.activePokemonIndex];
          if (!active || active.fainted) continue;
          const types = this.resolveEffectiveTypes(active);
          if (isGrounded(active, types, gravityActive)) {
            const heal = Math.floor(active.maxHp / 16);
            const actual = Math.min(heal, active.maxHp - active.currentHp);
            if (actual > 0) {
              active.currentHp += actual;
              events.push({ type: 'heal', data: { slotId: slot.slotId, amount: actual, remainingHp: active.currentHp, reason: 'grassy-terrain' } });
            }
          }
        }
      }
    }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): Grassy Terrain heals grounded Pokémon 1/16 maxHp each EoT"
```

---

## Task 8: `endOfTurn` — field counter decrements and expiry events

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the BattleEngine test file:

```typescript
describe('endOfTurn — field counter decrements', () => {
  it('emits weather-ended and clears field.weather when turnsRemaining reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 1, fromAbility: false };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'weather-ended' && e.data['weather'] === 'rain')).toBe(true);
    expect(newState.field.weather).toBeUndefined();
  });

  it('emits terrain-ended and clears field.terrain when turnsRemaining reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'electric', turnsRemaining: 1 };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'terrain-ended' && e.data['terrain'] === 'electric')).toBe(true);
    expect(newState.field.terrain).toBeUndefined();
  });

  it('emits trickroom-ended when trickroom counter reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.trickroom = 1;
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'trickroom-ended')).toBe(true);
    expect(newState.field.trickroom).toBe(0);
  });

  it('emits gravity-ended when gravity counter reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 1;
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'gravity-ended')).toBe(true);
    expect(newState.field.gravity).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — `weather-ended` not found (current code emits `weather-change`); terrain/trickroom/gravity events never emitted.

- [ ] **Step 3: Replace the entire field-decrement block in `endOfTurn`**

Find the existing block in `BattleEngine.ts`:

```typescript
    if (s.field.weather) {
      s.field.weather.turnsRemaining -= 1;
      if (s.field.weather.turnsRemaining <= 0) {
        events.push({ type: 'weather-change', data: { weather: null } });
        delete s.field.weather;
      }
    }
```

Replace it with:

```typescript
    // Field counter decrements + expiry events
    if (s.field.weather) {
      s.field.weather.turnsRemaining -= 1;
      if (s.field.weather.turnsRemaining <= 0) {
        events.push({ type: 'weather-ended', data: { weather: s.field.weather.type } });
        delete s.field.weather;
      }
    }
    if (s.field.terrain) {
      s.field.terrain.turnsRemaining -= 1;
      if (s.field.terrain.turnsRemaining <= 0) {
        events.push({ type: 'terrain-ended', data: { terrain: s.field.terrain.type } });
        delete s.field.terrain;
      }
    }
    if (s.field.trickroom > 0) {
      s.field.trickroom -= 1;
      if (s.field.trickroom === 0) {
        events.push({ type: 'trickroom-ended', data: {} });
      }
    }
    if (s.field.gravity > 0) {
      s.field.gravity -= 1;
      if (s.field.gravity === 0) {
        events.push({ type: 'gravity-ended', data: {} });
      }
    }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): field counter decrements — weather-ended, terrain-ended, trickroom-ended, gravity-ended events"
```

---

## Task 9: `buildActionOrder` — Trick Room speed inversion

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing test**

Add to the BattleEngine test file. Note: `make1v1State()` gives p1 spe=100 and p2 spe=80 (see fixtures.ts). In normal play p1 moves first; in Trick Room p2 should move first.

```typescript
describe('buildActionOrder — Trick Room', () => {
  it('slower Pokémon moves first when Trick Room is active', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State(); // p1 spe=100, p2 spe=80
    state.field.trickroom = 3;

    // We track who acted first by whose move-used event comes first
    // Use moves that do nothing (status moves that just log move-used)
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 }, // willowisp
      'slot-b1': { type: 'move', moveIndex: 3 }, // willowisp (same)
    });

    const moveUsedEvents = events.filter(e => e.type === 'move-used' && 'attackerSlotId' in e.data);
    // p2 (spe=80, slower) should move first under Trick Room
    expect(moveUsedEvents[0]!.data['attackerSlotId']).toBe('slot-b1');
  });

  it('faster Pokémon moves first when Trick Room is NOT active', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State(); // p1 spe=100, p2 spe=80
    state.field.trickroom = 0;

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });

    const moveUsedEvents = events.filter(e => e.type === 'move-used' && 'attackerSlotId' in e.data);
    expect(moveUsedEvents[0]!.data['attackerSlotId']).toBe('slot-a1');
  });
});
```

- [ ] **Step 2: Run tests — verify the Trick Room test fails**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — p1 still moves first under Trick Room.

- [ ] **Step 3: Update `buildActionOrder` in `BattleEngine.ts`**

Find the `.sort(...)` call in `buildActionOrder`:

```typescript
    return entries
      .sort((a, b) => b.priority - a.priority || b.spe - a.spe || Math.random() - 0.5)
      .map((e) => e.slotId);
```

Replace with:

```typescript
    const trickRoomActive = state.field.trickroom > 0;
    return entries
      .sort((a, b) =>
        b.priority - a.priority ||
        (trickRoomActive ? a.spe - b.spe : b.spe - a.spe) ||
        Math.random() - 0.5,
      )
      .map((e) => e.slotId);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): Trick Room inverts speed order — slowest Pokémon moves first"
```

---

## Task 10: `executeMove` — Gravity blocks airborne moves

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing test**

Add import for `GRAVITY_BLOCKED_MOVES` and add test:

```typescript
describe('executeMove — Gravity move blocking', () => {
  it('emits move-failed with reason gravity when an airborne move is used under Gravity', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 5;
    // Give p1 a move with id 'fly' in slot 0
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'fly', currentPp: 15, maxPp: 15 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failedEvt = events.find(e => e.type === 'move-failed' && e.data['reason'] === 'gravity');
    expect(failedEvt).toBeDefined();
    expect(failedEvt!.data['moveId']).toBe('fly');
  });

  it('allows moves not in the blocked list under Gravity', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 5;
    // flamethrower is not a gravity-blocked move
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'gravity')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — no move-failed gravity event.

- [ ] **Step 3: Add gravity block check to `executeMove`**

First, add the import at the top of `BattleEngine.ts`:

```typescript
import { isGrounded, WEATHER_ACCURACY, SOLAR_MOVES, WEATHER_BALL_TYPE, GRAVITY_BLOCKED_MOVES, GRASSY_TERRAIN_HALVED } from './fieldState.js';
```

Then in `executeMove`, AFTER the PP spend line (`moveSlot.currentPp = Math.max(0, moveSlot.currentPp - 1);`) and AFTER the `move-used` event push, but BEFORE the `if (move.category === 'status')` branch, add:

```typescript
    // Gravity blocks airborne moves
    if (s.field.gravity > 0 && GRAVITY_BLOCKED_MOVES.has(move.id)) {
      events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'gravity' } });
      return { newState: s, events };
    }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): Gravity blocks fly/bounce/sky-drop and other airborne moves"
```

---

## Task 11: `executeMove` — weather accuracy override + gravity accuracy boost

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('executeMove — weather and gravity accuracy', () => {
  it('Thunder always hits in rain (never misses in 1000 trials)', () => {
    let misses = 0;
    for (let i = 0; i < 1000; i++) {
      const engine = new BattleEngine({ rng: () => Math.random() });
      const state = make1v1State();
      state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunder', currentPp: 10, maxPp: 10 };
      const { events } = engine.resolveTurn(state, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
      if (events.some(e => e.type === 'miss' && e.data['moveId'] === 'thunder')) misses++;
    }
    expect(misses).toBe(0);
  });

  it('Gravity boosts accuracy — a 50% accurate move should land more often than expected', () => {
    // With gravity: floor(50 * 5/3) = 83%. Without: 50%.
    // Test that under gravity the move lands consistently (use rng returning 0.5 — move lands if hitChance > 50)
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 5;
    // Use a move with 50% accuracy — Thunder in sun has 50% accuracy
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunder', currentPp: 10, maxPp: 10 };
    const { events } = engine.resolveTurn(state, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    // With gravity: 83% — rng=0.5 means 50*100 < 83 → hits (no miss event)
    expect(events.some(e => e.type === 'miss' && e.data['moveId'] === 'thunder')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — thunder can miss in rain; gravity accuracy boost not applied.

- [ ] **Step 3: Update the hit-chance block in `executeMove`**

Find the accuracy check in `executeMove` (the block that calls `computeHitChance` for damage moves). It currently looks like:

```typescript
    if (!['self', 'allyTeam'].includes(move.target) && !isOhko) {
      let defenderEvasion = 0;
      if (targetSlotIds.length === 1) {
        const tSlot = this.findSlot(s, targetSlotIds[0]!);
        const tMon = tSlot && tSlot.party[tSlot.activePokemonIndex];
        defenderEvasion = tMon?.statBoosts.evasion ?? 0;
      }
      const hitChance = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, defenderEvasion);
      if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
        events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
        return { newState: s, events };
      }
    }
```

Replace with:

```typescript
    if (!['self', 'allyTeam'].includes(move.target) && !isOhko) {
      let defenderEvasion = 0;
      if (targetSlotIds.length === 1) {
        const tSlot = this.findSlot(s, targetSlotIds[0]!);
        const tMon = tSlot && tSlot.party[tSlot.activePokemonIndex];
        defenderEvasion = tMon?.statBoosts.evasion ?? 0;
      }
      let hitChance: number | 'always' = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, defenderEvasion);
      // Weather accuracy override (Thunder in rain, Blizzard in snow, Hurricane in rain)
      if (s.field.weather) {
        const weatherOverride = WEATHER_ACCURACY[move.id]?.[s.field.weather.type];
        if (weatherOverride === true) hitChance = 'always';
        else if (typeof weatherOverride === 'number') hitChance = weatherOverride;
      }
      // Gravity boosts all move accuracy by 5/3
      if (s.field.gravity > 0 && hitChance !== 'always') {
        hitChance = Math.min(100, Math.floor((hitChance as number) * 5 / 3));
      }
      if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
        events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
        return { newState: s, events };
      }
    }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): weather accuracy overrides (Thunder/Blizzard/Hurricane) and Gravity accuracy boost"
```

---

## Task 12: `executeMove` — Psychic Terrain priority block

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('executeMove — Psychic Terrain priority block', () => {
  it('blocks a priority move targeting a grounded Pokémon under Psychic Terrain', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'psychic', turnsRemaining: 5 };
    // Give p1 a priority move — quickattack has priority: 1
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'quickattack', currentPp: 30, maxPp: 30 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failedEvt = events.find(e => e.type === 'move-failed' && e.data['reason'] === 'psychic-terrain');
    expect(failedEvt).toBeDefined();
  });

  it('does not block a normal-priority move under Psychic Terrain', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'psychic', turnsRemaining: 5 };
    // flamethrower has priority 0

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'psychic-terrain')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — priority move not blocked.

- [ ] **Step 3: Add Psychic Terrain priority block inside the per-target loop**

In `executeMove`, inside the `for (const targetSlotId of targetSlotIds)` loop, BEFORE the Protect check, add:

```typescript
      // Psychic Terrain: priority moves fail against grounded targets
      if (s.field.terrain?.type === 'psychic' && move.priority > 0) {
        const tSlotForGrounding = this.findSlot(s, targetSlotId);
        const tMonForGrounding = tSlotForGrounding?.party[tSlotForGrounding.activePokemonIndex];
        if (tMonForGrounding) {
          const tTypesForGrounding = this.resolveEffectiveTypes(tMonForGrounding);
          if (isGrounded(tMonForGrounding, tTypesForGrounding, s.field.gravity > 0)) {
            events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'psychic-terrain', targetSlotId } });
            continue;
          }
        }
      }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): Psychic Terrain blocks priority moves targeting grounded Pokémon"
```

---

## Task 13: `executeMove` — Solar Beam and Weather Ball

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('executeMove — Solar Beam / Weather Ball', () => {
  it('Solar Beam deals half base power in rain (120 → 60)', () => {
    // randomDamageFactor() calls Math.random() directly, not the injected rng.
    // Pin it so both runs use the same factor and the comparison is exact.
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const mkState = () => {
      const s = make1v1State();
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
      // Pre-apply the charge volatile so Solar Beam fires this turn instead of charging
      s.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'solarbeam' });
      return s;
    };

    const clear = mkState();
    const rain = mkState();
    rain.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events: clearEvents } = engine.resolveTurn(clear, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: rainEvents } = engine.resolveTurn(rain, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });

    mockRandom.mockRestore();

    const clearDmg = clearEvents.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const rainDmg = rainEvents.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    // Solar Beam is Grass — rain gives no extra modifier. Half base power means roughly half damage.
    expect(clearDmg).toBeGreaterThan(0);
    expect(rainDmg).toBeGreaterThan(0);
    // With same random factor: clearDmg should be strictly greater than rainDmg
    expect(clearDmg).toBeGreaterThan(rainDmg);
  });

  it('Weather Ball doubles power and becomes Fire type in sun', () => {
    // In sun: Weather Ball is 80 power, Fire type. STAB does not apply (user is Normal/Flying).
    // We verify it hits and damages the target (type check via no-effect isn't easily tested without a Fire-immune target)
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'weatherball', currentPp: 10, maxPp: 10 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const dmgEvt = events.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1');
    expect(dmgEvt).toBeDefined();
    expect((dmgEvt!.data['damage'] as number)).toBeGreaterThan(0);
  });

  it('Weather Ball is Normal type in clear weather (no power boost)', () => {
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const clearState = make1v1State();
    clearState.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'weatherball', currentPp: 10, maxPp: 10 };

    const sunState = make1v1State();
    sunState.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    sunState.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'weatherball', currentPp: 10, maxPp: 10 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events: clearEvts } = engine.resolveTurn(clearState, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: sunEvts }   = engine.resolveTurn(sunState,   { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });

    mockRandom.mockRestore();

    const clearDmg = clearEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const sunDmg   = sunEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    // Sun: 80bp Fire × 1.5 sun boost = effectively 120bp. Clear: 40bp Normal. Sun >> Clear always.
    expect(sunDmg).toBeGreaterThan(clearDmg);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — Solar Beam deals full power in rain; Weather Ball has no power/type change.

- [ ] **Step 3: Add Solar Beam and Weather Ball modifications to `executeMove`**

In `executeMove`, BEFORE the `for (const targetSlotId of targetSlotIds)` loop (but after the `targetSlotIds` and `secs` resolution), add:

```typescript
    // Move type and base power overrides (computed once, apply to all targets)
    let effectiveBasePower = move.basePower;
    let effectiveMoveType = move.type;

    // Solar Beam / Solar Blade: half power in any non-sun weather
    if (SOLAR_MOVES.has(move.id) && s.field.weather && s.field.weather.type !== 'sun') {
      effectiveBasePower = Math.floor(effectiveBasePower / 2);
    }
    // Weather Ball: double power + type change in active weather
    if (move.id === 'weatherball' && s.field.weather) {
      effectiveBasePower = 80;
      effectiveMoveType = WEATHER_BALL_TYPE[s.field.weather.type] ?? move.type;
    }
```

Then inside the target loop, update the freeze-thaw check and effectiveness check to use `effectiveMoveType`:

```typescript
      // Freeze thaw (use effectiveMoveType — Weather Ball in sun is Fire)
      if (target.status === 'frz' && (effectiveMoveType === 'Fire' || ALWAYS_THAW_MOVES.has(move.id))) {
```

```typescript
      const effectiveness = this.data.getCombinedEffectiveness(effectiveMoveType, effectiveDefTypes);
```

And the Magnet Rise Ground immunity check:

```typescript
      if (effectiveMoveType === 'Ground' && target.volatileStatus.some(v => v.name === 'magnet-rise')) {
```

Inside the hit loop, replace all remaining uses of `move.type` and `move.basePower` with `effectiveMoveType` and `effectiveBasePower`:

```typescript
      const stab = attackerTypes.includes(effectiveMoveType);
```

```typescript
        if (abilityHooks.onAttackerModifier) {
          atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({
            user: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target,
          }));
        }
```

```typescript
        const { damage } = calcDamage({
          level: attacker.level,
          attackStat: atkStat,
          defenseStat: defStat,
          basePower: effectiveBasePower,
          typeEffectiveness: effectiveness,
          stab,
          isBurned: isPhysical && attacker.status === 'brn',
          randomFactor: randomDamageFactor(),
          isCritical,
          moveType: effectiveMoveType,
          ...(s.field.weather ? { weather: s.field.weather.type } : {}),
          otherModifiers,
        });
```

```typescript
        const abilityDmgMod = abilityHooks.onDamageModifier?.({ user: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target });
        if (abilityDmgMod !== undefined) finalDamage = Math.floor(finalDamage * abilityDmgMod);
        const itemDmgMod = itemHooks.onDamageModifier?.({ holder: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target, isPhysical });
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): Solar Beam half power in non-sun weather; Weather Ball type and power change"
```

---

## Task 14: `executeMove` — terrain power modifiers

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('executeMove — terrain power modifiers', () => {
  it('Electric move by grounded attacker in Electric Terrain deals 1.5× damage', () => {
    const mk = () => {
      const s = make1v1State();
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
      return s;
    };
    const plain = mk();
    const electric = mk();
    electric.field.terrain = { type: 'electric', turnsRemaining: 5 };

    const engine = new BattleEngine({ rng: () => 0.85 });
    const { events: plainEvts }    = engine.resolveTurn(plain,    { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: electricEvts } = engine.resolveTurn(electric, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });

    const plainDmg    = plainEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const electricDmg = electricEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    expect(electricDmg).toBeGreaterThan(plainDmg);
    expect(Math.abs(electricDmg / plainDmg - 1.5)).toBeLessThan(0.05);
  });

  it('Earthquake deals half power in Grassy Terrain', () => {
    const mk = () => {
      const s = make1v1State();
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
      return s;
    };
    const plain = mk();
    const grassy = mk();
    grassy.field.terrain = { type: 'grassy', turnsRemaining: 5 };

    const engine = new BattleEngine({ rng: () => 0.85 });
    const { events: plainEvts }  = engine.resolveTurn(plain,  { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: grassyEvts } = engine.resolveTurn(grassy, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });

    const plainDmg  = plainEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const grassyDmg = grassyEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    expect(grassyDmg).toBeLessThan(plainDmg);
    expect(Math.abs(plainDmg / grassyDmg - 2)).toBeLessThan(0.1);
  });

  it('Dragon move is halved against grounded defender in Misty Terrain', () => {
    const mk = () => {
      const s = make1v1State();
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
      return s;
    };
    const plain = mk();
    const misty = mk();
    misty.field.terrain = { type: 'misty', turnsRemaining: 5 };

    const engine = new BattleEngine({ rng: () => 0.85 });
    const { events: plainEvts } = engine.resolveTurn(plain, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: mistyEvts } = engine.resolveTurn(misty, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });

    const plainDmg = plainEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const mistyDmg = mistyEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    expect(mistyDmg).toBeLessThan(plainDmg);
    expect(Math.abs(plainDmg / mistyDmg - 2)).toBeLessThan(0.1);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: FAIL — no terrain damage modifiers applied.

- [ ] **Step 3: Add terrain power modifiers inside the hit loop**

In `executeMove`, inside the `for (let hit = 0; hit < hitCount; hit++)` loop, find the block that computes `otherModifiers` and initialises it:

```typescript
        const isSpread = targetSlotIds.length > 1;
        let otherModifiers = isSpread ? 0.75 : 1;
        if (itemHooks.onAttackerModifier) {
          otherModifiers *= itemHooks.onAttackerModifier({
            holder: attacker, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower, target, isPhysical,
          });
        }
```

After the item modifier, add the terrain modifiers. Note: `attackerTypes` is computed just above this in the hit loop (for STAB); `defTypes` is computed before the hit loop in the target loop scope. Add:

```typescript
        // Terrain power modifiers
        const terrain = s.field.terrain?.type;
        if (terrain) {
          const gravityActive = s.field.gravity > 0;
          const atkGrounded = isGrounded(attacker, attackerTypes, gravityActive);
          const defGrounded = isGrounded(target, defTypes, gravityActive);
          if (terrain === 'electric' && effectiveMoveType === 'Electric' && atkGrounded) otherModifiers *= 1.5;
          if (terrain === 'grassy'   && effectiveMoveType === 'Grass'    && atkGrounded) otherModifiers *= 1.5;
          if (terrain === 'grassy'   && GRASSY_TERRAIN_HALVED.has(move.id))              otherModifiers *= 0.5;
          if (terrain === 'misty'    && effectiveMoveType === 'Dragon'   && defGrounded) otherModifiers *= 0.5;
          if (terrain === 'psychic'  && effectiveMoveType === 'Psychic'  && atkGrounded) otherModifiers *= 1.5;
        }
```

Note: `defTypes` is the variable computed earlier in the target loop as `effectiveDefTypes` (or `defTypes` if that's what the current code names it). Make sure the variable name matches what's in the BattleEngine source.

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): terrain power modifiers — Electric/Grassy/Psychic boost attacker; Misty debuffs Dragon; Grassy halves Earthquake"
```

---

## Task 15: Full test suite pass + type-check

**Files:**
- No new changes — this task verifies everything compiles and all tests pass.

- [ ] **Step 1: Run the full test suite**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: All PASS.

- [ ] **Step 2: TypeScript type-check the entire server package**

```bash
pnpm --filter @poke-fighter/server exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: TypeScript type-check the shared package**

```bash
pnpm --filter @poke-fighter/shared exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: If any errors remain, fix them inline**

Common issues to look for:
- Any remaining uses of `'weather-change'`, `'terrain-change'`, or `'field-effect-set'` as string literals in `type:` fields — they no longer match the union and TypeScript will error. Replace with the new event types.
- Missing `FieldState` import in `effects.ts` if not added in Task 5.
- Missing `isGrounded` import in `effects.ts` if not added in Task 5.

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "chore: fix any remaining type errors from field state activation feature"
```

(Only commit if there were actual changes. If everything was already clean, skip this commit.)
