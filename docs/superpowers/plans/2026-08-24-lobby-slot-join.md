# Lobby Slot Join + Admin Waiting Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text player join flow with a battle-picker + slot-dropdown, and replace the static "Battle Started!" screen with a live player join roster.

**Architecture:** Players claim pre-configured slots by slotId rather than typing names; the server pushes available battles on connect and slot-status updates to admins after each join/disconnect. The admin waiting screen subscribes to these pushes and renders joined/waiting state per slot.

**Tech Stack:** Socket.io typed events, React hooks, Vitest + React Testing Library

---

## File Map

| Action | Path |
|--------|------|
| MODIFY | `packages/shared/src/types/events.ts` |
| MODIFY | `packages/server/src/socket/handlers/lobbyHandlers.ts` |
| MODIFY | `packages/server/src/socket/handlers/adminHandlers.ts` |
| MODIFY | `packages/server/src/socket/SocketServer.ts` |
| NEW    | `packages/server/src/socket/__tests__/lobbyHandlers.test.ts` |
| MODIFY | `packages/client/src/admin/SetupPanel.tsx` |
| MODIFY | `packages/client/src/admin/AdminRouter.tsx` |
| NEW    | `packages/client/src/admin/BattleWaitingScreen.tsx` |
| NEW    | `packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx` |
| MODIFY | `packages/client/src/admin/__tests__/SetupPanel.test.tsx` |
| MODIFY | `packages/client/src/pages/LobbyPage.tsx` |
| MODIFY | `packages/client/src/__tests__/LobbyPage.test.tsx` |

---

### Task 1: Update shared types

**Files:**
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Add new interfaces and update existing ones**

Replace the contents of `packages/shared/src/types/events.ts` — keep every existing interface, apply these changes:

```ts
// Replace PlayerJoinPayload
export interface PlayerJoinPayload {
  battleId: string;
  slotId: string;
}

// Replace LobbyErrorPayload code union
export interface LobbyErrorPayload {
  code: 'NAME_TAKEN' | 'BATTLE_FULL' | 'INVALID_NAME' | 'BATTLE_NOT_FOUND' | 'SLOT_TAKEN';
  message: string;
}

// Add after BattleSummary:
export interface BattleJoinOption {
  battleId: string;
  label: string;
  slots: Array<{ slotId: string; displayName: string }>;
}

export interface SlotStatusPayload {
  battleId: string;
  slots: Array<{ slotId: string; displayName: string; joined: boolean }>;
}

// In AdminActionPayload.type union, add:
| 'lobby:slot-status'

// In ServerToClientEvents, add two new events:
'lobby:battles': (payload: { battles: BattleJoinOption[] }) => void;
'lobby:slot-status': (payload: SlotStatusPayload) => void;

// In ClientToServerEvents, the 'player:join' already references PlayerJoinPayload
// — no change needed there, the type change propagates automatically.
```

The full resulting file:

```ts
import type { BattleState, PartyMember } from './battle.js';

// ── Client → Server ──────────────────────────────────────────────────────────

export interface PlayerJoinPayload {
  battleId: string;
  slotId: string;
}

export interface MoveAction {
  type: 'move';
  moveIndex: 0 | 1 | 2 | 3;
  targetSlotId?: string;
  terastallize?: boolean;
}

export interface SwitchAction {
  type: 'switch';
  targetInstanceId: string;
}

export interface ActionSubmitPayload {
  slotId: string;
  action: MoveAction | SwitchAction;
}

export interface SwitchSubmitPayload {
  slotId: string;
  targetInstanceId: string;
}

export interface AdminActionPayload {
  type:
    | 'npc-action'
    | 'pause'
    | 'unpause'
    | 'force-faint'
    | 'forfeit'
    | 'force-switch'
    | 'lobby:list'
    | 'lobby:slot-status'
    | 'battles:list'
    | 'battles:connect'
    | 'registry:list'
    | 'registry:save-player'
    | 'registry:delete-player'
    | 'registry:save-npc'
    | 'registry:delete-npc'
    | 'registry:save-team'
    | 'registry:delete-team'
    | 'start-battle'
    | 'data:query';
  data: Record<string, unknown>;
}

// ── Server → Client ──────────────────────────────────────────────────────────

export interface BattleStartPayload {
  state: BattleState;
}

export interface TurnStartPayload {
  turnNumber: number;
  state: BattleState;
}

export interface ActionRequestPayload {
  slotId: string;
  validMoves: Array<{ index: 0 | 1 | 2 | 3; moveId: string; pp: number; disabled: boolean }>;
  legalTargets: string[];
  canSwitch: boolean;
  switchTargets: string[];
  canTerastallize: boolean;
  timerSeconds: number;
}

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

export interface TurnResolvePayload {
  turnNumber: number;
  events: TurnResolveEvent[];
  state: BattleState;
}

export interface SwitchRequestPayload {
  slotId: string;
  party: PartyMember[];
  reason: 'faint' | 'forced';
}

export interface ExpAwardPayload {
  awards: Array<{ instanceId: string; amount: number; newTotal: number }>;
}

export interface LevelUpPayload {
  instanceId: string;
  newLevel: number;
  newStats: import('./pokemon.js').Stats;
}

export interface BattleEndPayload {
  winningTeamId: string;
  state: BattleState;
}

export interface LobbyErrorPayload {
  code: 'NAME_TAKEN' | 'BATTLE_FULL' | 'INVALID_NAME' | 'BATTLE_NOT_FOUND' | 'SLOT_TAKEN';
  message: string;
}

export interface BattleSummary {
  battleId: string;
  label: string;
  status: 'active' | 'ended';
  winningTeamId: string | null;
  startedAt: number;
  endedAt: number | null;
  turnNumber: number;
  teams: Array<{
    slots: Array<{ displayName: string; isNpc: boolean }>;
  }>;
}

export interface BattleJoinOption {
  battleId: string;
  label: string;
  slots: Array<{ slotId: string; displayName: string }>;
}

export interface SlotStatusPayload {
  battleId: string;
  slots: Array<{ slotId: string; displayName: string; joined: boolean }>;
}

// ── Event map (used to type Socket.io) ───────────────────────────────────────

export interface ServerToClientEvents {
  'battle:start': (payload: BattleStartPayload) => void;
  'turn:start': (payload: TurnStartPayload) => void;
  'action:request': (payload: ActionRequestPayload) => void;
  'turn:resolve': (payload: TurnResolvePayload) => void;
  'switch:request': (payload: SwitchRequestPayload) => void;
  'exp:award': (payload: ExpAwardPayload) => void;
  'level:up': (payload: LevelUpPayload) => void;
  'battle:end': (payload: BattleEndPayload) => void;
  'lobby:error': (payload: LobbyErrorPayload) => void;
  'state:sync': (state: BattleState) => void;
  'registry:data': (payload: { resource: string; data: unknown[] }) => void;
  'data:results': (payload: { resource: string; results: unknown[] }) => void;
  'lobby:players': (players: string[]) => void;
  'lobby:battles': (payload: { battles: BattleJoinOption[] }) => void;
  'lobby:slot-status': (payload: SlotStatusPayload) => void;
  'battles:data': (payload: { battles: BattleSummary[] }) => void;
  'admin:authenticated': () => void;
  'admin:error': (payload: { message: string }) => void;
  'npc:action-request': (payload: {
    battleId: string;
    slots: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }>;
  }) => void;
}

export interface ClientToServerEvents {
  'player:join': (payload: PlayerJoinPayload) => void;
  'action:submit': (payload: ActionSubmitPayload) => void;
  'switch:submit': (payload: SwitchSubmitPayload) => void;
  'admin:action': (payload: AdminActionPayload) => void;
}
```

