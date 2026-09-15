# Bug Fixes Design — 2026-09-15

Four bugs: final battle screen, sleep/freeze lockout behavior, controls enabling before log finishes, team names in battle log.

---

## Bug #1 — Final Battle Screen

### Problem
`battle:end` immediately clears the event queue and appends a plain log entry `"Battle over! Winner: team-a"`. Players have no dedicated win/loss screen, and the last round's log animations are cut off.

### Data Flow

`BattleContext` gains two new state fields:

- `pendingBattleEnd: { winningTeamId: string; finalState: BattleState } | null`  
  Buffers the `battle:end` socket payload while event playback is running.
- `battleResult: { winningTeamId: string; finalState: BattleState } | null`  
  Exposed via context. Set when the event queue drains and `pendingBattleEnd` is non-null.

**Socket handler changes:**

- `battle:end`: stores payload in `pendingBattleEnd`. Does NOT clear the event queue, add log entries, or set state immediately.
- "queue empties" effect: already releases `pendingActionRequest` / `pendingSwitchRequest`. Extended to also check `pendingBattleEnd`. If set, apply `battleResult` from it. When battle result is applied, do NOT release pending action/switch requests (battle is over).
- Edge case: if `battle:end` arrives when the queue is already empty (and `pendingState` is also null), release `battleResult` immediately — do not wait for a queue drain that will never come.

### Components

**New: `BattleResultPanel`** (`packages/client/src/battle/overlays/BattleResultPanel.tsx`)

Props:
```ts
interface Props {
  winningTeamId: string;
  finalState: BattleState;
  mySlotId: string;
  onGoHome: () => void;
}
```

Derives viewer perspective by finding `mySlotId` in `finalState.teams`. Renders:
- **VICTORY** (gold border, `#f0c040`) if viewer is on the winning team
- **DEFEAT** (red border, `#e74c3c`) if viewer is on the losing team  
- **Battle Over** (neutral, `#555` border) if viewer is a spectator or slot not found
- Winner names: non-spectator `slot.displayName` values joined with `", "`
- Loser names: same from the other team
- "← Return Home" button

Matches the existing dark theme (`background: '#0d0d1a'`).

**`BattlePage` / `BattleView`:**

Left column renders `<BattleResultPanel>` when `battleResult` is non-null, taking priority over all other action/switch/waiting states. `onGoHome` calls the existing `handleGoHome`.

### Team Name Helper

```ts
function teamDisplayNames(team: TeamState): string {
  return team.slots.filter(s => !s.isSpectator).map(s => s.displayName).join(', ');
}
```

Used in both the result panel and the log entry text.

---

## Bug #2 — Sleep/Freeze Allow Move Queuing

### Problem
`getLockedReason` in `BattleRoom.ts` returns `'sleep'` and `'freeze'`, causing `ActionPanel` to show a locked "FAST ASLEEP / FROZEN SOLID — Confirm" panel with no move selection. Players cannot pre-queue a move for when they wake up or thaw out.

### Fix

Remove `'sleep'` and `'freeze'` from `getLockedReason`. Only `'recharge'` and `'bide'` remain:

```ts
private getLockedReason(active: PartyMember): 'recharge' | 'bide' | undefined {
  if (active.volatileStatus.some(v => v.name === 'recharge')) return 'recharge';
  if (active.volatileStatus.some(v => v.name === 'bide')) return 'bide';
}
```

The engine already handles the actual blocking:
- If asleep and does not wake: emits `move-blocked { reason: 'asleep' }`, move does not fire.
- If asleep and wakes: emits `status-cured { status: 'slp' }`, then the queued move fires.
- Same pattern for freeze / thaw.

**`ActionPanel.tsx`:** Remove `sleep` and `freeze` from `LOCKED_LABELS`. They are no longer reachable.

---

## Bug #3 — Controls Enabling Before Log Finishes

### Problem
When `battle:end` arrives during event playback, the existing handler calls `setEventQueue([])`, immediately stopping playback and (via the queue-drain effect) potentially releasing pending requests before the log has finished.

### Fix

Contained entirely within the `battle:end` buffering from Bug #1. By not clearing the queue in the `battle:end` handler, playback completes naturally and controls are never released (battle is over by the time the queue drains).

---

## Bug #4 — Team Names in Battle Log

### Problem
The `battle:end` handler logs `"Battle over! Winner: team-a"` — an internal team ID, not player names.

### Fix

When applying `battleResult` (after queue drains), resolve the winner's display names using `teamDisplayNames()` and append a log entry:

```
"Battle over! Winner: Ash, Misty"
```

This replaces the existing immediate log append in the `battle:end` handler. The log entry is added when the result is released (queue empty), not when the socket event arrives.

---

## Testing

### `BattleResultPanel`
- Renders VICTORY with gold border when `mySlotId` is on winning team
- Renders DEFEAT with red border when on losing team
- Renders neutral "Battle Over" when `mySlotId` is spectator or not found
- Displays comma-delimited names for both winner and loser teams

### `BattleContext` buffering
- `turn:resolve` followed by `battle:end`: `battleResult` is null while queue drains, non-null after
- `actionRequest` is never set once `battle:end` has arrived
- `battle:end` with empty queue: `battleResult` set immediately

### `getLockedReason`
- Existing tests asserting `lockedReason: 'sleep'` / `lockedReason: 'freeze'` updated to assert `lockedReason: undefined`
- Verify engine still emits `move-blocked { reason: 'asleep' }` when sleep prevents the move

### `teamDisplayNames`
- Returns comma-joined display names of non-spectator slots
- Excludes spectator slots
