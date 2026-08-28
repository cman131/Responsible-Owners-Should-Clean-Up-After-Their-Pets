# Damage Calculation Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accuracy rolls, critical hits, freeze-on-fire-hit thaw, and weather damage modifiers to the battle engine.

**Architecture:** A new pure-function module `accuracy.ts` houses the stage tables and probability calculations; `damage.ts` gains optional `moveType`/`weather` fields for the weather modifier; `BattleEngine` wires everything into `executeMove` using an injectable `rng` for deterministic testing.

**Tech Stack:** TypeScript, Vitest, `@pkmn/dex` (data seeding), `@poke-fighter/shared` (shared types).

---

## File Map

| File | Action |
|------|--------|
| `packages/shared/src/types/pokemon.ts` | Modify — add `critRatio?: number` to `Move` |
| `packages/shared/src/types/events.ts` | Modify — add `'miss'` and `'crit'` to event type union |
| `packages/shared/src/schemas/move.schema.ts` | Modify — add `critRatio` to Zod schema |
| `data/scripts/seed.ts` | Modify — include `critRatio` in move mapping |
| `data/moves.json` | Regenerate via seed script |
| `packages/server/src/engine/accuracy.ts` | Create — pure stage/crit functions |
| `packages/server/src/engine/__tests__/accuracy.test.ts` | Create — unit tests for accuracy.ts |
| `packages/server/src/engine/damage.ts` | Modify — add `moveType`, `weather`; apply modifier |
| `packages/server/src/engine/__tests__/damage.test.ts` | Modify — weather modifier tests |
| `packages/server/src/engine/BattleEngine.ts` | Modify — inject rng, wire accuracy/crit/thaw |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | Modify — accuracy/crit/thaw tests |

---

## Task 1: Shared type additions

**Files:**
- Modify: `packages/shared/src/types/pokemon.ts`
- Modify: `packages/shared/src/types/events.ts`
- Modify: `packages/shared/src/schemas/move.schema.ts`

- [ ] **Step 1: Add `critRatio` to the `Move` interface**

In `packages/shared/src/types/pokemon.ts`, add after `effectChance?: number;`:

```typescript
  critRatio?: number;  // 1 = high crit ratio (+1 crit stage); absent/0 = normal
```

- [ ] **Step 2: Add `'miss'` and `'crit'` to the `TurnResolveEvent` type**

In `packages/shared/src/types/events.ts`, extend the `type` union inside `TurnResolveEvent`:

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
    | 'weather-change'
    | 'terrain-change'
    | 'side-condition-set'
    | 'field-effect-set'
    | 'volatile-applied'
    | 'volatile-cured'
    | 'terastallize'
    | 'faint'
    | 'miss'
    | 'crit';
  data: Record<string, unknown>;
}
```

- [ ] **Step 3: Add `critRatio` to the Zod move schema**

In `packages/shared/src/schemas/move.schema.ts`, add after `effectChance`:

```typescript
  critRatio: z.number().int().min(0).optional(),
