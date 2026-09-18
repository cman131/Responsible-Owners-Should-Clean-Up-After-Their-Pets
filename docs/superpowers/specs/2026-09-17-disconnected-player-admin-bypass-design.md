# Disconnected Player Admin Bypass — Design Spec

**Date:** 2026-09-17  
**Tech-debt plan:** `docs/tech-debt/battle-bugs/disconnected-player-blocks-turn-no-timeout.md`

## Problem

When a player disconnects mid-turn without submitting an action, `BattleRoom.allActionsCollected()` returns `false` forever. The battle stalls indefinitely. The admin's only recourse is forfeiting the entire team — a heavy-handed fix that ends the battle.

## Solution

Add a single targeted admin action: **"Submit default action for slot"**. When a disconnected player is blocking a turn, the admin can click one button to unblock it by auto-submitting the slot's first valid non-disabled move (Struggle if all PP is zero or all moves are disabled). The battle continues normally.

## Architecture

### 1. Shared types (`packages/shared/src/types/events.ts`)

Add `'submit-default-action'` to `AdminActionPayload['type']`. The payload data shape is `{ battleId: string; slotId: string }` (same as other slot-targeted actions like `'force-faint'`).

### 2. BattleRoom (`packages/server/src/socket/BattleRoom.ts`)

New public method `submitDefaultAction(slotId: string): { ok: boolean; reason?: string }`:

- Return `{ ok: false, reason: 'Battle not in action phase' }` if `state.phase !== 'action'`
- Return `{ ok: false, reason: 'Action already submitted' }` if `pendingActions.has(slotId)`
- Find the slot; return `{ ok: false, reason: 'Unknown slot' }` if not found
- Find the active Pokémon; return `{ ok: false, reason: 'No active pokemon' }` if none or fainted
- Call existing `buildValidMoves(slotId, active)` to get valid options
- Pick the first entry (`validMoves[0]`) — this already handles Struggle fallback when PP is zero or all moves are disabled
- Construct `MoveAction { type: 'move', moveIndex: validMoves[0].index }` and call `this.submitAction(slotId, action)`
- Return the result from `submitAction`

This method reuses existing building blocks; no new logic is introduced.

### 3. Admin handlers (`packages/server/src/socket/handlers/adminHandlers.ts`)

Add a `'submit-default-action'` case to the `admin:action` switch:

```ts
case 'submit-default-action': {
  const { battleId, slotId } = payload.data as { battleId: string; slotId: string };
  if (typeof battleId === 'string' && typeof slotId === 'string') {
    getRoom(battleId)?.submitDefaultAction(slotId);
  }
  break;
}
```

### 4. ControlPanel (`packages/client/src/admin/ControlPanel.tsx`)

The header already renders `⚠ {s.displayName} disconnected` for each slot where `!s.joined`. Add a small "Submit action" button inline with that indicator:

```
⚠ PlayerName disconnected  [SUBMIT ACTION]
```

Clicking the button emits `admin:action { type: 'submit-default-action', data: { battleId, slotId } }` via the existing `sendAdminAction` helper.

## Data Flow

```
Admin clicks "Submit action" for a disconnected slot
  → admin:action { type: 'submit-default-action', data: { battleId, slotId } }
  → adminHandlers case 'submit-default-action'
  → room.submitDefaultAction(slotId)
  → buildValidMoves(slotId, active) → pick validMoves[0].index
  → submitAction(slotId, { type: 'move', moveIndex: index })
  → pendingActions.set(slotId, action)
  → allActionsCollected()? → resolveTurn() → turn:resolve emitted
```

## Edge Cases

- **Already submitted:** `submitDefaultAction` returns early if `pendingActions.has(slotId)` — idempotent.
- **Battle ended:** `state.phase !== 'action'` guard catches this.
- **Fainted active mon:** Checked before `buildValidMoves` — returns early with an error.
- **Forced-switch stall** (player disconnects after their mon faints, before sending a switch): This is a distinct phase and is NOT handled by this change. The admin can still forfeit in that scenario.

## Testing

- `BattleRoom.submitDefaultAction` unit tests:
  - Submits successfully for a slot that hasn't acted → action enters `pendingActions`
  - Returns error if action already submitted for that slot
  - Returns error if phase is not `'action'`
  - When it's the last missing action, the turn resolves
  - Selects Struggle when all PP is zero

## Out of Scope

- Auto-timeout (60s server-side timer on disconnect) — left for future work
- Forced-switch stall unblock
- UI countdown showing the reconnect window
