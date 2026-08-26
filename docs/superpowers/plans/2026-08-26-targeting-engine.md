# Targeting Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire each move's `targetType` and per-move `legalTargets` through from server to client, add position-based adjacency filtering, and replace the generic targeting dropdown with mode-specific UI (dropdown / name list / static label / auto-submit).

**Architecture:** The server enriches each `validMove` entry with its `MoveTarget` and the slot IDs it can legally reach (computed by `getLegalTargets` with new adjacency filtering). The client reads `targetType` off the selected move, classifies it into a UI mode with a pure utility function, and renders a dropdown, read-only name list, or static label accordingly — or auto-submits if no choice is needed.

**Tech Stack:** TypeScript, React, Vitest, Socket.io shared types, existing `DataLoader` / `getLegalTargets` on the server.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/types/events.ts` | Modify | Add `targetType`+`legalTargets` per move; remove top-level `legalTargets` |
| `packages/server/src/engine/targeting.ts` | Modify | Add adjacency helpers; apply `|i-j|≤1` filter to adjacent target types |
| `packages/server/src/engine/__tests__/targeting.test.ts` | Modify | Add multi-slot adjacency test cases |
| `packages/server/src/socket/BattleRoom.ts` | Modify | Call `getLegalTargets` per move; remove `getOpposingSlotIds` |
| `packages/server/src/socket/__tests__/BattleRoom.test.ts` | Modify | Update assertion from `req.legalTargets` to `req.validMoves[0].legalTargets` |
| `packages/client/src/battle/targeting.ts` | **Create** | Pure utility: `classifyTarget`, `getTargetLabel`, `getSlotDisplayName`, `formatTargetNames` |
| `packages/client/src/battle/__tests__/targeting.test.ts` | **Create** | Unit tests for the above utility |
| `packages/client/src/pages/BattlePage.tsx` | Modify | Use per-move targeting data; render correct UI mode |

---

## Task 1: Adjacency filtering in `getLegalTargets`

**Files:**
- Modify: `packages/server/src/engine/targeting.ts`
- Modify: `packages/server/src/engine/__tests__/targeting.test.ts`

- [ ] **Step 1: Add adjacency test cases for a 3-slot battle**

Append these tests to `packages/server/src/engine/__tests__/targeting.test.ts`:

```ts
describe('adjacency filtering in multi-slot battles', () => {
  function make3v3State() {
    const state = make1v1State();
    // Extend team A to 3 slots (indices 0, 1, 2)
    const a2 = structuredClone(state.teams[0]!.slots[0]!);
    a2.slotId = 'slot-a2';
    const a3 = structuredClone(state.teams[0]!.slots[0]!);
    a3.slotId = 'slot-a3';
    state.teams[0]!.slots.push(a2, a3);
    // Extend team B to 3 slots (indices 0, 1, 2)
    const b2 = structuredClone(state.teams[1]!.slots[0]!);
    b2.slotId = 'slot-b2';
    const b3 = structuredClone(state.teams[1]!.slots[0]!);
    b3.slotId = 'slot-b3';
    state.teams[1]!.slots.push(b2, b3);
    return state;
  }

  it('normal: left attacker (idx 0) reaches foe indices 0 and 1, not 2', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toContain('slot-b1');
    expect(targets).toContain('slot-b2');
    expect(targets).not.toContain('slot-b3');
  });

  it('normal: center attacker (idx 1) reaches all 3 foe slots', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a2', 'normal');
    expect(targets).toContain('slot-b1');
    expect(targets).toContain('slot-b2');
    expect(targets).toContain('slot-b3');
  });

  it('normal: right attacker (idx 2) reaches foe indices 1 and 2, not 0', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a3', 'normal');
    expect(targets).not.toContain('slot-b1');
    expect(targets).toContain('slot-b2');
    expect(targets).toContain('slot-b3');
  });

  it('adjacentAlly: center attacker (idx 1) reaches allies at idx 0 and 2', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a2', 'adjacentAlly');
    expect(targets).toContain('slot-a1');
    expect(targets).toContain('slot-a3');
    expect(targets).not.toContain('slot-a2'); // not self
  });

  it('adjacentAlly: left attacker (idx 0) can only reach ally at idx 1', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a1', 'adjacentAlly');
    expect(targets).toEqual(['slot-a2']);
  });

  it('allAdjacentFoes returns all living foes regardless of position', () => {
    const state = make3v3State();
    const targets = getLegalTargets(state, 'slot-a1', 'allAdjacentFoes');
    expect(targets.sort()).toEqual(['slot-b1', 'slot-b2', 'slot-b3'].sort());
  });

  it('normal in 1v1 still returns the single foe (adjacency is no-op)', () => {
    const state = make1v1State();
    const targets = getLegalTargets(state, 'slot-a1', 'normal');
    expect(targets).toEqual(['slot-b1']);
  });
});
```

- [ ] **Step 2: Run tests to confirm failures**

```
cd packages/server && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|adjacency"
```

Expected: the 7 new adjacency tests fail (existing tests still pass).

- [ ] **Step 3: Rewrite `targeting.ts` with adjacency filtering**

Replace the entire file `packages/server/src/engine/targeting.ts`:

```ts
import type { BattleState, MoveTarget, TeamState, SlotState } from '@poke-fighter/shared';

