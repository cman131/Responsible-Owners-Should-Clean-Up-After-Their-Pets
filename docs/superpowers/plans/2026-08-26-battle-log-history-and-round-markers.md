# Battle Log History & Round Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix admin battle log not receiving live updates, persist a full turn-event log in SQLite, deliver history to any client on connect/reconnect, and add visually distinct round-start separator entries to the log.

**Architecture:** The server accumulates `{ turnNumber, events }` entries in a new `eventLog` column on the `battles` table. When any client connects or reconnects (admin via `battles:connect`, player via `player:join`), the server emits a `battle:history` socket event carrying all past turns. Admin sockets now join the Socket.IO room for the watched battle so they receive live `turn:resolve` broadcasts. The client models log entries as a discriminated union (`LogEntry`) so `TurnLog` can style round-start separators differently.

**Tech Stack:** Vitest, better-sqlite3 (`:memory:` for tests), Socket.IO, React + Vitest/JSDOM, `@testing-library/react`

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types/events.ts` | Add `battle:history` to `ServerToClientEvents` |
| `packages/server/src/db/Database.ts` | Migration guard; `getEventLog`; `appendTurnEvents` |
| `packages/server/src/db/__tests__/Database.test.ts` | Tests for `getEventLog` and `appendTurnEvents` |
| `packages/server/src/socket/handlers/adminHandlers.ts` | Room join/leave on `battles:connect`; emit `battle:history` |
| `packages/server/src/socket/__tests__/adminHandlers.test.ts` | New `describe` block for `battles:connect` behavior |
| `packages/server/src/socket/handlers/lobbyHandlers.ts` | Add `getEventLog` param; emit `battle:history` on `player:join` |
| `packages/server/src/socket/__tests__/lobbyHandlers.test.ts` | Update `registerLobbyHandlers` calls; add `battle:history` test |
| `packages/server/src/socket/SocketServer.ts` | Call `appendTurnEvents` in `onTurnResolved`; pass `getEventLog` to `registerLobbyHandlers` |
| `packages/client/src/battle/BattleContext.tsx` | `LogEntry` type; `turnLog: LogEntry[]`; round-start entries; `battle:history` listener |
| `packages/client/src/battle/__tests__/BattleContext.test.tsx` | New file — tests for round-start and `battle:history` |
| `packages/client/src/battle/overlays/TurnLog.tsx` | Accept `LogEntry[]`; style `round-start` entries |
| `packages/client/src/battle/__tests__/TurnLog.test.tsx` | New file — rendering tests for both entry types |

---

## Task 1: Add `battle:history` to shared socket event types

**Files:**
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Add the event to `ServerToClientEvents`**

In `packages/shared/src/types/events.ts`, add one line to the `ServerToClientEvents` interface after the `'battles:data'` entry:

```ts
'battle:history': (payload: { turns: Array<{ turnNumber: number; events: TurnResolveEvent[] }> }) => void;
```

The full interface block around it looks like:

```ts
export interface ServerToClientEvents {
  'battle:start': (payload: BattleStartPayload) => void;
  // ... existing entries ...
  'battles:data': (payload: { battles: BattleSummary[] }) => void;
  'battle:history': (payload: { turns: Array<{ turnNumber: number; events: TurnResolveEvent[] }> }) => void;
  'admin:authenticated': () => void;
  // ... rest unchanged
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck -w packages/shared
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat(shared): add battle:history to ServerToClientEvents"
```

---

## Task 2: DB — migration guard and `getEventLog`

**Files:**
- Modify: `packages/server/src/db/Database.ts`
- Modify: `packages/server/src/db/__tests__/Database.test.ts`

- [ ] **Step 1: Write the failing tests**

At the bottom of `packages/server/src/db/__tests__/Database.test.ts`, add:

```ts
describe('AppDatabase.battles – event log', () => {
  let db: AppDatabase;
  beforeEach(() => { db = new AppDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('getEventLog returns [] for a battle with no turns yet', () => {
    db.battles.insert(makeBattleState());
    expect(db.battles.getEventLog('b1')).toEqual([]);
  });

  it('getEventLog returns [] for an unknown battleId', () => {
    expect(db.battles.getEventLog('does-not-exist')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -w packages/server
```

Expected: two new tests fail with "db.battles.getEventLog is not a function".

- [ ] **Step 3: Add the `eventLog` column migration**

In `packages/server/src/db/Database.ts`, add to the import line (add `TurnResolveEvent` to the shared import):

```ts
import type { PlayerProfile, NpcProfile, TeamTemplate, BattleState, BattleSummary, PokemonSet, TurnResolveEvent } from '@poke-fighter/shared';
```

In the `AppDatabase` constructor, after the `this.conn.exec(...)` call that creates all tables, add:

```ts
try {
  this.conn.exec(`ALTER TABLE battles ADD COLUMN eventLog TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // column already exists — safe to ignore
}
```

- [ ] **Step 4: Add `getEventLog` to `BattlesStore`**

Inside `class BattlesStore`, add this method after `get`:

```ts
getEventLog(battleId: string): Array<{ turnNumber: number; events: TurnResolveEvent[] }> {
  const row = this.db.prepare('SELECT eventLog FROM battles WHERE battleId = ?').get(battleId) as
    { eventLog: string } | undefined;
  if (!row) return [];
  return JSON.parse(row.eventLog) as Array<{ turnNumber: number; events: TurnResolveEvent[] }>;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -w packages/server
```

Expected: the two new tests pass; all prior tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/Database.ts packages/server/src/db/__tests__/Database.test.ts
git commit -m "feat(server): add eventLog column migration and getEventLog to BattlesStore"
```

---

## Task 3: DB — `appendTurnEvents`

**Files:**
- Modify: `packages/server/src/db/Database.ts`
- Modify: `packages/server/src/db/__tests__/Database.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the `'AppDatabase.battles – event log'` describe block (inside the same `describe`):

```ts
it('appendTurnEvents stores a turn and getEventLog returns it', () => {
  db.battles.insert(makeBattleState());
  const turn = { turnNumber: 1, events: [{ type: 'faint' as const, data: { slotId: 'a1', instanceId: 'i1' } }] };
  db.battles.appendTurnEvents('b1', turn);
  expect(db.battles.getEventLog('b1')).toEqual([turn]);
});

it('appendTurnEvents accumulates multiple turns in order', () => {
  db.battles.insert(makeBattleState());
  const turn1 = { turnNumber: 1, events: [{ type: 'faint' as const, data: { slotId: 'a1', instanceId: 'i1' } }] };
  const turn2 = { turnNumber: 2, events: [{ type: 'heal' as const, data: { slotId: 'b1' } }] };
  db.battles.appendTurnEvents('b1', turn1);
  db.battles.appendTurnEvents('b1', turn2);
  expect(db.battles.getEventLog('b1')).toEqual([turn1, turn2]);
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -w packages/server
```

Expected: two new tests fail with "db.battles.appendTurnEvents is not a function".

- [ ] **Step 3: Add `appendTurnEvents` to `BattlesStore`**

Inside `class BattlesStore`, add this method after `getEventLog`:

```ts
appendTurnEvents(battleId: string, turn: { turnNumber: number; events: TurnResolveEvent[] }): void {
  const current = this.getEventLog(battleId);
  current.push(turn);
  this.db.prepare('UPDATE battles SET eventLog = @eventLog WHERE battleId = @battleId')
    .run({ battleId, eventLog: JSON.stringify(current) });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -w packages/server
```

Expected: all four event-log tests pass; all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/Database.ts packages/server/src/db/__tests__/Database.test.ts
git commit -m "feat(server): add appendTurnEvents to BattlesStore"
```

---

## Task 4: Admin handler — room join/leave and `battle:history`

**Files:**
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Modify: `packages/server/src/socket/__tests__/adminHandlers.test.ts`

- [ ] **Step 1: Write the failing tests**

The existing `adminHandlers.test.ts` only tests pure helper functions. Add a new `describe` block at the bottom of the file. Note that `makeSocket` here needs a `leave` spy that doesn't exist in the lobbyHandlers pattern — define it inline:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAdminHandlers } from '../handlers/adminHandlers.js';
import { AppDatabase } from '../../db/Database.js';

// ... (existing imports and tests unchanged) ...

describe('registerAdminHandlers – battles:connect', () => {
  function makeAdminSocket(id = 'admin1') {
    const handlers: Record<string, (p: unknown) => void> = {};
    return {
      id,
      data: {} as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      on(event: string, handler: (p: unknown) => void) { handlers[event] = handler; },
      trigger(event: string, payload: unknown) { handlers[event]?.(payload); },
    };
  }

  const mockIo = { sockets: { sockets: { values: () => [] } } } as any;
  const mockStartBattle = vi.fn();
  const mockLobby = { getWaitingPlayers: vi.fn(() => []), getBySlotId: vi.fn() } as any;

  let db: AppDatabase;
  let socket: ReturnType<typeof makeAdminSocket>;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    socket = makeAdminSocket();
    registerAdminHandlers(socket as any, mockIo, () => undefined, mockStartBattle, db, mockLobby);
  });

  afterEach(() => { db.close(); });

  it('joins the battle room socket channel', () => {
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.join).toHaveBeenCalledWith('battle:b1');
  });

  it('sets watchingBattleId on socket.data', () => {
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.data['watchingBattleId']).toBe('b1');
  });

  it('leaves previous battle room before joining new one', () => {
    socket.data['watchingBattleId'] = 'old-battle';
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'new-battle' } });
    expect(socket.leave).toHaveBeenCalledWith('battle:old-battle');
    expect(socket.join).toHaveBeenCalledWith('battle:new-battle');
  });

  it('does not call leave when no previous battle was watched', () => {
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.leave).not.toHaveBeenCalled();
  });

  it('emits battle:history with empty turns for a battle with no history', () => {
    const makeBattleState = () => ({
      battleId: 'b1', label: 'Test', turnNumber: 0, phase: 'action' as const,
      teams: [
        { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'A', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 }] },
        { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'B', isNpc: true,  isSpectator: false, party: [], activePokemonIndex: 0 }] },
      ],
      field: { sideConditions: [{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0},{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0}], trickroom: 0, gravity: 0 },
    });
    db.battles.insert(makeBattleState());
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.emit).toHaveBeenCalledWith('battle:history', { turns: [] });
  });

  it('emits battle:history with accumulated turns', () => {
    const makeBattleState = () => ({
      battleId: 'b1', label: 'Test', turnNumber: 0, phase: 'action' as const,
      teams: [
        { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'A', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 }] },
        { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'B', isNpc: true,  isSpectator: false, party: [], activePokemonIndex: 0 }] },
      ],
      field: { sideConditions: [{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0},{stealthRock:false,spikes:0,toxicSpikes:0,stickyWeb:false,reflect:0,lightScreen:0,auroraVeil:0}], trickroom: 0, gravity: 0 },
    });
    db.battles.insert(makeBattleState());
    const turn = { turnNumber: 1, events: [{ type: 'faint' as const, data: { slotId: 'a1', instanceId: 'i1' } }] };
    db.battles.appendTurnEvents('b1', turn);
    socket.trigger('admin:action', { type: 'battles:connect', data: { battleId: 'b1' } });
    expect(socket.emit).toHaveBeenCalledWith('battle:history', { turns: [turn] });
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -w packages/server
```

Expected: new tests fail — `socket.join` not called, `socket.leave` not called, `battle:history` not emitted.

- [ ] **Step 3: Update the `battles:connect` case in `adminHandlers.ts`**

Replace the existing `battles:connect` case:

```ts
case 'battles:connect': {
  const { battleId } = payload.data as { battleId: string };
  const state = db.battles.get(battleId);
  if (state) socket.emit('state:sync', state);
  const liveRoom = getRoom(battleId);
  if (liveRoom) {
    const npcRequests = liveRoom.getPendingNpcRequests();
    if (npcRequests.length > 0) socket.emit('npc:action-request', { battleId, slots: npcRequests });
  }
  break;
}
```

With:

```ts
case 'battles:connect': {
  const { battleId } = payload.data as { battleId: string };
  const prevBattleId = socket.data['watchingBattleId'] as string | undefined;
  if (prevBattleId) socket.leave(`battle:${prevBattleId}`);
  socket.join(`battle:${battleId}`);
  socket.data['watchingBattleId'] = battleId;
  const state = db.battles.get(battleId);
  if (state) socket.emit('state:sync', state);
  socket.emit('battle:history', { turns: db.battles.getEventLog(battleId) });
  const liveRoom = getRoom(battleId);
  if (liveRoom) {
    const npcRequests = liveRoom.getPendingNpcRequests();
    if (npcRequests.length > 0) socket.emit('npc:action-request', { battleId, slots: npcRequests });
  }
  break;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -w packages/server
```

Expected: all new tests pass; all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/handlers/adminHandlers.ts packages/server/src/socket/__tests__/adminHandlers.test.ts
git commit -m "feat(server): admin socket joins battle room on connect, emits battle:history"
```

---

## Task 5: Lobby handler — `getEventLog` param and `battle:history` on player join

**Files:**
- Modify: `packages/server/src/socket/handlers/lobbyHandlers.ts`
- Modify: `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`

- [ ] **Step 1: Update existing tests to pass the new `getEventLog` parameter**

In `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`, every `registerLobbyHandlers(...)` call currently has 6 arguments. Add a 7th: `vi.fn(() => [])` (a mock that returns an empty log). There are multiple call sites — update all of them.

The `beforeEach` setup call becomes:

```ts
registerLobbyHandlers(
  socket as any,
  lobby as any,
  (id) => (id === 'battle-1' ? (room as any) : undefined),
  notifyAdmins,
  notifyAdminsOfSlotStatus,
  notifyPlayersOfBattles,
  vi.fn(() => []),  // getEventLog — NEW
);
```

Also update the three other `registerLobbyHandlers` calls in the NPC, spectator, and roomWithPending test cases the same way.

- [ ] **Step 2: Write the new failing test**

Add this test to the `'registerLobbyHandlers – player:join'` describe block:

```ts
it('emits battle:history after state:sync on successful join', () => {
  const turn = { turnNumber: 1, events: [{ type: 'faint' as const, data: { slotId: 'a1', instanceId: 'i1' } }] };
  const getEventLog = vi.fn(() => [turn]);
  registerLobbyHandlers(
    socket as any,
    lobby as any,
    (id) => (id === 'battle-1' ? (room as any) : undefined),
    notifyAdmins,
    notifyAdminsOfSlotStatus,
    notifyPlayersOfBattles,
    getEventLog,
  );
  lobby.getBySlotId.mockReturnValue(undefined);
  lobby.registerPlayer.mockReturnValue({ ok: true, player: { displayName: 'Conor', battleId: null, battleSlotId: null } });
  socket.trigger('player:join', { battleId: 'battle-1', slotId: 'slot-a1' });
  expect(socket.emit).toHaveBeenCalledWith('battle:history', { turns: [turn] });
  expect(getEventLog).toHaveBeenCalledWith('battle-1');
});
```

- [ ] **Step 3: Run to confirm the new test fails (and old tests now pass with the updated calls)**

```bash
npm test -w packages/server
```

Expected: one new test fails with "battle:history not emitted"; previously-passing tests continue to pass (because the updated mock calls compile fine with 7 args once we update the function signature in the next step).

Note: tests will actually error on the signature mismatch until Step 4 — that's expected.

- [ ] **Step 4: Update `lobbyHandlers.ts` to accept and use `getEventLog`**

Replace the function signature and the `player:join` handler body:

```ts
import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PlayerJoinPayload, TurnResolveEvent } from '@poke-fighter/shared';
import type { LobbyManager } from '../LobbyManager.js';
import type { BattleRoom } from '../BattleRoom.js';

export function registerLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  lobby: LobbyManager,
  getRoom: (battleId: string) => BattleRoom | undefined,
  notifyAdmins: () => void,
  notifyAdminsOfSlotStatus: (battleId: string) => void,
  notifyPlayersOfBattles: () => void,
  getEventLog: (battleId: string) => Array<{ turnNumber: number; events: TurnResolveEvent[] }>,
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
    socket.emit('state:sync', state);
    socket.emit('battle:history', { turns: getEventLog(battleId) });

    const pending = room.getPendingActionRequest(slotId);
    if (pending) socket.emit('action:request', pending);

    notifyAdminsOfSlotStatus(battleId);
    notifyPlayersOfBattles();
  });
}
```

- [ ] **Step 5: Run tests to confirm they all pass**

```bash
npm test -w packages/server
```

Expected: all tests pass including the new `battle:history` test.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/handlers/lobbyHandlers.ts packages/server/src/socket/__tests__/lobbyHandlers.test.ts
git commit -m "feat(server): emit battle:history on player:join, add getEventLog param to registerLobbyHandlers"
```

---

## Task 6: SocketServer — wire `appendTurnEvents` and pass `getEventLog`

**Files:**
- Modify: `packages/server/src/socket/SocketServer.ts`

No unit tests for this task — the behavior is covered by the DB and handler tests. TypeScript compilation is the verification.

- [ ] **Step 1: Call `appendTurnEvents` inside `onTurnResolved`**

In `packages/server/src/socket/SocketServer.ts`, find the `onTurnResolved` callback inside `startBattle`. It currently reads:

```ts
room.onTurnResolved((events, newState) => {
  this.io.to(`battle:${initialState.battleId}`).emit('turn:resolve', {
    turnNumber: newState.turnNumber,
    events,
    state: newState,
  });
  this.db.battles.updateState(initialState.battleId, newState);
  this.notifyAdminsOfBattles();
});
```

Add the `appendTurnEvents` call after `updateState`:

```ts
room.onTurnResolved((events, newState) => {
  this.io.to(`battle:${initialState.battleId}`).emit('turn:resolve', {
    turnNumber: newState.turnNumber,
    events,
    state: newState,
  });
  this.db.battles.updateState(initialState.battleId, newState);
  this.db.battles.appendTurnEvents(initialState.battleId, { turnNumber: newState.turnNumber, events });
  this.notifyAdminsOfBattles();
});
```

- [ ] **Step 2: Pass `getEventLog` to `registerLobbyHandlers`**

Find the `registerLobbyHandlers(...)` call in the `io.on('connection', ...)` handler. It currently has 6 arguments. Add the 7th:

```ts
registerLobbyHandlers(
  socket,
  this.lobby,
  (id) => this.rooms.get(id),
  notifyAdminsOfLobby,
  this.notifyAdminsOfSlotStatus.bind(this),
  this.notifyPlayersOfBattles.bind(this),
  (battleId) => this.db.battles.getEventLog(battleId),
);
```

- [ ] **Step 3: Verify TypeScript compiles for both packages**

```bash
npm run typecheck -w packages/server
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/socket/SocketServer.ts
git commit -m "feat(server): wire appendTurnEvents on turn resolve and pass getEventLog to lobby handlers"
```

---

## Task 7: TurnLog component — accept `LogEntry[]`, style `round-start`

**Files:**
- Create: `packages/client/src/battle/__tests__/TurnLog.test.tsx`
- Modify: `packages/client/src/battle/overlays/TurnLog.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/battle/__tests__/TurnLog.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TurnLog } from '../overlays/TurnLog.js';
import type { LogEntry } from '../BattleContext.js';

describe('TurnLog', () => {
  it('renders a normal log entry', () => {
    const messages: LogEntry[] = [{ type: 'normal', text: 'Charizard used Flamethrower!' }];
    render(<TurnLog messages={messages} />);
    expect(screen.getByText('Charizard used Flamethrower!')).toBeInTheDocument();
  });

  it('renders a round-start entry', () => {
    const messages: LogEntry[] = [{ type: 'round-start', text: '-------Round 1-------' }];
    render(<TurnLog messages={messages} />);
    expect(screen.getByText('-------Round 1-------')).toBeInTheDocument();
  });

  it('filters entries with empty text', () => {
    const messages: LogEntry[] = [
      { type: 'normal', text: '' },
      { type: 'normal', text: 'Bulbasaur fainted!' },
    ];
    render(<TurnLog messages={messages} />);
    expect(screen.queryAllByText('')).toHaveLength(0);
    expect(screen.getByText('Bulbasaur fainted!')).toBeInTheDocument();
  });

  it('renders multiple entries in order', () => {
    const messages: LogEntry[] = [
      { type: 'round-start', text: '-------Round 2-------' },
      { type: 'normal', text: 'Squirtle used Surf!' },
    ];
    render(<TurnLog messages={messages} />);
    const items = screen.getAllByTestId('log-entry');
    expect(items[0]).toHaveTextContent('-------Round 2-------');
    expect(items[1]).toHaveTextContent('Squirtle used Surf!');
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -w packages/client
```

Expected: tests fail because `LogEntry` is not exported from `BattleContext`, and `TurnLog` still accepts `string[]`.

- [ ] **Step 3: Export `LogEntry` from `BattleContext.tsx`**

In `packages/client/src/battle/BattleContext.tsx`, add this type export before the interface definitions:

```ts
export type LogEntry = { type: 'normal' | 'round-start'; text: string };
```

No other changes to `BattleContext.tsx` yet — that happens in Task 8.

- [ ] **Step 4: Update `TurnLog.tsx` to accept `LogEntry[]`**

Replace the entire content of `packages/client/src/battle/overlays/TurnLog.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { LogEntry } from '../BattleContext.js';

interface Props { messages: LogEntry[] }

export function TurnLog({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>BATTLE LOG</div>
      <div style={styles.log}>
        {messages.filter((m) => m.text).map((m, i) => (
          <div
            key={i}
            data-testid="log-entry"
            style={m.type === 'round-start' ? styles.roundStart : styles.message}
          >
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

const styles = {
  container: { background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { color: '#555', fontSize: 10, letterSpacing: 2 },
  log: { maxHeight: 150, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 3 },
  message: { color: '#ccc', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.4 },
  roundStart: { color: '#f0c040', fontSize: 11, letterSpacing: 2, textAlign: 'center' as const, fontFamily: 'inherit', lineHeight: 1.4 },
};
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -w packages/client
```

Expected: TurnLog tests pass. Other tests may now fail if they render `TurnLog` with `string[]` — check and fix any type errors (the TypeScript compiler will point them out in the next step).

- [ ] **Step 6: Check TypeScript for client**

```bash
npm run typecheck -w packages/client
```

Expected: errors on any caller of `TurnLog` that still passes `string[]` or on `BattleContext` where `turnLog` is still `string[]`. These will be fully resolved in Task 8.

- [ ] **Step 7: Commit what compiles**

```bash
git add packages/client/src/battle/overlays/TurnLog.tsx packages/client/src/battle/__tests__/TurnLog.test.tsx packages/client/src/battle/BattleContext.tsx
git commit -m "feat(client): TurnLog accepts LogEntry[], export LogEntry type, add round-start styling"
```

---

## Task 8: BattleContext — typed `turnLog`, round-start entries, `battle:history` listener

**Files:**
- Modify: `packages/client/src/battle/BattleContext.tsx`
- Create: `packages/client/src/battle/__tests__/BattleContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/battle/__tests__/BattleContext.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

let socketListeners: Record<string, (payload: unknown) => void> = {};

vi.mock('../../socket.js', () => ({
  getSocket: () => ({
    on: (event: string, handler: (p: unknown) => void) => { socketListeners[event] = handler; },
    off: vi.fn(),
    emit: vi.fn(),
  }),
}));

import { BattleProvider, useBattle } from '../BattleContext.js';

function wrapper({ children }: { children: React.ReactNode }) {
  return <BattleProvider mySlotId="s1">{children}</BattleProvider>;
}

beforeEach(() => { socketListeners = {}; });

describe('turn:resolve', () => {
  it('prepends a round-start entry (Round N-1) before the turn events', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'faint', data: { slotId: 's1', instanceId: 'i1' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log[0]).toEqual({ type: 'round-start', text: '-------Round 1-------' });
    expect(log[1]).toEqual({ type: 'normal', text: "s1's Pokémon fainted!" });
  });

  it('filters out events that produce empty text', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [
          { type: 'volatile-applied', data: { note: 'switch', slotId: 's1' } },
          { type: 'heal', data: { slotId: 's2' } },
        ],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    // round-start + heal only (volatile-applied returns '' and is filtered)
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({ type: 'round-start', text: '-------Round 1-------' });
    expect(log[1]).toEqual({ type: 'normal', text: 's2 restored HP.' });
  });
});

describe('battle:history', () => {
  it('replaces turnLog with history entries including round-start separators', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['battle:history']?.({
        turns: [
          { turnNumber: 1, events: [{ type: 'faint', data: { slotId: 'a1', instanceId: 'i1' } }] },
          { turnNumber: 2, events: [{ type: 'heal', data: { slotId: 'b1' } }] },
        ],
      });
    });
    const log = result.current.turnLog;
    expect(log[0]).toEqual({ type: 'round-start', text: '-------Round 0-------' });
    expect(log[1]).toEqual({ type: 'normal', text: "a1's Pokémon fainted!" });
    expect(log[2]).toEqual({ type: 'round-start', text: '-------Round 1-------' });
    expect(log[3]).toEqual({ type: 'normal', text: 'b1 restored HP.' });
  });

  it('replaces any existing turnLog entries when history arrives', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    // First a turn:resolve to populate the log
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'heal', data: { slotId: 'x1' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    expect(result.current.turnLog.length).toBeGreaterThan(0);
    // Then battle:history replaces it
    act(() => {
      socketListeners['battle:history']?.({ turns: [] });
    });
    expect(result.current.turnLog).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -w packages/client
```

Expected: new tests fail because `BattleContext` still has `turnLog: string[]` and no `battle:history` listener.

- [ ] **Step 3: Update `BattleContext.tsx` — types, round-start, history listener**

Replace the full content of `packages/client/src/battle/BattleContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { getSocket } from '../socket.js';
import type {
  BattleState, ActionRequestPayload, TurnResolvePayload, SwitchRequestPayload, TurnResolveEvent,
} from '@poke-fighter/shared';

export type LogEntry = { type: 'normal' | 'round-start'; text: string };

interface BattleContextValue {
  state: BattleState | null;
  mySlotId: string;
  actionRequest: ActionRequestPayload | null;
  switchRequest: SwitchRequestPayload | null;
  turnLog: LogEntry[];
  submitAction: (payload: import('@poke-fighter/shared').ActionSubmitPayload) => void;
}

const BattleContext = createContext<BattleContextValue | null>(null);

export function useBattle(): BattleContextValue {
  const ctx = useContext(BattleContext);
  if (!ctx) throw new Error('useBattle must be used inside BattleProvider');
  return ctx;
}

interface Props {
  mySlotId: string;
  initialState?: BattleState | null;
  children: React.ReactNode;
}

export function BattleProvider({ mySlotId, initialState, children }: Props) {
  const [state, setState] = useState<BattleState | null>(initialState ?? null);
  const [actionRequest, setActionRequest] = useState<ActionRequestPayload | null>(null);
  const [switchRequest, setSwitchRequest] = useState<SwitchRequestPayload | null>(null);
  const [turnLog, setTurnLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('battle:start', ({ state: s }) => {
      setState(s);
      setTurnLog([{ type: 'normal', text: `Battle started! Turn ${s.turnNumber}` }]);
    });

    socket.on('state:sync', (s: BattleState) => {
      setState(s);
    });

    socket.on('turn:resolve', ({ turnNumber, events, state: s }: TurnResolvePayload) => {
      setState(s);
      const roundEntry: LogEntry = { type: 'round-start', text: `-------Round ${turnNumber - 1}-------` };
      const eventEntries: LogEntry[] = events
        .map((e) => eventToText(e))
        .filter(Boolean)
        .map((text) => ({ type: 'normal', text }));
      setTurnLog((prev) => [...prev, roundEntry, ...eventEntries].slice(-50));
    });

    socket.on('battle:history', ({ turns }: { turns: Array<{ turnNumber: number; events: TurnResolveEvent[] }> }) => {
      const entries: LogEntry[] = [];
      for (const turn of turns) {
        entries.push({ type: 'round-start', text: `-------Round ${turn.turnNumber - 1}-------` });
        for (const event of turn.events) {
          const text = eventToText(event);
          if (text) entries.push({ type: 'normal', text });
        }
      }
      setTurnLog(entries);
    });

    socket.on('action:request', (payload: ActionRequestPayload) => {
      if (payload.slotId === mySlotId) setActionRequest(payload);
    });
    socket.emit('action:resync');

    socket.on('switch:request', (payload: SwitchRequestPayload) => {
      if (payload.slotId === mySlotId) setSwitchRequest(payload);
    });

    socket.on('battle:end', ({ winningTeamId }) => {
      setTurnLog((prev) => [...prev, { type: 'normal', text: `Battle over! Winner: ${winningTeamId}` }]);
      setActionRequest(null);
    });

    return () => {
      socket.off('battle:start');
      socket.off('state:sync');
      socket.off('turn:resolve');
      socket.off('battle:history');
      socket.off('action:request');
      socket.off('switch:request');
      socket.off('battle:end');
    };
  }, [mySlotId]);

  function submitAction(payload: import('@poke-fighter/shared').ActionSubmitPayload) {
    getSocket().emit('action:submit', payload);
    setActionRequest(null);
    setSwitchRequest(null);
  }

  return (
    <BattleContext.Provider value={{ state, mySlotId, actionRequest, switchRequest, turnLog, submitAction }}>
      {children}
    </BattleContext.Provider>
  );
}

function eventToText(event: TurnResolveEvent): string {
  switch (event.type) {
    case 'move-used': return `${String(event.data['attackerName'])} used ${String(event.data['moveName'])}!`;
    case 'damage-dealt': return `Dealt ${String(event.data['damage'])} damage to ${String(event.data['targetSlotId'])}.`;
    case 'faint': return `${String(event.data['slotId'])}'s Pokémon fainted!`;
    case 'heal': return `${String(event.data['slotId'])} restored HP.`;
    case 'status-applied': return `${String(event.data['target'])} was ${String(event.data['status'])}!`;
    case 'terastallize': return `${String(event.data['slotId'])} Terastallized into ${String(event.data['teraType'])} type!`;
    default: return '';
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -w packages/client
```

Expected: all BattleContext tests pass; all TurnLog tests pass; all other client tests pass.

- [ ] **Step 5: Full TypeScript check for client**

```bash
npm run typecheck -w packages/client
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/battle/BattleContext.tsx packages/client/src/battle/__tests__/BattleContext.test.tsx
git commit -m "feat(client): typed LogEntry turnLog, round-start separators, battle:history listener"
```

---

## Task 9: Final typecheck and verification

- [ ] **Step 1: Run full test suite**

```bash
npm test -w packages/server && npm test -w packages/client
```

Expected: all tests pass across both packages.

- [ ] **Step 2: Run typechecks for all packages**

```bash
npm run typecheck -w packages/shared && npm run typecheck -w packages/server && npm run typecheck -w packages/client
```

Expected: no errors in any package.

- [ ] **Step 3: Commit if any stray fixes were needed**

If any small fixes were required above, collect them:

```bash
git add -p
git commit -m "fix: resolve remaining type errors from battle log history feature"
```
