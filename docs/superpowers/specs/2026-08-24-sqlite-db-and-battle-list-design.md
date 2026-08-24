# SQLite Database Layer + Admin Battle List

**Date:** 2026-08-24  
**Status:** Approved

## Overview

Replace the file-based `RegistryStore` with a unified SQLite database (via `better-sqlite3`) that covers all persistent data: player/NPC/team registry, battle history, and active battle state. On top of this foundation, add a Battles panel to the admin UI so the admin can see active and past battles and connect to any active one.

No data migration is required — the JSON file registry is abandoned in place.

---

## Database Layer

### Location

`packages/server/src/db/Database.ts`

### Schema

Four tables, created via `CREATE TABLE IF NOT EXISTS` on `AppDatabase` construction:

```sql
CREATE TABLE IF NOT EXISTS players (
  profileId    TEXT PRIMARY KEY,
  displayName  TEXT NOT NULL,
  defaultTeam  TEXT,   -- JSON: PokemonSet[]
  bank         TEXT    -- JSON: PokemonSet[]
);

CREATE TABLE IF NOT EXISTS npcs (
  profileId  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  team       TEXT  -- JSON: { pokemon: PokemonSet[] }
);

CREATE TABLE IF NOT EXISTS teams (
  templateId  TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  pokemon     TEXT NOT NULL  -- JSON: PokemonSet[]
);

CREATE TABLE IF NOT EXISTS battles (
  battleId       TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  status         TEXT NOT NULL CHECK(status IN ('active', 'ended')),
  winningTeamId  TEXT,           -- NULL until ended
  startedAt      INTEGER NOT NULL,  -- unix ms
  endedAt        INTEGER,           -- NULL until ended
  turnNumber     INTEGER NOT NULL DEFAULT 0,
  initialState   TEXT NOT NULL,  -- JSON: BattleState
  currentState   TEXT NOT NULL   -- JSON: BattleState, updated each turn
);
```

### `AppDatabase` class

Owns the `better-sqlite3` `Database` connection. Exposes four namespaced method groups:

**`db.players`**
- `list(): PlayerProfile[]`
- `save(profile: PlayerProfile): void` — upsert
- `delete(profileId: string): void`

**`db.npcs`**
- `list(): NpcProfile[]`
- `save(profile: NpcProfile): void` — upsert
- `delete(profileId: string): void`

**`db.teams`**
- `list(): TeamTemplate[]`
- `save(template: TeamTemplate): void` — upsert
- `delete(templateId: string): void`

**`db.battles`**
- `insert(state: BattleState): void` — called when battle starts; status = 'active'
- `updateState(battleId: string, state: BattleState): void` — called after each turn; updates `currentState` and `turnNumber`
- `markEnded(battleId: string, winningTeamId: string): void` — sets status = 'ended', sets `endedAt` and `winningTeamId`
- `list(): BattleSummary[]` — returns all rows as summaries (no full state blobs)
- `get(battleId: string): BattleState | null` — returns `currentState` for reconnecting

### DB file location

`packages/server/data/poke-fighter.db` — same `data/` directory used by the old registry JSON files.

---

## Deleted / Replaced

- `packages/server/src/registry/RegistryStore.ts` — deleted entirely
- `packages/server/src/registry/__tests__/RegistryStore.test.ts` — deleted; new tests written for `AppDatabase`
- `packages/server/data/registry/` — abandoned in place (no deletion required, no migration)

---

## Server Changes

### `SocketServer.ts`

- Constructs `AppDatabase` instead of `RegistryStore`
- Passes `db` to `registerAdminHandlers` (replacing `registry`)
- Adds battle persistence hooks after `startBattle()`:
  - Calls `db.battles.insert(initialState)` before `startBattle()`
  - Wires `room.onTurnResolved` to also call `db.battles.updateState(battleId, newState)`
  - Wires `room.onBattleEnd` to also call `db.battles.markEnded(battleId, winningTeamId)`
  - After each of those three writes, pushes a fresh `battles:data` event to all connected admin sockets

**Push helper (inline in SocketServer):**
```ts
const notifyAdminsOfBattles = () => {
  const summaries = db.battles.list();
  for (const s of io.sockets.sockets.values()) {
    if (s.data['isAdmin']) s.emit('battles:data', { battles: summaries });
  }
};
```

