# Effect Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `EffectEngine` class that correctly gates moves through status/volatile pre-checks (with Gen 5+ wake-up-and-act sleep mechanics), centralizes all end-of-turn effects, and implements yawn, confusion, leech seed, and bind/wrap as volatile effects.

**Architecture:** `EffectEngine` owns two phases per turn: `runPreMove` (sleep/freeze/paralysis/confusion gates before each move executes) and `runEndOfTurn` (burn/poison/toxic/leech-seed/bind/yawn per active pokemon). `BattleEngine` delegates to a private `effectEngine` instance. Volatile moves dispatch through `applyVolatile` in `effects.ts`; bind/wrap apply their volatile after damage via `evaluateVolatileEffect`.

**Tech Stack:** TypeScript, Vitest, `calcDamage`/`randomDamageFactor` (damage.ts), `getEffectiveStat` (stats.ts), `applyStatus` (effects.ts), `getBurnDamage`/`getPoisonDamage`/`getToxicDamage`/constants (status.ts).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/src/types/battle.ts` | Modify | Add `sourceSlotId` to `VolatileStatusEntry` |
| `packages/shared/src/types/events.ts` | Modify | Add `'move-blocked'` and `'volatile-cured'` to event type union |
| `packages/server/src/engine/EffectEngine.ts` | **Create** | `EffectEngine` class — all pre-move gates and EOT volatile/status logic |
| `packages/server/src/engine/__tests__/EffectEngine.test.ts` | **Create** | Unit tests for EffectEngine (built up across Tasks 2–8) |
| `packages/server/src/engine/status.ts` | Modify | Delete dead `tickStatus` / `StatusTickResult` (Task 12 only) |
| `packages/server/src/engine/__tests__/status.test.ts` | Modify | Remove `tickStatus` describe blocks |
| `packages/server/src/engine/effects.ts` | Modify | Add `applyVolatile`, `evaluateVolatileEffect`, `BOUND_MOVES` |
| `packages/server/src/engine/__tests__/effects.test.ts` | Modify | Tests for the two new functions |
| `packages/server/src/engine/moves.ts` | Modify | Extend `StatusMoveResult`; add yawn, confuseray, supersonic, sweetkiss, leechseed |
| `packages/server/src/engine/BattleEngine.ts` | Modify | Wire EffectEngine pre-move + EOT; add `getAllSlots`; add volatile dispatch; delete inline checks |
| `packages/server/src/engine/__tests__/BattleEngine.test.ts` | Modify | Update sleep test; add wake-up, bind EOT, leech seed integration tests |

---

### Task 1: Shared type additions

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Add `sourceSlotId` to `VolatileStatusEntry`**

In `packages/shared/src/types/battle.ts`, change:

```typescript
export interface VolatileStatusEntry {
  name: string;
  counter?: number;
}
```

To:

```typescript
export interface VolatileStatusEntry {
  name: string;
  counter?: number;
  sourceSlotId?: string;
}
```

- [ ] **Step 2: Add `'move-blocked'` and `'volatile-cured'` to `TurnResolveEvent`**

In `packages/shared/src/types/events.ts`, change the type union:

```typescript
export interface TurnResolveEvent {
  type:
    | 'move-used'
    | 'damage-dealt'
    | 'heal'
    | 'status-applied'
    | 'status-cured'
    | 'stat-change'
    | 'weather-change'
    | 'terrain-change'
    | 'volatile-applied'
    | 'terastallize'
    | 'faint';
  data: Record<string, unknown>;
}
```

To:

```typescript
export interface TurnResolveEvent {
  type:
    | 'move-used'
    | 'move-blocked'
    | 'damage-dealt'
    | 'heal'
    | 'status-applied'
    | 'status-cured'
    | 'stat-change'
    | 'weather-change'
    | 'terrain-change'
    | 'volatile-applied'
    | 'volatile-cured'
    | 'terastallize'
    | 'faint';
  data: Record<string, unknown>;
}
```

`move-blocked` data: `{ slotId, pokemonName, reason: 'asleep' | 'frozen' | 'paralysis' | 'confusion' }`
`volatile-cured` data: `{ slotId, volatile: string }`

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/battle.ts packages/shared/src/types/events.ts
git commit -m "feat(shared): add sourceSlotId to VolatileStatusEntry, move-blocked and volatile-cured events"
```

---

### Task 2: EffectEngine — create class + sleep pre-move

**Files:**
- Create: `packages/server/src/engine/EffectEngine.ts`
- Create: `packages/server/src/engine/__tests__/EffectEngine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/engine/__tests__/EffectEngine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EffectEngine } from '../EffectEngine.js';
import type { SlotContext } from '../EffectEngine.js';
import { makePokemon } from './fixtures.js';
import type { BattleState } from '@poke-fighter/shared';

const emptyState = {} as BattleState;
const emptySlots: SlotContext[] = [];

describe('EffectEngine.runPreMove — sleep', () => {
  it('blocks the move and decrements counter when counter > 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'slp',
      volatileStatus: [{ name: 'sleep', counter: 2 }],
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(result.events.some(e => e.type === 'move-blocked')).toBe(true);
    const evt = result.events.find(e => e.type === 'move-blocked')!;
    expect(evt.data['reason']).toBe('asleep');
  });

  it('wakes the pokemon and allows the move when counter is 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'slp',
      volatileStatus: [{ name: 'sleep', counter: 0 }],
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBeUndefined();
    expect(pokemon.volatileStatus.find(v => v.name === 'sleep')).toBeUndefined();
    expect(result.events.some(e => e.type === 'status-cured')).toBe(true);
  });

  it('wakes the pokemon when there is no sleep volatile entry (defensive guard)', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'slp', volatileStatus: [] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBeUndefined();
  });

  it('does not block a pokemon with no status', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon();
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(result.events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: FAIL — `Cannot find module '../EffectEngine.js'`

- [ ] **Step 3: Create `EffectEngine.ts` with sleep pre-move**

Create `packages/server/src/engine/EffectEngine.ts`:

```typescript
import type {
  PartyMember, BattleState, TurnResolveEvent,
} from '@poke-fighter/shared';

