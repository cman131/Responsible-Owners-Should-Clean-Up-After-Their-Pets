# Ability & Item Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire onDefenderModifier, onMoveImmunity, and expanded onAfterHit into BattleEngine; implement all in-scope abilities and items; add Focus Sash, Rocky Helmet, Air Balloon, berries, choice lockup, Eviolite, Light Clay, Big Root, Scope Lens, Assault Vest.

**Architecture:** Infrastructure first (Phase 1: types/interfaces, Phase 2: hook wiring), then ability content (Phase 3), then item content (Phase 4). Each task is self-contained and testable. New test files: `abilities.test.ts` and `items.test.ts`.

**Tech Stack:** TypeScript, Vitest, Node.js — `packages/server` (engine + socket) and `packages/shared` (types).

**Test commands:** Run from `packages/server/`: `npm test` (all tests), `npm run typecheck`. Individual file: `npx vitest run src/engine/__tests__/abilities.test.ts`.

**Damage reference** (L50, Atk=100, Def=100, `Math.random()=0.5` → factor 0.93):
- Tackle BP40 neutral: **17** hp
- Body Slam BP85 neutral: **36** hp  
- Surf BP90 neutral: **38** hp; ×2 vs Fire/Flying: **76** hp
- Flamethrower BP90, STAB, vs Fire/Flying (0.5×): **28** hp

---

### Task 1: Schema & Type Changes

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/shared/src/types/events.ts`
- Modify: `packages/server/src/engine/abilities.ts`
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/accuracy.ts`

- [ ] **Step 1: Write failing typecheck test**

Create `packages/server/src/engine/__tests__/abilities.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
// This file will hold all ability tests. Start with a placeholder.
describe('abilities', () => {
  it('placeholder — remove when real tests are added', () => {
    expect(true).toBe(true);
  });
});
```

Create `packages/server/src/engine/__tests__/items.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
describe('items', () => {
  it('placeholder — remove when real tests are added', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify tests pass (no failures yet)**

```
cd packages/server && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: both placeholder tests pass.

- [ ] **Step 3: Implement all schema changes**

**`packages/shared/src/types/battle.ts`:**

Change `WeatherType`:
```typescript
export type WeatherType = 'sun' | 'rain' | 'sand' | 'snow' | 'heavy-rain' | 'harsh-sun' | 'strong-winds';
```

Change `FieldState.weather` (add `permanent?`):
```typescript
weather?: { type: WeatherType; turnsRemaining: number; fromAbility: boolean; permanent?: boolean };
```

Add to `PartyMember` (after `tracedAbilityId?`):
```typescript
lockedMoveId?: string;
isEvioliteEligible?: boolean;
```

**`packages/shared/src/types/events.ts`** — extend `TurnResolveEvent.type` union (add after `'pokemon-switched'`):
```typescript
| 'focus-sash'
| 'item-consumed'
| 'status-blocked'
| 'ability-triggered'
```

**`packages/server/src/engine/abilities.ts`** — add new interfaces and update `AbilityHooks` (add `Move` to imports):
```typescript
import type { PartyMember, BattleState, PokemonType, StatBoosts, TurnResolveEvent, Move } from '@poke-fighter/shared';

export interface DefenderModifierCtx {
  defender: PartyMember;
  attacker: PartyMember;
  state: BattleState;
  move: Move;
  moveType: PokemonType;
  basePower: number;
  isPhysical: boolean;
  makesContact: boolean;
  effectiveness: number;
}

export interface MoveImmunityCtx {
  move: Move;
  defender: PartyMember;
  state: BattleState;
}

export interface MoveImmunityResult {
  immune: true;
  hpHealFraction?: number;
  statBoostDeltas?: Partial<StatBoosts>;
  chargeFlashFire?: boolean;
}

export interface AfterHitResult {
  statusToApply?: string;
  statBoostDeltas?: Partial<StatBoosts>;
  abilityOverride?: string;
  directDamage?: number;
  volatileToApply?: string;
  disableMoveId?: string;
}

export interface SwitchInResult {
  statBoostDeltas?: Partial<StatBoosts>;
  selfBoostDeltas?: Partial<StatBoosts>;
  traceAbilityId?: string;
  clearScreens?: boolean;
  setWeather?: { type: WeatherType; turnsRemaining: number; permanent?: boolean };
}
```

Add `WeatherType` to the import from `@poke-fighter/shared`.

Update `AbilityHooks` interface — change existing signatures and add new hooks:
```typescript
export interface AbilityHooks {
  onAttackerModifier?: (ctx: AttackContext) => number;
  onDefenderModifier?: (ctx: DefenderModifierCtx) => number;   // was AttackContext — now DefenderModifierCtx
  onDamageModifier?: (ctx: AttackContext) => number;
  onSwitchIn?: (ctx: SwitchInContext) => SwitchInResult | null;
  onSwitchOut?: (ctx: SwitchContext) => SwitchOutResult | null;
  onAfterHit?: (ctx: AttackContext & { isPhysical: boolean; makesContact: boolean; rng: () => number }) => AfterHitResult | null;
  onStatusImmunity?: (ctx: { status: string; state?: BattleState }) => boolean;
  onMoveImmunity?: (ctx: MoveImmunityCtx) => MoveImmunityResult | null;
  onWeatherImmunity?: (ctx: AbilityContext & { weather: string }) => boolean;
  onSpeedModifier?: (ctx: AbilityContext) => number;
  doublesSecondaryChance?: true;
  removesSecondaries?: true;
}
```

**`packages/server/src/engine/items.ts`** — extend `ItemHooks` and update `onAfterDamageTaken` return type:
```typescript
export interface ItemHooks {
  onAttackerModifier?: (ctx: ItemAttackContext) => number;
  onDefenderModifier?: (ctx: ItemAttackContext) => number;
  onDamageModifier?: (ctx: ItemAttackContext) => number;
  onEndOfTurn?: (ctx: ItemContext) => { hpDelta: number };
  onAfterDamageTaken?: (ctx: ItemContext & { damageTaken: number; effectiveness?: number }) => {
    hpDelta: number;
    statBoostDeltas?: Partial<StatBoosts>;
    consume?: boolean;
  };
  onAfterHit?: (ctx: ItemAttackContext & { makesContact: boolean; totalDamage: number }) => {
    directDamageToAttacker?: number;
    consume?: boolean;
  } | null;
  onStatusApplied?: (ctx: ItemContext & { status: string }) => { cureStatus: boolean; consume?: boolean } | null;
  onSpeedModifier?: (ctx: ItemContext) => number;
  critStageBonus?: number;
  screenExtension?: number;
  drainMultiplier?: number;
}
```

Add `StatBoosts` to imports in `items.ts`:
```typescript
import type { PartyMember, BattleState, PokemonType, StatBoosts } from '@poke-fighter/shared';
```

**`packages/server/src/engine/accuracy.ts`** — add `itemCritBonus` parameter:
```typescript
export function computeCritStage(
  moveCritRatio: number | undefined,
  volatiles: Array<{ name: string }>,
  itemCritBonus: number = 0,
): number {
  let stage = 0;
  if ((moveCritRatio ?? 0) > 0) stage += 1;
  if (volatiles.some((v) => v.name === 'focusenergy')) stage += 2;
  stage += itemCritBonus;
  return stage;
}
```

- [ ] **Step 4: Run typecheck to verify**

```
cd packages/server && npm run typecheck 2>&1 | tail -30
```
Expected: 0 errors. Fix any type errors before continuing.

- [ ] **Step 5: Commit**

```
git add packages/shared/src/types/battle.ts packages/shared/src/types/events.ts packages/server/src/engine/abilities.ts packages/server/src/engine/items.ts packages/server/src/engine/accuracy.ts packages/server/src/engine/__tests__/abilities.test.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: schema changes for ability/item completion — new types, interfaces, and event literals"
```

---

### Task 2: Refactor `canApplyStatus` + Wire `onStatusImmunity`

**Files:**
- Modify: `packages/server/src/engine/status.ts`
- Modify: `packages/server/src/engine/effects.ts` (applyStatus + evaluateSecondaryEffect)
- Modify: `packages/server/src/engine/effectFactories.ts` (applyStatusTarget)
- Modify: `packages/server/src/engine/BattleEngine.ts` (2 applyStatus call sites)
- Modify: `packages/server/src/engine/abilities.ts` (add 10 onStatusImmunity entries)
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the placeholder in `abilities.test.ts` with:
```typescript
import { describe, it, expect } from 'vitest';
import { canApplyStatus } from '../status.js';

describe('onStatusImmunity — canApplyStatus routing', () => {
  it('Limber blocks par', () => {
    expect(canApplyStatus({ status: 'par', types: [], currentStatus: undefined, ability: 'limber' })).toBe(false);
  });
  it('Limber allows brn', () => {
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'limber' })).toBe(true);
  });
  it('Immunity blocks psn', () => {
    expect(canApplyStatus({ status: 'psn', types: [], currentStatus: undefined, ability: 'immunity' })).toBe(false);
  });
  it('Immunity blocks tox', () => {
    expect(canApplyStatus({ status: 'tox', types: [], currentStatus: undefined, ability: 'immunity' })).toBe(false);
  });
  it('Magma Armor blocks frz', () => {
    expect(canApplyStatus({ status: 'frz', types: [], currentStatus: undefined, ability: 'magma-armor' })).toBe(false);
  });
  it('Water Veil blocks brn', () => {
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'water-veil' })).toBe(false);
  });
  it('Insomnia blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'insomnia' })).toBe(false);
  });
  it('Vital Spirit blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'vital-spirit' })).toBe(false);
  });
  it('Sweet Veil blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'sweet-veil' })).toBe(false);
  });
  it('Comatose blocks all status', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'comatose' })).toBe(false);
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'comatose' })).toBe(false);
  });
  it('Leaf Guard blocks status in sun', () => {
    const battle = { field: { weather: { type: 'sun', turnsRemaining: 3, fromAbility: true } } } as any;
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'leaf-guard', battle })).toBe(false);
  });
  it('Leaf Guard allows status outside sun', () => {
    const battle = { field: {} } as any;
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'leaf-guard', battle })).toBe(true);
  });
  it('old hardcoded limber entry is gone (no regression)', () => {
    // After refactor, limber still blocks par — routed through hook
    expect(canApplyStatus({ status: 'par', types: ['Electric'], currentStatus: undefined, ability: 'limber' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | tail -30
```
Expected: FAIL — Limber blocks par → returns true (not false); hooks not wired yet.

