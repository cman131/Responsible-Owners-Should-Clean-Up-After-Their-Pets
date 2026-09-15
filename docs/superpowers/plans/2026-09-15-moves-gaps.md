# Moves Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 21 engine gaps (dynamicPower stubs, missing handlers, lock mechanics) and 4 UI text gap areas identified in the 2026-09-15 moves audit, using TDD throughout.

**Architecture:** Four sequential clusters — (1) extend dynamicPower interfaces and wire BattleEngine context, (2) add missing BattleEngine inline handlers, (3) implement lock-move mechanics via volatiles, (4) fill in UI battle-log text. Each cluster has failing tests written before any implementation code.

**Tech Stack:** TypeScript, Vitest, monorepo (`packages/server`, `packages/shared`, `packages/client`).

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types/battle.ts` | Add `lastTurnFaintedTeamIndex?: number` to `BattleState` |
| `packages/server/src/engine/dynamicPower.ts` | Extend `MonInput`/`FieldInput`/`MoveInput`; implement 11 resolvers |
| `packages/server/src/engine/BattleEngine.ts` | Wire context flags; add inline handlers for burnup, poltergeist, crash, judgment, lock mechanics |
| `packages/server/src/engine/registrations.ts` | Add `naturepower` handler |
| `packages/client/src/battle/BattleContext.tsx` | Add volatile/status/note text entries |
| `packages/server/src/engine/__tests__/dynamicPower.test.ts` | New unit tests for all resolvers |
| `packages/server/src/engine/__tests__/dynamicPower.integration.test.ts` | Integration tests for wiring |
| `packages/server/src/engine/__tests__/lockMoves.test.ts` | New file — lock mechanic tests |
| `packages/client/src/battle/__tests__/BattleContext.test.ts` | New UI text tests |

---

## Task 1 — Extend shared types and dynamicPower interfaces

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/server/src/engine/dynamicPower.ts`

- [ ] **Step 1: Add `lastTurnFaintedTeamIndex` to `BattleState`**

In `packages/shared/src/types/battle.ts`, add one field to the `BattleState` interface (after `lastUsedMoveId`):

```typescript
export interface BattleState {
  battleId: string;
  label: string;
  turnNumber: number;
  phase: BattlePhase;
  teams: [TeamState, TeamState];
  field: FieldState;
  winner?: 0 | 1;
  lastUsedMoveId?: string;
  lastTurnFaintedTeamIndex?: number;  // ← add this
}
```

- [ ] **Step 2: Extend `MonInput`, `FieldInput`, `MoveInput` in `dynamicPower.ts`**

Replace the three interfaces at the top of `packages/server/src/engine/dynamicPower.ts` with:

```typescript
interface MoveInput {
  id: string;
  effectId?: string;
  basePower: number;
  currentPp?: number;      // for trumpcard: PP remaining in the move slot
}

interface MonInput {
  stats: { atk: number; def: number; spa: number; spd: number; spe: number };
  statBoosts: { atk: number; def: number; spa: number; spd: number; spe: number; accuracy: number; evasion: number };
  currentHp: number;
  maxHp: number;
  status?: string;
  heldItem?: string;
  volatileStatus: unknown[];
  level: number;
  friendship?: number;
  weightkg?: number;
  movedThisTurn?: boolean;      // true if this Pokémon already moved this turn (payback/avalanche)
  tookDamageThisTurn?: boolean; // true if this Pokémon took HP damage earlier this turn (assurance)
  fasterThanTarget?: boolean;   // true if attacker moves before target (boltbeak/fishiousrend)
}

interface FieldInput {
  weather?: unknown;
  terrain?: unknown;
  trickroom: number;
  gravity: number;
  sideConditions: unknown[];
  allyFaintedTeamIndex?: number; // 0 or 1 — team that had a faint last turn (retaliate)
  attackerTeamIndex?: number;    // 0 or 1 — the attacker's team index (retaliate)
}
```

- [ ] **Step 3: Run typecheck to verify**

```bash
cd packages/server && npx tsc --noEmit
cd packages/shared && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/battle.ts packages/server/src/engine/dynamicPower.ts
git commit -m "feat: extend dynamicPower interfaces and BattleState for gap fixes"
```

---

