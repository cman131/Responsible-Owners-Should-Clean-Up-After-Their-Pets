# Volatile Status Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all volatile status effects deferred from the EffectEngine PR: Protect family, Substitute, Disable/Taunt/Encore/Torment move constraints, Focus Energy, Aqua Ring, Ingrain, Magnet Rise, Perish Song, Foresight, Miracle Eye, Roost, Destiny Bond, Embargo, and Heal Block.

**Architecture:** Volatiles are stored as `VolatileStatusEntry[]` on each `PartyMember`. Type extensions add `turnsRemaining`, `moveId`, `variant`, and `hp` fields. A `volatileClearRules.ts` module lists what clears on switch. `EffectEngine.runPreMove` and `runEndOfTurn` handle per-turn ticking. `BattleEngine.executeMove` enforces blocking (Protect, Disable, Taunt, Encore, Torment) and damage interception (Substitute). All new volatiles are applied via factories registered in `registrations.ts`.

**Tech Stack:** TypeScript, Vitest, Zod. Run `cd packages/shared && npm run build` after every shared type change. Run tests with `cd packages/server && npx vitest run`.

---

## File Map

| File | Action |
|------|--------|
| `packages/shared/src/types/battle.ts` | Modify — extend `VolatileStatusEntry`; add `lastMoveId` to `PartyMember` |
| `packages/shared/src/types/pokemon.ts` | Modify — add `soundMove?: boolean` to `Move` |
| `packages/shared/src/types/events.ts` | Modify — add `'endure-survived'` to `TurnResolveEvent` type union |
| `packages/shared/src/schemas/move.schema.ts` | Modify — add `soundMove` field |
| `packages/server/src/engine/MoveEffectRegistry.ts` | Modify — add `rng` to `MoveContext` |
| `packages/server/src/engine/volatileClearRules.ts` | Create — `SWITCH_CLEAR_NAMES`, `SWITCH_CLEAR_PREFIXES` |
| `packages/server/src/engine/effects.ts` | Modify — substitute guard in `applyVolatile`/`applyStatus`; `isSoundMove` in `SecondaryContext` |
| `packages/server/src/engine/effectFactories.ts` | Modify — add `protect`, `substitute`, `endure`, `focusEnergy`, `aquaRing`, `ingrain`, `magnetRise`, `perishSong`, `foresight`, `miracleEye`, `roost`, `destinyBond`, `embargo`, `healBlock`; update `applyVolatileTarget`/`applyStatusTarget` for sound bypass |
| `packages/server/src/engine/BattleEngine.ts` | Modify — add `rng` to `MoveContext`; protect enforcement (both paths); substitute damage interception; Disable/Taunt/Encore/Torment checks; streak clear; Foresight/Roost type overrides |
| `packages/server/src/engine/EffectEngine.ts` | Modify — Disable decrement at start of `runPreMove`; EoT tickers for Taunt, Encore, Magnet Rise, Embargo, Heal Block, Perish Song, Aqua Ring, Ingrain, protect removal, Roost removal |
| `packages/server/src/engine/registrations.ts` | Modify — register all new volatiles; replace Roost with custom handler |
| `packages/server/src/socket/BattleRoom.ts` | Modify — `buildValidMoves` signature; set `disabled: true` for Disable/Taunt/Encore/Torment; block switching when Ingrain active |
| `data/moves.json` | Modify — rename `"solarbeam-charge"` → `"charging-solarbeam"`; add `soundMove: true` for Boomburst, Hyper Voice, Bug Buzz |
| `packages/server/src/engine/__tests__/protect.test.ts` | Create — protect factory + enforcement tests |
| `packages/server/src/engine/__tests__/substitute.test.ts` | Create — substitute factory + damage interception + blocking tests |
| `packages/server/src/engine/__tests__/constraints.test.ts` | Create — Disable, Taunt, Encore, Torment tests |
| `packages/server/src/engine/__tests__/passiveVolatiles.test.ts` | Create — Focus Energy, Aqua Ring, Ingrain, Magnet Rise, Perish Song tests |
| `packages/server/src/engine/__tests__/miscVolatiles.test.ts` | Create — Foresight, Miracle Eye, Roost, Destiny Bond, Embargo, Heal Block tests |

---

### Task 1: Shared type extensions

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/shared/src/types/pokemon.ts`
- Modify: `packages/shared/src/types/events.ts`
- Modify: `packages/shared/src/schemas/move.schema.ts`
- Modify: `packages/server/src/engine/MoveEffectRegistry.ts`

- [ ] **Step 1: Extend `VolatileStatusEntry` and add `lastMoveId` to `PartyMember`**

In `packages/shared/src/types/battle.ts`, replace the `VolatileStatusEntry` interface:

```typescript
export interface VolatileStatusEntry {
  name: string;
  counter?: number;           // general-purpose countdown (yawn, perishsong, toxic)
  turnsRemaining?: number;    // disable, taunt, encore, magnet-rise, embargo, heal-block
  moveId?: string;            // disable: the disabled move; encore: the forced move
  variant?: string;           // protect: which protect move was used
  hp?: number;                // substitute: proxy HP pool
  sourceSlotId?: string;
}
```

And add `lastMoveId?: string` to `PartyMember` after `hasTerastallized`:

```typescript
  hasTerastallized: boolean;
  lastMoveId?: string;
  fainted: boolean;
```

- [ ] **Step 2: Add `soundMove` to `Move`**

In `packages/shared/src/types/pokemon.ts`, add after `critRatio?`:

```typescript
  critRatio?: number;
  soundMove?: boolean;
```

- [ ] **Step 3: Add `'endure-survived'` to `TurnResolveEvent`**

In `packages/shared/src/types/events.ts`, add to the type union:

```typescript
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
    | 'endure-survived'
    | 'miss'
    | 'crit';
```

- [ ] **Step 4: Add `soundMove` to `MoveSchema`**

In `packages/shared/src/schemas/move.schema.ts`, add after `secondaries`:

```typescript
  secondaries: SecondarySchema.array().optional(),
  soundMove: z.boolean().optional(),
});
```

- [ ] **Step 5: Add `rng` to `MoveContext`**

In `packages/server/src/engine/MoveEffectRegistry.ts`, add `rng` to the interface:

```typescript
export interface MoveContext {
  battle: BattleState;
  user: PartyMember;
  userSlotId: string;
  userTeamIndex: number;
  targets: PartyMember[];
  targetSlotIds: string[];
  targetTypes: PokemonType[][];
  move: Move;
  rng: () => number;
}
```

- [ ] **Step 6: Build shared, confirm server still compiles**

```
cd packages/shared && npm run build
cd packages/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```
git add packages/shared/src/types/battle.ts packages/shared/src/types/pokemon.ts packages/shared/src/types/events.ts packages/shared/src/schemas/move.schema.ts packages/server/src/engine/MoveEffectRegistry.ts
git commit -m "feat(shared): extend VolatileStatusEntry, add lastMoveId, soundMove, endure-survived, rng to MoveContext"
```

---

### Task 2: Charge volatile rename + soundMove data

**Files:**
- Modify: `data/moves.json`

- [ ] **Step 1: Rename `solarbeam-charge` to `charging-solarbeam` and add soundMove flags**

In `data/moves.json`, find the Solar Beam entry and change `chargeVolatile`:

```json
{ "kind": "charge", "chargeVolatile": "charging-solarbeam" }
```

Also add `"soundMove": true` to the following moves (search by `"id"` and add the field after `"makesContact"`):
- `boomburst`
- `hypervoice`
- `bugbuzz`
- `clangingscales`
- `disarmingvoice`
- `eeriespell`

- [ ] **Step 2: Verify data loads without error**

```
cd packages/server && npx vitest run --reporter=verbose 2>&1 | head -30
```

Expected: existing tests still pass (or only the known pre-existing Bind failure appears).

- [ ] **Step 3: Commit**

```
git add data/moves.json
git commit -m "fix(data): rename charge volatile to charging-solarbeam, add soundMove flags"
```

---

### Task 3: `volatileClearRules.ts` + `executeSwitch` clear

