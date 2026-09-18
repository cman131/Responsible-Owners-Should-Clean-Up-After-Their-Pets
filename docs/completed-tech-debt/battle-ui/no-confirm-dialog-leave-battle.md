# 19 — No Confirmation Dialog When Player Leaves Battle

## State

Complete

## Summary

The "← Home" button on `BattlePage` immediately emits `player:leave`, removes `mySlotId` from sessionStorage, and navigates away — with no confirmation step. During an active battle this is easy to click accidentally (e.g. reaching for the action panel area or fat-finger on mobile), and the consequence is the player is removed from the battle, blocking turn resolution for others.

## Problem Details

**File:** `packages/client/src/pages/BattlePage.tsx:28`

```ts
function handleGoHome() {
  getSocket().emit('player:leave');
  sessionStorage.removeItem('mySlotId');
  navigate('/');
}
```

Called directly on button click with no dialog. The button is positioned `top: 16, left: 16` in absolute position — close to the edge of the UI and easily mis-clicked.

## Impact

- Player accidentally exits an ongoing battle
- Other participants are blocked until the admin forfeits the disconnected team
- No ability to undo once the socket emits `player:leave`
- After the battle ends the button is equally prominent in the `BattleResultPanel`, where no confirmation is needed — so the dialog should only appear while the battle is active

## Suggested Fix

Gate the confirmation on whether the battle is still in progress:

```ts
function handleGoHome() {
  if (state && !battleResult) {
    if (!confirm('Leave this battle? You may not be able to rejoin.')) return;
  }
  getSocket().emit('player:leave');
  sessionStorage.removeItem('mySlotId');
  navigate('/');
}
```

For a better UX, replace `confirm()` with an inline modal or a two-click pattern (first click changes button to "Confirm Exit?", second click executes). Native `confirm()` is sufficient as a quick fix.

## Related Files

- `packages/client/src/pages/BattlePage.tsx`