```

- [ ] **Step 4: Build shared and verify no type errors**

```bash
pnpm --filter @poke-fighter/shared build
```

Expected: build completes with no errors.

- [ ] **Step 5: Run shared tests to confirm nothing broke**

```bash
pnpm --filter @poke-fighter/shared test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/pokemon.ts packages/shared/src/types/events.ts packages/shared/src/schemas/move.schema.ts
git commit -m "feat(shared): add critRatio to Move, add miss/crit to TurnResolveEvent"
```

---

## Task 2: Seed script — add `critRatio` and regenerate moves.json

**Files:**
- Modify: `data/scripts/seed.ts`
- Regenerate: `data/moves.json`

**Context:** `@pkmn/dex` exposes `m.critRatio` where `1` = normal and `2` = high-crit. We normalise: PS value > 1 maps to our `1`; otherwise omit the field. Known high-crit moves include Slash, Razor Leaf, Crabhammer, Stone Edge, Night Slash, Cross Poison, Leaf Blade, Psycho Cut, Shadow Claw, Aeroblast, Attack Order, Spacial Rend, Zippy Zap.

- [ ] **Step 1: Update the move mapping in seed.ts**

In `data/scripts/seed.ts`, update the `allMoves` mapping to include `critRatio`:

```typescript
const allMoves = gen9.moves.all().map((m) => ({
  id: m.id,
  name: m.name,
  type: m.type,
  category: m.category.toLowerCase() as 'physical' | 'special' | 'status',
  basePower: m.basePower,
  accuracy: m.accuracy,
  pp: m.pp,
  priority: m.priority,
  target: m.target,
  makesContact: m.flags?.contact === 1,
  effectId: m.id,
  critRatio: (m.critRatio ?? 1) > 1 ? 1 : undefined,
}));
```

- [ ] **Step 2: Regenerate moves.json**

From the workspace root:

```bash
pnpm seed
```

This regenerates `data/moves.json`. The species seeding fetches from PokeAPI (failures return safe defaults — not a problem).

- [ ] **Step 3: Verify a known high-crit move has critRatio: 1**

```bash
node -e "const m = JSON.parse(require('fs').readFileSync('data/moves.json','utf8')); console.log(m.find(x=>x.id==='slash'));"
```

Expected: output includes `"critRatio": 1`.

- [ ] **Step 4: Verify a normal move has no critRatio field**

```bash
node -e "const m = JSON.parse(require('fs').readFileSync('data/moves.json','utf8')); console.log(m.find(x=>x.id==='flamethrower'));"
```

Expected: output has no `critRatio` property.

- [ ] **Step 5: Commit**

```bash
git add data/scripts/seed.ts data/moves.json
git commit -m "feat(data): add critRatio to high-crit moves in moves.json"
```

---

## Task 3: `accuracy.ts` — stage tables and hit chance (TDD)

**Files:**
- Create: `packages/server/src/engine/accuracy.ts`
- Create: `packages/server/src/engine/__tests__/accuracy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/engine/__tests__/accuracy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  accuracyStageMultiplier,
  evasionStageMultiplier,
  computeHitChance,
} from '../accuracy.js';

describe('accuracyStageMultiplier', () => {
  it('stage 0 returns 1', () => {
    expect(accuracyStageMultiplier(0)).toBe(1);
  });

  it('stage -6 returns 0.33', () => {
    expect(accuracyStageMultiplier(-6)).toBeCloseTo(0.33, 2);
  });

  it('stage +6 returns 3', () => {
    expect(accuracyStageMultiplier(6)).toBe(3);
  });

  it('stage -1 returns 0.75', () => {
    expect(accuracyStageMultiplier(-1)).toBe(0.75);
  });

  it('stage +1 returns 1.33', () => {
    expect(accuracyStageMultiplier(1)).toBeCloseTo(1.33, 2);
  });

  it('clamps values below -6 to -6 result', () => {
    expect(accuracyStageMultiplier(-10)).toBe(accuracyStageMultiplier(-6));
  });

  it('clamps values above +6 to +6 result', () => {
    expect(accuracyStageMultiplier(10)).toBe(accuracyStageMultiplier(6));
  });
});

describe('evasionStageMultiplier', () => {
  it('stage 0 returns 1', () => {
    expect(evasionStageMultiplier(0)).toBe(1);
  });

  it('uses the same table as accuracy (positive stage = harder to hit)', () => {
    expect(evasionStageMultiplier(1)).toBe(accuracyStageMultiplier(1));
    expect(evasionStageMultiplier(-1)).toBe(accuracyStageMultiplier(-1));
  });
});

