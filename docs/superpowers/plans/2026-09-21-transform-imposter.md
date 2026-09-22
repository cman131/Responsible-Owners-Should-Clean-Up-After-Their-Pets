# Transform Switch-Out Fix & Imposter Ability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where Transform's stat/ability/type/move changes are never reverted on switch-out, and implement the Imposter ability (Ditto's signature ability, currently a data-only stub) so it transforms into the opposing active Pokémon on switch-in.

**Architecture:** Extract Transform's existing mutation logic into a shared `applyTransform` helper used by both the `transform` move handler and a new `imposter` `onSwitchIn` ability hook. Add an `originalForm` snapshot field to `PartyMember` so switching out can restore pre-transform state.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces (`@poke-fighter/shared`, `@poke-fighter/server`)

**Design doc:** `docs/superpowers/specs/2026-09-21-transform-imposter-design.md`

---

## Task 1: Add `originalForm` snapshot field to `PartyMember`

**Files:**
- Modify: `packages/shared/src/types/battle.ts:68` (end of `PartyMember` interface)

- [ ] **Step 1: Add the field**

In `packages/shared/src/types/battle.ts`, find the `PartyMember` interface (starts at line 38). Add this field immediately after `nature?: string;` (line 68), before the closing brace:

```typescript
  originalForm?: {
    stats: Stats;
    ability: string;
    typeOverride?: PokemonType[];
    moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot];
  };
```

The full end of the interface should read:

```typescript
  ivs?: Stats;
  evs?: Stats;
  nature?: string;
  originalForm?: {
    stats: Stats;
    ability: string;
    typeOverride?: PokemonType[];
    moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot];
  };
}
```

- [ ] **Step 2: Build the shared package**

Run: `pnpm --filter @poke-fighter/shared build`
Expected: builds cleanly, no output errors.

- [ ] **Step 3: Typecheck shared package**

Run: `pnpm --filter @poke-fighter/shared typecheck`
Expected: PASS (no errors — this is an additive optional field).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/battle.ts
git commit -m "$(cat <<'EOF'
feat: add originalForm snapshot field to PartyMember

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Write failing tests for `applyTransform`

**Files:**
- Test: `packages/server/src/engine/__tests__/transform.test.ts` (new)

- [ ] **Step 1: Write the test file**

Create `packages/server/src/engine/__tests__/transform.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyTransform } from '../transform.js';
import { makePokemon } from './fixtures.js';

describe('applyTransform', () => {
  it('copies target stats (except hp), ability, stat boosts, type, and moves at 5 pp', () => {
    const user = makePokemon({ instanceId: 'user' });
    const userOriginalHp = user.stats.hp;
    const target = makePokemon({
      instanceId: 'target',
      ability: 'intimidate',
      stats: { hp: 200, atk: 120, def: 90, spa: 110, spd: 95, spe: 80 },
      statBoosts: { atk: 2, def: 0, spa: 0, spd: 0, spe: 1, accuracy: 0, evasion: 0 },
      moves: [
        { moveId: 'surf', currentPp: 10, maxPp: 15 },
        { moveId: 'dragonrush', currentPp: 15, maxPp: 15 },
        { moveId: 'ice-beam', currentPp: 5, maxPp: 10 },
        { moveId: 'splash', currentPp: 40, maxPp: 40 },
      ],
    });

    const events = applyTransform(user, 'slot-a1', target, ['Water']);

    expect(user.ability).toBe('intimidate');
    expect(user.stats).toEqual({ hp: userOriginalHp, atk: 120, def: 90, spa: 110, spd: 95, spe: 80 });
    expect(user.statBoosts).toEqual(target.statBoosts);
    expect(user.typeOverride).toEqual(['Water']);
    expect(user.moves).toEqual([
      { moveId: 'surf', currentPp: 5, maxPp: 5 },
      { moveId: 'dragonrush', currentPp: 5, maxPp: 5 },
      { moveId: 'ice-beam', currentPp: 5, maxPp: 5 },
      { moveId: 'splash', currentPp: 5, maxPp: 5 },
    ]);
    expect(user.volatileStatus.some(v => v.name === 'transformed')).toBe(true);
    expect(events).toEqual([
      { type: 'volatile-applied', data: { targetSlotId: 'slot-a1', volatile: 'transformed' } },
    ]);
  });

  it('snapshots the original form only once across repeated transforms', () => {
    const user = makePokemon({ instanceId: 'user', ability: 'blaze' });
    const originalStats = { ...user.stats };
    const originalMoves = user.moves.map(m => ({ ...m }));

    const targetA = makePokemon({
      instanceId: 'target-a', ability: 'intimidate',
      stats: { hp: 50, atk: 111, def: 50, spa: 50, spd: 50, spe: 50 },
    });
    const targetB = makePokemon({
      instanceId: 'target-b', ability: 'levitate',
      stats: { hp: 50, atk: 222, def: 50, spa: 50, spd: 50, spe: 50 },
    });

    applyTransform(user, 'slot-a1', targetA, []);
    applyTransform(user, 'slot-a1', targetB, []);

    expect(user.ability).toBe('levitate'); // latest transform wins
    expect(user.originalForm).toBeDefined();
    expect(user.originalForm!.ability).toBe('blaze'); // true original, not targetA
    expect(user.originalForm!.stats).toEqual(originalStats);
    expect(user.originalForm!.moves).toEqual(originalMoves);
  });

  it('deletes typeOverride when no target types are passed', () => {
    const user = makePokemon({ instanceId: 'user', typeOverride: ['Fire'] });
    const target = makePokemon({ instanceId: 'target' });

    applyTransform(user, 'slot-a1', target, []);

    expect(user.typeOverride).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @poke-fighter/server exec vitest run src/engine/__tests__/transform.test.ts`
