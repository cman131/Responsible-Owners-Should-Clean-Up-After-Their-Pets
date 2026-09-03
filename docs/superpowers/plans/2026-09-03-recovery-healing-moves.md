# Recovery & Healing Status Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register handlers for all healing/recovery moves in `registrations.ts`, adding infrastructure for Wish (slot-level delayed heal), Healing Wish/Lunar Dance (self-faint + next-ally heal), and Rest (forced sleep counter).

**Architecture:** Most moves use `custom()` or existing `healPercent()` from `effectFactories.ts`. Wish stores `{ hp, turnsRemaining }` on `SlotState` (slot survives switches); BattleEngine's EoT loop resolves it. Healing Wish/Lunar Dance set `pendingHeal` on `SlotState`; the switch-in path consumes it. Rest is fully inline — no `applyStatus` modification needed. All tests go in a new `healingMoves.test.ts`.

**Tech Stack:** TypeScript, Vitest — `packages/server` only (plus one type change in `packages/shared`).

**Test commands:** `cd packages/server && npm test` (all tests). Single file: `npx vitest run src/engine/__tests__/healingMoves.test.ts`.

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types/battle.ts` | Add `wish?` and `pendingHeal?` to `SlotState` |
| `packages/server/src/engine/effectFactories.ts` | Add `cureTeamStatus()` and `wish()` exports |
| `packages/server/src/engine/registrations.ts` | Register all new moves; import new factories + `getEffectiveStat` |
| `packages/server/src/engine/BattleEngine.ts` | Wish EoT resolution + `pendingHeal` switch-in hook |
| `packages/server/src/engine/__tests__/healingMoves.test.ts` | New — all healing move tests |

---

### Task 1: Extend SlotState for Wish and Healing Wish

**Files:**
- Modify: `packages/shared/src/types/battle.ts`

- [ ] **Step 1:** Open `packages/shared/src/types/battle.ts`. Find the `SlotState` interface (currently ends at `activePokemonIndex: number;`). Add two optional fields:

```typescript
export interface SlotState {
  slotId: string;
  displayName: string;
  isNpc: boolean;
  isSpectator: boolean;
  party: PartyMember[];
  activePokemonIndex: number;
  wish?: { hp: number; turnsRemaining: number };
  pendingHeal?: 'healingwish' | 'lunardance';
}
```

- [ ] **Step 2:** Run the full test suite to verify no regressions:

```
cd packages/server && npm test
```

Expected: all existing tests pass (the new optional fields are non-breaking).

- [ ] **Step 3:** Commit:

```bash
git add packages/shared/src/types/battle.ts
git commit -m "feat: add wish and pendingHeal to SlotState for delayed-heal mechanics"
```

---

### Task 2: Simple Percentage Heals (slackoff, shoreup, morningsun)

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Create: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Create `packages/server/src/engine/__tests__/healingMoves.test.ts` with the first tests:

```typescript
import { describe, it, expect } from 'vitest';
import { buildDefaultRegistry } from '../registrations.js';
import { makePokemon, make1v1State } from './fixtures.js';
import type { MoveContext } from '../MoveEffectRegistry.js';
import type { Move } from '@poke-fighter/shared';

function makeCtx(overrides: Partial<MoveContext> = {}): MoveContext {
  const state = make1v1State();
  return {
    battle: state,
    user: state.teams[0]!.slots[0]!.party[0]!,
    userSlotId: 'slot-a1',
    userTeamIndex: 0,
    targets: [state.teams[1]!.slots[0]!.party[0]!],
    targetSlotIds: ['slot-b1'],
    targetTypes: [['Normal']],
    move: { id: 'test', effectId: 'test' } as Move,
    rng: () => 0.5,
    ...overrides,
  };
}

const registry = buildDefaultRegistry();

function invoke(moveId: string, ctxOverrides: Partial<MoveContext> = {}) {
  const handler = registry.get(moveId);
  if (!handler) throw new Error(`No handler for ${moveId}`);
  return handler(makeCtx(ctxOverrides));
}

