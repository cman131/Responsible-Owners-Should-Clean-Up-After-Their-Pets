# Portal Auth Requires Globally Unique Player Keys

## State

Complete

## Summary

The player portal authenticates by scanning all player profiles for a key that matches the one typed by the user (`db.players.list().find(p => p.playerKey === playerKey)`). This forces every player key to be globally unique across all profiles. If two players coincidentally choose the same key, only the first match returned by the database is authenticated — the other player is silently locked out of their own profile. Fixing this requires adding a player-name dropdown to the entry screen so the user selects their profile first, then validating the key only against that specific player's stored key.

## Problem Details

**File:** `packages/server/src/socket/handlers/playerPortalHandlers.ts:23-24`

The auth handler iterates all players to find a matching key, requiring global uniqueness:

```ts
socket.on('player:portal-auth', ({ playerKey }) => {
  const match = db.players.list().find((p) => p.playerKey === playerKey);
```

**File:** `packages/client/src/pages/PlayerPortalPage.tsx:194-217`

The entry-phase UI renders only a single "Player Key" text input. There is no mechanism for the user to indicate which profile they are trying to access before submitting the key.

**File:** `packages/shared/src/types/events.ts:235`

The `player:portal-auth` client event carries only `{ playerKey: string }` — no profile identifier — so the server has no choice but to search by key across all profiles:

```ts
'player:portal-auth': (payload: { playerKey: string }) => void;
```

## Impact

- Player keys must be globally unique, a constraint that is invisible to players and not enforced anywhere in the admin UI.
- Two players who choose the same key (e.g. `"pikachu"`) will result in one being unable to access their profile, with no clear error indicating why.
- The constraint gets harder to maintain as the player roster grows.

## Suggested Fix

1. **Add a roster request event pair to shared types** (`packages/shared/src/types/events.ts`):
   - `ClientToServerEvents`: add `'player:portal-roster-request': () => void`
   - `ServerToClientEvents`: add `'player:portal-roster': (payload: { players: Array<{ profileId: string; displayName: string }> }) => void`

2. **Update `registerPlayerPortalHandlers`** (`packages/server/src/socket/handlers/playerPortalHandlers.ts`):
   - Add a handler for `player:portal-roster-request` that emits `player:portal-roster` with all profiles mapped to `{ profileId, displayName }`.
   - Update the `player:portal-auth` handler to accept `{ profileId: string; playerKey: string }`, look up the player by `profileId` first, then verify `p.playerKey === playerKey` against only that player. Return a generic error (`'Invalid player key.'`) if either the profile is not found or the key does not match (avoid leaking which one failed).

3. **Update `PlayerPortalPage.tsx`** (`packages/client/src/pages/PlayerPortalPage.tsx`):
   - On mount, emit `player:portal-roster-request` and store the response as local state.
   - In the entry phase, render a `<select>` dropdown populated from the roster (keyed by `profileId`, labelled by `displayName`) above the key input.
   - Pass `{ profileId: selectedProfileId, playerKey }` in `handleSubmit`.
   - Disable the ENTER button until both a profile is selected and the key field is non-empty.

4. **Update shared event type for `player:portal-auth`** to `{ profileId: string; playerKey: string }`.

5. **Update tests** to use the new event shape and cover the roster request/response cycle.

## Related Files

- `packages/client/src/pages/PlayerPortalPage.tsx`
- `packages/client/src/pages/__tests__/PlayerPortalPage.test.tsx`
- `packages/server/src/socket/handlers/playerPortalHandlers.ts`
- `packages/server/src/socket/__tests__/playerPortalHandlers.test.ts`
- `packages/shared/src/types/events.ts`
