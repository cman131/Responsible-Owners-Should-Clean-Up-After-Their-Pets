# Sprite Battle Animations

**Status:** Proposed  
**Depends on:** battle playback queue (sequential log + HP animation, 2026-09-01)  
**Est. scope:** M

---

## Problem

Pokemon sprites are currently static GIFs with idle animations from Showdown's sprite CDN. There is no visual feedback when a Pokémon attacks or takes damage — a move resolves and the scene looks identical before and after.

---

## Desired Behavior

Observed in Pokemon Showdown (recorded 2026-09-01):

- **Attacker lunge:** When a move fires, the attacking sprite quickly translates ~20px toward the opponent then snaps back. Duration ~200ms out, ~150ms back.
- **Hit flash:** When a Pokémon takes damage, the target sprite briefly flashes white (or inverts) 2–3 times over ~300ms.
- **Faint drop:** When a Pokémon faints, its sprite slides down out of frame over ~400ms.

---

## Implementation Sketch

These are CSS animations triggered by class application:

```css
@keyframes lunge-right { 0% { transform: translateX(0); } 50% { transform: translateX(20px); } 100% { transform: translateX(0); } }
@keyframes lunge-left  { 0% { transform: translateX(0); } 50% { transform: translateX(-20px); } 100% { transform: translateX(0); } }
@keyframes hit-flash   { 0%,100% { filter: none; } 25%,75% { filter: brightness(10); } }
@keyframes faint-drop  { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(60px); opacity: 0; } }
```

`BattleScene` would need an `animatingSlots` prop (or context) that maps `slotId → 'attack' | 'hit' | 'faint'` so it can apply the right class to each sprite. `BattleContext`'s playback queue would emit animation signals alongside log entries.

---

## Integration Point

The playback queue introduced in the battle-playback-animations feature (2026-09-01) is the natural place to trigger animations. Each `PlaybackEntry` would gain an optional `animation` field:

```ts
animation?: { slotId: string; kind: 'attack' | 'hit' | 'faint' }
```

When the queue drains an entry with an `animation`, it sets a transient state that `BattleScene` reads to apply the CSS class, then clears after the animation duration.
