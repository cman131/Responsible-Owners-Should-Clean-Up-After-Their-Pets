# Secondary Effect Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Secondary` discriminated union to the `Move` type, implement `applySecondaries` in `effects.ts`, and wire multi-hit, charge-turn, recharge, and OHKO into `BattleEngine.executeMove`.

**Architecture:** `Secondary[]` on `Move` carries data-driven secondary effects. `applySecondaries(ctx)` dispatches post-damage secondaries. `executeMove` extracts structurally-special kinds (multihit, charge, ohko) before the damage block. `EffectEngine.runPreMove` gains flinch and recharge checks. Existing `move.effect`/`move.effectChance` handling is left intact.

**Tech Stack:** TypeScript, Vitest, Zod. Monorepo — server imports shared via `@poke-fighter/shared` (compiled to `packages/shared/dist`); rebuild shared after every type change.

---

## File Map

| File | Action |
|------|--------|
| `packages/shared/src/types/secondary.ts` | Create — `Secondary` union, `StatName` |
| `packages/shared/src/types/pokemon.ts` | Modify — add `secondaries?: Secondary[]` to `Move` |
| `packages/shared/src/schemas/move.schema.ts` | Modify — `SecondarySchema` + `secondaries` field |
| `packages/shared/src/index.ts` | Modify — re-export from `secondary.ts` |
| `packages/server/src/engine/effects.ts` | Modify — add `SecondaryContext`, `applySecondaries` |
| `packages/server/src/engine/BattleEngine.ts` | Modify — multi-hit loop, charge/OHKO dispatch, `movedSlotIds`, `applySecondaries` call |
| `packages/server/src/engine/EffectEngine.ts` | Modify — flinch + recharge checks in `runPreMove` |
| `data/moves.json` | Modify — add `secondaries[]` for ~22 priority moves |
| `packages/server/src/engine/__tests__/secondaries.test.ts` | Create — unit tests for `applySecondaries` |
| `packages/server/src/engine/__tests__/EffectEngine.test.ts` | Modify — flinch + recharge `runPreMove` tests |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | Modify — multi-hit, charge, OHKO integration tests |

---

### Task 1: Secondary type, Move extension, and Zod schema

**Files:**
- Create: `packages/shared/src/types/secondary.ts`
- Modify: `packages/shared/src/types/pokemon.ts`
- Modify: `packages/shared/src/schemas/move.schema.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `secondary.ts`**

```typescript
// packages/shared/src/types/secondary.ts
import type { StatusCondition } from './battle.js';

export type StatName = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion';

export type Secondary =
  | { kind: 'status';      status: StatusCondition; chance: number; target: 'target' | 'user' }
  | { kind: 'stat';        stat: StatName; stages: number; chance: number; target: 'target' | 'user' }
  | { kind: 'flinch';      chance: number }
  | { kind: 'confusion';   chance: number; target: 'target' | 'user' }
  | { kind: 'drain';       fraction: [number, number] }
  | { kind: 'recoil';      fraction: [number, number] }
  | { kind: 'recoil-hp';   fraction: [number, number] }
  | { kind: 'multihit';    hits: number | [number, number] }
  | { kind: 'ohko' }
  | { kind: 'selfdestruct'; variant: 'normal' | 'memento' | 'healingwish' }
  | { kind: 'charge';      chargeVolatile: string }
  | { kind: 'recharge' };
```

- [ ] **Step 2: Add `secondaries` to `Move` in `pokemon.ts`**

In `packages/shared/src/types/pokemon.ts`, add after `critRatio?`:

```typescript
  critRatio?: number;
  secondaries?: Secondary[];
```

Add the import at the top of the file:

```typescript
import type { Secondary } from './secondary.js';
```

- [ ] **Step 3: Add `SecondarySchema` and `secondaries` field to `move.schema.ts`**

Replace the contents of `packages/shared/src/schemas/move.schema.ts` with:

```typescript
import { z } from 'zod';

const SecondarySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status'), status: z.string(), chance: z.number(), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('stat'), stat: z.string(), stages: z.number().int(), chance: z.number(), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('flinch'), chance: z.number() }),
  z.object({ kind: z.literal('confusion'), chance: z.number(), target: z.enum(['target', 'user']) }),
  z.object({ kind: z.literal('drain'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('recoil'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('recoil-hp'), fraction: z.tuple([z.number(), z.number()]) }),
  z.object({ kind: z.literal('multihit'), hits: z.union([z.number().int(), z.tuple([z.number().int(), z.number().int()])]) }),
  z.object({ kind: z.literal('ohko') }),
  z.object({ kind: z.literal('selfdestruct'), variant: z.enum(['normal', 'memento', 'healingwish']) }),
  z.object({ kind: z.literal('charge'), chargeVolatile: z.string() }),
  z.object({ kind: z.literal('recharge') }),
]);

export const MoveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum([
    'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
    'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
    'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy', '???',
  ]),
  category: z.enum(['physical', 'special', 'status']),
  basePower: z.number().int().min(0),
  accuracy: z.union([z.number().int().min(1).max(100), z.literal(true)]),
  pp: z.number().int().min(1).max(64),
  priority: z.number().int().min(-7).max(5),
  target: z.enum([
    'normal', 'self', 'allAdjacentFoes', 'allAdjacent',
    'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe', 'any',
    'allies', 'allyTeam', 'allySide', 'foeSide', 'all', 'randomNormal', 'scripted',
  ]),
  makesContact: z.boolean(),
  effectId: z.string().optional(),
  effect: z.string().optional(),
  effectChance: z.number().int().min(0).max(100).optional(),
  critRatio: z.number().int().min(0).optional(),
  secondaries: SecondarySchema.array().optional(),
});