describe('slackoff', () => {
  it('heals 50% of max HP', () => {
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('slackoff', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(200);
    expect(events[0]!.type).toBe('heal');
    expect(events[0]!.data['amount']).toBe(100);
  });

  it('does not overheal past max HP', () => {
    const user = makePokemon({ maxHp: 200, currentHp: 180 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('slackoff', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(200);
    expect(events[0]!.data['amount']).toBe(20);
  });
});

describe('shoreup', () => {
  it('heals 50% of max HP with no weather', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('shoreup', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(100);
    expect(events.some(e => e.type === 'heal')).toBe(true);
  });
});

describe('morningsun', () => {
  it('heals 50% of max HP with no weather', () => {
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0] = user;
    const { events } = invoke('morningsun', {
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
    });
    expect(user.currentHp).toBe(100);
    expect(events.some(e => e.type === 'heal')).toBe(true);
  });
});
```

- [ ] **Step 2:** Run to confirm it fails (moves not registered yet):

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: FAIL — `No handler for slackoff`.

- [ ] **Step 3:** Open `packages/server/src/engine/registrations.ts`. Find the `// ── Heals` section (around line 88) and add three registrations after `synthesis`:

```typescript
  r.register('slackoff',    healPercent(0.5));
  r.register('shoreup',     healPercent(0.5)); // weather variant added in Task 10
  r.register('morningsun',  healPercent(0.5)); // weather variant added in Task 10
```

- [ ] **Step 4:** Run the new tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS (all three describe blocks).

- [ ] **Step 5:** Commit:

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: register slackoff, shoreup, morningsun (simple 50% heals)"
```

---

### Task 3: cureTeamStatus Factory + Aromatherapy / Heal Bell

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests to `healingMoves.test.ts`:

```typescript
describe('aromatherapy', () => {
  it('cures status of all non-fainted party members on the user team', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'brn' as const });
    const mon2 = makePokemon({ instanceId: 'a2', status: 'par' as const });
    const mon3 = makePokemon({ instanceId: 'a3', status: 'psn' as const });
    state.teams[0]!.slots[0]!.party = [mon1, mon2, mon3];

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state,
      user: mon1,
      userSlotId: 'slot-a1',
      userTeamIndex: 0,
    };
    const handler = registry.get('aromatherapy')!;
    handler(ctx);

    expect(mon1.status).toBeUndefined();
    expect(mon2.status).toBeUndefined();
    expect(mon3.status).toBeUndefined();
  });

  it('emits a status-cured event for each cured pokemon', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'brn' as const });
    const mon2 = makePokemon({ instanceId: 'a2', status: 'par' as const });
    state.teams[0]!.slots[0]!.party = [mon1, mon2];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('aromatherapy')!(ctx);

    expect(events.filter(e => e.type === 'status-cured')).toHaveLength(2);
  });

  it('does not affect fainted party members', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1' });
    const mon2 = makePokemon({ instanceId: 'a2', status: 'brn' as const, fainted: true });
    state.teams[0]!.slots[0]!.party = [mon1, mon2];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('aromatherapy')!(ctx);

    expect(mon2.status).toBe('brn');
  });

  it('clears the toxic volatile counter', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'tox' as const, volatileStatus: [{ name: 'toxic', counter: 3 }] });
    state.teams[0]!.slots[0]!.party = [mon1];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('aromatherapy')!(ctx);

    expect(mon1.status).toBeUndefined();
    expect(mon1.volatileStatus.some(v => v.name === 'toxic')).toBe(false);
  });
});

