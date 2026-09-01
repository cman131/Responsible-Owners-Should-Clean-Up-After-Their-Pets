# Battle Playback Animations Design

**Date:** 2026-09-01  
**Status:** Approved  
**Scope:** M — client-side only, no server changes

---

## Problem

When a turn resolves, `BattleContext` immediately calls `setState(s)`, appends all log entries at once, and releases the action panel. From the player's perspective the battle "teleports" — HP bars snap to new values, all messages appear simultaneously, and the move panel reappears before anything has registered visually.

The goal is a presentation layer that plays events back sequentially: messages reveal one at a time, HP bars drain smoothly to reflect damage as each damage event fires, and the action panel is gated until the full sequence completes.

---

## Architecture Overview

All changes live on the client, inside `BattleContext`. No new files are created for this feature. The context gains four new pieces of state that together form the playback engine:

| State | Type | Purpose |
|-------|------|---------|
| `eventQueue` | `PlaybackEntry[]` | Flat list of events waiting to be revealed, one per tick |
| `pendingState` | `BattleState \| null` | New game state from `turn:resolve`, held until queue drains |
| `pendingActionRequest` | `ActionRequestPayload \| null` | Held `action:request`, released after queue empties |
| `pendingSwitchRequest` | `SwitchRequestPayload \| null` | Held `switch:request`, released after queue empties |
| `displayHp` | `Map<string, number>` | Animated HP values keyed by `slotId`; separate from game state |

`displayHp` is exposed on the context value so `HpBarsRow` can read it without prop-threading through `BattlePage`. `HpBarsRow` reads `displayHp.get(slot.slotId)` instead of `mon.currentHp` when a display value is present.

---

## PlaybackEntry Shape

```ts
type PlaybackEntry = {
  text?: string;                         // log message to append (omit = silent tick)
  hpDelta?: { slotId: string; delta: number }; // damage to subtract from displayHp
  delay: number;                         // ms to wait before this entry fires
};
```

---

## Turn Resolve Flow

When `turn:resolve` arrives:

1. Snapshot `displayHp` from the **current** `state` (not the incoming new state). For each non-spectator slot, record `mon.currentHp` keyed by `slotId`.
2. Convert the event array into `PlaybackEntry[]` (see Conversion Rules below).
3. Store `pendingState` = incoming new state. Do **not** call `setState`.
4. Push entries into `eventQueue`.

### Conversion Rules

| Event type | Entries produced |
|------------|-----------------|
| `move-used` | One entry: log text, delay 600ms |
| `damage-dealt` (no effectiveness) | One entry: log text + hpDelta, delay 600ms |
| `damage-dealt` (super/not effective) | Two entries: first has log text + hpDelta + 600ms delay; second has effectiveness text + 300ms delay |
| `crit` | One entry: log text, delay 300ms (usually follows a damage-dealt) |
| `faint` | One entry: log text, delay 600ms |
| `status-applied`, `status-cured`, `heal`, `terastallize`, `pokemon-switched` | One entry: log text, delay 600ms |
| Events with empty text | Omitted (no entry) |

---

## Queue Draining

A single `useEffect` watches `eventQueue`. When the array is non-empty:

1. Schedule a `setTimeout` using the **first entry's** `delay`.
2. On tick:
   - Append the entry's `text` to `turnLog` (if present).
   - Apply the entry's `hpDelta` to `displayHp` (if present): `displayHp.set(slotId, Math.max(0, current - delta))`.
   - Remove the entry from `eventQueue` (slice off index 0).
3. The effect re-runs when `eventQueue` changes, scheduling the next tick.
4. When `eventQueue` becomes empty:
   - Call `setState(pendingState)` and clear `pendingState`.
   - Release `pendingActionRequest` via `setActionRequest` (if non-null), then clear it.
   - Release `pendingSwitchRequest` via `setSwitchRequest` (if non-null), then clear it.

### Action Request Handling

```
action:request arrives
  ├─ eventQueue empty?  → setActionRequest immediately (unchanged behavior)
  └─ queue draining?    → setPendingActionRequest (released when queue empties)
```

This ensures the move panel never appears mid-playback.

---

## HP Bar Animation

`HpBarsRow` currently computes bar width directly from `mon.currentHp / mon.maxHp`. Changes:

- Accept an optional `displayHp: Map<string, number>` prop.
- When rendering a slot's bar, use `displayHp?.get(slot.slotId) ?? mon.currentHp` for `currentHp`.
- Add `transition: 'width 0.4s ease-out'` to the inline bar `<div>` style (it currently lacks a transition; `HpBar` has one but `HpBarsRow` renders its own bar inline).

`BattlePage` reads `displayHp` from `useBattle()` and passes it to both `HpBarsRow` instances.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/client/src/battle/BattleContext.tsx` | Add queue state, draining effect, displayHp, pending state/request holding |
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | Accept `displayHp` prop, use it for bar width, add CSS transition |
| `packages/client/src/pages/BattlePage.tsx` | Pass `displayHp` from context to both `HpBarsRow` instances |

No server changes. No new files.

---

## Non-Goals

Sprite movement animations (attacker lunge forward, target flash/shake on hit) are **out of scope** for this feature. See `docs/upcoming-features/09-sprite-battle-animations.md` for the future work item.

A speed-up or skip button is out of scope for this feature.
