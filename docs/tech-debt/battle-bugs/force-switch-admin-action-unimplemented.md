# 08 — `force-switch` Admin Action Is Not Implemented

## State

Complete

## Summary

The `force-switch` case in the admin action handler exists as a named case with an empty body. Any UI feature or future code that emits `admin:action { type: 'force-switch' }` silently does nothing.

## Problem Details

**File:** `packages/server/src/socket/handlers/adminHandlers.ts:155`

```ts
case 'force-switch':
  break;
```

No logic, no error, no response emitted. The case is a stub that was never filled in.

## Impact

- Any admin UI element that triggers `force-switch` has no effect
- The intent appears to be allowing the admin to force a specific slot to switch out mid-turn (useful when a player disconnects or for NPC management)
- Without this, the only recourse when a player is stuck is full-team forfeit

## Suggested Fix

Implement the handler. Expected behavior:
1. Receive `{ battleId, slotId }` from the payload
2. Look up the room and find the slot
3. If the slot has living Pokémon other than the active one, trigger the server-side switch request for that slot (similar to how `onSwitchRequestCb` works after a faint)
4. Emit `switch:request` to the targeted player socket (or NPC request to admin if NPC)

## Related Files

- `packages/server/src/socket/handlers/adminHandlers.ts`
- `packages/server/src/socket/BattleRoom.ts` (reference `onSwitchRequestCb` pattern)