describe('healbell', () => {
  it('cures status of all non-fainted party members (same as aromatherapy)', () => {
    const state = make1v1State();
    const mon1 = makePokemon({ instanceId: 'a1', status: 'slp' as const });
    state.teams[0]!.slots[0]!.party = [mon1];

    const ctx: MoveContext = { ...makeCtx(), battle: state, user: mon1, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('healbell')!(ctx);

    expect(mon1.status).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: FAIL — `No handler for aromatherapy`.

- [ ] **Step 3:** Add `cureTeamStatus` to `packages/server/src/engine/effectFactories.ts` (add before the closing of the file, after `healBlockFactory`):

```typescript
export function cureTeamStatus(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (const slot of ctx.battle.teams[ctx.userTeamIndex]!.slots) {
      for (const mon of slot.party) {
        if (!mon.fainted && mon.status) {
          const old = mon.status;
          delete mon.status;
          mon.volatileStatus = mon.volatileStatus.filter(v => v.name !== 'toxic');
          events.push({ type: 'status-cured', data: { slotId: slot.slotId, status: old, reason: 'move' } });
        }
      }
    }
    return { events };
  };
}
```

- [ ] **Step 4:** In `registrations.ts`, add `cureTeamStatus` to the import line from `./effectFactories.js`:

```typescript
import {
  statModSelf, statModTarget, multiStatModSelf,
  applyStatusTarget, applyVolatileTarget, applyVolatileSelf, healPercent,
  setWeather, setTerrain, setSideCondition, trickRoom, gravity, custom,
  protect, endure, substitute, disable, taunt, encore, torment,
  aquaRing, ingrain, magnetRise, perishSong, destinyBond, roost,
  embargoFactory, healBlockFactory, cureTeamStatus,
} from './effectFactories.js';
```

Then add the registrations in the `// ── Heals` section:

```typescript
  r.register('aromatherapy', cureTeamStatus());
  r.register('healbell',     cureTeamStatus());
```

- [ ] **Step 5:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 6:** Commit:

```bash
git add packages/server/src/engine/effectFactories.ts \
        packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: add cureTeamStatus factory, register aromatherapy and healbell"
```

---

### Task 4: Wish (Factory + BattleEngine EoT Resolution)

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests to `healingMoves.test.ts`. These tests exercise the factory (unit) and the EoT hook (integration via BattleEngine):

```typescript
import { BattleEngine } from '../BattleEngine.js';

describe('wish', () => {
  it('sets slot.wish with half of user max HP and turnsRemaining=1', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 200 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('wish')!(ctx);

    expect(state.teams[0]!.slots[0]!.wish).toEqual({ hp: 100, turnsRemaining: 1 });
  });

  it('heals the active pokemon at end of next turn', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1', maxHp: 200, currentHp: 100 });
    const foe = makePokemon({ instanceId: 'p2' });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = foe;
    // Simulate: wish was used last turn, now at turnsRemaining=1
    state.teams[0]!.slots[0]!.wish = { hp: 100, turnsRemaining: 1 };

    const engine = new BattleEngine();
    // Both Pokemon use a registered move (willowisp on foe; foe uses any registered move)
    // We need a no-op move. Use 'protect' on self for foe, and any move for user.
    // Simplest: both use willowisp (it may miss, but the EoT still runs)
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-b1' }, // willowisp
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' }, // willowisp
    });

    const healed = newState.teams[0]!.slots[0]!.party[0]!;
    expect(healed.currentHp).toBe(200);
    expect(newState.teams[0]!.slots[0]!.wish).toBeUndefined();
  });

  it('does not heal if slot Pokemon is fainted when wish resolves', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1', maxHp: 200, currentHp: 0, fainted: true });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[0]!.slots[0]!.wish = { hp: 100, turnsRemaining: 1 };

    // Fainted pokemon: EoT loop skips them but still needs to decrement/clear wish
    // Just test state doesn't crash and wish is cleared
    const engine = new BattleEngine();
    const foe = state.teams[1]!.slots[0]!.party[0]!;
    // Only foe acts since user is fainted
    const { newState } = engine.resolveTurn(state, {
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });

    expect(newState.teams[0]!.slots[0]!.wish).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: FAIL — `No handler for wish`.

- [ ] **Step 3:** Add `wish` factory to `packages/server/src/engine/effectFactories.ts`:

```typescript
export function wish(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'heal-block')) {
      return { events: [{ type: 'move-failed', data: { moveId: 'wish', reason: 'heal-blocked' } }] };
    }
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    if (!userSlot) return { events: [] };
    userSlot.wish = { hp: Math.floor(ctx.user.maxHp / 2), turnsRemaining: 1 };
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'wish' } }] };
  };
}
```

- [ ] **Step 4:** Add `wish` to the import in `registrations.ts`:

```typescript
import {
  statModSelf, statModTarget, multiStatModSelf,
  applyStatusTarget, applyVolatileTarget, applyVolatileSelf, healPercent,
  setWeather, setTerrain, setSideCondition, trickRoom, gravity, custom,
  protect, endure, substitute, disable, taunt, encore, torment,
  aquaRing, ingrain, magnetRise, perishSong, destinyBond, roost,
  embargoFactory, healBlockFactory, cureTeamStatus, wish,
} from './effectFactories.js';
```

Then register wish in the heals section:

```typescript
  r.register('wish', wish());
```

- [ ] **Step 5:** Open `packages/server/src/engine/BattleEngine.ts`. Find the `private endOfTurn` method (around line 1647). The slot loop starts around line 1651:

```typescript
    for (const team of s.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;

        const eotResult = this.effectEngine.runEndOfTurn(active, slot.slotId, s, this.getAllSlots(s));
```

Add Wish resolution **before** the `if (!active || active.fainted) continue;` check, so it runs even if the current active is fainted:

```typescript
    for (const team of s.teams) {
      for (const slot of team.slots) {
        // Resolve Wish before per-pokemon EoT effects
        if (slot.wish) {
          slot.wish.turnsRemaining--;
          if (slot.wish.turnsRemaining <= 0) {
            const wishTarget = slot.party[slot.activePokemonIndex];
            if (wishTarget && !wishTarget.fainted) {
              const heal = Math.min(slot.wish.hp, wishTarget.maxHp - wishTarget.currentHp);
              if (heal > 0) {
                wishTarget.currentHp += heal;
                events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: wishTarget.currentHp } });
              }
            }
            delete slot.wish;
          }
        }

        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;

        const eotResult = this.effectEngine.runEndOfTurn(active, slot.slotId, s, this.getAllSlots(s));
