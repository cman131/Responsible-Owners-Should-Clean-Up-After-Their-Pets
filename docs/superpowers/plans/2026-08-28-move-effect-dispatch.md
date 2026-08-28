# Move Effect Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 15-case hardcoded switch in `engine/moves.ts` with a `MoveEffectRegistry` that dispatches status moves via handler functions, eliminating silent no-ops for unregistered moves.

**Architecture:** A `MoveEffectRegistry` class (injected into `BattleEngine`) maps `effectId` strings to `MoveEffectHandler` functions. Each handler receives a `MoveContext` (pre-resolved targets + cloned BattleState) and composes helpers from `effects.ts`. `BattleEngine.executeMove` resolves context then calls the registry; unknown effectIds emit `move-failed` with `reason: 'unimplemented'`.

**Tech Stack:** TypeScript, Vitest, existing `effects.ts` helpers (`applyStatus`, `applyStatBoost`, `applyVolatile`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/server/src/engine/MoveEffectRegistry.ts` | `MoveContext`, `MoveEffectOutput`, `MoveEffectHandler`, `MoveEffectRegistry` class |
| Create | `packages/server/src/engine/effectFactories.ts` | Factory functions returning handlers |
| Create | `packages/server/src/engine/registrations.ts` | `buildDefaultRegistry()` — wires all moves |
| Create | `packages/server/src/engine/__tests__/effectFactories.test.ts` | Unit tests for each factory |
| Create | `packages/server/src/engine/__tests__/MoveEffectRegistry.test.ts` | Registry + registrations tests |
| Modify | `packages/shared/src/types/events.ts` | Add `'move-failed'`, `'side-condition-set'`, `'field-effect-set'` to event union |
| Modify | `packages/server/src/engine/BattleEngine.ts` | Constructor arg, status branch, `resolveStatusTargets`, `resolveEffectiveTypes` |
| Modify | `packages/server/src/engine/__tests__/BattleEngine.test.ts` | ≥20 smoke tests for previously-failing moves |
| Delete | `packages/server/src/engine/moves.ts` | Dead code after port |

All test commands run from `packages/server/`: `npm test` (full suite), or `npx vitest run src/engine/__tests__/<file>.test.ts` for a single file.

---

### Task 1: Extend shared event types

**Files:**
- Modify: `packages/shared/src/types/events.ts:81-96`

- [ ] **Step 1: Add three new event types to the union**

Open `packages/shared/src/types/events.ts`. Replace the `TurnResolveEvent` interface with:

```typescript
export interface TurnResolveEvent {
  type:
    | 'move-used'
    | 'move-blocked'
    | 'move-failed'          // registry miss (reason:'unimplemented') or handler logic failure
    | 'damage-dealt'
    | 'heal'
    | 'status-applied'
    | 'status-cured'
    | 'stat-change'
    | 'weather-change'
    | 'terrain-change'
    | 'side-condition-set'   // Reflect, Light Screen, Stealth Rock, Spikes, etc.
    | 'field-effect-set'     // Trick Room, Gravity
    | 'volatile-applied'
    | 'volatile-cured'
    | 'terastallize'
    | 'faint';
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Verify shared package typechecks**

```
cd packages/shared && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat(shared): add move-failed, side-condition-set, field-effect-set event types"
```

---

### Task 2: Create MoveEffectRegistry

**Files:**
- Create: `packages/server/src/engine/MoveEffectRegistry.ts`
- Create: `packages/server/src/engine/__tests__/MoveEffectRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/engine/__tests__/MoveEffectRegistry.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MoveEffectRegistry } from '../MoveEffectRegistry.js';
import type { MoveContext, MoveEffectHandler } from '../MoveEffectRegistry.js';

const noopHandler: MoveEffectHandler = vi.fn().mockReturnValue({ events: [] });

describe('MoveEffectRegistry', () => {
  it('register + get roundtrip returns the registered handler', () => {
    const reg = new MoveEffectRegistry();
    reg.register('swordsdance', noopHandler);
    expect(reg.get('swordsdance')).toBe(noopHandler);
  });

  it('get returns undefined for an unknown effectId', () => {
    const reg = new MoveEffectRegistry();
    expect(reg.get('unknownmove')).toBeUndefined();
  });

  it('second register call overwrites first for same effectId', () => {
    const reg = new MoveEffectRegistry();
    const handler2: MoveEffectHandler = vi.fn().mockReturnValue({ events: [] });
    reg.register('testmove', noopHandler);
    reg.register('testmove', handler2);
    expect(reg.get('testmove')).toBe(handler2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd packages/server && npx vitest run src/engine/__tests__/MoveEffectRegistry.test.ts
```

Expected: FAIL — `MoveEffectRegistry` not found.

- [ ] **Step 3: Implement MoveEffectRegistry.ts**

Create `packages/server/src/engine/MoveEffectRegistry.ts`:

```typescript
import type {
  BattleState, PartyMember, Move, PokemonType, TurnResolveEvent,
} from '@poke-fighter/shared';

export interface MoveContext {
  battle: BattleState;
  user: PartyMember;
  userSlotId: string;
  userTeamIndex: number;
  targets: PartyMember[];
  targetSlotIds: string[];
  targetTypes: PokemonType[][];  // parallel to targets; pre-resolved by BattleEngine
  move: Move;
}

export interface MoveEffectOutput {
  events: TurnResolveEvent[];
}

export type MoveEffectHandler = (ctx: MoveContext) => MoveEffectOutput;

export class MoveEffectRegistry {
  private readonly map = new Map<string, MoveEffectHandler>();

  register(effectId: string, handler: MoveEffectHandler): void {
    this.map.set(effectId, handler);
  }

  get(effectId: string): MoveEffectHandler | undefined {
    return this.map.get(effectId);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```
cd packages/server && npx vitest run src/engine/__tests__/MoveEffectRegistry.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/MoveEffectRegistry.ts packages/server/src/engine/__tests__/MoveEffectRegistry.test.ts
git commit -m "feat(server): MoveEffectRegistry class and MoveContext interface"
```

---

### Task 3: effectFactories — stat-mod group

**Files:**
- Create: `packages/server/src/engine/effectFactories.ts`
- Create: `packages/server/src/engine/__tests__/effectFactories.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/engine/__tests__/effectFactories.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { statModSelf, statModTarget, multiStatModSelf } from '../effectFactories.js';
import { makePokemon } from './fixtures.js';
import type { MoveContext } from '../MoveEffectRegistry.js';
import type { BattleState, Move } from '@poke-fighter/shared';

function makeCtx(overrides: Partial<MoveContext> = {}): MoveContext {
  return {
    battle: null as unknown as BattleState,
    user: makePokemon(),
    userSlotId: 'slot-a1',
    userTeamIndex: 0,
    targets: [makePokemon()],
    targetSlotIds: ['slot-b1'],
    targetTypes: [['Normal']],
    move: { id: 'test', effectId: 'test' } as Move,
    ...overrides,
  };
}

describe('statModSelf', () => {
  it('boosts the user stat by the given stages', () => {
    const ctx = makeCtx();
    statModSelf('atk', 2)(ctx);
    expect(ctx.user.statBoosts.atk).toBe(2);
  });

  it('returns a stat-change event for userSlotId', () => {
    const ctx = makeCtx();
    const { events } = statModSelf('spa', 2)(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('stat-change');
    expect(events[0]!.data['slotId']).toBe('slot-a1');
  });

  it('does not affect targets', () => {
    const ctx = makeCtx();
    statModSelf('atk', 2)(ctx);
    expect(ctx.targets[0]!.statBoosts.atk).toBe(0);
  });
});

describe('statModTarget', () => {
  it('drops the target stat by the given stages', () => {
    const ctx = makeCtx();
    statModTarget('def', -1)(ctx);
    expect(ctx.targets[0]!.statBoosts.def).toBe(-1);
  });

  it('returns a stat-change event for targetSlotId', () => {
    const ctx = makeCtx();
    const { events } = statModTarget('def', -1)(ctx);
    expect(events[0]!.data['slotId']).toBe('slot-b1');
  });

  it('applies to every target when multiple are present', () => {
    const t1 = makePokemon();
    const t2 = makePokemon();
    const ctx = makeCtx({
      targets: [t1, t2],
      targetSlotIds: ['slot-b1', 'slot-b2'],
      targetTypes: [['Normal'], ['Normal']],
    });
    statModTarget('atk', -1)(ctx);
    expect(t1.statBoosts.atk).toBe(-1);
    expect(t2.statBoosts.atk).toBe(-1);
  });

  it('does not affect user', () => {
    const ctx = makeCtx();
    statModTarget('def', -1)(ctx);
    expect(ctx.user.statBoosts.def).toBe(0);
  });
});

describe('multiStatModSelf', () => {
  it('applies all boosts to the user in one call', () => {
    const ctx = makeCtx();
    multiStatModSelf({ atk: 1, spe: 1 })(ctx);
    expect(ctx.user.statBoosts.atk).toBe(1);
    expect(ctx.user.statBoosts.spe).toBe(1);
  });

  it('returns exactly one stat-change event', () => {
    const ctx = makeCtx();
    const { events } = multiStatModSelf({ spa: 1, spd: 1 })(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('stat-change');
  });

  it('handles negative stages (Shell Smash Def drop)', () => {
    const ctx = makeCtx();
    multiStatModSelf({ def: -1, atk: 2 })(ctx);
    expect(ctx.user.statBoosts.def).toBe(-1);
    expect(ctx.user.statBoosts.atk).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd packages/server && npx vitest run src/engine/__tests__/effectFactories.test.ts
```

Expected: FAIL — `effectFactories` not found.

- [ ] **Step 3: Implement stat-mod factories**

Create `packages/server/src/engine/effectFactories.ts`:

```typescript
import type { StatusCondition, WeatherType, TerrainType, StatBoosts, SideConditions, TurnResolveEvent } from '@poke-fighter/shared';
import { applyStatus, applyStatBoost, applyVolatile } from './effects.js';
import type { MoveEffectHandler } from './MoveEffectRegistry.js';

export function statModSelf(stat: keyof StatBoosts, stages: number): MoveEffectHandler {
  return (ctx) => ({
    events: [applyStatBoost(ctx.user, ctx.userSlotId, { [stat]: stages } as Partial<Record<keyof StatBoosts, number>>)],
  });
}

export function statModTarget(stat: keyof StatBoosts, stages: number): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      events.push(applyStatBoost(ctx.targets[i]!, ctx.targetSlotIds[i]!, { [stat]: stages } as Partial<Record<keyof StatBoosts, number>>));
    }
    return { events };
  };
}

export function multiStatModSelf(boosts: Partial<Record<keyof StatBoosts, number>>): MoveEffectHandler {
  return (ctx) => ({ events: [applyStatBoost(ctx.user, ctx.userSlotId, boosts)] });
}
```

- [ ] **Step 4: Run to verify it passes**

```
cd packages/server && npx vitest run src/engine/__tests__/effectFactories.test.ts
```

Expected: all stat-mod tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/__tests__/effectFactories.test.ts
git commit -m "feat(server): effectFactories stat-mod group (statModSelf, statModTarget, multiStatModSelf)"
```

---

### Task 4: effectFactories — status, volatile, and heal group

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/__tests__/effectFactories.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `effectFactories.test.ts` (after the existing imports, add `applyStatusTarget, applyVolatileTarget, applyVolatileSelf, healPercent` to the import):

```typescript
import {
  statModSelf, statModTarget, multiStatModSelf,
  applyStatusTarget, applyVolatileTarget, applyVolatileSelf, healPercent,
} from '../effectFactories.js';
```

Then add these describe blocks at the end of the file:

```typescript
describe('applyStatusTarget', () => {
  it('applies the status to a non-immune target', () => {
    const ctx = makeCtx({ targetTypes: [['Normal']] });
    const { events } = applyStatusTarget('brn')(ctx);
    expect(ctx.targets[0]!.status).toBe('brn');
    expect(events[0]!.type).toBe('status-applied');
  });

  it('returns no events when target is type-immune (Fire immune to burn)', () => {
    const ctx = makeCtx({ targetTypes: [['Fire']] });
    const { events } = applyStatusTarget('brn')(ctx);
    expect(events).toHaveLength(0);
    expect(ctx.targets[0]!.status).toBeUndefined();
  });

  it('returns no events when target already has a status', () => {
    const target = makePokemon({ status: 'par' });
    const ctx = makeCtx({ targets: [target], targetTypes: [['Normal']] });
    const { events } = applyStatusTarget('brn')(ctx);
    expect(events).toHaveLength(0);
  });

  it('applies to each target independently', () => {
    const t1 = makePokemon();
    const t2 = makePokemon();
    const ctx = makeCtx({
      targets: [t1, t2],
      targetSlotIds: ['slot-b1', 'slot-b2'],
      targetTypes: [['Normal'], ['Normal']],
    });
    applyStatusTarget('par')(ctx);
    expect(t1.status).toBe('par');
    expect(t2.status).toBe('par');
  });
});

describe('applyVolatileTarget', () => {
  it('applies the volatile to the target', () => {
    const ctx = makeCtx();
    const { events } = applyVolatileTarget('confusion')(ctx);
    expect(ctx.targets[0]!.volatileStatus.find(v => v.name === 'confusion')).toBeDefined();
    expect(events[0]!.type).toBe('volatile-applied');
  });

  it('uses the explicit counter when provided (yawn counter = 2)', () => {
    const ctx = makeCtx();
    applyVolatileTarget('yawn', 2)(ctx);
    expect(ctx.targets[0]!.volatileStatus.find(v => v.name === 'yawn')?.counter).toBe(2);
  });

  it('returns no events when target already has that volatile', () => {
    const target = makePokemon({ volatileStatus: [{ name: 'confusion', counter: 3 }] });
    const ctx = makeCtx({ targets: [target], targetTypes: [['Normal']] });
    const { events } = applyVolatileTarget('confusion')(ctx);
    expect(events).toHaveLength(0);
  });
});

describe('applyVolatileSelf', () => {
  it('applies the volatile to the user', () => {
    const ctx = makeCtx();
    const { events } = applyVolatileSelf('focus-energy')(ctx);
    expect(ctx.user.volatileStatus.find(v => v.name === 'focus-energy')).toBeDefined();
    expect(events[0]!.type).toBe('volatile-applied');
  });

  it('returns no events when user already has the volatile', () => {
    const user = makePokemon({ volatileStatus: [{ name: 'focus-energy', counter: 0 }] });
    const ctx = makeCtx({ user });
    const { events } = applyVolatileSelf('focus-energy')(ctx);
    expect(events).toHaveLength(0);
  });
});

describe('healPercent', () => {
  it('heals the user for the given fraction of max HP', () => {
    const user = makePokemon({ currentHp: 50, maxHp: 100 });
    const ctx = makeCtx({ user });
    const { events } = healPercent(0.5)(ctx);
    expect(user.currentHp).toBe(100);
    expect(events[0]!.type).toBe('heal');
    expect(events[0]!.data['amount']).toBe(50);
  });

  it('does not overheal beyond max HP', () => {
    const user = makePokemon({ currentHp: 90, maxHp: 100 });
    const ctx = makeCtx({ user });
    healPercent(0.5)(ctx);
    expect(user.currentHp).toBe(100);
  });

  it('returns no events when already at full HP', () => {
    const user = makePokemon({ currentHp: 100, maxHp: 100 });
    const ctx = makeCtx({ user });
    const { events } = healPercent(0.5)(ctx);
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify new tests fail**

```
cd packages/server && npx vitest run src/engine/__tests__/effectFactories.test.ts
```

Expected: existing tests pass, new ones fail.

- [ ] **Step 3: Implement the four factories**

Append to `effectFactories.ts`:

```typescript
export function applyStatusTarget(status: StatusCondition): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyStatus(ctx.targets[i]!, ctx.targetSlotIds[i]!, status, ctx.targetTypes[i]!);
      if (event) events.push(event);
    }
    return { events };
  };
}

export function applyVolatileTarget(volatile: string, counter?: number): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyVolatile(ctx.targets[i]!, ctx.targetSlotIds[i]!, ctx.userSlotId, volatile, counter);
      if (event) events.push(event);
    }
    return { events };
  };
}