**Files:**
- Create: `packages/server/src/engine/volatileClearRules.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Write failing test for switch-clear behavior**

Create `packages/server/src/engine/__tests__/protect.test.ts` (will grow across tasks):

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';

describe('switch clears volatiles', () => {
  it('clears confusion on switch-out', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.volatileStatus.push({ name: 'confusion', counter: 3 });

    const p2slot = state.teams[0]!.slots[0]!;
    const bench = makePokemon({ instanceId: 'bench-mon' });
    p2slot.party.push(bench);

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'bench-mon' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const switchedOut = newState.teams[0]!.slots[0]!.party[0]!;
    expect(switchedOut.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });

  it('resets statBoosts to zero on switch-out', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.statBoosts.atk = 3;
    p1.lastMoveId = 'swordsdance';

    const bench = makePokemon({ instanceId: 'bench2' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'bench2' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const switchedOut = newState.teams[0]!.slots[0]!.party[0]!;
    expect(switchedOut.statBoosts.atk).toBe(0);
    expect(switchedOut.lastMoveId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: FAIL — switch-out does not clear volatiles or stat boosts.

- [ ] **Step 3: Create `volatileClearRules.ts`**

```typescript
// packages/server/src/engine/volatileClearRules.ts
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

export const SWITCH_CLEAR_PREFIXES = ['charging-'];
```

- [ ] **Step 4: Apply clear logic in `executeSwitch`**

In `packages/server/src/engine/BattleEngine.ts`, add the import at top:

```typescript
import { SWITCH_CLEAR_NAMES, SWITCH_CLEAR_PREFIXES } from './volatileClearRules.js';
```

In `executeSwitch`, after `const previousMon = ...` and before the ability switch-in block, add:

```typescript
// Clear volatiles and reset stats for the switching-out Pokémon
const outgoing = slot.party[slot.activePokemonIndex === newIndex ? 0 : slot.activePokemonIndex];
if (outgoing && outgoing.instanceId === previousMon) {
  outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
    !SWITCH_CLEAR_NAMES.has(v.name) &&
    !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
  );
  outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
  outgoing.lastMoveId = undefined;
}
slot.activePokemonIndex = newIndex;
```

Wait — the original code sets `slot.activePokemonIndex = newIndex` before this block. We need the clear to happen before the index update, so we can reference the outgoing Pokémon. Reorder in `executeSwitch`:

```typescript
private executeSwitch(state: BattleState, slotId: string, targetInstanceId: string): TurnResult {
  const events: TurnResolveEvent[] = [];
  const s = structuredClone(state);
  const slot = this.findSlot(s, slotId);
  if (!slot) return { newState: s, events };
  const newIndex = slot.party.findIndex((p) => p.instanceId === targetInstanceId);
  if (newIndex === -1 || slot.party[newIndex]?.fainted) return { newState: s, events };

  const outgoing = slot.party[slot.activePokemonIndex];
  const previousMon = outgoing?.instanceId;

  // Clear switch-out volatiles and stat boosts before updating active index
  if (outgoing) {
    outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
      !SWITCH_CLEAR_NAMES.has(v.name) &&
      !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
    );
    outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
    outgoing.lastMoveId = undefined;
  }

  slot.activePokemonIndex = newIndex;
  events.push({ type: 'volatile-applied', data: { note: 'switch', slotId, from: previousMon, to: targetInstanceId } });

  // Apply incoming ability's switch-in effect
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

  return { newState: s, events };
}
```

- [ ] **Step 5: Run test to confirm pass**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full suite to confirm no regression**

```
cd packages/server && npx vitest run
```

Expected: same results as before (only the pre-existing Bind test failing).

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/volatileClearRules.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/protect.test.ts
git commit -m "feat(engine): volatileClearRules + executeSwitch clears volatiles/statBoosts/lastMoveId on switch-out"
```

---

### Task 4: `protect()` factory

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`

- [ ] **Step 1: Write failing tests for protect factory**

Add to `packages/server/src/engine/__tests__/protect.test.ts`:

```typescript
import { protect } from '../effectFactories.js';
import type { MoveContext } from '../MoveEffectRegistry.js';
import type { Move } from '@poke-fighter/shared';

function makeProtectCtx(overrides: Partial<MoveContext> = {}): MoveContext {
  const user = makePokemon();
  return {
    battle: make1v1State(),
    user,
    userSlotId: 'slot-a1',
    userTeamIndex: 0,
    targets: [],
    targetSlotIds: [],
    targetTypes: [],
    move: { id: 'protect', name: 'Protect', category: 'status', type: 'Normal', basePower: 0, accuracy: true, pp: 10, priority: 4, target: 'self', makesContact: false } as Move,
    rng: () => 0.5,
    ...overrides,
  };
}

describe('protect factory', () => {
  it('first use always succeeds (no streak)', () => {
    const handler = protect('protect');
    const ctx = makeProtectCtx({ rng: () => 0.99 }); // high roll, should still succeed
    const { events } = handler(ctx);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect')).toBe(true);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect-streak')).toBe(true);
    expect(ctx.user.volatileStatus.find(v => v.name === 'protect-streak')?.counter).toBe(1);
  });

  it('second consecutive use fails when rng >= 1/3', () => {
    const handler = protect('protect');
    const ctx = makeProtectCtx({ rng: () => 0.5 }); // 0.5 >= 1/3, so fails
    ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    const { events } = handler(ctx);
    expect(events.some(e => e.type === 'move-failed')).toBe(true);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect')).toBe(false);
    expect(ctx.user.volatileStatus.some(v => v.name === 'protect-streak')).toBe(false);
  });

  it('second consecutive use succeeds when rng < 1/3', () => {
    const handler = protect('protect');
    const ctx = makeProtectCtx({ rng: () => 0.1 }); // 0.1 < 1/3
    ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    const { events } = handler(ctx);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
    expect(ctx.user.volatileStatus.find(v => v.name === 'protect-streak')?.counter).toBe(2);
  });

  it('protect variant stored on volatile', () => {
    const handler = protect('kingsshield');
    const ctx = makeProtectCtx({ rng: () => 0 });
    handler(ctx);
    expect(ctx.user.volatileStatus.find(v => v.name === 'protect')?.variant).toBe('kingsshield');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: FAIL — `protect` not exported from effectFactories.

- [ ] **Step 3: Implement `protect()` factory**

Add to `packages/server/src/engine/effectFactories.ts`:

```typescript
export function protect(variant: string): MoveEffectHandler {
  return (ctx) => {
    const streakEntry = ctx.user.volatileStatus.find(v => v.name === 'protect-streak');
    const n = streakEntry?.counter ?? 0;
    const chance = n === 0 ? 1 : 1 / Math.pow(3, n);

    if (ctx.rng() >= chance) {
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'protect-streak');
      return { events: [{ type: 'move-failed', data: { moveId: variant, reason: 'protect-failed' } }] };
    }

    if (streakEntry) {
      streakEntry.counter = n + 1;
    } else {
      ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    }
    ctx.user.volatileStatus.push({ name: 'protect', variant });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'protect', variant } }] };
  };
}
```

Also add `endure()` factory:

```typescript
export function endure(): MoveEffectHandler {
  return (ctx) => {
    const streakEntry = ctx.user.volatileStatus.find(v => v.name === 'protect-streak');
    const n = streakEntry?.counter ?? 0;
    const chance = n === 0 ? 1 : 1 / Math.pow(3, n);

    if (ctx.rng() >= chance) {
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'protect-streak');
      return { events: [{ type: 'move-failed', data: { moveId: 'endure', reason: 'protect-failed' } }] };
    }

    if (streakEntry) {
      streakEntry.counter = n + 1;
    } else {
      ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 });
    }
    ctx.user.volatileStatus.push({ name: 'endure' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'endure' } }] };
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: PASS for protect factory tests.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/__tests__/protect.test.ts
git commit -m "feat(engine): protect() and endure() factories with consecutive-use mechanic"
```

---

### Task 5: Protect enforcement — damaging moves

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/server/src/engine/__tests__/protect.test.ts`:

```typescript
describe('protect blocks damaging moves', () => {
  it('blocks an incoming physical move when protect is active', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'protect', variant: 'protect' });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'protect')).toBe(true);
    expect(events.some(e => e.type === 'damage-dealt')).toBe(false);
  });

  it('Spiky Shield deals 1/8 HP damage to contact-move attacker', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'protect', variant: 'spikyshield' });

    // slot-a1 uses a contact move (flamethrower is special, not contact)
    // We need to check contact — use a physical move that makes contact
    const attacker = state.teams[0]!.slots[0]!.party[0]!;
    attacker.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-blocked')).toBe(true);
    const attackerAfter = newState.teams[0]!.slots[0]!.party[0]!;
    expect(attackerAfter.currentHp).toBeLessThan(100); // took recoil
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: FAIL — protect doesn't block anything yet.

- [ ] **Step 3: Add protect enforcement in `executeMove` damaging path**

The damaging-move target loop starts at line ~221 in `BattleEngine.ts`. Add protect check at the top of the loop, before the freeze-thaw and type-effectiveness checks:

First, add constants near the top of `BattleEngine.ts` (after `ALWAYS_THAW_MOVES`):