```

- [ ] **Step 6:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 7:** Run full suite:

```
cd packages/server && npm test
```

Expected: all pass.

- [ ] **Step 8:** Commit:

```bash
git add packages/server/src/engine/effectFactories.ts \
        packages/server/src/engine/registrations.ts \
        packages/server/src/engine/BattleEngine.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: implement Wish delayed heal (slot-level EoT resolution)"
```

---

### Task 5: Healing Wish & Lunar Dance

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests to `healingMoves.test.ts`:

```typescript
describe('healingwish', () => {
  it('faints the user and sets pendingHeal on the slot', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1', maxHp: 100, currentHp: 80 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('healingwish')!(ctx);

    expect(user.fainted).toBe(true);
    expect(user.currentHp).toBe(0);
    expect(state.teams[0]!.slots[0]!.pendingHeal).toBe('healingwish');
    expect(events.some(e => e.type === 'faint')).toBe(true);
  });

  it('fully heals the next pokemon that switches in', () => {
    const state = make1v1State();
    const foe = makePokemon({ instanceId: 'p2' });
    state.teams[1]!.slots[0]!.party[0] = foe;

    // Set up: user slot has pendingHeal and a bench member at partial HP
    const active = makePokemon({ instanceId: 'p1', fainted: true, currentHp: 0 });
    const bench = makePokemon({ instanceId: 'p1-bench', maxHp: 200, currentHp: 80 });
    state.teams[0]!.slots[0]!.party = [active, bench];
    state.teams[0]!.slots[0]!.pendingHeal = 'healingwish';

    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const incoming = newState.teams[0]!.slots[0]!.party[newState.teams[0]!.slots[0]!.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');
    expect(incoming.currentHp).toBe(200);
    expect(newState.teams[0]!.slots[0]!.pendingHeal).toBeUndefined();
  });
});

