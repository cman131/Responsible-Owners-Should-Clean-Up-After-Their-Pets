# Admin Logout Design

## Overview

Add a LOG OUT button to `HubPanel` so admins can explicitly end their session. Currently the only way to clear an admin session is to wait for the 8-hour TTL or manually remove `poke_admin_session` from localStorage.

## Approach

Prop-thread an `onLogout` callback from `AdminShell` → `AdminRouter` → `HubPanel`. This follows the existing pattern used by `onBack`, `onWatch`, and all other callbacks in the admin panel tree.

## Architecture & Data Flow

```
AdminShell (owns auth state)
  └── handleLogout()
        ├── localStorage.removeItem('poke_admin_session')
        ├── setAuthenticated(false)      → renders login form
        └── getSocket().disconnect()     → tears down server-side admin socket

AdminShell renders: <AdminRouter onLogout={handleLogout} />

AdminRouter (owns nav state)
  └── passes onLogout to HubPanel only

HubPanel
  └── LOG OUT button (position: absolute, top-right)
```

`socket.disconnect()` sets socket.io's internal `autoReconnect` flag to false, so the socket will not attempt to reconnect after an intentional logout.

The LOG OUT button only appears on `HubPanel`. Admins in sub-panels (Setup, Battles, Registry, Control) must navigate back to hub before logging out. This is acceptable.

## Components

### `AdminShell.tsx`
- Add `handleLogout`: clears `SESSION_KEY` from localStorage, calls `setAuthenticated(false)`, calls `getSocket().disconnect()`
- Pass `onLogout={handleLogout}` to `<AdminRouter>`

### `AdminRouter.tsx`
- Accept `{ onLogout: () => void }` prop
- Forward `onLogout` to `<HubPanel>` only; all other panels are unchanged

### `HubPanel.tsx`
- Add `onLogout: () => void` to `HubPanelProps`
- Wrap existing content in a `position: relative` outer div (so the absolute button stays inside HubPanel rather than escaping to the viewport)
- Render LOG OUT button: `position: absolute, top: 16, right: 16`, muted/grey styling (red is reserved for danger/battle actions)

## Testing

| File | New tests |
|------|-----------|
| `HubPanel.test.tsx` | `onLogout` is called when LOG OUT button is clicked |
| `AdminRouter.test.tsx` | Update HubPanel mock to expose `onLogout`; clicking it calls the prop |
| `AdminShell.test.tsx` | After `admin:authenticated`, clicking LOG OUT clears localStorage and shows login form |

## Out of Scope

- Logout from sub-panels (Setup, Battles, Registry, Control)
- Server-side session invalidation (the server-side admin socket is torn down via `socket.disconnect()`)
- Any visual changes to panels other than HubPanel