function nonSpectatorSlots(team: TeamState): SlotState[] {
  return team.slots.filter((s) => !s.isSpectator);
}

function isAdjacent(attackerIdx: number, targetIdx: number): boolean {
  return Math.abs(attackerIdx - targetIdx) <= 1;
}

export function getLegalTargets(
  state: BattleState,
  attackerSlotId: string,
  target: MoveTarget
): string[] {
  const attackerTeamIdx = state.teams.findIndex((t) =>
    t.slots.some((s) => s.slotId === attackerSlotId)
  );
  if (attackerTeamIdx === -1) return [];

  const foeTeamIdx = attackerTeamIdx === 0 ? 1 : 0;
  const allyTeam = state.teams[attackerTeamIdx]!;
  const foeTeam = state.teams[foeTeamIdx];

  const allySlots = nonSpectatorSlots(allyTeam);
  const foeSlots = foeTeam ? nonSpectatorSlots(foeTeam) : [];
  const attackerIdx = allySlots.findIndex((s) => s.slotId === attackerSlotId);

  const isLiving = (s: SlotState) => !s.party[s.activePokemonIndex]?.fainted;
  const isLivingAlly = (s: SlotState) => s.slotId !== attackerSlotId && isLiving(s);

  const allLivingFoes = () => foeSlots.filter(isLiving).map((s) => s.slotId);
  const allLivingAllies = () => allySlots.filter(isLivingAlly).map((s) => s.slotId);
  const adjacentLivingFoes = () =>
    foeSlots.filter((s, i) => isLiving(s) && isAdjacent(attackerIdx, i)).map((s) => s.slotId);
  const adjacentLivingAllies = () =>
    allySlots.filter((s, i) => isLivingAlly(s) && isAdjacent(attackerIdx, i)).map((s) => s.slotId);

  switch (target) {
    case 'normal':
    case 'adjacentFoe':
    case 'randomNormal':
      return adjacentLivingFoes();
    case 'self':
      return [attackerSlotId];
    case 'allAdjacentFoes':
    case 'foeSide':
      return allLivingFoes();
    case 'adjacentAlly':
      return adjacentLivingAllies();
    case 'adjacentAllyOrSelf':
      return [attackerSlotId, ...adjacentLivingAllies()];
    case 'allAdjacent':
      return [...adjacentLivingFoes(), ...adjacentLivingAllies()];
    case 'any':
      return [attackerSlotId, ...allLivingFoes(), ...allLivingAllies()];
    case 'allies':
      return allLivingAllies();
    case 'allyTeam':
    case 'allySide':
    case 'all':
    case 'scripted':
      return [attackerSlotId];
    default:
      return adjacentLivingFoes();
  }
}
```

- [ ] **Step 4: Run server tests — all must pass**

```
cd packages/server && npm test
```

Expected: all tests pass including the 7 new adjacency cases.

- [ ] **Step 5: Commit**

```
git add packages/server/src/engine/targeting.ts packages/server/src/engine/__tests__/targeting.test.ts
git commit -m "feat(engine): add position-based adjacency filtering to getLegalTargets"
```

---

## Task 2: Update `ActionRequestPayload` shared type

**Files:**
- Modify: `packages/shared/src/types/events.ts`

> **Note:** After this step, TypeScript will report errors in `BattleRoom.ts` and `BattlePage.tsx` wherever `legalTargets` is used at the top level. This is expected — those are fixed in Tasks 3 and 5.

- [ ] **Step 1: Update the type in `events.ts`**

In `packages/shared/src/types/events.ts`, add the `MoveTarget` import and update `ActionRequestPayload`:

Change the import at line 1 from:
```ts
import type { BattleState, PartyMember } from './battle.js';
```
To:
```ts
import type { BattleState, PartyMember } from './battle.js';
import type { MoveTarget } from './pokemon.js';
```

Replace the `ActionRequestPayload` interface:
```ts
export interface ActionRequestPayload {
  slotId: string;
  validMoves: Array<{
    index: 0 | 1 | 2 | 3;
    moveId: string;
    pp: number;
    disabled: boolean;
    targetType: MoveTarget;
    legalTargets: string[];
  }>;
  canSwitch: boolean;
  switchTargets: string[];
  canTerastallize: boolean;
}
```

- [ ] **Step 2: Verify TypeScript catches the right breakages**

```
cd packages/shared && npx tsc --noEmit
cd packages/server && npx tsc --noEmit 2>&1 | grep "legalTargets"
cd packages/client && npx tsc --noEmit 2>&1 | grep "legalTargets"
```

Expected: `packages/shared` compiles clean. `packages/server` and `packages/client` both report errors about `legalTargets` — these are intentional, fixed in Tasks 3 and 5.

- [ ] **Step 3: Commit**

```
git add packages/shared/src/types/events.ts
git commit -m "feat(shared): add targetType and legalTargets per validMove, remove top-level legalTargets"
```

---

## Task 3: Update `BattleRoom` to use per-move targets

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/__tests__/BattleRoom.test.ts`