- [ ] **Step 2: Build shared package**

```bash
cd packages/shared && pnpm build
```

Expected: `dist/` files regenerated, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat(shared): add BattleJoinOption, SlotStatusPayload, lobby:battles/slot-status events"
```

---

### Task 2: Rewrite lobbyHandlers.ts (TDD)

**Files:**
- Create: `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`
- Modify: `packages/server/src/socket/handlers/lobbyHandlers.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock types matching the subset of Socket.io and domain types we need
interface MockSocket {
  id: string;
  data: Record<string, unknown>;
  emit: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

function makeSocket(id = 'sock1'): MockSocket {
  const handlers: Record<string, (p: unknown) => void> = {};
  return {
    id,
    data: {},
    emit: vi.fn(),
    join: vi.fn(),
    on: (event, handler) => { handlers[event] = handler; },
    trigger(event: string, payload: unknown) {
      handlers[event]?.(payload);
    },
  } as MockSocket & { trigger(e: string, p: unknown): void };
}

function makeLobby() {
  return {
    registerPlayer: vi.fn(),
    getBySlotId: vi.fn(),
    getBySocketId: vi.fn(),
    markDisconnected: vi.fn(),
    getWaitingPlayers: vi.fn(() => []),
    getByName: vi.fn(),
  };
}

function makeRoom(slotOverrides: object[] = []) {
  const defaultSlot = {
    slotId: 'slot-a1',
    displayName: 'Conor',
    isNpc: false,
    isSpectator: false,
  };
  return {
    getStateSnapshot: vi.fn(() => ({
      battleId: 'battle-1',
      label: 'Test Battle',
      teams: [
        { teamId: 'team-a', slots: [{ ...defaultSlot, ...slotOverrides[0] }] },
        { teamId: 'team-b', slots: [{ slotId: 'slot-b1', displayName: 'Kyle', isNpc: false, isSpectator: false, ...slotOverrides[1] }] },
      ],
    })),
  };
}

import { registerLobbyHandlers } from '../handlers/lobbyHandlers.js';

describe('registerLobbyHandlers – player:join', () => {
  let socket: ReturnType<typeof makeSocket> & { trigger(e: string, p: unknown): void };
  let lobby: ReturnType<typeof makeLobby>;
  let room: ReturnType<typeof makeRoom>;
  let notifyAdmins: ReturnType<typeof vi.fn>;
  let notifyAdminsOfSlotStatus: ReturnType<typeof vi.fn>;
  let notifyPlayersOfBattles: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    socket = makeSocket() as any;
    lobby = makeLobby();
    room = makeRoom();
    notifyAdmins = vi.fn();
    notifyAdminsOfSlotStatus = vi.fn();
    notifyPlayersOfBattles = vi.fn();
    registerLobbyHandlers(
      socket as any,
      lobby as any,
      (id) => (id === 'battle-1' ? (room as any) : undefined),
      notifyAdmins,
      notifyAdminsOfSlotStatus,
      notifyPlayersOfBattles,
    );
  });

  it('emits BATTLE_NOT_FOUND when battle does not exist', () => {
    socket.trigger('player:join', { battleId: 'no-such-battle', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', {
      code: 'BATTLE_NOT_FOUND',
      message: expect.any(String),
    });
  });

  it('emits lobby:error when slot does not exist in the battle', () => {
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'nonexistent-slot' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', expect.objectContaining({ code: expect.any(String) }));
  });