export type ValidatedMove = z.infer<typeof MoveSchema>;
```

- [ ] **Step 4: Re-export from `index.ts`**

In `packages/shared/src/index.ts`, add:

```typescript
export * from './types/secondary.js';
```

- [ ] **Step 5: Build shared**

```
cd packages/shared && npm run build
```

Expected: no TypeScript errors, `dist/` updated.

- [ ] **Step 6: Run shared schema validation tests to confirm nothing broken**

```
cd packages/shared && npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```
git add packages/shared/src/types/secondary.ts packages/shared/src/types/pokemon.ts packages/shared/src/schemas/move.schema.ts packages/shared/src/index.ts packages/shared/dist/
git commit -m "feat(shared): add Secondary discriminated union and secondaries field to Move"
```

---

### Task 2: `applySecondaries` — `status` and `stat` kinds

**Files:**
- Modify: `packages/server/src/engine/effects.ts`
- Create: `packages/server/src/engine/__tests__/secondaries.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/engine/__tests__/secondaries.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { applySecondaries } from '../effects.js';
import type { SecondaryContext } from '../effects.js';
import { makePokemon } from './fixtures.js';
import type { BattleState, PokemonType } from '@poke-fighter/shared';

const emptyBattle = { field: {} } as unknown as BattleState;

function makeCtx(overrides: Partial<SecondaryContext> = {}): SecondaryContext {
  return {
    secondaries: [],
    totalDamage: 50,
    user: makePokemon({ currentHp: 80, maxHp: 100 }),
    userSlotId: 'slot-a1',
    target: makePokemon({ ability: '', currentHp: 80, maxHp: 100 }),
    targetSlotId: 'slot-b1',
    targetTypes: ['Normal'] as PokemonType[],
    battle: emptyBattle,
    rng: Math.random,
    movedSlotIds: new Set<string>(),
    ...overrides,
  };
}

describe('applySecondaries — stat kind', () => {
  it('drops target def by 1 when rng roll succeeds', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'stat', stat: 'def', stages: -1, chance: 20, target: 'target' }],
      rng: () => 0,
    });
    const events = applySecondaries(ctx);
    expect(ctx.target.statBoosts.def).toBe(-1);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('does not apply stat drop when rng roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'stat', stat: 'def', stages: -1, chance: 20, target: 'target' }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.statBoosts.def).toBe(0);
  });

  it('boosts user spa when target is user', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'stat', stat: 'spa', stages: 1, chance: 70, target: 'user' }],
      rng: () => 0,
    });
    applySecondaries(ctx);
    expect(ctx.user.statBoosts.spa).toBe(1);
  });
});

describe('applySecondaries — status kind', () => {
  it('burns target when roll succeeds', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'status', status: 'brn', chance: 10, target: 'target' }],
      rng: () => 0,
    });
    const events = applySecondaries(ctx);
    expect(ctx.target.status).toBe('brn');
    expect(events.some(e => e.type === 'status-applied')).toBe(true);
  });

  it('does not burn Fire-type target (type immunity)', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'status', status: 'brn', chance: 100, target: 'target' }],
      targetTypes: ['Fire'] as PokemonType[],
      rng: () => 0,
    });
    applySecondaries(ctx);
    expect(ctx.target.status).toBeUndefined();
  });

  it('does not apply when roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'status', status: 'brn', chance: 10, target: 'target' }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.status).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: FAIL — `applySecondaries` and `SecondaryContext` not exported from `effects.ts`.

- [ ] **Step 3: Add `SecondaryContext` interface and `applySecondaries` to `effects.ts`**

Add these imports at the top of `packages/server/src/engine/effects.ts`:

```typescript
import type { BattleState, Secondary } from '@poke-fighter/shared';
```

Add after the existing exports:

```typescript
export interface SecondaryContext {
  secondaries: Secondary[];
  totalDamage: number;
  user: PartyMember;
  userSlotId: string;
  target: PartyMember;
  targetSlotId: string;
  targetTypes: PokemonType[];
  battle: BattleState;
  rng: () => number;
  movedSlotIds: Set<string>;
}

export function applySecondaries(ctx: SecondaryContext): TurnResolveEvent[] {
  const events: TurnResolveEvent[] = [];
  for (const sec of ctx.secondaries) {
    switch (sec.kind) {
      case 'status': {
        if (ctx.rng() * 100 >= sec.chance) break;
        const member = sec.target === 'user' ? ctx.user : ctx.target;
        const slotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
        const types = sec.target === 'user' ? ([] as PokemonType[]) : ctx.targetTypes;
        const evt = applyStatus(member, slotId, sec.status as StatusCondition, types);
        if (evt) events.push(evt);
        break;
      }
      case 'stat': {
        if (ctx.rng() * 100 >= sec.chance) break;
        const member = sec.target === 'user' ? ctx.user : ctx.target;
        const slotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
        events.push(applyStatBoost(member, slotId, { [sec.stat]: sec.stages } as Partial<Record<keyof StatBoosts, number>>));
        break;
      }
    }
  }
  return events;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: all tests in the `stat kind` and `status kind` describes pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/secondaries.test.ts
git commit -m "feat(engine): applySecondaries — status and stat kinds"
```

---

### Task 3: `applySecondaries` — `flinch` and `confusion` kinds

**Files:**
- Modify: `packages/server/src/engine/effects.ts`
- Modify: `packages/server/src/engine/__tests__/secondaries.test.ts`

- [ ] **Step 1: Add failing tests to `secondaries.test.ts`**

Append to `secondaries.test.ts`:

```typescript
describe('applySecondaries — flinch kind', () => {
  it('adds flinch volatile when roll succeeds and target has not moved', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'flinch', chance: 30 }],
      rng: () => 0,
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'flinch')).toBe(true);
  });

  it('does not flinch when target has already moved this turn', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'flinch', chance: 100 }],
      rng: () => 0,
      movedSlotIds: new Set(['slot-b1']),
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });

  it('does not flinch when roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'flinch', chance: 30 }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });
});

