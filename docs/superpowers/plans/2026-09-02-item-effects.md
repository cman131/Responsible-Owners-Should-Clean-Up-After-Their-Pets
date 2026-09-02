# Item Effects — Remaining Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining item effects backlog: 2 new `ItemHooks` entries (`onHealAfterAttack`, `onAccuracyModifier`), wired call sites in `BattleEngine`, and 23 items total (Shell Bell; Wide Lens, Zoom Lens, Bright Powder; 18 type-boosters + Expert Belt).

**Architecture:** TDD throughout. Task 1 adds `onHealAfterAttack` + Shell Bell + passes `order: string[]` to `executeMove` (needed by Task 2). Task 2 adds `onAccuracyModifier` + three accuracy items. Task 3 adds all type-booster items with no engine changes — pure data.

**Tech Stack:** TypeScript, Vitest. All changes in `packages/server`. Test command: `cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | tail -20`. Full suite: `cd packages/server && npm test 2>&1 | tail -20`. Typecheck: `cd packages/server && npm run typecheck 2>&1 | tail -20`.

**Damage reference** (L50, all stats=100, `rng()=0.5` → damage factor 0.93):
- Tackle BP40 neutral: **17** hp
- Flamethrower BP90, STAB, vs Charizard (Fire, 0.5×): **28** hp
- Surf BP90, no STAB, vs Charizard (Fire/Flying, 2×): **76** hp

---

