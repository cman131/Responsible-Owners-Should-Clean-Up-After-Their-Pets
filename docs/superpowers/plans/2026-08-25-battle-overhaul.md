# Battle UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phaser canvas with a React/CSS battle scene showing real Pokémon sprites, fix players never receiving move prompts, and replace the flat admin NPC panel with a per-NPC tabbed view.

**Architecture:** Phaser is removed entirely. A new `BattleScene.tsx` React component renders a CSS gradient background with absolutely-positioned `<img>` elements for sprites from the Pokémon Showdown CDN. A server-side fix re-sends `action:request` to players who join mid-turn. The admin's `NpcActionPanel` becomes `NpcTabPanel` with per-NPC tabs, a VS HP summary, and a target selector.

**Tech Stack:** React 18, TypeScript, Vitest + React Testing Library, Socket.io, Node.js

---

## File Map

**Shared:**
- Modify: `packages/shared/src/types/battle.ts` — add `speciesName: string` to `PartyMember`

**Server:**
- Modify: `packages/server/src/setup/BattleConfigurator.ts` — populate `speciesName` in `buildPartyMember`
- Modify: `packages/server/src/socket/BattleRoom.ts` — add `getPendingActionRequest(slotId)`
- Modify: `packages/server/src/socket/handlers/lobbyHandlers.ts` — re-emit `action:request` on player join
- Modify: `packages/server/src/engine/__tests__/fixtures.ts` — add `speciesName` to `makePokemon`

**Client — new files:**
- Create: `packages/client/src/battle/utils.ts` — `toShowdownId` helper
- Create: `packages/client/src/battle/BattleScene.tsx` — React/CSS battle scene
- Create: `packages/client/src/battle/__tests__/BattleScene.test.tsx`
- Create: `packages/client/src/admin/NpcTabPanel.tsx` — tabbed per-NPC panel
- Create: `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`

**Client — modified:**
- Modify: `packages/client/src/pages/BattlePage.tsx` — new layout
- Modify: `packages/client/src/admin/ControlPanel.tsx` — swap to `NpcTabPanel`
- Modify: `packages/client/src/admin/PokemonSlotEditor.tsx` — import `toShowdownId` from utils

**Client — deleted:**
- Delete: `packages/client/src/battle/BattleCanvas.tsx`
- Delete: `packages/client/src/battle/scenes/FocusedScene.ts`
- Delete: `packages/client/src/battle/scenes/TargetingScene.ts`
- Delete: `packages/client/src/admin/NpcActionPanel.tsx`

---