describe('applySecondaries — confusion kind', () => {
  it('applies confusion volatile when roll succeeds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ctx = makeCtx({
      secondaries: [{ kind: 'confusion', chance: 10, target: 'target' }],
      rng: () => 0,
    });
    const events = applySecondaries(ctx);
    vi.restoreAllMocks();
    expect(ctx.target.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
  });

  it('does not apply confusion when roll fails', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'confusion', chance: 10, target: 'target' }],
      rng: () => 0.99,
    });
    applySecondaries(ctx);
    expect(ctx.target.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: flinch and confusion describes fail.

- [ ] **Step 3: Implement flinch and confusion cases in `applySecondaries`**

Inside the `switch` in `applySecondaries`, add after the `stat` case:

```typescript
      case 'flinch': {
        if (ctx.rng() * 100 >= sec.chance) break;
        if (!ctx.movedSlotIds.has(ctx.targetSlotId) && !ctx.target.fainted) {
          ctx.target.volatileStatus.push({ name: 'flinch' });
        }
        break;
      }
      case 'confusion': {
        if (ctx.rng() * 100 >= sec.chance) break;
        const member = sec.target === 'user' ? ctx.user : ctx.target;
        const mSlotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
        const evt = applyVolatile(member, mSlotId, ctx.userSlotId, 'confusion');
        if (evt) events.push(evt);
        break;
      }
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/secondaries.test.ts
git commit -m "feat(engine): applySecondaries — flinch and confusion kinds"
```

---

### Task 4: `applySecondaries` — `drain`, `recoil`, and `recoil-hp` kinds

**Files:**
- Modify: `packages/server/src/engine/effects.ts`
- Modify: `packages/server/src/engine/__tests__/secondaries.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `secondaries.test.ts`:

```typescript
describe('applySecondaries — drain kind', () => {
  it('heals user for half of totalDamage', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'drain', fraction: [1, 2] }],
      totalDamage: 80,
      user: makePokemon({ currentHp: 50, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(90);
    expect(events.some(e => e.type === 'heal')).toBe(true);
    expect(events.find(e => e.type === 'heal')!.data['amount']).toBe(40);
  });

  it('caps heal at maxHp', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'drain', fraction: [1, 2] }],
      totalDamage: 100,
      user: makePokemon({ currentHp: 95, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(100);
    expect(events.find(e => e.type === 'heal')!.data['amount']).toBe(5);
  });

  it('emits no event when user is already at full HP', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'drain', fraction: [1, 2] }],
      totalDamage: 60,
      user: makePokemon({ currentHp: 100, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(events.some(e => e.type === 'heal')).toBe(false);
    expect(ctx.user.currentHp).toBe(100);
  });
});

describe('applySecondaries — recoil kind', () => {
  it('damages user for 1/3 of totalDamage', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recoil', fraction: [1, 3] }],
      totalDamage: 90,
      user: makePokemon({ currentHp: 80, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(50);
    expect(events.some(e => e.type === 'damage-dealt')).toBe(true);
    expect(events.find(e => e.type === 'damage-dealt')!.data['damage']).toBe(30);
  });

  it('faints user if recoil exceeds remaining HP', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recoil', fraction: [1, 3] }],
      totalDamage: 90,
      user: makePokemon({ currentHp: 20, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(0);
    expect(ctx.user.fainted).toBe(true);
    expect(events.some(e => e.type === 'faint')).toBe(true);
  });
});

describe('applySecondaries — recoil-hp kind', () => {
  it('damages user for fraction of maxHp', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recoil-hp', fraction: [1, 4] }],
      totalDamage: 999,
      user: makePokemon({ currentHp: 100, maxHp: 100 }),
    });
    applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(75);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: drain, recoil, recoil-hp describes fail.

- [ ] **Step 3: Implement drain, recoil, recoil-hp cases**

Inside the `switch` in `applySecondaries`, add after `confusion`:

```typescript
      case 'drain': {
        if (ctx.totalDamage <= 0) break;
        const heal = Math.floor(ctx.totalDamage * sec.fraction[0] / sec.fraction[1]);
        const actual = Math.min(heal, ctx.user.maxHp - ctx.user.currentHp);
        if (actual <= 0) break;
        ctx.user.currentHp += actual;
        events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: actual, remainingHp: ctx.user.currentHp } });
        break;
      }
      case 'recoil': {
        const recoilAmt = Math.floor(ctx.totalDamage * sec.fraction[0] / sec.fraction[1]);
        if (recoilAmt <= 0) break;
        const taken = Math.min(recoilAmt, ctx.user.currentHp);
        ctx.user.currentHp -= taken;
        events.push({ type: 'damage-dealt', data: { source: 'recoil', slotId: ctx.userSlotId, damage: taken, remainingHp: ctx.user.currentHp } });
        if (ctx.user.currentHp <= 0) {
          ctx.user.fainted = true;
          ctx.user.currentHp = 0;
          events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
        }
        break;
      }
      case 'recoil-hp': {
        const recoilAmt = Math.floor(ctx.user.maxHp * sec.fraction[0] / sec.fraction[1]);
        if (recoilAmt <= 0) break;
        const taken = Math.min(recoilAmt, ctx.user.currentHp);
        ctx.user.currentHp -= taken;
        events.push({ type: 'damage-dealt', data: { source: 'recoil', slotId: ctx.userSlotId, damage: taken, remainingHp: ctx.user.currentHp } });
        if (ctx.user.currentHp <= 0) {
          ctx.user.fainted = true;
          ctx.user.currentHp = 0;
          events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
        }
        break;
      }
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/secondaries.test.ts
git commit -m "feat(engine): applySecondaries — drain, recoil, recoil-hp kinds"
```

---

### Task 5: `applySecondaries` — `selfdestruct` and `recharge` kinds

**Files:**
- Modify: `packages/server/src/engine/effects.ts`
- Modify: `packages/server/src/engine/__tests__/secondaries.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `secondaries.test.ts`:

```typescript
describe('applySecondaries — selfdestruct kind (normal)', () => {
  it('faints the user and emits faint event', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'selfdestruct', variant: 'normal' }],
      user: makePokemon({ currentHp: 60, maxHp: 100 }),
    });
    const events = applySecondaries(ctx);
    expect(ctx.user.currentHp).toBe(0);
    expect(ctx.user.fainted).toBe(true);
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-a1')).toBe(true);
  });
});

