# Tech Debt: Reconnect Path Failures

## State

Complete

Two bugs in the reconnect path that leave a player unable to participate after rejoining mid-battle. Both stem from the server's reconnect handler being incomplete.

---

## 1 — Reconnecting Player Stuck When Awaiting Forced Switch

### Summary

If a player's active Pokémon faints and they disconnect before submitting their replacement switch, they cannot recover when they reconnect. The server's reconnect path only re-sends a pending `action:request` — it never re-sends a `switch:request`. The player arrives back at the battle and sees "Waiting for others..." indefinitely, stalling the turn for everyone.

### Problem Details

The server's reconnect handler calls `getPendingActionRequest`, which explicitly returns `null` when forced switches are pending:

```ts
// Server reconnect path
const pending = getPendingActionRequest(battleRoom, slotId);
if (pending) socket.emit('action:request', pending);
// switch:request is never re-sent
```

`getPendingActionRequest` guards:
```ts
if (battleRoom.hasPendingSwitchRequest(slotId)) return null;
```

So a reconnecting player in a forced-switch state receives neither an `action:request` nor a `switch:request`. The client renders "Waiting for others..." and the turn can never resolve.

### Location

- Server reconnect handler (look for `getPendingActionRequest` call on reconnect)
- `BattlePage.tsx` — client side, waiting state render

### Impact

The battle stalls for all participants. The admin's only recourse is forfeiting the disconnected player's team entirely. This is a hard block with no graceful recovery path.

### Suggested Fix

Add a parallel check for pending switch requests in the reconnect handler:

```ts
const pendingAction = getPendingActionRequest(battleRoom, slotId);
if (pendingAction) {
  socket.emit('action:request', pendingAction);
} else {
  const pendingSwitch = getPendingSwitchRequest(battleRoom, slotId);
  if (pendingSwitch) socket.emit('switch:request', pendingSwitch);
}
```

Also remove or relax the `hasPendingSwitchRequest` guard in `getPendingActionRequest` so both paths are retrievable independently.

---

## 2 — Battle History Log Incomplete on Reconnect

### Summary

`BattleContext` has two functions that convert turn events to text: `eventsToPlaybackEntries` (used for animated live playback) and `eventToText` (used to populate the turn log when `battle:history` arrives on reconnect). `eventToText` is missing handlers for a large set of event types. Players who reconnect mid-battle receive a truncated history.

### Problem Details

`eventToText` is missing handlers for: hazard damage, ability triggers, screen breaks, status blocks, item consumption, volatile statuses, move notes, move blocks, endure survivors, and more. `eventsToPlaybackEntries` handles these correctly, so the gap is isolated to the reconnect text-conversion path.

The result is a history log that shows only a fraction of what actually happened in prior turns.

### Location

- `packages/client/src/battle/BattleContext.tsx` — `eventToText` function
- Compare against `eventsToPlaybackEntries` in the same file for the full list of handled types

### Impact

Players who reconnect mid-battle have no reliable record of what happened before they rejoined. In a long battle this means they may not know why HP is low, what hazards are up, or what statuses are active.

### Suggested Fix

Audit `eventsToPlaybackEntries` and port every event handler that produces user-visible text into `eventToText`. The two functions can likely share a helper:

```ts
function eventToLogLine(event: BattleEvent): string | null {
  switch (event.type) {
    case 'move': return `${event.slotId} used ${event.moveName}!`;
    case 'damage': return `${event.slotId} took ${event.amount} damage.`;
    case 'hazard-damage': return `${event.slotId} was hurt by spikes!`;
    // ... all types
    default: return null;
  }
}
```

Then both `eventsToPlaybackEntries` and `eventToText` call `eventToLogLine`, eliminating the divergence entirely.