### `adminHandlers.ts`

- Parameter changes: receives `db: AppDatabase` instead of `registry: RegistryStore`
- All `registry.*` calls replaced with `db.players.*`, `db.npcs.*`, `db.teams.*` — method signatures are equivalent
- New cases added to the `admin:action` switch:
  - `'battles:list'` → `socket.emit('battles:data', { battles: db.battles.list() })`
  - `'battles:connect'` → `socket.emit('state:sync', db.battles.get(battleId))` — seeds ControlPanel with current state when admin connects to an existing battle

---

## Shared Types

### `events.ts`

**`AdminActionPayload.type` additions:**
```ts
| 'battles:list'
| 'battles:connect'
```

**`ServerToClientEvents` addition:**
```ts
'battles:data': (payload: { battles: BattleSummary[] }) => void;
```

**New `BattleSummary` interface** (exported from shared):
```ts
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
```

---

## Admin UI Changes

### `AdminRouter.tsx`

Navigation modes expand to include `'battles'`:

```ts
type Mode = 'setup' | 'registry' | 'battles' | null;
```

- `activeBattle` is set by a new `handleWatch(battleId)` function called from `BattlesPanel`. That function emits `admin:action` `battles:connect` (so the server sends `state:sync` with the current state) and then sets `activeBattle`.
- The `battle:start` auto-jump is removed — new battles appear in the Battles list instead.
- Back from `ControlPanel` returns to `BattlesPanel` (mode = `'battles'`), not Hub.

### `HubPanel.tsx`

Adds a third tile — **BATTLES** (blue, 📋 icon, "Active & history") — between the existing Setup and Registry tiles.

### New: `BattlesPanel.tsx`

`packages/client/src/admin/BattlesPanel.tsx`

**Props:** `{ onBack: () => void; onWatch: (battleId: string) => void }`

**Behavior:**
- On mount: emits `admin:action` `battles:list`; listens for `battles:data` to populate state
- Also listens for pushed `battles:data` events (server pushes on battle start/turn/end) for live updates
- Cleans up both listeners on unmount

**Layout (two sections):**

*Active* — green-bordered rows, each showing:
- Battle label
- Participant summary (`"Conor & Kyle vs Ash NPC & Misty NPC"`)
- Current turn number (`"● Turn 4"`)
- WATCH button → calls `onWatch(battleId)`

*Past* — grey-bordered rows, each showing:
- Battle label
- Participant summary (all slots across both teams)
- Winner: derived by finding the team in `BattleSummary.teams` whose index matches `winningTeamId` (`"team-a"` → index 0, `"team-b"` → index 1), then joining that team's slot display names
- Date + turn count (`"Aug 22 · 14 turns"`)
- No action button (read-only)

Empty state: if no battles exist yet, show a single muted message: "No battles yet. Start one from Battle Setup."

---

## What Does Not Change

- `BattleRoom.ts` — no changes; persistence hooks are wired from `SocketServer`, not inside the room
- `LobbyManager.ts` — no changes
- `lobbyHandlers.ts`, `battleHandlers.ts` — no changes
- All battle engine logic — untouched
- `ControlPanel.tsx` — no changes; it already handles `state:sync` for reconnection, which is what `battles:connect` sends
- Player-facing pages — no changes

---

## File Summary

| Action | Path |
|--------|------|
| NEW | `packages/server/src/db/Database.ts` |
| NEW | `packages/server/src/db/__tests__/Database.test.ts` |
| NEW | `packages/client/src/admin/BattlesPanel.tsx` |
| DELETE | `packages/server/src/registry/RegistryStore.ts` |
| DELETE | `packages/server/src/registry/__tests__/RegistryStore.test.ts` |
| MODIFY | `packages/server/src/socket/SocketServer.ts` |
| MODIFY | `packages/server/src/socket/handlers/adminHandlers.ts` |
| MODIFY | `packages/shared/src/types/events.ts` |
| MODIFY | `packages/client/src/admin/AdminRouter.tsx` |
| MODIFY | `packages/client/src/admin/HubPanel.tsx` |