export interface SlotContext {
  member: PartyMember;
  slotId: string;
  teamIndex: number;
}

export interface PreMoveResult {
  blocked: boolean;
  events: TurnResolveEvent[];
}

export interface EndOfTurnResult {
  events: TurnResolveEvent[];
}

export class EffectEngine {
  runPreMove(
    pokemon: PartyMember,
    slotId: string,
    _state: BattleState,
    _allSlots: SlotContext[],
  ): PreMoveResult {
    const events: TurnResolveEvent[] = [];

    if (pokemon.status === 'slp') {
      const entry = pokemon.volatileStatus.find(v => v.name === 'sleep');
      if (!entry || (entry.counter ?? 0) === 0) {
        pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'sleep');
        delete pokemon.status;
        events.push({ type: 'status-cured', data: { slotId, status: 'slp' } });
        return { blocked: false, events };
      }
      events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'asleep' } });
      entry.counter = (entry.counter ?? 1) - 1;
      return { blocked: true, events };
    }

    return { blocked: false, events };
  }

  runEndOfTurn(
    _pokemon: PartyMember,
    _slotId: string,
    _state: BattleState,
    _allSlots: SlotContext[],
  ): EndOfTurnResult {
    return { events: [] };
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: all 4 sleep tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(server): EffectEngine class with sleep pre-move gate"
```

---

### Task 3: EffectEngine — freeze pre-move

**Files:**
- Modify: `packages/server/src/engine/__tests__/EffectEngine.test.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`

- [ ] **Step 1: Append freeze tests to `EffectEngine.test.ts`**

Add at the bottom of the file:

```typescript
import { vi } from 'vitest';

describe('EffectEngine.runPreMove — freeze', () => {
  it('thaws the pokemon and allows the move on a successful thaw roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.2 → thaws
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'frz' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBeUndefined();
    expect(result.events.some(e => e.type === 'status-cured')).toBe(true);
    vi.restoreAllMocks();
  });

  it('blocks the move when the thaw roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.5 >= 0.2 → stays frozen
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'frz' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.status).toBe('frz');
    expect(result.events.some(e => e.type === 'move-blocked')).toBe(true);
    const evt = result.events.find(e => e.type === 'move-blocked')!;
    expect(evt.data['reason']).toBe('frozen');
    vi.restoreAllMocks();
  });
});
```

Note: `vi` must be in the import at the top of the file — add it if not already there: `import { describe, it, expect, vi } from 'vitest';`

- [ ] **Step 2: Run tests to confirm the freeze tests fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: 2 new freeze tests FAIL.

- [ ] **Step 3: Add freeze handling to `runPreMove` in `EffectEngine.ts`**

Add these imports at the top of `EffectEngine.ts`:

```typescript
import { FREEZE_THAW_CHANCE } from './status.js';
```

Add the freeze block inside `runPreMove`, after the sleep block and before `return { blocked: false, events }`:

```typescript
if (pokemon.status === 'frz') {
  if (Math.random() < FREEZE_THAW_CHANCE) {
    delete pokemon.status;
    events.push({ type: 'status-cured', data: { slotId, status: 'frz' } });
    return { blocked: false, events };
  }
  events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'frozen' } });
  return { blocked: true, events };
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(server): EffectEngine freeze pre-move — thaw and act on successful roll"
```

---

### Task 4: EffectEngine — paralysis pre-move

**Files:**
- Modify: `packages/server/src/engine/__tests__/EffectEngine.test.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`

- [ ] **Step 1: Append paralysis tests**

Add at the bottom of `EffectEngine.test.ts`:

```typescript
describe('EffectEngine.runPreMove — paralysis', () => {
  it('blocks the move on a full-paralysis roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.25 → fully paralyzed
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'par' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.status).toBe('par'); // status stays
    expect(result.events.some(e => e.type === 'move-blocked')).toBe(true);
    const evt = result.events.find(e => e.type === 'move-blocked')!;
    expect(evt.data['reason']).toBe('paralysis');
    vi.restoreAllMocks();
  });

  it('allows the move when the paralysis roll does not trigger', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.5 >= 0.25 → passes
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'par' });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.status).toBe('par'); // status stays
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: 2 new paralysis tests FAIL.

- [ ] **Step 3: Add paralysis handling to `runPreMove`**

Add to imports in `EffectEngine.ts`:

```typescript
import { FREEZE_THAW_CHANCE, PARALYSIS_FULL_PARALYSIS_CHANCE } from './status.js';
```

Add the paralysis block inside `runPreMove`, after the freeze block:

```typescript
if (pokemon.status === 'par') {
  if (Math.random() < PARALYSIS_FULL_PARALYSIS_CHANCE) {
    events.push({ type: 'move-blocked', data: { slotId, pokemonName: pokemon.nickname, reason: 'paralysis' } });
    return { blocked: true, events };
  }
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(server): EffectEngine paralysis pre-move gate (25% full-paralysis chance)"
```

---

### Task 5: EffectEngine — confusion pre-move

**Files:**
- Modify: `packages/server/src/engine/__tests__/EffectEngine.test.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`