- [ ] **Step 1: Update the failing `BattleRoom` test first**

In `packages/server/src/socket/__tests__/BattleRoom.test.ts`, find the assertion at line 64 and update it:

```ts
// Before
expect(req!.legalTargets).toContain('slot-b1');

// After
expect(req!.validMoves[0]!.legalTargets).toContain('slot-b1');
expect(req!.validMoves[0]!.targetType).toBeDefined();
```

- [ ] **Step 2: Update `BattleRoom.ts`**

Add the import for `getLegalTargets` near the top of `packages/server/src/socket/BattleRoom.ts`:

```ts
import { getLegalTargets } from '../engine/targeting.js';
```

Replace the `getPendingActionRequest` method's return value. Find the block that builds the return object (around line 132) and replace:

```ts
// Before
return {
  slotId: slot.slotId,
  validMoves: active.moves.map((m, i) => ({
    index: i as 0 | 1 | 2 | 3,
    moveId: m.moveId,
    pp: m.currentPp,
    disabled: false,
  })),
  legalTargets: this.getOpposingSlotIds(slotId),
  canSwitch: slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
  switchTargets: slot.party
    .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
    .map((p) => p.instanceId),
  canTerastallize: !active.hasTerastallized && !!active.teraType,
};

// After
return {
  slotId: slot.slotId,
  validMoves: active.moves.map((m, i) => {
    const moveData = this.data.getMove(m.moveId);
    const targetType = moveData?.target ?? 'normal';
    return {
      index: i as 0 | 1 | 2 | 3,
      moveId: m.moveId,
      pp: m.currentPp,
      disabled: false,
      targetType,
      legalTargets: getLegalTargets(this.state, slotId, targetType),
    };
  }),
  canSwitch: slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
  switchTargets: slot.party
    .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
    .map((p) => p.instanceId),
  canTerastallize: !active.hasTerastallized && !!active.teraType,
};
```

Apply the same `validMoves` mapping change to `buildNpcRequests` — find the block that currently reads:

```ts
validMoves: active.moves.map((m, i) => ({
  index: i as 0 | 1 | 2 | 3,
  moveId: m.moveId,
  pp: m.currentPp,
  disabled: false,
})),
legalTargets: this.getOpposingSlotIds(slot.slotId),
```

Replace with:

```ts
validMoves: active.moves.map((m, i) => {
  const moveData = this.data.getMove(m.moveId);
  const targetType = moveData?.target ?? 'normal';
  return {
    index: i as 0 | 1 | 2 | 3,
    moveId: m.moveId,
    pp: m.currentPp,
    disabled: false,
    targetType,
    legalTargets: getLegalTargets(this.state, slot.slotId, targetType),
  };
}),
```