describe('applySecondaries — selfdestruct kind (memento)', () => {
  it('faints user and drops target atk+spa by 2', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'selfdestruct', variant: 'memento' }],
    });
    applySecondaries(ctx);
    expect(ctx.user.fainted).toBe(true);
    expect(ctx.target.statBoosts.atk).toBe(-2);
    expect(ctx.target.statBoosts.spa).toBe(-2);
  });
});

describe('applySecondaries — recharge kind', () => {
  it('adds recharge volatile to user', () => {
    const ctx = makeCtx({
      secondaries: [{ kind: 'recharge' }],
    });
    applySecondaries(ctx);
    expect(ctx.user.volatileStatus.some(v => v.name === 'recharge')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: selfdestruct and recharge describes fail.

- [ ] **Step 3: Implement selfdestruct and recharge cases**

Inside the `switch` in `applySecondaries`, add after `recoil-hp`:

```typescript
      case 'selfdestruct': {
        const taken = ctx.user.currentHp;
        ctx.user.currentHp = 0;
        ctx.user.fainted = true;
        events.push({ type: 'damage-dealt', data: { source: 'selfdestruct', slotId: ctx.userSlotId, damage: taken, remainingHp: 0 } });
        events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
        if (sec.variant === 'memento') {
          events.push(applyStatBoost(ctx.target, ctx.targetSlotId, { atk: -2, spa: -2 }));
        }
        break;
      }
      case 'recharge': {
        ctx.user.volatileStatus.push({ name: 'recharge' });
        break;
      }
```

- [ ] **Step 4: Run all secondaries tests**

```
cd packages/server && npx vitest run src/engine/__tests__/secondaries.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/secondaries.test.ts
git commit -m "feat(engine): applySecondaries — selfdestruct and recharge kinds"
```

---

### Task 6: `EffectEngine.runPreMove` — flinch and recharge blocks

**Files:**
- Modify: `packages/server/src/engine/EffectEngine.ts`
- Modify: `packages/server/src/engine/__tests__/EffectEngine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/server/src/engine/__tests__/EffectEngine.test.ts`:

```typescript
describe('EffectEngine.runPreMove — flinch', () => {
  it('blocks move and removes flinch volatile', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'flinch' }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
    expect(result.events.find(e => e.type === 'move-blocked')?.data['reason']).toBe('flinch');
  });

  it('does not block if no flinch volatile', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
  });
});

describe('EffectEngine.runPreMove — recharge', () => {
  it('blocks move and removes recharge volatile', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'recharge' }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus.some(v => v.name === 'recharge')).toBe(false);
    expect(result.events.find(e => e.type === 'move-blocked')?.data['reason']).toBe('recharge');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/EffectEngine.test.ts
```

Expected: flinch and recharge describes fail.

- [ ] **Step 3: Add flinch and recharge checks to `EffectEngine.runPreMove`**

At the very start of `runPreMove` in `packages/server/src/engine/EffectEngine.ts`, before the `if (pokemon.status === 'slp')` block, insert:

```typescript
    const flinchEntry = pokemon.volatileStatus.find(v => v.name === 'flinch');
    if (flinchEntry) {
      pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'flinch');
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'flinch' } });
      return { blocked: true, events };
    }

    const rechargeEntry = pokemon.volatileStatus.find(v => v.name === 'recharge');
    if (rechargeEntry) {
      pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'recharge');
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'recharge' } });
      return { blocked: true, events };
    }
```

- [ ] **Step 4: Run all EffectEngine tests**

```
cd packages/server && npx vitest run src/engine/__tests__/EffectEngine.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(engine): flinch and recharge checks in EffectEngine.runPreMove"
```

---

### Task 7: `moves.json` data entries

**Files:**
- Modify: `data/moves.json`

This is a manual data entry task. For each move listed, find its object in `data/moves.json` and add a `"secondaries"` field. The file has 953 entries; use your editor's find (`crunch`, `bulletseed`, etc.) to locate each one.

- [ ] **Step 1: Add secondaries to these moves**

| Move id | secondaries value |
|---------|------------------|
| `crunch` | `[{"kind":"stat","stat":"def","stages":-1,"chance":20,"target":"target"}]` |
| `irontail` | `[{"kind":"stat","stat":"def","stages":-1,"chance":30,"target":"target"}]` |
| `shadowball` | `[{"kind":"stat","stat":"spd","stages":-1,"chance":20,"target":"target"}]` |
| `energyball` | `[{"kind":"stat","stat":"spd","stages":-1,"chance":10,"target":"target"}]` |
| `moonblast` | `[{"kind":"stat","stat":"spa","stages":-1,"chance":30,"target":"target"}]` |
| `chargebeam` | `[{"kind":"stat","stat":"spa","stages":1,"chance":70,"target":"user"}]` |
| `poweruppunch` | `[{"kind":"stat","stat":"atk","stages":1,"chance":100,"target":"user"}]` |
| `fierydance` | `[{"kind":"stat","stat":"spa","stages":1,"chance":50,"target":"user"}]` |
| `closecombat` | `[{"kind":"stat","stat":"def","stages":-1,"chance":100,"target":"user"},{"kind":"stat","stat":"spd","stages":-1,"chance":100,"target":"user"}]` |
| `dracometeor` | `[{"kind":"stat","stat":"spa","stages":-2,"chance":100,"target":"user"}]` |
| `overheat` | `[{"kind":"stat","stat":"spa","stages":-2,"chance":100,"target":"user"}]` |
| `bite` | `[{"kind":"flinch","chance":30}]` |
| `ironhead` | `[{"kind":"flinch","chance":30}]` |
| `headbutt` | `[{"kind":"flinch","chance":30}]` |
| `rockslide` | `[{"kind":"flinch","chance":30}]` |
| `airslash` | `[{"kind":"flinch","chance":30}]` |
| `signalbeam` | `[{"kind":"confusion","chance":10,"target":"target"}]` |
| `psybeam` | `[{"kind":"confusion","chance":10,"target":"target"}]` |
| `hurricane` | `[{"kind":"confusion","chance":30,"target":"target"}]` |
| `gigadrain` | `[{"kind":"drain","fraction":[1,2]}]` |
| `leechlife` | `[{"kind":"drain","fraction":[1,2]}]` |
| `drainpunch` | `[{"kind":"drain","fraction":[1,2]}]` |
| `doubleedge` | `[{"kind":"recoil","fraction":[1,3]}]` |
| `bravebird` | `[{"kind":"recoil","fraction":[1,3]}]` |
| `flareblitz` | `[{"kind":"recoil","fraction":[1,3]}]` |
| `woodhammer` | `[{"kind":"recoil","fraction":[1,3]}]` |
| `volttackle` | `[{"kind":"recoil","fraction":[1,3]}]` |
| `takedown` | `[{"kind":"recoil","fraction":[1,4]}]` |
| `bulletseed` | `[{"kind":"multihit","hits":[2,5]}]` |
| `rockblast` | `[{"kind":"multihit","hits":[2,5]}]` |
| `pinmissile` | `[{"kind":"multihit","hits":[2,5]}]` |
| `furyattack` | `[{"kind":"multihit","hits":[2,5]}]` |
| `armthrust` | `[{"kind":"multihit","hits":[2,5]}]` |
| `scalshot` | `[{"kind":"multihit","hits":[2,5]}]` |
| `dualwingbeat` | `[{"kind":"multihit","hits":2}]` |
| `doublehit` | `[{"kind":"multihit","hits":2}]` |
| `sheercold` | `[{"kind":"ohko"}]` |
| `fissure` | `[{"kind":"ohko"}]` |
| `guillotine` | `[{"kind":"ohko"}]` |
| `horndrill` | `[{"kind":"ohko"}]` |
| `explosion` | `[{"kind":"selfdestruct","variant":"normal"}]` |
| `selfdestruct` | `[{"kind":"selfdestruct","variant":"normal"}]` |
| `solarbeam` | `[{"kind":"charge","chargeVolatile":"solarbeam-charge"}]` |
| `hyperbeam` | `[{"kind":"recharge"}]` |
| `gigaimpact` | `[{"kind":"recharge"}]` |
| `blastburn` | `[{"kind":"recharge"}]` |
| `hydrocannon` | `[{"kind":"recharge"}]` |
| `frenzyplant` | `[{"kind":"recharge"}]` |
| `rockwrecker` | `[{"kind":"recharge"}]` |

Example of what a completed entry looks like in `moves.json`:

```json
{
  "id": "crunch",
  "name": "Crunch",
  "type": "Dark",
  "category": "physical",
  "basePower": 80,
  "accuracy": 100,
  "pp": 15,
  "priority": 0,
  "target": "normal",
  "makesContact": true,
  "effectId": "crunch",
  "secondaries": [{"kind":"stat","stat":"def","stages":-1,"chance":20,"target":"target"}]
}
```

- [ ] **Step 2: Run schema validation to confirm all entries are valid**

```
cd packages/shared && npx vitest run src/schemas/__tests__/data-validation.test.ts
```

Expected: `all moves.json entries are valid` passes. If any entry fails, the error message names the offending move — fix the JSON and re-run.

- [ ] **Step 3: Commit**

```
git add data/moves.json
git commit -m "feat(data): add secondaries[] for 48 priority moves"
```

---

### Task 8: `BattleEngine` — `movedSlotIds` and single-hit `applySecondaries` wiring

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Add failing integration test**

Append to `packages/server/src/engine/__tests__/BattleEngine.test.ts`:

```typescript
describe('Secondary effects — single-hit wiring', () => {
  it('Crunch drops target Defense by 1 stage when secondary roll succeeds', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'crunch', currentPp: 15, maxPp: 15 };
    // rng: accuracy=1 (hit), crit=1 (no crit), damage random=0.85, secondary=0 (roll succeeds)
    const rolls = [1, 1, 0.85, 0];
    let rollIdx = 0;
    const engine = new BattleEngine({ rng: () => rolls[rollIdx++ % rolls.length]! });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.def).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: the Crunch test fails (def stays 0 because `applySecondaries` isn't called yet).

- [ ] **Step 3: Update `BattleEngine.ts`**

**3a.** Add `applySecondaries` and `SecondaryContext` to the import from `effects.js`:

```typescript
import { applyStatus, applyStatBoost, evaluateSecondaryEffect, evaluateVolatileEffect, applySecondaries, SecondaryContext } from './effects.js';
```

**3b.** Change `resolveTurn`'s per-action loop to pass `movedSlotIds`. Find the `for (const slotId of order)` loop and replace it:

```typescript
    const movedSlotIds = new Set<string>();
    for (const slotId of order) {
      const action = actions[slotId];
      if (!action) continue;

      const slot = this.findSlot(s, slotId);
      if (!slot) continue;
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;

      if (action.type === 'move') {
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds);
        events.push(...moveResult.events);
        s = moveResult.newState;
      } else if (action.type === 'switch') {
        const switchResult = this.executeSwitch(s, slotId, action.targetInstanceId);
        events.push(...switchResult.events);
        s = switchResult.newState;
      }

      movedSlotIds.add(slotId);

      if (this.checkWinCondition(s) !== null) break;
    }
```

**3c.** Update `executeMove` signature to accept `movedSlotIds`:

```typescript
  private executeMove(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction,
    movedSlotIds: Set<string>,
  ): TurnResult {
```

**3d.** In `executeMove`, after the existing `evaluateSecondaryEffect` and `evaluateVolatileEffect` calls (around line 310), add the `applySecondaries` call. The surrounding context looks like:

```typescript
      // Secondary status effect from move data (e.g. Flamethrower 10% burn)
      if (actualDamage > 0 && target.currentHp > 0) {
        const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes);
        if (secondaryEvent) events.push(secondaryEvent);
      }

      if (actualDamage > 0 && target.currentHp > 0) {
        const volatileEvent = evaluateVolatileEffect(move.id, target, targetSlotId, attackerSlotId);
        if (volatileEvent) events.push(volatileEvent);
      }
```

Add immediately after those two blocks:

```typescript
      // Data-driven secondaries (move.secondaries[])
      if (move.secondaries && move.secondaries.length > 0) {
        const postSecs = move.secondaries.filter(s =>
          s.kind !== 'multihit' && s.kind !== 'ohko' && s.kind !== 'charge'
        );
        if (postSecs.length > 0) {
          const secCtx: SecondaryContext = {
            secondaries: postSecs,
            totalDamage: actualDamage,
            user: attacker,
            userSlotId: attackerSlotId,
            target,
            targetSlotId,
            targetTypes: defTypes,
            battle: s,
            rng: this.rng,
            movedSlotIds,
          };
          events.push(...applySecondaries(secCtx));
        }
      }
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: all existing tests plus the new Crunch test pass.

- [ ] **Step 5: Run full server test suite**

```
cd packages/server && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): wire applySecondaries into executeMove for single-hit moves"
```

---

### Task 9: `BattleEngine` — multi-hit

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `BattleEngine.test.ts`:

```typescript
describe('Multi-hit moves', () => {
  it('Bullet Seed hits the number of times determined by rng', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bulletseed', currentPp: 30, maxPp: 30 };
    // rng values: accuracy(pass)=0, hitCount=0 (maps to 2 hits), then per-hit: crit=1(no),dmgRandom=0.85
    const rolls = [0, 0, 1, 0.85, 1, 0.85, 1, 0.99];
    let i = 0;
    const engine = new BattleEngine({ rng: () => rolls[i++ % rolls.length]! });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1');
    expect(damageEvents).toHaveLength(2);
  });

  it('multi-hit stops early if target faints mid-sequence', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bulletseed', currentPp: 30, maxPp: 30 };
    // hitCount rng=0 → 2 hits; target faints on first hit
    const rolls = [0, 0, 1, 0.85, 1, 0.99];
    let i = 0;
    const engine = new BattleEngine({ rng: () => rolls[i++ % rolls.length]! });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1');
    expect(damageEvents).toHaveLength(1);
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-b1')).toBe(true);
  });

  it('hit count distribution over 400 trials is approximately 3/8, 3/8, 1/8, 1/8', () => {
    const counts = { 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let trial = 0; trial < 400; trial++) {
      const state = make1v1State();
      state.teams[1]!.slots[0]!.party[0]!.currentHp = 9999;
      state.teams[1]!.slots[0]!.party[0]!.maxHp = 9999;
      state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bulletseed', currentPp: 30, maxPp: 30 };
      // accuracy always hits (rng=0 first call), then real random for hit count + damage
      let first = true;
      const engine = new BattleEngine({ rng: () => { if (first) { first = false; return 0; } return Math.random(); } });
      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const hits = events.filter(e => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1').length;
      counts[hits as 2|3|4|5] = (counts[hits as 2|3|4|5] ?? 0) + 1;
    }
    expect(counts[2]! / 400).toBeCloseTo(3 / 8, 1);
    expect(counts[3]! / 400).toBeCloseTo(3 / 8, 1);
    expect(counts[4]! / 400).toBeCloseTo(1 / 8, 1);
    expect(counts[5]! / 400).toBeCloseTo(1 / 8, 1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: multi-hit describes fail.

- [ ] **Step 3: Add `rollHitCount` helper and multi-hit loop to `BattleEngine.ts`**

**3a.** Add this private static method to `BattleEngine`:

```typescript
  private rollHitCount(hits: number | [number, number]): number {
    if (typeof hits === 'number') return hits;
    const [min, max] = hits;
    if (min === 2 && max === 5) {
      const r = this.rng();
      if (r < 3 / 8) return 2;
      if (r < 6 / 8) return 3;
      if (r < 7 / 8) return 4;
      return 5;
    }
    return min + Math.floor(this.rng() * (max - min + 1));
  }
```

**3b.** In `executeMove`, find the section just before the per-target loop where you need to add multi-hit support. Extract the single-target damage block into a shared helper, then loop it. The change is inside the `for (const targetSlotId of targetSlotIds)` loop.

Replace the section from the thaw check to the `evaluateSecondaryEffect` calls with this multi-hit-aware version. The area to replace starts at:

```typescript
      if (target.status === 'frz' && (move.type === 'Fire' || ALWAYS_THAW_MOVES.has(move.id))) {
```

and goes through the existing `applySecondaries` call you added in Task 8.

Replace that entire block with:

```typescript
      if (target.status === 'frz' && (move.type === 'Fire' || ALWAYS_THAW_MOVES.has(move.id))) {
        delete target.status;
        events.push({
          type: 'status-cured',
          data: { slotId: targetSlotId, status: 'frz', reason: 'fire-hit' },
        });
      }

      const targetSpecies = this.data.getSpecies(target.speciesId);
      const defTypes = target.hasTerastallized && target.teraType
        ? [target.teraType] as PokemonType[]
        : (targetSpecies?.types ?? ['Normal']) as PokemonType[];

      const effectiveness = this.data.getCombinedEffectiveness(move.type, defTypes);
      if (effectiveness === 0) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      const secs = move.secondaries ?? [];
      const multihitSec = secs.find(s => s.kind === 'multihit');
      const hitCount = multihitSec ? this.rollHitCount(multihitSec.hits) : 1;

      let totalDamage = 0;
      for (let hit = 0; hit < hitCount; hit++) {
        if (target.fainted) break;

        const attackerSpecies = this.data.getSpecies(attacker.speciesId);
        const attackerTypes = attacker.hasTerastallized && attacker.teraType
          ? [attacker.teraType] as PokemonType[]
          : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
        const stab = attackerTypes.includes(move.type);

        const isPhysical = move.category === 'physical';
        const rawAtkStat = isPhysical ? attacker.stats.atk : attacker.stats.spa;
        const boostKey = isPhysical ? 'atk' as const : 'spa' as const;
        const rawDefStat = isPhysical ? target.stats.def : target.stats.spd;
        const defBoostKey = isPhysical ? 'def' as const : 'spd' as const;

        const critStage = computeCritStage(move.critRatio, attacker.volatileStatus);
        const isCritical = this.rng() < critProbability(critStage);
        const atkBoost = isCritical ? Math.max(0, attacker.statBoosts[boostKey]) : attacker.statBoosts[boostKey];
        const defBoost = isCritical ? Math.min(0, target.statBoosts[defBoostKey]) : target.statBoosts[defBoostKey];

        let atkStat = getEffectiveStat(rawAtkStat, atkBoost, boostKey);
        const abilityHooks = getAbilityHooks(attacker.ability);
        if (abilityHooks.onAttackerModifier) {
          atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({
            user: attacker, state: s, moveType: move.type, basePower: move.basePower, target,
          }));
        }
        const defStat = getEffectiveStat(rawDefStat, defBoost, defBoostKey);
        const isSpread = targetSlotIds.length > 1;
        let otherModifiers = isSpread ? 0.75 : 1;
        const itemHooks = getItemHooks(attacker.heldItem);
        if (itemHooks.onAttackerModifier) {
          otherModifiers *= itemHooks.onAttackerModifier({
            holder: attacker, state: s, moveType: move.type, basePower: move.basePower, target, isPhysical,
          });
        }

        const { damage } = calcDamage({
          level: attacker.level,
          attackStat: atkStat,
          defenseStat: defStat,
          basePower: move.basePower,
          typeEffectiveness: effectiveness,
          stab,
          isBurned: isPhysical && attacker.status === 'brn',
          randomFactor: randomDamageFactor(),
          isCritical,
          moveType: move.type,
          ...(s.field.weather ? { weather: s.field.weather.type } : {}),
          otherModifiers,
        });

        let finalDamage = damage;
        const abilityDmgMod = abilityHooks.onDamageModifier?.({ user: attacker, state: s, moveType: move.type, basePower: move.basePower, target });
        if (abilityDmgMod !== undefined) finalDamage = Math.floor(finalDamage * abilityDmgMod);
        const itemDmgMod = itemHooks.onDamageModifier?.({ holder: attacker, state: s, moveType: move.type, basePower: move.basePower, target, isPhysical });
        if (itemDmgMod !== undefined) finalDamage = Math.floor(finalDamage * itemDmgMod);

        const actualDamage = Math.min(finalDamage, target.currentHp);
        target.currentHp -= actualDamage;
        totalDamage += actualDamage;

        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: actualDamage, effectiveness, remainingHp: target.currentHp,
        }});

        if (isCritical) {
          events.push({ type: 'crit', data: { slotId: targetSlotId } });
        }

        if (target.currentHp <= 0) {
          target.fainted = true;
          target.currentHp = 0;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
      }

      // Post-hit secondaries (applied after final hit)
      if (totalDamage > 0) {
        if (!target.fainted) {
          const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes);
          if (secondaryEvent) events.push(secondaryEvent);
          const volatileEvent = evaluateVolatileEffect(move.id, target, targetSlotId, attackerSlotId);
          if (volatileEvent) events.push(volatileEvent);
        }

        const postSecs = secs.filter(s => s.kind !== 'multihit' && s.kind !== 'ohko' && s.kind !== 'charge');
        if (postSecs.length > 0) {
          events.push(...applySecondaries({
            secondaries: postSecs,
            totalDamage,
            user: attacker,
            userSlotId: attackerSlotId,
            target,
            targetSlotId,
            targetTypes: defTypes,
            battle: s,
            rng: this.rng,
            movedSlotIds,
          }));
        }
      }

      // Defender's ability triggers
      const defenderAbilityHooks = getAbilityHooks(target.ability);
      if (defenderAbilityHooks.onAfterHit && totalDamage > 0 && !target.fainted) {
        const afterHitResult = defenderAbilityHooks.onAfterHit({
          user: target, state: s, moveType: move.type, basePower: move.basePower,
          target: attacker, isPhysical: move.category === 'physical',
        });
        if (afterHitResult?.statusToApply) {
          const attackerSpecies = this.data.getSpecies(attacker.speciesId);
          const attackerTypes = attacker.hasTerastallized && attacker.teraType
            ? [attacker.teraType] as PokemonType[]
            : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
          const event = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, attackerTypes);
          if (event) events.push(event);
        }
      }

      // Life Orb recoil etc.
      if (totalDamage > 0 && itemHooks.onAfterDamageTaken) {
        const { hpDelta } = itemHooks.onAfterDamageTaken({ holder: attacker, state: s, damageTaken: totalDamage });
        if (hpDelta < 0) {
          const recoil = Math.min(-hpDelta, attacker.currentHp);
          attacker.currentHp -= recoil;
          events.push({ type: 'damage-dealt', data: { source: 'life-orb', slotId: attackerSlotId, damage: recoil, remainingHp: attacker.currentHp } });
          if (attacker.currentHp <= 0) {
            attacker.fainted = true;
            attacker.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
          }
        }
      }