describe('computeHitChance', () => {
  it('returns "always" for accuracy: true', () => {
    expect(computeHitChance(true, 0, 0)).toBe('always');
  });

  it('returns base accuracy at neutral stages', () => {
    expect(computeHitChance(70, 0, 0)).toBe(70);
    expect(computeHitChance(100, 0, 0)).toBe(100);
    expect(computeHitChance(85, 0, 0)).toBe(85);
  });

  it('defender evasion +1 reduces hit chance (100% → 75)', () => {
    // 100 * (100/100) / (133/100) = 100 / 1.33 ≈ 75.18 → floor → 75
    expect(computeHitChance(100, 0, 1)).toBe(75);
  });

  it('attacker accuracy +6 clamps hit chance at 100', () => {
    expect(computeHitChance(100, 6, 0)).toBe(100);
  });

  it('clamps minimum to 1 (extreme evasion + low accuracy)', () => {
    // 1 * 0.33 / 3 ≈ 0.11 → floor → 0 → clamped to 1
    expect(computeHitChance(1, -6, 6)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/accuracy.test.ts
```

Expected: fails with "Cannot find module '../accuracy.js'".

- [ ] **Step 3: Implement accuracy.ts**

Create `packages/server/src/engine/accuracy.ts`:

```typescript
// Gen 5+ accuracy stage multipliers (indices 0–12, stage = index - 6)
// Stages: -6   -5   -4   -3   -2   -1    0   +1   +2   +3   +4   +5   +6
const ACC_STAGE_MULTS: number[] = [
  33, 36, 43, 50, 60, 75, 100, 133, 166, 200, 250, 266, 300,
].map((v) => v / 100);

export function accuracyStageMultiplier(stage: number): number {
  const idx = Math.max(0, Math.min(12, stage + 6));
  return ACC_STAGE_MULTS[idx] ?? 1;
}

export function evasionStageMultiplier(stage: number): number {
  return accuracyStageMultiplier(stage);
}

export function computeHitChance(
  moveAccuracy: number | true,
  attackerAccuracyStage: number,
  defenderEvasionStage: number,
): number | 'always' {
  if (moveAccuracy === true) return 'always';
  const raw =
    (moveAccuracy * accuracyStageMultiplier(attackerAccuracyStage)) /
    evasionStageMultiplier(defenderEvasionStage);
  return Math.min(100, Math.max(1, Math.floor(raw)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/accuracy.test.ts
```

Expected: all accuracy/evasion/computeHitChance tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/accuracy.ts packages/server/src/engine/__tests__/accuracy.test.ts
git commit -m "feat(engine): add accuracy.ts with stage tables and computeHitChance"
```

---

## Task 4: `accuracy.ts` — crit probability and crit stage (TDD)

**Files:**
- Modify: `packages/server/src/engine/__tests__/accuracy.test.ts`
- Modify: `packages/server/src/engine/accuracy.ts`

- [ ] **Step 1: Add failing tests for critProbability and computeCritStage**

Append to `packages/server/src/engine/__tests__/accuracy.test.ts`:

```typescript
import { critProbability, computeCritStage } from '../accuracy.js';

describe('critProbability', () => {
  it('stage 0 returns 1/24', () => {
    expect(critProbability(0)).toBeCloseTo(1 / 24, 5);
  });

  it('stage 1 returns 1/8', () => {
    expect(critProbability(1)).toBeCloseTo(1 / 8, 5);
  });

  it('stage 2 returns 1/2', () => {
    expect(critProbability(2)).toBe(0.5);
  });

  it('stage 3 returns 1 (always crit)', () => {
    expect(critProbability(3)).toBe(1);
  });

  it('stage 4+ returns 1', () => {
    expect(critProbability(4)).toBe(1);
    expect(critProbability(10)).toBe(1);
  });
});

describe('computeCritStage', () => {
  it('returns 0 with no critRatio and no volatiles', () => {
    expect(computeCritStage(undefined, [])).toBe(0);
  });

  it('returns 1 with critRatio: 1 (high-crit move)', () => {
    expect(computeCritStage(1, [])).toBe(1);
  });

  it('returns 2 with Focus Energy volatile on attacker', () => {
    expect(computeCritStage(undefined, [{ name: 'focusenergy' }])).toBe(2);
  });

  it('returns 3 with critRatio: 1 and Focus Energy', () => {
    expect(computeCritStage(1, [{ name: 'focusenergy' }])).toBe(3);
  });

  it('ignores unrelated volatiles', () => {
    expect(computeCritStage(undefined, [{ name: 'confusion' }, { name: 'leech-seed' }])).toBe(0);
  });

  it('critRatio: 0 counts as normal (no stage bonus)', () => {
    expect(computeCritStage(0, [])).toBe(0);
  });
});
```

Also update the import line at the top of the test file to include the new exports:

```typescript
import {
  accuracyStageMultiplier,
  evasionStageMultiplier,
  computeHitChance,
  critProbability,
  computeCritStage,
} from '../accuracy.js';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/accuracy.test.ts
```

Expected: fails with "'critProbability' is not exported from '../accuracy.js'".

- [ ] **Step 3: Add the two functions to accuracy.ts**

Append to `packages/server/src/engine/accuracy.ts`:

```typescript
export function critProbability(stage: number): number {
  if (stage <= 0) return 1 / 24;
  if (stage === 1) return 1 / 8;
  if (stage === 2) return 1 / 2;
  return 1;
}

export function computeCritStage(
  moveCritRatio: number | undefined,
  volatiles: Array<{ name: string }>,
): number {
  let stage = 0;
  if ((moveCritRatio ?? 0) > 0) stage += 1;
  if (volatiles.some((v) => v.name === 'focusenergy')) stage += 2;
  return stage;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/accuracy.test.ts
```

Expected: all tests in accuracy.test.ts pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/accuracy.ts packages/server/src/engine/__tests__/accuracy.test.ts
git commit -m "feat(engine): add critProbability and computeCritStage to accuracy.ts"
```

---

## Task 5: `damage.ts` — weather modifier (TDD)

**Files:**
- Modify: `packages/server/src/engine/damage.ts`
- Modify: `packages/server/src/engine/__tests__/damage.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the bottom of `packages/server/src/engine/__tests__/damage.test.ts` (outside the existing `describe` block — add a new one):

```typescript
describe('calcDamage — weather modifier', () => {
  it('Water move in rain deals 1.5× damage vs no weather', () => {
    const base: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
      moveType: 'Water',
    };
    const rain: DamageInput = { ...base, weather: 'rain' };
    expect(calcDamage(rain).damage).toBe(Math.floor(calcDamage(base).damage * 1.5));
  });

  it('Fire move in rain deals 0.5× damage vs no weather', () => {
    const base: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
      moveType: 'Fire',
    };
    const rain: DamageInput = { ...base, weather: 'rain' };
    expect(calcDamage(rain).damage).toBe(Math.floor(calcDamage(base).damage * 0.5));
  });

  it('Fire move in sun deals 1.5× damage vs no weather', () => {
    const base: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
      moveType: 'Fire',
    };
    const sun: DamageInput = { ...base, weather: 'sun' };
    expect(calcDamage(sun).damage).toBe(Math.floor(calcDamage(base).damage * 1.5));
  });

  it('Water move in sun deals 0.5× damage vs no weather', () => {
    const base: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
      moveType: 'Water',
    };
    const sun: DamageInput = { ...base, weather: 'sun' };
    expect(calcDamage(sun).damage).toBe(Math.floor(calcDamage(base).damage * 0.5));
  });

  it('sand weather does not modify damage', () => {
    const base: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
      moveType: 'Water',
    };
    const sand: DamageInput = { ...base, weather: 'sand' };
    expect(calcDamage(sand).damage).toBe(calcDamage(base).damage);
  });

  it('omitting weather and moveType does not change damage (backwards compatible)', () => {
    const input: DamageInput = {
      level: 50, attackStat: 100, defenseStat: 100, basePower: 80,
      typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0,
    };
    expect(calcDamage(input).damage).toBe(37);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/damage.test.ts
```

Expected: TypeScript error "'moveType' does not exist in type 'DamageInput'" (or runtime failure once compiled).

- [ ] **Step 3: Add `moveType` and `weather` to damage.ts**

Replace the entire contents of `packages/server/src/engine/damage.ts` with:

```typescript
import type { PokemonType, WeatherType } from '@poke-fighter/shared';

export interface DamageInput {
  level: number;
  attackStat: number;
  defenseStat: number;
  basePower: number;
  typeEffectiveness: number;
  stab: boolean;
  isBurned: boolean;
  randomFactor: number;
  isCritical?: boolean;
  otherModifiers?: number;
  moveType?: PokemonType;
  weather?: WeatherType;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
}

export function calcDamage(input: DamageInput): DamageResult {
  const {
    level, attackStat, defenseStat, basePower,
    typeEffectiveness, stab, isBurned, randomFactor,
    isCritical = false, otherModifiers = 1,
    moveType, weather,
  } = input;

  if (basePower === 0) return { damage: 0, isCrit: false };

  // Step 1: base damage
  let dmg = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * basePower * attackStat) / defenseStat) / 50) + 2;

  // Step 2: critical hit
  if (isCritical) dmg = Math.floor(dmg * 1.5);

  // Step 3: random factor (85–100%)
  dmg = Math.floor(dmg * randomFactor);

  // Step 4: STAB
  if (stab) dmg = Math.floor(dmg * 1.5);

  // Step 5: type effectiveness
  dmg = Math.floor(dmg * typeEffectiveness);

  // Step 6: burn
  if (isBurned) dmg = Math.floor(dmg / 2);

  // Step 6.5: weather modifier
  if (weather && moveType) {
    if (weather === 'sun'  && moveType === 'Fire')  dmg = Math.floor(dmg * 1.5);
    if (weather === 'sun'  && moveType === 'Water') dmg = Math.floor(dmg * 0.5);
    if (weather === 'rain' && moveType === 'Water') dmg = Math.floor(dmg * 1.5);
    if (weather === 'rain' && moveType === 'Fire')  dmg = Math.floor(dmg * 0.5);
  }

  // Step 7: other modifiers (items, abilities, etc.)
  dmg = Math.floor(dmg * otherModifiers);

  return { damage: Math.max(1, dmg), isCrit: isCritical };
}

export function randomDamageFactor(): number {
  return (85 + Math.floor(Math.random() * 16)) / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/damage.test.ts
```

Expected: all 9 tests pass (4 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/damage.ts packages/server/src/engine/__tests__/damage.test.ts
git commit -m "feat(engine): add weather damage modifier to calcDamage"
```

---

## Task 6: BattleEngine — injectable RNG and accuracy roll (TDD)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing accuracy tests**

Append to the `BattleEngine.test.ts` file (outside existing `describe` blocks):

```typescript
describe('Accuracy roll', () => {
  it('emits miss event when rng forces a miss (rng returns 1.0)', () => {
    // Flamethrower accuracy = 100; rng=1.0 → 1.0*100=100 ≥ 100 → miss
    const engine = new BattleEngine({ rng: () => 1 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const missEvent = events.find(
      (e) => e.type === 'miss' && e.data['attackerSlotId'] === 'slot-a1',
    );
    expect(missEvent).toBeDefined();
    expect(missEvent!.data['moveId']).toBe('flamethrower');
  });

  it('does not emit miss event when rng forces a hit (rng returns 0)', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'miss')).toBe(false);
    expect(events.some((e) => e.type === 'damage-dealt')).toBe(true);
  });

  it('auto-hit move (accuracy: true) never misses even when rng returns 1', () => {
    const engine = new BattleEngine({ rng: () => 1 });
    const state = make1v1State();
    // Swift has accuracy: true
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swift', currentPp: 20, maxPp: 20 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'miss' && e.data['attackerSlotId'] === 'slot-a1')).toBe(false);
    expect(
      events.some((e) => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1'),
    ).toBe(true);
  });

  it('a missed move does not reduce target HP', () => {
    const engine = new BattleEngine({ rng: () => 1 });
    const state = make1v1State();
    const hpBefore = state.teams[1]!.slots[0]!.party[0]!.currentHp;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // Both miss (rng=1 causes both to miss) → neither takes damage
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(hpBefore);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: fails — `BattleEngine` constructor doesn't accept `rng` yet; TypeScript error.

- [ ] **Step 3: Add `rng` to BattleEngine constructor**

In `packages/server/src/engine/BattleEngine.ts`:

Add a private field after the registry declaration:
```typescript
  private readonly rng: () => number;
```

Update the constructor signature and body:
```typescript
  constructor({ registry, rng }: { registry?: MoveEffectRegistry; rng?: () => number } = {}) {
    this.rng = rng ?? Math.random;
    this.registry = registry ?? buildDefaultRegistry();
  }
```

- [ ] **Step 4: Add accuracy roll to executeMove**

In `BattleEngine.ts`, add the following import at the top of the file with the other engine imports:
```typescript
import { computeHitChance } from './accuracy.js';
```

In `executeMove`, find this block (after the status move branch returns, before the target loop):

```typescript
    // Determine targets
    const targetSlotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(s, attackerSlotId, move.target);

    for (const targetSlotId of targetSlotIds) {
```

Replace it with:

```typescript
    // Determine targets
    const targetSlotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(s, attackerSlotId, move.target);

    // Accuracy roll (status moves already returned early above)
    if (!['self', 'allyTeam'].includes(move.target)) {
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

    for (const targetSlotId of targetSlotIds) {
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: all four new accuracy tests pass plus all existing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): injectable rng + accuracy roll in executeMove"
```

---

## Task 7: BattleEngine — thaw on fire hit (TDD)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing thaw tests**

Append to `BattleEngine.test.ts`:

```typescript
describe('Thaw on fire hit', () => {
  it('thaws a frozen defender struck by a Fire-type move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.status = 'frz';

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // Flamethrower (Fire)
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const thawEvent = events.find(
      (e) =>
        e.type === 'status-cured' &&
        e.data['slotId'] === 'slot-b1' &&
        e.data['reason'] === 'fire-hit',
    );
    expect(thawEvent).toBeDefined();
    expect(thawEvent!.data['status']).toBe('frz');
    // Damage is still dealt after thaw
    expect(events.some((e) => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1')).toBe(true);
    // Status cleared on defender
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });

  it('does not fire-thaw a frozen defender struck by a non-Fire move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    // Replace p1's Flamethrower with Surf (Water type)
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.status = 'frz';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // Surf (Water)
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some((e) => e.type === 'status-cured' && e.data['reason'] === 'fire-hit')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: fails — no fire-thaw logic exists yet.

- [ ] **Step 3: Add fire-thaw constant and check to executeMove**

In `BattleEngine.ts`, add a module-level constant after the imports:

```typescript
const ALWAYS_THAW_MOVES = new Set(['scald', 'steameruption', 'sparklingaria']);
```

Inside `executeMove`, in the target loop, find the null/fainted check:

```typescript
      const target = targetSlot.party[targetSlot.activePokemonIndex];
      if (!target || target.fainted) continue;

      // Type effectiveness
```

Insert the thaw check immediately after the null/fainted check:

```typescript
      const target = targetSlot.party[targetSlot.activePokemonIndex];
      if (!target || target.fainted) continue;

      // Thaw-on-fire-hit: cure freeze before damage lands
      if (target.status === 'frz' && (move.type === 'Fire' || ALWAYS_THAW_MOVES.has(move.id))) {
        delete target.status;
        events.push({
          type: 'status-cured',
          data: { slotId: targetSlotId, status: 'frz', reason: 'fire-hit' },
        });
      }

      // Type effectiveness
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: all thaw tests pass plus all previous tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): thaw frozen defender on fire-type hit"
```

---

## Task 8: BattleEngine — crit roll, stat stage clamping, and calcDamage wiring (TDD)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing crit tests**

Append to `BattleEngine.test.ts`:

```typescript
describe('Critical hits', () => {
  it('emits crit event when rng forces a crit (both calls return 0)', () => {
    // Call 0 (accuracy): 0*100=0 < 100 → hit
    // Call 1 (crit):     0 < 1/24 → crit
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'crit' && e.data['slotId'] === 'slot-b1')).toBe(true);
  });

  it('does not emit crit event when rng forces no crit', () => {
    // Call 0 (accuracy): 0 → hit; Call 1 (crit): 1 → no crit (1 < 1/24 is false)
    let callIndex = 0;
    const engine = new BattleEngine({ rng: () => (callIndex++ === 0 ? 0 : 1) });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'crit')).toBe(false);
  });

  it('Focus Energy raises crit stage so rng=0.4 crits (stage 2 threshold = 0.5)', () => {
    // Call 0 (accuracy): 0 → hit; Call 1 (crit): 0.4 < 0.5 (stage 2) → crit
    // Without FE: 0.4 < 1/24 (0.042) → false → no crit
    let c = 0;
    const rng = () => (c++ === 0 ? 0 : 0.4);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'focusenergy' });
    const engine = new BattleEngine({ rng });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'crit' && e.data['slotId'] === 'slot-b1')).toBe(true);
  });

  it('crit event appears after damage-dealt event in the event list', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageIdx = events.findIndex((e) => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1');
    const critIdx = events.findIndex((e) => e.type === 'crit' && e.data['slotId'] === 'slot-b1');
    expect(damageIdx).toBeGreaterThanOrEqual(0);
    expect(critIdx).toBeGreaterThan(damageIdx);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: fails — no crit logic exists yet.

- [ ] **Step 3: Add imports for crit functions to BattleEngine.ts**

Update the accuracy import line:

```typescript
import { computeHitChance, computeCritStage, critProbability } from './accuracy.js';
```

- [ ] **Step 4: Replace the attack/defense stat section in executeMove**

Inside the target loop in `executeMove`, find and replace this block:

```typescript
      // Attack stat
      const isPhysical = move.category === 'physical';
      const rawAtkStat = isPhysical ? attacker.stats.atk : attacker.stats.spa;
      const boostKey = isPhysical ? 'atk' as const : 'spa' as const;
      let atkStat = getEffectiveStat(rawAtkStat, attacker.statBoosts[boostKey], boostKey);

      const abilityHooks = getAbilityHooks(attacker.ability);
      if (abilityHooks.onAttackerModifier) {
        atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({
          user: attacker, state: s, moveType: move.type, basePower: move.basePower, target,
        }));
      }

      // Defense stat
      const rawDefStat = isPhysical ? target.stats.def : target.stats.spd;
      const defBoostKey = isPhysical ? 'def' as const : 'spd' as const;
      const defStat = getEffectiveStat(rawDefStat, target.statBoosts[defBoostKey], defBoostKey);
```

Replace with:

```typescript
      // Attack stat (raw, before crit adjustment)
      const isPhysical = move.category === 'physical';
      const rawAtkStat = isPhysical ? attacker.stats.atk : attacker.stats.spa;
      const boostKey = isPhysical ? 'atk' as const : 'spa' as const;

      // Defense stat (raw, before crit adjustment)
      const rawDefStat = isPhysical ? target.stats.def : target.stats.spd;
      const defBoostKey = isPhysical ? 'def' as const : 'spd' as const;

      // Crit roll — Gen 6+: ignore negative attacker stages and positive defender stages
      const critStage = computeCritStage(move.critRatio, attacker.volatileStatus);
      const isCritical = this.rng() < critProbability(critStage);
      const atkBoost = isCritical
        ? Math.max(0, attacker.statBoosts[boostKey])
        : attacker.statBoosts[boostKey];
      const defBoost = isCritical
        ? Math.min(0, target.statBoosts[defBoostKey])
        : target.statBoosts[defBoostKey];

      let atkStat = getEffectiveStat(rawAtkStat, atkBoost, boostKey);

      const abilityHooks = getAbilityHooks(attacker.ability);
      if (abilityHooks.onAttackerModifier) {
        atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({
          user: attacker, state: s, moveType: move.type, basePower: move.basePower, target,
        }));
      }

      const defStat = getEffectiveStat(rawDefStat, defBoost, defBoostKey);
```

- [ ] **Step 5: Update the calcDamage call to include isCritical, moveType, and weather**

Find the existing `calcDamage` call:

```typescript
      const { damage } = calcDamage({
        level: attacker.level,
        attackStat: atkStat,
        defenseStat: defStat,
        basePower: move.basePower,
        typeEffectiveness: effectiveness,
        stab,
        isBurned: isPhysical && attacker.status === 'brn',
        randomFactor: randomDamageFactor(),
        otherModifiers,
      });
```

Replace with:

```typescript
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
        weather: s.field.weather?.type,
        otherModifiers,
      });
```

- [ ] **Step 6: Emit the crit event after damage-dealt**

Find the `damage-dealt` event push:

```typescript
      events.push({ type: 'damage-dealt', data: {
        attackerSlotId, targetSlotId, moveId: move.id,
        damage: actualDamage, effectiveness, remainingHp: target.currentHp,
      }});
```

Insert the crit event immediately after:

```typescript
      events.push({ type: 'damage-dealt', data: {
        attackerSlotId, targetSlotId, moveId: move.id,
        damage: actualDamage, effectiveness, remainingHp: target.currentHp,
      }});

      if (isCritical) {
        events.push({ type: 'crit', data: { slotId: targetSlotId } });
      }
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: all crit tests pass plus all previous tests.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(engine): crit roll, stat stage clamping, wire isCritical+weather into calcDamage"
```

---

## Task 9: Full typecheck and test run

**Files:** None — verification only.

- [ ] **Step 1: Build shared (ensures dist is current)**

```bash
pnpm --filter @poke-fighter/shared build
```

Expected: no errors.

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: all tests across all packages pass.

- [ ] **Step 3: Run typechecks across all packages**

```bash
pnpm typecheck
```

Expected: no TypeScript errors. Fix any that appear before proceeding.

- [ ] **Step 4: Run data validation**

```bash
pnpm validate
```

Expected: validation passes (moves.json now includes critRatio for high-crit moves and the schema allows it).

- [ ] **Step 5: Commit if any fixes were needed**

If Step 3 or 4 required fixes, commit them:

```bash
git add -p
git commit -m "fix(engine): typecheck fixes from damage completion wiring"
```

---

## Spec coverage checklist

| Requirement | Task |
|-------------|------|
| FR-1: accuracy check before damage | Task 6 |
| FR-2: Gen 5+ stage multiplier table | Task 3 |
| FR-3: miss roll + miss event, skip secondaries | Task 6 |
| FR-4: OHKO accuracy formula | **Out of scope** (doc 03) |
| FR-5: Gen 6+ crit stage thresholds | Task 4 |
| FR-6: critStage from critRatio + Focus Energy | Task 4 + Task 8 |
| FR-7: crit stat clamping + crit event + 1.5× | Task 8 |
| FR-8: fire-hit thaw (Fire moves + Scald/etc.) | Task 7 |
| FR-9: random-thaw unchanged | Not touched |
| FR-10: weather damage modifier | Task 5 |
| FR-11: weather move-power behaviours | **Out of scope** (doc 05) |
| `'miss'` + `'crit'` event types | Task 1 |
| `critRatio` in Move interface + schema | Task 1 |
| `critRatio` in moves.json | Task 2 |
| Injectable RNG on BattleEngine | Task 6 |