```typescript
const PROTECT_FAMILY_IDS = new Set([
  'protect', 'detect', 'kingsshield', 'spikyshield',
  'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark', 'endure',
]);

const CONTACT_PROTECT_VARIANTS: Record<string, { stat?: string; stages?: number; damage?: number; status?: string }> = {
  kingsshield:    { stat: 'atk', stages: -2 },
  spikyshield:    { damage: 8 },   // 1/8 max HP
  obstruct:       { stat: 'def', stages: -2 },
  silktrap:       { stat: 'spe', stages: -1 },
  banefulbunker:  { status: 'psn' },
  burningbulwark: { status: 'brn' },
};
```

In `executeMove`, add the protect-streak clear right after the preMoveResult.blocked check:

```typescript
if (preMoveResult.blocked) return { newState: s, events };

// Clear protect streak if not using a protect-family move
if (!PROTECT_FAMILY_IDS.has(moveSlot.moveId)) {
  attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'protect-streak');
}
```

Then, inside the damaging-move target loop (inside `for (const targetSlotId of targetSlotIds)`), add at the top before the freeze-thaw check:

```typescript
// Protect check
const protectEntry = target.volatileStatus.find(v => v.name === 'protect');
if (protectEntry) {
  events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId, reason: 'protect', variant: protectEntry.variant } });
  // Variant contact effects
  const variantEffects = CONTACT_PROTECT_VARIANTS[protectEntry.variant ?? ''];
  if (variantEffects && move.makesContact) {
    if (variantEffects.stat && variantEffects.stages !== undefined) {
      events.push(applyStatBoost(attacker, attackerSlotId, { [variantEffects.stat]: variantEffects.stages } as Partial<Record<keyof StatBoosts, number>>));
    }
    if (variantEffects.damage) {
      const recoil = Math.max(1, Math.floor(attacker.maxHp / variantEffects.damage));
      const taken = Math.min(recoil, attacker.currentHp);
      attacker.currentHp -= taken;
      events.push({ type: 'damage-dealt', data: { source: 'protect-contact', slotId: attackerSlotId, damage: taken, remainingHp: attacker.currentHp } });
      if (attacker.currentHp <= 0) {
        attacker.fainted = true;
        events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
      }
    }
    if (variantEffects.status) {
      const attackerSpecies = this.data.getSpecies(attacker.speciesId);
      const attackerTypes = attacker.hasTerastallized && attacker.teraType
        ? [attacker.teraType] as PokemonType[]
        : (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
      const evt = applyStatus(attacker, attackerSlotId, variantEffects.status as StatusCondition, attackerTypes);
      if (evt) events.push(evt);
    }
  }
  continue;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: protect-blocks-damaging tests PASS.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

Expected: no new failures.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts
git commit -m "feat(engine): protect blocks incoming damaging moves; contact variant effects"
```

---

### Task 6: Protect enforcement — status moves

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/server/src/engine/__tests__/protect.test.ts`:

```typescript
describe('protect blocks status moves', () => {
  it('blocks Toxic from applying through protect', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'protect', variant: 'protect' });

    // p1 uses Toxic (status move) targeting p2
    const attacker = state.teams[0]!.slots[0]!.party[0]!;
    attacker.moves[0] = { moveId: 'toxic', currentPp: 10, maxPp: 10 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'protect')).toBe(true);
    const defenderAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defenderAfter.status).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: FAIL — Toxic still applies through protect.

- [ ] **Step 3: Add protect enforcement in the status-move path**

In `executeMove`, after resolving targets for status moves (the block starting at `if (move.category === 'status')`), and before calling `handler(ctx)`, filter out protected targets.

Find the status-move section that builds `ctx` and calls `handler`. Add protect filtering between target resolution and `handler` call:

```typescript
if (move.category === 'status') {
  const { targets: rawTargets, targetSlotIds: rawTargetSlotIds } = this.resolveStatusTargets(s, attackerSlotId, action, move);
  const targetTypes = rawTargets.map(t => this.resolveEffectiveTypes(t));
  const userTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId));

  // Filter out Protect-guarded targets (only for opposing targets)
  const filteredTargets: typeof rawTargets = [];
  const filteredSlotIds: string[] = [];
  const filteredTypes: PokemonType[][] = [];
  for (let i = 0; i < rawTargets.length; i++) {
    const tgt = rawTargets[i]!;
    const tSlotId = rawTargetSlotIds[i]!;
    const isOpponent = s.teams.some(
      team => team !== s.teams[userTeamIndex] && team.slots.some(sl => sl.slotId === tSlotId)
    );
    const protectEntry = tgt.volatileStatus.find(v => v.name === 'protect');
    if (isOpponent && protectEntry) {
      events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId: tSlotId, reason: 'protect', variant: protectEntry.variant } });
    } else {
      filteredTargets.push(tgt);
      filteredSlotIds.push(tSlotId);
      filteredTypes.push(targetTypes[i]!);
    }
  }
  if (filteredTargets.length === 0 && rawTargets.length > 0) {
    return { newState: s, events };
  }

  const ctx: MoveContext = {
    battle: s,
    user: attacker,
    userSlotId: attackerSlotId,
    userTeamIndex,
    targets: filteredTargets,
    targetSlotIds: filteredSlotIds,
    targetTypes: filteredTypes,
    move,
    rng: this.rng,
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

Also update the non-protect-streak-clear to use `move.id` (already accessed via `moveSlot.moveId`):

Ensure the `rng: this.rng` is included in the `MoveContext` object above (it is, in the snippet).

- [ ] **Step 4: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: all protect tests PASS.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

Expected: no new failures.

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts
git commit -m "feat(engine): protect blocks incoming status moves; pass rng to MoveContext"
```

---

### Task 7: Protect EoT removal, Endure survival check

**Files:**
- Modify: `packages/server/src/engine/EffectEngine.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/engine/__tests__/protect.test.ts`:

```typescript
describe('protect end-of-turn removal', () => {
  it('protect volatile is removed at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.volatileStatus.push({ name: 'protect', variant: 'protect' });
    p1.volatileStatus.push({ name: 'protect-streak', counter: 1 });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.volatileStatus.some(v => v.name === 'protect')).toBe(false);
    // streak persists across turns
    expect(p1After.volatileStatus.some(v => v.name === 'protect-streak')).toBe(true);
  });
});

describe('endure', () => {
  it('leaves user at 1 HP when lethal damage would faint it', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'endure' });
    defender.currentHp = 1; // already at 1, incoming damage would KO

    // Use a high-power move
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'hyperbeam', currentPp: 5, maxPp: 5 };

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const defAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defAfter.currentHp).toBe(1);
    expect(defAfter.fainted).toBe(false);
    expect(events.some(e => e.type === 'endure-survived')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: FAIL — protect not removed at EoT, endure doesn't save.

- [ ] **Step 3: Add protect removal and Endure survival in `EffectEngine.runEndOfTurn`**

In `packages/server/src/engine/EffectEngine.ts`, at the top of `runEndOfTurn`, add:

```typescript
// Remove protect at EoT (streak persists)
pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'protect' && v.name !== 'roost');
```

- [ ] **Step 4: Add Endure survival check in `BattleEngine.executeMove` hit loop**

In the hit loop in `executeMove`, after computing `finalDamage` and before applying damage to real HP, add the Endure check inside the `else` branch (where there's no substitute). The full replacement for the damage-apply section:

```typescript
const subEntry = target.volatileStatus.find(v => v.name === 'substitute');
if (subEntry && subEntry.hp !== undefined) {
  // substitute interception (Task 10)
} else {
  const actualDamage = Math.min(finalDamage, target.currentHp);
  // Endure: cap damage so HP stays at 1
  const endureEntry = target.volatileStatus.find(v => v.name === 'endure');
  const cappedDamage = (endureEntry && target.currentHp - actualDamage <= 0)
    ? target.currentHp - 1
    : actualDamage;
  target.currentHp -= cappedDamage;
  totalDamage += cappedDamage;

  events.push({ type: 'damage-dealt', data: {
    attackerSlotId, targetSlotId, moveId: move.id,
    damage: cappedDamage, effectiveness, remainingHp: target.currentHp,
  }});

  if (endureEntry && cappedDamage < actualDamage) {
    events.push({ type: 'endure-survived', data: { slotId: targetSlotId } });
  }

  if (target.currentHp <= 0) {
    target.fainted = true;
    target.currentHp = 0;
    events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
  }
}
```

Note: the substitute interception (the `if (subEntry)` branch) will be filled in Task 10. For now, the substitute block can be `// TODO Task 10`.

- [ ] **Step 5: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: all protect/endure tests PASS.