describe('lunardance', () => {
  it('faints the user and sets pendingHeal=lunardance', () => {
    const state = make1v1State();
    const user = makePokemon({ instanceId: 'p1' });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('lunardance')!(ctx);

    expect(user.fainted).toBe(true);
    expect(state.teams[0]!.slots[0]!.pendingHeal).toBe('lunardance');
  });

  it('restores HP and PP for the next switch-in', () => {
    const state = make1v1State();
    const foe = makePokemon({ instanceId: 'p2' });
    state.teams[1]!.slots[0]!.party[0] = foe;

    const active = makePokemon({ instanceId: 'p1', fainted: true, currentHp: 0 });
    const bench = makePokemon({
      instanceId: 'p1-bench',
      maxHp: 200,
      currentHp: 50,
      moves: [
        { moveId: 'flamethrower', currentPp: 0, maxPp: 15 },
        { moveId: 'airslash',     currentPp: 3, maxPp: 15 },
        { moveId: 'roost',        currentPp: 0, maxPp: 10 },
        { moveId: 'willowisp',    currentPp: 15, maxPp: 15 },
      ],
    });
    state.teams[0]!.slots[0]!.party = [active, bench];
    state.teams[0]!.slots[0]!.pendingHeal = 'lunardance';

    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const incoming = newState.teams[0]!.slots[0]!.party[newState.teams[0]!.slots[0]!.activePokemonIndex]!;
    expect(incoming.currentHp).toBe(200);
    expect(incoming.moves[0]!.currentPp).toBe(15);
    expect(incoming.moves[1]!.currentPp).toBe(15);
    expect(incoming.moves[2]!.currentPp).toBe(10);
    expect(newState.teams[0]!.slots[0]!.pendingHeal).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: FAIL — `No handler for healingwish`.

- [ ] **Step 3:** Add registrations to `registrations.ts` in the heals section:

```typescript
  r.register('healingwish', custom((ctx) => {
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    if (!userSlot) return { events: [] };
    ctx.user.currentHp = 0;
    ctx.user.fainted = true;
    userSlot.pendingHeal = 'healingwish';
    return {
      events: [{ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } }],
    };
  }));

  r.register('lunardance', custom((ctx) => {
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    if (!userSlot) return { events: [] };
    ctx.user.currentHp = 0;
    ctx.user.fainted = true;
    userSlot.pendingHeal = 'lunardance';
    return {
      events: [{ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } }],
    };
  }));
```

- [ ] **Step 4:** Open `packages/server/src/engine/BattleEngine.ts`. Find the switch-in path inside `private performSwitch` (around line 1536). After step 3 (`slot.activePokemonIndex = newIndex`) and after step 4 (entry hazards, ending around line 1548), add the `pendingHeal` hook **before** step 5 (ability hook, line 1551). Insert after the `applyEntryHazards` block:

```typescript
    // Healing Wish / Lunar Dance: heal incoming Pokemon if flag is set
    if (slot.pendingHeal && incoming) {
      const priorHp = incoming.currentHp;
      incoming.currentHp = incoming.maxHp;
      if (slot.pendingHeal === 'lunardance') {
        for (const m of incoming.moves) m.currentPp = m.maxPp;
      }
      const healAmount = incoming.maxHp - priorHp;
      delete slot.pendingHeal;
      if (healAmount > 0) {
        events.push({ type: 'heal', data: { slotId, amount: healAmount, remainingHp: incoming.maxHp } });
      }
    }
```

- [ ] **Step 5:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 6:** Run full suite:

```
cd packages/server && npm test
```

Expected: all pass.

- [ ] **Step 7:** Commit:

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/BattleEngine.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: implement Healing Wish and Lunar Dance (self-faint + next-ally heal)"
```

---

### Task 6: Refresh, Purify, Psycho Shift

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests:

```typescript
describe('refresh', () => {
  it('clears the user status condition', () => {
    const state = make1v1State();
    const user = makePokemon({ status: 'brn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('refresh')!(ctx);

    expect(user.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });

  it('fails if user has no status', () => {
    const state = make1v1State();
    const user = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('refresh')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });
});

describe('purify', () => {
  it('cures target status and heals user 50% if target had status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon({ status: 'psn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('purify')!(ctx);

    expect(target.status).toBeUndefined();
    expect(user.currentHp).toBe(200);
  });

  it('fails if target has no status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('purify')!(ctx);

    expect(user.currentHp).toBe(100); // no heal
    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });
});

describe('psychoshift', () => {
  it('transfers user status to target and clears user status', () => {
    const state = make1v1State();
    const user = makePokemon({ status: 'brn' as const });
    const target = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('psychoshift')!(ctx);

    expect(user.status).toBeUndefined();
    expect(target.status).toBe('brn');
  });

  it('fails if user has no status', () => {
    const state = make1v1State();
    const user = makePokemon();
    const target = makePokemon();
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('psychoshift')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });

  it('fails if target already has status', () => {
    const state = make1v1State();
    const user = makePokemon({ status: 'brn' as const });
    const target = makePokemon({ status: 'par' as const });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('psychoshift')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.status).toBe('brn'); // not transferred
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: FAIL — `No handler for refresh`.

- [ ] **Step 3:** Add registrations to `registrations.ts` (heals section). Note: `canApplyStatus` must be imported from `./status.js` — add it to the existing import from `./effects.js`:

First, update the import from `./effects.js` in `registrations.ts` (currently `import { applyStatBoost } from './effects.js';`):

```typescript
import { applyStatBoost } from './effects.js';
import { canApplyStatus } from './status.js';
```

Then add the registrations:

```typescript
  r.register('refresh', custom((ctx) => {
    if (!ctx.user.status) {
      return { events: [{ type: 'move-failed', data: { moveId: 'refresh', reason: 'no-status' } }] };
    }
    const old = ctx.user.status;
    delete ctx.user.status;
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic');
    return { events: [{ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } }] };
  }));

  r.register('purify', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (!target.status) {
      return { events: [{ type: 'move-failed', data: { moveId: 'purify', reason: 'no-status' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const old = target.status;
    delete target.status;
    target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'toxic');
    events.push({ type: 'status-cured', data: { slotId: targetSlotId, status: old, reason: 'move' } });
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.5), ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    return { events };
  }));

  r.register('psychoshift', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (!ctx.user.status) {
      return { events: [{ type: 'move-failed', data: { moveId: 'psychoshift', reason: 'no-status' } }] };
    }
    if (target.status) {
      return { events: [{ type: 'move-failed', data: { moveId: 'psychoshift', reason: 'target-has-status' } }] };
    }
    const canReceive = canApplyStatus({
      status: ctx.user.status,
      types: ctx.targetTypes[0] ?? [],
      currentStatus: target.status,
      ability: target.ability,
      battle: ctx.battle,
    });
    if (!canReceive) {
      return { events: [{ type: 'move-failed', data: { moveId: 'psychoshift', reason: 'immune' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const transferred = ctx.user.status;
    target.status = transferred;
    if (transferred === 'slp') {
      const counter = Math.floor(Math.random() * 3) + 1;
      target.volatileStatus.push({ name: 'sleep', counter });
    }
    delete ctx.user.status;
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
    events.push({ type: 'status-applied', data: { slotId: targetSlotId, status: transferred, pokemonName: target.nickname } });
    events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: transferred, reason: 'move' } });
    return { events };
  }));
```

- [ ] **Step 4:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 5:** Run full suite:

```
cd packages/server && npm test
```

- [ ] **Step 6:** Commit:

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: register refresh, purify, psychoshift"
```

---

### Task 7: Pain Split

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests:

```typescript
describe('painsplit', () => {
  it('averages HP between user and target', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 30 });
    const target = makePokemon({ maxHp: 200, currentHp: 90 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('painsplit')!(ctx);

    expect(user.currentHp).toBe(60);
    expect(target.currentHp).toBe(60);
  });

  it('caps HP at max for each pokemon', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 50, currentHp: 10 });
    const target = makePokemon({ maxHp: 50, currentHp: 40 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('painsplit')!(ctx);

    // average = floor((10+40)/2) = 25; both under their maxHp
    expect(user.currentHp).toBe(25);
    expect(target.currentHp).toBe(25);
  });

  it('fails if user and target have equal HP', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 100, currentHp: 50 });
    const target = makePokemon({ maxHp: 100, currentHp: 50 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('painsplit')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

- [ ] **Step 3:** Add registration in `registrations.ts` heals section:

```typescript
  r.register('painsplit', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (ctx.user.currentHp === target.currentHp) {
      return { events: [{ type: 'move-failed', data: { moveId: 'painsplit', reason: 'equal-hp' } }] };
    }
    const newHp = Math.floor((ctx.user.currentHp + target.currentHp) / 2);
    const events: TurnResolveEvent[] = [];
    ctx.user.currentHp = Math.min(newHp, ctx.user.maxHp);
    target.currentHp = Math.min(newHp, target.maxHp);
    events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: ctx.user.currentHp, remainingHp: ctx.user.currentHp } });
    events.push({ type: 'heal', data: { slotId: targetSlotId, amount: target.currentHp, remainingHp: target.currentHp } });
    return { events };
  }));
```

- [ ] **Step 4:** Run tests and commit:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: register painsplit"
```

---

### Task 8: Strength Sap

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests:

```typescript
describe('strengthsap', () => {
  it('heals user by target effective Atk and drops target Atk by 1', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon({ stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 } });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('strengthsap')!(ctx);

    expect(user.currentHp).toBe(200); // healed 100 (effective atk = 100, at 0 boost)
    expect(target.statBoosts.atk).toBe(-1);
  });

  it('fails if target Atk is at -6', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    const target = makePokemon({ statBoosts: { atk: -6, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    const { events } = registry.get('strengthsap')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.currentHp).toBe(100);
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL.

- [ ] **Step 3:** Add `getEffectiveStat` import to `registrations.ts`:

```typescript
import { getEffectiveStat } from './stats.js';
```

Add registration:

```typescript
  r.register('strengthsap', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (target.statBoosts.atk <= -6) {
      return { events: [{ type: 'move-failed', data: { moveId: 'strengthsap', reason: 'atk-min' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const atkValue = getEffectiveStat(target.stats.atk, target.statBoosts.atk, 'atk');
    const heal = Math.min(atkValue, ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    events.push(applyStatBoost(target, targetSlotId, { atk: -1 }));
    return { events };
  }));
```

- [ ] **Step 4:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 5:** Commit:

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: register strengthsap"
```

---

### Task 9: Heal Pulse, Floral Healing, Life Dew, Jungle Healing, Lunar Blessing

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests:

```typescript
describe('healpulse', () => {
  it('heals the target (opponent in 1v1) by 50% max HP', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 100, currentHp: 100 });
    const target = makePokemon({ maxHp: 200, currentHp: 80 });
    state.teams[0]!.slots[0]!.party[0] = user;
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('healpulse')!(ctx);

    expect(target.currentHp).toBe(180); // 80 + 100 (50% of 200)
  });
});

describe('floralhealing', () => {
  it('heals target 50% max HP normally', () => {
    const state = make1v1State();
    const target = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('floralhealing')!(ctx);

    expect(target.currentHp).toBe(100);
  });

  it('heals target 66% max HP in grassy terrain', () => {
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 5 };
    const target = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[1]!.slots[0]!.party[0] = target;

    const ctx: MoveContext = {
      ...makeCtx(),
      battle: state,
      targets: [target], targetSlotIds: ['slot-b1'], targetTypes: [['Normal']],
    };
    registry.get('floralhealing')!(ctx);

    expect(target.currentHp).toBe(200); // floor(300 * 2/3) = 200
  });
});

describe('lifedew', () => {
  it('heals user 25% max HP', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('lifedew')!(ctx);

    expect(user.currentHp).toBe(150);
  });
});

describe('junglehealing', () => {
  it('heals user 25% and cures status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100, status: 'psn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('junglehealing')!(ctx);

    expect(user.currentHp).toBe(150);
    expect(user.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });
});

describe('lunarblessing', () => {
  it('heals user 25% and cures user status', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100, status: 'brn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('lunarblessing')!(ctx);

    expect(user.currentHp).toBe(150);
    expect(user.status).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL.

- [ ] **Step 3:** Add registrations to `registrations.ts`:

```typescript
  r.register('healpulse', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const heal = Math.min(Math.floor(target.maxHp * 0.5), target.maxHp - target.currentHp);
    if (heal <= 0) return { events: [] };
    target.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: targetSlotId, amount: heal, remainingHp: target.currentHp } }] };
  }));

  r.register('floralhealing', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const isGrassy = ctx.battle.field.terrain?.type === 'grassy';
    const fraction = isGrassy ? 2 / 3 : 0.5;
    const heal = Math.min(Math.floor(target.maxHp * fraction), target.maxHp - target.currentHp);
    if (heal <= 0) return { events: [] };
    target.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: targetSlotId, amount: heal, remainingHp: target.currentHp } }] };
  }));

  r.register('lifedew', custom((ctx) => {
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.25), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  }));

  r.register('junglehealing', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.25), ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    if (ctx.user.status) {
      const old = ctx.user.status;
      delete ctx.user.status;
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic');
      events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } });
    }
    return { events };
  }));

  r.register('lunarblessing', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.25), ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    if (ctx.user.status) {
      const old = ctx.user.status;
      delete ctx.user.status;
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic');
      events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } });
    }
    return { events };
  }));
```

- [ ] **Step 4:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 5:** Commit:

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: register healpulse, floralhealing, lifedew, junglehealing, lunarblessing"
```

---

### Task 10: Weather-Sensitive Heals (moonlight, synthesis, morningsun, shoreup)

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests:

```typescript
describe('moonlight (weather-sensitive)', () => {
  it('heals 50% with no weather', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(100);
  });

  it('heals floor(2/3) in sun', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(200); // floor(300 * 2/3) = 200
  });

  it('heals floor(2/3) in harsh-sun', () => {
    const state = make1v1State();
    state.field.weather = { type: 'harsh-sun', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(200);
  });

  it('heals 25% in rain', () => {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(50); // floor(200 * 0.25) = 50
  });

  it('heals 25% in sand', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('moonlight')!(ctx);

    expect(user.currentHp).toBe(50);
  });
});

describe('shoreup (weather-sensitive)', () => {
  it('heals 50% with no weather', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(100);
  });

  it('heals floor(2/3) in sand', () => {
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 300, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(200);
  });

  it('heals 25% in rain', () => {
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
    const user = makePokemon({ maxHp: 200, currentHp: 0 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    registry.get('shoreup')!(ctx);

    expect(user.currentHp).toBe(50);
  });
});
```

- [ ] **Step 2:** Run to confirm the weather tests FAIL (currently `moonlight` and `shoreup` use flat `healPercent(0.5)`):

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: FAIL on sun/rain/sand cases.

- [ ] **Step 3:** Replace the flat registrations for `moonlight`, `synthesis`, `morningsun`, and `shoreup` in `registrations.ts`. Find the heals section and replace:

```typescript
  r.register('moonlight',   healPercent(0.5));
  r.register('synthesis',   healPercent(0.5));
```

With:

```typescript
  r.register('moonlight',  custom((ctx) => {
    const weather = ctx.battle.field.weather?.type;
    const fraction = (weather === 'sun' || weather === 'harsh-sun') ? 2 / 3
      : (!weather) ? 0.5
      : 0.25;
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  }));

  r.register('synthesis',  custom((ctx) => {
    const weather = ctx.battle.field.weather?.type;
    const fraction = (weather === 'sun' || weather === 'harsh-sun') ? 2 / 3
      : (!weather) ? 0.5
      : 0.25;
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  }));
```

Also replace the `shoreup` registration added in Task 2:

```typescript
  r.register('shoreup',    healPercent(0.5)); // weather variant added in Task 10
```

With:

```typescript
  r.register('shoreup',   custom((ctx) => {
    const weather = ctx.battle.field.weather?.type;
    const fraction = (weather === 'sand') ? 2 / 3
      : (!weather || weather === 'sun' || weather === 'harsh-sun') ? 0.5
      : 0.25;
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  }));
```

Also replace the `morningsun` registration added in Task 2:

```typescript
  r.register('morningsun', healPercent(0.5)); // weather variant added in Task 10
```

With:

```typescript
  r.register('morningsun', custom((ctx) => {
    const weather = ctx.battle.field.weather?.type;
    const fraction = (weather === 'sun' || weather === 'harsh-sun') ? 2 / 3
      : (!weather) ? 0.5
      : 0.25;
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  }));
```

- [ ] **Step 4:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 5:** Run full suite:

```
cd packages/server && npm test
```

Expected: all pass.

- [ ] **Step 6:** Commit:

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: weather-sensitive heals for moonlight, synthesis, morningsun, shoreup"
```

---

### Task 11: Rest

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/healingMoves.test.ts`

- [ ] **Step 1:** Add tests:

```typescript
describe('rest', () => {
  it('heals user to full HP and applies sleep with counter=2', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(user.currentHp).toBe(200);
    expect(user.status).toBe('slp');
    const sleepEntry = user.volatileStatus.find(v => v.name === 'sleep');
    expect(sleepEntry?.counter).toBe(2);
    expect(events.some(e => e.type === 'heal')).toBe(true);
    expect(events.some(e => e.type === 'status-applied')).toBe(true);
  });

  it('clears an existing status before sleeping', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 100, status: 'brn' as const });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(user.status).toBe('slp');
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });

  it('fails if user is already asleep', () => {
    const state = make1v1State();
    const user = makePokemon({
      maxHp: 200, currentHp: 100,
      status: 'slp' as const,
      volatileStatus: [{ name: 'sleep', counter: 1 }],
    });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.currentHp).toBe(100);
  });

  it('fails if user HP is already full', () => {
    const state = make1v1State();
    const user = makePokemon({ maxHp: 200, currentHp: 200 });
    state.teams[0]!.slots[0]!.party[0] = user;

    const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
    const { events } = registry.get('rest')!(ctx);

    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(user.status).toBeUndefined();
  });

  it('sets sleep counter to exactly 2 (not random)', () => {
    const state = make1v1State();
    // Run many times to confirm counter is always 2
    for (let i = 0; i < 20; i++) {
      const user = makePokemon({ maxHp: 200, currentHp: 100 });
      state.teams[0]!.slots[0]!.party[0] = user;
      const ctx: MoveContext = { ...makeCtx(), battle: state, user, userSlotId: 'slot-a1', userTeamIndex: 0 };
      registry.get('rest')!(ctx);
      const sleepEntry = user.volatileStatus.find(v => v.name === 'sleep');
      expect(sleepEntry?.counter).toBe(2);
    }
  });
});
```

- [ ] **Step 2:** Run to confirm FAIL:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: FAIL — `No handler for rest`.

- [ ] **Step 3:** Add registration to `registrations.ts` heals section:

```typescript
  r.register('rest', custom((ctx) => {
    if (ctx.user.status === 'slp') {
      return { events: [{ type: 'move-failed', data: { moveId: 'rest', reason: 'already-asleep' } }] };
    }
    if (ctx.user.currentHp >= ctx.user.maxHp) {
      return { events: [{ type: 'move-failed', data: { moveId: 'rest', reason: 'hp-full' } }] };
    }
    // Electric Terrain sleep immunity (simplified — Levitate/Magnet Rise bypass; Flying type check omitted)
    if (ctx.battle.field.terrain?.type === 'electric') {
      const hasMagnetRise = ctx.user.volatileStatus.some(v => v.name === 'magnet-rise');
      if (!hasMagnetRise && ctx.user.ability !== 'levitate') {
        return { events: [{ type: 'move-failed', data: { moveId: 'rest', reason: 'terrain-blocked' } }] };
      }
    }
    const events: TurnResolveEvent[] = [];
    if (ctx.user.status) {
      const old = ctx.user.status;
      delete ctx.user.status;
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
      events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } });
    }
    ctx.user.status = 'slp';
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'sleep');
    ctx.user.volatileStatus.push({ name: 'sleep', counter: 2 });
    events.push({ type: 'status-applied', data: { slotId: ctx.userSlotId, status: 'slp', pokemonName: ctx.user.nickname } });
    const healAmount = ctx.user.maxHp - ctx.user.currentHp;
    ctx.user.currentHp = ctx.user.maxHp;
    events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: healAmount, remainingHp: ctx.user.maxHp } });
    return { events };
  }));
```

- [ ] **Step 4:** Run tests:

```
cd packages/server && npx vitest run src/engine/__tests__/healingMoves.test.ts
```

Expected: PASS.

- [ ] **Step 5:** Run full suite and typecheck:

```
cd packages/server && npm test && npm run typecheck
```

Expected: all pass.

- [ ] **Step 6:** Commit:

```bash
git add packages/server/src/engine/registrations.ts \
        packages/server/src/engine/__tests__/healingMoves.test.ts
git commit -m "feat: register rest (full heal + forced sleep counter=2)"
```