- [ ] **Step 1: Append confusion tests**

Add at the bottom of `EffectEngine.test.ts`:

```typescript
describe('EffectEngine.runPreMove — confusion', () => {
  it('cures confusion and allows the move when counter is 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'confusion', counter: 0 }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.volatileStatus.find(v => v.name === 'confusion')).toBeUndefined();
    expect(result.events.some(e => e.type === 'volatile-cured')).toBe(true);
    const evt = result.events.find(e => e.type === 'volatile-cured')!;
    expect(evt.data['volatile']).toBe('confusion');
  });

  it('decrements counter and blocks on a self-hit roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // < 0.33 → self-hit; also makes randomDamageFactor deterministic
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      volatileStatus: [{ name: 'confusion', counter: 2 }],
      currentHp: 100, maxHp: 100,
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(pokemon.currentHp).toBeLessThan(100);
    expect(result.events.some(e => e.type === 'damage-dealt')).toBe(true);
    const dmgEvt = result.events.find(e => e.type === 'damage-dealt')!;
    expect(dmgEvt.data['source']).toBe('confusion');
    vi.restoreAllMocks();
  });

  it('decrements counter and allows the move when self-hit does not trigger', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // >= 0.33 → no self-hit
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'confusion', counter: 2 }] });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(false);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(result.events).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('a sleeping pokemon does not roll confusion', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would trigger self-hit if confusion ran
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'slp',
      volatileStatus: [{ name: 'sleep', counter: 1 }, { name: 'confusion', counter: 2 }],
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    // confusion counter must not have changed
    expect(pokemon.volatileStatus.find(v => v.name === 'confusion')!.counter).toBe(2);
    vi.restoreAllMocks();
  });

  it('a confused pokemon faints from self-hit damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      volatileStatus: [{ name: 'confusion', counter: 1 }],
      currentHp: 1, maxHp: 100,
    });
    const result = engine.runPreMove(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(result.blocked).toBe(true);
    expect(pokemon.fainted).toBe(true);
    expect(pokemon.currentHp).toBe(0);
    expect(result.events.some(e => e.type === 'faint')).toBe(true);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: 5 new confusion tests FAIL.

- [ ] **Step 3: Add confusion handling to `runPreMove`**

Add imports to `EffectEngine.ts`:

```typescript
import { FREEZE_THAW_CHANCE, PARALYSIS_FULL_PARALYSIS_CHANCE, CONFUSION_HURT_CHANCE } from './status.js';
import { calcDamage, randomDamageFactor } from './damage.js';
import { getEffectiveStat } from './stats.js';
```

Add the confusion block inside `runPreMove`, after the paralysis block (before the final `return { blocked: false, events }`):

```typescript
const confusionEntry = pokemon.volatileStatus.find(v => v.name === 'confusion');
if (confusionEntry) {
  if ((confusionEntry.counter ?? 0) === 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'confusion');
    events.push({ type: 'volatile-cured', data: { slotId, volatile: 'confusion' } });
  } else {
    confusionEntry.counter = (confusionEntry.counter ?? 1) - 1;
    if (Math.random() < CONFUSION_HURT_CHANCE) {
      const atkStat = getEffectiveStat(pokemon.stats.atk, pokemon.statBoosts.atk, 'atk');
      const defStat = getEffectiveStat(pokemon.stats.def, pokemon.statBoosts.def, 'def');
      const { damage } = calcDamage({
        level: pokemon.level,
        attackStat: atkStat,
        defenseStat: defStat,
        basePower: 40,
        typeEffectiveness: 1,
        stab: false,
        isBurned: false,
        randomFactor: randomDamageFactor(),
        otherModifiers: 1,
      });
      const actual = Math.min(damage, pokemon.currentHp);
      pokemon.currentHp -= actual;
      events.push({ type: 'damage-dealt', data: { source: 'confusion', slotId, damage: actual, remainingHp: pokemon.currentHp } });
      if (pokemon.currentHp <= 0) {
        pokemon.fainted = true;
        pokemon.currentHp = 0;
        events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
      }
      return { blocked: true, events };
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: all 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(server): EffectEngine confusion pre-move — self-hit damage, counter, cure"
```

---

### Task 6: EffectEngine — EOT burn, poison, toxic

**Files:**
- Modify: `packages/server/src/engine/__tests__/EffectEngine.test.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`

- [ ] **Step 1: Append EOT status damage tests**

Add at the bottom of `EffectEngine.test.ts`:

```typescript
describe('EffectEngine.runEndOfTurn — status damage', () => {
  it('burn deals 1/16 max HP and emits damage-dealt', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'brn', currentHp: 100, maxHp: 160 });
    const result = engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.currentHp).toBe(150); // 160/16=10 damage
    expect(result.events.some(e => e.type === 'damage-dealt')).toBe(true);
    const evt = result.events.find(e => e.type === 'damage-dealt')!;
    expect(evt.data['damage']).toBe(10);
    expect(evt.data['source']).toBe('status');
  });

  it('poison deals 1/8 max HP', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'psn', currentHp: 100, maxHp: 160 });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.currentHp).toBe(80); // 160/8=20 damage
  });

  it('toxic damage scales with counter and counter increments each call', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'tox', currentHp: 160, maxHp: 160 });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots); // counter=1, dmg=10
    expect(pokemon.currentHp).toBe(150);
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots); // counter=2, dmg=20
    expect(pokemon.currentHp).toBe(130);
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots); // counter=3, dmg=30
    expect(pokemon.currentHp).toBe(100);
  });

  it('burn faints the pokemon when HP reaches 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ status: 'brn', currentHp: 1, maxHp: 160 });
    const result = engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.fainted).toBe(true);
    expect(pokemon.currentHp).toBe(0);
    expect(result.events.some(e => e.type === 'faint')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: 4 new EOT tests FAIL.

- [ ] **Step 3: Implement EOT status damage in `runEndOfTurn`**

Add imports to `EffectEngine.ts`:

```typescript
import { getBurnDamage, getPoisonDamage, getToxicDamage, FREEZE_THAW_CHANCE, PARALYSIS_FULL_PARALYSIS_CHANCE, CONFUSION_HURT_CHANCE } from './status.js';
```

(Consolidate all status imports into one line.)

Replace the `runEndOfTurn` stub and add a private `applyDamage` helper:

```typescript
runEndOfTurn(
  pokemon: PartyMember,
  slotId: string,
  _state: BattleState,
  _allSlots: SlotContext[],
): EndOfTurnResult {
  const events: TurnResolveEvent[] = [];

  if (pokemon.status === 'brn') {
    this.applyDamage(pokemon, slotId, getBurnDamage(pokemon.maxHp), 'status', events);
    if (pokemon.fainted) return { events };
  } else if (pokemon.status === 'psn') {
    this.applyDamage(pokemon, slotId, getPoisonDamage(pokemon.maxHp), 'status', events);
    if (pokemon.fainted) return { events };
  } else if (pokemon.status === 'tox') {
    let toxEntry = pokemon.volatileStatus.find(v => v.name === 'toxic');
    if (!toxEntry) {
      toxEntry = { name: 'toxic', counter: 0 };
      pokemon.volatileStatus.push(toxEntry);
    }
    toxEntry.counter = (toxEntry.counter ?? 0) + 1;
    this.applyDamage(pokemon, slotId, getToxicDamage(pokemon.maxHp, toxEntry.counter), 'status', events);
    if (pokemon.fainted) return { events };
  }

  return { events };
}

private applyDamage(
  pokemon: PartyMember,
  slotId: string,
  amount: number,
  source: string,
  events: TurnResolveEvent[],
): void {
  const actual = Math.min(amount, pokemon.currentHp);
  pokemon.currentHp -= actual;
  events.push({ type: 'damage-dealt', data: { source, slotId, damage: actual, remainingHp: pokemon.currentHp } });
  if (pokemon.currentHp <= 0) {
    pokemon.fainted = true;
    pokemon.currentHp = 0;
    events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
  }
}
```

- [ ] **Step 4: Run all EffectEngine tests**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: all 17 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(server): EffectEngine EOT burn/poison/toxic damage with faint handling"
```

---

### Task 7: EffectEngine — EOT leech seed

**Files:**
- Modify: `packages/server/src/engine/__tests__/EffectEngine.test.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`

- [ ] **Step 1: Append leech seed tests**

Add at the bottom of `EffectEngine.test.ts`:

```typescript
describe('EffectEngine.runEndOfTurn — leech seed', () => {
  it('drains 1/8 maxHp from seeded pokemon and heals source', () => {
    const engine = new EffectEngine();
    const seeded = makePokemon({
      instanceId: 'p-seeded',
      currentHp: 100, maxHp: 160,
      volatileStatus: [{ name: 'leech-seed', sourceSlotId: 'slot-b1' }],
    });
    const source = makePokemon({ instanceId: 'p-source', currentHp: 80, maxHp: 100 });
    const allSlots: SlotContext[] = [
      { member: seeded, slotId: 'slot-a1', teamIndex: 0 },
      { member: source, slotId: 'slot-b1', teamIndex: 1 },
    ];

    const result = engine.runEndOfTurn(seeded, 'slot-a1', emptyState, allSlots);

    expect(seeded.currentHp).toBe(80);   // 160/8=20 drained
    expect(source.currentHp).toBe(100);  // healed 20, capped at 100
    expect(result.events.some(e => e.type === 'damage-dealt' && e.data['source'] === 'leech-seed')).toBe(true);
    expect(result.events.some(e => e.type === 'heal')).toBe(true);
  });

  it('does not heal source if source is fainted', () => {
    const engine = new EffectEngine();
    const seeded = makePokemon({
      currentHp: 100, maxHp: 160,
      volatileStatus: [{ name: 'leech-seed', sourceSlotId: 'slot-b1' }],
    });
    const source = makePokemon({ currentHp: 0, maxHp: 100, fainted: true });
    const allSlots: SlotContext[] = [
      { member: seeded, slotId: 'slot-a1', teamIndex: 0 },
      { member: source, slotId: 'slot-b1', teamIndex: 1 },
    ];

    const result = engine.runEndOfTurn(seeded, 'slot-a1', emptyState, allSlots);

    expect(seeded.currentHp).toBe(80); // still drained
    expect(result.events.some(e => e.type === 'heal')).toBe(false);
  });

  it('faints the seeded pokemon if drain is lethal', () => {
    const engine = new EffectEngine();
    const seeded = makePokemon({
      currentHp: 1, maxHp: 160,
      volatileStatus: [{ name: 'leech-seed', sourceSlotId: 'slot-b1' }],
    });
    const source = makePokemon({ currentHp: 50, maxHp: 100 });
    const allSlots: SlotContext[] = [
      { member: seeded, slotId: 'slot-a1', teamIndex: 0 },
      { member: source, slotId: 'slot-b1', teamIndex: 1 },
    ];

    const result = engine.runEndOfTurn(seeded, 'slot-a1', emptyState, allSlots);

    expect(seeded.fainted).toBe(true);
    expect(result.events.some(e => e.type === 'faint')).toBe(true);
    // source still gets healed (drain happened, even if lethal)
    expect(source.currentHp).toBe(51);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: 3 new leech seed tests FAIL.

- [ ] **Step 3: Add leech seed to `runEndOfTurn`**

Add the leech seed block inside `runEndOfTurn`, after the toxic block (before `return { events }`). The `allSlots` parameter must be renamed from `_allSlots` to `allSlots` in the method signature:

```typescript
const leechEntry = pokemon.volatileStatus.find(v => v.name === 'leech-seed');
if (leechEntry) {
  const drain = Math.max(1, Math.floor(pokemon.maxHp / 8));
  const actual = Math.min(drain, pokemon.currentHp);
  pokemon.currentHp -= actual;
  events.push({ type: 'damage-dealt', data: { source: 'leech-seed', slotId, damage: actual, remainingHp: pokemon.currentHp } });
  if (pokemon.currentHp <= 0) {
    pokemon.fainted = true;
    pokemon.currentHp = 0;
    events.push({ type: 'faint', data: { slotId, instanceId: pokemon.instanceId } });
  }
  const sourceCtx = allSlots.find(s => s.slotId === leechEntry.sourceSlotId);
  if (sourceCtx && !sourceCtx.member.fainted) {
    const heal = Math.min(actual, sourceCtx.member.maxHp - sourceCtx.member.currentHp);
    if (heal > 0) {
      sourceCtx.member.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: leechEntry.sourceSlotId, amount: heal, remainingHp: sourceCtx.member.currentHp } });
    }
  }
  if (pokemon.fainted) return { events };
}
```

Note: the `applyDamage` helper is NOT used here because leech seed requires capturing `actual` (capped amount) separately for the heal calculation.

- [ ] **Step 4: Run all EffectEngine tests**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: all 20 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(server): EffectEngine EOT leech seed drain and heal"
```

---

### Task 8: EffectEngine — EOT bind and yawn

**Files:**
- Modify: `packages/server/src/engine/__tests__/EffectEngine.test.ts`
- Modify: `packages/server/src/engine/EffectEngine.ts`

- [ ] **Step 1: Append bind and yawn tests**

Add at the bottom of `EffectEngine.test.ts`:

```typescript
describe('EffectEngine.runEndOfTurn — bind', () => {
  it('deals 1/8 maxHp damage each turn', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      currentHp: 100, maxHp: 160,
      volatileStatus: [{ name: 'bound', counter: 4, sourceSlotId: 'slot-b1' }],
    });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.currentHp).toBe(80); // 160/8=20 damage
  });

  it('decrements the counter each turn', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      currentHp: 100, maxHp: 100,
      volatileStatus: [{ name: 'bound', counter: 3, sourceSlotId: 'slot-b1' }],
    });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus[0]!.counter).toBe(2);
  });

  it('removes bound and emits volatile-cured when counter reaches 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      currentHp: 100, maxHp: 100,
      volatileStatus: [{ name: 'bound', counter: 1, sourceSlotId: 'slot-b1' }],
    });
    const result = engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus.find(v => v.name === 'bound')).toBeUndefined();
    expect(result.events.some(e => e.type === 'volatile-cured')).toBe(true);
    const evt = result.events.find(e => e.type === 'volatile-cured')!;
    expect(evt.data['volatile']).toBe('bound');
  });
});