- [ ] **Step 6: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/BattleEngine.ts
git commit -m "feat(engine): protect volatile removed at EoT; Endure prevents lethal damage"
```

---

### Task 8: Register Protect family + Endure

**Files:**
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/server/src/engine/__tests__/protect.test.ts`:

```typescript
describe('protect registrations', () => {
  it('Protect move applies protect volatile', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'protect', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    // protect is removed at EoT, so check streak remains
    expect(p1.volatileStatus.some(v => v.name === 'protect-streak')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: FAIL — protect move fires `move-failed: unimplemented`.

- [ ] **Step 3: Register all protect-family moves**

In `packages/server/src/engine/registrations.ts`, add import:

```typescript
import {
  statModSelf, statModTarget, multiStatModSelf,
  applyStatusTarget, applyVolatileTarget, healPercent,
  setWeather, setTerrain, setSideCondition, trickRoom, gravity, custom,
  protect, endure,
} from './effectFactories.js';
```

Add registrations in the `buildDefaultRegistry` function:

```typescript
  // ── Protect family ────────────────────────────────────────────────
  r.register('protect',       protect('protect'));
  r.register('detect',        protect('detect'));
  r.register('kingsshield',   protect('kingsshield'));
  r.register('spikyshield',   protect('spikyshield'));
  r.register('banefulbunker', protect('banefulbunker'));
  r.register('obstruct',      protect('obstruct'));
  r.register('silktrap',      protect('silktrap'));
  r.register('burningbulwark',protect('burningbulwark'));
  r.register('endure',        endure());
```

- [ ] **Step 4: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/protect.test.ts
```

Expected: all protect tests PASS.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/registrations.ts
git commit -m "feat(engine): register Protect family and Endure moves"
```

---

### Task 9: Substitute factory + status/volatile sub-guard

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/effects.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/engine/__tests__/substitute.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';
import { applyVolatile, applyStatus } from '../effects.js';

describe('substitute factory', () => {
  it('fails if user HP <= 25% of max', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 25; p1.maxHp = 100;
    p1.moves[0] = { moveId: 'substitute', currentPp: 10, maxPp: 10 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'too-weak-for-sub')).toBe(true);
  });

  it('costs 25% HP and creates substitute with that HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 100; p1.maxHp = 100;
    p1.moves[0] = { moveId: 'substitute', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.currentHp).toBe(75);
    const subEntry = p1After.volatileStatus.find(v => v.name === 'substitute');
    expect(subEntry).toBeDefined();
    expect(subEntry?.hp).toBe(25);
  });
});

describe('applyVolatile blocks through substitute', () => {
  it('leech-seed cannot be applied to a pokemon with substitute', () => {
    const p = makePokemon();
    p.volatileStatus.push({ name: 'substitute', hp: 25 });
    const result = applyVolatile(p, 'slot', 'atk-slot', 'leech-seed');
    expect(result).toBeNull();
  });

  it('sound-move bypass allows volatile through substitute', () => {
    const p = makePokemon();
    p.volatileStatus.push({ name: 'substitute', hp: 25 });
    const result = applyVolatile(p, 'slot', 'atk-slot', 'confusion', undefined, { bypassSub: true });
    expect(result).not.toBeNull();
  });
});

describe('applyStatus blocks through substitute', () => {
  it('cannot apply burn to pokemon with substitute', () => {
    const p = makePokemon();
    p.volatileStatus.push({ name: 'substitute', hp: 25 });
    const result = applyStatus(p, 'slot', 'brn', ['Normal']);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/substitute.test.ts
```

Expected: FAIL — substitute not found/blocked.

- [ ] **Step 3: Add `bypassSub` option to `applyVolatile` and `applyStatus`**

In `packages/server/src/engine/effects.ts`, update `applyVolatile` signature and add sub-check:

```typescript
export function applyVolatile(
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
  volatile: string,
  explicitCounter?: number,
  options?: { bypassSub?: boolean },
): TurnResolveEvent | null {
  if (target.volatileStatus.some(v => v.name === volatile)) return null;
  if (!options?.bypassSub && target.volatileStatus.some(v => v.name === 'substitute')) return null;
  // ... rest unchanged
```

Update `applyStatus`:

```typescript
export function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
  options?: { bypassSub?: boolean },
): TurnResolveEvent | null {
  if (!options?.bypassSub && member.volatileStatus.some(v => v.name === 'substitute')) return null;
  if (!canApplyStatus({ status, types, currentStatus: member.status, ability: member.ability })) {
    return null;
  }
  // ... rest unchanged
```

- [ ] **Step 4: Add `substitute()` factory**

In `packages/server/src/engine/effectFactories.ts`:

```typescript
export function substitute(): MoveEffectHandler {
  return (ctx) => {
    const cost = Math.floor(ctx.user.maxHp / 4);
    if (ctx.user.currentHp <= cost) {
      return { events: [{ type: 'move-failed', data: { moveId: 'substitute', reason: 'too-weak-for-sub' } }] };
    }
    ctx.user.currentHp -= cost;
    ctx.user.volatileStatus.push({ name: 'substitute', hp: cost });
    return {
      events: [
        { type: 'damage-dealt', data: { source: 'substitute', slotId: ctx.userSlotId, damage: cost, remainingHp: ctx.user.currentHp } },
        { type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'substitute' } },
      ],
    };
  };
}
```

Also update `applyVolatileTarget` and `applyStatusTarget` factories to pass sound bypass:

```typescript
export function applyVolatileTarget(volatile: string, counter?: number): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    const bypassSub = ctx.move.soundMove === true;
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyVolatile(ctx.targets[i]!, ctx.targetSlotIds[i]!, ctx.userSlotId, volatile, counter, { bypassSub });
      if (event) events.push(event);
    }
    return { events };
  };
}

export function applyStatusTarget(status: StatusCondition): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    const bypassSub = ctx.move.soundMove === true;
    for (let i = 0; i < ctx.targets.length; i++) {
      const event = applyStatus(ctx.targets[i]!, ctx.targetSlotIds[i]!, status, ctx.targetTypes[i]!, { bypassSub });
      if (event) events.push(event);
    }
    return { events };
  };
}
```

Register substitute in `registrations.ts`:

```typescript
import { ..., substitute } from './effectFactories.js';
// in buildDefaultRegistry:
r.register('substitute', substitute());
```

- [ ] **Step 5: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/substitute.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/effects.ts packages/server/src/engine/effectFactories.ts packages/server/src/engine/registrations.ts packages/server/src/engine/__tests__/substitute.test.ts
git commit -m "feat(engine): substitute factory; applyVolatile/applyStatus blocked through sub; sound bypass"
```

---

### Task 10: Substitute damage interception

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/server/src/engine/__tests__/substitute.test.ts`:

```typescript
describe('substitute damage interception', () => {
  it('absorbs damage to sub HP instead of real HP', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'substitute', hp: 50 });
    defender.currentHp = 75; defender.maxHp = 100;

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const defAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defAfter.currentHp).toBe(75); // real HP unchanged
    // sub HP reduced (exact amount depends on damage calc, but sub still active or broken)
  });

  it('sub breaks when sub HP reaches 0 and emits volatile-cured', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'substitute', hp: 1 }); // 1 HP sub
    defender.currentHp = 75; defender.maxHp = 100;

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const defAfter = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defAfter.currentHp).toBe(75);
    expect(defAfter.volatileStatus.some(v => v.name === 'substitute')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'substitute')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/substitute.test.ts
```

Expected: FAIL — damage goes to real HP.

- [ ] **Step 3: Fill in substitute damage interception in `executeMove` hit loop**

Replace the `// TODO Task 10` placeholder in the hit loop with the actual substitute interception. The full updated damage-application block inside the hit loop:

```typescript
const subEntry = target.volatileStatus.find(v => v.name === 'substitute');
if (subEntry && subEntry.hp !== undefined) {
  const subDamage = Math.min(finalDamage, subEntry.hp);
  subEntry.hp -= subDamage;
  totalDamage += subDamage;
  events.push({ type: 'damage-dealt', data: {
    attackerSlotId, targetSlotId, moveId: move.id,
    damage: subDamage, effectiveness, remainingHp: target.currentHp, note: 'substitute',
  }});
  if (subEntry.hp <= 0) {
    target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'substitute');
    events.push({ type: 'volatile-cured', data: { slotId: targetSlotId, volatile: 'substitute' } });
  }
} else {
  const actualDamage = Math.min(finalDamage, target.currentHp);
  const endureEntry = target.volatileStatus.find(v => v.name === 'endure');
  const cappedDamage = (endureEntry && target.currentHp - actualDamage <= 0)
    ? target.currentHp - 1
    : actualDamage;
  target.currentHp -= cappedDamage;
  totalDamage += cappedDamage;
  events.push({ type: 'damage-dealt', data: {
    attackerSlotId, targetSlotId, moveId: move.id,
    damage: cappedDamage, effectiveness, remainingHp: target.currentHp,
  }});
  if (endureEntry && cappedDamage < actualDamage) {
    events.push({ type: 'endure-survived', data: { slotId: targetSlotId } });
  }
  if (target.currentHp <= 0) {
    target.fainted = true;
    target.currentHp = 0;
    events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
  }
}
```