export function applyVolatileSelf(volatile: string): MoveEffectHandler {
  return (ctx) => {
    const event = applyVolatile(ctx.user, ctx.userSlotId, ctx.userSlotId, volatile);
    return { events: event ? [event] : [] };
  };
}

export function healPercent(fraction: number): MoveEffectHandler {
  return (ctx) => {
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  };
}
```

- [ ] **Step 4: Run to verify all tests pass**

```
cd packages/server && npx vitest run src/engine/__tests__/effectFactories.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/__tests__/effectFactories.test.ts
git commit -m "feat(server): effectFactories status/volatile/heal group"
```

---

### Task 5: effectFactories — field effects group

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/__tests__/effectFactories.test.ts`

- [ ] **Step 1: Add failing tests**

Add `make1v1State` to the import in `effectFactories.test.ts`:

```typescript
import { makePokemon, make1v1State } from './fixtures.js';
```

Add `setWeather, setTerrain, setSideCondition, trickRoom, gravity, custom` to the factory import.

Append these describe blocks to `effectFactories.test.ts`:

```typescript
describe('setWeather', () => {
  it('sets the weather and returns a weather-change event', () => {
    const state = make1v1State();
    const ctx = makeCtx({ battle: state });
    const { events } = setWeather('rain', 5)(ctx);
    expect(state.field.weather?.type).toBe('rain');
    expect(state.field.weather?.turnsRemaining).toBe(5);
    expect(state.field.weather?.fromAbility).toBe(false);
    expect(events[0]!.type).toBe('weather-change');
    expect(events[0]!.data['weather']).toBe('rain');
  });
});

describe('setTerrain', () => {
  it('sets the terrain for 5 turns and returns a terrain-change event', () => {
    const state = make1v1State();
    const ctx = makeCtx({ battle: state });
    const { events } = setTerrain('electric')(ctx);
    expect(state.field.terrain?.type).toBe('electric');
    expect(state.field.terrain?.turnsRemaining).toBe(5);
    expect(events[0]!.type).toBe('terrain-change');
  });
});

describe('setSideCondition', () => {
  it('sets a numeric ally-side condition on the user team (Reflect, 5 turns)', () => {
    const state = make1v1State();
    const ctx = makeCtx({ battle: state, userTeamIndex: 0 });
    const { events } = setSideCondition('reflect', 5, 'ally')(ctx);
    expect(state.field.sideConditions[0]!.reflect).toBe(5);
    expect(events[0]!.type).toBe('side-condition-set');
    expect(events[0]!.data['side']).toBe(0);
    expect(events[0]!.data['condition']).toBe('reflect');
  });

  it('sets a boolean foe-side condition on the foe team (Stealth Rock)', () => {
    const state = make1v1State();
    const ctx = makeCtx({ battle: state, userTeamIndex: 0 });
    const { events } = setSideCondition('stealthRock', true, 'foe')(ctx);
    expect(state.field.sideConditions[1]!.stealthRock).toBe(true);
    expect(events[0]!.data['side']).toBe(1);
  });
});

describe('trickRoom', () => {
  it('activates trick room for 5 turns when not active', () => {
    const state = make1v1State(); // trickroom: 0
    const ctx = makeCtx({ battle: state });
    const { events } = trickRoom()(ctx);
    expect(state.field.trickroom).toBe(5);
    expect(events[0]!.type).toBe('field-effect-set');
    expect(events[0]!.data['effect']).toBe('trickroom');
    expect(events[0]!.data['turnsRemaining']).toBe(5);
  });

  it('deactivates trick room when already active', () => {
    const state = make1v1State();
    state.field.trickroom = 3;
    const ctx = makeCtx({ battle: state });
    trickRoom()(ctx);
    expect(state.field.trickroom).toBe(0);
  });
});

describe('gravity', () => {
  it('activates gravity for 5 turns', () => {
    const state = make1v1State();
    const ctx = makeCtx({ battle: state });
    gravity()(ctx);
    expect(state.field.gravity).toBe(5);
  });

  it('deactivates gravity when already active', () => {
    const state = make1v1State();
    state.field.gravity = 2;
    const ctx = makeCtx({ battle: state });
    gravity()(ctx);
    expect(state.field.gravity).toBe(0);
  });
});

describe('custom', () => {
  it('delegates to the provided handler function', () => {
    const inner = vi.fn().mockReturnValue({ events: [] });
    const ctx = makeCtx();
    custom(inner)(ctx);
    expect(inner).toHaveBeenCalledWith(ctx);
  });
});
```