Expected: FAIL — `Cannot find module '../transform.js'` (the module doesn't exist yet).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/engine/__tests__/transform.test.ts
git commit -m "$(cat <<'EOF'
test: add failing tests for applyTransform helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement `applyTransform`

**Files:**
- Create: `packages/server/src/engine/transform.ts`

- [ ] **Step 1: Write the implementation**

Create `packages/server/src/engine/transform.ts`:

```typescript
import type { PartyMember, PokemonType, TurnResolveEvent } from '@poke-fighter/shared';

export function applyTransform(
  user: PartyMember,
  userSlotId: string,
  target: PartyMember,
  targetTypes: PokemonType[],
): TurnResolveEvent[] {
  const alreadyTransformed = user.volatileStatus.some(v => v.name === 'transformed');

  // Snapshot the true original form once per stint, before the first transform.
  if (!alreadyTransformed) {
    user.originalForm = {
      stats: { ...user.stats },
      ability: user.ability,
      moves: user.moves.map(slot => ({ ...slot })) as [any, any, any, any],
      ...(user.typeOverride ? { typeOverride: [...user.typeOverride] } : {}),
    };
  }

  // Copy stats (not HP)
  user.stats = { ...target.stats, hp: user.stats.hp };

  // Copy stat boosts
  user.statBoosts = { ...target.statBoosts };

  // Copy ability
  user.ability = target.ability;

  // Copy effective types
  if (targetTypes.length > 0) {
    user.typeOverride = [...targetTypes];
  } else {
    delete user.typeOverride;
  }

  // Copy moves with PP capped at 5
  user.moves = target.moves.map(slot => ({
    moveId: slot.moveId,
    currentPp: Math.min(slot.currentPp, 5),
    maxPp: 5,
  })) as [any, any, any, any];

  if (!alreadyTransformed) {
    user.volatileStatus.push({ name: 'transformed' });
  }

  return [{ type: 'volatile-applied', data: { targetSlotId: userSlotId, volatile: 'transformed' } }];
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @poke-fighter/server exec vitest run src/engine/__tests__/transform.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @poke-fighter/server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/engine/transform.ts
git commit -m "$(cat <<'EOF'
feat: implement applyTransform shared helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Refactor the `transform` move handler to use the shared helper

**Files:**
- Modify: `packages/server/src/engine/registrations.ts:12` (imports), `:1122-1159` (handler body)

- [ ] **Step 1: Run existing Transform tests to confirm baseline**

Run: `pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "Transform"`
Expected: PASS (2 existing tests: "copies target stats, ability, and moves..." and "copies target typeOverride if present").

- [ ] **Step 2: Add the import**

In `packages/server/src/engine/registrations.ts`, after the existing import block (after line 13, `import { clearHazards, clearScreens } from './sideConditions.js';`), add:

```typescript
import { applyTransform } from './transform.js';
```

- [ ] **Step 3: Replace the handler body**

Replace the entire `r.register('transform', ...)` block (`registrations.ts:1122-1159`) with:

```typescript
  r.register('transform', (ctx) => {
    const target = ctx.targets[0];
    if (!target) {
      return { events: [{ type: 'move-failed', data: { moveId: 'transform', reason: 'no-target' } }] };
    }
    return { events: applyTransform(ctx.user, ctx.userSlotId, target, ctx.targetTypes[0] ?? []) };
  });
```

- [ ] **Step 4: Run the same tests to verify no regression**

Run: `pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "Transform"`
Expected: PASS (same 2 tests, unmodified).

- [ ] **Step 5: Run the full server test suite**

Run: `pnpm --filter @poke-fighter/server test`
Expected: PASS (no regressions anywhere, including `items-species-specific.test.ts` Quick Powder interaction).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/registrations.ts
git commit -m "$(cat <<'EOF'
refactor: delegate transform move handler to applyTransform helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Fix switch-out revert bug for Transform

**Files:**
- Test: `packages/server/src/engine/__tests__/metaMoves.test.ts` (append to `describe('Transform', ...)` block, after the test ending at line 734)
- Modify: `packages/server/src/engine/BattleEngine.ts:2433-2443` (switch-out cleanup block)

- [ ] **Step 1: Write the failing test**

In `packages/server/src/engine/__tests__/metaMoves.test.ts`, inside the existing `describe('Transform', () => { ... })` block, add this test right before the closing `});` (after the test that ends at line 734):

```typescript
  it('reverts stats, ability, type, and moves when the transformed Pokémon switches out', () => {
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'transform', currentPp: 10, maxPp: 10 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'intimidate';
    p2.typeOverride = ['Water', 'Dragon'];
    p2.stats = { hp: 100, atk: 120, def: 100, spa: 100, spd: 100, spe: 80 };

    const engine = new BattleEngine({ rng: () => 0.5 });

    // Turn 1: p1 transforms into p2
    const turn1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Transform
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost (harmless)
    });

    const p1Transformed = turn1.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1Transformed.ability).toBe('intimidate');
    expect(p1Transformed.typeOverride).toEqual(['Water', 'Dragon']);

    // Turn 2: p1 switches out to its bench mon
    const turn2 = engine.resolveTurn(turn1.newState, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost (harmless)
    });

    const p1Reverted = turn2.newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === p1.instanceId)!;
    expect(p1Reverted.ability).toBe('blaze'); // original Charizard ability from makePokemon default
    expect(p1Reverted.stats).toEqual({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 200 });
    expect(p1Reverted.moves).toEqual([
      { moveId: 'transform', currentPp: 9, maxPp: 10 }, // 1 PP spent using it turn 1
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ]);
    expect(p1Reverted.typeOverride).toBeUndefined();
    expect(p1Reverted.volatileStatus.some(v => v.name === 'transformed')).toBe(false);
    expect(p1Reverted.originalForm).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "reverts stats, ability, type, and moves"`
Expected: FAIL — `p1Reverted.ability` is `'intimidate'` (not reverted), not `'blaze'`.

- [ ] **Step 3: Implement the revert logic**

In `packages/server/src/engine/BattleEngine.ts`, find the "2. Switch-out cleanup" block (`BattleEngine.ts:2433-2443`):

```typescript
    // 2. Switch-out cleanup
    if (outgoing) {
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
        !SWITCH_CLEAR_NAMES.has(v.name) &&
        !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
      );
      outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      delete outgoing.lastMoveId;
      delete outgoing.tracedAbilityId;
      delete outgoing.lockedMoveId;
    }