  it('emits lobby:error when slot is NPC', () => {
    room = makeRoom([{ isNpc: true }]);
    registerLobbyHandlers(socket as any, lobby as any, (id) => (id === 'battle-1' ? (room as any) : undefined), notifyAdmins, notifyAdminsOfSlotStatus, notifyPlayersOfBattles);
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', expect.objectContaining({ code: expect.any(String) }));
  });

  it('emits SLOT_TAKEN when an active player holds the slot', () => {
    lobby.getBySlotId.mockReturnValue({ socketId: 'other-sock', displayName: 'Conor', disconnectedAt: undefined });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('lobby:error', {
      code: 'SLOT_TAKEN',
      message: expect.any(String),
    });
  });

  it('allows join when slot is held only by a disconnected player', () => {
    lobby.getBySlotId.mockReturnValue({ socketId: 'other-sock', displayName: 'Conor', disconnectedAt: Date.now() - 1000 });
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).not.toHaveBeenCalledWith('lobby:error', expect.anything());
  });

  it('registers the player using slot displayName and sets battleId/battleSlotId', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    const player = { displayName: 'Conor', battleId: null as string | null, battleSlotId: null as string | null };
    lobby.registerPlayer.mockReturnValue({ ok: true, player });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(lobby.registerPlayer).toHaveBeenCalledWith('sock1', 'Conor');
    expect(player.battleId).toBe('battle-1');
    expect(player.battleSlotId).toBe('slot-a1');
  });

  it('joins the battle room socket channel', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.join).toHaveBeenCalledWith('battle:battle-1');
  });

  it('sets socket.data.battleId', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.data['battleId']).toBe('battle-1');
  });

  it('emits state:sync after joining', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(socket.emit).toHaveBeenCalledWith('state:sync', expect.objectContaining({ battleId: 'battle-1' }));
  });

  it('calls notifyAdminsOfSlotStatus and notifyPlayersOfBattles on success', () => {
    lobby.getBySlotId.mockReturnValue(undefined);
    lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
    socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
    expect(notifyAdminsOfSlotStatus).toHaveBeenCalledWith('battle-1');
    expect(notifyPlayersOfBattles).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd packages/server && pnpm test src/socket/__tests__/lobbyHandlers.test.ts
```

Expected: FAIL (handler still has old signature / old logic).

- [ ] **Step 3: Rewrite lobbyHandlers.ts**

```ts
import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PlayerJoinPayload } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';
import type { BattleRoom } from '../BattleRoom.js';

export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager,
  getRoom: (battleId: string) => BattleRoom | undefined,
  notifyAdmins: () => void,
  notifyAdminsOfSlotStatus: (battleId: string) => void,
  notifyPlayersOfBattles: () => void,
): void {
  socket.on('player:join', (payload: PlayerJoinPayload) => {
    const { battleId, slotId } = payload;

    const room = getRoom(battleId);
    if (!room) {
      socket.emit('lobby:error', { code: 'BATTLE_NOT_FOUND', message: 'Battle not found or has ended.' });
      return;
    }

    const state = room.getStateSnapshot();
    const slot = state.teams.flatMap((t) => t.slots).find((s) => s.slotId === slotId);
    if (!slot || slot.isNpc || slot.isSpectator) {
      socket.emit('lobby:error', { code: 'BATTLE_NOT_FOUND', message: 'Slot not available.' });
      return;
    }

    const existing = lobby.getBySlotId(slotId);
    if (existing && existing.disconnectedAt === undefined) {
      socket.emit('lobby:error', { code: 'SLOT_TAKEN', message: 'That slot is already taken.' });
      return;
    }

    const result = lobby.registerPlayer(socket.id, slot.displayName);
    if (!result.ok) {
      socket.emit('lobby:error', { code: result.code, message: result.message });
      return;
    }

    const player = result.player;
    player.battleSlotId = slotId;
    player.battleId = battleId;
    socket.data['battleId'] = battleId;

    socket.join(`battle:${battleId}`);
    socket.emit('state:sync', room.getStateSnapshot());

    notifyAdminsOfSlotStatus(battleId);
    notifyPlayersOfBattles();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/server && pnpm test src/socket/__tests__/lobbyHandlers.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/__tests__/lobbyHandlers.test.ts \
        packages/server/src/socket/handlers/lobbyHandlers.ts
git commit -m "feat(server): rewrite lobbyHandlers to join by battleId+slotId"
```

---

### Task 3: Add lobby:slot-status to adminHandlers.ts

**Files:**
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`

The existing test file (`packages/server/src/socket/__tests__/adminHandlers.test.ts`) only tests pure helper functions (`pokemonMatchesQuery`, `moveMatchesQuery`), not the socket handler itself — consistent with the codebase pattern. No new test file needed.

- [ ] **Step 1: Add the new case to the switch statement**

In `packages/server/src/socket/handlers/adminHandlers.ts`, add before `case 'force-switch':`:

```ts
case 'lobby:slot-status': {
  const { battleId } = payload.data as { battleId: string };
  const room = getRoom(battleId);
  if (!room) break;
  const state = room.getStateSnapshot();
  const slots = state.teams
    .flatMap((t) => t.slots)
    .filter((s) => !s.isNpc && !s.isSpectator)
    .map((s) => ({
      slotId: s.slotId,
      displayName: s.displayName,
      joined: !!lobby.getBySlotId(s.slotId),
    }));
  socket.emit('lobby:slot-status', { battleId, slots });
  break;
}
```

- [ ] **Step 2: Run the existing server tests to confirm nothing is broken**

```bash
cd packages/server && pnpm test
```

Expected: all existing tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/socket/handlers/adminHandlers.ts
git commit -m "feat(server): add lobby:slot-status admin action handler"
```

---

### Task 4: Update SocketServer.ts

**Files:**
- Modify: `packages/server/src/socket/SocketServer.ts`

- [ ] **Step 1: Add three new private helpers**

After the `private notifyAdminsOfBattles(): void` method, add:

```ts
private getBattleJoinOptions(): import('@poke-fighter/shared').BattleJoinOption[] {
  const options: import('@poke-fighter/shared').BattleJoinOption[] = [];
  for (const [battleId, room] of this.rooms) {
    const state = room.getStateSnapshot();
    const available = state.teams
      .flatMap((t) => t.slots)
      .filter((s) => !s.isNpc && !s.isSpectator && !this.lobby.getBySlotId(s.slotId));
    if (available.length > 0) {
      options.push({
        battleId,
        label: state.label,
        slots: available.map((s) => ({ slotId: s.slotId, displayName: s.displayName })),
      });
    }
  }
  return options;
}

private notifyPlayersOfBattles(): void {
  const battles = this.getBattleJoinOptions();
  for (const s of this.io.sockets.sockets.values()) {
    if (!s.data['isAdmin'] && !s.data['battleId']) {
      s.emit('lobby:battles', { battles });
    }
  }
}

private notifyAdminsOfSlotStatus(battleId: string): void {
  const room = this.rooms.get(battleId);
  if (!room) return;
  const state = room.getStateSnapshot();
  const slots = state.teams
    .flatMap((t) => t.slots)
    .filter((s) => !s.isNpc && !s.isSpectator)
    .map((s) => ({
      slotId: s.slotId,
      displayName: s.displayName,
      joined: !!this.lobby.getBySlotId(s.slotId),
    }));
  for (const s of this.io.sockets.sockets.values()) {
    if (s.data['isAdmin']) s.emit('lobby:slot-status', { battleId, slots });
  }
}
```

- [ ] **Step 2: Update the registerLobbyHandlers call**

Change line (currently 4-arg call):
```ts
registerLobbyHandlers(socket, this.lobby, (id) => this.rooms.get(id), notifyAdminsOfLobby);
```
To:
```ts
registerLobbyHandlers(
  socket,
  this.lobby,
  (id) => this.rooms.get(id),
  notifyAdminsOfLobby,
  this.notifyAdminsOfSlotStatus.bind(this),
  this.notifyPlayersOfBattles.bind(this),
);
```

- [ ] **Step 3: Push battles to new non-admin connections**

After the `registerLobbyHandlers(...)` call and before the `if (socket.data['isAdmin'])` block, add:

```ts
if (!socket.data['isAdmin']) {
  this.notifyPlayersOfBattles();
}
```

Wait — this should only run for non-admin sockets (before the admin check). Place it right before `if (socket.data['isAdmin'])`:

```ts
// Push current battle list immediately to new non-admin connections
if (!socket.data['isAdmin']) {
  // Send only to this socket (it just connected, others already have the list)
  const battles = this.getBattleJoinOptions();
  socket.emit('lobby:battles', { battles });
}
```

- [ ] **Step 4: Update the disconnect handler**

Replace the current disconnect handler:
```ts
socket.on('disconnect', () => {
  const player = this.lobby.getBySocketId(socket.id);
  if (player) {
    console.log(`Disconnected: ${player.displayName}`);
    this.lobby.markDisconnected(socket.id);
  }
});
```

With:
```ts
socket.on('disconnect', () => {
  const player = this.lobby.getBySocketId(socket.id);
  if (player) {
    const { battleId } = player;
    console.log(`Disconnected: ${player.displayName}`);
    this.lobby.markDisconnected(socket.id);
    if (battleId) {
      this.notifyAdminsOfSlotStatus(battleId);
    }
    this.notifyPlayersOfBattles();
  }
});
```

- [ ] **Step 5: Also call notifyPlayersOfBattles after a battle ends**

In `room.onBattleEnd(...)`, add `this.notifyPlayersOfBattles()` after `this.rooms.delete(...)`:

```ts
room.onBattleEnd((winningTeamId, finalState) => {
  this.io.to(`battle:${initialState.battleId}`).emit('battle:end', { winningTeamId, state: finalState });
  this.db.battles.markEnded(initialState.battleId, winningTeamId);
  this.rooms.delete(initialState.battleId);
  this.notifyAdminsOfBattles();
  this.notifyPlayersOfBattles();  // battle gone → remove from join list
});
```

- [ ] **Step 6: TypeScript check**

```bash
cd packages/server && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/socket/SocketServer.ts
git commit -m "feat(server): add notifyPlayersOfBattles and notifyAdminsOfSlotStatus helpers"
```

---

### Task 5: Create BattleWaitingScreen.tsx

**Files:**
- Create: `packages/client/src/admin/BattleWaitingScreen.tsx`
- Create: `packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture event handlers registered on the socket mock
let socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    socketHandlers[event] = handler;
  }),
  off: vi.fn(),
};

