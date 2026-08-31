# Switching Mechanics 7.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all switch-correctness gaps in the engine and BattleRoom — volatile/boost cleanup on all paths, `onSwitchOut` ability hooks, Download/Trace/Screen Cleaner `onSwitchIn`, a unified forced-switch path, and the `pokemon-switched` event type.

**Architecture:** A private `performSwitch` helper in `BattleEngine` becomes the single source of truth for all switch logic (voluntary, forced, phased). `BattleEngine.processForceSwitch` is the new public API for forced switches; `BattleRoom.submitAction` delegates to it instead of duplicating logic. Ability hooks are extended with `onSwitchOut` and a richer `onSwitchIn` return type.

**Tech Stack:** TypeScript, Vitest (`pnpm test` from root, or `cd packages/server && npx vitest run` for server-only), structuredClone for state immutability.

---

## File Map

| File | Change |
|---|---|
| `packages/shared/src/types/events.ts` | Add `pokemon-switched` to `TurnResolveEvent` |
| `packages/shared/src/types/battle.ts` | Add `tracedAbilityId?: string` to `PartyMember` |
| `packages/server/src/engine/volatileClearRules.ts` | Remove `'toxic'` from `SWITCH_CLEAR_NAMES` |
| `packages/server/src/engine/abilities.ts` | New types: `SwitchInContext`, `SwitchInResult`, `SwitchContext`, `SwitchOutResult`; extend `AbilityHooks` with `onSwitchOut`; add `effectiveAbilityId` helper; implement Regenerator, Natural Cure, Slow Start, Truant, Download, Trace, Screen Cleaner |
| `packages/server/src/engine/BattleEngine.ts` | Extract private `performSwitch`; add public `processForceSwitch`; fix hazard/hook ordering; wire `onSwitchOut` |
| `packages/server/src/socket/BattleRoom.ts` | Change `awaitingForcedSwitches` to `Map<string, 'forced' \| 'phased'>`; replace inline forced-switch block with `engine.processForceSwitch` call |
| `packages/client/src/battle/BattleContext.tsx` | Add `pokemon-switched` case to `eventToText`; remove old `volatile-applied note:'switch'` path |
| `packages/server/src/engine/__tests__/switching.test.ts` | New test file — all switch engine tests |
| `packages/server/src/socket/__tests__/BattleRoom.test.ts` | Add forced-switch tests |
| `packages/client/src/battle/__tests__/BattleContext.test.tsx` | Update `volatile-applied note:'switch'` assertion to `pokemon-switched` |

---

## Task 1: Type scaffolding

**Files:**
- Modify: `packages/shared/src/types/events.ts`
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/server/src/engine/abilities.ts`

- [ ] **Step 1: Add `pokemon-switched` to `TurnResolveEvent`**

In `packages/shared/src/types/events.ts`, add to the `type` union inside `TurnResolveEvent` (after `'court-change'`):

```typescript
| 'pokemon-switched'
```

The full union now ends with:
```typescript
    | 'hazard-cleared'
    | 'court-change'
    | 'pokemon-switched';
```

- [ ] **Step 2: Add `tracedAbilityId` to `PartyMember`**

In `packages/shared/src/types/battle.ts`, add after `lastMoveId?: string;` (line 54):

```typescript
  tracedAbilityId?: string;
```

- [ ] **Step 3: Add new types and extend `AbilityHooks` in abilities.ts**

Replace the contents of `packages/server/src/engine/abilities.ts` with:

```typescript
import type { PartyMember, BattleState, PokemonType, StatBoosts, TurnResolveEvent } from '@poke-fighter/shared';

export interface AbilityContext {
  user: PartyMember;
  state: BattleState;
}

export interface AttackContext extends AbilityContext {
  moveType: PokemonType;
  basePower: number;
  target: PartyMember;
}

export interface SwitchInContext {
  user: PartyMember;
  state: BattleState;
  slotId: string;
}

export interface SwitchInResult {
  statBoostDeltas?: Partial<StatBoosts>;      // applied to all active foes (Intimidate)
  selfBoostDeltas?: Partial<StatBoosts>;      // applied to switching-in Pokémon (Download)
  traceAbilityId?: string;                   // sets tracedAbilityId on incoming Pokémon (Trace)
  clearScreens?: boolean;                    // removes Reflect/Light Screen/Aurora Veil from both sides (Screen Cleaner)
}

export interface SwitchContext {
  battle: BattleState;
  slotId: string;
  pokemon: PartyMember;
}

export interface SwitchOutResult {
  hpDelta?: number;        // positive = heal amount (Regenerator)
  clearStatus?: boolean;   // true = clear status condition (Natural Cure)
  events: TurnResolveEvent[];
}

