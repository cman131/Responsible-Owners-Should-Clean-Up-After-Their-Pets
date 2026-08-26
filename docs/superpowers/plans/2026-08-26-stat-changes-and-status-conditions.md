# Stat Changes & Status Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up stat stage changes and status condition application/expiry in the battle engine, including secondary effects from damaging moves, sleep duration tracking, and ability-triggered stat drops (Intimidate).

**Architecture:** A new `effects.ts` module provides pure helpers (`applyStatus`, `applyStatBoost`, `evaluateSecondaryEffect`) that mutate a `PartyMember` in place and return events. `BattleEngine` imports these helpers and calls them from `executeMove`, `executeSwitch`, and `endOfTurn`. Ability hooks are extended with `onAfterHit` and a returning `onSwitchIn` so ability effects stay out of `BattleEngine` internals. `volatileStatus` changes from `string[]` to `VolatileStatusEntry[]` to support counters for sleep and toxic.

**Tech Stack:** TypeScript, Vitest, shared types package (`@poke-fighter/shared`)

---

## File Map

| File | Role |
|---|---|
| `packages/shared/src/types/battle.ts` | Add `VolatileStatusEntry`, update `PartyMember.volatileStatus` |
| `packages/shared/src/types/pokemon.ts` | Add `effect?` and `effectChance?` to `Move` interface |
| `packages/shared/src/schemas/move.schema.ts` | Add optional fields to `MoveSchema` |
| `data/moves.json` | Add `effect`/`effectChance` to secondary-effect moves |
| `packages/server/src/engine/effects.ts` | New: `applyStatus`, `applyStatBoost`, `evaluateSecondaryEffect` |
| `packages/server/src/engine/moves.ts` | Add `targetsSelf` to `StatusMoveResult`, simplify signature |
| `packages/server/src/engine/status.ts` | Update `tickStatus` to accept `VolatileStatusEntry` |
| `packages/server/src/engine/abilities.ts` | Add `onAfterHit`, update `onSwitchIn` return type, implement Intimidate |
| `packages/server/src/engine/BattleEngine.ts` | Wire all new logic: status moves, secondary effects, ability hooks, sleep/toxic EoT |
| `packages/server/src/engine/__tests__/effects.test.ts` | New: unit tests for helpers |
| `packages/server/src/engine/__tests__/status.test.ts` | Update for new `tickStatus` signature |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | Integration tests for stat changes and status |
| `packages/server/src/engine/__tests__/fixtures.ts` | No change needed — `volatileStatus: []` already works with new type |

---

### Task 1: Add VolatileStatusEntry type and update PartyMember

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts` (2 lines — keep compiling)

- [ ] **Step 1: Add `VolatileStatusEntry` to `packages/shared/src/types/battle.ts`**

  Add this interface directly above `StatBoosts`:

  ```ts
  export interface VolatileStatusEntry {
    name: string;
    counter?: number;
  }
  ```

  In `PartyMember`, change:
  ```ts
  volatileStatus: string[];
  ```
  to:
  ```ts
  volatileStatus: VolatileStatusEntry[];
  ```

- [ ] **Step 2: Fix the two broken lines in `packages/server/src/engine/BattleEngine.ts`**

  Find these lines in `endOfTurn` (around line 275–278):
  ```ts
  if (active.status === 'tox') {
    active.volatileStatus.push('toxic-counter');
  }
  const toxicCounter = active.volatileStatus.filter((v) => v === 'toxic-counter').length;
  ```

  Replace with:
  ```ts
  if (active.status === 'tox') {
    active.volatileStatus.push({ name: 'toxic-counter' });
  }
  const toxicCounter = active.volatileStatus.filter((v) => v.name === 'toxic-counter').length;
  ```

  The `tickStatus` call on the next line still passes `toxicCounter: number` — that's fine until Task 7 updates the signature.

- [ ] **Step 3: Run typecheck**

  ```
  cd packages/server && npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 4: Run all server tests**

  ```
  cd packages/server && npm test
  ```
  Expected: all pass.

- [ ] **Step 5: Commit**

  ```
  git add packages/shared/src/types/battle.ts packages/server/src/engine/BattleEngine.ts
  git commit -m "refactor: replace volatileStatus string[] with VolatileStatusEntry[]"
  ```

---

### Task 2: Extend Move type with effect fields and seed secondary effects into move data

**Files:**
- Modify: `packages/shared/src/types/pokemon.ts`
- Modify: `packages/shared/src/schemas/move.schema.ts`
- Modify: `data/moves.json` (via script)

