# Move-Sequence Items

## State

InProgress

## Summary

Metronome and Loaded Dice both affect damage output based on how moves are used across a sequence — Metronome scales power when the same move is used on consecutive turns, and Loaded Dice forces multi-hit moves to always land the maximum number of hits. Neither is registered in `ITEM_HOOKS`. Loaded Dice requires a small targeted change to `rollHitCount`. Metronome is more involved: it needs a volatile counter to track consecutive use of the same move, plus a modifier that reads from that counter.

## Problem Details

**File:** `packages/server/src/engine/BattleEngine.ts:2738` (rollHitCount) and `packages/server/src/engine/items.ts:55` (ITEM_HOOKS)

**Loaded Dice** — Multi-hit count is determined in `BattleEngine.ts:1414`:
```typescript
const hitCount = multihitSec ? this.rollHitCount(multihitSec.hits) : 1;
```
The `rollHitCount` method at line 2738 uses `this.rng()` to pick randomly between min and max:
```typescript
private rollHitCount(hits: number | [number, number]): number {
  if (typeof hits === 'number') return hits;
  const [min, max] = hits;
  if (min === 2 && max === 5) { ... weighted roll ... }
  return min + Math.floor(this.rng() * (max - min + 1));
}
```
The attacker's item is not checked here; there is no way to force `max`.

**Metronome** — `PartyMember.lastMoveId` (`battle.ts:56`) already tracks the most recently used move ID, but there is no counter for how many consecutive turns the same move has been used. The `onAttackerModifier` hook would be the right place to apply the power scaling, but it has no way to query a consecutive-use counter without that counter being stored somewhere (a volatile or a dedicated field on `PartyMember`).

## Impact

- Loaded Dice: popular Skill Link–style item does nothing; multi-hit moves average ~3 hits instead of always hitting 5 (for 2-5 hit moves).
- Metronome: power does not scale with consecutive use; lock-in moves (Outrage, Choice-locked moves) gain no benefit.

## Suggested Fix

1. **Loaded Dice** — pass the attacker's item to `rollHitCount` (or check it at the call site before calling):
   ```typescript
   const hitCount = multihitSec
     ? (attacker.heldItem === 'loaded-dice' && Array.isArray(multihitSec.hits)
         ? multihitSec.hits[1]   // always max
         : this.rollHitCount(multihitSec.hits))
     : 1;
   ```
   Add `'loaded-dice': {}` to `ITEM_HOOKS` so it appears in `IMPLEMENTED_ITEM_IDS`.

2. **Metronome** — add a `metronome-count` volatile (using `VolatileStatusEntry.accumulated` or a new entry) that increments each turn the same move is used and resets when a different move is used (comparing against `lastMoveId`). Update this counter in the post-move cleanup path in BattleEngine. Register the item:
   ```typescript
   'metronome': {
     onAttackerModifier: ({ holder }) => {
       const entry = holder.volatileStatus.find(v => v.name === 'metronome-count');
       const count = entry?.accumulated ?? 0;
       return Math.min(1 + count * 0.2, 2); // +20% per consecutive use, capped at ×2 (10 turns)
     },
   },
   ```
   Clamp the multiplier at ×2 (reached after 5 consecutive uses) per the mainline game formula.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts:1414` (hitCount), `2738` (rollHitCount)
- `packages/shared/src/types/battle.ts` (VolatileStatusEntry.accumulated)