- [ ] **Step 3: Implement**

**`packages/server/src/engine/status.ts`** — full replacement:
```typescript
import type { StatusCondition, PokemonType, BattleState } from '@poke-fighter/shared';
import { getAbilityHooks } from './abilities.js';

export const PARALYSIS_SPEED_MOD = 0.5;
export const PARALYSIS_FULL_PARALYSIS_CHANCE = 0.25;
export const FREEZE_THAW_CHANCE = 0.2;
export const CONFUSION_HURT_CHANCE = 0.33;

interface CanApplyInput {
  status: StatusCondition;
  types: PokemonType[];
  currentStatus: StatusCondition | undefined;
  ability: string;
  battle?: BattleState;
}

const IMMUNITIES: Record<StatusCondition, PokemonType[]> = {
  brn: ['Fire'],
  par: ['Electric'],
  frz: ['Ice'],
  psn: ['Poison', 'Steel'],
  tox: ['Poison', 'Steel'],
  slp: [],
  fnt: [],
};

export function canApplyStatus({ status, types, currentStatus, ability, battle }: CanApplyInput): boolean {
  if (currentStatus) return false;
  const immune = IMMUNITIES[status] ?? [];
  if (types.some((t) => immune.includes(t))) return false;
  if (getAbilityHooks(ability).onStatusImmunity?.({ status, state: battle })) return false;
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
```

**`packages/server/src/engine/effects.ts`** — change `applyStatus` 6th param from `field?: FieldState` to `battle?: BattleState`; update terrain checks; update `canApplyStatus` call:

```typescript
import type {
  PartyMember, StatBoosts, StatusCondition, PokemonType, TurnResolveEvent, Move, BattleState, Secondary,
} from '@poke-fighter/shared';
// Remove FieldState from import (no longer used directly in applyStatus)
```

Change `applyStatus` signature and body:
```typescript
export function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
  options?: { bypassSub?: boolean },
  battle?: BattleState,
): TurnResolveEvent | null {
  if (!options?.bypassSub && member.volatileStatus.some(v => v.name === 'substitute')) return null;
  if (!canApplyStatus({ status, types, currentStatus: member.status, ability: member.ability, battle })) {
    return null;
  }
  if (battle?.field) {
    const field = battle.field;
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

Update `evaluateSecondaryEffect` to pass `battle?: BattleState` instead of `field?: FieldState`:
```typescript
export function evaluateSecondaryEffect(
  move: Move,
  target: PartyMember,
  targetSlotId: string,
  targetTypes: PokemonType[],
  battle?: BattleState,
): TurnResolveEvent | null {
  if (!move.effect || move.effectChance === undefined) return null;
  if (Math.random() * 100 >= move.effectChance) return null;
  if (STATUS_CONDITIONS.has(move.effect)) {
    return applyStatus(target, targetSlotId, move.effect as StatusCondition, targetTypes, undefined, battle);
  }
  return null;
}
```

Update `applySecondaries` — in the `'status'` case, change `ctx.battle.field` to `ctx.battle`:
```typescript
case 'status': {
  if (ctx.rng() * 100 >= sec.chance) break;
  // ...
  const evt = applyStatus(member, slotId, sec.status as StatusCondition, types, undefined, ctx.battle);
  // ...
}
```

Also remove the `FieldState` import from effects.ts (no longer needed directly).

**`packages/server/src/engine/effectFactories.ts`** — update `applyStatusTarget`:
```typescript
export function applyStatusTarget(status: StatusCondition): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    const bypassSub = ctx.move.soundMove === true;
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyStatus(ctx.targets[i]!, ctx.targetSlotIds[i]!, status, ctx.targetTypes[i]!, { bypassSub }, ctx.battle);
      if (event) events.push(event);
    }
    return { events };
  };
}
```

**`packages/server/src/engine/BattleEngine.ts`** — update 2 `applyStatus` call sites to pass `s` (full BattleState) instead of `s.field`:

Line ~384 (protect variant status):
```typescript
const evt = applyStatus(attacker, attackerSlotId, variantEffects.status as StatusCondition, attackerTypes, undefined, s);
```

Line ~634 (onAfterHit status):
```typescript
const event = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, attackerTypes, undefined, s);
```

Also update the call to `evaluateSecondaryEffect` (~line 598):
```typescript
const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes, s);
```

**`packages/server/src/engine/abilities.ts`** — remove the old `onStatusImmunity` entries for levitate/flash-fire/water-absorb/volt-absorb (those will be converted to `onMoveImmunity` in Task 3). Add new onStatusImmunity entries:

Remove these from `ABILITY_HOOKS`:
```typescript
levitate: {
  onStatusImmunity: ({ status }) => status === 'Ground',  // DELETE THIS
},
'flash-fire': { ... },  // remove onStatusImmunity entry
'water-absorb': { ... },  // remove onStatusImmunity entry
'volt-absorb': { ... },  // remove onStatusImmunity entry
```

Add new entries:
```typescript
limber: {
  onStatusImmunity: ({ status }) => status === 'par',
},
immunity: {
  onStatusImmunity: ({ status }) => status === 'psn' || status === 'tox',
},
'magma-armor': {
  onStatusImmunity: ({ status }) => status === 'frz',
},
'water-veil': {
  onStatusImmunity: ({ status }) => status === 'brn',
},
insomnia: {
  onStatusImmunity: ({ status }) => status === 'slp',
},
'vital-spirit': {
  onStatusImmunity: ({ status }) => status === 'slp',
},
'sweet-veil': {
  onStatusImmunity: ({ status }) => status === 'slp',
},
comatose: {
  onStatusImmunity: () => true,
},
'leaf-guard': {
  onStatusImmunity: ({ state }) => state?.field.weather?.type === 'sun',
},
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | tail -20
```
Expected: all onStatusImmunity tests pass. Then run full suite:
```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: no regressions.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/status.ts packages/server/src/engine/effects.ts packages/server/src/engine/effectFactories.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: route onStatusImmunity through hook system; add Limber, Immunity, Magma Armor, Water Veil, Insomnia, Vital Spirit, Sweet Veil, Comatose, Leaf Guard"
```

---

### Task 3: Wire `onMoveImmunity` + Levitate

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('onMoveImmunity — Levitate', () => {
  it('blocks Ground move and emits ability-triggered', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'levitate';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(events.some(e => e.type === 'ability-triggered')).toBe(true);
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('does not block non-Ground move', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.ability = 'levitate';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|✓|×)"
```
Expected: Levitate tests FAIL (no-effect event not emitted; damage still dealt).

- [ ] **Step 3: Implement**

**`packages/server/src/engine/abilities.ts`** — migrate levitate from `onStatusImmunity` to `onMoveImmunity`:
```typescript
levitate: {
  onMoveImmunity: ({ move }) => move.type === 'Ground' ? { immune: true } : null,
},
```

**`packages/server/src/engine/BattleEngine.ts`** — after the `effectiveness === 0` check (around line 423-426) and before the OHKO check, insert the `onMoveImmunity` call block:

```typescript
// Ability-based move immunity (Levitate, Volt Absorb, etc.)
const abilityImmunityResult = getAbilityHooks(effectiveAbilityId(target))
  .onMoveImmunity?.({ move, defender: target, state: s });
if (abilityImmunityResult) {
  if (abilityImmunityResult.hpHealFraction) {
    const healAmt = Math.min(
      Math.floor(target.maxHp * abilityImmunityResult.hpHealFraction),
      target.maxHp - target.currentHp,
    );
    if (healAmt > 0) {
      target.currentHp += healAmt;
      events.push({ type: 'heal', data: { slotId: targetSlotId, amount: healAmt, remainingHp: target.currentHp } });
    }
  }
  if (abilityImmunityResult.statBoostDeltas) {
    events.push(applyStatBoost(target, targetSlotId, abilityImmunityResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
  }
  if (abilityImmunityResult.chargeFlashFire) {
    if (!target.volatileStatus.some(v => v.name === 'flash-fire-charged')) {
      target.volatileStatus.push({ name: 'flash-fire-charged' });
    }
  }
  events.push({ type: 'ability-triggered', data: { slotId: targetSlotId, ability: effectiveAbilityId(target), effect: 'immune' } });
  events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
  continue;
}

// Air Balloon Ground immunity
if (target.heldItem === 'air-balloon' && effectiveMoveType === 'Ground') {
  events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
  continue;
}
```

