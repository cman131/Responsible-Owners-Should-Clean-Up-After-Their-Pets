# Sprite Battle Animations — Design

**Date:** 2026-09-01  
**Feature:** Lunge, hit flash, and faint drop animations tied to the playback queue  
**Scope:** All three animation kinds (attack, hit, faint)

---

## Architecture

Animation state lives in `BattleContext` alongside the existing playback queue. `BattleScene` remains a pure presentational component that receives animation state as a prop. CSS keyframes are defined in a new `battle-animations.css` file imported by `BattleScene`.

---

## Data Layer — `BattleContext.tsx`

### `PlaybackEntry` type extension

```ts
export type PlaybackEntry = {
  text?: string;
  hpDelta?: { slotId: string; delta: number };
  animation?: { slotId: string; kind: 'attack' | 'hit' | 'faint' };
  delay: number;
};
```

### `eventsToPlaybackEntries` changes

Three existing entries gain an `animation` field (no new entries, no delay changes):

| Event | Animation kind | slotId source |
|---|---|---|
| `move-used` | `attack` | `event.data['attackerSlotId']` (already on wire at BattleEngine.ts:227) |
| `damage-dealt` | `hit` | `event.data['targetSlotId'] ?? event.data['slotId']` |
| `faint` | `faint` | `event.data['slotId']` |

If `attackerSlotId` is absent from a `move-used` event, no animation field is added.

### Context value extension

```ts
interface BattleContextValue {
  // ...existing fields...
  animatingSlots: Map<string, 'attack' | 'hit' | 'faint'>;
}
```

### Drain loop — animation clearing

When the drain loop processes an entry with an `animation` field, it:
1. Calls `setAnimatingSlots` to add the slot to the map
2. Schedules a `setTimeout` to delete that slot from the map

Clear durations:

| Kind | Clear after |
|---|---|
| `attack` | 350ms |
| `hit` | 300ms |
| `faint` | 600ms |

Faint uses 600ms (matching the entry delay) so the sprite stays in the dropped position until the pending state update removes it. The CSS `animation-fill-mode: forwards` holds the final frame from 400ms to 600ms.

`battle:end` clears `animatingSlots` to `new Map()`.

---

## CSS — `battle-animations.css`

New file: `packages/client/src/battle/battle-animations.css`  
Imported by `BattleScene.tsx`.

```css
@keyframes lunge-right {
  0%, 100% { transform: translateX(0); }
  50%       { transform: translateX(20px); }
}
@keyframes lunge-left {
  0%, 100% { transform: translateX(0); }
  50%       { transform: translateX(-20px); }
}
@keyframes hit-flash {
  0%, 100%  { filter: none; }
  25%, 75%  { filter: brightness(10); }
}
@keyframes faint-drop {
  0%   { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(60px); opacity: 0; }
}

.anim-attack-right { animation: lunge-right 350ms ease-in-out; }
.anim-attack-left  { animation: lunge-left  350ms ease-in-out; }
.anim-hit          { animation: hit-flash   300ms linear; }
.anim-faint        { animation: faint-drop  400ms ease-in forwards; }
```

---

## `BattleScene.tsx`

### New prop

```ts
interface Props {
  state: BattleState;
  mySlotId: string;
  animatingSlots?: Map<string, 'attack' | 'hit' | 'faint'>;
}
```

### Class selection in `renderSprite`

The sprite wrapper `<div>` receives a `className` based on `animatingSlots`:

| Role | Kind | Class |
|---|---|---|
| `own` or `ally` | `attack` | `.anim-attack-right` |
| `foe` | `attack` | `.anim-attack-left` |
| any | `hit` | `.anim-hit` |
| any | `faint` | `.anim-faint` |
| — | — | no class |

To ensure the CSS animation re-triggers if the same slot animates twice in a row, the sprite wrapper uses `key={slot.slotId + (animKind ?? '')}` so React remounts the element on animation kind change.

---

## `BattlePage.tsx`

`BattleView` reads `animatingSlots` from `useBattle()` and passes it to `<BattleScene>`:

```tsx
<BattleScene state={state} mySlotId={mySlotId} animatingSlots={animatingSlots} />
```

---

## Testing

### `BattleContext.test.ts` — unit tests for `eventsToPlaybackEntries`

- `move-used` with `attackerSlotId` → entry has `animation: { slotId: 'a1', kind: 'attack' }`
- `move-used` without `attackerSlotId` → no `animation` field
- `damage-dealt` → entry has `animation: { slotId: targetSlotId, kind: 'hit' }`
- `faint` → entry has `animation: { slotId: 'b1', kind: 'faint' }`

### `BattleContext.test.tsx` — drain-loop integration (fake timers)

- Draining a `move-used` entry sets `animatingSlots` for the attacker
- After 350ms, attack slot cleared from `animatingSlots`
- After 300ms, hit slot cleared
- After 600ms, faint slot cleared

### `BattleScene.test.tsx` — rendering

- Own slot animating `attack` → wrapper has class `anim-attack-right`
- Foe slot animating `attack` → wrapper has class `anim-attack-left`
- Any slot animating `hit` → wrapper has class `anim-hit`
- Any slot animating `faint` → wrapper has class `anim-faint`
- No `animatingSlots` prop → no animation class on any wrapper

---

## Files Changed

| File | Change |
|---|---|
| `packages/client/src/battle/BattleContext.tsx` | Extend `PlaybackEntry`, update `eventsToPlaybackEntries`, add `animatingSlots` state + drain-loop clearing, expose via context |
| `packages/client/src/battle/BattleScene.tsx` | Add `animatingSlots` prop, import CSS, apply class in `renderSprite` |
| `packages/client/src/battle/battle-animations.css` | New — keyframes + animation classes |
| `packages/client/src/pages/BattlePage.tsx` | Pass `animatingSlots` to `BattleScene` |
| `packages/client/src/battle/__tests__/BattleContext.test.ts` | New tests for animation fields in entries |
| `packages/client/src/battle/__tests__/BattleContext.test.tsx` | New drain-loop animation tests |
| `packages/client/src/battle/__tests__/BattleScene.test.tsx` | New class-application tests |