- [ ] **Step 1: Add optional fields to `Move` interface in `packages/shared/src/types/pokemon.ts`**

  In the `Move` interface, after `effectId?: string`:
  ```ts
  effect?: string;        // status id ('brn', 'par', 'psn', 'frz', 'slp') for secondary effects
  effectChance?: number;  // integer 0–100
  ```

- [ ] **Step 2: Add optional fields to `MoveSchema` in `packages/shared/src/schemas/move.schema.ts`**

  Add after `effectId: z.string().optional()`:
  ```ts
  effect: z.string().optional(),
  effectChance: z.number().int().min(0).max(100).optional(),
  ```

- [ ] **Step 3: Run typecheck and data validation tests to confirm nothing breaks**

  ```
  cd packages/shared && npm run typecheck && npm test
  ```
  Expected: all pass (new fields are optional, existing data unchanged).

- [ ] **Step 4: Create the secondary effects seed script**

  Create `data/scripts/add-secondary-effects.mjs`:

  ```js
  import { readFileSync, writeFileSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const movesPath = join(__dirname, '../moves.json');
  const moves = JSON.parse(readFileSync(movesPath, 'utf-8'));

  const secondaryEffects = {
    'flamethrower': { effect: 'brn', effectChance: 10 },
    'fireblast':    { effect: 'brn', effectChance: 10 },
    'firepunch':    { effect: 'brn', effectChance: 10 },
    'lavaplume':    { effect: 'brn', effectChance: 30 },
    'scald':        { effect: 'brn', effectChance: 30 },
    'thunderbolt':  { effect: 'par', effectChance: 10 },
    'thunder':      { effect: 'par', effectChance: 30 },
    'thunderpunch': { effect: 'par', effectChance: 10 },
    'bodyslam':     { effect: 'par', effectChance: 30 },
    'icebeam':      { effect: 'frz', effectChance: 10 },
    'blizzard':     { effect: 'frz', effectChance: 10 },
    'icepunch':     { effect: 'frz', effectChance: 10 },
    'poisonsting':  { effect: 'psn', effectChance: 30 },
    'poisonjab':    { effect: 'psn', effectChance: 30 },
    'sludgebomb':   { effect: 'psn', effectChance: 30 },
    'sludge':       { effect: 'psn', effectChance: 30 },
  };

  const updated = moves.map(m => {
    const eff = secondaryEffects[m.id];
    return eff ? { ...m, ...eff } : m;
  });

  writeFileSync(movesPath, JSON.stringify(updated, null, 2));
  const found = Object.keys(secondaryEffects).filter(id => moves.some(m => m.id === id));
  console.log(`Updated ${found.length} moves: ${found.join(', ')}`);
  ```

- [ ] **Step 5: Run the script**

  ```
  node data/scripts/add-secondary-effects.mjs
  ```
  Expected output: lists updated move names (should be 16 or so, depending on which exist in data).

- [ ] **Step 6: Run data validation tests to confirm moves.json is still valid**

  ```
  cd packages/shared && npm test
  ```
  Expected: all pass.

- [ ] **Step 7: Commit**

  ```
  git add packages/shared/src/types/pokemon.ts packages/shared/src/schemas/move.schema.ts data/moves.json data/scripts/add-secondary-effects.mjs
  git commit -m "feat: add effect/effectChance fields to Move type and seed secondary effects"
  ```

---

### Task 3: Create effects.ts — applyStatus and applyStatBoost helpers

**Files:**
- Create: `packages/server/src/engine/__tests__/effects.test.ts`
- Create: `packages/server/src/engine/effects.ts`

