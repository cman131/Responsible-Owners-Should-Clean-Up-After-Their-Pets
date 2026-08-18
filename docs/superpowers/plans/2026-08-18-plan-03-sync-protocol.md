# Plan 03: Real-time Battle Sync Protocol (F6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the battle engine (Plan 02) to a Socket.io server. Implement room management, player connection lifecycle, action collection per turn, turn timer, full-state snapshots for reconnecting clients, and admin authentication.

**Architecture:** A single Node.js HTTP + Socket.io server. One Socket.io room per active battle (`battle:<battleId>`). A `BattleRoom` class owns a `BattleState` and `BattleEngine` instance, collects actions, runs the timer, and broadcasts events. All server state is in-memory (no persistence of active battle state — only the registry is persisted, handled in Plan 04).

**Tech Stack:** Node.js, `socket.io` v4, `@poke-fighter/shared` (event types), `BattleEngine` from Plan 02, `vitest` (testing).

**Prerequisite:** Plans 01 and 02 complete.

---

## File Structure

```
packages/server/src/
├── index.ts                       # entry point — creates HTTP + Socket.io server
├── socket/
│   ├── SocketServer.ts            # Socket.io server setup, namespace, middleware
│   ├── LobbyManager.ts            # tracks connected players, assigns to battles
│   ├── BattleRoom.ts              # owns BattleState, collects actions, drives turns
│   ├── handlers/
│   │   ├── lobbyHandlers.ts       # player:join event handler
│   │   ├── battleHandlers.ts      # action:submit, switch:submit handlers
│   │   └── adminHandlers.ts       # admin:action handler
│   └── __tests__/
│       ├── LobbyManager.test.ts
│       └── BattleRoom.test.ts
```

---

## Task 1: Server Entry Point

**Files:**
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Create packages/server/src/index.ts**

```typescript
import { createServer } from 'node:http';
import { config } from 'dotenv';
import { SocketServer } from './socket/SocketServer.js';

config(); // load .env

const PORT = Number(process.env['PORT'] ?? 3000);
const ADMIN_TOKEN = process.env['ADMIN_TOKEN'] ?? '';

if (!ADMIN_TOKEN) {
  console.error('ADMIN_TOKEN not set in .env — admin features will be disabled');
}

const httpServer = createServer();
const socketServer = new SocketServer(httpServer, { adminToken: ADMIN_TOKEN });

httpServer.listen(PORT, () => {
  console.log(`Poke Fighter server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Create .env from .env.example**

```bash
copy .env.example .env
```

Set a real value for `ADMIN_TOKEN` in the new `.env`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): HTTP server entry point with dotenv config"
```

---

## Task 2: Lobby Manager

**Files:**
- Create: `packages/server/src/socket/LobbyManager.ts`
- Create: `packages/server/src/socket/__tests__/LobbyManager.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/server/src/socket/__tests__/LobbyManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../LobbyManager.js';