- [ ] **Step 2: Run to verify new tests fail**

```
cd packages/server && npx vitest run src/engine/__tests__/effectFactories.test.ts
```

Expected: existing tests pass, new ones fail.

- [ ] **Step 3: Implement field-effect factories**

Append to `effectFactories.ts`:

```typescript
export function setWeather(type: WeatherType, turns: number): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.weather = { type, turnsRemaining: turns, fromAbility: false };
    return { events: [{ type: 'weather-change', data: { weather: type } }] };
  };
}

export function setTerrain(type: TerrainType): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.terrain = { type, turnsRemaining: 5 };
    return { events: [{ type: 'terrain-change', data: { terrain: type } }] };
  };
}

export function setSideCondition(
  key: keyof SideConditions,
  value: number | boolean,
  side: 'ally' | 'foe',
): MoveEffectHandler {
  return (ctx) => {
    const sideIdx = (side === 'ally' ? ctx.userTeamIndex : 1 - ctx.userTeamIndex) as 0 | 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx.battle.field.sideConditions[sideIdx] as any)[key] = value;
    return { events: [{ type: 'side-condition-set', data: { side: sideIdx, condition: key, value } }] };
  };
}

export function trickRoom(): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.trickroom = ctx.battle.field.trickroom > 0 ? 0 : 5;
    return { events: [{ type: 'field-effect-set', data: { effect: 'trickroom', turnsRemaining: ctx.battle.field.trickroom } }] };
  };
}

export function gravity(): MoveEffectHandler {
  return (ctx) => {
    ctx.battle.field.gravity = ctx.battle.field.gravity > 0 ? 0 : 5;
    return { events: [{ type: 'field-effect-set', data: { effect: 'gravity', turnsRemaining: ctx.battle.field.gravity } }] };
  };
}

export function custom(fn: MoveEffectHandler): MoveEffectHandler {
  return fn;
}
```