Apply the same change to `buildPlayerRequests`. Find the block that currently reads:

```ts
validMoves: active.moves.map((m, i) => ({
  index: i as 0 | 1 | 2 | 3,
  moveId: m.moveId,
  pp: m.currentPp,
  disabled: false,
})),
legalTargets: this.getOpposingSlotIds(slot.slotId),
canSwitch: slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
switchTargets: slot.party
  .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
  .map((p) => p.instanceId),
canTerastallize: !active.hasTerastallized && !!active.teraType,
```

Replace with:

```ts
validMoves: active.moves.map((m, i) => {
  const moveData = this.data.getMove(m.moveId);
  const targetType = moveData?.target ?? 'normal';
  return {
    index: i as 0 | 1 | 2 | 3,
    moveId: m.moveId,
    pp: m.currentPp,
    disabled: false,
    targetType,
    legalTargets: getLegalTargets(this.state, slot.slotId, targetType),
  };
}),
canSwitch: slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
switchTargets: slot.party
  .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
  .map((p) => p.instanceId),
canTerastallize: !active.hasTerastallized && !!active.teraType,
```

Delete the `getOpposingSlotIds` private method entirely (it is now unused).

- [ ] **Step 3: Run server tests — all must pass**

```
cd packages/server && npm test
```

Expected: all tests pass. The `BattleRoom` test for `legalTargets` now passes with the updated assertion.

- [ ] **Step 4: Verify server TypeScript**

```
cd packages/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "feat(server): use getLegalTargets per move in action requests, remove getOpposingSlotIds"
```

---

## Task 4: Create client targeting utility

**Files:**
- Create: `packages/client/src/battle/targeting.ts`
- Create: `packages/client/src/battle/__tests__/targeting.test.ts`

- [ ] **Step 1: Write the tests first**

Create `packages/client/src/battle/__tests__/targeting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyTarget, getTargetLabel, formatTargetNames } from '../targeting.js';
import type { BattleState } from '@poke-fighter/shared';

describe('classifyTarget', () => {
  it('choose: normal, any, adjacentFoe, adjacentAlly, adjacentAllyOrSelf', () => {
    expect(classifyTarget('normal')).toBe('choose');
    expect(classifyTarget('any')).toBe('choose');
    expect(classifyTarget('adjacentFoe')).toBe('choose');
    expect(classifyTarget('adjacentAlly')).toBe('choose');
    expect(classifyTarget('adjacentAllyOrSelf')).toBe('choose');
  });

  it('listed: allAdjacentFoes, allAdjacent, allies', () => {
    expect(classifyTarget('allAdjacentFoes')).toBe('listed');
    expect(classifyTarget('allAdjacent')).toBe('listed');
    expect(classifyTarget('allies')).toBe('listed');
  });

  it('labeled: all, allyTeam, allySide, foeSide, randomNormal', () => {
    expect(classifyTarget('all')).toBe('labeled');
    expect(classifyTarget('allyTeam')).toBe('labeled');
    expect(classifyTarget('allySide')).toBe('labeled');
    expect(classifyTarget('foeSide')).toBe('labeled');
    expect(classifyTarget('randomNormal')).toBe('labeled');
  });

  it('auto: self, scripted', () => {
    expect(classifyTarget('self')).toBe('auto');
    expect(classifyTarget('scripted')).toBe('auto');
  });
});

describe('getTargetLabel', () => {
  it('returns correct labels for labeled target types', () => {
    expect(getTargetLabel('all')).toBe('All');
    expect(getTargetLabel('allyTeam')).toBe('Ally team');
    expect(getTargetLabel('allySide')).toBe('Ally side');
    expect(getTargetLabel('foeSide')).toBe('Foe side');
    expect(getTargetLabel('randomNormal')).toBe('Random');
  });
});

describe('formatTargetNames', () => {
  function makeState(slots: Array<{ slotId: string; displayName: string }>): BattleState {
    return {
      battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
      teams: [
        {
          teamId: 'a',
          slots: slots.map((s) => ({
            slotId: s.slotId, displayName: s.displayName, isNpc: false, isSpectator: false,
            party: [{ instanceId: 'p1', speciesId: 6, speciesName: 'charizard', nickname: 'Char',
              level: 50, currentHp: 100, maxHp: 100,
              stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
              ability: 'blaze', moves: [
                { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
                { moveId: 'airslash', currentPp: 15, maxPp: 15 },
                { moveId: 'roost', currentPp: 10, maxPp: 10 },
                { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
              ],
              volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
              hasTerastallized: false, fainted: false, expTotal: 0,
            }],
            activePokemonIndex: 0,
          })),
        },
        { teamId: 'b', slots: [] },
      ],
      field: {
        trickroom: 0, gravity: 0,
        sideConditions: [
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
        ],
      },
    };
  }

  it('returns names joined by comma for ≤ 3 targets', () => {
    const state = makeState([
      { slotId: 's1', displayName: 'Ash' },
      { slotId: 's2', displayName: 'Misty' },
    ]);
    expect(formatTargetNames(['s1', 's2'], state)).toBe('Ash, Misty');
  });

  it('caps at 3 names and appends ellipsis for > 3 targets', () => {
    const state = makeState([
      { slotId: 's1', displayName: 'Ash' },
      { slotId: 's2', displayName: 'Misty' },
      { slotId: 's3', displayName: 'Brock' },
      { slotId: 's4', displayName: 'Gary' },
    ]);
    expect(formatTargetNames(['s1', 's2', 's3', 's4'], state)).toBe('Ash, Misty, Brock…');
  });

  it('returns slotId as fallback when slot not found in state', () => {
    const state = makeState([]);
    expect(formatTargetNames(['unknown-slot'], state)).toBe('unknown-slot');
  });
});
```