describe('LobbyManager', () => {
  let lobby: LobbyManager;

  beforeEach(() => { lobby = new LobbyManager(); });

  it('registers a player and returns their record', () => {
    const result = lobby.registerPlayer('socket-1', 'Alice');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.player.displayName).toBe('Alice');
  });

  it('rejects duplicate display names', () => {
    lobby.registerPlayer('socket-1', 'Alice');
    const result = lobby.registerPlayer('socket-2', 'Alice');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NAME_TAKEN');
  });

  it('rejects empty display names', () => {
    const result = lobby.registerPlayer('socket-1', '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_NAME');
  });

  it('rejects names longer than 20 characters', () => {
    const result = lobby.registerPlayer('socket-1', 'a'.repeat(21));
    expect(result.ok).toBe(false);
  });

  it('removes player on disconnect', () => {
    lobby.registerPlayer('socket-1', 'Alice');
    lobby.removePlayer('socket-1');
    const result = lobby.registerPlayer('socket-2', 'Alice'); // should now succeed
    expect(result.ok).toBe(true);
  });

  it('frees name when player disconnects within 2-minute reconnect window', () => {
    lobby.registerPlayer('socket-1', 'Alice');
    lobby.markDisconnected('socket-1');
    // Name is held during reconnect window — new registration with same name should fail
    const result = lobby.registerPlayer('socket-2', 'Alice');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/socket/__tests__/LobbyManager.test.ts
```

- [ ] **Step 3: Create packages/server/src/socket/LobbyManager.ts**

```typescript
import type { LobbyErrorPayload } from '@poke-fighter/shared';

export interface ConnectedPlayer {
  socketId: string;
  displayName: string;
  battleSlotId?: string;
  battleId?: string;
  disconnectedAt?: number; // unix ms
}

type RegisterResult =
  | { ok: true; player: ConnectedPlayer }
  | { ok: false; code: LobbyErrorPayload['code']; message: string };

const RECONNECT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export class LobbyManager {
  private readonly bySocketId = new Map<string, ConnectedPlayer>();
  private readonly byName = new Map<string, ConnectedPlayer>();

  registerPlayer(socketId: string, displayName: string): RegisterResult {
    const trimmed = displayName.trim();

    if (!trimmed || trimmed.length > 20) {
      return { ok: false, code: 'INVALID_NAME', message: 'Name must be 1–20 characters.' };
    }

    const existing = this.byName.get(trimmed.toLowerCase());
    if (existing) {
      // Allow reconnect if within window
      if (existing.disconnectedAt && Date.now() - existing.disconnectedAt < RECONNECT_WINDOW_MS) {
        // Reconnect — update socketId
        this.bySocketId.delete(existing.socketId);
        existing.socketId = socketId;
        existing.disconnectedAt = undefined;
        this.bySocketId.set(socketId, existing);
        return { ok: true, player: existing };
      }
      return { ok: false, code: 'NAME_TAKEN', message: `"${trimmed}" is already taken.` };
    }

    const player: ConnectedPlayer = { socketId, displayName: trimmed };
    this.bySocketId.set(socketId, player);
    this.byName.set(trimmed.toLowerCase(), player);
    return { ok: true, player };
  }

  markDisconnected(socketId: string): void {
    const player = this.bySocketId.get(socketId);
    if (player) {
      player.disconnectedAt = Date.now();
      // Keep in byName so reconnect check works; remove after window expires
      setTimeout(() => {
        const current = this.byName.get(player.displayName.toLowerCase());
        if (current?.socketId === socketId) {
          this.bySocketId.delete(socketId);
          this.byName.delete(player.displayName.toLowerCase());
        }
      }, RECONNECT_WINDOW_MS);
    }
  }

  removePlayer(socketId: string): void {
    const player = this.bySocketId.get(socketId);
    if (player) {
      this.bySocketId.delete(socketId);
      this.byName.delete(player.displayName.toLowerCase());
    }
  }

  getBySocketId(socketId: string): ConnectedPlayer | undefined {
    return this.bySocketId.get(socketId);
  }

  getByName(name: string): ConnectedPlayer | undefined {
    return this.byName.get(name.toLowerCase());
  }

  getWaitingPlayers(): ConnectedPlayer[] {
    return Array.from(this.bySocketId.values()).filter((p) => !p.battleId && !p.disconnectedAt);
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/socket/__tests__/LobbyManager.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/LobbyManager.ts packages/server/src/socket/__tests__/LobbyManager.test.ts
git commit -m "feat(server): LobbyManager — player registration, dedup, reconnect window"
```

---

## Task 3: Battle Room

**Files:**
- Create: `packages/server/src/socket/BattleRoom.ts`
- Create: `packages/server/src/socket/__tests__/BattleRoom.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/server/src/socket/__tests__/BattleRoom.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleRoom } from '../BattleRoom.js';
import { make1v1State } from '../../engine/__tests__/fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

describe('BattleRoom', () => {
  let room: BattleRoom;

  beforeEach(() => {
    const state = make1v1State();
    room = new BattleRoom({ initialState: state, timerSeconds: 60 });
  });

  it('starts in action phase waiting for submissions', () => {
    expect(room.getState().phase).toBe('action');
  });

  it('collects a valid action from a slot', () => {
    const action: MoveAction = { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' };
    const result = room.submitAction('slot-a1', action);
    expect(result.ok).toBe(true);
  });

  it('resolves turn when all slots have submitted', () => {
    const events: unknown[] = [];
    room.onTurnResolved((e) => events.push(e));

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(events.length).toBeGreaterThan(0);
    expect(room.getState().turnNumber).toBe(2);
  });

  it('rejects action from unknown slot', () => {
    const result = room.submitAction('slot-unknown', { type: 'move', moveIndex: 0 });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm --filter @poke-fighter/server test src/socket/__tests__/BattleRoom.test.ts
```

- [ ] **Step 3: Create packages/server/src/socket/BattleRoom.ts**

```typescript
import type { BattleState, MoveAction, SwitchAction, TurnResolveEvent } from '@poke-fighter/shared';
import { BattleEngine } from '../engine/index.js';

type Action = MoveAction | SwitchAction;

interface BattleRoomOptions {
  initialState: BattleState;
  timerSeconds: number;
}

type TurnResolvedCallback = (events: TurnResolveEvent[], newState: BattleState) => void;
type BattleEndCallback = (winningTeamId: string, finalState: BattleState) => void;

export class BattleRoom {
  private state: BattleState;
  private readonly engine = new BattleEngine();
  private readonly pendingActions = new Map<string, Action>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timerSeconds: number;
  private onTurnResolvedCb: TurnResolvedCallback | null = null;
  private onBattleEndCb: BattleEndCallback | null = null;
  private paused = false;

  constructor({ initialState, timerSeconds }: BattleRoomOptions) {
    this.state = initialState;
    this.timerSeconds = timerSeconds;
    this.startTimer();
  }

  getState(): BattleState { return this.state; }

  onTurnResolved(cb: TurnResolvedCallback): void { this.onTurnResolvedCb = cb; }
  onBattleEnd(cb: BattleEndCallback): void { this.onBattleEndCb = cb; }

  submitAction(slotId: string, action: Action): { ok: boolean; reason?: string } {
    const slot = this.engine['findSlot'](this.state, slotId);
    if (!slot) return { ok: false, reason: 'Unknown slot' };
    if (slot.isSpectator) return { ok: false, reason: 'Spectators cannot submit actions' };

    this.pendingActions.set(slotId, action);

    if (this.allActionsCollected()) {
      this.resolveTurn();
    }

    return { ok: true };
  }

  pause(): void {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
  }

  unpause(): void {
    this.paused = false;
    this.startTimer();
  }

  getStateSnapshot(): BattleState { return structuredClone(this.state); }

  private activeSlotsNeedingAction(): string[] {
    return this.state.teams.flatMap((team) =>
      team.slots
        .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
        .map((s) => s.slotId)
    );
  }

  private allActionsCollected(): boolean {
    return this.activeSlotsNeedingAction().every((slotId) => this.pendingActions.has(slotId));
  }

  private startTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.paused) return;

    this.timer = setTimeout(() => {
      // Auto-submit Struggle for any slot that hasn't submitted
      for (const slotId of this.activeSlotsNeedingAction()) {
        if (!this.pendingActions.has(slotId)) {
          this.pendingActions.set(slotId, { type: 'move', moveIndex: 0 }); // Struggle fallback
        }
      }
      this.resolveTurn();
    }, this.timerSeconds * 1000);
  }

  private resolveTurn(): void {
    if (this.timer) clearTimeout(this.timer);

    const actions = Object.fromEntries(this.pendingActions);
    this.pendingActions.clear();

    const { newState, events } = this.engine.resolveTurn(this.state, actions);
    this.state = newState;

    this.onTurnResolvedCb?.(events, newState);

    if (newState.phase === 'ended' && newState.winner !== undefined) {
      const winningTeam = newState.teams[newState.winner];
      this.onBattleEndCb?.(winningTeam?.teamId ?? '', newState);
    } else {
      this.startTimer();
    }
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm --filter @poke-fighter/server test src/socket/__tests__/BattleRoom.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "feat(server): BattleRoom — action collection, turn timer, turn resolution callbacks"
```

---

## Task 4: Socket.io Server & Event Handlers

**Files:**
- Create: `packages/server/src/socket/SocketServer.ts`
- Create: `packages/server/src/socket/handlers/lobbyHandlers.ts`
- Create: `packages/server/src/socket/handlers/battleHandlers.ts`
- Create: `packages/server/src/socket/handlers/adminHandlers.ts`

- [ ] **Step 1: Create packages/server/src/socket/handlers/lobbyHandlers.ts**

```typescript
import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PlayerJoinPayload } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';

export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager
): void {
  socket.on('player:join', (payload: PlayerJoinPayload) => {
    const result = lobby.registerPlayer(socket.id, payload.displayName);
    if (!result.ok) {
      socket.emit('lobby:error', { code: result.code, message: result.message });
      return;
    }
    console.log(`Player joined: ${result.player.displayName} (${socket.id})`);
    // Admin will be notified of new waiting players via a separate admin:lobby-update event
    socket.join('lobby');
  });
}
```

- [ ] **Step 2: Create packages/server/src/socket/handlers/battleHandlers.ts**

```typescript
import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, ActionSubmitPayload, SwitchSubmitPayload } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';
import type { BattleRoom } from '../BattleRoom.js';

export function registerBattleHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager,
  getRoom: (battleId: string) => BattleRoom | undefined
): void {
  socket.on('action:submit', (payload: ActionSubmitPayload) => {
    const player = lobby.getBySocketId(socket.id);
    if (!player?.battleId) return;

    const room = getRoom(player.battleId);
    if (!room) return;

    const result = room.submitAction(payload.slotId, payload.action);
    if (!result.ok) {
      console.warn(`Invalid action from ${player.displayName}: ${result.reason}`);
    }
  });

  socket.on('switch:submit', (payload: SwitchSubmitPayload) => {
    const player = lobby.getBySocketId(socket.id);
    if (!player?.battleId) return;

    const room = getRoom(player.battleId);
    if (!room) return;

    room.submitAction(payload.slotId, { type: 'switch', targetInstanceId: payload.targetInstanceId });
  });
}
```

- [ ] **Step 3: Create packages/server/src/socket/handlers/adminHandlers.ts**

```typescript
import type { Socket, Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, AdminActionPayload } from '@poke-fighter/shared';
import type { BattleRoom } from '../BattleRoom.js';
import type { BattleState } from '@poke-fighter/shared';

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  getRoom: (battleId: string) => BattleRoom | undefined,
  startBattle: (config: BattleState) => BattleRoom
): void {
  socket.on('admin:action', (payload: AdminActionPayload) => {
    switch (payload.type) {
      case 'npc-action': {
        const { battleId, slotId, action } = payload.data as { battleId: string; slotId: string; action: import('@poke-fighter/shared').MoveAction | import('@poke-fighter/shared').SwitchAction };
        const room = getRoom(battleId);
        room?.submitAction(slotId, action);
        break;
      }
      case 'pause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.pause();
        io.to(`battle:${battleId}`).emit('state:sync', getRoom(battleId)!.getState());
        break;
      }
      case 'unpause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.unpause();
        break;
      }
      case 'force-faint': {
        // Implemented in BattleRoom.forceOverride (add in Phase 08 plan)
        break;
      }
      case 'forfeit': {
        // Implemented in BattleRoom.forfeit (add in Phase 08 plan)
        break;
      }
    }
  });
}
```

- [ ] **Step 4: Create packages/server/src/socket/SocketServer.ts**

```typescript
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@poke-fighter/shared';
import { LobbyManager } from './LobbyManager.js';
import { BattleRoom } from './BattleRoom.js';
import { registerLobbyHandlers } from './handlers/lobbyHandlers.js';
import { registerBattleHandlers } from './handlers/battleHandlers.js';
import { registerAdminHandlers } from './handlers/adminHandlers.js';

interface SocketServerOptions { adminToken: string }

export class SocketServer {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly lobby = new LobbyManager();
  private readonly rooms = new Map<string, BattleRoom>();

  constructor(httpServer: HttpServer, { adminToken }: SocketServerOptions) {
    this.io = new Server(httpServer, {
      cors: { origin: '*' }, // intranet — no CORS restriction
    });

    this.io.use((socket, next) => {
      // Mark admin sockets
      const token = socket.handshake.auth['token'] as string | undefined;
      if (token && token === adminToken) {
        socket.data['isAdmin'] = true;
      }
      next();
    });

    this.io.on('connection', (socket) => {
      console.log(`Connected: ${socket.id} (admin=${socket.data['isAdmin'] ?? false})`);

      registerLobbyHandlers(socket, this.lobby);
      registerBattleHandlers(socket, this.lobby, (id) => this.rooms.get(id));
      if (socket.data['isAdmin']) {
        registerAdminHandlers(socket, this.io, (id) => this.rooms.get(id), this.startBattle.bind(this));
      }

      socket.on('disconnect', () => {
        const player = this.lobby.getBySocketId(socket.id);
        if (player) {
          console.log(`Disconnected: ${player.displayName}`);
          this.lobby.markDisconnected(socket.id);
        }
      });
    });
  }

  startBattle(initialState: import('@poke-fighter/shared').BattleState): BattleRoom {
    const room = new BattleRoom({ initialState, timerSeconds: initialState.turnTimerSeconds });
    this.rooms.set(initialState.battleId, room);

    // Notify all assigned players
    this.io.to(`battle:${initialState.battleId}`).emit('battle:start', { state: initialState });

    room.onTurnResolved((events, newState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('turn:resolve', {
        turnNumber: newState.turnNumber,
        events,
        state: newState,
      });
    });

    room.onBattleEnd((winningTeamId, finalState) => {
      this.io.to(`battle:${initialState.battleId}`).emit('battle:end', { winningTeamId, state: finalState });
      this.rooms.delete(initialState.battleId);
    });

    return room;
  }
}
```

- [ ] **Step 5: Build the server and verify no TypeScript errors**

```bash
pnpm --filter @poke-fighter/server typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/ packages/server/src/index.ts
git commit -m "feat(server): Socket.io server with lobby, battle room, and admin handlers"
```

---

## Task 5: State Snapshot on Reconnect

**Files:**
- Modify: `packages/server/src/socket/handlers/lobbyHandlers.ts`

- [ ] **Step 1: Update lobbyHandlers to emit state snapshot for reconnecting players**

In `registerLobbyHandlers`, after `lobby.registerPlayer`:

```typescript
socket.on('player:join', (payload: PlayerJoinPayload) => {
  const result = lobby.registerPlayer(socket.id, payload.displayName);
  if (!result.ok) {
    socket.emit('lobby:error', { code: result.code, message: result.message });
    return;
  }

  const player = result.player;
  console.log(`Player joined: ${player.displayName} (${socket.id})`);

  // If player is reconnecting into an active battle, rejoin the room and send snapshot
  if (player.battleId) {
    socket.join(`battle:${player.battleId}`);
    const room = getRoom(player.battleId); // pass getRoom into the handler
    if (room) {
      socket.emit('state:sync', room.getStateSnapshot());
    }
    return;
  }

  socket.join('lobby');
});
```

Update the function signature to accept `getRoom`:

```typescript
export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager,
  getRoom: (battleId: string) => BattleRoom | undefined
): void {
```

Update the call in `SocketServer.ts`:

```typescript
registerLobbyHandlers(socket, this.lobby, (id) => this.rooms.get(id));
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @poke-fighter/server typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/socket/handlers/lobbyHandlers.ts packages/server/src/socket/SocketServer.ts
git commit -m "feat(server): reconnecting players receive full state snapshot"
```

---

## Task 6: Manual Integration Test (Smoke Test)

- [ ] **Step 1: Start the server**

```bash
pnpm --filter @poke-fighter/server dev
```

Expected: `Poke Fighter server running on http://localhost:3000`

- [ ] **Step 2: Connect a test client using wscat or a quick Node script**

Create a throwaway script at `packages/server/src/smoke-test.ts`:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('player:join', { displayName: 'TestPlayer' });
});