### Task 1: Add `speciesName` to `PartyMember` (shared type + server + fixtures)

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/server/src/setup/BattleConfigurator.ts`
- Modify: `packages/server/src/engine/__tests__/fixtures.ts`

- [ ] **Step 1: Add `speciesName` to `PartyMember` in shared types**

In `packages/shared/src/types/battle.ts`, add `speciesName` on the line after `speciesId`:

```ts
export interface PartyMember {
  instanceId: string;
  speciesId: number;
  speciesName: string;    // internal PS name, e.g. 'charizard' — used for sprite URLs
  nickname: string;
  level: number;
  // ... rest unchanged
```

- [ ] **Step 2: Populate `speciesName` in `BattleConfigurator`**

In `packages/server/src/setup/BattleConfigurator.ts`, inside `buildPartyMember`, the `species` variable is already available (`const species = this.data.getSpecies(set.speciesId)`). Add `speciesName` to the `member` object:

```ts
const member: PartyMember = {
  instanceId: uuidv4(),
  speciesId: set.speciesId,
  speciesName: species.name,   // <-- add this line
  level: set.level,
  // ... rest unchanged
```

- [ ] **Step 3: Add `speciesName` to the `makePokemon` fixture**

In `packages/server/src/engine/__tests__/fixtures.ts`, add `speciesName: 'charizard'` (the default species is Charizard, id 6):

```ts
export function makePokemon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: uuidv4(),
    speciesId: 6,
    speciesName: 'charizard',   // <-- add this line
    nickname: 'Charizard',
    // ... rest unchanged
```

- [ ] **Step 4: Build shared package and run all server tests**

```
pnpm --filter @poke-fighter/shared build
pnpm --filter @poke-fighter/server test --run
```

Expected: all existing tests pass (TypeScript now requires `speciesName` wherever `PartyMember` is constructed — the fixture covers all server test usages).

- [ ] **Step 5: Commit**

```
git add packages/shared/src/types/battle.ts packages/server/src/setup/BattleConfigurator.ts packages/server/src/engine/__tests__/fixtures.ts
git commit -m "feat(shared): add speciesName to PartyMember, populate in BattleConfigurator"
```

---

### Task 2: Fix `action:request` re-send on player join

**Root cause:** `BattleRoom` sends `action:request` once at turn start via `SocketServer`. Players who join after the turn starts receive `state:sync` but miss the `action:request`. The `BattleRoom` timer then auto-submits move index 0 for them when it fires.

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/handlers/lobbyHandlers.ts`
- Test: `packages/server/src/socket/__tests__/BattleRoom.test.ts`

- [ ] **Step 1: Write a failing test for `getPendingActionRequest`**

Open `packages/server/src/socket/__tests__/BattleRoom.test.ts`. Add a new `describe` block at the end of the file:

```ts
describe('getPendingActionRequest', () => {
  it('returns an action request for a human slot that has not yet submitted', () => {
    const state = make1v1State();
    // make slot-a1 a human slot (not NPC)
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state, timerSeconds: 60 });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req).not.toBeNull();
    expect(req!.slotId).toBe('slot-a1');
    expect(req!.validMoves).toHaveLength(4);
    expect(req!.legalTargets).toContain('slot-b1');
  });

  it('returns null after the slot has submitted an action', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state, timerSeconds: 60 });
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0 });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });

  it('returns null for an NPC slot', () => {
    const state = make1v1State();
    // slot-b1 is NPC by default in make1v1State
    const room = new BattleRoom({ initialState: state, timerSeconds: 60 });
    expect(room.getPendingActionRequest('slot-b1')).toBeNull();
  });

  it('returns null for a fainted slot', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    const room = new BattleRoom({ initialState: state, timerSeconds: 60 });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
pnpm --filter @poke-fighter/server test --run src/socket/__tests__/BattleRoom.test.ts
```

Expected: `getPendingActionRequest is not a function` (or similar — method doesn't exist yet).

- [ ] **Step 3: Add `getPendingActionRequest` to `BattleRoom`**

In `packages/server/src/socket/BattleRoom.ts`, add this public method after `getStateSnapshot()`:

```ts
getPendingActionRequest(slotId: string): ActionRequestPayload | null {
  if (this.pendingActions.has(slotId)) return null;
  const slot = this.findSlot(slotId);
  if (!slot || slot.isNpc || slot.isSpectator) return null;
  const active = slot.party[slot.activePokemonIndex];
  if (!active || active.fainted) return null;
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
    timerSeconds: this.timerSeconds,
  };
}
```

- [ ] **Step 4: Run the BattleRoom tests to confirm they pass**

```
pnpm --filter @poke-fighter/server test --run src/socket/__tests__/BattleRoom.test.ts
```

Expected: all tests pass including the 4 new ones.

- [ ] **Step 5: Update `lobbyHandlers` to re-emit `action:request` on join**

In `packages/server/src/socket/handlers/lobbyHandlers.ts`, after the `socket.emit('state:sync', state)` line, add:

```ts
socket.emit('state:sync', state);

// Re-send action:request if this slot missed it (joined after turn started)
const pending = room.getPendingActionRequest(slotId);
if (pending) socket.emit('action:request', pending);
```

- [ ] **Step 6: Run all server tests**

```
pnpm --filter @poke-fighter/server test --run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/handlers/lobbyHandlers.ts packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "fix(server): re-send action:request to players who join mid-turn"
```

---

### Task 3: Extract `toShowdownId` to `battle/utils.ts`

**Files:**
- Create: `packages/client/src/battle/utils.ts`
- Modify: `packages/client/src/admin/PokemonSlotEditor.tsx`

- [ ] **Step 1: Create `packages/client/src/battle/utils.ts`**

```ts
export function toShowdownId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
```

- [ ] **Step 2: Remove the inline `toShowdownId` from `PokemonSlotEditor.tsx` and import from utils**

In `packages/client/src/admin/PokemonSlotEditor.tsx`:

Remove lines 41–43:
```ts
function toShowdownId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
```

Add to the imports at the top of the file:
```ts
import { toShowdownId } from '../battle/utils.js';
```

- [ ] **Step 3: Run client tests to confirm nothing broke**

```
pnpm --filter @poke-fighter/client test --run
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```
git add packages/client/src/battle/utils.ts packages/client/src/admin/PokemonSlotEditor.tsx
git commit -m "refactor(client): extract toShowdownId to battle/utils.ts"
```

---

### Task 4: Create `BattleScene.tsx`

**Files:**
- Create: `packages/client/src/battle/BattleScene.tsx`
- Create: `packages/client/src/battle/__tests__/BattleScene.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/battle/__tests__/BattleScene.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BattleScene } from '../BattleScene.js';
import type { BattleState, PartyMember, SlotState, TeamState } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1',
    speciesId: 6,
    speciesName: 'charizard',
    nickname: 'Charizard',
    level: 50,
    currentHp: 100,
    maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false,
    fainted: false,
    expTotal: 0,
    ...overrides,
  };
}

function makeSlot(slotId: string, mon: PartyMember, isNpc = false): SlotState {
  return { slotId, displayName: slotId, isNpc, isSpectator: false, party: [mon], activePokemonIndex: 0 };
}

function makeState(mySlotId: string, foeSlotId: string): BattleState {
  const myMon = makeMon({ instanceId: 'my-mon', speciesName: 'bulbasaur' });
  const foeMon = makeMon({ instanceId: 'foe-mon', speciesName: 'charizard' });
  const teamA: TeamState = { teamId: 'team-a', slots: [makeSlot(mySlotId, myMon)] };
  const teamB: TeamState = { teamId: 'team-b', slots: [makeSlot(foeSlotId, foeMon, true)] };
  return {
    battleId: 'test',
    label: 'Test',
    turnNumber: 1,
    phase: 'action',
    teams: [teamA, teamB],
    field: { trickroom: 0, gravity: 0, sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    ]},
    turnTimerSeconds: 60,
  };
}