- [ ] **Step 1: Write failing tests in `packages/server/src/engine/__tests__/effects.test.ts`**

  ```ts
  import { describe, it, expect } from 'vitest';
  import { applyStatus, applyStatBoost } from '../effects.js';
  import { makePokemon } from './fixtures.js';

  describe('applyStatus', () => {
    it('applies burn and returns a status-applied event', () => {
      const mon = makePokemon({ ability: '' });
      const event = applyStatus(mon, 'slot-a1', 'brn', ['Water']);
      expect(mon.status).toBe('brn');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('status-applied');
      expect(event!.data['slotId']).toBe('slot-a1');
      expect(event!.data['status']).toBe('brn');
    });

    it('returns null and leaves status unchanged if target is type-immune', () => {
      const mon = makePokemon({ ability: '' });
      const event = applyStatus(mon, 'slot-a1', 'brn', ['Fire']);
      expect(event).toBeNull();
      expect(mon.status).toBeUndefined();
    });

    it('returns null if target already has a status condition', () => {
      const mon = makePokemon({ status: 'par', ability: '' });
      const event = applyStatus(mon, 'slot-a1', 'brn', ['Water']);
      expect(event).toBeNull();
      expect(mon.status).toBe('par');
    });

    it('adds a sleep volatile entry with counter 1–3 when applying sleep', () => {
      const mon = makePokemon({ ability: '' });
      applyStatus(mon, 'slot-a1', 'slp', ['Normal']);
      expect(mon.status).toBe('slp');
      const entry = mon.volatileStatus.find(v => v.name === 'sleep');
      expect(entry).toBeDefined();
      expect(entry!.counter).toBeGreaterThanOrEqual(1);
      expect(entry!.counter).toBeLessThanOrEqual(3);
    });
  });

  describe('applyStatBoost', () => {
    it('raises attack by 2 and returns a stat-change event', () => {
      const mon = makePokemon();
      const event = applyStatBoost(mon, 'slot-a1', { atk: 2 });
      expect(mon.statBoosts.atk).toBe(2);
      expect(event.type).toBe('stat-change');
      expect(event.data['slotId']).toBe('slot-a1');
      expect(event.data['changes']).toEqual({ atk: 2 });
    });

    it('lowers attack by 1', () => {
      const mon = makePokemon();
      applyStatBoost(mon, 'slot-a1', { atk: -1 });
      expect(mon.statBoosts.atk).toBe(-1);
    });

    it('clamps boost at +6', () => {
      const mon = makePokemon({
        statBoosts: { atk: 5, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      });
      applyStatBoost(mon, 'slot-a1', { atk: 3 });
      expect(mon.statBoosts.atk).toBe(6);
    });

    it('clamps boost at -6', () => {
      const mon = makePokemon({
        statBoosts: { atk: -5, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      });
      applyStatBoost(mon, 'slot-a1', { atk: -3 });
      expect(mon.statBoosts.atk).toBe(-6);
    });

    it('applies multiple stat changes at once', () => {
      const mon = makePokemon();
      applyStatBoost(mon, 'slot-a1', { spa: 1, spd: 1 });
      expect(mon.statBoosts.spa).toBe(1);
      expect(mon.statBoosts.spd).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run the tests and confirm they fail**

  ```
  cd packages/server && npm test -- effects.test.ts
  ```
  Expected: FAIL — `Cannot find module '../effects.js'`

- [ ] **Step 3: Create `packages/server/src/engine/effects.ts`**

  ```ts
  import type {
    PartyMember, StatBoosts, StatusCondition, PokemonType, TurnResolveEvent,
  } from '@poke-fighter/shared';
  import { canApplyStatus } from './status.js';

  export function applyStatus(
    member: PartyMember,
    slotId: string,
    status: StatusCondition,
    types: PokemonType[],
  ): TurnResolveEvent | null {
    if (!canApplyStatus({ status, types, currentStatus: member.status, ability: member.ability })) {
      return null;
    }
    member.status = status;
    if (status === 'slp') {
      const counter = Math.floor(Math.random() * 3) + 1;
      member.volatileStatus.push({ name: 'sleep', counter });
    }
    return { type: 'status-applied', data: { slotId, status } };
  }

  export function applyStatBoost(
    member: PartyMember,
    slotId: string,
    deltas: Partial<Record<keyof StatBoosts, number>>,
  ): TurnResolveEvent {
    const changes: Record<string, number> = {};
    for (const [key, delta] of Object.entries(deltas) as [keyof StatBoosts, number][]) {
      if (delta === undefined) continue;
      const current = member.statBoosts[key];
      const next = Math.max(-6, Math.min(6, current + delta));
      const actual = next - current;
      member.statBoosts[key] = next;
      changes[key] = actual;
    }
    return { type: 'stat-change', data: { slotId, changes } };
  }
  ```

- [ ] **Step 4: Run the tests and confirm they pass**

  ```
  cd packages/server && npm test -- effects.test.ts
  ```
  Expected: all pass.

- [ ] **Step 5: Run typecheck**

  ```
  cd packages/server && npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```
  git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/effects.test.ts
  git commit -m "feat(engine): add applyStatus and applyStatBoost helpers"
  ```

---