describe('EffectEngine.runEndOfTurn — yawn', () => {
  it('decrements the counter each turn', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'yawn', counter: 2 }] });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus[0]!.counter).toBe(1);
    expect(pokemon.status).toBeUndefined();
  });

  it('applies sleep and removes yawn when counter reaches 0', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({ volatileStatus: [{ name: 'yawn', counter: 1 }] });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus.find(v => v.name === 'yawn')).toBeUndefined();
    expect(pokemon.status).toBe('slp');
    const sleepEntry = pokemon.volatileStatus.find(v => v.name === 'sleep');
    expect(sleepEntry).toBeDefined();
    expect(sleepEntry!.counter).toBeGreaterThanOrEqual(1);
    expect(sleepEntry!.counter).toBeLessThanOrEqual(3);
  });

  it('silently removes yawn when target already has a status (cannot sleep)', () => {
    const engine = new EffectEngine();
    const pokemon = makePokemon({
      status: 'par',
      volatileStatus: [{ name: 'yawn', counter: 1 }],
    });
    engine.runEndOfTurn(pokemon, 'slot-a1', emptyState, emptySlots);
    expect(pokemon.volatileStatus.find(v => v.name === 'yawn')).toBeUndefined();
    expect(pokemon.status).toBe('par'); // unchanged
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: 6 new tests FAIL.

- [ ] **Step 3: Add `applyStatus` import and bind/yawn blocks to `runEndOfTurn`**

Add import to `EffectEngine.ts`:

```typescript
import { applyStatus } from './effects.js';
```

Add the bind block inside `runEndOfTurn`, after the leech seed block:

```typescript
const boundEntry = pokemon.volatileStatus.find(v => v.name === 'bound');
if (boundEntry) {
  this.applyDamage(pokemon, slotId, Math.max(1, Math.floor(pokemon.maxHp / 8)), 'bound', events);
  boundEntry.counter = (boundEntry.counter ?? 1) - 1;
  if ((boundEntry.counter ?? 0) <= 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'bound');
    events.push({ type: 'volatile-cured', data: { slotId, volatile: 'bound' } });
  }
  if (pokemon.fainted) return { events };
}
```

Add the yawn block after the bind block:

```typescript
const yawnEntry = pokemon.volatileStatus.find(v => v.name === 'yawn');
if (yawnEntry) {
  yawnEntry.counter = (yawnEntry.counter ?? 1) - 1;
  if ((yawnEntry.counter ?? 0) <= 0) {
    pokemon.volatileStatus = pokemon.volatileStatus.filter(v => v.name !== 'yawn');
    // IMMUNITIES.slp = [] so passing [] as types is correct — no type is immune to sleep
    const evt = applyStatus(pokemon, slotId, 'slp', []);
    if (evt) events.push(evt);
  }
}
```

- [ ] **Step 4: Run all EffectEngine tests**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/EffectEngine.test.ts
```

Expected: all 26 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/EffectEngine.ts packages/server/src/engine/__tests__/EffectEngine.test.ts
git commit -m "feat(server): EffectEngine EOT bind (damage + expiry) and yawn (countdown → sleep)"
```

---

### Task 9: `applyVolatile` and `evaluateVolatileEffect` in effects.ts

**Files:**
- Modify: `packages/server/src/engine/effects.ts`
- Modify: `packages/server/src/engine/__tests__/effects.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/server/src/engine/__tests__/effects.test.ts`:

```typescript
import { applyVolatile, evaluateVolatileEffect } from '../effects.js';

describe('applyVolatile', () => {
  it('applies confusion with a random counter 2–5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // floor(0*4)+2 = 2
    const mon = makePokemon({ ability: '' });
    const evt = applyVolatile(mon, 'slot-b1', 'slot-a1', 'confusion');
    expect(mon.volatileStatus.find(v => v.name === 'confusion')?.counter).toBe(2);
    expect(evt?.type).toBe('volatile-applied');
    vi.restoreAllMocks();
  });

  it('applies leech-seed and records sourceSlotId', () => {
    const mon = makePokemon({ ability: '' });
    const evt = applyVolatile(mon, 'slot-b1', 'slot-a1', 'leech-seed');
    const entry = mon.volatileStatus.find(v => v.name === 'leech-seed');
    expect(entry).toBeDefined();
    expect(entry!.sourceSlotId).toBe('slot-a1');
    expect(evt?.type).toBe('volatile-applied');
  });

  it('returns null if target already has that volatile', () => {
    const mon = makePokemon({ ability: '', volatileStatus: [{ name: 'confusion', counter: 3 }] });
    const evt = applyVolatile(mon, 'slot-b1', 'slot-a1', 'confusion');
    expect(evt).toBeNull();
    expect(mon.volatileStatus.filter(v => v.name === 'confusion')).toHaveLength(1);
  });

  it('applies yawn with explicit counter 2', () => {
    const mon = makePokemon({ ability: '' });
    applyVolatile(mon, 'slot-b1', 'slot-a1', 'yawn', 2);
    const entry = mon.volatileStatus.find(v => v.name === 'yawn');
    expect(entry?.counter).toBe(2);
  });

  it('applies bound with counter 4 or 5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // floor(0*2)+4 = 4
    const mon = makePokemon({ ability: '' });
    applyVolatile(mon, 'slot-b1', 'slot-a1', 'bound');
    expect(mon.volatileStatus.find(v => v.name === 'bound')?.counter).toBe(4);
    vi.restoreAllMocks();
  });
});

describe('evaluateVolatileEffect', () => {
  it('applies bound to the target when the move is in BOUND_MOVES', () => {
    const target = makePokemon({ ability: '', currentHp: 50, maxHp: 100 });
    const evt = evaluateVolatileEffect('bind', target, 'slot-b1', 'slot-a1');
    expect(target.volatileStatus.find(v => v.name === 'bound')).toBeDefined();
    expect(evt?.type).toBe('volatile-applied');
  });

  it('returns null for a move not in BOUND_MOVES', () => {
    const target = makePokemon({ ability: '', currentHp: 50 });
    const evt = evaluateVolatileEffect('flamethrower', target, 'slot-b1', 'slot-a1');
    expect(evt).toBeNull();
  });

  it('returns null if target is already bound', () => {
    const target = makePokemon({ ability: '', volatileStatus: [{ name: 'bound', counter: 3 }] });
    const evt = evaluateVolatileEffect('wrap', target, 'slot-b1', 'slot-a1');
    expect(evt).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/effects.test.ts
```

Expected: 8 new tests FAIL — `applyVolatile` and `evaluateVolatileEffect` are not exported.

- [ ] **Step 3: Implement `applyVolatile` and `evaluateVolatileEffect` in `effects.ts`**

Add to the bottom of `packages/server/src/engine/effects.ts`:

```typescript
export const BOUND_MOVES = new Set(['bind', 'wrap', 'clamp', 'firespin', 'whirlpool']);

export function applyVolatile(
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
  volatile: string,
  explicitCounter?: number,
): TurnResolveEvent | null {
  if (target.volatileStatus.some(v => v.name === volatile)) return null;

  let counter: number | undefined;
  if (explicitCounter !== undefined) {
    counter = explicitCounter;
  } else if (volatile === 'confusion') {
    counter = Math.floor(Math.random() * 4) + 2; // 2–5
  } else if (volatile === 'bound') {
    counter = Math.floor(Math.random() * 2) + 4; // 4 or 5
  }

  const needsSource = volatile === 'leech-seed' || volatile === 'bound';
  target.volatileStatus.push({
    name: volatile,
    ...(counter !== undefined ? { counter } : {}),
    ...(needsSource ? { sourceSlotId: attackerSlotId } : {}),
  });

  return { type: 'volatile-applied', data: { targetSlotId, volatile } };
}

export function evaluateVolatileEffect(
  moveId: string,
  target: PartyMember,
  targetSlotId: string,
  attackerSlotId: string,
): TurnResolveEvent | null {
  if (!BOUND_MOVES.has(moveId)) return null;
  return applyVolatile(target, targetSlotId, attackerSlotId, 'bound');
}
```

- [ ] **Step 4: Run all effects tests**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/effects.test.ts
```

Expected: all tests PASS (both old and new).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/effects.ts packages/server/src/engine/__tests__/effects.test.ts
git commit -m "feat(server): applyVolatile and evaluateVolatileEffect for confusion/leech-seed/bound/yawn"
```

---

### Task 10: `moves.ts` — extend StatusMoveResult and add new move entries

**Files:**
- Modify: `packages/server/src/engine/moves.ts`

No TDD for this task — `executeStatusMove` is a lookup table; correctness is validated by integration tests in Task 13.

- [ ] **Step 1: Extend `StatusMoveResult` interface**

In `packages/server/src/engine/moves.ts`, change:

```typescript
export interface StatusMoveResult {
  statusToApply?: string;
  statBoostDeltas?: Partial<Record<string, number>>;
  heals?: boolean;
  targetsSelf?: boolean;
}
```

To:

```typescript
export interface StatusMoveResult {
  statusToApply?: string;
  volatileToApply?: string;
  volatileCounter?: number;
  statBoostDeltas?: Partial<Record<string, number>>;
  heals?: boolean;
  targetsSelf?: boolean;
}
```

- [ ] **Step 2: Add new move entries to `executeStatusMove`**

Add these cases to the switch statement before the `default` case:

```typescript
case 'yawn':        return { volatileToApply: 'yawn', volatileCounter: 2, targetsSelf: false };
case 'confuseray':
case 'supersonic':
case 'sweetkiss':   return { volatileToApply: 'confusion', targetsSelf: false };
case 'leechseed':   return { volatileToApply: 'leech-seed', targetsSelf: false };
```

- [ ] **Step 3: Run all server tests to confirm no regressions**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all existing tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/engine/moves.ts
git commit -m "feat(server): add yawn/confuseray/supersonic/sweetkiss/leechseed to executeStatusMove"
```

---

### Task 11: BattleEngine — wire EffectEngine pre-move

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Update the existing sleep test and add a wake-up test**

In `packages/server/src/engine/__tests__/BattleEngine.test.ts`, the existing "a sleeping pokemon cannot use its move" test has `counter: 2` — it should still pass after the change (counter 2 > 0, still blocked). Keep it, but also add a new test:

Append to the `describe('Sleep prevents moving', ...)` block:

```typescript
it('a sleeping pokemon with counter 0 wakes up and deals damage on the same turn', () => {
  const state = make1v1State();
  const p1 = state.teams[0]!.slots[0]!.party[0]!;
  p1.status = 'slp';
  p1.volatileStatus = [{ name: 'sleep', counter: 0 }];
  const engine = new BattleEngine();
  const { newState, events } = engine.resolveTurn(state, {
    'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
  });
  // p1 woke up and attacked — p2 should have taken damage
  const p2 = newState.teams[1]!.slots[0]!.party[0]!;
  expect(p2.currentHp).toBeLessThan(100);
  // p1 status cleared
  expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
  expect(events.some(e => e.type === 'status-cured')).toBe(true);
});
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: new wake-up test FAILS (current code always blocks when `status === 'slp'`).

- [ ] **Step 3: Wire EffectEngine into BattleEngine**

In `packages/server/src/engine/BattleEngine.ts`:

**a) Add imports:**

```typescript
import { EffectEngine, SlotContext } from './EffectEngine.js';
```

**b) Add private field** (at the top of the class, after the `data` field):