Also gate post-hit secondaries behind sub check — secondaries don't apply through substitute:

```typescript
// Post-hit secondaries — skip if target is behind a substitute
const targetHasSub = target.volatileStatus.some(v => v.name === 'substitute');
if (totalDamage > 0) {
  if (!target.fainted && !targetHasSub) {
    const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes);
    if (secondaryEvent) events.push(secondaryEvent);
    const volatileEvent = evaluateVolatileEffect(move.id, target, targetSlotId, attackerSlotId);
    if (volatileEvent) events.push(volatileEvent);
  }

  const postSecs = secs.filter(sec => sec.kind !== 'multihit' && sec.kind !== 'ohko' && sec.kind !== 'charge');
  if (postSecs.length > 0 && !target.fainted) {
    const isSoundMove = move.soundMove === true;
    if (!targetHasSub || isSoundMove) {
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
}
```

- [ ] **Step 4: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/substitute.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 6: Commit**

```
git add packages/server/src/engine/BattleEngine.ts
git commit -m "feat(engine): substitute absorbs incoming damage; secondaries blocked through sub"
```

---

### Task 11: `lastMoveId` tracking

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`

- [ ] **Step 1: Write failing test**

Create `packages/server/src/engine/__tests__/constraints.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';

describe('lastMoveId tracking', () => {
  it('records the last move used by the attacker', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.lastMoveId).toBe('flamethrower');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/constraints.test.ts
```

Expected: FAIL — `lastMoveId` undefined.

- [ ] **Step 3: Record `lastMoveId` in `executeMove`**

In `packages/server/src/engine/BattleEngine.ts`, at the end of `executeMove` before `return`, after the targeting loop, add:

```typescript
    attacker.lastMoveId = move.id;
    return { newState: s, events };
  }
```

(Add `attacker.lastMoveId = move.id;` just before the final `return { newState: s, events };` in `executeMove`.)

- [ ] **Step 4: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/constraints.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/constraints.test.ts
git commit -m "feat(engine): record lastMoveId on attacker after each executeMove"
```

---

### Task 12: Disable factory + `runPreMove` decrement

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/engine/__tests__/constraints.test.ts`:

```typescript
describe('Disable', () => {
  it('fails if target has no lastMoveId', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'disable', currentPp: 20, maxPp: 20 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'no-last-move')).toBe(true);
  });

  it('applies disable volatile targeting lastMoveId', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'disable', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower';

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const defender = newState.teams[1]!.slots[0]!.party[0]!;
    const disableEntry = defender.volatileStatus.find(v => v.name === 'disable');
    expect(disableEntry).toBeDefined();
    expect(disableEntry?.moveId).toBe('flamethrower');
    expect(disableEntry?.turnsRemaining).toBe(4);
  });

  it('blocks the disabled move and decrements turns on next turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'disable', moveId: 'flamethrower', turnsRemaining: 4 });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 }, // flamethrower (moveIndex 0) is disabled
    });
    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'disabled')).toBe(true);
  });

  it('expire after 4 turns and emit volatile-cured', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'disable', moveId: 'airslash', turnsRemaining: 1 });

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const defender = newState.teams[1]!.slots[0]!.party[0]!;
    expect(defender.volatileStatus.some(v => v.name === 'disable')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'disable')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/constraints.test.ts
```

Expected: FAIL — Disable not implemented.

- [ ] **Step 3: Implement `disable()` factory**

Add to `packages/server/src/engine/effectFactories.ts`:

```typescript
export function disable(): MoveEffectHandler {
  return (ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (!target.lastMoveId) {
      return { events: [{ type: 'move-failed', data: { moveId: 'disable', reason: 'no-last-move' } }] };
    }
    if (target.volatileStatus.some(v => v.name === 'disable')) return { events: [] };
    target.volatileStatus.push({ name: 'disable', moveId: target.lastMoveId, turnsRemaining: 4 });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'disable', moveId: target.lastMoveId } }] };
  };
}
```

- [ ] **Step 4: Add Disable blocking in `BattleEngine.executeMove`**

In `executeMove`, after the preMoveResult blocked check and after the protect-streak clear, before spending PP, add the Disable decrement and block check:

```typescript
// Tick Disable (decrements at start of attacker's turn, before pre-move check)
// Actually: place this BEFORE preMoveResult check so it ticks even when blocked.
```

Wait — I said Disable decrements at start of turn. Let me place it in `executeMove` BEFORE `runPreMove`:

```typescript
// In executeMove, before runPreMove:
// Decrement Disable at start of this Pokémon's turn
const disableEntry = attacker.volatileStatus.find(v => v.name === 'disable');
if (disableEntry) {
  disableEntry.turnsRemaining = (disableEntry.turnsRemaining ?? 1) - 1;
  if ((disableEntry.turnsRemaining ?? 0) <= 0) {
    attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'disable');
    events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: 'disable' } });
  }
}

const preMoveResult = this.effectEngine.runPreMove(attacker, attackerSlotId, s, this.getAllSlots(s));
events.push(...preMoveResult.events);
if (preMoveResult.blocked) return { newState: s, events };
```

Then, after getting `move`, add the Disable block check:

```typescript
// Check if chosen move is disabled
const activeDisable = attacker.volatileStatus.find(v => v.name === 'disable');
if (activeDisable && activeDisable.moveId === move.id) {
  events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'disabled', moveId: move.id } });
  return { newState: s, events };
}
```

Register Disable:

```typescript
import { ..., disable } from './effectFactories.js';
r.register('disable', disable());
```

- [ ] **Step 5: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/constraints.test.ts
```

Expected: Disable tests PASS.

- [ ] **Step 6: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/registrations.ts
git commit -m "feat(engine): Disable volatile — applies, blocks disabled move, expires after 4 turns"
```

---

### Task 13: Taunt, Encore, Torment factories

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/engine/__tests__/constraints.test.ts`:

```typescript
describe('Taunt', () => {
  it('applies taunt volatile with 3 turns remaining', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'taunt', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const defender = newState.teams[1]!.slots[0]!.party[0]!;
    const tauntEntry = defender.volatileStatus.find(v => v.name === 'taunt');
    expect(tauntEntry).toBeDefined();
    expect(tauntEntry?.turnsRemaining).toBe(3);
  });

  it('blocks status moves while taunted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'taunt', turnsRemaining: 2 });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'calmmind', currentPp: 20, maxPp: 20 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'taunted')).toBe(true);
  });

  it('expires after 3 turns (turnsRemaining decrements at EoT)', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'taunt', turnsRemaining: 1 });

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'taunt')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'taunt')).toBe(true);
  });
});

describe('Encore', () => {
  it('forces the encored move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    // p1 has encore forcing 'airslash' (moveIndex 1), but p1 submits moveIndex 0 (flamethrower)
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'encore', moveId: 'airslash', turnsRemaining: 3 });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // Should use airslash, not flamethrower
    const moveUsed = events.find(e => e.type === 'move-used');
    expect((moveUsed?.data as any)?.moveId).toBe('airslash');
  });

  it('expires after 3 turns', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'encore', moveId: 'flamethrower', turnsRemaining: 1 });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'encore')).toBe(false);
  });
});

describe('Torment', () => {
  it('blocks using the same move consecutively', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'torment' });
    state.teams[0]!.slots[0]!.party[0]!.lastMoveId = 'flamethrower';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // flamethrower again
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-blocked' && (e.data as any).reason === 'torment')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/constraints.test.ts
```

Expected: FAIL — Taunt/Encore/Torment not implemented.

- [ ] **Step 3: Implement factories**

Add to `packages/server/src/engine/effectFactories.ts`:

```typescript
export function taunt(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'taunt')) continue;
      if (target.volatileStatus.some(v => v.name === 'substitute')) continue;
      target.volatileStatus.push({ name: 'taunt', turnsRemaining: 3 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'taunt' } });
    }
    return { events };
  };
}

export function encore(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (!target.lastMoveId) {
        events.push({ type: 'move-failed', data: { moveId: 'encore', reason: 'no-last-move' } });
        continue;
      }
      if (target.volatileStatus.some(v => v.name === 'encore')) continue;
      target.volatileStatus.push({ name: 'encore', moveId: target.lastMoveId, turnsRemaining: 3 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'encore', moveId: target.lastMoveId } });
    }
    return { events };
  };
}

export function torment(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'torment' || v.name === 'substitute')) continue;
      target.volatileStatus.push({ name: 'torment' });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'torment' } });
    }
    return { events };
  };
}
```

