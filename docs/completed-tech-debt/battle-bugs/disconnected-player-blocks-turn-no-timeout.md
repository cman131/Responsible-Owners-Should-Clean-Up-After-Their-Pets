# 14 — Disconnected Player Blocks Turn Resolution With No Timeout or Bypass

## State

Complete

## Summary

When a player disconnects mid-turn without having submitted their action, `BattleRoom.allActionsCollected()` will never return `true` for that turn. The battle stalls indefinitely. The admin's only recourse is forfeiting the disconnected player's entire team. There is no auto-submit timeout, no "skip action for disconnected slot" option, and no targeted bypass.

## Problem Details

**File:** `packages/server/src/socket/BattleRoom.ts:416`

```ts
private allActionsCollected(): boolean {
  return this.activeSlotsNeedingAction().every((slotId) => this.pendingActions.has(slotId));
}
```

If a slot that needs an action has no entry in `pendingActions` (because the player disconnected), this returns `false` forever.

**File:** `packages/server/src/socket/SocketServer.ts:73`

On disconnect, the server marks the player as disconnected and notifies admins, but takes no action to unblock the turn.

The admin panel's only turn-ending option is team forfeit (`handleForfeit` in `ControlPanel.tsx`), which declares a winner and ends the entire battle.

## Impact

- One disconnected player permanently stalls the battle for all other participants
- Admin must choose between waiting indefinitely or forfeiting a whole team (heavy-handed)
- The 2-minute reconnect window in `LobbyManager` means a player could reconnect and resume, but there's no UI feedback showing this window or its countdown

## Suggested Fix

Two complementary approaches:

**Short-term (admin bypass):** Add a "Submit default action for slot" admin action. On disconnect, auto-select Struggle (or the first non-disabled move) and emit it as a pending action for that slot. This unblocks the turn without ending the battle.

**Long-term (auto-timeout):** When `markDisconnected` is called for a player in an active battle, start a server-side timer (e.g. 60 seconds). If the player hasn't reconnected and submitted by then, auto-submit their action (Struggle or first valid move). Emit a `turn:resolve` event noting the auto-play. Clear the timer on reconnect.

## Related Files

- `packages/server/src/socket/BattleRoom.ts`
- `packages/server/src/socket/SocketServer.ts`
- `packages/server/src/socket/LobbyManager.ts`
- `packages/client/src/admin/ControlPanel.tsx`