describe('BattleScene', () => {
  it('renders an img with back-sprite URL for own pokemon', () => {
    const state = makeState('a1', 'b1');
    render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const backSprite = imgs.find((img) => img.src.includes('ani-back') && img.src.includes('bulbasaur'));
    expect(backSprite).toBeTruthy();
  });

  it('renders an img with front-sprite URL for enemy pokemon', () => {
    const state = makeState('a1', 'b1');
    render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const frontSprite = imgs.find((img) => img.src.includes('/sprites/ani/') && !img.src.includes('ani-back') && img.src.includes('charizard'));
    expect(frontSprite).toBeTruthy();
  });

  it('does not render an img for a fainted pokemon', () => {
    const state = makeState('a1', 'b1');
    state.teams[1]!.slots[0]!.party[0]!.fainted = true;
    render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const frontSprite = imgs.find((img) => img.src.includes('charizard') && !img.src.includes('ani-back'));
    expect(frontSprite).toBeFalsy();
  });

  it('renders a placeholder div when speciesName is empty', () => {
    const state = makeState('a1', 'b1');
    state.teams[0]!.slots[0]!.party[0]!.speciesName = '';
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = container.querySelectorAll('img');
    // Only the enemy sprite img should be present; own slot uses a div
    expect(imgs.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm --filter @poke-fighter/client test --run src/battle/__tests__/BattleScene.test.tsx
```

Expected: `BattleScene` module not found.

- [ ] **Step 3: Create `packages/client/src/battle/BattleScene.tsx`**

```tsx
import type { BattleState, SlotState } from '@poke-fighter/shared';
import { toShowdownId } from './utils.js';

interface Props {
  state: BattleState;
  mySlotId: string;
}

export function BattleScene({ state, mySlotId }: Props) {
  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[myTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];

  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const allySlots = myTeam?.slots.filter((s) => s.slotId !== mySlotId && !s.isSpectator) ?? [];
  const foeSlots = foeTeam?.slots.filter((s) => !s.isSpectator) ?? [];

  return (
    <div style={{
      position: 'relative',
      width: 800,
      height: 240,
      background: 'linear-gradient(to bottom, #87ceeb 55%, #5a8a3a 55%)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {mySlot && renderSprite(mySlot, 'own', 0)}
      {allySlots.map((slot, i) => renderSprite(slot, 'ally', i))}
      {foeSlots.map((slot, i) => renderSprite(slot, 'foe', i))}
    </div>
  );
}

function renderSprite(slot: SlotState, role: 'own' | 'ally' | 'foe', index: number) {
  const mon = slot.party[slot.activePokemonIndex];
  if (!mon || mon.fainted) return null;

  const pos: React.CSSProperties = role === 'own'
    ? { bottom: 18, left: 60, width: 72, height: 72 }
    : role === 'ally'
    ? { bottom: 24, left: 155 + index * 60, width: 54, height: 54, opacity: 0.85 }
    : index === 0
    ? { top: 18, right: 60, width: 64, height: 64 }
    : { top: 30, right: 145 + index * 60, width: 50, height: 50, opacity: 0.85 };

  const url = role === 'foe'
    ? `https://play.pokemonshowdown.com/sprites/ani/${toShowdownId(mon.speciesName)}.gif`
    : `https://play.pokemonshowdown.com/sprites/ani-back/${toShowdownId(mon.speciesName)}.gif`;

  return (
    <div
      key={slot.slotId}
      style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', ...pos }}
    >
      {mon.speciesName ? (
        <img
          src={url}
          alt={mon.speciesName}
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          background: role === 'foe' ? '#e74c3c' : '#2980b9',
          borderRadius: 3,
        }} />
      )}
      <span style={{
        fontSize: 8,
        color: role === 'foe' ? '#000' : '#fff',
        textShadow: role === 'foe' ? '0 0 3px #fff' : '0 0 3px #000',
        whiteSpace: 'nowrap',
        marginTop: 2,
      }}>
        {slot.displayName}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run BattleScene tests to confirm they pass**

```
pnpm --filter @poke-fighter/client test --run src/battle/__tests__/BattleScene.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Run all client tests**

```
pnpm --filter @poke-fighter/client test --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/client/src/battle/BattleScene.tsx packages/client/src/battle/__tests__/BattleScene.test.tsx
git commit -m "feat(client): add BattleScene React/CSS component with Showdown sprite support"
```

---

### Task 5: Update `BattlePage.tsx` and remove Phaser files

**Files:**
- Modify: `packages/client/src/pages/BattlePage.tsx`
- Delete: `packages/client/src/battle/BattleCanvas.tsx`
- Delete: `packages/client/src/battle/scenes/FocusedScene.ts`
- Delete: `packages/client/src/battle/scenes/TargetingScene.ts`

- [ ] **Step 1: Write failing tests for the new BattlePage layout**

Create `packages/client/src/pages/__tests__/BattlePage.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn(), connectAsPlayer: vi.fn() }));
import { getSocket } from '../../socket.js';

vi.mock('../../battle/BattleScene.js', () => ({
  BattleScene: ({ state }: { state: unknown }) =>
    <div data-testid="battle-scene" data-state={JSON.stringify(state)} />,
}));

import { BattlePage } from '../BattlePage.js';
import type { BattleState, PartyMember } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 6, speciesName: 'charizard', nickname: 'Charizard',
    level: 50, currentHp: 80, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    ...overrides,
  };
}

function makeState(): BattleState {
  return {
    battleId: 'b1', label: 'Battle 1', turnNumber: 1, phase: 'action',
    teams: [
      { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [makeMon({ instanceId: 'my-mon', speciesName: 'bulbasaur', currentHp: 180, maxHp: 210 })], activePokemonIndex: 0 }] },
      { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'Charizard', isNpc: true, isSpectator: false, party: [makeMon({ instanceId: 'foe-mon', currentHp: 68, maxHp: 194 })], activePokemonIndex: 0 }] },
    ],
    field: { trickroom: 0, gravity: 0, sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    ]},
    turnTimerSeconds: 60,
  };
}

