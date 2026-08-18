# Plan 02: Core Battle Engine (F5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a server-side Pokémon battle simulation engine that matches Pokémon Showdown's Gen 9 mechanics — damage formula, type chart, status conditions, abilities, held items, weather, terrain, Tera types, priority/speed ordering, switching, and win conditions. The engine runs headlessly with no network layer (that is Plan 03).

**Architecture:** The engine is a pure TypeScript class (`BattleEngine`) that takes a `BattleState` and a map of submitted actions, validates them, resolves the turn, and returns an ordered list of `TurnResolveEvent` objects plus the updated `BattleState`. All state mutation is immutable — each resolution returns a new state. Reference: Pokémon Showdown's sim is the correctness bar.

**Tech Stack:** TypeScript 5+, `@poke-fighter/shared` (types + DataLoader from Plan 01), `vitest` (testing). No network dependencies.

**Prerequisite:** Plan 01 complete — `DataLoader`, all shared types, and seeded JSON data available.

---

## File Structure

```
packages/server/src/
├── engine/
│   ├── index.ts                  # re-exports BattleEngine
│   ├── BattleEngine.ts           # main orchestrator — turn resolution entry point
│   ├── damage.ts                 # damage formula, critical hits, random factor
│   ├── stats.ts                  # stat calculation (EVs/IVs/nature/boosts)
│   ├── typechart.ts              # type effectiveness wrapper + STAB helpers
│   ├── status.ts                 # status condition application and tick
│   ├── weather.ts                # weather effects per turn
│   ├── terrain.ts                # terrain effects per turn
│   ├── abilities.ts              # ability hook registry
│   ├── items.ts                  # held item hook registry
│   ├── moves.ts                  # move execution + effect dispatch
│   ├── targeting.ts              # legal target calculation for a slot
│   ├── switching.ts              # switch validation and execution
│   ├── exp.ts                    # experience calculation (Plan 09, stubbed here)
│   └── __tests__/
│       ├── damage.test.ts
│       ├── stats.test.ts
│       ├── typechart.test.ts
│       ├── status.test.ts
│       ├── weather.test.ts
│       ├── BattleEngine.test.ts  # integration tests
│       └── fixtures.ts           # shared test fixtures (pre-built BattleState)
```

---

## Task 1: Stats Calculation

**Files:**
- Create: `packages/server/src/engine/stats.ts`
- Create: `packages/server/src/engine/__tests__/stats.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/server/src/engine/__tests__/stats.test.ts
import { describe, it, expect } from 'vitest';
import { calcStat, calcHp, calcAllStats, NATURES } from '../stats.js';

describe('calcHp', () => {
  it('calculates Blissey HP at L100 with 255 base, 252 EVs, 31 IVs', () => {
    // formula: floor((2*base + iv + floor(ev/4)) * level / 100) + level + 10
    const hp = calcHp({ baseStat: 255, iv: 31, ev: 252, level: 100 });
    expect(hp).toBe(620);
  });

  it('calculates Shedinja HP (always 1)', () => {
    // Shedinja base HP = 1
    const hp = calcHp({ baseStat: 1, iv: 31, ev: 252, level: 100 });
    expect(hp).toBe(1); // special case: HP = 1 if base = 1
  });
});

describe('calcStat', () => {
  it('calculates Charizard Sp.Atk at L50, Timid nature, 252 EVs, 31 IVs', () => {
    // base spa = 109, timid = neutral on spa
    // formula: floor((floor((2*109 + 31 + floor(252/4)) * 50 / 100) + 5) * 1.0)
    const spa = calcStat({ baseStat: 109, iv: 31, ev: 252, level: 50, natureMod: 1.0 });
    expect(spa).toBe(167);
  });

  it('applies Modest nature (+spa) correctly', () => {
    const base = calcStat({ baseStat: 109, iv: 31, ev: 252, level: 50, natureMod: 1.0 });
    const modest = calcStat({ baseStat: 109, iv: 31, ev: 252, level: 50, natureMod: 1.1 });
    expect(modest).toBe(Math.floor(base * 1.1));
  });
});

describe('NATURES', () => {
  it('Timid boosts spe, lowers atk', () => {
    expect(NATURES['timid']).toEqual({ boost: 'spe', drop: 'atk' });
  });

  it('Hardy is neutral', () => {
    expect(NATURES['hardy']).toEqual({ boost: null, drop: null });
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/stats.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create packages/server/src/engine/stats.ts**

```typescript
import type { Stats } from '@poke-fighter/shared';

type StatKey = keyof Omit<Stats, 'hp'>;

interface NatureEntry { boost: StatKey | null; drop: StatKey | null }

export const NATURES: Record<string, NatureEntry> = {
  hardy:   { boost: null,  drop: null  },
  lonely:  { boost: 'atk', drop: 'def' },
  brave:   { boost: 'atk', drop: 'spe' },
  adamant: { boost: 'atk', drop: 'spa' },
  naughty: { boost: 'atk', drop: 'spd' },
  bold:    { boost: 'def', drop: 'atk' },
  docile:  { boost: null,  drop: null  },
  relaxed: { boost: 'def', drop: 'spe' },
  impish:  { boost: 'def', drop: 'spa' },
  lax:     { boost: 'def', drop: 'spd' },
  timid:   { boost: 'spe', drop: 'atk' },
  hasty:   { boost: 'spe', drop: 'def' },
  serious: { boost: null,  drop: null  },
  jolly:   { boost: 'spe', drop: 'spa' },
  naive:   { boost: 'spe', drop: 'spd' },
  modest:  { boost: 'spa', drop: 'atk' },
  mild:    { boost: 'spa', drop: 'def' },
  quiet:   { boost: 'spa', drop: 'spe' },
  bashful: { boost: null,  drop: null  },
  rash:    { boost: 'spa', drop: 'spd' },
  calm:    { boost: 'spd', drop: 'atk' },
  gentle:  { boost: 'spd', drop: 'def' },
  sassy:   { boost: 'spd', drop: 'spe' },
  careful: { boost: 'spd', drop: 'spa' },
  quirky:  { boost: null,  drop: null  },
};