vi.mock('../../socket.js', () => ({
  getSocket: vi.fn(() => mockSocket),
}));

import { BattleWaitingScreen } from '../BattleWaitingScreen.js';

const slotAssignment = {
  teamA: [{ slotId: 'slot-a1', displayName: 'Conor', type: 'player' as const }],
  teamB: [{ slotId: 'slot-b1', displayName: 'Ash NPC', type: 'npc' as const }],
};

describe('BattleWaitingScreen', () => {
  beforeEach(() => {
    socketHandlers = {};
    mockSocket.emit.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
  });

  it('renders team sections with player names', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText('Conor')).toBeTruthy();
    expect(screen.getByText('Ash NPC')).toBeTruthy();
  });

  it('requests slot status on mount', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', {
      type: 'lobby:slot-status',
      data: { battleId: 'battle-1' },
    });
  });

  it('shows Waiting for player slots by default', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText(/waiting/i)).toBeTruthy();
  });

  it('shows Joined indicator after lobby:slot-status event marks slot joined', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );

    act(() => {
      socketHandlers['lobby:slot-status']?.({
        battleId: 'battle-1',
        slots: [{ slotId: 'slot-a1', displayName: 'Conor', joined: true }],
      });
    });

    expect(screen.getByText(/joined/i)).toBeTruthy();
  });

  it('ignores slot-status events for other battles', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );

    act(() => {
      socketHandlers['lobby:slot-status']?.({
        battleId: 'battle-DIFFERENT',
        slots: [{ slotId: 'slot-a1', displayName: 'Conor', joined: true }],
      });
    });

    expect(screen.queryByText(/joined/i)).toBeFalsy();
  });

  it('shows NPC label for NPC slots', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText(/npc/i)).toBeTruthy();
  });

  it('shows the connected count', () => {
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    expect(screen.getByText(/0\s*\/\s*1/)).toBeTruthy();
  });

  it('calls onWatch with battleId when WATCH BATTLE is clicked', () => {
    const onWatch = vi.fn();
    render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={onWatch}
      />
    );
    screen.getByRole('button', { name: /watch/i }).click();
    expect(onWatch).toHaveBeenCalledWith('battle-1');
  });

  it('removes lobby:slot-status listener on unmount', () => {
    const { unmount } = render(
      <BattleWaitingScreen
        battleId="battle-1"
        slotAssignment={slotAssignment}
        onBack={vi.fn()}
        onWatch={vi.fn()}
      />
    );
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('lobby:slot-status', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd packages/client && pnpm test src/admin/__tests__/BattleWaitingScreen.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create BattleWaitingScreen.tsx**

```tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { SlotStatusPayload } from '@poke-fighter/shared';

interface SlotConfig {
  slotId: string;
  displayName: string;
  type: 'player' | 'npc';
}

interface Props {
  battleId: string;
  slotAssignment: { teamA: SlotConfig[]; teamB: SlotConfig[] };
  onBack: () => void;
  onWatch: (battleId: string) => void;
}

export function BattleWaitingScreen({ battleId, slotAssignment, onBack, onWatch }: Props) {
  const [joinedSlots, setJoinedSlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    const socket = getSocket();

    socket.emit('admin:action', { type: 'lobby:slot-status', data: { battleId } } as any);

    function handleSlotStatus(payload: SlotStatusPayload) {
      if (payload.battleId !== battleId) return;
      setJoinedSlots(new Set(payload.slots.filter((s) => s.joined).map((s) => s.slotId)));
    }

    socket.on('lobby:slot-status', handleSlotStatus);
    return () => {
      socket.off('lobby:slot-status', handleSlotStatus);
    };
  }, [battleId]);

  const allPlayerSlots = [
    ...slotAssignment.teamA.filter((s) => s.type === 'player'),
    ...slotAssignment.teamB.filter((s) => s.type === 'player'),
  ];
  const joinedCount = allPlayerSlots.filter((s) => joinedSlots.has(s.slotId)).length;
  const totalCount = allPlayerSlots.length;

  function renderSlotRow(slot: SlotConfig) {
    if (slot.type === 'npc') {
      return (
        <div key={slot.slotId} style={styles.slotRow}>
          <div style={{ ...styles.dot, background: '#555' }} />
          <div style={styles.slotName}>{slot.displayName}</div>
          <div style={styles.npcLabel}>🤖 NPC</div>
        </div>
      );
    }
    const joined = joinedSlots.has(slot.slotId);
    return (
      <div
        key={slot.slotId}
        style={{ ...styles.slotRow, background: joined ? '#0d1a12' : '#111', borderColor: joined ? '#27ae60' : '#444' }}
      >
        <div style={{ ...styles.dot, background: joined ? '#27ae60' : '#444' }} />
        <div style={{ ...styles.slotName, color: joined ? '#fff' : '#888' }}>{slot.displayName}</div>
        <div style={joined ? styles.joinedLabel : styles.waitingLabel}>
          {joined ? '● Joined' : '○ Waiting...'}
        </div>
      </div>
    );
  }

  function renderTeam(label: string, slots: SlotConfig[]) {
    return (
      <div style={styles.teamSection}>
        <div style={styles.teamLabel}>{label}</div>
        {slots.map(renderSlotRow)}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>← HUB</button>
        <div style={styles.headerTitle}>BATTLE SETUP</div>
        <span style={styles.headerStatus}>Battle Started!</span>
      </div>

      <div style={styles.body}>
        <div style={styles.subtitle}>Waiting for players to connect...</div>
        {renderTeam('Team A', slotAssignment.teamA)}
        <div style={styles.divider} />
        {renderTeam('Team B', slotAssignment.teamB)}
      </div>

      <div style={styles.footer}>
        <div style={styles.countText}>{joinedCount} / {totalCount} players connected</div>
        <button onClick={() => onWatch(battleId)} style={styles.watchButton}>WATCH BATTLE →</button>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, minHeight: '100vh', background: '#0d0d1a' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #222' },
  backButton: { background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10 },
  headerTitle: { color: '#e74c3c', fontSize: 14, letterSpacing: 3, fontWeight: 'bold' as const },
  headerStatus: { color: '#aaa', fontSize: 11 },
  body: { flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  subtitle: { color: '#555', fontSize: 11, marginBottom: 8 },
  teamSection: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  teamLabel: { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 4 },
  slotRow: { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #444', borderRadius: 4, padding: '10px 14px' },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  slotName: { fontSize: 13, flex: 1 },
  joinedLabel: { color: '#27ae60', fontSize: 11 },
  waitingLabel: { color: '#555', fontSize: 11 },
  npcLabel: { color: '#3498db', fontSize: 11 },
  divider: { borderTop: '1px solid #1a1a2e', margin: '4px 0' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #222' },
  countText: { color: '#aaa', fontSize: 11 },
  watchButton: { background: '#27ae60', color: '#000', border: 'none', padding: '5px 14px', fontSize: 11, letterSpacing: 2, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/client && pnpm test src/admin/__tests__/BattleWaitingScreen.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/BattleWaitingScreen.tsx \
        packages/client/src/admin/__tests__/BattleWaitingScreen.test.tsx
git commit -m "feat(admin): add BattleWaitingScreen with live slot join status"
```

---

### Task 6: Update SetupPanel.tsx and AdminRouter.tsx

**Files:**
- Modify: `packages/client/src/admin/SetupPanel.tsx`
- Modify: `packages/client/src/admin/AdminRouter.tsx`
- Modify: `packages/client/src/admin/__tests__/SetupPanel.test.tsx`

- [ ] **Step 1: Update SetupPanel.tsx**

The full replacement of `packages/client/src/admin/SetupPanel.tsx`:

```tsx
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamStructureStep } from './steps/TeamStructureStep.js';
import { SlotAssignmentStep } from './steps/SlotAssignmentStep.js';
import { TeamBuilderStep } from './steps/TeamBuilderStep.js';
import { BattleSettingsStep } from './steps/BattleSettingsStep.js';
import { BattleWaitingScreen } from './BattleWaitingScreen.js';

type Step = 'structure' | 'assignment' | 'teams' | 'settings' | 'started';

interface SlotConfig {
  slotId: string;
  displayName: string;
  type: 'player' | 'npc';
}

interface SetupPanelProps {
  onBack: () => void;
  onWatch: (battleId: string) => void;
}

export function SetupPanel({ onBack, onWatch }: SetupPanelProps) {
  const [step, setStep] = useState<Step>('structure');
  const [structure, setStructure] = useState({ teamASlots: 1, teamBSlots: 1 });
  const [slotAssignment, setSlotAssignment] = useState<{ teamA: any[]; teamB: any[] } | null>(null);
  const [slotTeams, setSlotTeams] = useState<any[]>([]);
  const [battleId, setBattleId] = useState<string | null>(null);

  function handleStructureNext(config: { teamASlots: number; teamBSlots: number }) {
    setStructure(config);
    setStep('assignment');
  }

  function handleAssignmentNext(slots: { teamA: any[]; teamB: any[] }) {
    setSlotAssignment(slots);
    setStep('teams');
  }

  function handleTeamsNext(st: any[]) {
    setSlotTeams(st);
    setStep('settings');
  }

  function handleStart({ label, timerSeconds }: { label: string; timerSeconds: number }) {
    const socket = getSocket();
    const id = uuidv4();
    setBattleId(id);

    function buildSlotsWithTeams(slots: any[]) {
      return slots.map((slot: any) => {
        const teamData = slotTeams.find((st) => st.slotId === slot.slotId);
        return {
          slotId: slot.slotId,
          displayName: slot.displayName,
          isNpc: slot.type === 'npc',
          party: teamData?.team ?? [],
        };
      });
    }

    socket.emit('admin:action', {
      type: 'start-battle',
      data: {
        battleId: id,
        label,
        turnTimerSeconds: timerSeconds,
        teams: [
          { slots: buildSlotsWithTeams(slotAssignment!.teamA) },
          { slots: buildSlotsWithTeams(slotAssignment!.teamB) },
        ],
      },
    } as any);
    setStep('started');
  }

  if (step === 'started' && battleId && slotAssignment) {
    return (
      <BattleWaitingScreen
        battleId={battleId}
        slotAssignment={slotAssignment as { teamA: SlotConfig[]; teamB: SlotConfig[] }}
        onBack={onBack}
        onWatch={onWatch}
      />
    );
  }

  const stepTitles = {
    structure: '1 / 4 — Structure',
    assignment: '2 / 4 — Assign Slots',
    teams: '3 / 4 — Build Teams',
    settings: '4 / 4 — Settings',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>← HUB</button>
          <h1 style={{ color: '#e74c3c', letterSpacing: 4 }}>BATTLE SETUP</h1>
          <span style={{ color: '#aaa', fontSize: 12 }}>{stepTitles[step as keyof typeof stepTitles]}</span>
        </div>
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 8 }}>
          {step === 'structure' && <TeamStructureStep onNext={handleStructureNext} />}
          {step === 'assignment' && (
            <SlotAssignmentStep
              teamASlots={structure.teamASlots}
              teamBSlots={structure.teamBSlots}
              onNext={handleAssignmentNext}
              onBack={() => setStep('structure')}
            />
          )}
          {step === 'teams' && slotAssignment && (
            <TeamBuilderStep
              slots={slotAssignment}
              onNext={handleTeamsNext}
              onBack={() => setStep('assignment')}
            />
          )}
          {step === 'settings' && (
            <BattleSettingsStep
              onStart={handleStart}
              onBack={() => setStep('teams')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update AdminRouter.tsx to pass onWatch**

In `packages/client/src/admin/AdminRouter.tsx`, change:
```tsx
if (mode === 'setup') return <SetupPanel onBack={() => setMode(null)} />;
```
To:
```tsx
if (mode === 'setup') return <SetupPanel onBack={() => setMode(null)} onWatch={handleWatch} />;
```

- [ ] **Step 3: Update SetupPanel.test.tsx**

The existing test renders `<SetupPanel onBack={onBack} />` — this now needs `onWatch` too. Replace the test file:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../socket.js', () => ({
  getSocket: vi.fn(() => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() })),
}));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }));

import { SetupPanel } from '../SetupPanel.js';

describe('SetupPanel', () => {
  it('renders a back-to-hub button and calls onBack when clicked', () => {
    const onBack = vi.fn();
    render(<SetupPanel onBack={onBack} onWatch={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /hub/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run client tests**

```bash
cd packages/client && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/admin/SetupPanel.tsx \
        packages/client/src/admin/AdminRouter.tsx \
        packages/client/src/admin/__tests__/SetupPanel.test.tsx
git commit -m "feat(admin): wire BattleWaitingScreen into SetupPanel, pass onWatch from AdminRouter"
```

---

### Task 7: Redesign LobbyPage.tsx

**Files:**
- Modify: `packages/client/src/pages/LobbyPage.tsx`
- Modify: `packages/client/src/__tests__/LobbyPage.test.tsx`

- [ ] **Step 1: Rewrite LobbyPage tests first**

Replace `packages/client/src/__tests__/LobbyPage.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

let socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    socketHandlers[event] = handler;
  }),
  off: vi.fn(),
};