```

Note: the old per-hit faint check block that was at the end (`if (target.currentHp <= 0) { target.fainted = true; ... }`) is now inside the hit loop above. Delete any duplicate faint check that remains outside the loop.

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: all tests including multi-hit tests pass.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): multi-hit secondary with Gen 5+ distribution"
```

---

### Task 10: `BattleEngine` — charge-turn (Solar Beam)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `BattleEngine.test.ts`:

```typescript
describe('Charge-turn moves', () => {
  function makeSolarBeamState() {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
    return state;
  }

  it('T1: applies charge volatile, deals no damage', () => {
    const state = makeSolarBeamState();
    const engine = new BattleEngine({ rng: () => 0 });
    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(false);
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'solarbeam-charge')).toBe(true);
  });

  it('T2: removes charge volatile and deals damage', () => {
    const state = makeSolarBeamState();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'solarbeam-charge' }];
    const engine = new BattleEngine({ rng: () => 0 });
    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(true);
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'solarbeam-charge')).toBe(false);
  });

  it('T1 in sun: skips charge, deals damage immediately', () => {
    const state = makeSolarBeamState();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    const engine = new BattleEngine({ rng: () => 0 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(true);
    const chargeVolatileApplied = events.some(e =>
      e.type === 'volatile-applied' && e.data['volatile'] === 'solarbeam-charge'
    );
    expect(chargeVolatileApplied).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: charge-turn describes fail.

- [ ] **Step 3: Add charge-turn logic to `executeMove`**

In `executeMove`, after the accuracy roll block and before the `for (const targetSlotId of targetSlotIds)` loop, insert:

```typescript
    // Charge-turn check
    const secs = move.secondaries ?? [];
    const chargeSec = secs.find(s => s.kind === 'charge');
    if (chargeSec) {
      const isSun = s.field.weather?.type === 'sun';
      const hasCharge = attacker.volatileStatus.some(v => v.name === chargeSec.chargeVolatile);
      if (!hasCharge && !isSun) {
        attacker.volatileStatus.push({ name: chargeSec.chargeVolatile });
        events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: chargeSec.chargeVolatile, note: 'charging' } });
        return { newState: s, events };
      }
      if (hasCharge) {
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== chargeSec.chargeVolatile);
      }
    }