socket.on('lobby:error', (err) => {
  console.error('Lobby error:', err);
  socket.disconnect();
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});

setTimeout(() => { socket.disconnect(); process.exit(0); }, 3000);
```

Run it:

```bash
pnpm --filter @poke-fighter/server add -D socket.io-client
npx tsx packages/server/src/smoke-test.ts
```

Expected:
```
Connected: <socket-id>
```
No lobby errors.

- [ ] **Step 3: Remove the smoke-test file and commit**

```bash
git rm packages/server/src/smoke-test.ts
git commit -m "test(server): manual smoke test passed — sync protocol connected"
```

---

## Task 7: Switch Request — Forced Switch After Faint

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/SocketServer.ts`

After a Pokémon faints mid-turn, the server must ask that slot's player to pick their next Pokémon before the next turn begins.

- [ ] **Step 1: Add switch-request detection to BattleRoom**

After `this.onTurnResolvedCb?.(events, newState)` in `resolveTurn`, check for fainted active Pokémon that have living party members:

```typescript
private getPendingSwitchSlots(state: BattleState): SlotState[] {
  const pending: SlotState[] = [];
  for (const team of state.teams) {
    for (const slot of team.slots) {
      if (slot.isSpectator) continue;
      const active = slot.party[slot.activePokemonIndex];
      if (!active || !active.fainted) continue;
      const hasLiving = slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted);
      if (hasLiving) pending.push(slot);
      else slot.isSpectator = true; // no remaining pokemon — becomes spectator
    }
  }
  return pending;
}
```