```typescript
private readonly effectEngine = new EffectEngine();
```

**c) Add `getAllSlots` private method** (at the bottom of the class, before the closing brace):

```typescript
private getAllSlots(state: BattleState): SlotContext[] {
  return state.teams.flatMap((team, teamIndex) =>
    team.slots.map(slot => ({
      member: slot.party[slot.activePokemonIndex]!,
      slotId: slot.slotId,
      teamIndex,
    }))
  );
}
```

**d) Replace the inline status gates in `executeMove`.**

Delete these lines (currently around lines 121–132):

```typescript
// Can't-move checks
if (attacker.status === 'slp') {
  events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, note: 'asleep' } });
  return { newState: s, events };
}
if (attacker.status === 'par' && Math.random() < PARALYSIS_FULL_PARALYSIS_CHANCE) {
  events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, note: 'full-paralysis' } });
  return { newState: s, events };
}
if (attacker.status === 'frz') {
  events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, note: 'frozen' } });
  return { newState: s, events };
}
```

Replace with:

```typescript
const preMoveResult = this.effectEngine.runPreMove(attacker, attackerSlotId, s, this.getAllSlots(s));
events.push(...preMoveResult.events);
if (preMoveResult.blocked) return { newState: s, events };
```

**e) Clean up now-unused import in BattleEngine.ts:**