- [ ] **Step 4: Run to verify all tests pass**

```
cd packages/server && npx vitest run src/engine/__tests__/effectFactories.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/__tests__/effectFactories.test.ts
git commit -m "feat(server): effectFactories field-effects group (weather, terrain, side conditions, trick room, gravity)"
```

---

### Task 6: Create registrations.ts

**Files:**
- Create: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/MoveEffectRegistry.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `MoveEffectRegistry.test.ts` (add `buildDefaultRegistry` to imports once the file exists — add a separate import block for now and it will fail until the module exists):

```typescript
import { buildDefaultRegistry } from '../registrations.js';

describe('buildDefaultRegistry', () => {
  it('has handlers for all 15 previously-working moves', () => {
    const reg = buildDefaultRegistry();
    const moves = [
      'willowisp', 'thunderwave', 'toxic', 'spore', 'sleeppowder',
      'swordsdance', 'nastyplot', 'calmmind', 'bulkup', 'roost',
      'yawn', 'confuseray', 'supersonic', 'sweetkiss', 'leechseed',
    ];
    for (const m of moves) {
      expect(reg.get(m), `missing: ${m}`).toBeDefined();
    }
  });

  it('has handlers for new factory-wired moves', () => {
    const reg = buildDefaultRegistry();
    const newMoves = [
      'agility', 'barrier', 'acidarmor', 'amnesia', 'irondefense',
      'dragondance', 'quiverdance', 'shellsmash', 'coil',
      'leer', 'growl', 'screech', 'charm', 'faketears', 'flash', 'sandattack',
      'recover', 'softboiled', 'milkdrink', 'moonlight', 'synthesis',
      'raindance', 'sunnyday', 'sandstorm', 'hail', 'snowscape',
      'electricterrain', 'grassyterrain', 'mistyterrain', 'psychicterrain',
      'reflect', 'lightscreen', 'auroraveil',
      'stealthrock', 'spikes', 'toxicspikes', 'stickyweb',
      'trickroom', 'gravity',
    ];
    for (const m of newMoves) {
      expect(reg.get(m), `missing: ${m}`).toBeDefined();
    }
  });

  it('returns undefined for an unknown effectId', () => {
    expect(buildDefaultRegistry().get('completelyfakemove')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd packages/server && npx vitest run src/engine/__tests__/MoveEffectRegistry.test.ts
```