Add callback and call in `resolveTurn`:

```typescript
type SwitchRequestCallback = (slots: SlotState[]) => void;
private onSwitchRequestCb: SwitchRequestCallback | null = null;
onSwitchRequest(cb: SwitchRequestCallback): void { this.onSwitchRequestCb = cb; }

// In resolveTurn, after onTurnResolvedCb:
const switchSlots = this.getPendingSwitchSlots(newState);
if (switchSlots.length > 0) {
  this.onSwitchRequestCb?.(switchSlots);
  // Don't start the next turn timer until all forced switches are submitted
  this.awaitingForcedSwitches = new Set(switchSlots.map((s) => s.slotId));
}
```

Add `private awaitingForcedSwitches = new Set<string>();` as a class field.

In `submitAction`, when a `SwitchAction` is submitted and the slot is in `awaitingForcedSwitches`, remove it and check if all forced switches are done:

```typescript
if (action.type === 'switch' && this.awaitingForcedSwitches.has(slotId)) {
  this.awaitingForcedSwitches.delete(slotId);
  // Execute the switch immediately
  const switchResult = this.engine['executeSwitch'](this.state, slotId, action.targetInstanceId);
  this.state = switchResult.newState;
  this.onTurnResolvedCb?.(switchResult.events, switchResult.newState);
  if (this.awaitingForcedSwitches.size === 0) this.startTimer(); // resume turn cycle
  return { ok: true };
}
```

