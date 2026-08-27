# Battle Log History & Round Markers

**Date:** 2026-08-26

## Problem

1. The admin view does not receive live battle log updates. The `BattleContext` listens on `turn:resolve` (a Socket.IO room event), but the admin socket never joins the battle room — so all turns after the initial `state:sync` are silently dropped.
2. There are no round-start markers in the log, making it impossible to tell which events happened in which round.
3. Neither admins nor players who connect/reconnect after a battle has started see any log history — only the current state snapshot.

## Solution Overview

Four coordinated changes:

1. Admin socket joins the battle's Socket.IO room on `battles:connect` (and leaves the old room).
2. A new `eventLog` column in the `battles` DB table accumulates resolved-turn events, enabling persistent history across server restarts.
3. A new `battle:history` socket event delivers accumulated history to any client (admin or player) on connect/reconnect.
4. The client `turnLog` becomes a typed `LogEntry[]` so round-start separators can be styled distinctly.

---

## Section 1: Admin Socket Room Management

**File:** `packages/server/src/socket/handlers/adminHandlers.ts`

In the `battles:connect` case:

1. Read `socket.data['watchingBattleId']` (the previously watched battle, if any).
2. If set, call `socket.leave('battle:<old>')` to stop receiving events from the old battle.
3. Call `socket.join('battle:<new>')` so future `turn:resolve`, `battle:end`, `exp:award`, `level:up` events are delivered.
4. Set `socket.data['watchingBattleId'] = battleId`.

No client changes are needed for live updates — `BattleContext` already handles `turn:resolve` and `battle:end`.

---

## Section 2: DB Event Log

**File:** `packages/server/src/db/Database.ts`

### Schema migration

In the `AppDatabase` constructor, after the existing `CREATE TABLE IF NOT EXISTS battles` block, add:

```sql
ALTER TABLE battles ADD COLUMN eventLog TEXT NOT NULL DEFAULT '[]'
```

Wrapped in `try/catch` — SQLite throws if the column already exists, which is the correct no-op behavior on subsequent server starts.

### New BattlesStore methods

**`appendTurnEvents(battleId: string, turn: { turnNumber: number; events: TurnResolveEvent[] }): void`**
- Reads `eventLog` for the battle, parses it, pushes the new turn entry, writes back.

**`getEventLog(battleId: string): Array<{ turnNumber: number; events: TurnResolveEvent[] }>`**
- Reads and parses `eventLog` for the battle. Returns `[]` if not found.

### Write path

**File:** `packages/server/src/socket/SocketServer.ts`

In `startBattle`'s `onTurnResolved` callback, after the existing `db.battles.updateState(...)` call, add:

```ts
db.battles.appendTurnEvents(initialState.battleId, { turnNumber: newState.turnNumber, events });
```

---

## Section 3: `battle:history` Socket Event

### Shared type

**File:** `packages/shared/src/types/events.ts`

Add to `ServerToClientEvents`:

```ts
'battle:history': (payload: { turns: Array<{ turnNumber: number; events: TurnResolveEvent[] }> }) => void
```

### Admin connect flow

**File:** `packages/server/src/socket/handlers/adminHandlers.ts`

In `battles:connect`, after emitting `state:sync`, add:

```ts
socket.emit('battle:history', { turns: db.battles.getEventLog(battleId) });
```

`db` is already a parameter of `registerAdminHandlers`.

### Player join/reconnect flow

**File:** `packages/server/src/socket/handlers/lobbyHandlers.ts`

Add a `getEventLog: (battleId: string) => Array<{ turnNumber: number; events: TurnResolveEvent[] }>` parameter to `registerLobbyHandlers`. In `SocketServer.ts`, pass `(battleId) => this.db.battles.getEventLog(battleId)`.

In the `player:join` handler, after the existing `state:sync` emit, add:

```ts
socket.emit('battle:history', { turns: getEventLog(battleId) });
```

---

## Section 4: Client — LogEntry Type, BattleContext, TurnLog

### LogEntry type

**File:** `packages/client/src/battle/BattleContext.tsx`

```ts
export type LogEntry = { type: 'normal' | 'round-start'; text: string }
```

This is a client-only display type — not added to shared.

### BattleContext changes

- `turnLog` state: `string[]` → `LogEntry[]`
- `BattleContextValue.turnLog`: `string[]` → `LogEntry[]`
- `battle:start` handler: push `{ type: 'normal', text: 'Battle started! Turn 1' }`
- `turn:resolve` handler: prepend `{ type: 'round-start', text: '-------Round N-------' }` where N = `turnNumber - 1` (the payload's `turnNumber` is the *next* turn after resolution; subtract 1 to label the round that just happened), then append each event converted via `eventToText` as `{ type: 'normal', text }`. Filter out empty strings before wrapping.
- New `battle:history` listener: convert all stored turns to `LogEntry[]` using the same round-start + events pattern (N = `turn.turnNumber - 1` for each entry), then **replace** `turnLog` entirely (handles both first connect and reconnect). Added to the `useEffect` cleanup.

### TurnLog changes

**File:** `packages/client/src/battle/overlays/TurnLog.tsx`

- Prop: `messages: string[]` → `messages: LogEntry[]`
- `normal` entries: existing style (`color: '#ccc'`, `fontSize: 13`)
- `round-start` entries: `color: '#f0c040'`, `fontSize: 11`, `letterSpacing: 2`, `textAlign: 'center'`
- Filter: `messages.filter(m => m.text)` (replaces `messages.filter(Boolean)`)

### ControlPanel

No change needed — `turnLog` from `useBattle()` flows through automatically.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types/events.ts` | Add `battle:history` to `ServerToClientEvents` |
| `packages/server/src/db/Database.ts` | Migration guard, `appendTurnEvents`, `getEventLog` |
| `packages/server/src/socket/SocketServer.ts` | Call `appendTurnEvents` in `onTurnResolved`; pass `getEventLog` to `registerLobbyHandlers` |
| `packages/server/src/socket/handlers/adminHandlers.ts` | Room join/leave on `battles:connect`; emit `battle:history` |
| `packages/server/src/socket/handlers/lobbyHandlers.ts` | Accept `getEventLog` param; emit `battle:history` on `player:join` |
| `packages/client/src/battle/BattleContext.tsx` | `LogEntry` type; typed `turnLog`; `battle:history` listener; round-start entries |
| `packages/client/src/battle/overlays/TurnLog.tsx` | Accept `LogEntry[]`; style round-start entries |