- [ ] **Step 4: Add Taunt/Encore/Torment enforcement in `executeMove`**

After the Disable block check, add:

```typescript
// Taunt: block status moves
const tauntEntry = attacker.volatileStatus.find(v => v.name === 'taunt');
if (tauntEntry && move.category === 'status') {
  events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'taunted', moveId: move.id } });
  return { newState: s, events };
}

// Encore: force the encored move
const encoreEntry = attacker.volatileStatus.find(v => v.name === 'encore');
if (encoreEntry && encoreEntry.moveId && move.id !== encoreEntry.moveId) {
  const encoreSlot = attacker.moves.find(m => m.moveId === encoreEntry.moveId);
  if (encoreSlot && encoreSlot.currentPp > 0) {
    // Replace the move being used with the encored move
    const encoreMove = this.data.getMove(encoreEntry.moveId);
    if (encoreMove) {
      // mutate action's effective move by repointing
      (move as unknown as { id: string }).id = encoreEntry.moveId;
      // Note: for simplicity reassign move variable reference
    }
  } else {
    // PP ran out, Encore ends
    attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'encore');
  }
}

// Torment: block repeating last move
const tormentActive = attacker.volatileStatus.some(v => v.name === 'torment');
if (tormentActive && attacker.lastMoveId === move.id) {
  events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'torment', moveId: move.id } });
  return { newState: s, events };
}
```

For Encore's move substitution, the cleanest approach is to re-fetch the move:

```typescript
const encoreEntry = attacker.volatileStatus.find(v => v.name === 'encore');
let effectiveMove = move;
if (encoreEntry && encoreEntry.moveId && move.id !== encoreEntry.moveId) {
  const encoreSlot = attacker.moves.find(m => m.moveId === encoreEntry.moveId);
  if (encoreSlot && encoreSlot.currentPp > 0) {
    const encoreMove = this.data.getMove(encoreEntry.moveId);
    if (encoreMove) effectiveMove = encoreMove;
  } else {
    attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'encore');
  }
}
// Use effectiveMove instead of move for the rest of executeMove
```

Replace all subsequent uses of `move` in the function body with `effectiveMove` (or rename the variable at the top). In practice, the simplest approach is to `const move = effectiveMove;` after this block and use a `let move = ...` declaration at the start. Add `let` to the `move` declaration:

```typescript
let move = this.data.getMove(moveSlot.moveId);
if (!move) return { newState: s, events };
```

Then after Encore check: `if (encoreMove) move = encoreMove;`

- [ ] **Step 5: Add Taunt/Encore EoT decrement in `EffectEngine.runEndOfTurn`**

In `packages/server/src/engine/EffectEngine.ts`, in `runEndOfTurn` (after existing EoT handlers), add:

```typescript
// Taunt decrement
const tauntEntry = pokemon.volatileStatus.find(v => v.name === 'taunt');
if (tauntEntry) {
  tauntEntry.turnsRemaining = (tauntEntry.turnsRemaining ?? 1) - 1;
  if ((tauntEntry.turnsRemaining ?? 0) <= 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'taunt');
    events.push({ type: 'volatile-cured', data: { slotId, volatile: 'taunt' } });
  }
}

// Encore decrement
const encoreEntry = pokemon.volatileStatus.find(v => v.name === 'encore');
if (encoreEntry) {
  encoreEntry.turnsRemaining = (encoreEntry.turnsRemaining ?? 1) - 1;
  if ((encoreEntry.turnsRemaining ?? 0) <= 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'encore');
    events.push({ type: 'volatile-cured', data: { slotId, volatile: 'encore' } });
  }
}
```

- [ ] **Step 6: Register Taunt, Encore, Torment**

In `registrations.ts`:

```typescript
import { ..., taunt, encore, torment } from './effectFactories.js';
r.register('taunt',   taunt());
r.register('encore',  encore());
r.register('torment', torment());
```

- [ ] **Step 7: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/constraints.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 9: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/EffectEngine.ts packages/server/src/engine/registrations.ts
git commit -m "feat(engine): Taunt blocks status moves; Encore forces last move; Torment prevents repeats"
```

---

### Task 14: `buildValidMoves` refactor for constraint visibility

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`

- [ ] **Step 1: Update `buildValidMoves` to take full `PartyMember`**

In `packages/server/src/socket/BattleRoom.ts`, change the signature of `buildValidMoves` from:

```typescript
private buildValidMoves(slotId: string, moves: PartyMember['moves']): ActionRequestPayload['validMoves'] {
```

to:

```typescript
private buildValidMoves(slotId: string, active: PartyMember): ActionRequestPayload['validMoves'] {
```

Update the body to check volatiles:

```typescript
private buildValidMoves(slotId: string, active: PartyMember): ActionRequestPayload['validMoves'] {
  const disableEntry = active.volatileStatus.find(v => v.name === 'disable');
  const tauntActive = active.volatileStatus.some(v => v.name === 'taunt');
  const encoreEntry = active.volatileStatus.find(v => v.name === 'encore');
  const tormentActive = active.volatileStatus.some(v => v.name === 'torment');

  return active.moves.map((m, i) => {
    const moveData = this.data.getMove(m.moveId);
    if (!moveData) console.warn(`[BattleRoom] Unknown moveId "${m.moveId}" — defaulting targetType to 'normal'`);
    const targetType = moveData?.target ?? 'normal';

    let disabled = false;
    if (m.currentPp === 0) disabled = true;
    if (disableEntry?.moveId === m.moveId) disabled = true;
    if (tauntActive && moveData?.category === 'status') disabled = true;
    if (encoreEntry && encoreEntry.moveId && m.moveId !== encoreEntry.moveId) disabled = true;
    if (tormentActive && active.lastMoveId === m.moveId) disabled = true;

    return {
      index: i as 0 | 1 | 2 | 3,
      moveId: m.moveId,
      pp: m.currentPp,
      disabled,
      targetType,
      legalTargets: getLegalTargets(this.state, slotId, targetType),
    };
  });
}
```

- [ ] **Step 2: Update all call sites of `buildValidMoves`**

There are three call sites. Change each from `this.buildValidMoves(slotId, active.moves)` to `this.buildValidMoves(slotId, active)`:

Call site 1 (around line 135):
```typescript
validMoves: this.buildValidMoves(slot.slotId, active),
```

Call site 2 (NPC request, around line 347):
```typescript
validMoves: this.buildValidMoves(slot.slotId, active),
```

Call site 3 (sync request, around line 369):
```typescript
validMoves: this.buildValidMoves(slot.slotId, active),
```

- [ ] **Step 3: Block switching when Ingrain is active**

In the `buildActionRequest` method (around line 129–141), add Ingrain switching prevention:

```typescript
const hasIngrain = active.volatileStatus.some(v => v.name === 'ingrain');
return {
  slotId: slot.slotId,
  validMoves: this.buildValidMoves(slot.slotId, active),
  canSwitch: !hasIngrain && slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
  switchTargets: hasIngrain ? [] : slot.party
    .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
    .map((p) => p.instanceId),
  canTerastallize: !active.hasTerastallized && !!active.teraType,
};
```

- [ ] **Step 4: Build server to confirm no type errors**

```
cd packages/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 6: Commit**

```
git add packages/server/src/socket/BattleRoom.ts
git commit -m "feat(socket): buildValidMoves disables moves per Taunt/Encore/Disable/Torment; Ingrain blocks switch"
```

---

### Task 15: Focus Energy, Aqua Ring, Ingrain

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/engine/__tests__/passiveVolatiles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';
import { computeCritStage } from '../accuracy.js';

describe('Focus Energy', () => {
  it('registration: using focusenergy applies volatile', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'focusenergy', currentPp: 30, maxPp: 30 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'focusenergy')).toBe(true);
  });

  it('computeCritStage returns +2 when focusenergy volatile present', () => {
    const stage = computeCritStage(undefined, [{ name: 'focusenergy' }]);
    expect(stage).toBe(2);
  });
});

describe('Aqua Ring', () => {
  it('heals 1/16 max HP at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 50; p1.maxHp = 160;
    p1.volatileStatus.push({ name: 'aqua-ring' });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.currentHp).toBe(60); // 50 + floor(160/16) = 50 + 10
  });
});

describe('Ingrain', () => {
  it('heals 1/16 max HP at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 50; p1.maxHp = 160;
    p1.volatileStatus.push({ name: 'ingrain' });

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.currentHp).toBe(60);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/passiveVolatiles.test.ts
```