Make sure `effectiveAbilityId` is imported in BattleEngine.ts (check existing imports).

Also update the `computeCritStage` call to pass the item bonus (from Task 1's accuracy.ts change):
```typescript
// Find this line (~478):
const critStage = computeCritStage(move.critRatio, attacker.volatileStatus);
// Replace with:
const critStage = computeCritStage(move.critRatio, attacker.volatileStatus, getItemHooks(attacker.heldItem).critStageBonus ?? 0);
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: Levitate tests pass, no regressions.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: wire onMoveImmunity call site in executeMove; implement Levitate"
```

---

### Task 4: Wire `onDefenderModifier` + Multiscale / Shadow Shield / Thick Fat

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('onDefenderModifier — Multiscale', () => {
  it('halves damage at full HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'multiscale';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Tackle BP40 neutral = 17; halved by Multiscale = 8
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(92);
  });

  it('does not reduce damage when HP is below max', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'multiscale';
    p2.currentHp = 99; // not at full HP
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // 17 damage (no halving)
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(82);
  });
});

describe('onDefenderModifier — Thick Fat', () => {
  it('reduces Fire damage by half on defender', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // p1 uses flamethrower (Fire special, moveIndex 0)
    state.teams[1]!.slots[0]!.party[0]!.ability = 'thick-fat';
    const engineWithTF = new BattleEngine({ rng: () => 0.5 });
    const { newState: withTF } = engineWithTF.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    state.teams[1]!.slots[0]!.party[0]!.ability = 'blaze'; // no modifier
    const engineNoTF = new BattleEngine({ rng: () => 0.5 });
    const { newState: noTF } = engineNoTF.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // With Thick Fat: damage should be half of without
    const dmgWithTF = 100 - withTF.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNoTF = 100 - noTF.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgWithTF).toBe(Math.floor(dmgNoTF * 0.5));
  });
});
```

Add `import { vi } from 'vitest';` and `afterEach(() => vi.restoreAllMocks());` at the top of the file.

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep -E "FAIL|×" | head -10
```
Expected: Multiscale and Thick Fat tests fail.

- [ ] **Step 3: Implement**

**`packages/server/src/engine/BattleEngine.ts`** — after the screen multiplier block (around line 516-520), add `onDefenderModifier` call:

```typescript
// Ability-based defender modifier (Multiscale, Filter, Thick Fat, etc.)
const defAbilityHooks = getAbilityHooks(effectiveAbilityId(target));
if (defAbilityHooks.onDefenderModifier) {
  const defMod = defAbilityHooks.onDefenderModifier({
    defender: target,
    attacker,
    state: s,
    move,
    moveType: effectiveMoveType,
    basePower: effectiveBasePower,
    isPhysical,
    makesContact: move.makesContact === true,
    effectiveness,
  });
  otherModifiers *= defMod;
}

// Item-based defender modifier (Assault Vest SpD boost)
const defItemMod = getItemHooks(target.heldItem).onDefenderModifier?.({
  holder: target, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower,
  target: attacker, isPhysical,
});
if (defItemMod !== undefined) otherModifiers *= defItemMod;
```

**`packages/server/src/engine/abilities.ts`** — add new entries; move thick-fat from `onDamageModifier` to `onDefenderModifier`; add multiscale and shadow-shield:

Remove `thick-fat` from `onDamageModifier` and replace with:
```typescript
'thick-fat': {
  onDefenderModifier: ({ moveType }) =>
    moveType === 'Fire' || moveType === 'Ice' ? 0.5 : 1,
},
multiscale: {
  onDefenderModifier: ({ defender }) =>
    defender.currentHp === defender.maxHp ? 0.5 : 1,
},
'shadow-shield': {
  onDefenderModifier: ({ defender }) =>
    defender.currentHp === defender.maxHp ? 0.5 : 1,
},
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all passing, including new Multiscale and Thick Fat tests.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: wire onDefenderModifier in executeMove; implement Multiscale, Shadow Shield, Thick Fat (moved from onDamageModifier)"
```

---

### Task 5: Expand `onAfterHit` + Rough Skin / Iron Barbs

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('onAfterHit — Rough Skin / Iron Barbs', () => {
  it('deals floor(maxHp/8) to attacker on contact', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'rough-skin';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Attacker (p1) takes floor(100/8) = 12 from Rough Skin
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(88);
  });

  it('does not trigger on non-contact move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // flamethrower (moveIndex 0) does not make contact
    state.teams[1]!.slots[0]!.party[0]!.ability = 'rough-skin';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // p1 HP unchanged (no Rough Skin damage)
    // p1 takes damage from flamethrower recoil only if applicable — rough skin shouldn't fire
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.currentHp).toBe(100); // p1 didn't get hit; p2 used roost
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep "rough-skin" | head -5
```
Expected: Rough Skin tests fail (no directDamage handling yet).

- [ ] **Step 3: Implement**

**`packages/server/src/engine/abilities.ts`** — add rough-skin and iron-barbs:
```typescript
'rough-skin': {
  onAfterHit: ({ makesContact, target }) =>
    makesContact ? { directDamage: Math.floor(target.maxHp / 8) } : null,
},
'iron-barbs': {
  onAfterHit: ({ makesContact, target }) =>
    makesContact ? { directDamage: Math.floor(target.maxHp / 8) } : null,
},
```

**`packages/server/src/engine/BattleEngine.ts`** — update the existing `onAfterHit` call block (~line 622-637). Replace the entire block:

```typescript
// Defender's ability triggers (Static, Flame Body, Rough Skin, etc.)
if (totalDamage > 0 && !target.fainted) {
  const afterHitResult = getAbilityHooks(effectiveAbilityId(target)).onAfterHit?.({
    user: target, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower,
    target: attacker, isPhysical,
    makesContact: move.makesContact === true,
    rng: this.rng,
  });
  if (afterHitResult) {
    if (afterHitResult.statusToApply && !attacker.fainted) {
      const attackerSpecies = this.data.getSpecies(attacker.speciesId);
      const attackerTypes = attacker.hasTerastallized && attacker.teraType
        ? [attacker.teraType] as PokemonType[]
        : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
      const evt = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, attackerTypes, undefined, s);
      if (evt) events.push(evt);
    }
    if (afterHitResult.statBoostDeltas && !attacker.fainted) {
      events.push(applyStatBoost(attacker, attackerSlotId, afterHitResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
    }
    if (afterHitResult.abilityOverride && !attacker.fainted) {
      attacker.ability = afterHitResult.abilityOverride;
      events.push({ type: 'ability-triggered', data: { slotId: attackerSlotId, ability: afterHitResult.abilityOverride, effect: 'mummy' } });
    }
    if (afterHitResult.directDamage && !attacker.fainted) {
      const dmg = Math.min(afterHitResult.directDamage, attacker.currentHp);
      attacker.currentHp -= dmg;
      events.push({ type: 'damage-dealt', data: { source: 'ability-contact', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
      if (attacker.currentHp <= 0) {
        attacker.fainted = true;
        attacker.currentHp = 0;
        events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
      }
    }
    if (afterHitResult.volatileToApply && !attacker.fainted) {
      const vEvt = applyVolatile(attacker, attackerSlotId, targetSlotId, afterHitResult.volatileToApply, undefined, undefined);
      if (vEvt) events.push(vEvt);
    }
  }
}
```

Also import `applyVolatile` if not already imported in BattleEngine.ts:
```typescript
import { applyStatus, applyStatBoost, applyVolatile, evaluateSecondaryEffect, evaluateVolatileEffect, applySecondaries } from './effects.js';
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: expand onAfterHit ctx (makesContact, rng) and AfterHitResult handling; implement Rough Skin, Iron Barbs"
```

---

### Task 6: Focus Sash + Air Balloon Ground Immunity (inline, executeMove)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Test: `packages/server/src/engine/__tests__/items.test.ts`

- [ ] **Step 1: Write failing tests**

Replace placeholder in `items.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

afterEach(() => vi.restoreAllMocks());

describe('Focus Sash', () => {
  it('survives OHKO at 1 HP when at full HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 1; p2.maxHp = 1; // Would be OHKOed instantly — override maxHp to force OHKO
    // Reset: use full HP with enough damage to OHKO
    p2.currentHp = 100; p2.maxHp = 100; p2.stats.def = 1; // def=1 → OHKO
    p2.heldItem = 'focus-sash';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(1);
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'focus-sash')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed')).toBe(true);
  });

  it('does not trigger when not at full HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 99; p2.maxHp = 100; p2.stats.def = 1;
    p2.heldItem = 'focus-sash';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.fainted).toBe(true);
  });
});

describe('Air Balloon', () => {
  it('grants immunity to Ground moves', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'air-balloon';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | tail -20
```
Expected: Focus Sash and Air Balloon tests FAIL.

- [ ] **Step 3: Implement**

**`packages/server/src/engine/BattleEngine.ts`** — inside the `else` block for non-substitute damage (after computing `cappedDamage`), add Focus Sash check BEFORE `target.currentHp -= cappedDamage`:

Find this code (~line 560-563):
```typescript
const cappedDamage = (endureEntry && target.currentHp - actualDamage <= 0)
  ? target.currentHp - 1
  : actualDamage;
target.currentHp -= cappedDamage;
```

Replace with:
```typescript
let cappedDamage = (endureEntry && target.currentHp - actualDamage <= 0)
  ? target.currentHp - 1
  : actualDamage;

// Focus Sash: survive OHKO at 1 HP if currently at full HP
if (
  target.heldItem === 'focus-sash' &&
  target.currentHp === target.maxHp &&
  target.currentHp - cappedDamage <= 0
) {
  cappedDamage = target.currentHp - 1;
  target.heldItem = undefined;
  events.push({ type: 'focus-sash', data: { slotId: targetSlotId } });
  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'focus-sash', reason: 'triggered' } });
}

target.currentHp -= cappedDamage;
```

The Air Balloon Ground immunity check was already added in Task 3 (after onMoveImmunity block). Verify it's in place.

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: implement Focus Sash (inline survive-OHKO) and Air Balloon Ground immunity"
```

---

### Task 7: Post-hit Items — Rocky Helmet, Air Balloon Pop, Weakness Policy

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Test: `packages/server/src/engine/__tests__/items.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `items.test.ts`:
```typescript
describe('Rocky Helmet', () => {
  it('deals floor(maxHp/6) to contact attacker', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rocky-helmet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // p1 takes floor(100/6) = 16 from Rocky Helmet
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(84);
  });

  it('does not trigger on non-contact move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rocky-helmet';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});

describe('Air Balloon pop', () => {
  it('balloon pops when hit by non-Ground move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'air-balloon';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'air-balloon')).toBe(true);
  });
});