- [ ] **Step 2: Emit switch:request from SocketServer**

```typescript
room.onSwitchRequest((slots) => {
  for (const slot of slots) {
    const player = lobby.getByName(slot.displayName);
    if (!player) continue;
    const availableParty = slot.party.filter((p, i) => i !== slot.activePokemonIndex && !p.fainted);
    this.io.to(player.socketId).emit('switch:request', {
      slotId: slot.slotId,
      party: availableParty,
      reason: 'faint',
    });
  }
});
```

- [ ] **Step 3: Handle switch:request on client — add to BattleContext**

In `BattleContext.tsx`, add:

```typescript
const [switchRequest, setSwitchRequest] = useState<import('@poke-fighter/shared').SwitchRequestPayload | null>(null);

socket.on('switch:request', (payload) => {
  if (payload.slotId === mySlotId) setSwitchRequest(payload);
});

// Expose via context
```

Add `switchRequest` and `submitSwitch` to the context value so `BattlePage` can render a switch picker panel when `switchRequest` is non-null.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/socket/BattleRoom.ts packages/server/src/socket/SocketServer.ts packages/client/src/battle/BattleContext.tsx
git commit -m "feat(server+client): forced switch request after pokemon faints"
```

---

**Plan 03 complete.** The Socket.io server accepts player connections, manages the lobby, routes actions to the correct `BattleRoom`, resolves turns via the engine, broadcasts state snapshots on reconnect, and prompts players to switch after a faint.