### Task 4: Add evaluateSecondaryEffect to effects.ts

**Files:**
- Modify: `packages/server/src/engine/__tests__/effects.test.ts`
- Modify: `packages/server/src/engine/effects.ts`

- [ ] **Step 1: Add failing tests to `effects.test.ts`**

  Add this import at the top:
  ```ts
  import { describe, it, expect, vi } from 'vitest';
  import { applyStatus, applyStatBoost, evaluateSecondaryEffect } from '../effects.js';
  import type { Move } from '@poke-fighter/shared';
  ```

  Add this describe block at the end of the file:
  ```ts
  describe('evaluateSecondaryEffect', () => {
    it('returns null if the move has no effect or effectChance', () => {
      const move = {} as Move;
      const target = makePokemon({ ability: '' });
      expect(evaluateSecondaryEffect(move, target, 'slot-b1', ['Normal'])).toBeNull();
    });

    it('applies the status when the random roll succeeds', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // 0 * 100 = 0, which is < 30
      const move = { effect: 'psn', effectChance: 30 } as unknown as Move;
      const target = makePokemon({ ability: '' });
      const event = evaluateSecondaryEffect(move, target, 'slot-b1', ['Normal']);
      expect(event).not.toBeNull();
      expect(target.status).toBe('psn');
      vi.restoreAllMocks();
    });

    it('returns null when the random roll fails', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99); // 99 >= 30
      const move = { effect: 'brn', effectChance: 30 } as unknown as Move;
      const target = makePokemon({ ability: '' });
      const event = evaluateSecondaryEffect(move, target, 'slot-b1', ['Normal']);
      expect(event).toBeNull();
      expect(target.status).toBeUndefined();
      vi.restoreAllMocks();
    });

    it('returns null if the target is immune to the secondary status', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // roll succeeds
      const move = { effect: 'brn', effectChance: 10 } as unknown as Move;
      const target = makePokemon({ ability: '' });
      const event = evaluateSecondaryEffect(move, target, 'slot-b1', ['Fire']); // Fire immune to burn
      expect(event).toBeNull();
      expect(target.status).toBeUndefined();
      vi.restoreAllMocks();
    });
  });
  ```

- [ ] **Step 2: Run tests and confirm new tests fail**

  ```
  cd packages/server && npm test -- effects.test.ts
  ```
  Expected: new `evaluateSecondaryEffect` tests FAIL, previous tests still pass.

- [ ] **Step 3: Add `evaluateSecondaryEffect` to `packages/server/src/engine/effects.ts`**

  Add this import at the top (after the existing imports):
  ```ts
  import type { Move } from '@poke-fighter/shared';
  ```

  Add this constant and function at the bottom of the file:
  ```ts
  const STATUS_CONDITIONS = new Set<string>(['brn', 'par', 'psn', 'tox', 'slp', 'frz']);

  export function evaluateSecondaryEffect(
    move: Move,
    target: PartyMember,
    targetSlotId: string,
    targetTypes: PokemonType[],
  ): TurnResolveEvent | null {
    if (!move.effect || move.effectChance === undefined) return null;
    if (Math.random() * 100 >= move.effectChance) return null;
    if (STATUS_CONDITIONS.has(move.effect)) {
      return applyStatus(target, targetSlotId, move.effect as StatusCondition, targetTypes);
    }
    return null;
  }
  ```

- [ ] **Step 4: Run tests and confirm all pass**

  ```
  cd packages/server && npm test -- effects.test.ts
  ```
  Expected: all pass.