Expected: existing tests pass, new ones fail (module not found).

- [ ] **Step 3: Implement registrations.ts**

Create `packages/server/src/engine/registrations.ts`:

```typescript
import { MoveEffectRegistry } from './MoveEffectRegistry.js';
import {
  statModSelf, statModTarget, multiStatModSelf,
  applyStatusTarget, applyVolatileTarget, healPercent,
  setWeather, setTerrain, setSideCondition, trickRoom, gravity, custom,
} from './effectFactories.js';

export function buildDefaultRegistry(): MoveEffectRegistry {
  const r = new MoveEffectRegistry();

  // ── Status conditions ──────────────────────────────────────────────
  r.register('willowisp',   applyStatusTarget('brn'));
  r.register('thunderwave', applyStatusTarget('par'));
  r.register('glare',       applyStatusTarget('par'));
  r.register('stunspore',   applyStatusTarget('par'));
  r.register('toxic',       applyStatusTarget('tox'));
  r.register('spore',       applyStatusTarget('slp'));
  r.register('sleeppowder', applyStatusTarget('slp'));
  r.register('hypnosis',    applyStatusTarget('slp'));
  r.register('darkvoid',    applyStatusTarget('slp'));

  // ── Volatiles ──────────────────────────────────────────────────────
  r.register('confuseray',  applyVolatileTarget('confusion'));
  r.register('supersonic',  applyVolatileTarget('confusion'));
  r.register('sweetkiss',   applyVolatileTarget('confusion'));
  r.register('leechseed',   applyVolatileTarget('leech-seed'));
  r.register('yawn',        applyVolatileTarget('yawn', 2));

  // ── Self stat boosts ───────────────────────────────────────────────
  r.register('swordsdance', statModSelf('atk', 2));
  r.register('nastyplot',   statModSelf('spa', 2));
  r.register('agility',     statModSelf('spe', 2));
  r.register('barrier',     statModSelf('def', 2));
  r.register('acidarmor',   statModSelf('def', 2));
  r.register('amnesia',     statModSelf('spd', 2));
  r.register('irondefense', statModSelf('def', 2));

  // ── Multi-stat self boosts ─────────────────────────────────────────
  r.register('calmmind',    multiStatModSelf({ spa: 1, spd: 1 }));
  r.register('bulkup',      multiStatModSelf({ atk: 1, def: 1 }));
  r.register('dragondance', multiStatModSelf({ atk: 1, spe: 1 }));
  r.register('quiverdance', multiStatModSelf({ spa: 1, spd: 1, spe: 1 }));
  r.register('shellsmash',  multiStatModSelf({ def: -1, spd: -1, atk: 2, spa: 2, spe: 2 }));
  r.register('coil',        multiStatModSelf({ atk: 1, def: 1, accuracy: 1 }));

  // ── Target stat drops ──────────────────────────────────────────────
  r.register('leer',       statModTarget('def', -1));
  r.register('growl',      statModTarget('atk', -1));
  r.register('screech',    statModTarget('def', -2));
  r.register('charm',      statModTarget('atk', -2));
  r.register('faketears',  statModTarget('spd', -2));
  r.register('flash',      statModTarget('accuracy', -1));
  r.register('sandattack', statModTarget('accuracy', -1));

  // ── Heals ──────────────────────────────────────────────────────────
  r.register('roost',       healPercent(0.5));
  r.register('recover',     healPercent(0.5));
  r.register('softboiled',  healPercent(0.5));
  r.register('milkdrink',   healPercent(0.5));
  r.register('moonlight',   healPercent(0.5));
  r.register('synthesis',   healPercent(0.5));

  // ── Weather ────────────────────────────────────────────────────────
  r.register('sunnyday',   setWeather('sun',  5));
  r.register('raindance',  setWeather('rain', 5));
  r.register('sandstorm',  setWeather('sand', 5));
  r.register('hail',       setWeather('snow', 5));
  r.register('snowscape',  setWeather('snow', 5));

  // ── Terrain ────────────────────────────────────────────────────────
  r.register('electricterrain', setTerrain('electric'));
  r.register('grassyterrain',   setTerrain('grassy'));
  r.register('mistyterrain',    setTerrain('misty'));
  r.register('psychicterrain',  setTerrain('psychic'));

  // ── Side conditions ────────────────────────────────────────────────
  r.register('reflect',     setSideCondition('reflect',     5,    'ally'));
  r.register('lightscreen', setSideCondition('lightScreen', 5,    'ally'));
  r.register('auroraveil',  setSideCondition('auroraVeil',  5,    'ally'));
  r.register('stealthrock', setSideCondition('stealthRock', true, 'foe'));
  r.register('stickyweb',   setSideCondition('stickyWeb',   true, 'foe'));

  r.register('spikes', custom((ctx) => {
    const foeIdx = (1 - ctx.userTeamIndex) as 0 | 1;
    const side = ctx.battle.field.sideConditions[foeIdx]!;
    if (side.spikes >= 3) return { events: [{ type: 'move-failed', data: { moveId: 'spikes', reason: 'max-layers' } }] };
    side.spikes = (side.spikes + 1) as 0 | 1 | 2 | 3;
    return { events: [{ type: 'side-condition-set', data: { side: foeIdx, condition: 'spikes', value: side.spikes } }] };
  }));

  r.register('toxicspikes', custom((ctx) => {
    const foeIdx = (1 - ctx.userTeamIndex) as 0 | 1;
    const side = ctx.battle.field.sideConditions[foeIdx]!;
    if (side.toxicSpikes >= 2) return { events: [{ type: 'move-failed', data: { moveId: 'toxicspikes', reason: 'max-layers' } }] };
    side.toxicSpikes = (side.toxicSpikes + 1) as 0 | 1 | 2;
    return { events: [{ type: 'side-condition-set', data: { side: foeIdx, condition: 'toxicspikes', value: side.toxicSpikes } }] };
  }));

  // ── Field toggles ──────────────────────────────────────────────────
  r.register('trickroom', trickRoom());
  r.register('gravity',   gravity());

  return r;
}
```