## Task 2 — Wire BattleEngine: turn-order and damage flags

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/dynamicPower.integration.test.ts`

- [ ] **Step 1: Write failing integration test for `movedThisTurn` (payback)**

Append to `packages/server/src/engine/__tests__/dynamicPower.integration.test.ts`:

```typescript
  it('Payback deals double damage when target moved first (slot-b1 has higher speed)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // p1 spe=100 (faster), p2 spe=80 (slower) in make1v1State
    // p2 uses payback — target (p1) already moved, so double power
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'payback', currentPp: 10, maxPp: 10 };
    // p1 uses a fast no-damage move so it "moves first" without damaging p2
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tailwind', currentPp: 15, maxPp: 15 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const paybackDmg = events.find(
      e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-b1'
    )?.data['damage'] as number | undefined;

    // p1 (spe=100) moves before p2 (spe=80), so payback target moved first → double BP (60→120)
    // Compare against a normal 60-BP move to confirm ≈2× damage
    const stateNormal = make1v1State();
    stateNormal.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'payback', currentPp: 10, maxPp: 10 };
    stateNormal.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    // Give p2 higher speed so it moves FIRST and payback should NOT double
    stateNormal.teams[1]!.slots[0]!.party[0]!.stats = {
      ...stateNormal.teams[1]!.slots[0]!.party[0]!.stats, spe: 200,
    };
    const { events: evNormal } = engine.resolveTurn(stateNormal, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const normalDmg = evNormal.find(
      e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-b1'
    )?.data['damage'] as number | undefined;

    expect(paybackDmg).toBeDefined();
    expect(normalDmg).toBeDefined();
    // When target moved first, payback should deal roughly 2× the non-doubled damage
    expect(paybackDmg!).toBeGreaterThan(normalDmg! * 1.8);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.integration.test.ts
```

Expected: FAIL — payback still uses stub (returns basePower = 60 unchanged).

- [ ] **Step 3: Clear `damaged-this-turn` volatile at turn start**

In `packages/server/src/engine/BattleEngine.ts`, in `resolveTurn`, right after `let s = structuredClone(state);` (line ~160), add:

```typescript
// Clear per-turn damage flag before new turn begins
for (const team of s.teams) {
  for (const slot of team.slots) {
    const active = slot.party[slot.activePokemonIndex];
    if (active) {
      active.volatileStatus = active.volatileStatus.filter(v => v.name !== 'damaged-this-turn');
    }
  }
}
```

- [ ] **Step 4: Set `damaged-this-turn` volatile when damage lands**

In `BattleEngine.ts`, inside the `executeMove` target loop, find the block that sets `target.lastDamageTaken` (currently around line 1486–1493 — search for `target.lastDamageTaken = {`). Immediately after that block, add:

```typescript
// Mark target as having taken damage this turn (for Assurance)
if (hpDamageTaken > 0 && !target.volatileStatus.some(v => v.name === 'damaged-this-turn')) {
  target.volatileStatus.push({ name: 'damaged-this-turn' });
}
```

- [ ] **Step 5: Pass `movedThisTurn` and `tookDamageThisTurn` to `resolvePower`**

Find the `resolvePower(` call (currently around line 1254). Replace it with:

```typescript
const targetTookDmgThisTurn = target.volatileStatus.some(v => v.name === 'damaged-this-turn');
const targetMovedThisTurn = movedSlotIds.has(targetSlotId);
const resolvedPower = resolvePower(
  move,
  { ...attacker, weightkg: attackerSpeciesForPower?.weightkg ?? 0 },
  { ...target, weightkg: targetSpeciesForPower?.weightkg ?? 0,
    movedThisTurn: targetMovedThisTurn,
    tookDamageThisTurn: targetTookDmgThisTurn,
  },
  s.field,
);
```

- [ ] **Step 6: Run tests — still fails (resolver stub not yet updated)**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.integration.test.ts
```

Expected: FAIL — wiring is in place but `payback` resolver still returns `move.basePower`.

- [ ] **Step 7: Commit wiring (before resolver implementations)**

```bash
git add packages/server/src/engine/BattleEngine.ts
git commit -m "feat: wire movedThisTurn and tookDamageThisTurn flags into resolvePower"
```

---

## Task 3 — Wire BattleEngine: faint-tracking and speed flags

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/dynamicPower.integration.test.ts`

- [ ] **Step 1: Write failing integration test for `retaliate`**

Append to `packages/server/src/engine/__tests__/dynamicPower.integration.test.ts`:

```typescript
  it('Retaliate deals double damage when an ally fainted last turn', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Turn 1: p2 faints due to p1's overwhelming damage
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1; // p2 will faint this turn
    const { newState: stateAfterTurn1 } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // p2 fainted — battle may have ended; only test further if p1 still alive
    // For retaliate test, restart with a fresh setup where we manually set lastTurnFaintedTeamIndex
    const state2 = make1v1State();
    state2.lastTurnFaintedTeamIndex = 0; // p1's team (index 0) had a faint last turn
    state2.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'retaliate', currentPp: 5, maxPp: 5 };

    const { events } = engine.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const retaliateDmg = events.find(
      e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1'
    )?.data['damage'] as number | undefined;

    // Without ally faint last turn
    const state3 = make1v1State();
    state3.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'retaliate', currentPp: 5, maxPp: 5 };
    const { events: evNormal } = engine.resolveTurn(state3, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const normalDmg = evNormal.find(
      e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1'
    )?.data['damage'] as number | undefined;

    expect(retaliateDmg).toBeDefined();
    expect(normalDmg).toBeDefined();
    expect(retaliateDmg!).toBeGreaterThan(normalDmg! * 1.8);
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.integration.test.ts
```

Expected: FAIL — retaliate resolver returns `move.basePower` regardless.

- [ ] **Step 3: Track `lastTurnFaintedTeamIndex` in `resolveTurn`**

In `BattleEngine.ts`, in `resolveTurn`, after the `structuredClone` and the `damaged-this-turn` clear added in Task 2, add:

```typescript
// Snapshot last turn's faint info before resetting (used by retaliate resolver)
const lastTurnFaintedTeamIndex = s.lastTurnFaintedTeamIndex;
s.lastTurnFaintedTeamIndex = undefined;
```

Then, at the end of `resolveTurn`, after the end-of-turn processing block (after `s = eotResult.newState;`, before the winner/turnNumber update), add:

```typescript
// Record which team had a Pokémon faint this turn (for next turn's Retaliate)
const faintEvents = events.filter(e => e.type === 'faint');
if (faintEvents.length > 0) {
  // Use the last faint event to find the team; first is fine for 1v1
  const faintedSlotId = String(faintEvents[0]!.data['slotId']);
  const faintedTeamIdx = s.teams.findIndex(t =>
    t.slots.some(sl => sl.slotId === faintedSlotId)
  );
  if (faintedTeamIdx !== -1) {
    s.lastTurnFaintedTeamIndex = faintedTeamIdx;
  }
}
```

- [ ] **Step 4: Pass `allyFaintedTeamIndex` and `attackerTeamIndex` to `resolvePower`**

Find the `const userTeamIndex` variable that is already computed inside `executeMove` (it is computed in the status-move path at `s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId))`; for the damage path there's a similar lookup — search for `attackerTeamIndex` or add it at the top of the damage section).

Add near the top of the damage path section in `executeMove` (after `const secs = move.secondaries ?? [];`):

```typescript
const attackerTeamIdx = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId)) as 0 | 1;
```

Then update the `resolvePower` call (from Task 2, Step 5) to also include field context:

```typescript
const resolvedPower = resolvePower(
  move,
  { ...attacker, weightkg: attackerSpeciesForPower?.weightkg ?? 0 },
  { ...target, weightkg: targetSpeciesForPower?.weightkg ?? 0,
    movedThisTurn: targetMovedThisTurn,
    tookDamageThisTurn: targetTookDmgThisTurn,
  },
  { ...s.field,
    allyFaintedTeamIndex: lastTurnFaintedTeamIndex,
    attackerTeamIndex: attackerTeamIdx,
  },
);
```

Note: `lastTurnFaintedTeamIndex` is captured at the top of `resolveTurn` (Step 3 above) and is accessible in `executeMove` because `executeMove` is called within `resolveTurn`. Since `lastTurnFaintedTeamIndex` is a local in `resolveTurn`, pass it into `executeMove` as a new parameter, or simply snapshot it onto the state itself before calling `executeMove`. The simplest approach: add a new private field or pass via the state — the cleanest is to pass it as a parameter to `executeMove`.

Add `lastTurnFaintedTeamIndex: number | undefined` as the last parameter of `executeMove`:

```typescript
private executeMove(
  state: BattleState,
  attackerSlotId: string,
  action: MoveAction,
  movedSlotIds: Set<string>,
  order: string[],
  lastTurnFaintedTeamIndex?: number,
): MoveResult {
```

And update the call site in `resolveTurn` (and in `resumeTurn`) to pass `lastTurnFaintedTeamIndex`:

```typescript
const moveResult = this.executeMove(s, slotId, action, movedSlotIds, order, lastTurnFaintedTeamIndex);
```

- [ ] **Step 5: Compute `fasterThanTarget` and `currentPp`, pass to resolvePower**

Inside the `executeMove` target loop, before `const resolvedPower = resolvePower(...)`, add:

```typescript
// Boltbeak / Fishiousrend: faster-than-target check
const attSpd = getEffectiveStat(attacker.stats.spe, attacker.statBoosts.spe, 'spe');
const defSpd = getEffectiveStat(target.stats.spe, target.statBoosts.spe, 'spe');
const fasterThanTarget = s.field.trickroom > 0 ? attSpd <= defSpd : attSpd >= defSpd;

// Trumpcard: current PP in the move slot
const trumpCardPp = move.id === 'trumpcard'
  ? (attacker.moves.find(m => m.moveId === 'trumpcard')?.currentPp ?? 1)
  : undefined;
```

Then update the `resolvePower` call to include these:

```typescript
const resolvedPower = resolvePower(
  { ...move, currentPp: trumpCardPp },
  { ...attacker, weightkg: attackerSpeciesForPower?.weightkg ?? 0,
    fasterThanTarget,
  },
  { ...target, weightkg: targetSpeciesForPower?.weightkg ?? 0,
    movedThisTurn: targetMovedThisTurn,
    tookDamageThisTurn: targetTookDmgThisTurn,
  },
  { ...s.field,
    allyFaintedTeamIndex: lastTurnFaintedTeamIndex,
    attackerTeamIndex: attackerTeamIdx,
  },
);
```

- [ ] **Step 6: Typecheck**

```bash
cd packages/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts
git commit -m "feat: wire retaliate/fasterThanTarget/currentPp context into resolvePower"
```

---

## Task 4 — dynamicPower resolvers: payback, avalanche, assurance, retaliate

**Files:**
- Modify: `packages/server/src/engine/dynamicPower.ts`
- Modify: `packages/server/src/engine/__tests__/dynamicPower.test.ts`

- [ ] **Step 1: Write failing unit tests**

Append to `packages/server/src/engine/__tests__/dynamicPower.test.ts`:

```typescript
  it('payback: doubles (60→120) when target already moved this turn', () => {
    expect(resolvePower(move('payback', 60), mon(), mon({ movedThisTurn: true }), field())).toBe(120);
    expect(resolvePower(move('payback', 60), mon(), mon({ movedThisTurn: false }), field())).toBe(60);
  });

  it('avalanche: doubles (60→120) when target already moved this turn', () => {
    expect(resolvePower(move('avalanche', 60), mon(), mon({ movedThisTurn: true }), field())).toBe(120);
    expect(resolvePower(move('avalanche', 60), mon(), mon({ movedThisTurn: false }), field())).toBe(60);
  });

  it('assurance: doubles (60→120) when target took damage earlier this turn', () => {
    expect(resolvePower(move('assurance', 60), mon(), mon({ tookDamageThisTurn: true }), field())).toBe(120);
    expect(resolvePower(move('assurance', 60), mon(), mon({ tookDamageThisTurn: false }), field())).toBe(60);
  });

  it('retaliate: doubles (70→140) when ally fainted last turn on attacker team', () => {
    const attacker = mon();
    const fieldWithFaint = { ...field(), allyFaintedTeamIndex: 0, attackerTeamIndex: 0 };
    expect(resolvePower(move('retaliate', 70), attacker, mon(), fieldWithFaint)).toBe(140);

    const fieldNoFaint = { ...field(), allyFaintedTeamIndex: undefined, attackerTeamIndex: 0 };
    expect(resolvePower(move('retaliate', 70), attacker, mon(), fieldNoFaint)).toBe(70);

    // ally fainted on opposite team — should NOT double
    const fieldWrongTeam = { ...field(), allyFaintedTeamIndex: 1, attackerTeamIndex: 0 };
    expect(resolvePower(move('retaliate', 70), attacker, mon(), fieldWrongTeam)).toBe(70);
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.test.ts
```

Expected: 4 new tests FAIL — resolvers return `move.basePower`.

- [ ] **Step 3: Replace the four stubs in `dynamicPower.ts`**

In `packages/server/src/engine/dynamicPower.ts`, in the `resolvers` object, replace:

```typescript
  // TODO: needs turn-order volatile flags
  payback: (move) => move.basePower,
  avalanche: (move) => move.basePower,
  assurance: (move) => move.basePower,
```

with:

```typescript
  payback: (move, _attacker, target) =>
    target.movedThisTurn ? move.basePower * 2 : move.basePower,

  avalanche: (move, _attacker, target) =>
    target.movedThisTurn ? move.basePower * 2 : move.basePower,

  assurance: (move, _attacker, target) =>
    target.tookDamageThisTurn ? move.basePower * 2 : move.basePower,
```

And replace:

```typescript
  // TODO: needs field flag for last fainted team member
  retaliate: (move) => move.basePower,
```

with:

```typescript
  retaliate: (move, _attacker, _target, field) =>
    field.allyFaintedTeamIndex !== undefined && field.allyFaintedTeamIndex === field.attackerTeamIndex
      ? move.basePower * 2 : move.basePower,
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run integration tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.integration.test.ts
```

Expected: payback and retaliate integration tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/dynamicPower.ts packages/server/src/engine/__tests__/dynamicPower.test.ts
git commit -m "feat: implement payback, avalanche, assurance, retaliate dynamicPower resolvers"
```

---

## Task 5 — dynamicPower resolvers: echoedvoice, rollout, iceball, trumpcard, boltbeak, fishiousrend

**Files:**
- Modify: `packages/server/src/engine/dynamicPower.ts`
- Modify: `packages/server/src/engine/__tests__/dynamicPower.test.ts`

- [ ] **Step 1: Write failing unit tests**

Append to `packages/server/src/engine/__tests__/dynamicPower.test.ts`:

```typescript
  it('echoedvoice: scales 40/80/120/160/200 based on echoedvoice-active counter', () => {
    const vs = (n: number) => mon({ volatileStatus: [{ name: 'echoedvoice-active', counter: n }] });
    const m = move('echoedvoice', 40);
    expect(resolvePower(m, vs(1), mon(), field())).toBe(40);
    expect(resolvePower(m, vs(2), mon(), field())).toBe(80);
    expect(resolvePower(m, vs(3), mon(), field())).toBe(120);
    expect(resolvePower(m, vs(4), mon(), field())).toBe(160);
    expect(resolvePower(m, vs(5), mon(), field())).toBe(200);
    // No volatile → first use → base power
    expect(resolvePower(m, mon(), mon(), field())).toBe(40);
  });

  it('rollout: doubles power each hit (30/60/120/240/480)', () => {
    const vs = (n: number) => mon({ volatileStatus: [{ name: 'rollout-active', counter: n }] });
    const m = move('rollout', 30);
    expect(resolvePower(m, vs(1), mon(), field())).toBe(30);
    expect(resolvePower(m, vs(2), mon(), field())).toBe(60);
    expect(resolvePower(m, vs(3), mon(), field())).toBe(120);
    expect(resolvePower(m, vs(4), mon(), field())).toBe(240);
    expect(resolvePower(m, vs(5), mon(), field())).toBe(480);
    expect(resolvePower(m, mon(), mon(), field())).toBe(30); // no volatile → first hit
  });

  it('iceball: same scaling as rollout (30/60/120/240/480)', () => {
    const vs = (n: number) => mon({ volatileStatus: [{ name: 'iceball-active', counter: n }] });
    const m = move('iceball', 30);
    expect(resolvePower(m, vs(3), mon(), field())).toBe(120);
  });

  it('trumpcard: 200/80/60/50/40 based on remaining PP', () => {
    const m = (pp: number) => ({ id: 'trumpcard', effectId: 'trumpcard', basePower: 0, currentPp: pp });
    expect(resolvePower(m(1), mon(), mon(), field())).toBe(200);
    expect(resolvePower(m(2), mon(), mon(), field())).toBe(80);
    expect(resolvePower(m(3), mon(), mon(), field())).toBe(60);
    expect(resolvePower(m(4), mon(), mon(), field())).toBe(50);
    expect(resolvePower(m(5), mon(), mon(), field())).toBe(40);
  });

  it('boltbeak: doubles (85→170) when attacker is faster than target', () => {
    expect(resolvePower(move('boltbeak', 85), mon({ fasterThanTarget: true }), mon(), field())).toBe(170);
    expect(resolvePower(move('boltbeak', 85), mon({ fasterThanTarget: false }), mon(), field())).toBe(85);
  });

  it('fishiousrend: doubles (85→170) when attacker is faster than target', () => {
    expect(resolvePower(move('fishiousrend', 85), mon({ fasterThanTarget: true }), mon(), field())).toBe(170);
    expect(resolvePower(move('fishiousrend', 85), mon({ fasterThanTarget: false }), mon(), field())).toBe(85);
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.test.ts
```

Expected: 6 new test groups FAIL.

- [ ] **Step 3: Implement resolvers in `dynamicPower.ts`**

Replace the three consecutive stubs:

```typescript
  // TODO: needs consecutive-use counters
  echoedvoice: (move) => move.basePower,
  rollout: (move) => move.basePower,
  iceball: (move) => move.basePower,
```

with:

```typescript
  echoedvoice: (move, attacker) => {
    const v = (attacker.volatileStatus as { name: string; counter?: number }[])
      .find(v => v.name === 'echoedvoice-active');
    const n = v?.counter ?? 1;
    return Math.min(200, move.basePower * n);
  },

  rollout: (move, attacker) => {
    const v = (attacker.volatileStatus as { name: string; counter?: number }[])
      .find(v => v.name === 'rollout-active');
    const n = v?.counter ?? 1;
    return move.basePower * Math.pow(2, n - 1);
  },

  iceball: (move, attacker) => {
    const v = (attacker.volatileStatus as { name: string; counter?: number }[])
      .find(v => v.name === 'iceball-active');
    const n = v?.counter ?? 1;
    return move.basePower * Math.pow(2, n - 1);
  },
```

Then add the following three new resolvers to the `resolvers` object (these don't exist at all yet):

```typescript
  trumpcard: (move) => {
    const pp = move.currentPp ?? 1;
    if (pp <= 1) return 200;
    if (pp === 2) return 80;
    if (pp === 3) return 60;
    if (pp === 4) return 50;
    return 40;
  },

  boltbeak: (move, attacker) =>
    attacker.fasterThanTarget ? move.basePower * 2 : move.basePower,

  fishiousrend: (move, attacker) =>
    attacker.fasterThanTarget ? move.basePower * 2 : move.basePower,
```

- [ ] **Step 4: Run unit tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/dynamicPower.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full server test suite**

```bash
cd packages/server && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/dynamicPower.ts packages/server/src/engine/__tests__/dynamicPower.test.ts
git commit -m "feat: implement echoedvoice, rollout, iceball, trumpcard, boltbeak, fishiousrend resolvers"
```

---

## Task 6 — Burnup + Doubleshock type stripping

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/server/src/engine/__tests__/BattleEngine.test.ts`:

```typescript
  describe('burnup', () => {
    it('strips Fire type from user after landing', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      // Charizard (speciesId 6) is Fire/Flying — we give it burnup
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'burnup', currentPp: 5, maxPp: 5 };
      // Set explicit Fire type override so we can test stripping
      state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Fire', 'Flying'];

      const { newState, events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      const p1 = newState.teams[0]!.slots[0]!.party[0]!;
      expect(p1.typeOverride).toEqual(['Flying']); // Fire stripped, Flying remains
      expect(events.some(e => e.type === 'volatile-applied' && e.data['volatile'] === 'type-changed')).toBe(true);
    });

    it('fails if user has no Fire type', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'burnup', currentPp: 5, maxPp: 5 };
      state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Water']; // not Fire

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'wrong-type')).toBe(true);
    });

    it('doubleshock strips Electric type', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'doubleshock', currentPp: 5, maxPp: 5 };
      state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Electric', 'Normal'];

      const { newState } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      const p1 = newState.teams[0]!.slots[0]!.party[0]!;
      expect(p1.typeOverride).toEqual(['Normal']);
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: 3 new tests FAIL.

- [ ] **Step 3: Add `TYPE_STRIPPING_MOVES` constant and pre-damage type check to `BattleEngine.ts`**

Near the top of the damage path section in `executeMove` (after the Fling/Natural Gift handling, before the target loop, around the `effectiveMoveType` section), add the constant:

```typescript
const TYPE_STRIPPING_MOVES: Record<string, string> = {
  burnup: 'Fire',
  doubleshock: 'Electric',
};
```

Then, immediately after setting `effectiveMoveType` (after the Ion Deluge block, before the target loop starts), add a pre-damage guard:

```typescript
// Burnup / Doubleshock: fail if user lacks the required type
const typeToStrip = TYPE_STRIPPING_MOVES[move.id];
if (typeToStrip) {
  const userTypes = this.resolveEffectiveTypes(attacker);
  if (!userTypes.includes(typeToStrip as import('@poke-fighter/shared').PokemonType)) {
    events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'wrong-type' } });
    return { newState: s, events };
  }
}
```

Then, after the target loop closes (after the `hasPivot` block, just before `return { newState: s, events }`), add:

```typescript
// Burnup / Doubleshock: strip type from attacker after successfully dealing damage
if (typeToStrip && !attacker.fainted) {
  const currentTypes = this.resolveEffectiveTypes(attacker);
  if (currentTypes.includes(typeToStrip as import('@poke-fighter/shared').PokemonType)) {
    const stripped = currentTypes.filter(t => t !== typeToStrip);
    attacker.typeOverride = stripped.length > 0 ? stripped : ['Normal'];
    events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: 'type-changed' } });
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: implement burnup and doubleshock type stripping"
```

---

## Task 7 — Poltergeist item check + High Jump Kick / Jump Kick crash damage

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/server/src/engine/__tests__/BattleEngine.test.ts`:

```typescript
  describe('poltergeist', () => {
    it('fails when target holds no item', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'poltergeist', currentPp: 5, maxPp: 5 };
      delete state.teams[1]!.slots[0]!.party[0]!.heldItem;

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'no-item')).toBe(true);
      expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(false);
    });

    it('lands when target holds an item', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'poltergeist', currentPp: 5, maxPp: 5 };
      state.teams[1]!.slots[0]!.party[0]!.heldItem = 'oran-berry';

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(true);
    });
  });

  describe('highjumpkick crash damage', () => {
    it('user takes half max HP on miss', () => {
      // Force a miss by returning rng > accuracy threshold
      // highjumpkick accuracy=90, so rng=0.95 misses
      const engine = new BattleEngine({ rng: () => 0.95 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'highjumpkick', currentPp: 10, maxPp: 10 };

      const { newState, events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      expect(events.some(e => e.type === 'miss')).toBe(true);
      const crashEvt = events.find(e => e.type === 'damage-dealt' && e.data['source'] === 'crash');
      expect(crashEvt).toBeDefined();
      expect(crashEvt!.data['damage']).toBe(50); // floor(100 / 2) = 50
    });

    it('jumpkick also crashes on miss', () => {
      const engine = new BattleEngine({ rng: () => 0.96 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'jumpkick', currentPp: 10, maxPp: 10 };

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      expect(events.some(e => e.type === 'damage-dealt' && e.data['source'] === 'crash')).toBe(true);
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: 4 new tests FAIL.

- [ ] **Step 3: Add poltergeist check inside target loop**

In `BattleEngine.ts`, inside the target loop in `executeMove`, find the protect check block (around line 791, search for `const protectEntry`). Right before it (inside the target loop, after any early-continue checks that apply per-target), add:

```typescript
// Poltergeist: fail if target holds no item
if (move.id === 'poltergeist' && !target.heldItem) {
  events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-item' } });
  continue;
}
```

- [ ] **Step 4: Add crash move set and miss-crash handling**

Near the top of `executeMove` (in the constants section, where `PHASING_MOVES` and others are defined, or just before `const secs`), add:

```typescript
const CRASH_MOVE_IDS = new Set(['highjumpkick', 'jumpkick']);
```

Find the miss-detection block in `executeMove` for damaging moves (search for `events.push({ type: 'miss'` in the damaging-move section, around line 655). Replace it with:

```typescript
if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
  events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
  if (CRASH_MOVE_IDS.has(move.id)) {
    const crash = Math.floor(attacker.maxHp / 2);
    const actual = Math.min(crash, attacker.currentHp);
    attacker.currentHp -= actual;
    events.push({ type: 'damage-dealt', data: { source: 'crash', slotId: attackerSlotId, damage: actual, remainingHp: attacker.currentHp } });
    if (attacker.currentHp <= 0) {
      attacker.fainted = true;
      attacker.currentHp = 0;
      events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
    }
  }
  return { newState: s, events };
}
```

Also add crash in the protect-blocked `continue` branch. Find the line `continue; // after protect effects` (around line 821) and add before it:

```typescript
if (CRASH_MOVE_IDS.has(move.id)) {
  const crash = Math.floor(attacker.maxHp / 2);
  const actual = Math.min(crash, attacker.currentHp);
  attacker.currentHp -= actual;
  events.push({ type: 'damage-dealt', data: { source: 'crash', slotId: attackerSlotId, damage: actual, remainingHp: attacker.currentHp } });
  if (attacker.currentHp <= 0) {
    attacker.fainted = true;
    attacker.currentHp = 0;
    events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: implement poltergeist item check and high jump kick crash damage"
```

---

## Task 8 — Judgment + Multiattack item-based type, and Naturepower

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/registrations.ts`
- Modify: `packages/server/src/engine/__tests__/BattleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/server/src/engine/__tests__/BattleEngine.test.ts`:

```typescript
  describe('judgment', () => {
    it('is Normal type when no plate held', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'judgment', currentPp: 10, maxPp: 10 };
      delete state.teams[0]!.slots[0]!.party[0]!.heldItem;

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      const dmg = events.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1');
      expect(dmg).toBeDefined();
      expect(dmg!.data['moveType']).toBe('Normal');
    });

    it('becomes Fire type when flame-plate held', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'judgment', currentPp: 10, maxPp: 10 };
      state.teams[0]!.slots[0]!.party[0]!.heldItem = 'flame-plate';

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      const dmg = events.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1');
      expect(dmg!.data['moveType']).toBe('Fire');
    });

    it('multiattack uses fire-memory for Fire type', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'multiattack', currentPp: 10, maxPp: 10 };
      state.teams[0]!.slots[0]!.party[0]!.heldItem = 'fire-memory';

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      const dmg = events.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1');
      expect(dmg!.data['moveType']).toBe('Fire');
    });
  });

  describe('naturepower', () => {
    it('uses tri-attack with no terrain', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'naturepower', currentPp: 20, maxPp: 20 };

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      // tri-attack should be executed — emits move-used for 'triattack' (via sub-move)
      const used = events.find(e => e.type === 'move-used' && e.data['moveId'] === 'triattack');
      expect(used).toBeDefined();
    });

    it('uses thunderbolt on electric terrain', () => {
      const engine = new BattleEngine({ rng: () => 0.5 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'naturepower', currentPp: 20, maxPp: 20 };
      state.field.terrain = { type: 'electric', turnsRemaining: 5 };

      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      const used = events.find(e => e.type === 'move-used' && e.data['moveId'] === 'thunderbolt');
      expect(used).toBeDefined();
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: new tests FAIL.

- [ ] **Step 3: Add `PLATE_TYPE_MAP` and `MEMORY_TYPE_MAP` to BattleEngine.ts**

In `BattleEngine.ts`, near the other module-level constant sets (e.g., `PHASING_MOVES`, `ALWAYS_THAW_MOVES`), add:

```typescript
const PLATE_TYPE_MAP: Record<string, string> = {
  'flame-plate': 'Fire', 'splash-plate': 'Water', 'zap-plate': 'Electric',
  'meadow-plate': 'Grass', 'icicle-plate': 'Ice', 'fist-plate': 'Fighting',
  'toxic-plate': 'Poison', 'earth-plate': 'Ground', 'sky-plate': 'Flying',
  'mind-plate': 'Psychic', 'insect-plate': 'Bug', 'stone-plate': 'Rock',
  'spooky-plate': 'Ghost', 'draco-plate': 'Dragon', 'dread-plate': 'Dark',
  'iron-plate': 'Steel', 'pixie-plate': 'Fairy',
};

const MEMORY_TYPE_MAP: Record<string, string> = {
  'fire-memory': 'Fire', 'water-memory': 'Water', 'electric-memory': 'Electric',
  'grass-memory': 'Grass', 'ice-memory': 'Ice', 'fighting-memory': 'Fighting',
  'poison-memory': 'Poison', 'ground-memory': 'Ground', 'flying-memory': 'Flying',
  'psychic-memory': 'Psychic', 'bug-memory': 'Bug', 'rock-memory': 'Rock',
  'ghost-memory': 'Ghost', 'dragon-memory': 'Dragon', 'dark-memory': 'Dark',
  'steel-memory': 'Steel', 'fairy-memory': 'Fairy',
};
```

In `executeMove`, in the `effectiveMoveType` section (after the Ion Deluge block, around line 742), add:

```typescript
// Judgment: type from held Plate
if (move.id === 'judgment') {
  effectiveMoveType = (PLATE_TYPE_MAP[attacker.heldItem ?? ''] ?? 'Normal') as import('@poke-fighter/shared').PokemonType;
}
// Multiattack: type from held Memory
if (move.id === 'multiattack') {
  effectiveMoveType = (MEMORY_TYPE_MAP[attacker.heldItem ?? ''] ?? 'Normal') as import('@poke-fighter/shared').PokemonType;
}
```

Also verify the `damage-dealt` event includes `moveType`. Search for where the `damage-dealt` event is emitted and confirm it includes `moveType: effectiveMoveType` — if not, add it. (Look for `type: 'damage-dealt'` in the target loop and ensure `moveType` is included in the data.)

- [ ] **Step 4: Add `naturepower` handler to `registrations.ts`**

In `packages/server/src/engine/registrations.ts`, in the `buildDefaultRegistry` function, find the status move handlers section. Add after the `mefirst` stub:

```typescript
r.register('naturepower', (ctx) => {
  const NATUREPOWER_MOVE: Record<string, string> = {
    electric: 'thunderbolt',
    grassy: 'energyball',
    misty: 'moonblast',
    psychic: 'psychic',
  };
  const terrain = ctx.battle.field.terrain?.type;
  const subMoveId = terrain ? (NATUREPOWER_MOVE[terrain] ?? 'triattack') : 'triattack';
  return { events: ctx.executeSubMove(subMoveId) };
});
```

- [ ] **Step 5: Run tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/BattleEngine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run full server suite**

```bash
cd packages/server && npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/registrations.ts packages/server/src/engine/__tests__/BattleEngine.test.ts
git commit -m "feat: implement judgment/multiattack item-based types and naturepower handler"
```

---

## Task 9 — Outrage / Petaldance / Thrash lock mechanics

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Create: `packages/server/src/engine/__tests__/lockMoves.test.ts`

- [ ] **Step 1: Create `lockMoves.test.ts` with failing tests**

Create `packages/server/src/engine/__tests__/lockMoves.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

function actions(aIdx = 0, bIdx = 0): Record<string, MoveAction> {
  return {
    'slot-a1': { type: 'move', moveIndex: aIdx, targetSlotId: 'slot-b1' },
    'slot-b1': { type: 'move', moveIndex: bIdx, targetSlotId: 'slot-a1' },
  };
}

describe('Outrage / Petaldance / Thrash lock mechanics', () => {
  it('applies outrage-active volatile on first use', () => {
    const engine = new BattleEngine({ rng: () => 0.4 }); // rng<0.5 → 2 turns
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'outrage', currentPp: 10, maxPp: 10 };

    const { newState, events } = engine.resolveTurn(state, actions());

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const lockV = p1.volatileStatus.find(v => v.name === 'outrage-active');
    expect(lockV).toBeDefined();
    expect(lockV!.counter).toBe(1); // decremented from initial 2, now 1 remaining
    expect(events.some(e => e.type === 'volatile-applied' && e.data['volatile'] === 'outrage-active')).toBe(true);
  });

  it('applies confusion and clears volatile when outrage sequence ends', () => {
    const engine = new BattleEngine({ rng: () => 0.4 }); // 2-turn sequence
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'outrage', currentPp: 10, maxPp: 10 };
    // Pre-set the volatile as if it's the final turn (counter=1 means 1 left, will decrement to 0)
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({
      name: 'outrage-active', moveId: 'outrage', counter: 1,
    });

    const { newState, events } = engine.resolveTurn(state, actions());

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'outrage-active')).toBe(false);
    expect(p1.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
    expect(events.some(e => e.type === 'volatile-cured' && e.data['volatile'] === 'outrage-active')).toBe(true);
    expect(events.some(e => e.type === 'volatile-applied' && e.data['volatile'] === 'confusion')).toBe(true);
  });

  it('locks user into outrage on second turn regardless of chosen move', () => {
    const engine = new BattleEngine({ rng: () => 0.4 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'outrage', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({
      name: 'outrage-active', moveId: 'outrage', counter: 1,
    });

    // Player tries to use flamethrower (move index 1) but is locked
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const moveUsed = events.find(e => e.type === 'move-used' && e.data['attackerSlotId'] === 'slot-a1');
    expect(moveUsed!.data['moveId']).toBe('outrage');
  });

  it('thrash and petaldance behave identically to outrage', () => {
    for (const moveId of ['thrash', 'petaldance']) {
      const engine = new BattleEngine({ rng: () => 0.4 });
      const state = make1v1State();
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId, currentPp: 10, maxPp: 10 };
      state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({
        name: `${moveId}-active`, moveId, counter: 1,
      });

      const { newState } = engine.resolveTurn(state, actions());
      const p1 = newState.teams[0]!.slots[0]!.party[0]!;
      expect(p1.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/server && npx vitest run src/engine/__tests__/lockMoves.test.ts
```

Expected: all tests FAIL.

- [ ] **Step 3: Add lock-move constants and constraint check to `BattleEngine.ts`**

Near the module-level constants section, add:

```typescript
const THRASH_LOCK_MOVES = new Set(['outrage', 'petaldance', 'thrash']);
const ROLLOUT_LOCK_MOVES = new Set(['rollout', 'iceball']);
```

In `executeMove`, in the constraint-check phase — find the Encore block (around line 317). **After** the Encore block (after its closing brace), add the lock-move constraint check:

```typescript
// Outrage / Thrash / Petaldance / Rollout / Iceball: enforce move lock
const lockVolatile = attacker.volatileStatus.find(v =>
  THRASH_LOCK_MOVES.has(v.name.replace('-active', '')) || ROLLOUT_LOCK_MOVES.has(v.name.replace('-active', ''))
    ? v.name.endsWith('-active') : false
);
if (lockVolatile?.moveId && move.id !== lockVolatile.moveId) {
  const lockedMoveData = this.data.getMove(lockVolatile.moveId);
  if (lockedMoveData) move = lockedMoveData;
}
```

- [ ] **Step 4: Add post-damage thrash volatile management**

In `executeMove`, after `attacker.lastMoveId = move.id; s.lastUsedMoveId = move.id;` (around line 1714) and before the pivot check, add:

```typescript
// Outrage / Petaldance / Thrash: manage lock volatile
if (THRASH_LOCK_MOVES.has(move.id) && !attacker.fainted) {
  const volatileName = `${move.id}-active`;
  let lockV = attacker.volatileStatus.find(v => v.name === volatileName);
  if (!lockV) {
    // First use: 2 or 3 turns (rng < 0.5 → 2, else → 3)
    const turns = this.rng() < 0.5 ? 2 : 3;
    lockV = { name: volatileName, moveId: move.id, counter: turns };
    attacker.volatileStatus.push(lockV);
    events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: volatileName } });
  }
  lockV.counter = (lockV.counter ?? 1) - 1;
  if (lockV.counter <= 0) {
    attacker.volatileStatus = attacker.volatileStatus.filter(v => v !== lockV);
    events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: volatileName } });
    const confuseEvent = applyVolatile(attacker, attackerSlotId, attackerSlotId, 'confusion');
    if (confuseEvent) events.push(confuseEvent);
  }
}
```

Make sure `applyVolatile` is imported from `'./effects.js'`. Add it to the existing import line:

```typescript
import { applyStatus, applyStatBoost, evaluateSecondaryEffect, evaluateVolatileEffect, applySecondaries, applyVolatile } from './effects.js';
```

- [ ] **Step 5: Run tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/lockMoves.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run full server suite**

```bash
cd packages/server && npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/lockMoves.test.ts
git commit -m "feat: implement outrage/petaldance/thrash lock mechanics with post-sequence confusion"
```

---

## Task 10 — Rollout + Iceball + Echoedvoice counter management

**Files:**
- Modify: `packages/server/src/engine/BattleEngine.ts`
- Modify: `packages/server/src/engine/__tests__/lockMoves.test.ts`

- [ ] **Step 1: Add failing tests for rollout, iceball, echoedvoice**

Append to `packages/server/src/engine/__tests__/lockMoves.test.ts`:

```typescript
describe('Rollout / Iceball lock mechanics', () => {
  it('sets rollout-active counter to 1 on first use', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'rollout', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, actions());
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const v = p1.volatileStatus.find(v => v.name === 'rollout-active');
    expect(v?.counter).toBe(1);
  });

  it('increments rollout counter on subsequent uses', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'rollout', currentPp: 20, maxPp: 20 };
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'rollout-active', moveId: 'rollout', counter: 2 });

    const { newState } = engine.resolveTurn(state, actions());
    const v = newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.find(v => v.name === 'rollout-active');
    expect(v?.counter).toBe(3);
  });

  it('clears rollout-active after 5 uses without confusion', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'rollout', currentPp: 20, maxPp: 20 };
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'rollout-active', moveId: 'rollout', counter: 5 });

    const { newState, events } = engine.resolveTurn(state, actions());
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'rollout-active')).toBe(false);
    expect(p1.volatileStatus.some(v => v.name === 'confusion')).toBe(false); // no confusion for rollout
    expect(events.some(e => e.type === 'volatile-cured' && e.data['volatile'] === 'rollout-active')).toBe(true);
  });
});

describe('Echoed Voice counter management', () => {
  it('sets echoedvoice-active counter to 1 on first use', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'echoedvoice', currentPp: 15, maxPp: 15 };

    const { newState } = engine.resolveTurn(state, actions());
    const v = newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.find(v => v.name === 'echoedvoice-active');
    expect(v?.counter).toBe(1);
  });

  it('increments echoedvoice counter (cap 5)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'echoedvoice', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'echoedvoice-active', counter: 5 });

    const { newState } = engine.resolveTurn(state, actions());
    const v = newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.find(v => v.name === 'echoedvoice-active');
    expect(v?.counter).toBe(5); // capped
  });

  it('clears echoedvoice-active when a different move is used', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'echoedvoice-active', counter: 3 });

    const { newState } = engine.resolveTurn(state, actions(0)); // uses flamethrower (index 0)
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'echoedvoice-active')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/server && npx vitest run src/engine/__tests__/lockMoves.test.ts
```

Expected: 6 new tests FAIL.

- [ ] **Step 3: Add rollout / iceball post-damage management to `BattleEngine.ts`**

In `executeMove`, in the same block where Thrash lock was added (after `attacker.lastMoveId = move.id`), add after the thrash block:

```typescript
// Rollout / Iceball: manage scaling lock volatile
if (ROLLOUT_LOCK_MOVES.has(move.id) && !attacker.fainted) {
  const volatileName = `${move.id}-active`;
  let lockV = attacker.volatileStatus.find(v => v.name === volatileName);
  if (!lockV) {
    lockV = { name: volatileName, moveId: move.id, counter: 1 };
    attacker.volatileStatus.push(lockV);
  } else {
    lockV.counter = (lockV.counter ?? 1) + 1;
  }
  if (lockV.counter >= 5) {
    attacker.volatileStatus = attacker.volatileStatus.filter(v => v !== lockV);
    events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: volatileName } });
    // No confusion for rollout/iceball
  }
}

// Echoed Voice: increment consecutive counter
if (move.id === 'echoedvoice') {
  let evV = attacker.volatileStatus.find(v => v.name === 'echoedvoice-active');
  if (!evV) {
    attacker.volatileStatus.push({ name: 'echoedvoice-active', counter: 1 });
  } else {
    evV.counter = Math.min(5, (evV.counter ?? 1) + 1);
  }
}

// Echoed Voice: clear counter when a different move is used
if (move.id !== 'echoedvoice') {
  attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'echoedvoice-active');
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/server && npx vitest run src/engine/__tests__/lockMoves.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full server suite**

```bash
cd packages/server && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/engine/BattleEngine.ts packages/server/src/engine/__tests__/lockMoves.test.ts
git commit -m "feat: implement rollout/iceball scaling lock and echoedvoice consecutive counter"
```

---

## Task 11 — UI text: volatileAppliedText, volatileCuredText, status-cured, MOVE_NOTE_TEXT

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx`
- Modify: `packages/client/src/battle/__tests__/BattleContext.test.ts`

- [ ] **Step 1: Write failing tests for volatile text**

Append to `packages/client/src/battle/__tests__/BattleContext.test.ts`:

```typescript
  describe('volatile-applied text', () => {
    const volatileEvent = (volatile: string, targetSlotId = 'mon-a'): TurnResolveEvent => ({
      type: 'volatile-applied', data: { targetSlotId, volatile },
    });

    it.each([
      ['infatuation', 'mon-a fell in love!'],
      ['yawn', 'mon-a began to doze off!'],
      ['nightmare', 'mon-a fell into a nightmare!'],
      ['focusenergy', 'mon-a is getting pumped!'],
      ['laser-focus', 'mon-a is concentrating intensely!'],
      ['imprison', 'mon-a sealed the opponent\'s moves!'],
      ['magic-coat', 'mon-a shrouded itself with a magic coat!'],
      ['snatch', 'mon-a is waiting to snatch a move!'],
      ['dragon-cheer', 'mon-a received a Dragon Cheer!'],
      ['foresight', 'mon-a was identified!'],
      ['miracle-eye', 'mon-a can no longer evade Psychic moves!'],
      ['electrify', 'mon-a\'s moves were electrified!'],
      ['octolock', 'mon-a can no longer escape!'],
      ['minimize', 'mon-a minimized!'],
      ['geomancy-charge', 'mon-a is absorbing power!'],
      ['transformed', 'mon-a transformed!'],
      ['power-trick', 'mon-a switched its Attack and Defense!'],
      ['psych-up', 'mon-a psyched itself up!'],
      ['charging-solarbeam', 'mon-a absorbed light!'],
      ['outrage-active', 'mon-a began thrashing about!'],
      ['petaldance-active', 'mon-a began thrashing about!'],
      ['thrash-active', 'mon-a began thrashing about!'],
    ])('volatile %s → %s', (volatile, expected) => {
      const entries = eventsToPlaybackEntries([volatileEvent(volatile)]);
      expect(entries[0]?.text).toBe(expected);
    });
  });

  describe('volatile-cured text', () => {
    const curedEvent = (volatile: string, slotId = 'mon-a'): TurnResolveEvent => ({
      type: 'volatile-cured', data: { slotId, volatile },
    });

    it.each([
      ['lock-on', 'mon-a is no longer taking aim!'],
      ['powder', 'mon-a is no longer covered in powder!'],
      ['power-trick', 'mon-a\'s Attack and Defense returned to normal!'],
      ['outrage-active', 'mon-a became confused due to fatigue!'],
      ['petaldance-active', 'mon-a became confused due to fatigue!'],
      ['thrash-active', 'mon-a became confused due to fatigue!'],
    ])('volatile-cured %s → %s', (volatile, expected) => {
      const entries = eventsToPlaybackEntries([curedEvent(volatile)]);
      expect(entries[0]?.text).toBe(expected);
    });
  });

  describe('status-cured text', () => {
    const curedEvent = (status: string): TurnResolveEvent => ({
      type: 'status-cured', data: { slotId: 'mon-a', status, pokemonName: 'Bulba' },
    });

    it.each([
      ['slp', 'Bulba woke up!'],
      ['brn', "Bulba's burn healed!"],
      ['par', 'Bulba was cured of paralysis!'],
      ['frz', 'Bulba thawed out!'],
      ['psn', 'Bulba was cured of its poisoning!'],
      ['tox', 'Bulba was cured of its poisoning!'],
    ])('status %s → %s', (status, expected) => {
      const entries = eventsToPlaybackEntries([curedEvent(status)]);
      expect(entries[0]?.text).toBe(expected);
    });
  });

  describe('move-note text', () => {
    const noteEvent = (note: string): TurnResolveEvent => ({
      type: 'move-note', data: { note },
    });

    it.each([
      ['item-bestowed', 'An item was bestowed!'],
      ['item-recycled', 'The item was recycled!'],
      ['ability-swapped', 'The two Pokémon swapped abilities!'],
      ['ability-copied', 'The ability was copied!'],
      ['ability-entrained', 'The ability was entrained!'],
      ['ability-changed-simple', "The target's ability became Simple!"],
      ['ability-changed-insomnia', "The target's ability became Insomnia!"],
      ['guard-split', 'Defense and Sp. Def were averaged!'],
      ['power-split', 'Attack and Sp. Atk were averaged!'],
      ['power-shift', 'Attack and Defense were swapped!'],
      ['ally-switched', 'The ally switched positions!'],
      ['after-you', 'The target will move next!'],
      ['pp-reduced-by-4', 'Its PP was reduced by 4!'],
      ['pp-reduced-by-1', 'Its PP was reduced by 1!'],
    ])('note %s → %s', (note, expected) => {
      const entries = eventsToPlaybackEntries([noteEvent(note)]);
      expect(entries[0]?.text).toBe(expected);
    });
  });
```

- [ ] **Step 2: Run to verify failures**

```bash
cd packages/client && npx vitest run src/battle/__tests__/BattleContext.test.ts
```

Expected: many new tests FAIL.

- [ ] **Step 3: Add `volatileAppliedText` cases in `BattleContext.tsx`**

In `packages/client/src/battle/BattleContext.tsx`, find `function volatileAppliedText`. Before the `default: return '';` line, add:

```typescript
    case 'infatuation':        return `${slotId} fell in love!`;
    case 'yawn':               return `${slotId} began to doze off!`;
    case 'nightmare':          return `${slotId} fell into a nightmare!`;
    case 'focusenergy':        return `${slotId} is getting pumped!`;
    case 'laser-focus':        return `${slotId} is concentrating intensely!`;
    case 'imprison':           return `${slotId} sealed the opponent's moves!`;
    case 'magic-coat':         return `${slotId} shrouded itself with a magic coat!`;
    case 'snatch':             return `${slotId} is waiting to snatch a move!`;
    case 'dragon-cheer':       return `${slotId} received a Dragon Cheer!`;
    case 'foresight':          return `${slotId} was identified!`;
    case 'miracle-eye':        return `${slotId} can no longer evade Psychic moves!`;
    case 'electrify':          return `${slotId}'s moves were electrified!`;
    case 'octolock':           return `${slotId} can no longer escape!`;
    case 'minimize':           return `${slotId} minimized!`;
    case 'geomancy-charge':    return `${slotId} is absorbing power!`;
    case 'transformed':        return `${slotId} transformed!`;
    case 'power-trick':        return `${slotId} switched its Attack and Defense!`;
    case 'psych-up':           return `${slotId} psyched itself up!`;
    case 'charging-solarbeam': return `${slotId} absorbed light!`;
    case 'outrage-active':
    case 'petaldance-active':
    case 'thrash-active':      return `${slotId} began thrashing about!`;
```

- [ ] **Step 4: Add `volatileCuredText` cases in `BattleContext.tsx`**

In `function volatileCuredText`, before the `default: return '';` line, add:

```typescript
    case 'lock-on':           return `${slotId} is no longer taking aim!`;
    case 'powder':            return `${slotId} is no longer covered in powder!`;
    case 'power-trick':       return `${slotId}'s Attack and Defense returned to normal!`;
    case 'outrage-active':
    case 'petaldance-active':
    case 'thrash-active':     return `${slotId} became confused due to fatigue!`;
```

- [ ] **Step 5: Replace `status-cured` handler in `eventsToPlaybackEntries`**

Find the `case 'status-cured':` block (currently around line 197) and replace it entirely with:

```typescript
      case 'status-cured': {
        const status = String(event.data['status']);
        const name = String(event.data['pokemonName'] ?? event.data['slotId']);
        const textMap: Record<string, string> = {
          slp: `${name} woke up!`,
          brn: `${name}'s burn healed!`,
          par: `${name} was cured of paralysis!`,
          frz: `${name} thawed out!`,
          psn: `${name} was cured of its poisoning!`,
          tox: `${name} was cured of its poisoning!`,
        };
        const text = textMap[status] ?? '';
        if (text) entries.push({ text, delay: 600 });
        break;
      }
```

- [ ] **Step 6: Extend `MOVE_NOTE_TEXT` and fix the `move-note` handler**

Replace the `MOVE_NOTE_TEXT` const (currently around line 69):

```typescript
const MOVE_NOTE_TEXT: Record<string, string> = {
  'mud-sport-started':         'Mud Sport weakened Electric moves!',
  'mud-sport-ended':           'The effect of Mud Sport wore off!',
  'water-sport-started':       'Water Sport weakened Fire moves!',
  'water-sport-ended':         'The effect of Water Sport wore off!',
  'item-bestowed':             'An item was bestowed!',
  'item-recycled':             'The item was recycled!',
  'ability-swapped':           'The two Pokémon swapped abilities!',
  'ability-copied':            'The ability was copied!',
  'ability-entrained':         'The ability was entrained!',
  'ability-changed-simple':    "The target's ability became Simple!",
  'ability-changed-insomnia':  "The target's ability became Insomnia!",
  'guard-split':               'Defense and Sp. Def were averaged!',
  'power-split':               'Attack and Sp. Atk were averaged!',
  'power-shift':               'Attack and Defense were swapped!',
  'ally-switched':             'The ally switched positions!',
  'after-you':                 'The target will move next!',
};
```

Find the `case 'move-note':` block (currently around line 347) and replace it with:

```typescript
      case 'move-note': {
        const note = String(event.data['note']);
        let text = MOVE_NOTE_TEXT[note] ?? '';
        if (!text && note.startsWith('pp-reduced-by-')) {
          const n = note.replace('pp-reduced-by-', '');
          text = `Its PP was reduced by ${n}!`;
        }
        if (!text) text = note;
        if (text) entries.push({ text, delay: 600 });
        break;
      }
```

- [ ] **Step 7: Run client tests**

```bash
cd packages/client && npx vitest run src/battle/__tests__/BattleContext.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Run full client suite**

```bash
cd packages/client && npm test
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.ts
git commit -m "feat: add battle log text for all volatile, status-cured, and move-note events"
```

---

## Final verification

- [ ] **Run both packages' full test suites**

```bash
cd packages/server && npm test
cd packages/client && npm test
```

Expected: all tests PASS in both packages.

- [ ] **Run typechecks on all three packages**

```bash
cd packages/shared && npx tsc --noEmit
cd packages/server && npx tsc --noEmit
cd packages/client && npx tsc --noEmit
```

Expected: no errors.
