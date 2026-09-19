# Player Portal: Access Key and Server Socket Infrastructure

## State

Complete

## Summary

There is no server-side mechanism for players to authenticate as themselves and manage their own profile outside of a battle. `PlayerProfile` has no key field, the database has no column for it, and no socket events exist for a player-scoped read/write channel. This plan adds a `playerKey` string to `PlayerProfile`, migrates the database, exposes the key as an editable field in the admin `PlayerProfileEditor`, and creates the socket events and server handler that the player portal will use to authenticate and read/write its own limited profile data.

## Problem Details

**File:** `packages/shared/src/types/registry.ts:23`

```typescript
export interface PlayerProfile {
  profileId: string;
  displayName: string;
  defaultTeam?: TeamTemplate;
  bank?: PokemonSet[];
  inventory?: Record<string, number>;
  createdAt: string;
}
```

No `playerKey` field exists. The portal needs a plaintext key (no hashing — intranet/DnD use) per player that the admin sets and the player enters to authenticate.

**File:** `packages/server/src/db/Database.ts:204-213`

```typescript
CREATE TABLE IF NOT EXISTS players (
  profileId    TEXT PRIMARY KEY,
  displayName  TEXT NOT NULL,
  createdAt    TEXT NOT NULL,
  defaultTeam  TEXT,
  bank         TEXT
);
```

No `playerKey` column. The existing `ALTER TABLE` migration pattern (lines 237–246) can be reused to add it safely.

**File:** `packages/server/src/socket/SocketServer.ts:27-33`

```typescript
this.io.use((socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (token && token === adminToken) {
    socket.data['isAdmin'] = true;
  }
  next();
});
```

The middleware only handles admin auth. Player portal auth should be handled via a dedicated `player:portal-auth` socket event after connection (key lookup against DB), rather than in middleware, to keep the connect flow simple.

**File:** `packages/shared/src/types/events.ts:33-54`

The `AdminActionPayload` union and `ClientToServerEvents`/`ServerToClientEvents` maps have no player portal entries. New dedicated events are needed to enforce that portal actions cannot be confused with admin actions and the server can scope them correctly.

## Impact

- Players have no way to self-manage their team or items; everything must go through the admin.
- Without a key field, there is no foundation for the portal auth gate or per-player access control.
- Without dedicated socket events, a portal would have to reuse `admin:action`, which the server rejects for non-admin sockets.

## Suggested Fix

1. Add `playerKey?: string` to `PlayerProfile` in `packages/shared/src/types/registry.ts`.

2. Add a `ALTER TABLE players ADD COLUMN playerKey TEXT` migration in `Database.ts` using the same try/catch pattern as the existing migrations at lines 237–246.

3. Update `PlayersStore.list()` (line 6) and `PlayersStore.save()` (line 22) to include `playerKey` in the SELECT/INSERT/UPDATE.

4. Add a "PLAYER KEY" text input to `PlayerProfileEditor.tsx` (after the display name field, line 74). The admin types a short plaintext key; the field is just a controlled `<input>` bound to a new `key` state variable included in the save payload.

5. Add new events to `packages/shared/src/types/events.ts`:
   - `ClientToServerEvents`: `'player:portal-auth'` with `{ playerKey: string }`, `'player:portal-save'` with `{ profileId: string; team: PokemonSet[]; bank: PokemonSet[] }`
   - `ServerToClientEvents`: `'player:portal-data'` with `{ profile: PlayerProfile }`, `'player:portal-error'` with `{ message: string }`, `'player:portal-items'` with `{ results: HeldItem[] }`

6. Create `packages/server/src/socket/handlers/playerPortalHandlers.ts` with a `registerPlayerPortalHandlers` function that:
   - On `player:portal-auth`: looks up the key in `db.players.list()`, sets `socket.data['portalProfileId']` if found, emits `player:portal-data` on success or `player:portal-error` on failure.
   - On `player:portal-save`: verifies `socket.data['portalProfileId']` matches the incoming `profileId`, validates that only `team` order, `bank` order, `heldItem`, and `nickname` fields changed (no stats/moves/ability/level/species changes), then calls `db.players.save()`.
   - On a new `player:portal-items-query` event: returns implemented equippable items via `DataLoader` (same logic as `data:query` in `adminHandlers.ts` lines 109–119).

7. Wire `registerPlayerPortalHandlers` in `SocketServer.ts` for all non-admin connections (alongside the existing lobby/battle handler registration at lines 45–54).

## Related Files

- `packages/shared/src/types/registry.ts`
- `packages/shared/src/types/events.ts`
- `packages/server/src/db/Database.ts`
- `packages/server/src/socket/SocketServer.ts`
- `packages/server/src/socket/handlers/adminHandlers.ts`
- `packages/server/src/socket/handlers/playerPortalHandlers.ts` (new)
- `packages/client/src/admin/PlayerProfileEditor.tsx`
