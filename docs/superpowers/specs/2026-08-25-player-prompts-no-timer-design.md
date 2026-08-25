# Player Action Prompts + Timer Removal Design

**Date:** 2026-08-25

## Problem

Two related bugs prevent battles from working correctly:

1. **Players never receive `action:request`.** `BattleRoom` fires `npc:action-request` via an `onNpcActionRequired` callback, but has no equivalent callback for human players. `SocketServer` never emits `action:request` to player sockets at turn start. The `getPendingActionRequest` + lobbyHandlers re-emit (added previously) only helps players who join mid-turn; players already connected when a turn starts never receive a prompt.

2. **The turn timer masks the above bug and creates new ones.** With no player prompt, the timer auto-submits move-0 for unsubmitted human slots after `timerSeconds` seconds. This causes turns to resolve with random moves, potentially fainting Pokémon, which then reduces legal targets for NPC moves in subsequent turns (making the NPC panel appear to auto-select the only surviving opponent).

## Goals

- Human players receive `action:request` at the start of every turn they are active in.
- Turns only resolve once every active slot (human and NPC) has submitted. No automatic fallback.
- Timer infrastructure is removed entirely from the codebase.

## Non-goals

- NPC re-sync for admins who open ControlPanel mid-turn (deferred to a future improvement).
- Any change to switch-request handling (forced switches after faints work correctly already).

---

## Design

### A. Player action delivery (BattleRoom + SocketServer)

**`BattleRoom`** gains:

```ts
type PlayerActionRequiredCallback = (
  requests: Array<{ slotId: string; request: ActionRequestPayload }>
) => void;
```

- New field: `private onPlayerActionRequiredCb: PlayerActionRequiredCallback | null = null`
- New public method: `onPlayerActionRequired(cb): void`
- New private method: `buildPlayerRequests()` — mirrors `buildNpcRequests()` exactly but filters for `!slot.isNpc` instead of `slot.isNpc`

`buildPlayerRequests()` fires in two places:
1. Constructor `setTimeout(..., 0)` — alongside the existing NPC deferred emit
2. `resolveTurn()` else-branch — after `pendingActions.clear()` and new state is set, alongside the existing NPC callback

**`SocketServer.startBattle()`** wires up the callback:

```ts
room.onPlayerActionRequired((requests) => {
  for (const { slotId, request } of requests) {
    const player = this.lobby.getBySlotId(slotId);
    if (!player) continue;
    const socket = this.io.sockets.sockets.get(player.socketId);
    socket?.emit('action:request', request);
  }
});
```

Players who join after a turn has already started continue to be handled by the existing `getPendingActionRequest` + lobbyHandlers re-emit path.

### B. Timer removal (BattleRoom)

`BattleRoom` loses:
- Fields: `timer`, `timerSeconds`, `paused`
- Methods: `startTimer()`, `pause()`, `unpause()`
- `BattleRoomOptions` no longer has `timerSeconds`

`resolveTurn()` no longer calls `startTimer()`. A turn resolves only when `allActionsCollected()` returns true inside `submitAction()`. There is no automatic fallback.

`adminHandlers.ts` removes the `pause` and `unpause` cases.

`ControlPanel.tsx` removes the PAUSE/UNPAUSE button and the `togglePause`/`paused` state.

### C. Shared type cleanup

**`packages/shared/src/types/events.ts`**
- `ActionRequestPayload`: remove `timerSeconds: number`

**`packages/shared/src/types/battle.ts`**
- `BattleState`: remove `turnTimerSeconds: number`

**`packages/shared/src/types/` (AdminActionPayload)**
- Remove `pause` and `unpause` union members

### D. Client setup cleanup

**`BattleSettingsStep`**: remove the TURN TIMER input. `onStart` prop changes from `{ label: string; timerSeconds: number }` to `{ label: string }`.

**`SetupPanel.handleStart`**: drop `turnTimerSeconds` from the socket payload.

---

## File Map

**Shared:**
- Modify: `packages/shared/src/types/events.ts` — remove `timerSeconds` from `ActionRequestPayload`, remove `pause`/`unpause` from `AdminActionPayload`
- Modify: `packages/shared/src/types/battle.ts` — remove `turnTimerSeconds` from `BattleState`

**Server:**
- Modify: `packages/server/src/socket/BattleRoom.ts` — add `onPlayerActionRequired` + `buildPlayerRequests()`; remove timer fields, `startTimer()`, `pause()`, `unpause()`, `BattleRoomOptions.timerSeconds`
- Modify: `packages/server/src/socket/SocketServer.ts` — wire up `room.onPlayerActionRequired()`; remove `timerSeconds` from `BattleRoom` constructor call
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts` — remove `pause` and `unpause` cases
- Modify: `packages/server/src/socket/__tests__/BattleRoom.test.ts` — update to drop `timerSeconds` from options, add tests for `onPlayerActionRequired`/`buildPlayerRequests`
- Modify: `packages/server/src/socket/__tests__/lobbyHandlers.test.ts` — update `ActionRequestPayload` fixtures (drop `timerSeconds`)
- Modify: `packages/server/src/engine/__tests__/` — drop `timerSeconds`/`turnTimerSeconds` from fixtures as needed

**Client:**
- Modify: `packages/client/src/admin/ControlPanel.tsx` — remove pause/unpause button and state
- Modify: `packages/client/src/admin/steps/BattleSettingsStep.tsx` — remove timer input
- Modify: `packages/client/src/admin/SetupPanel.tsx` — drop `turnTimerSeconds` from socket payload
- Modify: `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx` — drop `timerSeconds` from fixtures
- Modify: `packages/client/src/pages/__tests__/BattlePage.test.tsx` — drop `timerSeconds` from fixtures
- Modify: `packages/client/src/battle/__tests__/MovePanel.test.tsx` — drop `timerSeconds` from fixture

---

## Test Strategy

All existing tests that construct `ActionRequestPayload` or `BattleState` drop the removed fields.

New tests for `BattleRoom`:
- `onPlayerActionRequired` fires deferred on construction with one entry per active human slot
- `onPlayerActionRequired` fires again after `resolveTurn()` with the new turn's human slots
- `onPlayerActionRequired` does not fire during forced-switch phase
- `buildPlayerRequests()` excludes NPC slots, spectator slots, and fainted-active slots

New test for `SocketServer`/`lobbyHandlers` (integration-style):
- Starting a battle causes `action:request` to be emitted to each human player's socket

---

## Invariants

- The timer auto-submit path (`startTimer` → submit move-0 for unsubmitted slots) is completely gone.
- A battle can wait indefinitely for submissions. The admin is responsible for submitting NPC actions; players are responsible for submitting their own.
- The existing forced-switch flow is unchanged: after a faint, affected slots receive `switch:request` and must submit before the next action phase begins.