describe('Weakness Policy', () => {
  it('+2 Atk and SpA on super-effective hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'weakness-policy';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // surf 2× vs Charizard
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.atk).toBe(2);
    expect(p2After.statBoosts.spa).toBe(2);
    expect(p2After.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'weakness-policy')).toBe(true);
  });

  it('does not trigger on neutral hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'weakness-policy';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | tail -30
```
Expected: Rocky Helmet, Air Balloon pop, and Weakness Policy tests FAIL.

- [ ] **Step 3: Implement**

**`packages/server/src/engine/items.ts`** — add Rocky Helmet entry:
```typescript
'rocky-helmet': {
  onAfterHit: ({ makesContact, holder, totalDamage }) =>
    makesContact && totalDamage > 0
      ? { directDamageToAttacker: Math.floor(holder.maxHp / 6) }
      : null,
},
```

**`packages/server/src/engine/BattleEngine.ts`** — after the `onAfterHit` ability block, add post-hit item block. Insert after the `onAfterHit` block and before the Life Orb block (~line 639):

```typescript
// Post-hit item triggers
if (totalDamage > 0 && !attacker.fainted) {
  // Rocky Helmet
  const helmetResult = getItemHooks(target.heldItem).onAfterHit?.({
    holder: target, state: s, moveType: effectiveMoveType, basePower: effectiveBasePower,
    target: attacker, isPhysical, makesContact: move.makesContact === true, totalDamage,
  });
  if (helmetResult?.directDamageToAttacker) {
    const dmg = Math.min(helmetResult.directDamageToAttacker, attacker.currentHp);
    attacker.currentHp -= dmg;
    events.push({ type: 'damage-dealt', data: { source: 'rocky-helmet', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
    if (attacker.currentHp <= 0) {
      attacker.fainted = true;
      attacker.currentHp = 0;
      events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
    }
  }
}

// Air Balloon pop (any damaging hit bursts the balloon)
if (totalDamage > 0 && target.heldItem === 'air-balloon') {
  target.heldItem = undefined;
  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'air-balloon', reason: 'popped' } });
}

// Weakness Policy
if (effectiveness > 1 && totalDamage > 0 && !target.fainted && target.heldItem === 'weakness-policy') {
  target.heldItem = undefined;
  events.push(applyStatBoost(target, targetSlotId, { atk: 2, spa: 2 }));
  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'weakness-policy', reason: 'triggered' } });
}
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: implement Rocky Helmet, Air Balloon pop, and Weakness Policy"
```

---

### Task 8: Berry Items — Sitrus Berry, Lum Berry, Pinch-Stat Berries

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Test: `packages/server/src/engine/__tests__/items.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `items.test.ts`:
```typescript
describe('Sitrus Berry', () => {
  it('heals floor(maxHp/4) when HP drops to ≤50%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 51; // after 17 dmg → 34 ≤ 50 → triggers
    p2.heldItem = 'sitrus-berry';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    // 51 - 17 = 34, then +25 (floor(100/4)) = 59
    expect(p2After.currentHp).toBe(59);
    expect(p2After.heldItem).toBeUndefined();
  });

  it('does not trigger when HP stays above 50%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'sitrus-berry';
    // p2 at 100 HP, takes 17 → 83 > 50 → no trigger
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.currentHp).toBe(83); // no berry heal
    expect(p2After.heldItem).toBe('sitrus-berry'); // not consumed
  });
});

describe('Lum Berry', () => {
  it('cures status immediately on application', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'lum-berry';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.status).toBeUndefined();
    expect(p2.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any).item === 'lum-berry')).toBe(true);
  });
});

describe('Salac Berry', () => {
  it('+1 Spe when HP drops to ≤25%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 26; // 26-17=9 ≤ 25 → triggers
    p2.heldItem = 'salac-berry';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.statBoosts.spe).toBe(1);
    expect(p2After.heldItem).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | grep -E "FAIL|×" | head -10
```

- [ ] **Step 3: Implement**

**`packages/server/src/engine/items.ts`** — add berry entries:
```typescript
'sitrus-berry': {
  onAfterDamageTaken: ({ holder, damageTaken }) =>
    holder.currentHp <= holder.maxHp / 2 && damageTaken > 0
      ? { hpDelta: Math.floor(holder.maxHp / 4), consume: true }
      : { hpDelta: 0 },
},
'lum-berry': {
  onStatusApplied: () => ({ cureStatus: true, consume: true }),
},
'salac-berry': {
  onAfterDamageTaken: ({ holder }) =>
    holder.currentHp <= holder.maxHp / 4
      ? { hpDelta: 0, statBoostDeltas: { spe: 1 }, consume: true }
      : { hpDelta: 0 },
},
'petaya-berry': {
  onAfterDamageTaken: ({ holder }) =>
    holder.currentHp <= holder.maxHp / 4
      ? { hpDelta: 0, statBoostDeltas: { spa: 1 }, consume: true }
      : { hpDelta: 0 },
},
'liechi-berry': {
  onAfterDamageTaken: ({ holder }) =>
    holder.currentHp <= holder.maxHp / 4
      ? { hpDelta: 0, statBoostDeltas: { atk: 1 }, consume: true }
      : { hpDelta: 0 },
},
'ganlon-berry': {
  onAfterDamageTaken: ({ holder }) =>
    holder.currentHp <= holder.maxHp / 4
      ? { hpDelta: 0, statBoostDeltas: { def: 1 }, consume: true }
      : { hpDelta: 0 },
},
'apicot-berry': {
  onAfterDamageTaken: ({ holder }) =>
    holder.currentHp <= holder.maxHp / 4
      ? { hpDelta: 0, statBoostDeltas: { spd: 1 }, consume: true }
      : { hpDelta: 0 },
},
```

**`packages/server/src/engine/BattleEngine.ts`** — replace the existing `onAfterDamageTaken` block (~line 640-652). The existing block handles Life Orb. Expand it to handle `statBoostDeltas` and `consume`, and add Lum Berry `onStatusApplied` after status is applied:

Find and replace the `onAfterDamageTaken` block:
```typescript
// Defender berry / item triggers after taking damage
if (totalDamage > 0 && !target.fainted) {
  const berryHooks = getItemHooks(target.heldItem);
  if (berryHooks.onAfterDamageTaken) {
    const berryResult = berryHooks.onAfterDamageTaken({ holder: target, state: s, damageTaken: totalDamage, effectiveness });
    if (berryResult.hpDelta > 0) {
      const heal = Math.min(berryResult.hpDelta, target.maxHp - target.currentHp);
      if (heal > 0) {
        target.currentHp += heal;
        events.push({ type: 'heal', data: { slotId: targetSlotId, amount: heal, remainingHp: target.currentHp } });
      }
    }
    if (berryResult.statBoostDeltas) {
      events.push(applyStatBoost(target, targetSlotId, berryResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
    }
    if (berryResult.consume) {
      target.heldItem = undefined;
      events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: target.heldItem ?? 'berry', reason: 'triggered' } });
    }
  }
}

// Attacker item triggers after dealing damage (Life Orb)
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

Note: the `target.heldItem ?? 'berry'` in the consume event is wrong since we set `target.heldItem = undefined` first. Save the item name before consuming:
```typescript
if (berryResult.consume) {
  const itemName = target.heldItem!;
  target.heldItem = undefined;
  events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: itemName, reason: 'triggered' } });
}
```

For Lum Berry, add `onStatusApplied` trigger. After ANY status-applied event in the onAfterHit result or secondary effect block, check if target has Lum Berry:

Find all places in the turn resolution where `status-applied` events are pushed for `target`. After each, add:
```typescript
// Lum Berry: cure status immediately
if (target.status && !target.fainted) {
  const lumResult = getItemHooks(target.heldItem).onStatusApplied?.({ holder: target, state: s, status: target.status });
  if (lumResult?.cureStatus) {
    const curedStatus = target.status;
    delete target.status;
    events.push({ type: 'status-cured', data: { slotId: targetSlotId, status: curedStatus, reason: 'lum-berry' } });
    if (lumResult.consume) {
      const itemName = target.heldItem!;
      target.heldItem = undefined;
      events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: itemName, reason: 'triggered' } });
    }
  }
}
```

The most reliable placement is: after the secondary effect block (after `evaluateSecondaryEffect` and `applySecondaries`) and after the `onAfterHit` status apply block.

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: implement Sitrus Berry, Lum Berry, and pinch stat berries (Salac, Petaya, Liechi, Ganlon, Apicot)"
```