vi.mock('../socket.js', () => ({
  getSocket: vi.fn(() => mockSocket),
}));

import { LobbyPage } from '../pages/LobbyPage.js';

const mockBattles = [
  {
    battleId: 'battle-1',
    label: 'Friday Night Brawl',
    slots: [
      { slotId: 'slot-a1', displayName: 'Conor' },
      { slotId: 'slot-b1', displayName: 'Kyle' },
    ],
  },
];

describe('LobbyPage', () => {
  beforeEach(() => {
    socketHandlers = {};
    mockSocket.emit.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
  });

  it('shows empty state when no battles are available', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: [] });
    });
    expect(screen.getByText(/no active battles/i)).toBeTruthy();
  });

  it('renders a battle card for each available battle', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    expect(screen.getByText('Friday Night Brawl')).toBeTruthy();
  });

  it('shows slot count on battle card', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    expect(screen.getByText(/2 slots/i)).toBeTruthy();
  });

  it('shows slot dropdown after selecting a battle', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('JOIN BATTLE button is disabled until both battle and slot are selected', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    const btn = screen.getByRole('button', { name: /join battle/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('emits player:join with battleId and slotId on submit', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('player:join', {
      battleId: 'battle-1',
      slotId: 'slot-a1',
    });
  });

  it('shows waiting screen after joining', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    expect(screen.getByText(/waiting/i)).toBeTruthy();
  });

  it('shows display name in waiting screen derived from selected slot', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    expect(screen.getByText(/conor/i)).toBeTruthy();
  });

  it('shows error and stays in browse phase on lobby:error', () => {
    render(<MemoryRouter><LobbyPage /></MemoryRouter>);
    act(() => {
      socketHandlers['lobby:battles']?.({ battles: mockBattles });
    });
    fireEvent.click(screen.getByText('Friday Night Brawl'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slot-a1' } });
    fireEvent.click(screen.getByRole('button', { name: /join battle/i }));
    act(() => {
      socketHandlers['lobby:error']?.({ code: 'SLOT_TAKEN', message: 'That slot is already taken.' });
    });
    expect(screen.getByText(/already taken/i)).toBeTruthy();
    expect(screen.queryByText(/waiting/i)).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd packages/client && pnpm test src/__tests__/LobbyPage.test.tsx
```

Expected: FAIL (current LobbyPage renders text-input form, not battle list).

- [ ] **Step 3: Rewrite LobbyPage.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../socket.js';
import type { LobbyErrorPayload, BattleJoinOption, BattleState, SlotStatusPayload } from '@poke-fighter/shared';

type Phase = 'browse' | 'waiting';

export function LobbyPage() {
  const [phase, setPhase] = useState<Phase>('browse');
  const [battles, setBattles] = useState<BattleJoinOption[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinedDisplayName, setJoinedDisplayName] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    const socket = getSocket();

    socket.on('lobby:battles', (payload: { battles: BattleJoinOption[] }) => {
      setBattles(payload.battles);
    });

    socket.on('lobby:error', (payload: LobbyErrorPayload) => {
      setError(payload.message);
      setPhase('browse');
    });

    socket.on('state:sync', (_state: BattleState) => {
      if (phase === 'waiting') {
        navigate('/battle');
      }
    });

    return () => {
      socket.off('lobby:battles');
      socket.off('lobby:error');
      socket.off('state:sync');
    };
  }, [navigate, phase]);

  function handleJoin() {
    if (!selectedBattleId || !selectedSlotId) return;

    const battle = battles.find((b) => b.battleId === selectedBattleId);
    const slot = battle?.slots.find((s) => s.slotId === selectedSlotId);
    if (!slot) return;

    setError(null);
    setJoinedDisplayName(slot.displayName);
    sessionStorage.setItem('mySlotId', selectedSlotId);
    getSocket().emit('player:join', { battleId: selectedBattleId, slotId: selectedSlotId });
    setPhase('waiting');
  }

  if (phase === 'waiting') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <p style={styles.waiting}>Welcome, <strong>{joinedDisplayName}</strong>!</p>
          <p style={styles.subtitle}>Waiting for the battle to begin...</p>
          <div style={styles.spinner}>■ ■ ■</div>
        </div>
      </div>
    );
  }

  const selectedBattle = battles.find((b) => b.battleId === selectedBattleId) ?? null;
  const canJoin = selectedBattleId !== null && selectedSlotId !== null;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>POKE FIGHTER</h1>
      <div style={styles.box}>
        <div style={styles.sectionLabel}>Select Battle</div>

        {battles.length === 0 ? (
          <p style={styles.emptyText}>No active battles yet. Check with your admin.</p>
        ) : (
          battles.map((b) => (
            <div
              key={b.battleId}
              onClick={() => { setSelectedBattleId(b.battleId); setSelectedSlotId(null); }}
              style={{
                ...styles.battleCard,
                borderColor: selectedBattleId === b.battleId ? '#27ae60' : '#333',
                background: selectedBattleId === b.battleId ? '#0d1a12' : '#111',
              }}
            >
              <div style={styles.battleLabel}>{b.label}</div>
              <div style={styles.slotCount}>{b.slots.length} slot{b.slots.length !== 1 ? 's' : ''} available</div>
            </div>
          ))
        )}

        {selectedBattle && (
          <div style={styles.slotSection}>
            <div style={styles.sectionLabel}>You are...</div>
            <select
              style={styles.select}
              value={selectedSlotId ?? ''}
              onChange={(e) => setSelectedSlotId(e.target.value || null)}
            >
              <option value="">— pick your slot —</option>
              {selectedBattle.slots.map((s) => (
                <option key={s.slotId} value={s.slotId}>{s.displayName}</option>
              ))}
            </select>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.button, opacity: canJoin ? 1 : 0.5 }}
          disabled={!canJoin}
          onClick={handleJoin}
        >
          JOIN BATTLE
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 48, letterSpacing: 8, color: '#f0c040' },
  box: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 14, minWidth: 320, maxWidth: 400 },
  sectionLabel: { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const },
  emptyText: { color: '#555', fontSize: 13 },
  battleCard: { border: '2px solid #333', borderRadius: 6, padding: '12px 14px', cursor: 'pointer' },
  battleLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' as const },
  slotCount: { color: '#aaa', fontSize: 11, marginTop: 3 },
  slotSection: { display: 'flex', flexDirection: 'column' as const, gap: 10, borderTop: '1px solid #222', paddingTop: 14 },
  select: { width: '100%', padding: 8, background: '#1a1a2e', color: '#fff', border: '1px solid #3498db', borderRadius: 4, fontFamily: 'inherit' },
  error: { color: '#e74c3c', fontSize: 12 },
  button: { background: '#2980b9', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
  waiting: { color: '#fff', fontSize: 18 },
  subtitle: { color: '#aaa', fontSize: 14 },
  spinner: { color: '#3498db', fontSize: 24, textAlign: 'center' as const },
};
```

- [ ] **Step 4: Run the new tests**

```bash
cd packages/client && pnpm test src/__tests__/LobbyPage.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run full client test suite**

```bash
cd packages/client && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/LobbyPage.tsx \
        packages/client/src/__tests__/LobbyPage.test.tsx
git commit -m "feat(client): redesign LobbyPage with battle picker and slot dropdown"
```

---

### Task 8: Final verification

**Files:** none — verification only

- [ ] **Step 1: Build shared package (ensure types are fresh)**

```bash
cd packages/shared && pnpm build
```

- [ ] **Step 2: TypeScript check all packages**

```bash
cd packages/server && pnpm tsc --noEmit
cd packages/client && pnpm tsc --noEmit
```

Expected: no errors in either package.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test --filter @poke-fighter/server
pnpm test --filter @poke-fighter/client
```

Expected: all tests pass. Note the count — if it drops from 190 (baseline before this feature), investigate.

- [ ] **Step 4: Commit if any adjustments were needed**

If you had to make any fixes in this task, commit them:

```bash
git add -p
git commit -m "fix: resolve TypeScript or test issues from final verification"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `PlayerJoinPayload` changed to `{ battleId, slotId }` — Task 1
- ✅ `BattleJoinOption` and `SlotStatusPayload` types added — Task 1
- ✅ `'BATTLE_NOT_FOUND'` and `'SLOT_TAKEN'` error codes added — Task 1
- ✅ `lobby:battles` and `lobby:slot-status` server→client events — Task 1
- ✅ `lobby:slot-status` AdminActionPayload type — Task 1
- ✅ `player:join` handler rewrite: battle lookup, slot lookup, SLOT_TAKEN check, registerPlayer, set battleSlotId/battleId, join room, state:sync, notify callbacks — Task 2
- ✅ `lobby:slot-status` admin action handler — Task 3
- ✅ `getBattleJoinOptions()`, `notifyPlayersOfBattles()`, `notifyAdminsOfSlotStatus()` — Task 4
- ✅ Push battles on non-admin connect — Task 4
- ✅ Updated disconnect handler — Task 4
- ✅ `notifyPlayersOfBattles()` after battle ends — Task 4
- ✅ `BattleWaitingScreen` component with live slot status — Task 5
- ✅ `SetupPanel` lifts battleId to state, renders `BattleWaitingScreen` — Task 6
- ✅ `AdminRouter` passes `onWatch` to `SetupPanel` — Task 6
- ✅ `LobbyPage` browse/waiting phases, battle list, slot dropdown — Task 7
- ✅ `state:sync` navigation in waiting phase — Task 7
- ✅ `sessionStorage.setItem('mySlotId', selectedSlotId)` before emit — Task 7

**What does not change per spec:**
- `LobbyManager.ts` — untouched ✅
- `BattleRoom.ts` — untouched ✅
- `SlotAssignmentStep.tsx` — untouched ✅
- `ControlPanel.tsx`, `BattlesPanel.tsx`, `HubPanel.tsx` — untouched ✅