- [ ] **Step 5: Run typecheck**

  ```
  cd packages/server && npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```
  git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/effects.test.ts
  git commit -m "feat(engine): add evaluateSecondaryEffect for secondary status effects"
  ```

---

### Task 5: Add targetsSelf to StatusMoveResult and simplify executeStatusMove signature

**Files:**
- Modify: `packages/server/src/engine/moves.ts`

- [ ] **Step 1: Update `StatusMoveResult` and `executeStatusMove` in `packages/server/src/engine/moves.ts`**

  Replace the entire file with:

  ```ts
  import type { PartyMember, BattleState } from '@poke-fighter/shared';

  export interface StatusMoveResult {
    statusToApply?: string;
    statBoostDeltas?: Partial<Record<string, number>>;
    heals?: boolean;
    targetsSelf?: boolean;
  }

  export function executeStatusMove(moveId: string): StatusMoveResult {
    switch (moveId) {
      case 'willowisp':   return { statusToApply: 'brn', targetsSelf: false };
      case 'thunderwave': return { statusToApply: 'par', targetsSelf: false };
      case 'toxic':       return { statusToApply: 'tox', targetsSelf: false };
      case 'spore':
      case 'sleeppowder': return { statusToApply: 'slp', targetsSelf: false };
      case 'swordsdance': return { statBoostDeltas: { atk: 2 }, targetsSelf: true };
      case 'nastyplot':   return { statBoostDeltas: { spa: 2 }, targetsSelf: true };
      case 'calmmind':    return { statBoostDeltas: { spa: 1, spd: 1 }, targetsSelf: true };
      case 'bulkup':      return { statBoostDeltas: { atk: 1, def: 1 }, targetsSelf: true };
      case 'roost':       return { heals: true, targetsSelf: true };
      default:            return {};
    }
  }
  ```

  Note: the `PartyMember`, `BattleState` imports are removed since they were only used by the now-removed parameters.

- [ ] **Step 2: Run typecheck**

  ```
  cd packages/server && npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 3: Run all server tests**

  ```
  cd packages/server && npm test
  ```
  Expected: all pass.

- [ ] **Step 4: Commit**

  ```
  git add packages/server/src/engine/moves.ts
  git commit -m "feat(engine): add targetsSelf to StatusMoveResult, simplify executeStatusMove signature"
  ```

---

### Task 6: Update AbilityHooks with onAfterHit, updated onSwitchIn, and Intimidate

**Files:**
- Modify: `packages/server/src/engine/abilities.ts`

- [ ] **Step 1: Update `packages/server/src/engine/abilities.ts`**

  Replace the file with:

  ```ts
  import type { PartyMember, BattleState, PokemonType, StatBoosts } from '@poke-fighter/shared';

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
    onAttackerModifier?: (ctx: AttackContext) => number;
    onDefenderModifier?: (ctx: AttackContext) => number;
    onDamageModifier?: (ctx: AttackContext) => number;
    onSwitchIn?: (ctx: AbilityContext) => { statBoostDeltas?: Partial<StatBoosts> } | null;
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
  ```

