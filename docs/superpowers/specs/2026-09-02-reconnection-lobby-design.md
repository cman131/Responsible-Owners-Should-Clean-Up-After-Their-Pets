# Reconnection & Full Battle Lobby Design

**Date:** 2026-09-02  
**Branch:** feat/ability-item-completion (to be implemented on a new branch)

## Overview

Three related improvements to the player connection screen and battle experience:

1. Show **all active battles** (not just ones with open slots) in the lobby list
2. Allow players to **reconnect** to a running battle after a tab close or refresh
3. Add a **Home button** to the battle screen so players can leave cleanly

---

## Shared Type Changes

**File:** `packages/shared/src/types/events.ts`

Update `BattleJoinOption.slots` to include a `status` field:

```typescript
export interface BattleJoinOption {
  battleId: string;
  label: string;
  slots: Array<{
    slotId: string;
    displayName: string;
    status: 'available' | 'reconnectable' | 'occupied';
  }>;
}
```

Status meanings:
- `available` — no player currently holds this slot
- `reconnectable` — a player disconnected; their slot is reclaimable within the 2-minute reconnect window
- `occupied` — a player is actively connected right now

Add to `ClientToServerEvents`:

```typescript
'player:leave': () => void;
```

---

## Server Changes

### `SocketServer.getBattleJoinOptions()`

**Current behavior:** Only returns battles that have at least one slot with no player at all.

**New behavior:** Returns **all active (non-ended) rooms**. For every non-NPC, non-spectator slot, compute status from `LobbyManager`:

```
getBySlotId(slotId) === undefined              → 'available'
getBySlotId(slotId)?.disconnectedAt !== undefined → 'reconnectable'
getBySlotId(slotId)?.disconnectedAt === undefined → 'occupied'
```

A battle with all slots `occupied` still appears in the list — it just has no joinable slots.

### New `player:leave` handler — `lobbyHandlers.ts`

Handles deliberate player exit (home button). Steps:

1. Look up player by `socket.id`
2. Call `lobby.removePlayer(socket.id)` — full removal (not `markDisconnected`), since this is intentional
3. Clear `socket.data['battleId']` and call `socket.leave('battle:<battleId>')`
4. Call `notifyAdminsOfSlotStatus(battleId)` and `notifyPlayersOfBattles()`
5. Emit `lobby:battles` directly back to this socket so the LobbyPage has data ready immediately after navigation

If the socket has no active battle, the handler is a safe no-op.

### `player:join` handler — no changes needed

The existing reconnect path in `lobbyHandlers.ts` already works correctly:

```typescript
const existing = lobby.getBySlotId(slotId);
if (existing && existing.disconnectedAt === undefined) {
  socket.emit('lobby:error', { code: 'SLOT_TAKEN', ... });
  return;
}
// falls through → registerPlayer reconnects if disconnectedAt is set
```

Once the battle appears in the lobby list, reconnection is handled automatically.

---

## Client Changes

### `LobbyPage.tsx`

Battle list renders all battles. Behavior per battle card:

- Always renders the battle label
- Shows count of joinable slots (`available` + `reconnectable` combined), or "Full – In Progress" if zero
- Slot dropdown lists only `available` and `reconnectable` slots; `occupied` slots are excluded
- Reconnectable slots append `" (reconnect)"` to the display name so players know they're resuming

Battle cards with zero joinable slots render with a "Full" indicator and no slot selector — informational only, no join action.

### `BattlePage.tsx` / `BattleView`

Add a `← Home` button at the top-left of the battle screen:

- Styled to match the existing dark theme
- On click:
  1. Emit `player:leave` on the socket
  2. Call `navigate('/')`
- The socket stays alive through navigation; the server's `player:leave` handler pushes an updated `lobby:battles` directly to this socket, so LobbyPage has fresh data when it registers its listener

No changes to `BattleContext` — its socket cleanup on unmount already works correctly.

---

## Data Flow

```
[Lobby connect]
  → server sends lobby:battles with ALL active rooms + slot statuses

[Select battle with available/reconnectable slot → JOIN]
  → player:join → registerPlayer (reconnects if disconnectedAt set) → state:sync → navigate /battle

[Home button clicked]
  → player:leave → server removes player, sends lobby:battles to this socket + notifies all
  → navigate('/') → LobbyPage mounts with fresh battle list

[Tab closes / browser refreshes]
  → disconnect event → markDisconnected (2-min window)
  → slot becomes 'reconnectable' in lobby:battles

[Rejoin reconnectable slot]
  → player:join → registerPlayer (finds disconnectedAt entry, reconnects socketId)
  → state:sync + battle:history → navigate /battle
```

---

## Error Handling

All errors surface as the existing `lobby:error` event; the lobby resets to the browse phase.

| Scenario | Error code |
|---|---|
| Race: another player joins the slot first | `SLOT_TAKEN` |
| Race: reconnect window expired during slot selection | `SLOT_TAKEN` |
| Battle ended between listing and joining | `BATTLE_NOT_FOUND` |
| `player:leave` with no active battle | no-op (safe) |

---

## Tests

- **`getBattleJoinOptions()`**: all active rooms appear; slot statuses computed correctly for each connection state
- **`player:leave` handler**: player removed from lobby; admins and players notified; `lobby:battles` emitted to leaving socket
- **`LobbyPage`**: renders "Full – In Progress" when all slots occupied; reconnectable slots show `(reconnect)` suffix; joining a reconnectable slot succeeds
- **Home button**: emits `player:leave` and navigates to `/`
