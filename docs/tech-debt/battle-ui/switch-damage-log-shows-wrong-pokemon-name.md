# Switch Damage Log Shows Wrong Pokémon Name

## State

New

## Summary

When a Pokémon switches in during a turn and then takes damage in the same turn (e.g. from entry hazards or a faster opponent's attack), the battle log displays the name of the Pokémon that switched *out* rather than the one that switched *in*. This happens because `eventsToPlaybackEntries` receives `prevState` (the snapshot from before the turn began) and resolves names via `getActiveName`, which reads `slot.activePokemonIndex` from that frozen snapshot — an index that still points to the pre-switch Pokémon.

## Problem Details

**File:** `packages/client/src/battle/BattleContext.tsx:598`

```typescript
const entries = eventsToPlaybackEntries(events, prevState);
```

`prevState` is the state captured before the `turn:resolve` payload arrives. The helper `getActiveName` (line 175) looks up the active Pokémon by `slot.activePokemonIndex`:

```typescript
function getActiveName(state: BattleState | null | undefined, slotId: string): string {
  // ...
  const mon = slot.party[slot.activePokemonIndex];
  return mon ? mon.nickname : slotId;
}
```

When the event list contains a `pokemon-switched` event followed by a `damage-dealt` event for the same slot, `getActiveName` still returns the name from before the switch because `prevState.activePokemonIndex` has not been updated. The fix must track name changes *within* the event sequence as it is iterated.

**File:** `packages/client/src/battle/BattleContext.tsx:188` (`eventsToPlaybackEntries`)

The function iterates all events with a single fixed `state` snapshot. It has no mechanism to update its slot→name mapping when a `pokemon-switched` event is encountered mid-iteration.

## Impact

- Players see the wrong Pokémon name in damage log messages after a switch-in (e.g. "Dealt 30 damage to Charizard." when Blastoise just switched in and took the hit).
- The same wrong-name problem applies to `faint` events if the Pokémon that switched in immediately faints.
- Makes the battle log unreliable and confusing to read.

## Suggested Fix

1. Before iterating events in `eventsToPlaybackEntries`, build a mutable `Map<slotId, string>` seeded from `prevState` (or the fallback of slotId if no state is available), containing each slot's current active Pokémon's nickname.
2. When a `pokemon-switched` event is encountered during iteration, update the map entry for that slot to the incoming Pokémon's name (the event carries `incomingName` or can be cross-referenced with the new `state` payload which is available as `pendingState`).
3. Replace all `getActiveName(state, slotId)` calls inside `eventsToPlaybackEntries` with a lookup into this mutable map.

Check what fields the `pokemon-switched` event carries — if it already includes the incoming Pokémon's name, use it directly; otherwise, look it up from the new state that is set via `setPendingState(s)` at line 599.

## Related Files

- `packages/client/src/battle/BattleContext.tsx`
- `packages/client/src/battle/__tests__/BattleContext.test.ts`
