# Lobby Slot Join + Admin Waiting Roster

**Date:** 2026-08-24  
**Status:** Approved

## Overview

Two related improvements to the player join flow and the admin battle-started view:

1. **Player joining** — replace the free-text name field with a battle picker + slot dropdown so players select who they are rather than typing it.
2. **Admin waiting roster** — after starting a battle, show a live roster of player slots with joined/waiting indicators instead of a static "Battle Started!" message.

Players claim slots first-come-first-served. Leaving the browser tab releases the claim (existing 2-minute reconnect window still applies for brief disconnects).

---

## Shared Types

### Updated `PlayerJoinPayload`

```ts
export interface PlayerJoinPayload {
  battleId: string;
  slotId: string;
}
```

The display name is no longer user-supplied — it is derived server-side from the slot the admin configured.

### New `BattleJoinOption`

```ts
export interface BattleJoinOption {
  battleId: string;
  label: string;
  slots: Array<{ slotId: string; displayName: string }>;
}
```

Only player slots (non-NPC, non-spectator) that are currently unclaimed appear in `slots`. Battles with no available slots are omitted from the list entirely.

### New `SlotStatusPayload`

```ts
export interface SlotStatusPayload {
  battleId: string;
  slots: Array<{ slotId: string; displayName: string; joined: boolean }>;
}
```

Only human player slots are included (no NPC or spectator slots).

### New `LobbyErrorPayload` codes

Add to the `code` union:
- `'BATTLE_NOT_FOUND'` — player tried to join a battle that doesn't exist or has ended
- `'SLOT_TAKEN'` — player tried to claim a slot already held by an active connection

### New `ServerToClientEvents`

```ts
'lobby:battles': (payload: { battles: BattleJoinOption[] }) => void;
'lobby:slot-status': (payload: SlotStatusPayload) => void;
```

### New `AdminActionPayload.type`

```ts
| 'lobby:slot-status'
```

Used by the admin started screen to request the current slot join state on mount.

---

## Server Changes

### `lobbyHandlers.ts`

**Signature change:** add two callbacks after `notifyAdmins`:

```ts
export function registerLobbyHandlers(
  socket,
  lobby,
  getRoom,
  notifyAdmins: () => void,
  notifyAdminsOfSlotStatus: (battleId: string) => void,
  notifyPlayersOfBattles: () => void
): void
```

**`player:join` handler rewrite:**

1. Destructure `{ battleId, slotId }` from payload.
2. Look up `getRoom(battleId)` — emit `lobby:error` with `BATTLE_NOT_FOUND` if missing.
3. Find the slot in `room.getStateSnapshot().teams[*].slots` by `slotId` — emit `lobby:error` if not found or if `isNpc`/`isSpectator`.
4. Call `lobby.getBySlotId(slotId)` — if a non-disconnected player holds the slot, emit `lobby:error` with `SLOT_TAKEN`.
5. Call `lobby.registerPlayer(socket.id, slot.displayName)` — handles first join and reconnect-by-name.
6. Set `player.battleSlotId = slotId` and `player.battleId = battleId`.
7. Set `socket.data['battleId'] = battleId` so `notifyPlayersOfBattles` skips this socket going forward.
8. Call `socket.join('battle:${battleId}')`.
9. Emit `state:sync` with `room.getStateSnapshot()`.
10. Call `notifyAdminsOfSlotStatus(battleId)` and `notifyPlayersOfBattles()`.

The old reconnect path (`if (player.battleId)`) is removed — the new handler subsumes it.

### `adminHandlers.ts`

New `'lobby:slot-status'` case:

```ts
case 'lobby:slot-status': {
  const { battleId } = payload.data as { battleId: string };
  const room = getRoom(battleId);
  if (!room) break;
  const state = room.getStateSnapshot();
  const slots = state.teams
    .flatMap((t) => t.slots)
    .filter((s) => !s.isNpc && !s.isSpectator)
    .map((s) => ({
      slotId: s.slotId,
      displayName: s.displayName,
      joined: !!lobby.getBySlotId(s.slotId),
    }));
  socket.emit('lobby:slot-status', { battleId, slots });
  break;
}
```

### `SocketServer.ts`

**Three new private helpers:**

```ts
private getBattleJoinOptions(): BattleJoinOption[] {
  const options: BattleJoinOption[] = [];
  for (const [battleId, room] of this.rooms) {
    const state = room.getStateSnapshot();
    const available = state.teams
      .flatMap((t) => t.slots)
      .filter((s) => !s.isNpc && !s.isSpectator && !this.lobby.getBySlotId(s.slotId));
    if (available.length > 0) {
      options.push({
        battleId,
        label: state.label,
        slots: available.map((s) => ({ slotId: s.slotId, displayName: s.displayName })),
      });
    }
  }
  return options;
}

private notifyPlayersOfBattles(): void {
  const battles = this.getBattleJoinOptions();
  for (const s of this.io.sockets.sockets.values()) {
    if (!s.data['isAdmin'] && !s.data['battleId']) {
      s.emit('lobby:battles', { battles });
    }
  }
}

private notifyAdminsOfSlotStatus(battleId: string): void {
  const room = this.rooms.get(battleId);
  if (!room) return;
  const state = room.getStateSnapshot();
  const slots = state.teams
    .flatMap((t) => t.slots)
    .filter((s) => !s.isNpc && !s.isSpectator)
    .map((s) => ({
      slotId: s.slotId,
      displayName: s.displayName,
      joined: !!this.lobby.getBySlotId(s.slotId),
    }));
  for (const s of this.io.sockets.sockets.values()) {
    if (s.data['isAdmin']) s.emit('lobby:slot-status', { battleId, slots });
  }
}
```