Remove `PARALYSIS_FULL_PARALYSIS_CHANCE` from the status import — it's no longer used in BattleEngine directly. The import should become:

```typescript
import { PARALYSIS_SPEED_MOD } from './status.js';
```

- [ ] **Step 4: Run all BattleEngine tests**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: all tests PASS, including the new wake-up test.

- [ ] **Step 5: Run full server test suite**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(server): replace inline sleep/freeze/paralysis checks with EffectEngine.runPreMove"
```

---

### Task 12: BattleEngine — wire EffectEngine EOT, delete `tickStatus`

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/status.ts`
- Modify: `packages/server/src/engine/__tests__/status.test.ts`

- [ ] **Step 1: Replace the `endOfTurn` status-tick block in BattleEngine**

In `packages/server/src/engine/BattleEngine.ts`, inside the `endOfTurn` private method, find the block that handles status ticking (currently processes burn/poison/toxic/sleep EOT). It spans roughly:

```typescript
if (active.status) {
  let volatileEntry: VolatileStatusEntry | undefined;
  // ... toxic counter setup, sleep counter setup ...
  const tick = tickStatus(active.status, active.maxHp, volatileEntry);
  // ... hpDelta check, cured check, thawed check ...
}
```

Delete this entire block and replace it with:

```typescript
const eotResult = this.effectEngine.runEndOfTurn(active, slot.slotId, s, this.getAllSlots(s));
events.push(...eotResult.events);
```