```

Also, in the per-target loop (Task 9 refactor), remove the `const secs = move.secondaries ?? [];` line since you now define `secs` before the loop. Update the per-target loop to reference the already-defined `secs`.

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): charge-turn secondary — Solar Beam with sun skip"
```

---

### Task 11: `BattleEngine` — OHKO

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `BattleEngine.test.ts`:

```typescript
describe('OHKO moves', () => {
  function makeOhkoState(attackerLevel: number, defenderLevel: number) {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.level = attackerLevel;
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'guillotine', currentPp: 5, maxPp: 5 };
    state.teams[1]!.slots[0]!.party[0]!.level = defenderLevel;
    return state;
  }

  it('always misses when defender level > attacker level', () => {
    const state = makeOhkoState(50, 60);
    const engine = new BattleEngine({ rng: () => 0 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'miss')).toBe(true);
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-b1')).toBe(false);
  });

  it('faints defender when roll hits (level 50 vs 40)', () => {
    const state = makeOhkoState(50, 40);
    // rng=0 → 0 * 100 = 0 < accuracy(30+10=40) → hits
    const engine = new BattleEngine({ rng: () => 0 });
    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-b1')).toBe(true);
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(0);
  });

  it('misses when rng roll fails (level 50 vs 50, accuracy=30, rng=0.31)', () => {
    const state = makeOhkoState(50, 50);
    // accuracy = clamp(30+0, 1, 100) = 30; rng=0.31 → 31 >= 30 → miss
    const engine = new BattleEngine({ rng: () => 0.31 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'miss')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: OHKO describes fail.

- [ ] **Step 3: Add OHKO logic to `executeMove`**

Inside the per-target `for` loop in `executeMove`, after the `defTypes` / `effectiveness` check (the `if (effectiveness === 0) continue` block), add an OHKO branch before the hit-count / damage section:

```typescript
      // OHKO check — bypasses normal damage formula
      const ohkoSec = secs.find(s => s.kind === 'ohko');
      if (ohkoSec) {
        if (target.level > attacker.level) {
          events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
          continue;
        }
        const ohkoAcc = Math.max(1, Math.min(100, 30 + attacker.level - target.level));
        if (this.rng() * 100 >= ohkoAcc) {
          events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
          continue;
        }
        const ohmoDmg = target.currentHp;
        target.currentHp = 0;
        target.fainted = true;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: ohmoDmg, effectiveness: 1, remainingHp: 0,
        }});
        events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        continue;
      }
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): OHKO secondary — level-based accuracy formula"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| FR-1 `Secondary` discriminated union | Task 1 |
| FR-2 backward compat `effect`/`effectChance` | preserved in Tasks 8–9 (`evaluateSecondaryEffect` kept) |
| FR-3 `applySecondaries` replaces `evaluateSecondaryEffect` (additive) | Tasks 2–5 |
| FR-4 Flinch volatile + runPreMove check | Tasks 3, 6 |
| FR-5 Confusion secondary | Task 3 |
| FR-6 Drain | Task 4 |
| FR-7 Recoil | Task 4 |
| FR-8/9 Multi-hit loop + per-hit crit + post-final secondaries | Task 9 |
| FR-10 Multi-hit stops on faint | Task 9 |
| FR-11/12 OHKO accuracy + HP set to 0 | Task 11 |
| FR-13 Selfdestruct normal | Task 5 |
| FR-14 Selfdestruct memento | Task 5 |
| FR-15 Charge-turn + Solar Beam sun skip | Task 10 |
| FR-16 Charge volatile invulnerability | noted as doc 08 future work, not in plan |
| FR-17 Recharge volatile | Tasks 5, 6 |
| Priority data entries | Task 7 |
| Success criteria tests | Tasks 2–11 |

**Placeholder scan:** No TBDs or "implement later" language found.

**Type consistency check:**
- `SecondaryContext` defined in Task 2, used in Tasks 3–5 and 8
- `applySecondaries` exported in Task 2, imported in Task 8
- `movedSlotIds: Set<string>` defined in Task 8 `resolveTurn`, passed into `executeMove`, threaded into `SecondaryContext`
- `secs` variable defined before the charge-turn block in Task 10, shared with the per-target loop from Task 9 — the plan notes to remove the duplicate `const secs` from inside the per-target loop
- `rollHitCount` defined and called only in `BattleEngine` (Task 9)
- `chargeSec.chargeVolatile` matches the `chargeVolatile: string` field on `Secondary`