### Task 1: `onHealAfterAttack` hook + Shell Bell + pass `order` to `executeMove`

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Test: `packages/server/src/engine/__tests__/items.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `packages/server/src/engine/__tests__/items.test.ts`:

```typescript
describe('Shell Bell', () => {
  it('heals attacker floor(damage/8) after dealing damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 50; // not at full HP so there is room to heal
    p1.heldItem = 'shell-bell';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    // Tackle deals 17 damage. Shell Bell heals floor(17/8) = 2 HP.
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(52);
  });

  it('does not heal beyond maxHp', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    // p1 already at full HP — shell bell heal (2) is capped to 0 headroom
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'shell-bell';
    state.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | grep -E "FAIL|×|Shell Bell" | head -10
```
Expected: both Shell Bell tests FAIL — `shell-bell` not in `ITEM_HOOKS` yet.

- [ ] **Step 3: Add `onHealAfterAttack` to `ItemHooks` interface and add Shell Bell entry**

In `packages/server/src/engine/items.ts`, add `Move` to the import:

```typescript
import type { PartyMember, BattleState, PokemonType, StatBoosts, Move } from '@poke-fighter/shared';
```

Add two new hooks to the `ItemHooks` interface (after `drainMultiplier`):

```typescript
  onHealAfterAttack?: (ctx: ItemAttackContext & { damageDealt: number }) => { hpDelta: number };
  onAccuracyModifier?: (ctx: ItemContext & { move: Move; isFirst: boolean }) => number;
```

Add the Shell Bell entry to `ITEM_HOOKS` (before the inline stubs at the bottom):

```typescript
  'shell-bell': {
    onHealAfterAttack: ({ damageDealt }) => ({ hpDelta: Math.floor(damageDealt / 8) }),
  },
```

- [ ] **Step 4: Pass `order: string[]` to `executeMove` and wire the Shell Bell call site**

In `packages/server/src/engine/BattleEngine.ts`, update the `executeMove` signature:

```typescript
  private executeMove(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction,
    movedSlotIds: Set<string>,
    order: string[],
  ): MoveResult {
```

Update both call sites to pass `order`:

First call site (~line 87, inside `resolveTurn`):
```typescript
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds, order);
```

Second call site (~line 960, inside `resumeTurn`):
```typescript
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds, remainingSlotOrder);
```

Now add the Shell Bell trigger inside `executeMove`. Find the `// Post-hit item triggers (Rocky Helmet, Air Balloon pop, Weakness Policy)` comment block (around line 829). Insert **before** that block:

```typescript
      // Shell Bell — heal attacker after dealing damage
      if (totalDamage > 0 && !attacker.fainted) {
        const sbResult = getItemHooks(attacker.heldItem).onHealAfterAttack?.({
          holder: attacker,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target,
          isPhysical,
          damageDealt: totalDamage,
        });
        if (sbResult && sbResult.hpDelta > 0) {
          const healed = Math.min(sbResult.hpDelta, attacker.maxHp - attacker.currentHp);
          if (healed > 0) {
            attacker.currentHp += healed;
            events.push({ type: 'heal', data: { slotId: attackerSlotId, amount: healed, remainingHp: attacker.currentHp } });
          }
        }
      }
```

- [ ] **Step 5: Run tests and typecheck**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | tail -20
```
Expected: all tests pass, including the two new Shell Bell tests.

```
cd packages/server && npm run typecheck 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 6: Run full suite**

```
cd packages/server && npm test 2>&1 | tail -10
```
Expected: all tests pass, no regressions.

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: add onHealAfterAttack and onAccuracyModifier hooks; implement Shell Bell"
```

---

### Task 2: `onAccuracyModifier` hook call site + Wide Lens, Zoom Lens, Bright Powder

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Test: `packages/server/src/engine/__tests__/items.test.ts`

**Note:** The `ItemHooks` interface entry for `onAccuracyModifier` was added in Task 1. This task adds the call site and the three item entries.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `packages/server/src/engine/__tests__/items.test.ts`:

```typescript
describe('Wide Lens', () => {
  it('boosts accuracy ×1.1 — willowisp (85%) hits at rng=0.88 when holder has Wide Lens', () => {
    // rng=0.88: 88 >= 85 → miss without Wide Lens; floor(85*1.1)=93, 88 < 93 → hit with Wide Lens
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'wide-lens';
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1; // Bulbasaur (Grass/Poison) — not immune to burn
    p2.ability = 'overgrow';
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('without Wide Lens — willowisp misses at rng=0.88', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1;
    p2.ability = 'overgrow';
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('Zoom Lens', () => {
  it('boosts accuracy when holder moves second — willowisp hits at rng=0.88', () => {
    // p2 (spe=80) moves after p1 (spe=100) → isFirst=false → Zoom Lens activates
    // floor(85*1.2)=102 → capped to 100 → always hits at rng=0.88
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.speciesId = 1; // Bulbasaur — not immune to burn
    p1.ability = 'overgrow';
    // p2 uses willowisp (move index 3), holds Zoom Lens
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'zoom-lens';
    // p1 uses roost (move index 2) — no accuracy roll involved for its action
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 },              // roost — self-target, no accuracy roll
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' }, // willowisp
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('does not boost accuracy when holder moves first', () => {
    // p1 (spe=100) moves before p2 (spe=80) → isFirst=true → Zoom Lens does not activate
    // 85% accuracy, rng=0.88: 88 >= 85 → miss
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1; // not immune to burn
    p2.ability = 'overgrow';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'zoom-lens';
    const engine = new BattleEngine({ rng: () => 0.88 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('Bright Powder', () => {
  it('reduces attacker accuracy ×0.9 — willowisp (85%) misses at rng=0.78 when defender holds it', () => {
    // floor(85*0.9)=76, rng=0.78: 78 >= 76 → MISS; without Bright Powder: 78 < 85 → hit
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1; // not immune to burn
    p2.ability = 'overgrow';
    p2.heldItem = 'bright-powder';
    const engine = new BattleEngine({ rng: () => 0.78 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });

  it('without Bright Powder — willowisp hits at rng=0.78', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.speciesId = 1;
    p2.ability = 'overgrow';
    const engine = new BattleEngine({ rng: () => 0.78 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('brn');
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | grep -E "FAIL|×|Wide Lens|Zoom Lens|Bright Powder" | head -15
```
Expected: all six new tests FAIL — hooks not wired in `BattleEngine` yet.

- [ ] **Step 3: Add the three item entries to `ITEM_HOOKS`**

In `packages/server/src/engine/items.ts`, add these entries to `ITEM_HOOKS` (before the inline stubs):

```typescript
  'wide-lens': {
    onAccuracyModifier: () => 1.1,
  },
  'zoom-lens': {
    onAccuracyModifier: ({ isFirst }) => isFirst ? 1 : 1.2,
  },
  'bright-powder': {
    onAccuracyModifier: () => 0.9,
  },
```

- [ ] **Step 4: Wire `onAccuracyModifier` call site in `BattleEngine`**

In `packages/server/src/engine/BattleEngine.ts`, inside `executeMove`, find the accuracy check block. It currently looks like this (around line 333–340):

```typescript
      // Gravity boosts all move accuracy by 5/3
      if (s.field.gravity > 0 && hitChance !== 'always') {
        hitChance = Math.min(100, Math.floor((hitChance as number) * 5 / 3));
      }
      if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
        events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
        return { newState: s, events };
      }
```

Insert the following block **between** the gravity block and the miss check:

```typescript
      // Item-based accuracy modifiers (Wide Lens, Zoom Lens, Bright Powder)
      if (typeof hitChance === 'number') {
        const primaryTargetSlotId = targetSlotIds[0] ?? '';
        const isFirst = order.indexOf(attackerSlotId) < order.indexOf(primaryTargetSlotId);
        const attItemMod = getItemHooks(attacker.heldItem).onAccuracyModifier?.({
          holder: attacker, state: s, move, isFirst,
        });
        if (attItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * attItemMod));
        if (targetSlotIds.length === 1) {
          const tSlot = this.findSlot(s, primaryTargetSlotId);
          const tMon = tSlot?.party[tSlot.activePokemonIndex];
          if (tMon) {
            const defItemMod = getItemHooks(tMon.heldItem).onAccuracyModifier?.({
              holder: tMon, state: s, move, isFirst,
            });
            if (defItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * defItemMod));
          }
        }
      }
```

- [ ] **Step 5: Run tests and typecheck**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | tail -20
```
Expected: all tests pass.

```
cd packages/server && npm run typecheck 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 6: Run full suite**

```
cd packages/server && npm test 2>&1 | tail -10
```
Expected: all tests pass, no regressions.

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: wire onAccuracyModifier call site; implement Wide Lens, Zoom Lens, Bright Powder"
```

---

### Task 3: Tier 1 type-boosters + Expert Belt

**Files:**
- Modify: `packages/server/src/engine/items.ts`
- Test: `packages/server/src/engine/__tests__/items.test.ts`

No engine changes required — these items all use the existing `onAttackerModifier` and `onDamageModifier` hooks.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `packages/server/src/engine/__tests__/items.test.ts`:

```typescript
describe('Charcoal', () => {
  it('boosts Fire move damage ×1.2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new BattleEngine({ rng: () => 0.5 });

    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'charcoal';
    stateWith.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withCharcoal } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const stateWithout = make1v1State();
    stateWithout.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withoutCharcoal } = engine.resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const dmgWith = 100 - withCharcoal.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - withoutCharcoal.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgWith).toBe(Math.floor(dmgWithout * 1.2));
  });

  it('does not boost Water move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new BattleEngine({ rng: () => 0.5 });

    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'charcoal';
    stateWith.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withCharcoal } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    stateWithout.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withoutCharcoal } = engine.resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(withCharcoal.teams[1]!.slots[0]!.party[0]!.currentHp)
      .toBe(withoutCharcoal.teams[1]!.slots[0]!.party[0]!.currentHp);
  });
});

describe('Expert Belt', () => {
  it('boosts super-effective damage ×1.2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Surf is 2× effective vs Charizard (Fire/Flying)
    const engine = new BattleEngine({ rng: () => 0.5 });

    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'expert-belt';
    stateWith.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withEB } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    stateWithout.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withoutEB } = engine.resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const dmgWith = 100 - withEB.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - withoutEB.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgWith).toBe(Math.floor(dmgWithout * 1.2));
  });

  it('does not boost neutral hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new BattleEngine({ rng: () => 0.5 });

    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'expert-belt';
    stateWith.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withEB } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    stateWithout.teams[1]!.slots[0]!.party[0]!.moves[2] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    const { newState: withoutEB } = engine.resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 2 },
    });

    expect(withEB.teams[1]!.slots[0]!.party[0]!.currentHp)
      .toBe(withoutEB.teams[1]!.slots[0]!.party[0]!.currentHp);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | grep -E "FAIL|×|Charcoal|Expert Belt" | head -10
```
Expected: all four new tests FAIL — `charcoal` and `expert-belt` not in `ITEM_HOOKS` yet.

- [ ] **Step 3: Add all type-booster entries + Expert Belt to `ITEM_HOOKS`**

In `packages/server/src/engine/items.ts`, add the following entries to `ITEM_HOOKS` (before the inline stubs). All type-boosters use `onAttackerModifier`; Expert Belt uses `onDamageModifier`:

```typescript
  // Type-boosting items (×1.2 for matching move type)
  charcoal:         { onAttackerModifier: ({ moveType }) => moveType === 'Fire'     ? 1.2 : 1 },
  'mystic-water':   { onAttackerModifier: ({ moveType }) => moveType === 'Water'    ? 1.2 : 1 },
  'miracle-seed':   { onAttackerModifier: ({ moveType }) => moveType === 'Grass'    ? 1.2 : 1 },
  magnet:           { onAttackerModifier: ({ moveType }) => moveType === 'Electric' ? 1.2 : 1 },
  'never-melt-ice': { onAttackerModifier: ({ moveType }) => moveType === 'Ice'      ? 1.2 : 1 },
  'twisted-spoon':  { onAttackerModifier: ({ moveType }) => moveType === 'Psychic'  ? 1.2 : 1 },
  'black-belt':     { onAttackerModifier: ({ moveType }) => moveType === 'Fighting' ? 1.2 : 1 },
  'poison-barb':    { onAttackerModifier: ({ moveType }) => moveType === 'Poison'   ? 1.2 : 1 },
  'soft-sand':      { onAttackerModifier: ({ moveType }) => moveType === 'Ground'   ? 1.2 : 1 },
  'sharp-beak':     { onAttackerModifier: ({ moveType }) => moveType === 'Flying'   ? 1.2 : 1 },
  'silver-powder':  { onAttackerModifier: ({ moveType }) => moveType === 'Bug'      ? 1.2 : 1 },
  'hard-stone':     { onAttackerModifier: ({ moveType }) => moveType === 'Rock'     ? 1.2 : 1 },
  'spell-tag':      { onAttackerModifier: ({ moveType }) => moveType === 'Ghost'    ? 1.2 : 1 },
  'dragon-fang':    { onAttackerModifier: ({ moveType }) => moveType === 'Dragon'   ? 1.2 : 1 },
  'black-glasses':  { onAttackerModifier: ({ moveType }) => moveType === 'Dark'     ? 1.2 : 1 },
  'metal-coat':     { onAttackerModifier: ({ moveType }) => moveType === 'Steel'    ? 1.2 : 1 },
  'silk-scarf':     { onAttackerModifier: ({ moveType }) => moveType === 'Normal'   ? 1.2 : 1 },
  'fairy-feather':  { onAttackerModifier: ({ moveType }) => moveType === 'Fairy'    ? 1.2 : 1 },
  // Expert Belt: ×1.2 on super-effective hits
  'expert-belt':    { onDamageModifier: ({ effectiveness }) => effectiveness > 1 ? 1.2 : 1 },
```

- [ ] **Step 4: Run tests and typecheck**

```
cd packages/server && npx vitest run src/engine/__tests__/items.test.ts 2>&1 | tail -20
```
Expected: all tests pass.

```
cd packages/server && npm run typecheck 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npm test 2>&1 | tail -10
```
Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/items.ts packages/server/src/engine/__tests__/items.test.ts
git commit -m "feat: implement 18 type-booster items and Expert Belt"
```