Also remove the now-unused imports from BattleEngine.ts:
- Remove `tickStatus` from the `./status.js` import (it was already removed in Task 11, but double-check)
- Remove `VolatileStatusEntry` from the `@poke-fighter/shared` import if it is no longer used elsewhere in BattleEngine

- [ ] **Step 2: Run full test suite to confirm EOT integration works**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all tests PASS. If burn/poison EOT tests existed in BattleEngine.test.ts they should still pass via EffectEngine.

- [ ] **Step 3: Delete `tickStatus` from `status.ts`**

In `packages/server/src/engine/status.ts`, delete:

```typescript
export type StatusTickResult = {
  hpDelta: number;
  cured: boolean;
  fullParalysis: boolean;
  thawed: boolean;
};

export function tickStatus(
  status: StatusCondition,
  maxHp: number,
  volatileEntry?: VolatileStatusEntry
): StatusTickResult {
  // ... entire function body ...
}
```

Also remove `VolatileStatusEntry` from the import at the top of `status.ts` if it was only imported for `tickStatus`.

- [ ] **Step 4: Remove `tickStatus` tests from `status.test.ts`**

In `packages/server/src/engine/__tests__/status.test.ts`, delete:
- The `import { ..., tickStatus, ... }` reference (remove `tickStatus` from the import)
- The `describe('tickStatus for sleep', ...)` block (lines 37–52)
- The `describe('tickStatus for toxic', ...)` block (lines 54–62)