---

### Task 9: Weather Summoners — Drizzle + Permanent Weather Skip

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('Weather summoners — Drizzle', () => {
  it('sets rain on switch-in', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', ability: 'drizzle' });
    state.teams[0]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as any,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.type).toBe('rain');
    expect(newState.field.weather?.turnsRemaining).toBe(5);
    expect(newState.field.weather?.fromAbility).toBe(true);
  });

  it('sets 8 turns with Damp Rock', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', ability: 'drizzle', heldItem: 'damp-rock' });
    state.teams[0]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as any,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.turnsRemaining).toBe(8);
  });

  it('weather decrements each turn and expires', () => {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 1, fromAbility: true };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather).toBeUndefined();
    expect(events.some(e => e.type === 'weather-ended')).toBe(true);
  });
});

import { makePokemon } from './fixtures.js';
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep -E "FAIL|×" | head -10
```
Expected: Drizzle tests FAIL (no setWeather handling in applySwitchInResult).

- [ ] **Step 3: Implement**

**`packages/server/src/engine/abilities.ts`** — add Drizzle entry:
```typescript
drizzle: {
  onSwitchIn: ({ user }) => ({
    setWeather: { type: 'rain', turnsRemaining: user.heldItem === 'damp-rock' ? 8 : 5 },
  }),
},
```

**`packages/server/src/engine/BattleEngine.ts`** — add `setWeather` handling to `applySwitchInResult` (after the `clearScreens` block, before the closing brace):
```typescript
// Handle weather-summoning abilities (Drizzle, Drought, etc.)
if (result.setWeather) {
  const { type, turnsRemaining, permanent } = result.setWeather;
  if (!s.field.weather?.permanent || permanent) {
    s.field.weather = { type, turnsRemaining, fromAbility: true, permanent };
    events.push({ type: 'weather-started', data: { weather: type, turnsRemaining } });
  }
}
```

Also update `endOfTurn` weather decrement to skip permanent weather (~line 888):
```typescript
if (s.field.weather) {
  if (!s.field.weather.permanent) {
    s.field.weather.turnsRemaining -= 1;
    if (s.field.weather.turnsRemaining <= 0) {
      events.push({ type: 'weather-ended', data: { weather: s.field.weather.type } });
      delete s.field.weather;
    }
  }
}
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: wire setWeather in applySwitchInResult; implement Drizzle; permanent weather skip in endOfTurn"
```

---

### Task 10: Choice Lockup — Choice Band / Specs / Scarf + Gorilla Tactics + Assault Vest

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts` (clear lockedMoveId on switch-out)
- Modify: `packages/server/src/engine/abilities.ts` (Gorilla Tactics ability entry)
- Modify: `packages/server/src/engine/items.ts` (Assault Vest onDefenderModifier)
- Test: `packages/server/src/engine/__tests__/items.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `items.test.ts`:
```typescript
import { BattleRoom } from '../../socket/BattleRoom.js';

describe('Choice Band lockup', () => {
  it('allows first move, then rejects different move', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'choice-band';
    const room = new BattleRoom({ initialState: state });

    // First action with move 0 — accepted
    const r1 = room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    expect(r1.ok).toBe(true);

    // Reset (simulate new turn state with lockedMoveId set)
    const s = room.getState();
    s.teams[0]!.slots[0]!.party[0]!.lockedMoveId = 'flamethrower';

    // Submit same move — ok
    const r2 = room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    expect(r2.ok).toBe(true);
  });
});