- [ ] **Step 4: Run to verify all tests pass**

```
cd packages/server && npx vitest run src/engine/__tests__/MoveEffectRegistry.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/registrations.ts packages/server/src/engine/__tests__/MoveEffectRegistry.test.ts
git commit -m "feat(server): registrations.ts — buildDefaultRegistry wires all moves"
```

---

### Task 7: BattleEngine integration

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Update imports and add registry field**

At the top of `BattleEngine.ts`, make these changes to the import block:

Remove:
```typescript
import { executeStatusMove } from './moves.js';
```

Add:
```typescript
import { MoveEffectRegistry, MoveContext } from './MoveEffectRegistry.js';
import { buildDefaultRegistry } from './registrations.js';
```

Replace the class opening (lines 22–24) with:

```typescript
export class BattleEngine {
  private readonly data = new DataLoader();
  private readonly effectEngine = new EffectEngine();
  private readonly registry: MoveEffectRegistry;

  constructor({ registry }: { registry?: MoveEffectRegistry } = {}) {
    this.registry = registry ?? buildDefaultRegistry();
  }
```

- [ ] **Step 2: Add resolveEffectiveTypes and resolveStatusTargets private methods**

Add these two private methods anywhere before the closing `}` of the class (after `getAllSlots` is a good spot):