Keep all other tests (canApplyStatus, getBurnDamage, PARALYSIS_SPEED_MOD).

- [ ] **Step 5: Run full test suite**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/status.ts packages/server/src/engine/__tests__/status.test.ts
git commit -m "feat(server): wire EffectEngine.runEndOfTurn into BattleEngine, delete dead tickStatus"
```

---

### Task 13: BattleEngine — volatile dispatch and integration tests

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write integration test stubs (failing)**

Append to `packages/server/src/engine/__tests__/BattleEngine.test.ts`:

```typescript
describe('Volatile move dispatch', () => {
  it('Confuse Ray applies confusion to the target', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'confuseray', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
  });

  it('Leech Seed applies volatile and drains EOT HP from target', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'leechseed', currentPp: 10, maxPp: 10 };
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    // Leech Seed applied — p2 is now seeded
    expect(p2.volatileStatus.some(v => v.name === 'leech-seed')).toBe(true);
    // EOT drained floor(100/8)=12 HP from p2 (p1 used a status move so p2 took no direct damage)
    expect(p2.currentHp).toBe(88);
    expect(events.some(e => e.type === 'damage-dealt' && e.data['source'] === 'leech-seed')).toBe(true);
  });

  it('Bind applies bound volatile to target and deals EOT damage', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bind', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'bound')).toBe(true);
    // EOT bind damage should have happened this turn
    const boundDmgEvt = events.find(e => e.type === 'damage-dealt' && e.data['source'] === 'bound');
    expect(boundDmgEvt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @poke-fighter/server test -- src/engine/__tests__/BattleEngine.test.ts
```

Expected: 3 new integration tests FAIL.

- [ ] **Step 3: Add `applyVolatile` and `evaluateVolatileEffect` imports to BattleEngine**

In `packages/server/src/engine/BattleEngine.ts`, add to the effects import:

```typescript
import { applyStatus, applyStatBoost, evaluateSecondaryEffect, applyVolatile, evaluateVolatileEffect } from './effects.js';
```

- [ ] **Step 4: Add volatile dispatch to the status-move handler in `executeMove`**

In `executeMove`, inside the `if (move.category === 'status')` block, after the existing `if (result.statusToApply)` branch, add:

```typescript
if (result.volatileToApply) {
  const event = applyVolatile(
    affectedMember,
    affectedSlotId,
    attackerSlotId,
    result.volatileToApply,
    result.volatileCounter,
  );
  if (event) events.push(event);
}
```

- [ ] **Step 5: Add `evaluateVolatileEffect` call after damage in `executeMove`**

In `executeMove`, inside the `for (const targetSlotId of targetSlotIds)` loop, after the `evaluateSecondaryEffect` call (which handles status effects from damaging moves), add:

```typescript
if (actualDamage > 0 && target.currentHp > 0) {
  const volatileEvent = evaluateVolatileEffect(move.id, target, targetSlotId, attackerSlotId);
  if (volatileEvent) events.push(volatileEvent);
}
```

- [ ] **Step 6: Run all tests**

```bash
pnpm --filter @poke-fighter/server test
```

Expected: all tests PASS, including the 3 new integration tests.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat(server): volatile dispatch in executeMove — confuse ray, leech seed, bind/wrap"
```