Expected: FAIL — focusenergy/aqua-ring/ingrain not registered.

- [ ] **Step 3: Implement factories and EoT handlers**

Add to `packages/server/src/engine/effectFactories.ts`:

```typescript
export function aquaRing(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'aqua-ring')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'aqua-ring' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'aqua-ring' } }] };
  };
}

export function ingrain(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'ingrain')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'ingrain' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'ingrain' } }] };
  };
}
```

Focus Energy uses `applyVolatileSelf('focusenergy')` — no new factory needed.

Add EoT handlers to `EffectEngine.runEndOfTurn`:

```typescript
// Aqua Ring heal
if (pokemon.volatileStatus.some(v => v.name === 'aqua-ring')) {
  const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
  const actual = Math.min(heal, pokemon.maxHp - pokemon.currentHp);
  if (actual > 0) {
    pokemon.currentHp += actual;
    events.push({ type: 'heal', data: { slotId, amount: actual, remainingHp: pokemon.currentHp, source: 'aqua-ring' } });
  }
}

// Ingrain heal
if (pokemon.volatileStatus.some(v => v.name === 'ingrain')) {
  const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
  const actual = Math.min(heal, pokemon.maxHp - pokemon.currentHp);
  if (actual > 0) {
    pokemon.currentHp += actual;
    events.push({ type: 'heal', data: { slotId, amount: actual, remainingHp: pokemon.currentHp, source: 'ingrain' } });
  }
}
```

- [ ] **Step 4: Register in `registrations.ts`**

```typescript
import { ..., aquaRing, ingrain } from './effectFactories.js';
r.register('focusenergy', applyVolatileSelf('focusenergy'));
r.register('aquaring',    aquaRing());
r.register('ingrain',     ingrain());
```

- [ ] **Step 5: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/passiveVolatiles.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/EffectEngine.ts packages/server/src/engine/registrations.ts packages/server/src/engine/__tests__/passiveVolatiles.test.ts
git commit -m "feat(engine): Focus Energy (+2 crit), Aqua Ring and Ingrain (1/16 EoT heal)"
```

---

### Task 16: Magnet Rise + Perish Song

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/engine/__tests__/passiveVolatiles.test.ts`:

```typescript
describe('Magnet Rise', () => {
  it('grants immunity to Ground moves for 5 turns', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const defender = state.teams[1]!.slots[0]!.party[0]!;
    defender.volatileStatus.push({ name: 'magnet-rise', turnsRemaining: 3 });

    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const damageToDef = events.filter(e => e.type === 'damage-dealt' && (e.data as any).targetSlotId === 'slot-b1');
    expect(damageToDef).toHaveLength(0);
  });

  it('expires after 5 turns', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'magnet-rise', turnsRemaining: 1 });

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'magnet-rise')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'magnet-rise')).toBe(true);
  });
});

describe('Perish Song', () => {
  it('applies perishsong to all active pokemon with counter 3', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'perishsong', currentPp: 5, maxPp: 5 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    // Applied at counter=3, then EoT decrements to 2
    expect(p1.volatileStatus.find(v => v.name === 'perishsong')?.counter).toBe(2);
    expect(p2.volatileStatus.find(v => v.name === 'perishsong')?.counter).toBe(2);
  });

  it('faints pokemon when perishsong counter reaches 0 at EoT', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'perishsong', counter: 0 });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'faint' && (e.data as any).slotId === 'slot-a1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/passiveVolatiles.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement Magnet Rise factory and EoT tick**

Add to `effectFactories.ts`:

```typescript
export function magnetRise(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'magnet-rise')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'magnet-rise', turnsRemaining: 5 });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'magnet-rise' } }] };
  };
}
```

Add to `EffectEngine.runEndOfTurn`:

```typescript
const magnetEntry = pokemon.volatileStatus.find(v => v.name === 'magnet-rise');
if (magnetEntry) {
  magnetEntry.turnsRemaining = (magnetEntry.turnsRemaining ?? 1) - 1;
  if ((magnetEntry.turnsRemaining ?? 0) <= 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'magnet-rise');
    events.push({ type: 'volatile-cured', data: { slotId, volatile: 'magnet-rise' } });
  }
}

const perishEntry = pokemon.volatileStatus.find(v => v.name === 'perishsong');
if (perishEntry) {
  if ((perishEntry.counter ?? 0) <= 0) {
    pokemon.currentHp = 0;
    pokemon.fainted = true;
    events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
  } else {
    perishEntry.counter = (perishEntry.counter ?? 1) - 1;
  }
}
```

- [ ] **Step 4: Add Magnet Rise Ground immunity in `BattleEngine.executeMove`**

In the damaging-move target loop, after the `effectiveness === 0` no-effect check, add:

```typescript
if (move.type === 'Ground' && target.volatileStatus.some(v => v.name === 'magnet-rise')) {
  events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
  continue;
}
```

- [ ] **Step 5: Implement Perish Song factory**

Add to `effectFactories.ts`:

```typescript
export function perishSong(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (const team of ctx.battle.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        if (active.volatileStatus.some(v => v.name === 'perishsong')) continue;
        active.volatileStatus.push({ name: 'perishsong', counter: 3 });
        events.push({ type: 'volatile-applied', data: { targetSlotId: slot.slotId, volatile: 'perishsong', counter: 3 } });
      }
    }
    return { events };
  };
}
```

- [ ] **Step 6: Register**

```typescript
import { ..., magnetRise, perishSong } from './effectFactories.js';
r.register('magnetrise', magnetRise());
r.register('perishsong', perishSong());
```

- [ ] **Step 7: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/passiveVolatiles.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 9: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/EffectEngine.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/registrations.ts
git commit -m "feat(engine): Magnet Rise (Ground immunity, 5 turns), Perish Song (3-turn countdown faint)"
```

---

### Task 17: Foresight, Miracle Eye, Destiny Bond

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/engine/__tests__/miscVolatiles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { makePokemon, make1v1State } from './fixtures.js';

describe('Foresight', () => {
  it('applies foresight volatile to target', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'foresight', currentPp: 40, maxPp: 40 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'foresight')).toBe(true);
  });
});

describe('Miracle Eye', () => {
  it('applies miracle-eye volatile to target', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'miracleeye', currentPp: 40, maxPp: 40 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'miracle-eye')).toBe(true);
  });
});