```

Replace it with:

```typescript
    // 2. Switch-out cleanup
    if (outgoing) {
      if (outgoing.originalForm) {
        outgoing.stats = outgoing.originalForm.stats;
        outgoing.ability = outgoing.originalForm.ability;
        outgoing.moves = outgoing.originalForm.moves;
        if (outgoing.originalForm.typeOverride) {
          outgoing.typeOverride = outgoing.originalForm.typeOverride;
        } else {
          delete outgoing.typeOverride;
        }
        delete outgoing.originalForm;
        outgoing.volatileStatus = outgoing.volatileStatus.filter(v => v.name !== 'transformed');
      }
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
        !SWITCH_CLEAR_NAMES.has(v.name) &&
        !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
      );
      outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      delete outgoing.lastMoveId;
      delete outgoing.tracedAbilityId;
      delete outgoing.lockedMoveId;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "reverts stats, ability, type, and moves"`
Expected: PASS.

- [ ] **Step 5: Run the full server test suite**

Run: `pnpm --filter @poke-fighter/server test`
Expected: PASS (no regressions — every other switch-out path has no `originalForm`, so this branch is a no-op for them).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/metaMoves.test.ts
git commit -m "$(cat <<'EOF'
fix: revert Transform's stat/ability/type/move changes on switch-out

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Implement the Imposter ability

**Files:**
- Test: `packages/server/src/engine/__tests__/abilities.test.ts` (append new `describe('Imposter', ...)` block at end of file)
- Modify: `packages/server/src/engine/abilities.ts` (add `transform` field to `SwitchInResult`, register `imposter` hook)
- Modify: `packages/server/src/engine/BattleEngine.ts` (import `applyTransform`; add `transform` branch to `applySwitchInResult`)

- [ ] **Step 1: Write the failing tests**

Append to the end of `packages/server/src/engine/__tests__/abilities.test.ts`:

```typescript
describe('Imposter', () => {
  it('transforms into the foe\'s active Pokémon on switch-in', () => {
    const state = make1v1State();
    const ditto = makePokemon({
      instanceId: 'p1-bench',
      speciesName: 'ditto',
      ability: 'imposter',
      stats: { hp: 48, atk: 48, def: 48, spa: 48, spd: 48, spe: 48 },
    });
    state.teams[0]!.slots[0]!.party.push(ditto);

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'intimidate';
    p2.statBoosts = { ...p2.statBoosts, atk: 2 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost (harmless)
    });

    const dittoAfter = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(dittoAfter.ability).toBe('intimidate');
    expect(dittoAfter.stats).toEqual({ hp: 48, atk: 100, def: 100, spa: 100, spd: 100, spe: 80 });
    expect(dittoAfter.statBoosts.atk).toBe(2);
    expect(dittoAfter.moves.every(m => m.maxPp === 5)).toBe(true);
    expect(dittoAfter.volatileStatus.some(v => v.name === 'transformed')).toBe(true);
    expect(events.some(e => e.type === 'ability-triggered' && e.data['ability'] === 'imposter')).toBe(true);
  });

  it('does not transform when the foe is behind a substitute', () => {
    const state = make1v1State();
    const ditto = makePokemon({ instanceId: 'p1-bench', ability: 'imposter' });
    state.teams[0]!.slots[0]!.party.push(ditto);

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.volatileStatus.push({ name: 'substitute', hp: 25 });

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const dittoAfter = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(dittoAfter.ability).toBe('imposter');
    expect(dittoAfter.volatileStatus.some(v => v.name === 'transformed')).toBe(false);
  });

  it('does not transform when there is no live foe to copy', () => {
    const state = make1v1State();
    const ditto = makePokemon({ instanceId: 'p1-bench', ability: 'imposter' });
    state.teams[0]!.slots[0]!.party.push(ditto);
    state.teams[1]!.slots[0]!.party[0]!.fainted = true;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
    });

    const dittoAfter = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(dittoAfter.ability).toBe('imposter');
    expect(dittoAfter.volatileStatus.some(v => v.name === 'transformed')).toBe(false);
  });

  it('reverts to its original form when it switches out', () => {
    const state = make1v1State();
    const ditto = makePokemon({
      instanceId: 'p1-bench',
      ability: 'imposter',
      stats: { hp: 48, atk: 48, def: 48, spa: 48, spd: 48, spe: 48 },
    });
    const dittoOriginalStats = { ...ditto.stats };
    state.teams[0]!.slots[0]!.party.push(ditto);

    const secondBench = makePokemon({ instanceId: 'p1-bench-2' });
    state.teams[0]!.slots[0]!.party.push(secondBench);

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'intimidate';

    const engine = new BattleEngine({ rng: () => 0.5 });

    const turn1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const turn2 = engine.resolveTurn(turn1.newState, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench-2' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const dittoAfter = turn2.newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench')!;
    expect(dittoAfter.ability).toBe('imposter');
    expect(dittoAfter.stats).toEqual(dittoOriginalStats);
    expect(dittoAfter.volatileStatus.some(v => v.name === 'transformed')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "Imposter"`
Expected: FAIL (4 tests) — Imposter's `ability` never changes to `'intimidate'` since no hook is wired up yet.

- [ ] **Step 3: Add `transform` to `SwitchInResult` and register the `imposter` hook**

In `packages/server/src/engine/abilities.ts`, update the `SwitchInResult` interface (lines 21-27):

```typescript
export interface SwitchInResult {
  statBoostDeltas?: Partial<StatBoosts>;      // applied to all active foes (Intimidate)
  selfBoostDeltas?: Partial<StatBoosts>;      // applied to switching-in Pokémon (Download)
  traceAbilityId?: string;                   // sets tracedAbilityId on incoming Pokémon (Trace)
  clearScreens?: boolean;                    // removes Reflect/Light Screen/Aurora Veil from both sides (Screen Cleaner)
  setWeather?: { type: WeatherType; turnsRemaining: number; permanent?: boolean };
  transform?: true;                          // transform into the opposing active Pokémon (Imposter)
}
```

Then add the hook registration in `ABILITY_HOOKS`, right after the `'delta-stream'` entry (`abilities.ts:393-397`):

```typescript
  'delta-stream': {
    onSwitchIn: () => ({
      setWeather: { type: 'strong-winds' as WeatherType, turnsRemaining: 999, permanent: true },
    }),
  },
  imposter: {
    onSwitchIn: () => ({ transform: true }),
  },
```

- [ ] **Step 4: Wire up the `transform` branch in `applySwitchInResult`**

In `packages/server/src/engine/BattleEngine.ts`, add the import next to the existing abilities import (`BattleEngine.ts:11-12`):

```typescript
import { getAbilityHooks, effectiveAbilityId } from './abilities.js';
import type { SwitchInResult } from './abilities.js';
import { applyTransform } from './transform.js';
```

Then, inside `applySwitchInResult` (`BattleEngine.ts:2562+`), add a new branch after the existing "Handle Trace" block (after the closing brace that follows line ~2622, still inside the method, before its final closing brace):

```typescript
    // Imposter: transform into the opposing active Pokémon
    if (result.transform) {
      const incomingTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIndex = incomingTeamIndex === 0 ? 1 : 0;
      const foeTeam = s.teams[foeTeamIndex];
      const foeSlot = foeTeam?.slots[0];
      const foeMon = foeSlot?.party[foeSlot.activePokemonIndex];
      const foeBehindSub = foeMon?.volatileStatus.some(v => v.name === 'substitute') ?? false;
      if (foeMon && !foeMon.fainted && !foeBehindSub) {
        const foeTypes = this.resolveEffectiveTypes(foeMon);
        events.push(...applyTransform(incoming, slotId, foeMon, foeTypes));
        events.push({ type: 'ability-triggered', data: { slotId, ability: 'imposter', effect: 'transform' } });
      }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @poke-fighter/server exec vitest run --reporter=verbose -t "Imposter"`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @poke-fighter/server typecheck`
Expected: PASS.

- [ ] **Step 7: Run the full server test suite**

Run: `pnpm --filter @poke-fighter/server test`
Expected: PASS (no regressions).

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/engine/abilities.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/abilities.test.ts
git commit -m "$(cat <<'EOF'
feat: implement Imposter ability

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full-repo verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite across all packages**

Run: `pnpm test`
Expected: PASS across `@poke-fighter/shared`, `@poke-fighter/server`, `@poke-fighter/client`.

- [ ] **Step 2: Run full typecheck across all packages**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run full build to confirm nothing is broken downstream**

Run: `pnpm build`
Expected: PASS (shared builds first, then server/client build against it cleanly).

No commit for this task — it's a verification-only checkpoint. If anything fails, fix it and re-run before considering the plan complete.
