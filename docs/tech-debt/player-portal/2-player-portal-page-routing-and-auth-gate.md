# Player Portal: Page, Routing, and Auth Gate

## State

New

## Summary

After the server supports player portal authentication (see `player-access-key-and-portal-socket-infrastructure.md`), the client needs a dedicated `/player` route with a key-entry authentication gate. The player lands on a simple form, submits their key over the socket, and if valid receives their profile from the server. The home page (`LobbyPage`) needs a discoverable entry point. This plan covers routing, the socket auth connection mode, the auth flow UI, and the portal shell (Team/Bank/Inventory tabs as placeholders for the management plans that follow).

## Problem Details

**File:** `packages/client/src/App.tsx:6-13`

```typescript
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/battle" element={<BattlePage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
```

No `/player` route exists. Adding one here is the entry point for the entire portal.

**File:** `packages/client/src/pages/LobbyPage.tsx:94-154`

The lobby UI shows only a battle selector and a JOIN BATTLE button. Players have no path from here to team management. A "MANAGE TEAM" secondary button needs to be added below the main action area.

**File:** `packages/client/src/socket.ts:22-26`

```typescript
export function connectAsPlayer(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}
```

No auth-carrying connection mode for the player portal. A `connectAsPlayerPortal()` function is needed that connects without any special auth (the key is submitted via event after connection, not in handshake).

## Impact

- Players cannot navigate to a management page at all; the feature is blocked without this routing layer.
- Without an auth gate, anyone on the LAN could view any player's profile.
- The lobby currently offers no self-service path; players must ask the admin for every change.

## Suggested Fix

1. Add `<Route path="/player" element={<PlayerPortalPage />} />` to `App.tsx`.

2. Add a "MANAGE TEAM" button in `LobbyPage.tsx` that navigates to `/player` via `useNavigate`. Place it below the JOIN BATTLE button (after line 152) as a secondary action in the same style as the existing UI.

3. Add `connectAsPlayerPortal()` to `socket.ts` — connects as a regular player (same as `connectAsPlayer`). The key is transmitted post-connection via the `player:portal-auth` event, not in handshake auth. This keeps the socket reusable if the player also later navigates to the lobby.

4. Create `packages/client/src/pages/PlayerPortalPage.tsx` with three phases:
   - **Phase: entry** — A styled box matching the lobby aesthetic with a single "PLAYER KEY" text input and a "ENTER" button. On submit, call `connectAsPlayerPortal()` then emit `player:portal-auth` with the key.
   - **Phase: loading** — Shows a "Authenticating…" spinner while waiting for the server response.
   - **Phase: portal** — Shows the authenticated player's `displayName` as a header, with Team / Bank / Inventory tab buttons (content rendered by child components built in subsequent plans). Includes a "← Back to Lobby" link.
   - Subscribe to `player:portal-data` (success) and `player:portal-error` (failure) in a `useEffect`. On error, return to the entry phase with the error message displayed.

5. The portal page holds `profile: PlayerProfile` state once authenticated. Pass it as props to the tab components (built in later plans).

## Related Files

- `packages/client/src/App.tsx`
- `packages/client/src/pages/LobbyPage.tsx`
- `packages/client/src/socket.ts`
- `packages/client/src/pages/PlayerPortalPage.tsx` (new)