describe('Destiny Bond', () => {
  it('applies destiny-bond volatile to user', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'destinybond', currentPp: 5, maxPp: 5 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'destiny-bond')).toBe(true);
  });

  it('faints the attacker if destiny-bond user faints from their attack', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 1;
    p2.volatileStatus.push({ name: 'destiny-bond' });

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'faint' && (e.data as any).slotId === 'slot-b1')).toBe(true);
    expect(events.some(e => e.type === 'faint' && (e.data as any).slotId === 'slot-a1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/miscVolatiles.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement Destiny Bond factory**

Add to `effectFactories.ts`:

```typescript
export function destinyBond(): MoveEffectHandler {
  return (ctx) => {
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'destiny-bond');
    ctx.user.volatileStatus.push({ name: 'destiny-bond' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'destiny-bond' } }] };
  };
}
```

- [ ] **Step 4: Add Foresight/Miracle Eye type override in `BattleEngine.executeMove`**

In the damaging-move target loop, after computing `defTypes`, replace the `const effectiveness = ...` line with:

```typescript
let effectiveDefTypes = defTypes;
if (target.volatileStatus.some(v => v.name === 'foresight')) {
  if (move.type === 'Normal' || move.type === 'Fighting') {
    effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Ghost');
  }
}
if (target.volatileStatus.some(v => v.name === 'miracle-eye') && move.type === 'Psychic') {
  effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Dark');
}
// Roost: remove Flying type for defending Pokemon this turn
if (target.volatileStatus.some(v => v.name === 'roost')) {
  effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Flying');
  if (effectiveDefTypes.length === 0) effectiveDefTypes = ['Normal'];
}
const effectiveness = this.data.getCombinedEffectiveness(move.type, effectiveDefTypes);
```

- [ ] **Step 5: Add Destiny Bond trigger in faint path**

After `events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } })`, add:

```typescript
const dbEntry = target.volatileStatus.find(v => v.name === 'destiny-bond');
if (dbEntry && !attacker.fainted) {
  attacker.currentHp = 0;
  attacker.fainted = true;
  events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
}
```

Also update the EoT protect/roost removal line to also clear destiny-bond:

```typescript
pokemon.volatileStatus = pokemon.volatileStatus.filter(
  v => v.name !== 'protect' && v.name !== 'roost' && v.name !== 'destiny-bond'
);
```

- [ ] **Step 6: Register**

```typescript
import { ..., destinyBond } from './effectFactories.js';
r.register('foresight',   applyVolatileTarget('foresight'));
r.register('odorsleuth',  applyVolatileTarget('foresight'));
r.register('miracleeye',  applyVolatileTarget('miracle-eye'));
r.register('destinybond', destinyBond());
```

- [ ] **Step 7: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/miscVolatiles.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 9: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/EffectEngine.ts packages/server/src/engine/registrations.ts packages/server/src/engine/__tests__/miscVolatiles.test.ts
git commit -m "feat(engine): Foresight/Miracle Eye type overrides; Destiny Bond faints attacker"
```

---

### Task 18: Roost

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/server/src/engine/__tests__/miscVolatiles.test.ts`:

```typescript
describe('Roost', () => {
  it('heals 50% max HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 40; p1.maxHp = 100;
    p1.moves[0] = { moveId: 'roost', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(90);
  });

  it('roost volatile removed at EoT', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'roost', currentPp: 10, maxPp: 10 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'roost')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/miscVolatiles.test.ts
```

Expected: Roost tests FAIL — no roost volatile applied.

- [ ] **Step 3: Implement Roost factory**

Add to `effectFactories.ts`:

```typescript
export function roost(): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'heal-block')) {
      return { events: [{ type: 'move-failed', data: { moveId: 'roost', reason: 'heal-blocked' } }] };
    }
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.5), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'roost');
    ctx.user.volatileStatus.push({ name: 'roost' });
    return {
      events: [
        { type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } },
        { type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'roost' } },
      ],
    };
  };
}
```

- [ ] **Step 4: Replace the Roost registration**

In `registrations.ts`, replace:

```typescript
r.register('roost',       healPercent(0.5));
```

with:

```typescript
import { ..., roost } from './effectFactories.js';
r.register('roost', roost());
```

The roost volatile is already cleared at EoT by the filter line added in Task 7/17. The Flying-type removal for `roost` is already in place in the `executeMove` type override block added in Task 17.

- [ ] **Step 5: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/miscVolatiles.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 7: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/registrations.ts
git commit -m "feat(engine): Roost heals 50% HP, applies roost volatile (removes Flying type for the turn)"
```

---

### Task 19: Embargo + Heal Block

**Files:**
- Modify: `packages/server/src/engine/effectFactories.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/registrations.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/engine/__tests__/miscVolatiles.test.ts`:

```typescript
describe('Embargo', () => {
  it('applies embargo with 5 turns remaining', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'embargo', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.find(v => v.name === 'embargo')?.turnsRemaining).toBe(5);
  });

  it('expires after 5 turns emitting volatile-cured', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'embargo', turnsRemaining: 1 });

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'embargo')).toBe(false);
    expect(events.some(e => e.type === 'volatile-cured' && (e.data as any).volatile === 'embargo')).toBe(true);
  });
});

describe('Heal Block', () => {
  it('applies heal-block with 5 turns remaining', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'healblock', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.find(v => v.name === 'heal-block')?.turnsRemaining).toBe(5);
  });

  it('prevents Recover from healing when heal-block active', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.currentHp = 50; p1.maxHp = 100;
    p1.volatileStatus.push({ name: 'heal-block', turnsRemaining: 3 });
    p1.moves[0] = { moveId: 'recover', currentPp: 10, maxPp: 10 };

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && (e.data as any).reason === 'heal-blocked')).toBe(true);
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(50);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd packages/server && npx vitest run __tests__/miscVolatiles.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement factories**

Add to `effectFactories.ts`:

```typescript
export function embargoFactory(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'embargo')) continue;
      target.volatileStatus.push({ name: 'embargo', turnsRemaining: 5 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'embargo' } });
    }
    return { events };
  };
}

export function healBlockFactory(): MoveEffectHandler {
  return (ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      if (target.volatileStatus.some(v => v.name === 'heal-block')) continue;
      target.volatileStatus.push({ name: 'heal-block', turnsRemaining: 5 });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.targetSlotIds[i]!, volatile: 'heal-block' } });
    }
    return { events };
  };
}
```

Update `healPercent` to check Heal Block:

```typescript
export function healPercent(fraction: number): MoveEffectHandler {
  return (ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'heal-block')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'heal-blocked' } }] };
    }
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  };
}
```

- [ ] **Step 4: Add EoT decrements**

In `EffectEngine.runEndOfTurn`:

```typescript
const embargoEntry = pokemon.volatileStatus.find(v => v.name === 'embargo');
if (embargoEntry) {
  embargoEntry.turnsRemaining = (embargoEntry.turnsRemaining ?? 1) - 1;
  if ((embargoEntry.turnsRemaining ?? 0) <= 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'embargo');
    events.push({ type: 'volatile-cured', data: { slotId, volatile: 'embargo' } });
  }
}

const healBlockEntry = pokemon.volatileStatus.find(v => v.name === 'heal-block');
if (healBlockEntry) {
  healBlockEntry.turnsRemaining = (healBlockEntry.turnsRemaining ?? 1) - 1;
  if ((healBlockEntry.turnsRemaining ?? 0) <= 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'heal-block');
    events.push({ type: 'volatile-cured', data: { slotId, volatile: 'heal-block' } });
  }
}
```

- [ ] **Step 5: Add Embargo guard on item EoT hook in `BattleEngine.endOfTurn`**

```typescript
const hasEmbargo = active.volatileStatus.some(v => v.name === 'embargo');
if (itemHooks.onEndOfTurn && !hasEmbargo) {
  // ... existing hpDelta logic
}
```

- [ ] **Step 6: Register**

```typescript
import { ..., embargoFactory, healBlockFactory } from './effectFactories.js';
r.register('embargo',   embargoFactory());
r.register('healblock', healBlockFactory());
```

- [ ] **Step 7: Run tests to confirm pass**

```
cd packages/server && npx vitest run __tests__/miscVolatiles.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full suite**

```
cd packages/server && npx vitest run
```

- [ ] **Step 9: Commit**

```
git add packages/server/src/engine/effectFactories.ts packages/server/src/engine/EffectEngine.ts packages/server/src/engine/BattleEngine.ts packages/server/src/engine/registrations.ts
git commit -m "feat(engine): Embargo (blocks item EoT, 5 turns), Heal Block (blocks healing, 5 turns)"
```

---

### Task 20: Final integration pass

- [ ] **Step 1: Run full test suite**

```
cd packages/server && npx vitest run --reporter=verbose
```

Expected: all tests pass except the pre-existing Bind volatile test.

- [ ] **Step 2: Run shared suite**

```
cd packages/shared && npx vitest run
```

Expected: all pass.

- [ ] **Step 3: TypeScript check**

```
cd packages/shared && npm run build && cd ../server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Spec success-criteria checklist**

Verify these by inspecting test output:
- Protect blocks incoming move on correct turn: ✓ `protect.test.ts`
- Consecutive Protects fail at ~33% on turn 2: ✓ `protect.test.ts` (rng-controlled)
- Substitute absorbs exactly `floor(maxHp/4)` before breaking: ✓ `substitute.test.ts`
- Status moves cannot apply through Substitute; sound moves can: ✓ `substitute.test.ts`
- Taunt prevents status moves for 3 turns then expires: ✓ `constraints.test.ts`
- Encore forces encored move for 3 turns: ✓ `constraints.test.ts`
- Focus Energy → crit stage +2 verified via `computeCritStage`: ✓ `passiveVolatiles.test.ts`
- Perish Song: both Pokémon faint when counter reaches 0: ✓ `passiveVolatiles.test.ts`
- Aqua Ring heals 1/16 max HP per turn: ✓ `passiveVolatiles.test.ts`

- [ ] **Step 5: Commit final tag**

```
git commit --allow-empty -m "feat(engine): volatile status expansion (4.1-4.5) complete"
```

---

## Open Questions (documented, not blocking)

1. **Multi-hit through Substitute**: Gen 5+ — first hit breaks sub, remaining hits land on real HP. Current implementation stops at sub break. Deferred.
2. **Encore + PP=0**: Encore ends immediately when the encored move has 0 PP. Implemented.
3. **Torment + single move**: If all available moves are Tormented, the Pokémon emits `move-failed`. Struggle generation is deferred.
4. **Roost + same-turn incoming**: Works correctly — volatile applied during user's turn, Flying type removed when they're targeted later that turn.
5. **Imprison**: Emits `move-failed: unimplemented` via registry miss. Correct per spec.