export interface AbilityHooks {
  onAttackerModifier?: (ctx: AttackContext) => number;
  onDefenderModifier?: (ctx: AttackContext) => number;
  onDamageModifier?: (ctx: AttackContext) => number;
  onSwitchIn?: (ctx: SwitchInContext) => SwitchInResult | null;
  onSwitchOut?: (ctx: SwitchContext) => SwitchOutResult | null;
  onAfterHit?: (ctx: AttackContext & { isPhysical: boolean }) => { statusToApply?: string } | null;
  onStatusImmunity?: (ctx: AbilityContext & { status: string }) => boolean;
  onWeatherImmunity?: (ctx: AbilityContext & { weather: string }) => boolean;
  onSpeedModifier?: (ctx: AbilityContext) => number;
}

const ABILITY_HOOKS: Record<string, AbilityHooks> = {
  intimidate: {
    onSwitchIn: () => ({ statBoostDeltas: { atk: -1 } }),
  },
  levitate: {
    onStatusImmunity: ({ status }) => status === 'Ground',
  },
  'thick-fat': {
    onDamageModifier: ({ moveType }) =>
      moveType === 'Fire' || moveType === 'Ice' ? 0.5 : 1,
  },
  'flash-fire': {
    onStatusImmunity: ({ status }) => status === 'Fire',
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

export function effectiveAbilityId(pokemon: PartyMember): string {
  return pokemon.tracedAbilityId ?? pokemon.ability;
}
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/server && npx tsc --noEmit
```

Expected: no errors (the `onSwitchIn` signature changed from `AbilityContext` to `SwitchInContext` — BattleEngine.ts line 684 will error until Task 5; that is expected).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/events.ts packages/shared/src/types/battle.ts packages/server/src/engine/abilities.ts
git commit -m "feat(types): add pokemon-switched event, tracedAbilityId, onSwitchOut hook types"
```

---

## Task 2: Toxic counter persistence (FR-2)

**Files:**
- Modify: `packages/server/src/engine/volatileClearRules.ts`
- Create: `packages/server/src/engine/__tests__/switching.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/engine/__tests__/switching.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { SwitchAction } from '@poke-fighter/shared';

function makeStateWithBench() {
  const state = make1v1State();
  // Give slot-a1 a bench member so a switch is valid
  const bench = makePokemon({ instanceId: 'p1-bench' });
  state.teams[0]!.slots[0]!.party.push(bench);
  return state;
}

describe('switch-out cleanup', () => {
  it('clears confusion volatile on switch-out', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'confusion' }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });

  it('resets stat boosts on switch-out', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.atk = 3;
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.statBoosts.atk).toBe(0);
  });

  it('toxic counter volatile persists through switch-out (Gen 5+ behavior)', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.status = 'tox';
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'toxic', counter: 3 }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    const toxEntry = outgoing.volatileStatus.find(v => v.name === 'toxic');
    expect(toxEntry).toBeDefined();
    expect(toxEntry!.counter).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test and confirm the toxic counter test fails**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: first two tests PASS (existing behavior), third test FAILS (toxic is currently cleared).

- [ ] **Step 3: Remove `'toxic'` from `SWITCH_CLEAR_NAMES`**

In `packages/server/src/engine/volatileClearRules.ts`, change:

```typescript
export const SWITCH_CLEAR_NAMES = new Set([
  'confusion', 'leech-seed', 'bound', 'yawn',
  'taunt', 'encore', 'disable', 'torment',
  'magnet-rise', 'embargo', 'heal-block',
  'aqua-ring', 'focus-energy', 'focusenergy',
  'protect', 'protect-streak',
  'recharge', 'flinch', 'roost',
  'foresight', 'miracle-eye',
  'destiny-bond', 'endure',
  'substitute',
  'toxic', 'sleep',
]);
```

to:

```typescript
export const SWITCH_CLEAR_NAMES = new Set([
  'confusion', 'leech-seed', 'bound', 'yawn',
  'taunt', 'encore', 'disable', 'torment',
  'magnet-rise', 'embargo', 'heal-block',
  'aqua-ring', 'focus-energy', 'focusenergy',
  'protect', 'protect-streak',
  'recharge', 'flinch', 'roost',
  'foresight', 'miracle-eye',
  'destiny-bond', 'endure',
  'substitute',
  'sleep',
]);
```

- [ ] **Step 4: Run tests and confirm all three pass**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: all 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/volatileClearRules.ts packages/server/src/engine/__tests__/switching.test.ts
git commit -m "feat(engine): toxic counter persists through switch-out (Gen 5+)"
```

---

## Task 3: `onSwitchOut` — Regenerator and Natural Cure (FR-3, FR-4)

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/switching.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `switching.test.ts`:

```typescript
describe('onSwitchOut ability hooks', () => {
  it('Regenerator heals 1/3 max HP on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'regenerator';
    mon.currentHp = 40;
    mon.maxHp = 100;
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.currentHp).toBe(73); // 40 + floor(100/3) = 40 + 33
    expect(events.some(e => e.type === 'heal' && e.data['reason'] === 'regenerator')).toBe(true);
  });

  it('Regenerator does not overheal past max HP', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'regenerator';
    mon.currentHp = 95;
    mon.maxHp = 100;
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.currentHp).toBe(100);
  });

  it('Natural Cure clears status on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'natural-cure';
    mon.status = 'brn';
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured' && e.data['reason'] === 'natural-cure')).toBe(true);
  });

  it('Natural Cure does nothing if Pokémon has no status', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.ability = 'natural-cure';
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'status-cured')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: new 4 tests FAIL.

- [ ] **Step 3: Implement Regenerator and Natural Cure in `ABILITY_HOOKS`**

In `packages/server/src/engine/abilities.ts`, add to `ABILITY_HOOKS` (after the `chlorophyll` entry):

```typescript
  regenerator: {
    onSwitchOut: ({ pokemon }) => {
      const heal = Math.min(
        Math.floor(pokemon.maxHp / 3),
        pokemon.maxHp - pokemon.currentHp,
      );
      if (heal <= 0) return null;
      return {
        hpDelta: heal,
        events: [{ type: 'heal', data: { reason: 'regenerator', amount: heal } }],
      };
    },
  },
  'natural-cure': {
    onSwitchOut: ({ pokemon }) => {
      if (!pokemon.status) return null;
      return {
        clearStatus: true,
        events: [{ type: 'status-cured', data: { status: pokemon.status, reason: 'natural-cure' } }],
      };
    },
  },
```

- [ ] **Step 4: Wire `onSwitchOut` into `executeSwitch` in `BattleEngine.ts`**

In `packages/server/src/engine/BattleEngine.ts`, update the abilities import at the top:

```typescript
import { getAbilityHooks, effectiveAbilityId } from './abilities.js';
import type { SwitchInResult } from './abilities.js';
```

Then, in `executeSwitch` (around line 668), **before** the existing volatile/boost cleanup block, add:

```typescript
    // Fire onSwitchOut before clearing state
    if (outgoing) {
      const outHooks = getAbilityHooks(effectiveAbilityId(outgoing));
      const switchOutResult = outHooks.onSwitchOut?.({ battle: s, slotId, pokemon: outgoing });
      if (switchOutResult) {
        if (switchOutResult.hpDelta) {
          outgoing.currentHp = Math.min(outgoing.maxHp, outgoing.currentHp + switchOutResult.hpDelta);
        }
        if (switchOutResult.clearStatus) {
          delete outgoing.status;
        }
        events.push(...switchOutResult.events);
      }
    }
```

The full `executeSwitch` body after the outgoing/previousMon assignment should now read:

```typescript
    // Fire onSwitchOut before clearing state
    if (outgoing) {
      const outHooks = getAbilityHooks(effectiveAbilityId(outgoing));
      const switchOutResult = outHooks.onSwitchOut?.({ battle: s, slotId, pokemon: outgoing });
      if (switchOutResult) {
        if (switchOutResult.hpDelta) {
          outgoing.currentHp = Math.min(outgoing.maxHp, outgoing.currentHp + switchOutResult.hpDelta);
        }
        if (switchOutResult.clearStatus) {
          delete outgoing.status;
        }
        events.push(...switchOutResult.events);
      }
    }

    // Clear switch-out volatiles and stat boosts before updating active index
    if (outgoing) {
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
        !SWITCH_CLEAR_NAMES.has(v.name) &&
        !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
      );
      outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      delete outgoing.lastMoveId;
    }
```

Also update the `onSwitchIn` call on line ~684 to pass `slotId` (the signature changed from `AbilityContext` to `SwitchInContext`):

```typescript
      const switchInResult = incomingAbilityHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
```

- [ ] **Step 5: Run tests — all should pass**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Run full server tests to check for regressions**

```bash
cd packages/server && npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/engine/abilities.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/switching.test.ts
git commit -m "feat(engine): add onSwitchOut hook; implement Regenerator, Natural Cure"
```

---

## Task 4: Slow Start and Truant `onSwitchOut` (FR-4)

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Modify: `packages/server/src/engine/__tests__/switching.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `switching.test.ts`:

```typescript
describe('onSwitchOut — ability-applied volatile removal', () => {
  it('Slow Start volatile is removed on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'slow-start';
    mon.volatileStatus = [{ name: 'slow-start', turnsRemaining: 3 }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'slow-start')).toBe(false);
  });

  it('Truant volatile is removed on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'truant';
    mon.volatileStatus = [{ name: 'truant' }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'truant')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Implement Slow Start and Truant `onSwitchOut`**

In `packages/server/src/engine/abilities.ts`, add to `ABILITY_HOOKS` (after `'natural-cure'`):

```typescript
```

The actual volatile removal for `slow-start` and `truant` is done by the engine's `ABILITY_VOLATILE_CLEAR` set in `performSwitch` (added in Task 5). No ability hook registration is needed — the volatile removal is handled unconditionally in `performSwitch` for any Pokémon with those volatiles, regardless of ability. Proceed directly to updating the engine.

In `BattleEngine.ts`, after applying the `SwitchOutResult` (in the `onSwitchOut` block added in Task 3), add ability-specific volatile removal for `slow-start` and `truant`. Replace the onSwitchOut block with:

```typescript
    // Fire onSwitchOut before clearing state
    if (outgoing) {
      const outHooks = getAbilityHooks(effectiveAbilityId(outgoing));
      const switchOutResult = outHooks.onSwitchOut?.({ battle: s, slotId, pokemon: outgoing });
      if (switchOutResult) {
        if (switchOutResult.hpDelta) {
          outgoing.currentHp = Math.min(outgoing.maxHp, outgoing.currentHp + switchOutResult.hpDelta);
        }
        if (switchOutResult.clearStatus) {
          delete outgoing.status;
        }
        events.push(...switchOutResult.events);
      }
      // Remove ability-applied volatiles that do not appear in SWITCH_CLEAR_NAMES
      const ABILITY_VOLATILE_CLEAR = new Set(['slow-start', 'truant']);
      outgoing.volatileStatus = outgoing.volatileStatus.filter(
        v => !ABILITY_VOLATILE_CLEAR.has(v.name)
      );
    }
```

> Note: `ABILITY_VOLATILE_CLEAR` is defined inline here. If this list grows significantly in later docs, extract it to `volatileClearRules.ts`.

- [ ] **Step 4: Run the tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/abilities.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/switching.test.ts
git commit -m "feat(engine): Slow Start and Truant volatiles cleared on switch-out"
```

---

## Task 5: Extract `performSwitch`, fix hazard ordering, add `pokemon-switched` event (FR-1, FR-6, FR-14)

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/switching.test.ts`

This task refactors `executeSwitch` into a private `performSwitch` helper, fixes the hazard/hook ordering (hazards must fire before `onSwitchIn` ability hooks per FR-6), and replaces the `volatile-applied note:'switch'` event with `pokemon-switched`.

- [ ] **Step 1: Write the failing test for the event type**

Append to `switching.test.ts`:

```typescript
describe('pokemon-switched event (FR-14)', () => {
  it('voluntary switch emits pokemon-switched event with reason: voluntary', () => {
    const state = makeStateWithBench();
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const switchEvent = events.find(e => e.type === 'pokemon-switched');
    expect(switchEvent).toBeDefined();
    expect(switchEvent!.data['reason']).toBe('voluntary');
    expect(switchEvent!.data['inInstanceId']).toBe('p1-bench');
  });

  it('does not emit volatile-applied with note:switch', () => {
    const state = makeStateWithBench();
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const oldEvent = events.find(
      e => e.type === 'volatile-applied' && e.data['note'] === 'switch'
    );
    expect(oldEvent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Refactor `executeSwitch` into `performSwitch` + add `processForceSwitch`**

In `packages/server/src/engine/BattleEngine.ts`, replace the `executeSwitch` method (lines 656-717) with the following three methods:

```typescript
  public processForceSwitch(
    state: BattleState,
    slotId: string,
    targetInstanceId: string,
    reason: 'forced' | 'phased',
  ): TurnResult {
    return this.performSwitch(state, slotId, targetInstanceId, reason);
  }

  private executeSwitch(state: BattleState, slotId: string, targetInstanceId: string): TurnResult {
    return this.performSwitch(state, slotId, targetInstanceId, 'voluntary');
  }

  private performSwitch(
    state: BattleState,
    slotId: string,
    targetInstanceId: string,
    reason: 'voluntary' | 'forced' | 'phased',
  ): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);
    const slot = this.findSlot(s, slotId);
    if (!slot) return { newState: s, events };
    const newIndex = slot.party.findIndex((p) => p.instanceId === targetInstanceId);
    if (newIndex === -1 || slot.party[newIndex]?.fainted) return { newState: s, events };

    const outgoing = slot.party[slot.activePokemonIndex];
    const outInstanceId = outgoing?.instanceId;

    // 1. Fire onSwitchOut before clearing state
    if (outgoing) {
      const outHooks = getAbilityHooks(effectiveAbilityId(outgoing));
      const switchOutResult = outHooks.onSwitchOut?.({ battle: s, slotId, pokemon: outgoing });
      if (switchOutResult) {
        if (switchOutResult.hpDelta) {
          outgoing.currentHp = Math.min(outgoing.maxHp, outgoing.currentHp + switchOutResult.hpDelta);
        }
        if (switchOutResult.clearStatus) {
          delete outgoing.status;
        }
        events.push(...switchOutResult.events);
      }
      // Remove ability-applied volatiles not in SWITCH_CLEAR_NAMES
      const ABILITY_VOLATILE_CLEAR = new Set(['slow-start', 'truant']);
      outgoing.volatileStatus = outgoing.volatileStatus.filter(
        v => !ABILITY_VOLATILE_CLEAR.has(v.name)
      );
    }

    // 2. Switch-out cleanup
    if (outgoing) {
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
        !SWITCH_CLEAR_NAMES.has(v.name) &&
        !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
      );
      outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      delete outgoing.lastMoveId;
    }

    // 3. Incoming Pokémon enters the field
    slot.activePokemonIndex = newIndex;
    const incoming = slot.party[slot.activePokemonIndex];

    // 4. Entry hazards — fire before ability hooks (FR-6)
    if (incoming) {
      const incomingTeamIndex = s.teams.findIndex(t =>
        t.slots.some(sl => sl.slotId === slotId)
      ) as 0 | 1;
      const incomingSide = s.field.sideConditions[incomingTeamIndex]!;
      const incomingTypes = this.resolveEffectiveTypes(incoming);
      const grounded = isGrounded(incoming, incomingTypes, s.field.gravity > 0);
      events.push(...applyEntryHazards(incoming, slotId, incomingSide, incomingTeamIndex, incomingTypes, grounded, this.data));
    }

    // 5. onSwitchIn ability hook
    if (incoming) {
      const incomingAbilityHooks = getAbilityHooks(incoming.ability);
      const switchInResult = incomingAbilityHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
      if (switchInResult) {
        this.applySwitchInResult(s, slotId, incoming, switchInResult, events);
      }
    }

    // 6. Emit pokemon-switched event
    events.push({
      type: 'pokemon-switched',
      data: { slotId, outInstanceId, inInstanceId: targetInstanceId, reason },
    });

    return { newState: s, events };
  }

  private applySwitchInResult(
    s: BattleState,
    slotId: string,
    incoming: PartyMember,
    result: SwitchInResult,
    events: TurnResolveEvent[],
  ): void {
    // Apply foe stat deltas (Intimidate)
    if (result.statBoostDeltas) {
      const incomingTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIndex = incomingTeamIndex === 0 ? 1 : 0;
      const foeTeam = s.teams[foeTeamIndex];
      if (foeTeam) {
        for (const foeSlot of foeTeam.slots) {
          const foePokemon = foeSlot.party[foeSlot.activePokemonIndex];
          if (foePokemon && !foePokemon.fainted) {
            const event = applyStatBoost(
              foePokemon,
              foeSlot.slotId,
              result.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
            );
            events.push(event);
          }
        }
      }
    }

    // Apply self stat deltas (Download)
    if (result.selfBoostDeltas) {
      const event = applyStatBoost(
        incoming,
        slotId,
        result.selfBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
      );
      events.push(event);
    }

    // Handle Trace — set tracedAbilityId and re-invoke onSwitchIn once
    if (result.traceAbilityId && result.traceAbilityId !== 'trace') {
      incoming.tracedAbilityId = result.traceAbilityId;
      const tracedHooks = getAbilityHooks(result.traceAbilityId);
      const tracedResult = tracedHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
      if (tracedResult) {
        this.applySwitchInResult(s, slotId, incoming, tracedResult, events);
      }
    }

    // Handle Screen Cleaner
    if (result.clearScreens) {
      for (const side of s.field.sideConditions) {
        if (side.reflect > 0) {
          side.reflect = 0;
          events.push({ type: 'screen-broken', data: { screen: 'reflect' } });
        }
        if (side.lightScreen > 0) {
          side.lightScreen = 0;
          events.push({ type: 'screen-broken', data: { screen: 'light-screen' } });
        }
        if (side.auroraVeil > 0) {
          side.auroraVeil = 0;
          events.push({ type: 'screen-broken', data: { screen: 'aurora-veil' } });
        }
      }
    }
  }
```

> Note: `applySwitchInResult` is extracted as a private helper so Trace can call it recursively without duplicating logic.

- [ ] **Step 4: Run the switching tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Run full server tests**

```bash
cd packages/server && npx vitest run
```

Expected: all pass. If any test asserts `volatile-applied` with `note: 'switch'`, update it to `pokemon-switched`.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/switching.test.ts
git commit -m "refactor(engine): extract performSwitch, fix hazard ordering, emit pokemon-switched"
```

---

## Task 6: Fix forced-switch path in `BattleRoom` (FR-12)

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/__tests__/BattleRoom.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/server/src/socket/__tests__/BattleRoom.test.ts`, add a new describe block:

```typescript
import { makePokemon } from '../../engine/__tests__/fixtures.js';

describe('forced switch correctness', () => {
  function makeStateWithBench() {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    return state;
  }

  it('forced switch applies Stealth Rock to incoming Pokémon', () => {
    const state = makeStateWithBench();
    // Add Stealth Rock to slot-a1's side (team index 0)
    state.field.sideConditions[0]!.stealthRock = true;
    // Faint the active mon
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 0;

    const room = new BattleRoom({ initialState: state });
    const events: import('@poke-fighter/shared').TurnResolveEvent[] = [];
    room.onTurnResolved((evts) => events.push(...evts));

    const result = room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'p1-bench' });
    expect(result.ok).toBe(true);

    // bench mon (p1-bench) should have taken Stealth Rock damage
    const bench = room.getState().teams[0]!.slots[0]!.party[1]!;
    expect(bench.currentHp).toBeLessThan(bench.maxHp);
    expect(events.some(e => e.type === 'hazard-damage')).toBe(true);
  });

  it('forced switch emits pokemon-switched event', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 0;

    const room = new BattleRoom({ initialState: state });
    const events: import('@poke-fighter/shared').TurnResolveEvent[] = [];
    room.onTurnResolved((evts) => events.push(...evts));

    room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'p1-bench' });

    expect(events.some(e => e.type === 'pokemon-switched' && e.data['reason'] === 'forced')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd packages/server && npx vitest run src/socket/__tests__/BattleRoom.test.ts
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Update `awaitingForcedSwitches` from `Set` to `Map` throughout `BattleRoom.ts`**

In `packages/server/src/socket/BattleRoom.ts`:

**Line 31** — change the field declaration:
```typescript
  private awaitingForcedSwitches = new Map<string, 'forced' | 'phased'>();
```

**`submitAction` method (lines 72-105)** — replace the entire forced-switch block with:
```typescript
    if (this.awaitingForcedSwitches.has(slotId)) {
      if (action.type !== 'switch') {
        return { ok: false, reason: 'Must submit a switch action' };
      }
      const reason = this.awaitingForcedSwitches.get(slotId)!;
      const result = this.engine.processForceSwitch(
        this.state,
        slotId,
        (action as SwitchAction).targetInstanceId,
        reason,
      );
      // performSwitch returns unchanged state (no pokemon-switched event) if target is invalid
      if (!result.events.some(e => e.type === 'pokemon-switched')) {
        return { ok: false, reason: 'Invalid switch target' };
      }
      this.awaitingForcedSwitches.delete(slotId);
      this.state = result.newState;
      try {
        this.onTurnResolvedCb?.(result.events, this.state);
      } catch (err) {
        console.error('[BattleRoom] onTurnResolvedCb (forced switch) threw:', err);
      }
      return { ok: true };
    }
```

**`forceFaint` method (line 174)** — change the Set assignment:
```typescript
      this.awaitingForcedSwitches = new Map(switchSlots.map((sl) => [sl.slotId, 'forced' as const]));
```

**`resolveTurn` private method (line 414)** — change the Set assignment:
```typescript
      this.awaitingForcedSwitches = new Map(switchSlots.map((s) => [s.slotId, 'forced' as const]));
```

**`getPendingActionRequest` (line 126)** — `this.awaitingForcedSwitches.size` still works (Map has `.size`), no change needed.

- [ ] **Step 4: Run the tests**

```bash
cd packages/server && npx vitest run src/socket/__tests__/BattleRoom.test.ts
```

Expected: all tests PASS including the 2 new ones.

- [ ] **Step 5: Run full server tests**

```bash
cd packages/server && npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "feat(room): route forced switches through engine.processForceSwitch"
```

---

## Task 7: Download `onSwitchIn` (FR-5)

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Modify: `packages/server/src/engine/__tests__/switching.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `switching.test.ts`:

```typescript
describe('onSwitchIn — Download', () => {
  function makeDownloadState(foeDefStat: number, foeSpdStat: number) {
    const state = makeStateWithBench();
    // Incoming Pokémon has Download
    state.teams[0]!.slots[0]!.party[1]!.ability = 'download';
    // Foe has specific def/spd stats, no boosts
    state.teams[1]!.slots[0]!.party[0]!.stats.def = foeDefStat;
    state.teams[1]!.slots[0]!.party[0]!.stats.spd = foeSpdStat;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
    return state;
  }

  it('gives +1 Atk when foe effective Def < effective SpD', () => {
    // foe Def=80, SpD=120 → Def < SpD → Download gives +Atk
    const state = makeDownloadState(80, 120);
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.statBoosts.atk).toBe(1);
    expect(incoming.statBoosts.spa).toBe(0);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('gives +1 SpA when foe effective SpD <= effective Def', () => {
    // foe Def=120, SpD=80 → SpD < Def → Download gives +SpA
    const state = makeDownloadState(120, 80);
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.statBoosts.spa).toBe(1);
    expect(incoming.statBoosts.atk).toBe(0);
  });

  it('gives +1 SpA on tie (Def === SpD)', () => {
    const state = makeDownloadState(100, 100);
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.statBoosts.spa).toBe(1);
    expect(incoming.statBoosts.atk).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: 3 new tests FAIL.

- [ ] **Step 3: Implement Download**

Add the following import at the top of `packages/server/src/engine/abilities.ts`:

```typescript
import { getEffectiveStat } from './stats.js';
```

Then add to `ABILITY_HOOKS`:

```typescript
  download: {
    onSwitchIn: ({ state, slotId }) => {
      // Find the active foe
      const myTeamIdx = state.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
      const foeTeam = state.teams[foeTeamIdx];
      if (!foeTeam) return null;
      const foeSlot = foeTeam.slots[0];
      if (!foeSlot) return null;
      const foe = foeSlot.party[foeSlot.activePokemonIndex];
      if (!foe || foe.fainted) return null;

      const effectiveDef = getEffectiveStat(foe.stats.def, foe.statBoosts.def, 'def');
      const effectiveSpd = getEffectiveStat(foe.stats.spd, foe.statBoosts.spd, 'spd');

      // Def < SpD → boost Atk; otherwise (SpD <= Def, including tie) → boost SpA
      if (effectiveDef < effectiveSpd) {
        return { selfBoostDeltas: { atk: 1 } };
      } else {
        return { selfBoostDeltas: { spa: 1 } };
      }
    },
  },
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/switching.test.ts
git commit -m "feat(engine): Download ability boosts Atk or SpA on switch-in"
```

---

## Task 8: Trace `onSwitchIn` (FR-5)

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Modify: `packages/server/src/engine/__tests__/switching.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `switching.test.ts`:

```typescript
describe('onSwitchIn — Trace', () => {
  it('copies foe ability and fires the traced onSwitchIn (Intimidate)', () => {
    const state = makeStateWithBench();
    // Incoming Pokémon has Trace
    state.teams[0]!.slots[0]!.party[1]!.ability = 'trace';
    // Foe has Intimidate
    state.teams[1]!.slots[0]!.party[0]!.ability = 'intimidate';

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Traced Intimidate should lower foe's Atk
    const foe = newState.teams[1]!.slots[0]!.party[0]!;
    expect(foe.statBoosts.atk).toBe(-1);

    // The incoming Pokémon should have tracedAbilityId set
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.tracedAbilityId).toBe('intimidate');

    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('does not infinite-loop when Trace copies another Trace', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'trace';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'trace';

    const engine = new BattleEngine();
    // Should complete without stack overflow
    expect(() => engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    })).not.toThrow();

    const incoming = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    }).newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.tracedAbilityId).toBe('trace');
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Implement Trace**

Add to `ABILITY_HOOKS` in `abilities.ts`:

```typescript
  trace: {
    onSwitchIn: ({ state, slotId }) => {
      const myTeamIdx = state.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
      const foeTeam = state.teams[foeTeamIdx];
      if (!foeTeam) return null;
      const foeSlot = foeTeam.slots[0];
      if (!foeSlot) return null;
      const foe = foeSlot.party[foeSlot.activePokemonIndex];
      if (!foe || foe.fainted) return null;

      const abilityToCopy = effectiveAbilityId(foe);
      return { traceAbilityId: abilityToCopy };
    },
  },
```

The `applySwitchInResult` helper in `BattleEngine.ts` already handles `traceAbilityId` (from Task 5 — it sets `tracedAbilityId` on `incoming` and re-invokes `onSwitchIn` for the traced ability, skipping if the traced ability is also `'trace'`).

- [ ] **Step 4: Run the tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/switching.test.ts
git commit -m "feat(engine): Trace ability copies foe ability on switch-in"
```

---

## Task 9: Screen Cleaner `onSwitchIn` (FR-5)

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`
- Modify: `packages/server/src/engine/__tests__/switching.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `switching.test.ts`:

```typescript
describe('onSwitchIn — Screen Cleaner', () => {
  it('removes Reflect from both sides on switch-in', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'screen-cleaner';
    state.field.sideConditions[0]!.reflect = 5;
    state.field.sideConditions[1]!.reflect = 5;

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.sideConditions[0]!.reflect).toBe(0);
    expect(newState.field.sideConditions[1]!.reflect).toBe(0);
    const brokenEvents = events.filter(e => e.type === 'screen-broken' && e.data['screen'] === 'reflect');
    expect(brokenEvents).toHaveLength(2);
  });

  it('removes Light Screen and Aurora Veil from both sides', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'screen-cleaner';
    state.field.sideConditions[0]!.lightScreen = 5;
    state.field.sideConditions[1]!.auroraVeil = 3;

    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.sideConditions[0]!.lightScreen).toBe(0);
    expect(newState.field.sideConditions[1]!.auroraVeil).toBe(0);
  });

  it('does not emit screen-broken events for screens that were not active', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'screen-cleaner';
    // Only side 0 has Reflect active
    state.field.sideConditions[0]!.reflect = 5;

    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const brokenReflect = events.filter(e => e.type === 'screen-broken' && e.data['screen'] === 'reflect');
    expect(brokenReflect).toHaveLength(1); // only the active one
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: 3 new tests FAIL.

- [ ] **Step 3: Implement Screen Cleaner**

Add to `ABILITY_HOOKS` in `abilities.ts`:

```typescript
  'screen-cleaner': {
    onSwitchIn: () => ({ clearScreens: true }),
  },
```

The `applySwitchInResult` helper in `BattleEngine.ts` already handles `clearScreens` (from Task 5).

- [ ] **Step 4: Run the tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/switching.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full server tests**

```bash
cd packages/server && npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/abilities.ts packages/server/src/engine/__tests__/switching.test.ts
git commit -m "feat(engine): Screen Cleaner removes all screens on switch-in"
```

---

## Task 10: Client event handler (FR-14)

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx`
- Modify: `packages/client/src/battle/__tests__/BattleContext.test.tsx`

- [ ] **Step 1: Update `eventToText` in `BattleContext.tsx`**

In `packages/client/src/battle/BattleContext.tsx`, replace the `eventToText` function (lines 110-120):

```typescript
function eventToText(event: TurnResolveEvent): string {
  switch (event.type) {
    case 'move-used': return `${String(event.data['attackerName'])} used ${String(event.data['moveName'])}!`;
    case 'damage-dealt': return `Dealt ${String(event.data['damage'])} damage to ${String(event.data['targetSlotId'])}.`;
    case 'faint': return `${String(event.data['slotId'])}'s Pokémon fainted!`;
    case 'heal': return `${String(event.data['slotId'])} restored HP.`;
    case 'status-applied': return `${String(event.data['target'])} was ${String(event.data['status'])}!`;
    case 'terastallize': return `${String(event.data['slotId'])} Terastallized into ${String(event.data['teraType'])} type!`;
    case 'pokemon-switched': return `${String(event.data['slotId'])}'s Pokémon was switched out!`;
    default: return '';
  }
}
```

- [ ] **Step 2: Update the client test**

In `packages/client/src/battle/__tests__/BattleContext.test.tsx`, find the assertion referencing `volatile-applied` with `note: 'switch'` (line 48) and update it:

Change:
```typescript
          { type: 'volatile-applied', data: { note: 'switch', slotId: 's1' } },
```
to:
```typescript
          { type: 'pokemon-switched', data: { slotId: 's1', outInstanceId: 'out-1', inInstanceId: 'in-1', reason: 'voluntary' } },
```

And update the comment on line 55 from `volatile-applied returns ''` to `pokemon-switched returns a non-empty string` — or simply verify the test still correctly asserts what it's meant to assert.

- [ ] **Step 3: Run client tests (if a client test runner is available)**

```bash
cd packages/client && npx vitest run
```

Expected: all pass.

- [ ] **Step 4: Run full project tests**

```bash
pnpm test
```

Expected: all packages pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.tsx
git commit -m "feat(client): handle pokemon-switched event in eventToText"
```

---

## Self-Review Checklist

After completing all tasks, verify against the spec:

| Requirement | Task | Check |
|---|---|---|
| FR-1: volatile/boost cleanup on all paths | Task 2 (test), Task 5 (performSwitch), Task 6 (forced path) | |
| FR-2: toxic counter persists (Gen 5+) | Task 2 | |
| FR-3: `onSwitchOut` in `AbilityHooks` | Task 1 | |
| FR-4: Regenerator, Natural Cure, Slow Start, Truant | Task 3, 4 | |
| FR-5: Download, Trace, Screen Cleaner | Task 7, 8, 9 | |
| FR-6: hazards before onSwitchIn | Task 5 (performSwitch ordering) | |
| FR-12: forced switch path correctness | Task 6 | |
| FR-13: phasing moves use corrected path | Covered by Task 6 — `awaitingForcedSwitches` Map ready for `'phased'` reason | |
| FR-14: `pokemon-switched` event type | Task 5, 10 | |