- [ ] **Step 2: Run tests to confirm failures**

```
cd packages/client && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|targeting"
```

Expected: all targeting tests fail (module not found).

- [ ] **Step 3: Create `packages/client/src/battle/targeting.ts`**

```ts
import type { MoveTarget, BattleState } from '@poke-fighter/shared';

export type TargetMode = 'choose' | 'listed' | 'labeled' | 'auto';

export function classifyTarget(targetType: MoveTarget): TargetMode {
  switch (targetType) {
    case 'normal':
    case 'any':
    case 'adjacentFoe':
    case 'adjacentAlly':
    case 'adjacentAllyOrSelf':
      return 'choose';
    case 'allAdjacentFoes':
    case 'allAdjacent':
    case 'allies':
      return 'listed';
    case 'all':
    case 'allyTeam':
    case 'allySide':
    case 'foeSide':
    case 'randomNormal':
      return 'labeled';
    case 'self':
    case 'scripted':
      return 'auto';
  }
}

export function getTargetLabel(targetType: MoveTarget): string {
  switch (targetType) {
    case 'all': return 'All';
    case 'allyTeam': return 'Ally team';
    case 'allySide': return 'Ally side';
    case 'foeSide': return 'Foe side';
    case 'randomNormal': return 'Random';
    default: return '';
  }
}

export function getSlotDisplayName(state: BattleState, slotId: string): string {
  for (const team of state.teams) {
    const slot = team.slots.find((s) => s.slotId === slotId);
    if (slot) return slot.displayName;
  }
  return slotId;
}

export function formatTargetNames(legalTargets: string[], state: BattleState): string {
  const names = legalTargets.slice(0, 3).map((id) => getSlotDisplayName(state, id));
  const suffix = legalTargets.length > 3 ? '…' : '';
  return names.join(', ') + suffix;
}
```

- [ ] **Step 4: Run client tests — all must pass**

```
cd packages/client && npm test
```

Expected: all tests pass including the new targeting utility tests.

- [ ] **Step 5: Commit**

```
git add packages/client/src/battle/targeting.ts packages/client/src/battle/__tests__/targeting.test.ts
git commit -m "feat(client): add targeting utility (classifyTarget, getTargetLabel, formatTargetNames)"
```

---

## Task 5: Update `BattlePage` targeting UI

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`

- [ ] **Step 1: Update imports and state declarations**

In `packages/client/src/pages/BattlePage.tsx`, add the new imports at the top:

```ts
import { classifyTarget, getTargetLabel, getSlotDisplayName, formatTargetNames } from '../battle/targeting.js';
import type { ActionRequestPayload } from '@poke-fighter/shared';
```

Inside `BattleView`, replace the state declarations:

```ts
// Remove:
const [targetingMoveIndex, setTargetingMoveIndex] = useState<0 | 1 | 2 | 3 | null>(null);
const [selectedTarget, setSelectedTarget] = useState<string>('');