```typescript
  private resolveEffectiveTypes(member: PartyMember): PokemonType[] {
    if (member.hasTerastallized && member.teraType) return [member.teraType];
    const species = this.data.getSpecies(member.speciesId);
    return (species?.types ?? ['Normal']) as PokemonType[];
  }

  private resolveStatusTargets(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction,
    move: Move,
  ): { targets: PartyMember[]; targetSlotIds: string[] } {
    if (['allySide', 'foeSide', 'all'].includes(move.target)) {
      return { targets: [], targetSlotIds: [] };
    }
    if (['self', 'allyTeam', 'allies', 'adjacentAllyOrSelf', 'adjacentAlly'].includes(move.target)) {
      const slot = this.findSlot(state, attackerSlotId);
      const mon = slot?.party[slot.activePokemonIndex];
      return mon ? { targets: [mon], targetSlotIds: [attackerSlotId] } : { targets: [], targetSlotIds: [] };
    }
    const slotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(state, attackerSlotId, move.target);
    const targets: PartyMember[] = [];
    const resolvedSlotIds: string[] = [];
    for (const id of slotIds) {
      const slot = this.findSlot(state, id);
      const mon = slot?.party[slot.activePokemonIndex];
      if (mon && !mon.fainted) { targets.push(mon); resolvedSlotIds.push(id); }
    }
    return { targets, targetSlotIds: resolvedSlotIds };
  }
```

- [ ] **Step 3: Replace the status-move block in executeMove**

In `executeMove`, find the block starting at `if (move.category === 'status') {` (line 142) through `return { newState: s, events };` (line 201). Replace the entire block with:

```typescript
    if (move.category === 'status') {
      const { targets, targetSlotIds } = this.resolveStatusTargets(s, attackerSlotId, action, move);
      const targetTypes = targets.map(t => this.resolveEffectiveTypes(t));
      const userTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId));

      const ctx: MoveContext = {
        battle: s,
        user: attacker,
        userSlotId: attackerSlotId,
        userTeamIndex,
        targets,
        targetSlotIds,
        targetTypes,
        move,
      };

      const effectId = move.effectId ?? move.id;
      const handler = this.registry.get(effectId);
      if (handler) {
        events.push(...handler(ctx).events);
      } else {
        console.warn(`[MoveEffectRegistry] No handler for effectId="${effectId}" (moveId="${move.id}")`);
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'unimplemented' } });
      }
      return { newState: s, events };
    }
```