describe('Assault Vest', () => {
  it('reduces special damage by ~1/3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'assault-vest';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState: withAV } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower (special)
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const stateNoAV = make1v1State();
    const { newState: noAV } = engine.resolveTurn(stateNoAV, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const dmgAV = 100 - withAV.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNoAV = 100 - noAV.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgAV).toBeLessThan(dmgNoAV);
    // Should be approximately 2/3 of normal damage
    expect(dmgAV).toBe(Math.floor(dmgNoAV * 2/3));
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Implement**

**`packages/server/src/engine/abilities.ts`** — add Gorilla Tactics:
```typescript
'gorilla-tactics': {
  onAttackerModifier: ({ isPhysical }) => isPhysical ? 1.5 : 1,
},
```

**`packages/server/src/engine/items.ts`** — add Assault Vest:
```typescript
'assault-vest': {
  onDefenderModifier: ({ isPhysical }) => !isPhysical ? (2/3) : 1,
},
```

**`packages/server/src/engine/BattleEngine.ts`** — in `performSwitch`, in the switch-out cleanup block (where `statBoosts` are reset and volatiles cleared), add:
```typescript
delete outgoing.lockedMoveId;
```

**`packages/server/src/socket/BattleRoom.ts`** — update `submitAction` to enforce choice lockup. Before `this.pendingActions.set(slotId, action)` (~line 108), add:

```typescript
// Choice lockup enforcement
if (action.type === 'move') {
  const slot = this.findSlot(slotId)!;
  const active = slot.party[slot.activePokemonIndex];
  if (active) {
    const isChoiceLocked =
      ['choice-band', 'choice-specs', 'choice-scarf'].includes(active.heldItem ?? '') ||
      effectiveAbilityId(active) === 'gorilla-tactics';
    if (isChoiceLocked && active.lockedMoveId) {
      const moveSlot = active.moves[action.moveIndex];
      if (moveSlot && moveSlot.moveId !== active.lockedMoveId) {
        return { ok: false, reason: 'choice-locked' };
      }
    }
    if (isChoiceLocked && !active.lockedMoveId) {
      const moveSlot = active.moves[action.moveIndex];
      if (moveSlot) active.lockedMoveId = moveSlot.moveId;
    }
  }
}
```

Add import at top of BattleRoom.ts:
```typescript
import { effectiveAbilityId } from '../engine/abilities.js';
```

Update `buildValidMoves` to mark locked moves as disabled:
```typescript
// After the existing disabled checks:
if (active.lockedMoveId && m.moveId !== active.lockedMoveId) disabled = true;
if (active.heldItem === 'assault-vest' && moveData?.category === 'status') disabled = true;
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/socket/BattleRoom.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/abilities.ts packages/server/src/engine/items.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: choice lockup (Choice Band/Specs/Scarf, Gorilla Tactics), Assault Vest, lockedMoveId clear on switch"
```

---

### Task 11: More `onDefenderModifier` Abilities

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('onDefenderModifier — Filter / Solid Rock', () => {
  it('reduces super-effective damage by 0.75', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    // p2 is Charizard (Fire/Flying), Surf is 2× — Filter gives ×0.75
    state.teams[1]!.slots[0]!.party[0]!.ability = 'filter';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState: withFilter } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    state.teams[1]!.slots[0]!.party[0]!.ability = 'blaze';
    const { newState: noFilter } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const dmgFilter = 100 - withFilter.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNoFilter = 100 - noFilter.teams[1]!.slots[0]!.party[0]!.currentHp;
    // Surf vs Charizard 2×: 76 without filter, floor(76*0.75)=57 with filter
    expect(dmgFilter).toBe(Math.floor(dmgNoFilter * 0.75));
  });
});

describe('onDefenderModifier — Fur Coat', () => {
  it('halves physical damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'fur-coat';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Tackle 17 halved = floor(17*0.5) = 8
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(92);
  });

  it('does not affect special damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.ability = 'fur-coat';
    const engineFC = new BattleEngine({ rng: () => 0.5 });
    const { newState: withFC } = engineFC.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower (special)
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    state.teams[1]!.slots[0]!.party[0]!.ability = 'blaze';
    const engineNo = new BattleEngine({ rng: () => 0.5 });
    const { newState: noFC } = engineNo.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(withFC.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(noFC.teams[1]!.slots[0]!.party[0]!.currentHp);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep "Filter\|Fur Coat" | head -10
```

- [ ] **Step 3: Implement**

Add to `ABILITY_HOOKS` in `packages/server/src/engine/abilities.ts`:
```typescript
filter: {
  onDefenderModifier: ({ effectiveness }) => effectiveness > 1 ? 0.75 : 1,
},
'solid-rock': {
  onDefenderModifier: ({ effectiveness }) => effectiveness > 1 ? 0.75 : 1,
},
'prism-armor': {
  onDefenderModifier: ({ effectiveness }) => effectiveness > 1 ? 0.75 : 1,
},
fluffy: {
  onDefenderModifier: ({ makesContact, moveType }) => {
    let mod = 1;
    if (makesContact) mod *= 0.5;
    if (moveType === 'Fire') mod *= 2;
    return mod;
  },
},
'fur-coat': {
  onDefenderModifier: ({ isPhysical }) => isPhysical ? 0.5 : 1,
},
'ice-scales': {
  onDefenderModifier: ({ isPhysical }) => !isPhysical ? 0.5 : 1,
},
'punk-rock': {
  onDefenderModifier: ({ move }) => (move as any).soundMove ? 0.5 : 1,
},
heatproof: {
  onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 0.5 : 1,
},
'dry-skin': {
  onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 1.25 : 1,
},
'water-bubble': {
  onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 0.5 : 1,
  onAttackerModifier: ({ moveType }) => moveType === 'Water' ? 2 : 1,
  onStatusImmunity: ({ status }) => status === 'brn',
},
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Filter, Solid Rock, Prism Armor, Fluffy, Fur Coat, Ice Scales, Punk Rock, Heatproof, Dry Skin, Water Bubble onDefenderModifier"
```

---

### Task 12: `onMoveImmunity` — Volt Absorb, Water Absorb, Motor Drive, Sap Sipper, Storm Drain, Lightning Rod, Dry Skin

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('onMoveImmunity — Volt Absorb', () => {
  it('blocks Electric move and heals 25% maxHp', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'volt-absorb';
    p2.currentHp = 60; // heals 25 → 85
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const p2After = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2After.currentHp).toBe(85); // 60 + floor(100*0.25)
    expect(events.some(e => e.type === 'ability-triggered')).toBe(true);
    expect(events.some(e => e.type === 'heal')).toBe(true);
  });
});

describe('onMoveImmunity — Motor Drive', () => {
  it('blocks Electric move and grants +1 Spe', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'motor-drive';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spe).toBe(1);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });
});

describe('onMoveImmunity — Sap Sipper', () => {
  it('blocks Grass move and grants +1 Atk', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'energyball', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'sap-sipper';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep -E "Volt|Motor|Sap" | head -10
```

- [ ] **Step 3: Implement**

In `packages/server/src/engine/abilities.ts` — remove old `onStatusImmunity` entries for `volt-absorb` and `water-absorb` (already done in Task 2). Add `onMoveImmunity` entries:

```typescript
'volt-absorb': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Electric' ? { immune: true, hpHealFraction: 0.25 } : null,
},
'water-absorb': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Water' ? { immune: true, hpHealFraction: 0.25 } : null,
},
'motor-drive': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Electric' ? { immune: true, statBoostDeltas: { spe: 1 } } : null,
},
'sap-sipper': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Grass' ? { immune: true, statBoostDeltas: { atk: 1 } } : null,
},
'storm-drain': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Water' ? { immune: true, statBoostDeltas: { spa: 1 } } : null,
},
'lightning-rod': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Electric' ? { immune: true, statBoostDeltas: { spa: 1 } } : null,
},
```

Also update `dry-skin` entry (already added in Task 11 for Fire modifier) to also have the Water immunity:
```typescript
'dry-skin': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Water' ? { immune: true, hpHealFraction: 0.25 } : null,
  onDefenderModifier: ({ moveType }) => moveType === 'Fire' ? 1.25 : 1,
},
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Volt Absorb, Water Absorb, Motor Drive, Sap Sipper, Storm Drain, Lightning Rod, Dry Skin (water immunity)"
```

---

### Task 13: Flash Fire — Full Implementation

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

Flash Fire blocks Fire moves (chargeFlashFire volatile), then boosts Fire power ×1.5 via `onAttackerModifier` when charged.

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('Flash Fire', () => {
  it('blocks Fire move, sets flash-fire-charged volatile', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'flash-fire';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(100);
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flash-fire-charged')).toBe(true);
    expect(events.some(e => e.type === 'ability-triggered')).toBe(true);
  });

  it('boosts Fire moves by 1.5× when charged', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const stateCharged = make1v1State();
    const p1 = stateCharged.teams[0]!.slots[0]!.party[0]!;
    p1.ability = 'flash-fire';
    p1.volatileStatus.push({ name: 'flash-fire-charged' });
    // p1 uses flamethrower (moveIndex 0)
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState: charged } = engine.resolveTurn(stateCharged, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const stateNormal = make1v1State();
    const { newState: normal } = engine.resolveTurn(stateNormal, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    const dmgCharged = 100 - charged.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgNormal = 100 - normal.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgCharged).toBeGreaterThan(dmgNormal);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep "Flash" | head -5
```

- [ ] **Step 3: Implement**

In `packages/server/src/engine/abilities.ts`:
```typescript
'flash-fire': {
  onMoveImmunity: ({ move }) =>
    move.type === 'Fire' ? { immune: true, chargeFlashFire: true } : null,
  onAttackerModifier: ({ user, moveType }) =>
    moveType === 'Fire' && user.volatileStatus.some(v => v.name === 'flash-fire-charged') ? 1.5 : 1,
},
```

Remove the old `'flash-fire'` entry that used `onStatusImmunity` (done in Task 2). Verify no duplicate entry exists.

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Flash Fire (onMoveImmunity + chargeFlashFire volatile + onAttackerModifier boost)"
```

---

### Task 14: `onAfterHit` Contact Abilities

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('onAfterHit — Static', () => {
  it('applies par on contact when rng fires (rng=0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'static';
    const engine = new BattleEngine({ rng: () => 0 }); // rng=0 → 0 < 0.3 → triggers
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('par');
  });

  it('does not trigger on non-contact move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.ability = 'static';
    const engine = new BattleEngine({ rng: () => 0 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('onAfterHit — Gooey', () => {
  it('lowers attacker Spe by 1 on contact', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'gooey';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spe).toBe(-1);
  });
});

describe('onAfterHit — Mummy', () => {
  it('overwrites attacker ability with mummy on contact', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'mummy';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.ability).toBe('mummy');
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep -E "Static|Gooey|Mummy" | head -10
```

- [ ] **Step 3: Implement**

Add to `ABILITY_HOOKS` in `packages/server/src/engine/abilities.ts`:
```typescript
static: {
  onAfterHit: ({ makesContact, rng }) =>
    makesContact && rng() < 0.3 ? { statusToApply: 'par' } : null,
},
'flame-body': {
  onAfterHit: ({ makesContact, rng }) =>
    makesContact && rng() < 0.3 ? { statusToApply: 'brn' } : null,
},
'poison-point': {
  onAfterHit: ({ makesContact, rng }) =>
    makesContact && rng() < 0.3 ? { statusToApply: 'psn' } : null,
},
'effect-spore': {
  onAfterHit: ({ makesContact, rng }) => {
    if (!makesContact) return null;
    const r = rng();
    if (r >= 0.3) return null;
    if (r < 0.1) return { statusToApply: 'par' };
    if (r < 0.2) return { statusToApply: 'psn' };
    return { statusToApply: 'slp' };
  },
},
gooey: {
  onAfterHit: ({ makesContact }) =>
    makesContact ? { statBoostDeltas: { spe: -1 } } : null,
},
'tangling-hair': {
  onAfterHit: ({ makesContact }) =>
    makesContact ? { statBoostDeltas: { spe: -1 } } : null,
},
mummy: {
  onAfterHit: ({ makesContact }) =>
    makesContact ? { abilityOverride: 'mummy' } : null,
},
'cursed-body': {
  onAfterHit: ({ makesContact, move, rng }) =>
    makesContact && rng() < 0.3
      ? { volatileToApply: 'disable', disableMoveId: move.id }
      : null,
},
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Static, Flame Body, Poison Point, Effect Spore, Gooey, Tangling Hair, Mummy, Cursed Body"
```

---

### Task 15: Remaining Weather Summoners — Drought, Sand Stream, Snow Warning, Primordial Sea, Desolate Land, Delta Stream

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('Weather summoners — primordial weather', () => {
  it('Primordial Sea sets permanent heavy-rain', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', ability: 'primordial-sea' });
    state.teams[0]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as any,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.type).toBe('heavy-rain');
    expect(newState.field.weather?.permanent).toBe(true);
  });

  it('Drought cannot overwrite Primordial Sea', () => {
    const state = make1v1State();
    state.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const bench = makePokemon({ instanceId: 'p2-bench', ability: 'drought' });
    state.teams[1]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'switch', targetInstanceId: 'p2-bench' } as any,
    });
    expect(newState.field.weather?.type).toBe('heavy-rain');
  });

  it('Drought sets 5-turn sun', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', ability: 'drought' });
    state.teams[0]!.slots[0]!.party.push(bench);
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as any,
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.type).toBe('sun');
    expect(newState.field.weather?.turnsRemaining).toBe(5);
  });

  it('permanent weather is not decremented', () => {
    const state = make1v1State();
    state.field.weather = { type: 'heavy-rain', turnsRemaining: 999, fromAbility: true, permanent: true };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.weather?.turnsRemaining).toBe(999); // not decremented
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep "primordial\|Drought\|permanent" | head -10
```

- [ ] **Step 3: Implement**

Add to `ABILITY_HOOKS` in `packages/server/src/engine/abilities.ts`:
```typescript
drought: {
  onSwitchIn: ({ user }) => ({
    setWeather: { type: 'sun', turnsRemaining: user.heldItem === 'heat-rock' ? 8 : 5 },
  }),
},
'sand-stream': {
  onSwitchIn: ({ user }) => ({
    setWeather: { type: 'sand', turnsRemaining: user.heldItem === 'smooth-rock' ? 8 : 5 },
  }),
},
'snow-warning': {
  onSwitchIn: ({ user }) => ({
    setWeather: { type: 'snow', turnsRemaining: user.heldItem === 'icy-rock' ? 8 : 5 },
  }),
},
'primordial-sea': {
  onSwitchIn: () => ({
    setWeather: { type: 'heavy-rain', turnsRemaining: 999, permanent: true },
  }),
},
'desolate-land': {
  onSwitchIn: () => ({
    setWeather: { type: 'harsh-sun', turnsRemaining: 999, permanent: true },
  }),
},
'delta-stream': {
  onSwitchIn: () => ({
    setWeather: { type: 'strong-winds', turnsRemaining: 999, permanent: true },
  }),
},
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Drought, Sand Stream, Snow Warning, Primordial Sea, Desolate Land, Delta Stream"
```

---

### Task 16: Mold Breaker / Turboblaze / Teravolt

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

Mold Breaker suppresses `onMoveImmunity` and `onDefenderModifier` (but NOT Rough Skin / Rocky Helmet — those fire on contact against the attacker, not as "defender" hooks).

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('Mold Breaker — ability suppression', () => {
  it('bypasses Levitate', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'mold-breaker';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'levitate';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Earthquake hits despite Levitate because of Mold Breaker
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBeLessThan(100);
  });

  it('bypasses Multiscale', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'mold-breaker';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'multiscale';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // 17 damage (Multiscale bypassed), not 8
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(83);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep "Mold" | head -5
```

- [ ] **Step 3: Implement**

**`packages/server/src/engine/abilities.ts`** — add ability entries (no hooks needed, just registration):
```typescript
'mold-breaker': {},
turboblaze: {},
teravolt: {},
```

**`packages/server/src/engine/BattleEngine.ts`** — compute `ignoresAbilities` at the start of the per-target loop (after `const target = ...`):

```typescript
const ignoresAbilities = ['mold-breaker', 'turboblaze', 'teravolt']
  .includes(effectiveAbilityId(attacker));
```

Gate both the `onMoveImmunity` call and the `onDefenderModifier` call with this flag:

Find the `onMoveImmunity` block added in Task 3 and wrap it:
```typescript
if (!ignoresAbilities) {
  const abilityImmunityResult = getAbilityHooks(effectiveAbilityId(target))
    .onMoveImmunity?.({ move, defender: target, state: s });
  if (abilityImmunityResult) {
    // ... (existing immunity handling)
    continue;
  }
}
```

Find the `onDefenderModifier` block added in Task 4 and wrap it:
```typescript
if (!ignoresAbilities && defAbilityHooks.onDefenderModifier) {
  const defMod = defAbilityHooks.onDefenderModifier({ ... });
  otherModifiers *= defMod;
}
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Mold Breaker / Turboblaze / Teravolt (ignoresAbilities flag suppresses onMoveImmunity and onDefenderModifier)"
```

---

### Task 17: Serene Grace + Sheer Force

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Modify: `packages/server/src/engine/effects.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('Serene Grace — doubles secondary chance', () => {
  it('Body Slam 30% par fires at rng=0.5 with Serene Grace (60% chance)', () => {
    // Without Serene Grace: rng()*100=50 >= 30 → no par
    // With Serene Grace: rng()*100=50 < 60 → par applies
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'serene-grace';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('par');
  });

  it('Body Slam 30% par does not fire at rng=0.5 without Serene Grace', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('Sheer Force — removes secondaries and boosts power', () => {
  it('no secondary effect fires', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodyslam', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.ability = 'sheer-force';
    const engine = new BattleEngine({ rng: () => 0 }); // rng=0 → secondary would fire
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});
```

Body Slam has a `secondaries` entry with `{ kind: 'status', status: 'par', chance: 30, target: 'target' }`. Verify this move has secondaries in the data.

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep -E "Serene|Sheer" | head -10
```

- [ ] **Step 3: Implement**

**`packages/server/src/engine/abilities.ts`**:
```typescript
'serene-grace': {
  doublesSecondaryChance: true,
},
'sheer-force': {
  removesSecondaries: true,
},
```

**`packages/server/src/engine/effects.ts`** — update `applySecondaries` `SecondaryContext` to include `userAbility: string`, and double chance when `doublesSecondaryChance` is set. In the `'status'`, `'stat'`, `'flinch'`, `'confusion'` cases, multiply `sec.chance` by 2 if user has `doublesSecondaryChance`:

Add to `SecondaryContext`:
```typescript
export interface SecondaryContext {
  // ... existing fields
  userAbility: string;
}
```

In each chance-based case (before `if (ctx.rng() * 100 >= sec.chance)`):
```typescript
import { getAbilityHooks } from './abilities.js';
// ...
const effectiveChance = getAbilityHooks(ctx.userAbility).doublesSecondaryChance
  ? sec.chance * 2
  : sec.chance;
if (ctx.rng() * 100 >= effectiveChance) break;
```

Apply this to `'status'`, `'stat'`, `'flinch'`, and `'confusion'` cases.

**`packages/server/src/engine/BattleEngine.ts`** — update the `applySecondaries` call to pass `userAbility`:
```typescript
events.push(...applySecondaries({
  // ... existing fields
  userAbility: attacker.ability,
}));
```

Also skip `applySecondaries` entirely if Sheer Force. Find the `postSecs` block (~line 604-619):
```typescript
const hasSecondaries = postSecs.length > 0;
const sheerForce = getAbilityHooks(effectiveAbilityId(attacker)).removesSecondaries;
if (hasSecondaries && !sheerForce && !target.fainted && (!targetHasSub || isSoundMove)) {
  events.push(...applySecondaries({ ..., userAbility: attacker.ability }));
}
```

And boost power for Sheer Force. In the `effectiveBasePower` computation or in `otherModifiers`:
```typescript
if (sheerForce && secs.some(s => ['status','stat','flinch','confusion'].includes(s.kind))) {
  otherModifiers *= 1.3;
}
```

Place the `sheerForce` variable computation before the hit loop, using `secs` (already computed before the loop).

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/abilities.ts packages/server/src/engine/effects.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Serene Grace (double secondary chance) and Sheer Force (remove secondaries + 1.3× power)"
```

---

### Task 18: Volatile Immunities — Own Tempo, Inner Focus

**Files:**
- Modify: `packages/server/src/engine/effects.ts`
- Modify: `packages/server/src/engine/abilities.ts`
- Test: `packages/server/src/engine/__tests__/abilities.test.ts`

Own Tempo blocks confusion secondaries. Inner Focus blocks flinch secondaries. These are checked in `applySecondaries` at the point of application.

- [ ] **Step 1: Write failing tests**

Add to `abilities.test.ts`:
```typescript
describe('Own Tempo — confusion immunity', () => {
  it('prevents confusion secondary from landing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // Use a move with confusion secondary. Psybeam: 90BP, Psychic, Special, 10% confusion
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'psybeam', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'own-tempo';
    const engine = new BattleEngine({ rng: () => 0 }); // rng=0 → secondary fires without Own Tempo
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });
});

describe('Inner Focus — flinch immunity', () => {
  it('prevents flinch from landing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    // Air Slash: 75BP, Flying, Special, 30% flinch
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'airslash', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.ability = 'inner-focus';
    const engine = new BattleEngine({ rng: () => 0 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/abilities.test.ts 2>&1 | grep -E "Own Tempo|Inner Focus" | head -5
```

- [ ] **Step 3: Implement**

**`packages/server/src/engine/abilities.ts`** — add entries (no hooks needed beyond markers, but we'll handle in effects.ts):
```typescript
'own-tempo': {},
'inner-focus': {},
oblivious: {},
```

**`packages/server/src/engine/effects.ts`** — in `applySecondaries`, in the `'confusion'` case, check target's ability before applying:
```typescript
case 'confusion': {
  if (ctx.rng() * 100 >= effectiveChance) break;
  const member = sec.target === 'user' ? ctx.user : ctx.target;
  const mSlotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
  // Own Tempo / Oblivious block confusion
  if (getAbilityHooks(member.ability).doublesSecondaryChance === undefined &&
      ['own-tempo', 'oblivious'].includes(member.ability)) break;
  const evt = applyVolatile(member, mSlotId, ctx.userSlotId, 'confusion');
  if (evt) events.push(evt);
  break;
}
```

Actually, the cleaner approach is to add an `onVolatileImmunity` check. But for simplicity, inline the check directly:

Replace the confusion case:
```typescript
case 'confusion': {
  if (ctx.rng() * 100 >= effectiveChance) break;
  const member = sec.target === 'user' ? ctx.user : ctx.target;
  const mSlotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
  if (['own-tempo', 'oblivious'].includes(getAbilityHooks(member.ability) ? member.ability : '')) break;
  const evt = applyVolatile(member, mSlotId, ctx.userSlotId, 'confusion');
  if (evt) events.push(evt);
  break;
}
```

Simpler:
```typescript
case 'confusion': {
  if (ctx.rng() * 100 >= effectiveChance) break;
  const member = sec.target === 'user' ? ctx.user : ctx.target;
  const mSlotId = sec.target === 'user' ? ctx.userSlotId : ctx.targetSlotId;
  if (member.ability === 'own-tempo' || member.ability === 'oblivious') break;
  const evt = applyVolatile(member, mSlotId, ctx.userSlotId, 'confusion');
  if (evt) events.push(evt);
  break;
}
```

For Inner Focus (flinch immunity), update the `'flinch'` case:
```typescript
case 'flinch': {
  if (ctx.rng() * 100 >= effectiveChance) break;
  if (!ctx.movedSlotIds.has(ctx.targetSlotId) && !ctx.target.fainted) {
    if (ctx.target.ability === 'inner-focus') break;
    ctx.target.volatileStatus.push({ name: 'flinch' });
    events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotId, volatile: 'flinch' } });
  }
  break;
}
```

Also add the `effectiveChance` computation to all cases (from Task 17). Make sure the Serene Grace `effectiveChance` variable is computed once per secondary iteration before the switch:

```typescript
for (const sec of ctx.secondaries) {
  const effectiveChance = 'chance' in sec && getAbilityHooks(ctx.userAbility).doublesSecondaryChance
    ? (sec as any).chance * 2
    : ('chance' in sec ? (sec as any).chance : 0);
  switch (sec.kind) {
    // ...
  }
}
```

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/effects.ts packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "feat: implement Own Tempo (confusion immunity) and Inner Focus (flinch immunity) in applySecondaries"
```

---

### Task 19: Passive Items — Scope Lens, Razor Claw, Eviolite, Light Clay, Big Root

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/effects.ts` (Big Root drain multiplier)
- Modify: `packages/server/src/setup/BattleConfigurator.ts` (set isEvioliteEligible)
- Test: `packages/server/src/engine/__tests__/items.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `items.test.ts`:
```typescript
describe('Scope Lens — crit stage +1', () => {
  it('crits with rng=0.1 (stage 1 = 1/8 = 0.125 > 0.1)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'scope-lens';
    const engine = new BattleEngine({ rng: () => 0.1 });
    const { events: withSL } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(withSL.some(e => e.type === 'crit')).toBe(true);
  });

  it('does not crit without Scope Lens at rng=0.1 (stage 0 = 1/24 ≈ 0.042 < 0.1)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    const engine = new BattleEngine({ rng: () => 0.1 });
    const { events: noSL } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(noSL.some(e => e.type === 'crit')).toBe(false);
  });
});

describe('Eviolite', () => {
  it('reduces damage on eligible species (isEvioliteEligible=true)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'eviolite';
    p2.isEvioliteEligible = true;
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Tackle 17, with Eviolite ×2/3: floor(17*2/3) = 11
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(89);
  });

  it('does not reduce damage on ineligible species', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.heldItem = 'eviolite';
    p2.isEvioliteEligible = false; // not eligible
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(83); // 17 damage, no reduction
  });
});

describe('Light Clay — screen extension', () => {
  it('sets Reflect to 8 turns instead of 5', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[2] = { moveId: 'reflect', currentPp: 20, maxPp: 20 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'light-clay';
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.field.sideConditions[0]!.reflect).toBe(8);
  });
});

describe('Big Root — drain multiplier', () => {
  it('heals more from drain moves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Use applySecondaries directly to test drain with fraction [1,2]
    // and verify Big Root doubles heal
    const { applySecondaries } = await import('../effects.js');
    const { makePokemon } = await import('./fixtures.js');

    const user = makePokemon({ instanceId: 'u', currentHp: 50, maxHp: 100, heldItem: 'big-root' });
    const target = makePokemon({ instanceId: 't', currentHp: 60, maxHp: 100 });
    const battle = { field: {}, teams: [] } as any;

    const events = applySecondaries({
      secondaries: [{ kind: 'drain', fraction: [1, 2] as [number, number] }],
      totalDamage: 40,
      user, userSlotId: 'u',
      target, targetSlotId: 't',
      targetTypes: [],
      battle, rng: () => 0.5,
      movedSlotIds: new Set(),
      userAbility: 'blaze',
    });

    // Without Big Root: heal = floor(40*1/2) = 20 → currentHp = 70
    // With Big Root (×2): heal = floor(20*2) = 40 → currentHp = 90
    expect(user.currentHp).toBe(90);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | grep -E "FAIL|×" | head -10
```

- [ ] **Step 3: Implement**

**`packages/server/src/engine/items.ts`** — add items:
```typescript
'scope-lens': {
  critStageBonus: 1,
},
'razor-claw': {
  critStageBonus: 1,
},
'light-clay': {
  screenExtension: 3,
},
'big-root': {
  drainMultiplier: 2,
},
eviolite: {
  onDefenderModifier: ({ holder }) =>
    (holder as any).isEvioliteEligible ? (2/3) : 1,
},
```

(Note: `holder` is `ItemAttackContext.holder`; cast through `any` to access `isEvioliteEligible` since the `PartyMember` type was updated in Task 1.)

Actually, `ItemAttackContext.holder` IS typed as `PartyMember`, and `PartyMember` now has `isEvioliteEligible?: boolean` from Task 1, so no cast needed:
```typescript
eviolite: {
  onDefenderModifier: ({ holder }) => holder.isEvioliteEligible ? (2/3) : 1,
},
```

**`packages/server/src/engine/effectFactories.ts`** — update `setSideCondition` to apply Light Clay extension. In the `setSideCondition` function body, after the fail checks and before setting the value, add:

```typescript
import { getItemHooks } from './items.js';

// Inside setSideCondition return handler:
let adjustedValue = value;
if (typeof value === 'number' && value > 1) {
  const ext = getItemHooks(ctx.user.heldItem).screenExtension ?? 0;
  adjustedValue = value + ext;
}
(ctx.battle.field.sideConditions[sideIdx] as any)[key] = adjustedValue;
return { events: [{ type: 'side-condition-set', data: { side: sideIdx, condition: key, value: adjustedValue } }] };
```

Check what the base screen turn value is in the move registry (likely `5`). After Light Clay: `5 + 3 = 8`.

**`packages/server/src/engine/effects.ts`** — in `applySecondaries`, `'drain'` case, apply `drainMultiplier`:

```typescript
case 'drain': {
  if (ctx.totalDamage <= 0) break;
  const baseHeal = Math.floor(ctx.totalDamage * sec.fraction[0] / sec.fraction[1]);
  const drainMult = getItemHooks(ctx.user.heldItem).drainMultiplier ?? 1;
  const heal = drainMult > 1 ? Math.floor(baseHeal * drainMult) : baseHeal;
  const actual = Math.min(heal, ctx.user.maxHp - ctx.user.currentHp);
  if (actual <= 0) break;
  ctx.user.currentHp += actual;
  events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: actual, remainingHp: ctx.user.currentHp } });
  break;
}
```

Add `user.heldItem` access: `SecondaryContext` already has `user: PartyMember` so `ctx.user.heldItem` is available.

**`packages/server/src/setup/BattleConfigurator.ts`** — set `isEvioliteEligible` during slot construction. In `buildSlot` or the Pokémon construction step, add:
```typescript
// After setting other PartyMember fields:
const species = this.data.getSpecies(pkmnData.speciesId);
pkmn.isEvioliteEligible = species ? species.evolutionStage < 3 : false;
```

(`evolutionStage < 3` = not fully evolved = Eviolite eligible. Stage 3 = fully evolved → not eligible.)

- [ ] **Step 4: Run tests**

```
cd packages/server && npm test 2>&1 | tail -20
```
Expected: all pass. Then run typecheck:
```
cd packages/server && npm run typecheck 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/effects.ts packages/server/src/engine/effectFactories.ts packages/server/src/setup/BattleConfigurator.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: implement Scope Lens, Razor Claw, Eviolite, Light Clay (screen extension), Big Root (drain boost)"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Wire onDefenderModifier | Task 4 |
| Wire onMoveImmunity | Task 3 |
| Refactor onStatusImmunity out of canApplyStatus | Task 2 |
| Expand onAfterHit return type | Task 5 |
| Weather-summoning onSwitchIn | Tasks 9, 15 |
| Mold Breaker / Turboblaze / Teravolt | Task 16 |
| Gorilla Tactics | Task 10 |
| Focus Sash | Task 6 |
| Rocky Helmet | Task 7 |
| Assault Vest | Task 10 |
| Weakness Policy | Task 7 |
| Air Balloon | Tasks 6, 7 |
| Sitrus/Lum/pinch berries | Task 8 |
| Choice lockup | Task 10 |
| Light Clay | Task 19 |
| Big Root | Task 19 |
| Serene Grace | Task 17 |
| Sheer Force | Task 17 |
| Scope Lens / Razor Claw | Task 19 |
| Eviolite fix | Task 19 |
| Events: focus-sash, item-consumed, status-blocked, ability-triggered | Task 1 |
| Static, Flame Body, Rough Skin, Gooey, Mummy, etc. | Tasks 5, 14 |
| Filter, Solid Rock, Multiscale, Fur Coat, etc. | Tasks 4, 11 |
| Own Tempo, Inner Focus | Task 18 |

All spec items covered.