// Add:
type ValidMove = ActionRequestPayload['validMoves'][number];
const [targetingMove, setTargetingMove] = useState<ValidMove | null>(null);
const [selectedTarget, setSelectedTarget] = useState<string>('');
```

- [ ] **Step 2: Update `useEffect` reset**

Find the effect that resets on `actionRequest` change and update it:

```ts
// Before
useEffect(() => {
  setTargetingMoveIndex(null);
  setSelectedTarget('');
}, [actionRequest]);

// After
useEffect(() => {
  setTargetingMove(null);
  setSelectedTarget('');
}, [actionRequest]);
```

- [ ] **Step 3: Replace `handleMoveSelect`**

```ts
function handleMoveSelect(moveIndex: 0 | 1 | 2 | 3) {
  if (!actionRequest) return;
  const move = actionRequest.validMoves[moveIndex];
  if (!move) return;

  const mode = classifyTarget(move.targetType);

  if (mode === 'auto') {
    submitAction({
      slotId: mySlotId,
      action: {
        type: 'move',
        moveIndex,
        targetSlotId: move.legalTargets[0],
        ...(terastallize ? { terastallize } : {}),
      },
    });
    setTerastallize(false);
    return;
  }

  setTargetingMove(move);
  if (mode === 'choose') {
    setSelectedTarget(move.legalTargets[0] ?? '');
  }
}
```

- [ ] **Step 4: Replace `handleConfirmTarget`**

```ts
function handleConfirmTarget() {
  if (!targetingMove || !actionRequest) return;
  const mode = classifyTarget(targetingMove.targetType);

  submitAction({
    slotId: mySlotId,
    action: {
      type: 'move',
      moveIndex: targetingMove.index,
      ...(mode === 'choose' ? { targetSlotId: selectedTarget } : {}),
      ...(terastallize ? { terastallize } : {}),
    },
  });
  setTargetingMove(null);
  setSelectedTarget('');
  setTerastallize(false);
}
```

- [ ] **Step 5: Replace the targeting strip JSX and remove local `getSlotDisplayName`**

Delete the local `getSlotDisplayName` function (it's now imported from `../battle/targeting.js`).

Find the targeting strip in the JSX (the `{targetingMoveIndex !== null && (...)}` block) and replace it:

```tsx
{targetingMove !== null && (() => {
  const mode = classifyTarget(targetingMove.targetType);
  return (
    <div style={{ marginTop: 8, background: '#0d0d1a', border: '1px solid #3498db', borderRadius: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#aaa', fontSize: 11 }}>
        {mode === 'choose' ? 'Target:' : 'Targets:'}
      </span>
      {mode === 'choose' ? (
        <select
          value={selectedTarget}
          onChange={(e) => setSelectedTarget(e.target.value)}
          style={{ flex: 1, background: '#111', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 }}
        >
          {targetingMove.legalTargets.map((t) => (
            <option key={t} value={t}>{getSlotDisplayName(state, t)}</option>
          ))}
        </select>
      ) : mode === 'listed' ? (
        <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>
          {formatTargetNames(targetingMove.legalTargets, state)}
        </span>
      ) : (
        <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>
          {getTargetLabel(targetingMove.targetType)}
        </span>
      )}
      <button
        onClick={handleConfirmTarget}
        style={{ background: '#2980b9', color: '#fff', border: 'none', padding: '4px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
      >
        Confirm
      </button>
      <button
        onClick={() => { setTargetingMove(null); setSelectedTarget(''); }}
        style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
      >
        ✕
      </button>
    </div>
  );
})()}
```

- [ ] **Step 6: Verify client TypeScript**

```
cd packages/client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run client tests**

```
cd packages/client && npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```
git add packages/client/src/pages/BattlePage.tsx
git commit -m "feat(client): wire per-move targeting UI (choose/listed/labeled/auto modes)"
```

---

## Final Verification

- [ ] **Run all tests across the monorepo**

```
cd packages/shared && npm test
cd packages/server && npm test
cd packages/client && npm test
```

Expected: all green.

- [ ] **Run full TypeScript check**

```
cd packages/shared && npx tsc --noEmit
cd packages/server && npx tsc --noEmit
cd packages/client && npx tsc --noEmit
```

Expected: no errors in any package.