**Wiring — where each helper is called:**

| Event | Helpers called |
|-------|---------------|
| Non-admin player connects | `notifyPlayersOfBattles()` (push current battle list immediately) |
| Slot claimed (in lobbyHandlers) | `notifyAdminsOfSlotStatus(battleId)` + `notifyPlayersOfBattles()` |
| Player disconnects (has `battleId`) | `notifyAdminsOfSlotStatus(battleId)` + `notifyPlayersOfBattles()` |
| Battle ends (`onBattleEnd`) | `notifyPlayersOfBattles()` (battle disappears from list) |

**Updated `registerLobbyHandlers` call** in the connection handler passes the two new callbacks.

**Updated `disconnect` handler:**

```ts
socket.on('disconnect', () => {
  const player = this.lobby.getBySocketId(socket.id);
  if (player) {
    const { battleId } = player;
    console.log(`Disconnected: ${player.displayName}`);
    this.lobby.markDisconnected(socket.id);
    if (battleId) {
      this.notifyAdminsOfSlotStatus(battleId);
    }
    this.notifyPlayersOfBattles();
  }
});
```

**Socket data flag:** set `s.data['battleId'] = battleId` when a player joins a battle (in `startBattle` and in lobbyHandlers after slot claim) so `notifyPlayersOfBattles()` can skip them.

---

## Admin UI Changes

### `AdminRouter.tsx`

Pass `handleWatch` to `SetupPanel` as `onWatch: (battleId: string) => void`. No other changes — `handleWatch` already exists and emits `battles:connect` then sets `activeBattle`.

### `SetupPanel.tsx`

**Props change:** add `onWatch: (battleId: string) => void`.

**`step === 'started'` branch** — replace the static text with `<BattleWaitingScreen>`:

```tsx
if (step === 'started') {
  return (
    <BattleWaitingScreen
      battleId={battleId}
      slotAssignment={slotAssignment!}
      onBack={onBack}
      onWatch={onWatch}
    />
  );
}
```

`battleId` is already in scope (generated at the top of `handleStart`). Lift it to component state (`const [battleId, setBattleId] = useState<string | null>(null)`) and set it before emitting `start-battle`.

### New `BattleWaitingScreen.tsx`

`packages/client/src/admin/BattleWaitingScreen.tsx`

**Props:**
```ts
interface Props {
  battleId: string;
  slotAssignment: { teamA: SlotConfig[]; teamB: SlotConfig[] };
  onBack: () => void;
  onWatch: (battleId: string) => void;
}
```

**Behavior:**
- On mount: emits `admin:action` `'lobby:slot-status'` with `{ battleId }` to seed initial state; listens for `'lobby:slot-status'` pushes (filtered to matching `battleId`).
- Cleans up listener on unmount.
- Derives `joined` state per slot from `SlotStatusPayload`.
- Renders two team sections. Each human player slot row: name + green ● Joined / grey ○ Waiting. Each NPC slot row: name + 🤖 NPC (static).
- Footer: `"X / Y players connected"` count + WATCH BATTLE → button (always enabled, calls `onWatch(battleId)`).

---

## Player UI Changes

### `LobbyPage.tsx`

**Phase model change:** `'login' | 'waiting'` → `'browse' | 'waiting'`.

**`browse` phase:**
- On mount: listens for `'lobby:battles'` (server pushes on connect automatically).
- Also listens for subsequent `'lobby:battles'` pushes to keep the list live.
- State: `battles: BattleJoinOption[]`, `selectedBattleId: string | null`, `selectedSlotId: string | null`.
- Renders:
  - If `battles.length === 0`: "No active battles yet. Check with your admin."
  - Otherwise: a card per battle with label + available slot count. Clicking a card sets `selectedBattleId`.
  - When a battle is selected: a dropdown of its available slots (displayName). Selecting a slot sets `selectedSlotId`.
  - JOIN BATTLE button (disabled until both selected): emits `player:join` with `{ battleId: selectedBattleId, slotId: selectedSlotId }`, sets `phase = 'waiting'`.
- On `'lobby:error'`: show error message, remain in browse phase.

**`waiting` phase:** unchanged in appearance — shows "Welcome, {name}! Waiting for the battle to begin..." — but `name` is now derived from `selectedSlotId` mapped to a display name (look it up from the selected battle's slot list before emitting join).

**Cleanup:** removes `socket.off('lobby:error')` and `socket.off('battle:start')` on unmount as before.

---

## What Does Not Change

- `LobbyManager.ts` — no changes; `registerPlayer`, `markDisconnected`, `getBySlotId`, `getByName` all work as-is.
- `BattleRoom.ts` — no changes.
- `SlotAssignmentStep.tsx` — no changes; the "online" waiting player dropdown continues to work (will just always be empty in the new flow since players don't join the pre-battle lobby anymore, which is fine).
- All battle engine logic — untouched.
- `ControlPanel.tsx`, `BattlesPanel.tsx`, `HubPanel.tsx`, `AdminRouter.tsx` (except the `onWatch` prop pass-through) — unchanged.

---

## File Summary

| Action | Path |
|--------|------|
| MODIFY | `packages/shared/src/types/events.ts` |
| MODIFY | `packages/server/src/socket/handlers/lobbyHandlers.ts` |
| MODIFY | `packages/server/src/socket/handlers/adminHandlers.ts` |
| MODIFY | `packages/server/src/socket/SocketServer.ts` |
| MODIFY | `packages/client/src/admin/SetupPanel.tsx` |
| MODIFY | `packages/client/src/admin/AdminRouter.tsx` |
| MODIFY | `packages/client/src/pages/LobbyPage.tsx` |
| NEW | `packages/client/src/admin/BattleWaitingScreen.tsx` |