- [ ] **Step 2: Run typecheck**

  ```
  cd packages/server && npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 3: Run all server tests**

  ```
  cd packages/server && npm test
  ```
  Expected: all pass.

- [ ] **Step 4: Commit**

  ```
  git add packages/server/src/engine/abilities.ts
  git commit -m "feat(engine): add onAfterHit hook, update onSwitchIn return type, implement Intimidate"
  ```

---

### Task 7: Update tickStatus signature to accept VolatileStatusEntry

**Files:**
- Modify: `packages/server/src/engine/status.ts`
- Modify: `packages/server/src/engine/__tests__/status.test.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts` (endOfTurn only — fix compile error from signature change)

- [ ] **Step 1: Add new tests to `packages/server/src/engine/__tests__/status.test.ts`**

  Add these describe blocks at the end of the file:

  ```ts
  describe('tickStatus for sleep', () => {
    it('returns cured: true when sleep volatile entry counter is 0', () => {
      const result = tickStatus('slp', 100, { name: 'sleep', counter: 0 });
      expect(result.cured).toBe(true);
    });

    it('returns cured: false when sleep counter is greater than 0', () => {
      const result = tickStatus('slp', 100, { name: 'sleep', counter: 2 });
      expect(result.cured).toBe(false);
    });

    it('returns cured: true when no volatile entry is provided', () => {
      const result = tickStatus('slp', 100, undefined);
      expect(result.cured).toBe(true);
    });
  });

  describe('tickStatus for toxic', () => {
    it('deals escalating damage based on the counter in the volatile entry', () => {
      const r1 = tickStatus('tox', 160, { name: 'toxic', counter: 1 });
      const r3 = tickStatus('tox', 160, { name: 'toxic', counter: 3 });
      expect(r1.hpDelta).toBe(-10); // floor(160 * 1/16) = 10
      expect(r3.hpDelta).toBe(-30); // floor(160 * 3/16) = 30
    });
  });
  ```

- [ ] **Step 2: Run tests — expect the new tests to fail (old signature takes number)**

  ```
  cd packages/server && npm test -- status.test.ts
  ```
  Expected: new sleep/toxic tests FAIL, previous tests still pass.

- [ ] **Step 3: Update `tickStatus` in `packages/server/src/engine/status.ts`**

  Change the import line to:
  ```ts
  import type { StatusCondition, PokemonType, VolatileStatusEntry } from '@poke-fighter/shared';
  ```

  Replace the `tickStatus` function signature and body:

  ```ts
  export function tickStatus(
    status: StatusCondition,
    maxHp: number,
    volatileEntry?: VolatileStatusEntry
  ): StatusTickResult {
    switch (status) {
      case 'brn':
        return { hpDelta: -getBurnDamage(maxHp), cured: false, fullParalysis: false, thawed: false };
      case 'psn':
        return { hpDelta: -getPoisonDamage(maxHp), cured: false, fullParalysis: false, thawed: false };
      case 'tox': {
        const counter = volatileEntry?.counter ?? 1;
        return { hpDelta: -getToxicDamage(maxHp, counter), cured: false, fullParalysis: false, thawed: false };
      }
      case 'par':
        return { hpDelta: 0, cured: false, fullParalysis: Math.random() < PARALYSIS_FULL_PARALYSIS_CHANCE, thawed: false };
      case 'frz':
        return { hpDelta: 0, cured: false, fullParalysis: false, thawed: Math.random() < FREEZE_THAW_CHANCE };
      case 'slp':
        return { hpDelta: 0, cured: (volatileEntry?.counter ?? 0) === 0, fullParalysis: false, thawed: false };
      default:
        return { hpDelta: 0, cured: false, fullParalysis: false, thawed: false };
    }
  }
  ```

- [ ] **Step 4: Run status tests — expect all pass**

  ```
  cd packages/server && npm test -- status.test.ts
  ```
  Expected: all pass.

- [ ] **Step 5: Fix the compile error in `BattleEngine.ts` caused by the changed signature**

  In `endOfTurn`, find the block that starts with `if (active.status)`. Replace it entirely with:

  ```ts
  if (active.status) {
    let volatileEntry: VolatileStatusEntry | undefined;

    if (active.status === 'tox') {
      let toxEntry = active.volatileStatus.find(v => v.name === 'toxic');
      if (!toxEntry) {
        toxEntry = { name: 'toxic', counter: 0 };
        active.volatileStatus.push(toxEntry);
      }
      toxEntry.counter = (toxEntry.counter ?? 0) + 1;
      volatileEntry = toxEntry;
    } else if (active.status === 'slp') {
      volatileEntry = active.volatileStatus.find(v => v.name === 'sleep');
    }

    const tick = tickStatus(active.status, active.maxHp, volatileEntry);

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

    if (active.status === 'slp') {
      if (tick.cured) {
        active.volatileStatus = active.volatileStatus.filter(v => v.name !== 'sleep');
        active.status = undefined;
        events.push({ type: 'status-cured', data: { slotId: slot.slotId, status: 'slp' } });
      } else if (volatileEntry) {
        volatileEntry.counter = (volatileEntry.counter ?? 1) - 1;
      }
    }
  }
  ```

  Also add `VolatileStatusEntry` to the BattleEngine import from `@poke-fighter/shared`:
  ```ts
  import type {
    BattleState, SlotState, PartyMember, MoveAction, SwitchAction,
    TurnResolveEvent, PokemonType, VolatileStatusEntry,
  } from '@poke-fighter/shared';
  ```

- [ ] **Step 6: Run typecheck**

  ```
  cd packages/server && npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 7: Run all server tests**

  ```
  cd packages/server && npm test
  ```
  Expected: all pass.

- [ ] **Step 8: Commit**

  ```
  git add packages/server/src/engine/status.ts packages/server/src/engine/__tests__/status.test.ts packages/server/src/engine/BattleEngine.ts
  git commit -m "feat(engine): update tickStatus to use VolatileStatusEntry, implement sleep expiry in endOfTurn"
  ```

---

