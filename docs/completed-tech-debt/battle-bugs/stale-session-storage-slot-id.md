# 17 — Stale `mySlotId` in sessionStorage When Player Closes Tab

## State

Complete

## Summary

`BattlePage` reads the player's slot identity from `sessionStorage`:

```ts
const mySlotId = sessionStorage.getItem('mySlotId') ?? 'a1';
```

`sessionStorage.removeItem('mySlotId')` is only called inside `handleGoHome()`, which requires the player to click the "← Home" button. If a player closes the browser tab or navigates away without clicking Home, the stale slot ID from the previous battle persists in `sessionStorage`. On their next visit they may be assigned the wrong slot in a new battle, or the fallback `'a1'` may not correspond to their actual slot in the new battle.

## Problem Details

**File:** `packages/client/src/pages/BattlePage.tsx:16-17`

```ts
const mySlotId = sessionStorage.getItem('mySlotId') ?? 'a1';
```

**File:** `packages/client/src/pages/BattlePage.tsx:29`

Cleanup only happens on explicit navigation:
```ts
function handleGoHome() {
  getSocket().emit('player:leave');
  sessionStorage.removeItem('mySlotId');
  navigate('/');
}
```

If the player closes the tab, refreshes to lobby, or the browser crashes, `mySlotId` is never cleared.

## Scenarios

1. **Previous battle's slot leaks into new battle:** Player joins battle A as `b2`, tab closes. They open a new tab and join battle B as `a1`. `sessionStorage` still has `b2` from battle A. The new battle shows them as `b2` (which might not exist in battle B).
2. **Wrong fallback:** If `sessionStorage` is empty, `'a1'` is used as the default regardless of which slot the player actually joined.

## Impact

- Silent wrong slot assignment — player sees another player's moves requested, or no action panel at all
- Could cause `mySlotId` on `BattlePage` to not match any slot in the current `BattleState`

## Suggested Fix

Two complementary changes:

1. **Include `slotId` in the `state:sync` payload on navigation.** Currently `LobbyPage` navigates to `/battle` with `state: { battleState }` but not `slotId`. Add it:
```ts
navigate('/battle', { state: { battleState: state, slotId: selectedSlotId } });
```
Then `BattlePage` reads from nav state first, falling back to sessionStorage.

2. **Clear sessionStorage when navigating to `/`** in `LobbyPage.useEffect` cleanup or on mount:
```ts
useEffect(() => {
  sessionStorage.removeItem('mySlotId');
  ...
}, []);
```

## Related Files

- `packages/client/src/pages/BattlePage.tsx`
- `packages/client/src/pages/LobbyPage.tsx`