- [ ] **Step 4: Verify all existing tests still pass**

```
cd packages/server && npm test
```

Expected: all tests pass with no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts
git commit -m "feat(server): wire MoveEffectRegistry into BattleEngine, replace status-move switch"
```

---

### Task 8: Smoke tests for ≥20 previously-failing moves

**Files:**
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Add the smoke test describe block**

Add these imports to `BattleEngine.test.ts` if not already present:
```typescript
import { MoveEffectRegistry } from '../MoveEffectRegistry.js';
```

Append a new describe block at the end of the file:

```typescript
describe('Previously-unimplemented status moves', () => {
  it('Agility raises user Speed by 2 stages', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'agility', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spe).toBe(2);
  });

  it('Barrier raises user Defense by 2 stages', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'barrier', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.def).toBe(2);
  });

  it('Dragon Dance raises user Attack and Speed by 1 each', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'dragondance', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.atk).toBe(1);
    expect(p1.statBoosts.spe).toBe(1);
  });

  it('Quiver Dance raises user SpA, SpD, and Spe by 1 each', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'quiverdance', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.spa).toBe(1);
    expect(p1.statBoosts.spd).toBe(1);
    expect(p1.statBoosts.spe).toBe(1);
  });

  it('Shell Smash applies mixed stat changes', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'shellsmash', currentPp: 15, maxPp: 15 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.def).toBe(-1);
    expect(p1.statBoosts.spd).toBe(-1);
    expect(p1.statBoosts.atk).toBe(2);
    expect(p1.statBoosts.spa).toBe(2);
    expect(p1.statBoosts.spe).toBe(2);
  });

  it('Leer lowers target Defense by 1', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'leer', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.def).toBe(-1);
  });

  it('Growl lowers target Attack by 1', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(-1);
  });

  it('Screech lowers target Defense by 2', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'screech', currentPp: 40, maxPp: 40 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.def).toBe(-2);
  });

  it('Charm lowers target Attack by 2', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'charm', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(-2);
  });

  it('Flash lowers target Accuracy by 1', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'flash', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.accuracy).toBe(-1);
  });

  it('Recover heals user for 50% max HP', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 40;
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'recover', currentPp: 5, maxPp: 5 };
    const { newState, events } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBeGreaterThan(40);
    expect(events.some(e => e.type === 'heal')).toBe(true);
  });

  it('Glare applies paralysis to the target', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'glare', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('par');
  });

  it('Hypnosis puts the target to sleep', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'hypnosis', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('slp');
  });

  it('Rain Dance sets rain weather for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'raindance', currentPp: 5, maxPp: 5 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.weather?.type).toBe('rain');
    expect(newState.field.weather?.turnsRemaining).toBe(5);
  });

  it('Electric Terrain sets electric terrain for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'electricterrain', currentPp: 10, maxPp: 10 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.terrain?.type).toBe('electric');
    expect(newState.field.terrain?.turnsRemaining).toBe(5);
  });

  it('Reflect sets reflect on user team side for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'reflect', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[0]!.reflect).toBe(5);
  });

  it('Light Screen sets lightScreen on user team side for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'lightscreen', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[0]!.lightScreen).toBe(5);
  });

  it('Stealth Rock sets stealthRock on foe team side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'stealthrock', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[1]!.stealthRock).toBe(true);
  });

  it('Spikes increments spikes layer on foe side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'spikes', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[1]!.spikes).toBe(1);
  });

  it('Trick Room activates for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'trickroom', currentPp: 5, maxPp: 5 };
    const { newState, events } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.trickroom).toBe(5);
    expect(events.some(e => e.type === 'field-effect-set')).toBe(true);
  });

  it('emits move-failed with reason unimplemented for an unknown status move', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ registry: new MoveEffectRegistry() }); // empty registry
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const fail = events.find(e => e.type === 'move-failed');
    expect(fail).toBeDefined();
    expect(fail!.data['reason']).toBe('unimplemented');
  });
});
```

- [ ] **Step 2: Run to verify all tests pass**

```
cd packages/server && npm test
```

Expected: all tests pass, including the ≥20 new smoke tests.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "test(server): smoke tests for 21 previously-unimplemented status moves"
```

---

### Task 9: Delete moves.ts

**Files:**
- Delete: `packages/server/src/engine/moves.ts`

- [ ] **Step 1: Verify moves.ts is no longer imported**

```
cd packages/server && grep -r "from.*moves" src/
```

Expected: no output (BattleEngine.ts already removed the import in Task 7).

- [ ] **Step 2: Delete the file**

```bash
git rm packages/server/src/engine/moves.ts
```

- [ ] **Step 3: Run full test suite to confirm nothing broke**

```
cd packages/server && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(server): delete moves.ts — replaced by MoveEffectRegistry + registrations"
```