### Task 8: Wire BattleEngine — status moves, secondary effects, ability hooks, can't-move check

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing integration tests in `packages/server/src/engine/__tests__/BattleEngine.test.ts`**

  Add these describe blocks at the end of the existing file:

  ```ts
  describe('Status moves', () => {
    it('Swords Dance raises the user attack by 2 stages', () => {
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
      const engine = new BattleEngine();
      const { newState, events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 1 },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const p1 = newState.teams[0]!.slots[0]!.party[0]!;
      expect(p1.statBoosts.atk).toBe(2);
      expect(events.some(e => e.type === 'stat-change')).toBe(true);
    });

    it('Will-O-Wisp applies burn to the target', () => {
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
      // Give p2 a non-Fire type so it can be burned
      state.teams[1]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise (Water)
      const engine = new BattleEngine();
      const { newState, events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const p2 = newState.teams[1]!.slots[0]!.party[0]!;
      expect(p2.status).toBe('brn');
      expect(events.some(e => e.type === 'status-applied')).toBe(true);
    });
  });

  describe('Secondary effects from damaging moves', () => {
    it('Flamethrower can apply burn on a successful roll', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // forces secondary roll to succeed
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
      state.teams[1]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise (Water, not immune to burn)
      const engine = new BattleEngine();
      const { newState } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const p2 = newState.teams[1]!.slots[0]!.party[0]!;
      expect(p2.status).toBe('brn');
      vi.restoreAllMocks();
    });

    it('secondary burn does not apply to a Fire-type target', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
      // p2 stays as Charizard (Fire type) — immune to burn
      const engine = new BattleEngine();
      const { newState } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const p2 = newState.teams[1]!.slots[0]!.party[0]!;
      expect(p2.status).toBeUndefined();
      vi.restoreAllMocks();
    });
  });

  describe('Intimidate on switch-in', () => {
    it('lowers the opposing active pokemon attack by 1 when an Intimidate user switches in', () => {
      const state = make1v1State();
      // Add a second party member with Intimidate that switches in
      const intimidateMon = makePokemon({ instanceId: 'intimidate-mon', ability: 'intimidate' });
      state.teams[0]!.slots[0]!.party.push(intimidateMon);
      const engine = new BattleEngine();
      const { newState, events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'switch', targetInstanceId: 'intimidate-mon' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const p2 = newState.teams[1]!.slots[0]!.party[0]!;
      expect(p2.statBoosts.atk).toBe(-1);
      expect(events.some(e => e.type === 'stat-change')).toBe(true);
    });
  });

  describe('Sleep prevents moving', () => {
    it('a sleeping pokemon cannot use its move', () => {
      const state = make1v1State();
      const p1 = state.teams[0]!.slots[0]!.party[0]!;
      p1.status = 'slp';
      p1.volatileStatus = [{ name: 'sleep', counter: 2 }];
      const engine = new BattleEngine();
      const { newState } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      // p2 should have taken no damage (p1 was asleep and couldn't attack)
      const p2 = newState.teams[1]!.slots[0]!.party[0]!;
      expect(p2.currentHp).toBe(100);
    });
  });
  ```

  Also add `import { vi } from 'vitest';` and `import { makePokemon } from './fixtures.js';` to the top of the test file (alongside the existing imports).

- [ ] **Step 2: Run tests — expect the new tests to fail**

  ```
  cd packages/server && npm test -- BattleEngine.test.ts
  ```
  Expected: new tests FAIL, existing tests pass.

- [ ] **Step 3: Update the imports in `packages/server/src/engine/BattleEngine.ts`**

  Replace the existing imports with:
  ```ts
  import type {
    BattleState, SlotState, PartyMember, MoveAction, SwitchAction,
    TurnResolveEvent, PokemonType, VolatileStatusEntry, StatusCondition, StatBoosts,
  } from '@poke-fighter/shared';
  import { DataLoader } from '../data/loader.js';
  import { calcDamage, randomDamageFactor } from './damage.js';
  import { getEffectiveStat } from './stats.js';
  import { tickStatus, PARALYSIS_SPEED_MOD, PARALYSIS_FULL_PARALYSIS_CHANCE } from './status.js';
  import { getAbilityHooks } from './abilities.js';
  import { getItemHooks } from './items.js';
  import { applyStatus, applyStatBoost, evaluateSecondaryEffect } from './effects.js';
  import { executeStatusMove } from './moves.js';
  ```

- [ ] **Step 4: Add the can't-move check in `executeMove`, immediately after confirming `attacker` is valid**

  Find this block in `executeMove` (around line 115):
  ```ts
  const moveSlot = attacker.moves[action.moveIndex];
  if (!moveSlot) return { newState: s, events };
  const move = this.data.getMove(moveSlot.moveId);
  if (!move) return { newState: s, events };
  ```

  Insert this block directly BEFORE those lines (after `if (!attacker) return...`):
  ```ts
  // Can't-move checks
  if (attacker.status === 'slp') {
    events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, note: 'asleep' } });
    return { newState: s, events };
  }
  if (attacker.status === 'par' && Math.random() < PARALYSIS_FULL_PARALYSIS_CHANCE) {
    events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, note: 'full-paralysis' } });
    return { newState: s, events };
  }
  ```