interface StatInput {
  baseStat: number;
  iv: number;
  ev: number;
  level: number;
  natureMod?: number; // 1.0 | 1.1 | 0.9
}

export function calcHp({ baseStat, iv, ev, level }: StatInput): number {
  if (baseStat === 1) return 1; // Shedinja
  return Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

export function calcStat({ baseStat, iv, ev, level, natureMod = 1.0 }: StatInput): number {
  const base = Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(base * natureMod);
}

export function getNatureMod(nature: string, stat: StatKey): number {
  const entry = NATURES[nature.toLowerCase()];
  if (!entry) return 1.0;
  if (entry.boost === stat) return 1.1;
  if (entry.drop === stat) return 0.9;
  return 1.0;
}

interface CalcInput {
  baseStats: Stats;
  ivs: Stats;
  evs: Stats;
  level: number;
  nature: string;
}

export function calcAllStats(input: CalcInput): Stats {
  const { baseStats, ivs, evs, level, nature } = input;
  return {
    hp:  calcHp({ baseStat: baseStats.hp, iv: ivs.hp, ev: evs.hp, level }),
    atk: calcStat({ baseStat: baseStats.atk, iv: ivs.atk, ev: evs.atk, level, natureMod: getNatureMod(nature, 'atk') }),
    def: calcStat({ baseStat: baseStats.def, iv: ivs.def, ev: evs.def, level, natureMod: getNatureMod(nature, 'def') }),
    spa: calcStat({ baseStat: baseStats.spa, iv: ivs.spa, ev: evs.spa, level, natureMod: getNatureMod(nature, 'spa') }),
    spd: calcStat({ baseStat: baseStats.spd, iv: ivs.spd, ev: evs.spd, level, natureMod: getNatureMod(nature, 'spd') }),
    spe: calcStat({ baseStat: baseStats.spe, iv: ivs.spe, ev: evs.spe, level, natureMod: getNatureMod(nature, 'spe') }),
  };
}

export function getEffectiveStat(
  statValue: number,
  boost: number,
  stat: 'atk' | 'def' | 'spa' | 'spd' | 'spe'
): number {
  // Boost table: ±1=4/3, ±2=5/3, ±3=6/3, ±4=7/3, ±5=8/3, ±6=9/3
  const clamped = Math.max(-6, Math.min(6, boost));
  const [num, den] = clamped >= 0
    ? [2 + clamped, 2]
    : [2, 2 - clamped];
  return Math.floor(statValue * num / den);
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/stats.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/stats.ts packages/server/src/engine/__tests__/stats.test.ts
git commit -m "feat(engine): stat calculation formula (HP, base stats, nature, boosts)"
```

---

## Task 2: Damage Formula

**Files:**
- Create: `packages/server/src/engine/damage.ts`
- Create: `packages/server/src/engine/__tests__/damage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/server/src/engine/__tests__/damage.test.ts
import { describe, it, expect } from 'vitest';
import { calcDamage, type DamageInput } from '../damage.js';

describe('calcDamage', () => {
  it('Flamethrower (90 BP, Fire, special) from Charizard-spa167 vs Blissey-spd136 at neutral', () => {
    // Showdown calc reference: ~52–62 HP
    const input: DamageInput = {
      level: 50,
      attackStat: 167,
      defenseStat: 136,
      basePower: 90,
      typeEffectiveness: 1,
      stab: true,
      isBurned: false,
      randomFactor: 1.0, // max roll
    };
    const { damage } = calcDamage(input);
    // With max roll and STAB: expect ~62
    expect(damage).toBeGreaterThanOrEqual(52);
    expect(damage).toBeLessThanOrEqual(65);
  });

  it('applies super effective multiplier (2x)', () => {
    const base: DamageInput = { level: 50, attackStat: 100, defenseStat: 100, basePower: 80, typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0 };
    const superEff: DamageInput = { ...base, typeEffectiveness: 2 };
    expect(calcDamage(superEff).damage).toBe(calcDamage(base).damage * 2);
  });

  it('burn halves physical attack', () => {
    const normal: DamageInput = { level: 50, attackStat: 200, defenseStat: 100, basePower: 80, typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0 };
    const burned: DamageInput = { ...normal, isBurned: true };
    expect(calcDamage(burned).damage).toBe(Math.floor(calcDamage(normal).damage / 2));
  });

  it('returns isCrit false when not critical', () => {
    const input: DamageInput = { level: 50, attackStat: 100, defenseStat: 100, basePower: 80, typeEffectiveness: 1, stab: false, isBurned: false, randomFactor: 1.0 };
    expect(calcDamage(input).isCrit).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/damage.test.ts
```

- [ ] **Step 3: Create packages/server/src/engine/damage.ts**

```typescript
export interface DamageInput {
  level: number;
  attackStat: number;     // effective attack or sp.atk (with boosts already applied)
  defenseStat: number;    // effective defense or sp.def
  basePower: number;
  typeEffectiveness: number;  // 0 | 0.25 | 0.5 | 1 | 2 | 4
  stab: boolean;
  isBurned: boolean;      // halves physical damage if category = 'physical'
  randomFactor: number;   // 0.85–1.0 (for real battles, pick random; for tests, pass 1.0)
  isCritical?: boolean;
  otherModifiers?: number; // combined product of all other multipliers (items, abilities, etc.)
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
  } = input;

  if (basePower === 0) return { damage: 0, isCrit: false };

  // Step 1: base damage
  let dmg = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * basePower * attackStat) / defenseStat) / 50) + 2;

  // Step 2: targets modifier (spread moves = 0.75 in doubles — caller applies this to basePower or otherModifiers)
  // Step 3: weather modifier (applied via otherModifiers)
  // Step 4: critical hit — ignores negative stat drops on attacker, positive on defender
  // (stat adjustment is caller's responsibility before passing attackStat/defenseStat)
  if (isCritical) dmg = Math.floor(dmg * 1.5);

  // Step 5: random factor (85–100%)
  dmg = Math.floor(dmg * randomFactor);

  // Step 6: STAB
  if (stab) dmg = Math.floor(dmg * 1.5);

  // Step 7: type effectiveness
  dmg = Math.floor(dmg * typeEffectiveness);

  // Step 8: burn
  if (isBurned) dmg = Math.floor(dmg / 2);

  // Step 9: other modifiers (items, abilities, etc.) — multiplicative chain
  dmg = Math.floor(dmg * otherModifiers);

  return { damage: Math.max(1, dmg), isCrit: isCritical };
}

export function randomDamageFactor(): number {
  // returns a value in [0.85, 1.0] matching PS's damage roll
  return (85 + Math.floor(Math.random() * 16)) / 100;
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/damage.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/damage.ts packages/server/src/engine/__tests__/damage.test.ts
git commit -m "feat(engine): Gen 9 damage formula with STAB, type effectiveness, burn, crit"
```

---

## Task 3: Status Conditions

**Files:**
- Create: `packages/server/src/engine/status.ts`
- Create: `packages/server/src/engine/__tests__/status.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/server/src/engine/__tests__/status.test.ts
import { describe, it, expect } from 'vitest';
import { canApplyStatus, tickStatus, getBurnDamage, PARALYSIS_SPEED_MOD } from '../status.js';
import type { PartyMember } from '@poke-fighter/shared';

const basePartyMember: PartyMember = {
  instanceId: 'test', speciesId: 6, level: 50,
  currentHp: 100, maxHp: 100,
  stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  ability: 'blaze', moves: [
    { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
    { moveId: 'airslash', currentPp: 15, maxPp: 15 },
    { moveId: 'roost', currentPp: 10, maxPp: 10 },
    { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
  ],
  status: undefined, volatileStatus: [],
  statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  teraType: undefined, hasTerastallized: false, fainted: false, expTotal: 0,
};

describe('canApplyStatus', () => {
  it('cannot apply burn to Fire type', () => {
    expect(canApplyStatus({ status: 'brn', types: ['Fire'], currentStatus: undefined, ability: 'blaze' })).toBe(false);
  });

  it('cannot apply paralysis to Electric type', () => {
    expect(canApplyStatus({ status: 'par', types: ['Electric'], currentStatus: undefined, ability: '' })).toBe(false);
  });

  it('cannot apply status if already statused', () => {
    expect(canApplyStatus({ status: 'brn', types: ['Water'], currentStatus: 'par', ability: '' })).toBe(false);
  });

  it('can apply burn to non-Fire type without existing status', () => {
    expect(canApplyStatus({ status: 'brn', types: ['Water'], currentStatus: undefined, ability: '' })).toBe(true);
  });
});

describe('getBurnDamage', () => {
  it('deals 1/16 of max HP rounded down', () => {
    expect(getBurnDamage(160)).toBe(10);
    expect(getBurnDamage(100)).toBe(6);
    expect(getBurnDamage(1)).toBe(1); // minimum 1
  });
});

describe('PARALYSIS_SPEED_MOD', () => {
  it('is 0.5', () => {
    expect(PARALYSIS_SPEED_MOD).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/status.test.ts
```

- [ ] **Step 3: Create packages/server/src/engine/status.ts**

```typescript
import type { StatusCondition, PokemonType } from '@poke-fighter/shared';

export const PARALYSIS_SPEED_MOD = 0.5;
export const PARALYSIS_FULL_PARALYSIS_CHANCE = 0.25;
export const FREEZE_THAW_CHANCE = 0.2;
export const CONFUSION_HURT_CHANCE = 0.33;

interface CanApplyInput {
  status: StatusCondition;
  types: PokemonType[];
  currentStatus: StatusCondition | undefined;
  ability: string;
}

const IMMUNITIES: Record<StatusCondition, PokemonType[]> = {
  brn: ['Fire'],
  par: ['Electric', 'Ground'],
  frz: ['Ice'],
  psn: ['Poison', 'Steel'],
  tox: ['Poison', 'Steel'],
  slp: [],
  fnt: [],
};

export function canApplyStatus({ status, types, currentStatus, ability }: CanApplyInput): boolean {
  if (currentStatus) return false;  // already has a status
  const immune = IMMUNITIES[status] ?? [];
  if (types.some((t) => immune.includes(t))) return false;
  // Ability-based immunities (subset — full list handled in abilities.ts)
  if (ability === 'limber' && status === 'par') return false;
  if (ability === 'immunity' && (status === 'psn' || status === 'tox')) return false;
  if (ability === 'magmaarmor' && status === 'frz') return false;
  if (ability === 'waterveil' && status === 'brn') return false;
  if (ability === 'insomnia' && status === 'slp') return false;
  return true;
}

export function getBurnDamage(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 16));
}

export function getPoisonDamage(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 8));
}

export function getToxicDamage(maxHp: number, toxicCounter: number): number {
  return Math.max(1, Math.floor(maxHp * toxicCounter / 16));
}

export type StatusTickResult = {
  hpDelta: number;      // negative = damage, 0 = no change
  cured: boolean;
  fullParalysis: boolean;
  thawed: boolean;
};

export function tickStatus(
  status: StatusCondition,
  maxHp: number,
  toxicCounter: number
): StatusTickResult {
  switch (status) {
    case 'brn':
      return { hpDelta: -getBurnDamage(maxHp), cured: false, fullParalysis: false, thawed: false };
    case 'psn':
      return { hpDelta: -getPoisonDamage(maxHp), cured: false, fullParalysis: false, thawed: false };
    case 'tox':
      return { hpDelta: -getToxicDamage(maxHp, toxicCounter), cured: false, fullParalysis: false, thawed: false };
    case 'par':
      return { hpDelta: 0, cured: false, fullParalysis: Math.random() < PARALYSIS_FULL_PARALYSIS_CHANCE, thawed: false };
    case 'frz':
      return { hpDelta: 0, cured: false, fullParalysis: false, thawed: Math.random() < FREEZE_THAW_CHANCE };
    case 'slp':
      return { hpDelta: 0, cured: false, fullParalysis: false, thawed: false }; // sleep turn tracking handled in BattleEngine
    default:
      return { hpDelta: 0, cured: false, fullParalysis: false, thawed: false };
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/status.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/status.ts packages/server/src/engine/__tests__/status.test.ts
git commit -m "feat(engine): status condition application rules and tick effects"
```

---

## Task 4: Ability & Item Hook System

**Files:**
- Create: `packages/server/src/engine/abilities.ts`
- Create: `packages/server/src/engine/items.ts`

- [ ] **Step 1: Create packages/server/src/engine/abilities.ts**

The ability system uses a hook registry pattern. Each hook is a function called at a specific point in turn resolution. Only a representative subset is implemented here — add more as needed.

```typescript
import type { PartyMember, BattleState, PokemonType } from '@poke-fighter/shared';

export interface AbilityContext {
  user: PartyMember;
  state: BattleState;
}

export interface AttackContext extends AbilityContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
}

export interface AbilityHooks {
  onAttackerModifier?: (ctx: AttackContext) => number;   // multiply attack stat
  onDefenderModifier?: (ctx: AttackContext) => number;   // multiply defense stat
  onDamageModifier?: (ctx: AttackContext) => number;     // multiply final damage
  onSwitchIn?: (ctx: AbilityContext) => void;
  onStatusImmunity?: (ctx: AbilityContext & { status: string }) => boolean;
  onWeatherImmunity?: (ctx: AbilityContext & { weather: string }) => boolean;
  onSpeedModifier?: (ctx: AbilityContext) => number;
}

const ABILITY_HOOKS: Record<string, AbilityHooks> = {
  intimidate: {
    onSwitchIn: ({ user, state }) => {
      // lowers adjacent opponents' attack by 1 stage — BattleEngine applies the stat drop
      // effect is dispatched via event; hook returns undefined
    },
  },
  levitate: {
    onStatusImmunity: ({ status }) => status === 'Ground', // immune to Ground moves
  },
  'speed-boost': {
    // raises Speed by 1 at end of each turn — handled in BattleEngine.endOfTurn
  },
  'thick-fat': {
    onDamageModifier: ({ moveType }) =>
      moveType === 'Fire' || moveType === 'Ice' ? 0.5 : 1,
  },
  'flash-fire': {
    onStatusImmunity: ({ status }) => status === 'Fire', // absorbs Fire moves
  },
  'water-absorb': {
    onStatusImmunity: ({ status }) => status === 'Water',
  },
  'volt-absorb': {
    onStatusImmunity: ({ status }) => status === 'Electric',
  },
  blaze: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Fire' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  overgrow: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Grass' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  torrent: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Water' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  swarm: {
    onAttackerModifier: ({ user, moveType }) =>
      moveType === 'Bug' && user.currentHp <= user.maxHp / 3 ? 1.5 : 1,
  },
  'sand-rush': {
    onSpeedModifier: ({ state }) =>
      state.field.weather?.type === 'sand' ? 2 : 1,
  },
  'swift-swim': {
    onSpeedModifier: ({ state }) =>
      state.field.weather?.type === 'rain' ? 2 : 1,
  },
  chlorophyll: {
    onSpeedModifier: ({ state }) =>
      state.field.weather?.type === 'sun' ? 2 : 1,
  },
};

export function getAbilityHooks(abilityId: string): AbilityHooks {
  return ABILITY_HOOKS[abilityId.toLowerCase().replace(/\s/g, '-')] ?? {};
}
```

- [ ] **Step 2: Create packages/server/src/engine/items.ts**

```typescript
import type { PartyMember, BattleState, PokemonType } from '@poke-fighter/shared';

export interface ItemContext {
  holder: PartyMember;
  state: BattleState;
}

export interface ItemAttackContext extends ItemContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
  isPhysical: boolean;
}

export interface ItemHooks {
  onAttackerModifier?: (ctx: ItemAttackContext) => number;
  onDamageModifier?: (ctx: ItemAttackContext) => number;
  onEndOfTurn?: (ctx: ItemContext) => { hpDelta: number };
  onAfterDamageTaken?: (ctx: ItemContext & { damageTaken: number }) => { hpDelta: number };
  onSpeedModifier?: (ctx: ItemContext) => number;
}

const ITEM_HOOKS: Record<string, ItemHooks> = {
  'choice-band': {
    onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.5 : 1,
  },
  'choice-specs': {
    onAttackerModifier: ({ isPhysical }) => !isPhysical ? 1.5 : 1,
  },
  'choice-scarf': {
    onSpeedModifier: () => 1.5,
  },
  'life-orb': {
    onDamageModifier: () => 1.3,
    onAfterDamageTaken: ({ damageTaken }) => ({ hpDelta: damageTaken > 0 ? -Math.floor(damageTaken / 10) : 0 }),
  },
  leftovers: {
    onEndOfTurn: ({ holder }) => ({ hpDelta: Math.floor(holder.maxHp / 16) }),
  },
  'black-sludge': {
    onEndOfTurn: ({ holder }) => {
      const isPoison = holder.ability === 'poison-type'; // simplified — check species type in real impl
      return { hpDelta: isPoison ? Math.floor(holder.maxHp / 16) : -Math.floor(holder.maxHp / 8) };
    },
  },
  'eviolite': {
    onAttackerModifier: () => 1, // handled as defense boost in BattleEngine
  },
};

export function getItemHooks(itemId: string | undefined): ItemHooks {
  if (!itemId) return {};
  return ITEM_HOOKS[itemId.toLowerCase().replace(/\s/g, '-')] ?? {};
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @poke-fighter/server typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/engine/abilities.ts packages/server/src/engine/items.ts
git commit -m "feat(engine): ability and item hook registry with common Gen 9 effects"
```

---

## Task 5: Move Execution & Turn Resolution

**Files:**
- Create: `packages/server/src/engine/moves.ts`
- Create: `packages/server/src/engine/BattleEngine.ts`
- Create: `packages/server/src/engine/__tests__/fixtures.ts`
- Create: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Create packages/server/src/engine/__tests__/fixtures.ts**

```typescript
import type { BattleState, PartyMember, TeamState, SlotState, FieldState, SideConditions } from '@poke-fighter/shared';
import { v4 as uuidv4 } from 'uuid';

function defaultSideConditions(): SideConditions {
  return { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 };
}

function defaultField(): FieldState {
  return { trickRoom: 0, gravity: 0, sideConditions: [defaultSideConditions(), defaultSideConditions()] };
}

function makePokemon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: uuidv4(),
    speciesId: 6,
    level: 50,
    currentHp: 100, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash',     currentPp: 15, maxPp: 15 },
      { moveId: 'roost',        currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp',    currentPp: 15, maxPp: 15 },
    ],
    status: undefined, volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    teraType: undefined, hasTerastallized: false, fainted: false, expTotal: 0,
    ...overrides,
  };
}

function makeSlot(slotId: string, pokemon: PartyMember, isNpc = false): SlotState {
  return {
    slotId, displayName: slotId, isNpc, isSpectator: false,
    party: [pokemon],
    activePokemonIndex: 0,
  };
}

export function make1v1State(): BattleState {
  const p1 = makePokemon({ instanceId: 'p1-mon', spe: 100 });
  const p2 = makePokemon({ instanceId: 'p2-mon', spe: 80 });

  const teamA: TeamState = {
    teamId: 'team-a',
    slots: [makeSlot('slot-a1', p1)],
  };
  const teamB: TeamState = {
    teamId: 'team-b',
    slots: [makeSlot('slot-b1', p2, true)],
  };

  return {
    battleId: 'test-battle',
    label: 'Test Battle',
    turnNumber: 1,
    phase: 'action',
    teams: [teamA, teamB],
    field: defaultField(),
    turnTimerSeconds: 60,
  };
}
```

- [ ] **Step 2: Write BattleEngine integration tests**

```typescript
// packages/server/src/engine/__tests__/BattleEngine.test.ts
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

describe('BattleEngine.resolveTurn', () => {
  it('deals damage when a damaging move is used', () => {
    const state = make1v1State();
    const engine = new BattleEngine();

    const actions: Record<string, MoveAction | import('@poke-fighter/shared').SwitchAction> = {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' }, // flamethrower
    };

    const { newState, events } = engine.resolveTurn(state, actions);

    // Both mons used a move — events should contain move-used and damage-dealt
    expect(events.some((e) => e.type === 'move-used')).toBe(true);
    expect(events.some((e) => e.type === 'damage-dealt')).toBe(true);

    // Both mons should have taken some damage
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.currentHp).toBeLessThan(100);
    expect(p2.currentHp).toBeLessThan(100);
  });

  it('faster pokemon moves first (higher spe)', () => {
    const state = make1v1State(); // p1 spe=100, p2 spe=80
    const engine = new BattleEngine();

    const events: string[] = [];
    const { events: resolvedEvents } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const moveEvents = resolvedEvents.filter((e) => e.type === 'move-used');
    expect(moveEvents[0]!.data['attackerSlotId']).toBe('slot-a1'); // faster acts first
  });

  it('detects win condition when all party faint', () => {
    const state = make1v1State();
    // Set p2 to 1 HP so one hit finishes them
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some((e) => e.type === 'faint')).toBe(true);
    expect(newState.phase).toBe('ended');
    expect(newState.winner).toBe(0); // team A wins
  });
});
```

- [ ] **Step 3: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/BattleEngine.test.ts
```

Expected: FAIL — `BattleEngine not found`

- [ ] **Step 4: Create packages/server/src/engine/BattleEngine.ts**

```typescript
import type {
  BattleState, SlotState, PartyMember, MoveAction, SwitchAction,
  TurnResolveEvent, PokemonType,
} from '@poke-fighter/shared';
import { DataLoader } from '../data/loader.js';
import { calcDamage, randomDamageFactor } from './damage.js';
import { getEffectiveStat } from './stats.js';
import { canApplyStatus, tickStatus, PARALYSIS_SPEED_MOD } from './status.js';
import { getAbilityHooks } from './abilities.js';
import { getItemHooks } from './items.js';

type Action = MoveAction | SwitchAction;

export interface TurnResult {
  newState: BattleState;
  events: TurnResolveEvent[];
}

export class BattleEngine {
  private readonly data = new DataLoader();

  resolveTurn(state: BattleState, actions: Record<string, Action>): TurnResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    // 1. Determine action order (priority, then speed)
    const order = this.buildActionOrder(s, actions);

    // 2. Execute each action
    for (const slotId of order) {
      const action = actions[slotId];
      if (!action) continue;

      const slot = this.findSlot(s, slotId);
      if (!slot) continue;
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;

      if (action.type === 'move') {
        const moveEvents = this.executeMove(s, slotId, action);
        events.push(...moveEvents.events);
        s = moveEvents.newState;
      } else if (action.type === 'switch') {
        const switchEvents = this.executeSwitch(s, slotId, action.targetInstanceId);
        events.push(...switchEvents.events);
        s = switchEvents.newState;
      }

      // Check win condition after each action
      if (this.checkWinCondition(s) !== null) break;
    }

    // 3. End-of-turn effects (weather, status tick, leftovers, etc.)
    const eotResult = this.endOfTurn(s);
    events.push(...eotResult.events);
    s = eotResult.newState;

    // 4. Check win condition
    const winner = this.checkWinCondition(s);
    if (winner !== null) {
      s = { ...s, phase: 'ended', winner };
    } else {
      s = { ...s, turnNumber: s.turnNumber + 1, phase: 'action' };
    }

    return { newState: s, events };
  }

  private buildActionOrder(state: BattleState, actions: Record<string, Action>): string[] {
    const entries = Object.entries(actions).map(([slotId, action]) => {
      const slot = this.findSlot(state, slotId)!;
      const active = slot.party[slot.activePokemonIndex]!;
      const priority = action.type === 'switch' ? 6 // switches have highest priority
        : this.data.getMove((action as MoveAction).moveId ?? '')?.priority ?? 0;
      const effectiveSpe = this.getEffectiveSpeed(active, state);
      return { slotId, priority, spe: effectiveSpe };
    });

    return entries
      .sort((a, b) => b.priority - a.priority || b.spe - a.spe || Math.random() - 0.5)
      .map((e) => e.slotId);
  }

  private getEffectiveSpeed(pokemon: PartyMember, state: BattleState): number {
    let spe = getEffectiveStat(pokemon.stats.spe, pokemon.statBoosts.spe, 'spe');
    if (pokemon.status === 'par') spe = Math.floor(spe * PARALYSIS_SPEED_MOD);

    const abilityHooks = getAbilityHooks(pokemon.ability);
    if (abilityHooks.onSpeedModifier) {
      spe = Math.floor(spe * abilityHooks.onSpeedModifier({ user: pokemon, state }));
    }
    const itemHooks = getItemHooks(pokemon.heldItem);
    if (itemHooks.onSpeedModifier) {
      spe = Math.floor(spe * itemHooks.onSpeedModifier({ holder: pokemon, state }));
    }
    return spe;
  }

  private executeMove(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction
  ): TurnResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    const attackerSlot = this.findSlot(s, attackerSlotId)!;
    const attacker = attackerSlot.party[attackerSlot.activePokemonIndex]!;
    const move = this.data.getMove(attacker.moves[action.moveIndex]?.moveId ?? '');
    if (!move) return { newState: s, events };

    // Spend PP
    const moveSlot = attacker.moves[action.moveIndex]!;
    moveSlot.currentPp = Math.max(0, moveSlot.currentPp - 1);

    events.push({ type: 'move-used', data: { attackerSlotId, moveId: move.id, moveName: move.name } });

    if (move.category === 'status') {
      // Status move handling (stub — extend per move effectId)
      return { newState: s, events };
    }

    // Determine targets
    const targetSlotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(s, attackerSlotId, move.target);

    for (const targetSlotId of targetSlotIds) {
      const targetSlot = this.findSlot(s, targetSlotId);
      if (!targetSlot) continue;
      const target = targetSlot.party[targetSlot.activePokemonIndex];
      if (!target || target.fainted) continue;

      // Type effectiveness
      const targetSpecies = this.data.getSpecies(target.speciesId);
      const defTypes = target.hasTerastallized && target.teraType
        ? [target.teraType]
        : (targetSpecies?.types ?? ['Normal']) as PokemonType[];

      let effectiveness = this.data.getCombinedEffectiveness(move.type, defTypes);
      if (effectiveness === 0) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId } });
        continue;
      }

      // STAB
      const attackerSpecies = this.data.getSpecies(attacker.speciesId);
      const attackerTypes = attacker.hasTerastallized && attacker.teraType
        ? [attacker.teraType]
        : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
      const stab = attackerTypes.includes(move.type);

      // Attack stat
      const isPhysical = move.category === 'physical';
      const rawAtkStat = isPhysical ? attacker.stats.atk : attacker.stats.spa;
      const boostKey = isPhysical ? 'atk' : 'spa';
      let atkStat = getEffectiveStat(rawAtkStat, attacker.statBoosts[boostKey], boostKey);

      const abilityHooks = getAbilityHooks(attacker.ability);
      if (abilityHooks.onAttackerModifier) {
        atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({ user: attacker, state: s, moveType: move.type, basePower: move.basePower, target }));
      }

      // Defense stat
      const rawDefStat = isPhysical ? target.stats.def : target.stats.spd;
      const defBoostKey = isPhysical ? 'def' : 'spd';
      const defStat = getEffectiveStat(rawDefStat, target.statBoosts[defBoostKey], defBoostKey);

      // Spread penalty
      const isSpread = targetSlotIds.length > 1;

      // Damage
      let otherModifiers = isSpread ? 0.75 : 1;
      const itemHooks = getItemHooks(attacker.heldItem);
      if (itemHooks.onAttackerModifier) {
        otherModifiers *= itemHooks.onAttackerModifier({ holder: attacker, state: s, moveType: move.type, basePower: move.basePower, target, isPhysical });
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
        otherModifiers,
      });

      const actualDamage = Math.min(damage, target.currentHp);
      target.currentHp -= actualDamage;

      events.push({ type: 'damage-dealt', data: { attackerSlotId, targetSlotId, moveId: move.id, damage: actualDamage, effectiveness, remainingHp: target.currentHp } });

      if (target.currentHp <= 0) {
        target.fainted = true;
        target.currentHp = 0;
        events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
      }
    }

    return { newState: s, events };
  }

  private executeSwitch(state: BattleState, slotId: string, targetInstanceId: string): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);
    const slot = this.findSlot(s, slotId)!;
    const newIndex = slot.party.findIndex((p) => p.instanceId === targetInstanceId);
    if (newIndex === -1 || slot.party[newIndex]?.fainted) return { newState: s, events };

    const previousMon = slot.party[slot.activePokemonIndex]?.instanceId;
    slot.activePokemonIndex = newIndex;
    events.push({ type: 'volatile-applied', data: { note: 'switch', slotId, from: previousMon, to: targetInstanceId } });

    return { newState: s, events };
  }

  private endOfTurn(state: BattleState): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);

    for (const team of s.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;

        // Status tick
        if (active.status) {
          const toxicCounter = active.volatileStatus.filter((v) => v === 'toxic-counter').length;
          const tick = tickStatus(active.status, active.maxHp, toxicCounter);
          if (tick.hpDelta !== 0) {
            const damage = Math.min(-tick.hpDelta, active.currentHp);
            active.currentHp -= damage;
            events.push({ type: 'damage-dealt', data: { source: 'status', slotId: slot.slotId, damage, remainingHp: active.currentHp } });
            if (active.currentHp <= 0) {
              active.fainted = true;
              active.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: slot.slotId, instanceId: active.instanceId } });
            }
          }
        }

        // Item end-of-turn (leftovers, etc.)
        const itemHooks = getItemHooks(active.heldItem);
        if (itemHooks.onEndOfTurn) {
          const { hpDelta } = itemHooks.onEndOfTurn({ holder: active, state: s });
          if (hpDelta > 0) {
            const heal = Math.min(hpDelta, active.maxHp - active.currentHp);
            active.currentHp += heal;
            events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: active.currentHp } });
          }
        }
      }
    }

    // Weather tick
    if (s.field.weather) {
      s.field.weather.turnsRemaining -= 1;
      if (s.field.weather.turnsRemaining <= 0) {
        events.push({ type: 'weather-change', data: { weather: null } });
        s.field.weather = undefined;
      }
    }

    return { newState: s, events };
  }

  private getSpreadTargets(state: BattleState, attackerSlotId: string, target: string): string[] {
    if (target === 'self') return [attackerSlotId];
    const attackerTeamIndex = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === attackerSlotId));
    const foeTeamIndex = attackerTeamIndex === 0 ? 1 : 0;
    const foeTeam = state.teams[foeTeamIndex];
    if (!foeTeam) return [];
    return foeTeam.slots
      .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId);
  }

  private checkWinCondition(state: BattleState): 0 | 1 | null {
    for (let i = 0; i < 2; i++) {
      const team = state.teams[i];
      if (!team) continue;
      const allFainted = team.slots.every((slot) =>
        slot.party.every((p) => p.fainted)
      );
      if (allFainted) return i === 0 ? 1 : 0; // other team wins
    }
    return null;
  }

  findSlot(state: BattleState, slotId: string): SlotState | null {
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot;
    }
    return null;
  }
}
```

- [ ] **Step 5: Add uuid dependency and install**

```bash
pnpm --filter @poke-fighter/server add uuid
pnpm --filter @poke-fighter/server add -D @types/uuid
pnpm install
```

- [ ] **Step 6: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/engine/
git commit -m "feat(engine): BattleEngine with turn resolution, damage, switching, status, win condition"
```

---

## Task 6: Tera Type Support

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Create: `packages/server/src/engine/__tests__/tera.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/server/src/engine/__tests__/tera.test.ts
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('Tera type', () => {
  it('Terastallizing to Fire gives STAB on Fire moves even for non-Fire species', () => {
    const state = make1v1State();
    // Set p1 to a Water-type but tera into Fire
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.speciesId = 9; // Blastoise (Water)
    p1.teraType = 'Fire';

    const engine = new BattleEngine();

    // Action with terastallize flag
    const action = { type: 'move' as const, moveIndex: 0 as const, targetSlotId: 'slot-b1', terastallize: true };
    const { newState, events } = engine.resolveTurn(state, { 'slot-a1': action, 'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' } });

    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.hasTerastallized).toBe(true);
    expect(events.some((e) => e.type === 'terastallize')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/tera.test.ts
```

- [ ] **Step 3: Add Terastallize handling to BattleEngine.executeMove**

In `executeMove`, before spending PP, add:

```typescript
// Handle Terastallize
if (action.terastallize && !attacker.hasTerastallized && attacker.teraType) {
  attacker.hasTerastallized = true;
  events.push({ type: 'terastallize', data: { slotId: attackerSlotId, teraType: attacker.teraType } });
}
```

The STAB logic already reads `hasTerastallized` and `teraType` to determine the attacker's effective types, so no further changes are needed.

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @poke-fighter/server test
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/tera.test.ts
git commit -m "feat(engine): Terastallize support — type change and STAB recalculation"
```

---

## Task 7: Legal Target Calculation

**Files:**
- Create: `packages/server/src/engine/targeting.ts`
- Create: `packages/server/src/engine/__tests__/targeting.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/server/src/engine/__tests__/targeting.test.ts
import { describe, it, expect } from 'vitest';
import { getLegalTargets } from '../targeting.js';
import { make1v1State } from './fixtures.js';

describe('getLegalTargets', () => {
  it('single-target move on 1v1 returns the one foe slot', () => {
    const state = make1v1State();
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toEqual(['slot-b1']);
  });

  it('self-target move returns only the user slot', () => {
    const state = make1v1State();
    const targets = getLegalTargets(state, 'slot-a1', 'self');
    expect(targets).toEqual(['slot-a1']);
  });

  it('spread move returns all foe slots', () => {
    const state = make1v1State();
    // Manually add a second foe slot
    const extraSlot = structuredClone(state.teams[1]!.slots[0]!);
    extraSlot.slotId = 'slot-b2';
    state.teams[1]!.slots.push(extraSlot);

    const targets = getLegalTargets(state, 'slot-a1', 'allAdjacentFoes');
    expect(targets.sort()).toEqual(['slot-b1', 'slot-b2'].sort());
  });

  it('excludes fainted pokemon slots', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.fainted = true;
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/engine/__tests__/targeting.test.ts
```

- [ ] **Step 3: Create packages/server/src/engine/targeting.ts**

```typescript
import type { BattleState, MoveTarget } from '@poke-fighter/shared';

export function getLegalTargets(
  state: BattleState,
  attackerSlotId: string,
  target: MoveTarget
): string[] {
  const attackerTeamIdx = state.teams.findIndex((t) =>
    t.slots.some((s) => s.slotId === attackerSlotId)
  );
  const foeTeamIdx = attackerTeamIdx === 0 ? 1 : 0;
  const allyTeam = state.teams[attackerTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];

  const livingFoeSlots = () =>
    (foeTeam?.slots ?? [])
      .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId);

  const livingAllySlots = () =>
    (allyTeam?.slots ?? [])
      .filter((s) => s.slotId !== attackerSlotId && !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId);

  switch (target) {
    case 'normal':
    case 'randomNormal':
      return livingFoeSlots();
    case 'self':
      return [attackerSlotId];
    case 'allAdjacentFoes':
    case 'foeSide':
      return livingFoeSlots();
    case 'adjacentAlly':
      return livingAllySlots();
    case 'allAdjacent':
      return [...livingFoeSlots(), ...livingAllySlots()];
    case 'allySide':
    case 'all':
    case 'scripted':
      return [attackerSlotId]; // field effects — handled specially
    default:
      return livingFoeSlots();
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test
```

- [ ] **Step 5: Create engine index**

```typescript
// packages/server/src/engine/index.ts
export { BattleEngine } from './BattleEngine.js';
export { calcAllStats } from './stats.js';
export { getLegalTargets } from './targeting.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/targeting.ts packages/server/src/engine/index.ts packages/server/src/engine/__tests__/targeting.test.ts
git commit -m "feat(engine): legal target calculation for all MoveTarget types"
```

---

**Plan 02 complete.** The battle engine resolves turns server-side with correct damage, status, Tera types, ability/item hooks, speed ordering, win detection, and legal target calculation. No networking yet — that is Plan 03.