const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
  sessionStorage.setItem('mySlotId', 'a1');
});

function renderBattlePage(battleState: BattleState) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/battle', state: { battleState } }]}>
      <BattlePage />
    </MemoryRouter>
  );
}

describe('BattlePage', () => {
  it('renders the BattleScene component', () => {
    renderBattlePage(makeState());
    expect(screen.getByTestId('battle-scene')).toBeTruthy();
  });

  it('renders enemy HP bar row with enemy slot name', () => {
    renderBattlePage(makeState());
    expect(screen.getByText('Charizard L50')).toBeTruthy();
  });

  it('renders own team HP bar row with own slot name highlighted', () => {
    renderBattlePage(makeState());
    expect(screen.getByText('Alice L50')).toBeTruthy();
    expect(screen.getByText('▶')).toBeTruthy();
  });

  it('shows move panel when action:request arrives for own slot', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    expect(onCall).toBeTruthy();
    onCall![1]({ slotId: 'a1', validMoves: [{ index: 0, moveId: 'tackle', pp: 35, disabled: false }], legalTargets: ['b1'], canSwitch: false, switchTargets: [], canTerastallize: false, timerSeconds: 60 });
    expect(screen.getByText('tackle')).toBeTruthy();
  });

  it('shows target dropdown when move has multiple legal targets', () => {
    renderBattlePage(makeState());
    const onCall = mockSocket.on.mock.calls.find((c) => c[0] === 'action:request');
    onCall![1]({ slotId: 'a1', validMoves: [{ index: 0, moveId: 'tackle', pp: 35, disabled: false }], legalTargets: ['b1', 'b2'], canSwitch: false, switchTargets: [], canTerastallize: false, timerSeconds: 60 });
    fireEvent.click(screen.getByText('tackle'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('shows waiting message when no action request is pending', () => {
    renderBattlePage(makeState());
    expect(screen.getByText('Waiting for others...')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm --filter @poke-fighter/client test --run src/pages/__tests__/BattlePage.test.tsx
```

Expected: multiple failures — component renders Phaser canvas, missing HP rows, etc.

- [ ] **Step 3: Rewrite `packages/client/src/pages/BattlePage.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { BattleScene } from '../battle/BattleScene.js';
import { MovePanel } from '../battle/overlays/MovePanel.js';
import { SwitchPanel } from '../battle/overlays/SwitchPanel.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { ExpBar } from '../battle/overlays/ExpBar.js';
import type { BattleState } from '@poke-fighter/shared';

const MY_SLOT_ID = sessionStorage.getItem('mySlotId') ?? 'a1';

export function BattlePage() {
  const location = useLocation();
  const initialState = (location.state as { battleState?: BattleState } | null)?.battleState ?? null;
  return (
    <BattleProvider mySlotId={MY_SLOT_ID} initialState={initialState}>
      <BattleView />
    </BattleProvider>
  );
}

function hpColor(current: number, max: number): string {
  const pct = current / max;
  if (pct > 0.5) return '#27ae60';
  if (pct > 0.2) return '#f39c12';
  return '#e74c3c';
}

function getSlotDisplayName(state: BattleState, slotId: string): string {
  for (const team of state.teams) {
    const slot = team.slots.find((s) => s.slotId === slotId);
    if (slot) return slot.displayName;
  }
  return slotId;
}

function BattleView() {
  const { state, mySlotId, actionRequest, switchRequest, turnLog, submitAction } = useBattle();
  const [targetingMoveIndex, setTargetingMoveIndex] = useState<0 | 1 | 2 | 3 | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [terastallize, setTerastallize] = useState(false);
  const [showSwitchPanel, setShowSwitchPanel] = useState(false);

  // Reset targeting state when a new action request arrives
  useEffect(() => {
    setTargetingMoveIndex(null);
    setSelectedTarget('');
  }, [actionRequest]);

  if (!state) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#aaa' }}>Waiting for battle to start...</div>;
  }

  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[myTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];
  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const myActiveMon = mySlot?.party[mySlot.activePokemonIndex];
  const switchableParty = mySlot?.party.filter((_, i) => i !== mySlot.activePokemonIndex) ?? [];

  function handleMoveSelect(moveIndex: 0 | 1 | 2 | 3) {
    if (!actionRequest) return;
    const move = actionRequest.validMoves[moveIndex];
    if (!move) return;
    if (actionRequest.legalTargets.length > 1) {
      setTargetingMoveIndex(moveIndex);
      setSelectedTarget(actionRequest.legalTargets[0] ?? '');
    } else {
      const autoTarget = actionRequest.legalTargets[0];
      submitAction({
        slotId: mySlotId,
        action: {
          type: 'move',
          moveIndex,
          ...(autoTarget !== undefined ? { targetSlotId: autoTarget } : {}),
          ...(terastallize ? { terastallize } : {}),
        },
      });
      setTerastallize(false);
    }
  }

  function handleConfirmTarget() {
    if (targetingMoveIndex === null || !actionRequest) return;
    submitAction({
      slotId: mySlotId,
      action: {
        type: 'move',
        moveIndex: targetingMoveIndex,
        targetSlotId: selectedTarget,
        ...(terastallize ? { terastallize } : {}),
      },
    });
    setTargetingMoveIndex(null);
    setTerastallize(false);
  }

  function handleSwitch(instanceId: string) {
    submitAction({ slotId: mySlotId, action: { type: 'switch', targetInstanceId: instanceId } });
    setShowSwitchPanel(false);
  }

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 12, letterSpacing: 2 }}>{state.label} — Turn {state.turnNumber}</div>

      {/* Enemy HP bars */}
      <div style={{ width: 800, background: '#0d0d1a', border: '1px solid #555', borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ color: '#e74c3c', fontSize: 9, letterSpacing: 1 }}>ENEMY</span>
        {foeTeam?.slots.filter((s) => !s.isSpectator).map((slot) => {
          const mon = slot.party[slot.activePokemonIndex];
          return (
            <div key={slot.slotId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#fff', fontSize: 10, width: 130 }}>{slot.displayName}{mon ? ` L${mon.level}` : ''}</span>
              {mon && !mon.fainted ? (
                <>
                  <div style={{ flex: 1, background: '#333', height: 6, borderRadius: 3 }}>
                    <div style={{ background: hpColor(mon.currentHp, mon.maxHp), height: 6, borderRadius: 3, width: `${(mon.currentHp / mon.maxHp) * 100}%` }} />
                  </div>
                  <span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
                </>
              ) : (
                <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Battle scene */}
      <BattleScene state={state} mySlotId={mySlotId} />

      {/* Own team HP bars */}
      <div style={{ width: 800, background: '#0d0d1a', border: '1px solid #2980b9', borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ color: '#3498db', fontSize: 9, letterSpacing: 1 }}>MY TEAM</span>
        {myTeam?.slots.filter((s) => !s.isSpectator).map((slot) => {
          const mon = slot.party[slot.activePokemonIndex];
          const isSelf = slot.slotId === mySlotId;
          return (
            <div key={slot.slotId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isSelf ? '#0d1a2e' : 'transparent', borderRadius: 2, padding: '2px 4px' }}>
              <span style={{ color: '#f0c040', fontSize: 10, width: 14 }}>{isSelf ? '▶' : ''}</span>
              <span style={{ color: isSelf ? '#fff' : '#aaa', fontSize: 10, width: 130 }}>{slot.displayName}{mon ? ` L${mon.level}` : ''}</span>
              {mon && !mon.fainted ? (
                <>
                  <div style={{ flex: 1, background: '#333', height: 6, borderRadius: 3 }}>
                    <div style={{ background: hpColor(mon.currentHp, mon.maxHp), height: 6, borderRadius: 3, width: `${(mon.currentHp / mon.maxHp) * 100}%` }} />
                  </div>
                  <span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
                </>
              ) : (
                <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
              )}
            </div>
          );
        })}
      </div>

      {myActiveMon && <ExpBar instanceId={myActiveMon.instanceId} />}

      {/* Bottom row: action panel + turn log */}
      <div style={{ display: 'flex', gap: 16, width: 800 }}>
        <div style={{ flex: 1 }}>
          {(switchRequest !== null || showSwitchPanel) ? (
            <SwitchPanel
              party={switchableParty}
              onSwitch={handleSwitch}
              label={switchRequest !== null ? 'YOUR POKÉMON FAINTED — CHOOSE NEXT' : 'CHOOSE POKÉMON'}
              {...(switchRequest === null ? { onCancel: () => setShowSwitchPanel(false) } : {})}
            />
          ) : actionRequest && !mySlot?.isSpectator ? (
            <>
              <MovePanel
                request={actionRequest}
                onSelectMove={handleMoveSelect}
                onSwitchRequested={() => setShowSwitchPanel(true)}
              />
              {targetingMoveIndex !== null && (
                <div style={{ marginTop: 8, background: '#0d0d1a', border: '1px solid #3498db', borderRadius: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#aaa', fontSize: 11 }}>Target:</span>
                  <select
                    value={selectedTarget}
                    onChange={(e) => setSelectedTarget(e.target.value)}
                    style={{ flex: 1, background: '#111', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 }}
                  >
                    {actionRequest.legalTargets.map((t) => (
                      <option key={t} value={t}>{getSlotDisplayName(state, t)}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleConfirmTarget}
                    style={{ background: '#2980b9', color: '#fff', border: 'none', padding: '4px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setTargetingMoveIndex(null)}
                    style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              )}
              {actionRequest.canTerastallize && (
                <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 }}>
                  <label style={{ color: '#aaa', fontSize: 11 }}>
                    <input type="checkbox" checked={terastallize} onChange={(e) => setTerastallize(e.target.checked)} style={{ marginRight: 6 }} />
                    Terastallize this turn
                  </label>
                </div>
              )}
            </>
          ) : mySlot?.isSpectator ? (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Watching...</div>
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Waiting for others...</div>
          )}
        </div>
        <div style={{ width: 300 }}>
          <TurnLog messages={turnLog} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run BattlePage tests to confirm they pass**

```
pnpm --filter @poke-fighter/client test --run src/pages/__tests__/BattlePage.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Delete Phaser files**

```
git rm packages/client/src/battle/BattleCanvas.tsx
git rm packages/client/src/battle/scenes/FocusedScene.ts
git rm packages/client/src/battle/scenes/TargetingScene.ts
```

- [ ] **Step 6: Run all client tests**

```
pnpm --filter @poke-fighter/client test --run
```

Expected: all tests pass (no imports of the deleted files remain).

- [ ] **Step 7: Commit**

```
git add packages/client/src/pages/BattlePage.tsx packages/client/src/pages/__tests__/BattlePage.test.tsx
git commit -m "feat(client): replace Phaser canvas with React BattleScene, add HP bar rows and inline targeting"
```

---

### Task 6: Create `NpcTabPanel.tsx`

**Files:**
- Create: `packages/client/src/admin/NpcTabPanel.tsx`
- Create: `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
import { getSocket } from '../../socket.js';
import { NpcTabPanel } from '../NpcTabPanel.js';
import type { BattleState, ActionRequestPayload } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn() };
beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

const makeRequest = (slotId: string, legalTargets: string[]): ActionRequestPayload => ({
  slotId,
  validMoves: [
    { index: 0, moveId: 'surf', pp: 15, disabled: false },
    { index: 1, moveId: 'icebeam', pp: 10, disabled: false },
    { index: 2, moveId: 'blizzard', pp: 5, disabled: false },
    { index: 3, moveId: 'flash', pp: 20, disabled: false },
  ],
  legalTargets,
  canSwitch: false,
  switchTargets: [],
  canTerastallize: false,
  timerSeconds: 60,
});

const npcRequests = [
  { slotId: 'b1', displayName: 'Blastoise', request: makeRequest('b1', ['a1']) },
  { slotId: 'b2', displayName: 'Snorlax', request: makeRequest('b2', ['a1']) },
];

const state: BattleState = {
  battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
  teams: [
    { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [{ instanceId: 'p1', speciesId: 25, speciesName: 'pikachu', nickname: 'Pikachu', level: 50, currentHp: 134, maxHp: 150, stats: { hp: 150, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ability: 'static', moves: [{ moveId: 'thunderbolt', currentPp: 15, maxPp: 15 }, { moveId: 'quickattack', currentPp: 30, maxPp: 30 }, { moveId: 'ironjaw', currentPp: 15, maxPp: 15 }, { moveId: 'charm', currentPp: 20, maxPp: 20 }], volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }, hasTerastallized: false, fainted: false, expTotal: 0 }], activePokemonIndex: 0 }] },
    { teamId: 'team-b', slots: [
      { slotId: 'b1', displayName: 'Blastoise', isNpc: true, isSpectator: false, party: [{ instanceId: 'p2', speciesId: 9, speciesName: 'blastoise', nickname: 'Blastoise', level: 52, currentHp: 160, maxHp: 200, stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ability: 'torrent', moves: [{ moveId: 'surf', currentPp: 15, maxPp: 15 }, { moveId: 'icebeam', currentPp: 10, maxPp: 10 }, { moveId: 'blizzard', currentPp: 5, maxPp: 5 }, { moveId: 'flash', currentPp: 20, maxPp: 20 }], volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }, hasTerastallized: false, fainted: false, expTotal: 0 }], activePokemonIndex: 0 },
      { slotId: 'b2', displayName: 'Snorlax', isNpc: true, isSpectator: false, party: [{ instanceId: 'p3', speciesId: 143, speciesName: 'snorlax', nickname: 'Snorlax', level: 50, currentHp: 300, maxHp: 400, stats: { hp: 400, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ability: 'immunity', moves: [{ moveId: 'bodyslam', currentPp: 15, maxPp: 15 }, { moveId: 'earthquake', currentPp: 10, maxPp: 10 }, { moveId: 'crunch', currentPp: 15, maxPp: 15 }, { moveId: 'rest', currentPp: 10, maxPp: 10 }], volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 }, hasTerastallized: false, fainted: false, expTotal: 0 }], activePokemonIndex: 0 },
    ]},
  ],
  field: { trickroom: 0, gravity: 0, sideConditions: [
    { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
  ]},
  turnTimerSeconds: 60,
};

describe('NpcTabPanel', () => {
  it('renders one tab per NPC request', () => {
    render(<NpcTabPanel battleId="test" npcRequests={npcRequests} state={state} />);
    expect(screen.getByText('Blastoise')).toBeTruthy();
    expect(screen.getByText('Snorlax')).toBeTruthy();
  });

  it('shows move buttons for the active tab', () => {
    render(<NpcTabPanel battleId="test" npcRequests={npcRequests} state={state} />);
    expect(screen.getByText('surf')).toBeTruthy();
    expect(screen.getByText('icebeam')).toBeTruthy();
  });

  it('emits npc-action and marks tab as submitted on single-target move click', () => {
    render(<NpcTabPanel battleId="test" npcRequests={npcRequests} state={state} />);
    fireEvent.click(screen.getByText('surf'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'npc-action',
      data: { battleId: 'test', slotId: 'b1', action: { type: 'move', moveIndex: 0, targetSlotId: 'a1' } },
    });
    expect(screen.getByText('Blastoise ✓')).toBeTruthy();
  });

  it('shows target dropdown for multi-target moves', () => {
    const multiTargetRequests = [
      { slotId: 'b1', displayName: 'Blastoise', request: makeRequest('b1', ['a1', 'a2']) },
    ];
    render(<NpcTabPanel battleId="test" npcRequests={multiTargetRequests} state={state} />);
    fireEvent.click(screen.getByText('surf'));
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.queryByText('Blastoise ✓')).toBeFalsy(); // not yet submitted
  });

  it('submits after selecting target and clicking Confirm', () => {
    const multiTargetRequests = [
      { slotId: 'b1', displayName: 'Blastoise', request: makeRequest('b1', ['a1', 'a2']) },
    ];
    render(<NpcTabPanel battleId="test" npcRequests={multiTargetRequests} state={state} />);
    fireEvent.click(screen.getByText('surf'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'npc-action',
      data: expect.objectContaining({ slotId: 'b1', action: expect.objectContaining({ type: 'move', moveIndex: 0 }) }),
    }));
    expect(screen.getByText('Blastoise ✓')).toBeTruthy();
  });

  it('returns null when npcRequests is empty', () => {
    const { container } = render(<NpcTabPanel battleId="test" npcRequests={[]} state={state} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm --filter @poke-fighter/client test --run src/admin/__tests__/NpcTabPanel.test.tsx
```

Expected: `NpcTabPanel` module not found.

- [ ] **Step 3: Create `packages/client/src/admin/NpcTabPanel.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { ActionRequestPayload, BattleState } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props {
  battleId: string;
  npcRequests: NpcSlotRequest[];
  state: BattleState | null;
}

export function NpcTabPanel({ battleId, npcRequests, state }: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [pendingMove, setPendingMove] = useState<{ slotId: string; moveIndex: 0 | 1 | 2 | 3 } | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>('');

  useEffect(() => {
    setSubmitted(new Set());
    setPendingMove(null);
    setSelectedTarget('');
    if (npcRequests.length > 0) setActiveTab(npcRequests[0]!.slotId);
  }, [npcRequests]);

  function getDisplayName(slotId: string): string {
    if (!state) return slotId;
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot.displayName;
    }
    return slotId;
  }

  function getActiveMon(slotId: string) {
    if (!state) return null;
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot.party[slot.activePokemonIndex] ?? null;
    }
    return null;
  }

  function submitNpcAction(slotId: string, moveIndex: 0 | 1 | 2 | 3, targetSlotId?: string) {
    const action = targetSlotId
      ? { type: 'move' as const, moveIndex, targetSlotId }
      : { type: 'move' as const, moveIndex };
    getSocket().emit('admin:action', { type: 'npc-action', data: { battleId, slotId, action } });
    setSubmitted((prev) => new Set([...prev, slotId]));
    setPendingMove(null);
    setSelectedTarget('');
  }

  function handleMoveClick(slotId: string, moveIndex: 0 | 1 | 2 | 3, legalTargets: string[]) {
    if (legalTargets.length === 1) {
      submitNpcAction(slotId, moveIndex, legalTargets[0]);
    } else {
      setPendingMove({ slotId, moveIndex });
      setSelectedTarget(legalTargets[0] ?? '');
    }
  }

  if (npcRequests.length === 0) return null;

  const activeRequest = npcRequests.find((r) => r.slotId === activeTab);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>NPC ACTIONS — {submitted.size}/{npcRequests.length} submitted</div>

      <div style={styles.tabStrip}>
        {npcRequests.map((r) => (
          <button
            key={r.slotId}
            onClick={() => setActiveTab(r.slotId)}
            style={{
              ...styles.tab,
              background: activeTab === r.slotId ? '#e74c3c' : '#1a1a2e',
              color: submitted.has(r.slotId) ? '#555' : activeTab === r.slotId ? '#fff' : '#aaa',
              borderColor: activeTab === r.slotId ? '#e74c3c' : '#333',
            }}
          >
            {r.displayName}{submitted.has(r.slotId) ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {activeRequest && (
        <div style={styles.tabBody}>
          {/* VS summary */}
          <div style={styles.vsSummary}>
            {activeRequest.request.legalTargets.map((targetSlotId) => {
              const mon = getActiveMon(targetSlotId);
              const pct = mon && !mon.fainted ? mon.currentHp / mon.maxHp : 0;
              const barColor = pct > 0.5 ? '#27ae60' : pct > 0.2 ? '#f39c12' : '#e74c3c';
              return (
                <div key={targetSlotId} style={styles.vsRow}>
                  <span style={{ color: '#e74c3c', fontSize: 9, width: 18 }}>VS</span>
                  <span style={{ color: '#fff', fontSize: 10, flex: 1 }}>{getDisplayName(targetSlotId)}</span>
                  {mon && !mon.fainted ? (
                    <>
                      <div style={{ width: 80, background: '#333', height: 4, borderRadius: 2 }}>
                        <div style={{ background: barColor, height: 4, borderRadius: 2, width: `${pct * 100}%` }} />
                      </div>
                      <span style={{ color: '#aaa', fontSize: 9, width: 50, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
                    </>
                  ) : (
                    <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Move grid */}
          <div style={styles.moveGrid}>
            {activeRequest.request.validMoves.map((mv) => {
              const done = submitted.has(activeRequest.slotId);
              const disabled = mv.disabled || mv.pp === 0 || done;
              return (
                <button
                  key={mv.index}
                  disabled={disabled}
                  onClick={() => handleMoveClick(activeRequest.slotId, mv.index, activeRequest.request.legalTargets)}
                  style={{ ...styles.moveBtn, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
                >
                  <span style={{ textTransform: 'capitalize', fontSize: 11 }}>{mv.moveId}</span>
                  <span style={{ color: '#aaa', fontSize: 10 }}>PP {mv.pp}</span>
                </button>
              );
            })}
          </div>

          {/* Target selector — multi-target only */}
          {pendingMove?.slotId === activeRequest.slotId && (
            <div style={styles.targetRow}>
              <span style={{ color: '#aaa', fontSize: 10 }}>Target:</span>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                style={styles.targetSelect}
              >
                {activeRequest.request.legalTargets.map((t) => (
                  <option key={t} value={t}>{getDisplayName(t)}</option>
                ))}
              </select>
              <button
                onClick={() => submitNpcAction(activeRequest.slotId, pendingMove.moveIndex, selectedTarget)}
                style={styles.confirmBtn}
              >
                Confirm
              </button>
              <button onClick={() => setPendingMove(null)} style={styles.cancelBtn}>✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  panel: { background: '#0d0d1a', border: '2px solid #e74c3c', borderRadius: 6, padding: 12 },
  header: { color: '#e74c3c', fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  tabStrip: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' as const },
  tab: { border: '1px solid #333', borderRadius: '3px 3px 0 0', padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  tabBody: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  vsSummary: { display: 'flex', flexDirection: 'column' as const, gap: 4, background: '#111', borderRadius: 3, padding: '4px 8px' },
  vsRow: { display: 'flex', alignItems: 'center', gap: 6 },
  moveGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 },
  moveBtn: { background: '#1a1a2e', border: '1px solid #e74c3c', color: '#fff', padding: '5px 8px', borderRadius: 3, fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  targetRow: { display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #333', paddingTop: 8 },
  targetSelect: { flex: 1, background: '#111', border: '1px solid #555', color: '#fff', padding: '3px 6px', borderRadius: 3, fontFamily: 'inherit', fontSize: 11 },
  confirmBtn: { background: '#e74c3c', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  cancelBtn: { background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
};
```

- [ ] **Step 4: Run NpcTabPanel tests**

```
pnpm --filter @poke-fighter/client test --run src/admin/__tests__/NpcTabPanel.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Run all client tests**

```
pnpm --filter @poke-fighter/client test --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/client/src/admin/NpcTabPanel.tsx packages/client/src/admin/__tests__/NpcTabPanel.test.tsx
git commit -m "feat(admin): add NpcTabPanel with per-NPC tabs, VS HP summary, and target selector"
```

---

### Task 7: Wire `NpcTabPanel` into `ControlPanel` and remove `NpcActionPanel`

**Files:**
- Modify: `packages/client/src/admin/ControlPanel.tsx`
- Delete: `packages/client/src/admin/NpcActionPanel.tsx`

- [ ] **Step 1: Update `ControlPanel.tsx` to use `NpcTabPanel`**

In `packages/client/src/admin/ControlPanel.tsx`:

Replace the import line:
```ts
import { NpcActionPanel } from './NpcActionPanel.js';
```
with:
```ts
import { NpcTabPanel } from './NpcTabPanel.js';
```

In `ControlPanelInner`, destructure `state` from `useBattle()`:
```ts
const { state, turnLog } = useBattle();
```

In the JSX, replace:
```tsx
<NpcActionPanel battleId={battleId} npcRequests={npcRequests} />
```
with:
```tsx
<NpcTabPanel battleId={battleId} npcRequests={npcRequests} state={state} />
```

- [ ] **Step 2: Delete `NpcActionPanel.tsx`**

```
git rm packages/client/src/admin/NpcActionPanel.tsx
```

- [ ] **Step 3: Run all client tests**

```
pnpm --filter @poke-fighter/client test --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add packages/client/src/admin/ControlPanel.tsx
git commit -m "feat(admin): wire NpcTabPanel into ControlPanel, remove NpcActionPanel"
```
