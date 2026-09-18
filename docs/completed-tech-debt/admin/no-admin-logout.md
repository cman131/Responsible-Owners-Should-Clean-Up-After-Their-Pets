# Tech Debt: No Logout Button in AdminShell

## State
Complete

## Summary

Once an admin is authenticated, there is no logout button or session management UI. The 8-hour session can only be ended by manually clearing localStorage or waiting for it to expire.

## Location

- `packages/client/src/admin/AdminShell.tsx`
- `packages/client/src/admin/HubPanel.tsx` (natural place to surface the button)

## Root Cause

`AdminShell` handles session storage (`poke_admin_session` key in localStorage) and renders `AdminRouter` when authenticated. Neither `AdminRouter` nor `HubPanel` has a prop or mechanism to trigger logout. The session key is only cleared on authentication error, not on user intent.

```tsx
// AdminShell.tsx — session cleared only on error
const onError = ({ message }: { message: string }) => {
  localStorage.removeItem(SESSION_KEY);
  // ...
};
```

## Impact

- Shared admin workstations (e.g., an event laptop) cannot be quickly logged out between sessions.
- If an admin token needs to be rotated mid-event, there's no clean way to force re-authentication short of clearing storage.
- Minor: the "verified token" connect flow runs on every page load from the stored session, so a stale/invalid token produces an error message on load rather than a clean login form.

## Suggested Fix

Add a logout callback from `AdminRouter` → `AdminShell` and surface a button in `HubPanel`:

```tsx
// AdminShell.tsx
function handleLogout() {
  localStorage.removeItem(SESSION_KEY);
  setAuthenticated(false);
  getSocket().disconnect();
}

if (authenticated) return <AdminRouter onLogout={handleLogout} />;
```

```tsx
// HubPanel.tsx — small logout button in the corner
interface HubPanelProps {
  onSetup: () => void;
  onBattles: () => void;
  onRegistry: () => void;
  onLogout: () => void;
}

// In the top-right corner of the hub layout
<button onClick={onLogout} style={{ position: 'absolute', top: 16, right: 16, ... }}>
  LOG OUT
</button>
```

The socket should be disconnected on logout so the server-side admin socket is also torn down.