- [ ] **Step 5: Replace the status-move early return in `executeMove` with full status move handling**

  Find this block (currently after `events.push({ type: 'move-used', ... })`):
  ```ts
  if (move.category === 'status') {
    return { newState: s, events };
  }
  ```

  Replace with:
  ```ts
  if (move.category === 'status') {
    const result = executeStatusMove(moveSlot.moveId);

    let affectedMember: PartyMember;
    let affectedSlotId: string;
    if (result.targetsSelf) {
      affectedMember = attacker;
      affectedSlotId = attackerSlotId;
    } else {
      const foeSlotId = action.targetSlotId ?? this.getSpreadTargets(s, attackerSlotId, 'normal')[0];
      const foeSlot = foeSlotId ? this.findSlot(s, foeSlotId) : null;
      const foeMember = foeSlot?.party[foeSlot.activePokemonIndex];
      affectedMember = foeMember ?? attacker;
      affectedSlotId = foeSlotId ?? attackerSlotId;
    }

    if (result.statusToApply) {
      const targetSpecies = this.data.getSpecies(affectedMember.speciesId);
      const targetTypes = affectedMember.hasTerastallized && affectedMember.teraType
        ? [affectedMember.teraType] as PokemonType[]
        : (targetSpecies?.types ?? ['Normal']) as PokemonType[];
      const event = applyStatus(affectedMember, affectedSlotId, result.statusToApply as StatusCondition, targetTypes);
      if (event) events.push(event);
    }

    if (result.statBoostDeltas) {
      const event = applyStatBoost(
        affectedMember,
        affectedSlotId,
        result.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
      );
      events.push(event);
    }

    if (result.heals) {
      const heal = Math.min(Math.floor(affectedMember.maxHp / 2), affectedMember.maxHp - affectedMember.currentHp);
      if (heal > 0) {
        affectedMember.currentHp += heal;
        events.push({ type: 'heal', data: { slotId: affectedSlotId, amount: heal, remainingHp: affectedMember.currentHp } });
      }
    }

    return { newState: s, events };
  }
  ```

- [ ] **Step 6: Add secondary effect evaluation and defender onAfterHit inside the target loop**

  In `executeMove`, inside the `for (const targetSlotId of targetSlotIds)` loop, find the faint check block:
  ```ts
  if (target.currentHp <= 0) {
    target.fainted = true;
    ...
  }
  ```

  Insert these blocks BEFORE the faint check (after `events.push({ type: 'damage-dealt', ... })`):

  ```ts
  // Secondary status effect from move data (e.g. Flamethrower 10% burn)
  if (actualDamage > 0) {
    const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes);
    if (secondaryEvent) events.push(secondaryEvent);
  }

  // Defender's ability triggers (e.g. Static, Flame Body — contact abilities)
  const defenderAbilityHooks = getAbilityHooks(target.ability);
  if (defenderAbilityHooks.onAfterHit && actualDamage > 0) {
    const afterHitResult = defenderAbilityHooks.onAfterHit({
      user: target, state: s, moveType: move.type, basePower: move.basePower,
      target: attacker, isPhysical,
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
  ```

- [ ] **Step 7: Wire Intimidate via onSwitchIn in `executeSwitch`**

  In `executeSwitch`, after the line `slot.activePokemonIndex = newIndex;`, add:

  ```ts
  // Apply incoming ability's switch-in effect (e.g. Intimidate drops opponent attack)
  const incoming = slot.party[slot.activePokemonIndex];
  if (incoming) {
    const incomingAbilityHooks = getAbilityHooks(incoming.ability);
    const switchInResult = incomingAbilityHooks.onSwitchIn?.({ user: incoming, state: s });
    if (switchInResult?.statBoostDeltas) {
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
              switchInResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
            );
            events.push(event);
          }
        }
      }
    }
  }
  ```

- [ ] **Step 8: Run typecheck**

  ```
  cd packages/server && npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 9: Run all server tests**

  ```
  cd packages/server && npm test
  ```
  Expected: all pass.

- [ ] **Step 10: Run all tests across all packages**

  ```
  cd packages/shared && npm test
  ```
  Expected: all pass (data validation tests confirm moves.json still valid).

- [ ] **Step 11: Commit**

  ```
  git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
  git commit -m "feat(engine): wire status moves, secondary effects, ability hooks, and sleep/paralysis can't-move"
  ```
