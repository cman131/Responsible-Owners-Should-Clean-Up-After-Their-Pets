# Opponent-Reaction Items

## State

Complete

## Summary

Mirror Herb, Clear Amulet, and Covert Cloak each intercept something the opponent does — stat boosts, stat drops, and secondary effects respectively. None are in `ITEM_HOOKS`, and the engine has no hook points for these interceptions today. All three require new `ItemHooks` fields and new call sites: Mirror Herb needs to observe when an opposing Pokémon gains a stat boost; Clear Amulet needs to suppress incoming stat drops; Covert Cloak needs to suppress secondary effects targeting the holder.

## Problem Details

**File:** `packages/server/src/engine/items.ts:17` (`ItemHooks` interface)

**Mirror Herb** — No hook fires when a Pokémon on the opposing team gains a stat boost. The `applyStatBoost` helper in `effects.ts` applies boosts but has no callback for observer items. Mirror Herb needs to copy those boosts once onto the holder and consume itself.

**Clear Amulet** — `applyStatBoost` applies negative stat deltas without checking whether the target's item prevents them. There is no `ItemHooks` field that signals "do not lower this Pokémon's stats."

**Covert Cloak** — Secondary effects are applied to the target at `BattleEngine.ts:1722`:
```typescript
if (postSecs.length > 0 && !target.fainted && (!targetHasSub || isSoundMove) && !sheerForceActive) {
  events.push(...applySecondaries({ ... }));
}
```
There is no check for whether the target's held item suppresses secondary effects at this call site.

## Impact

- Clear Amulet: Intimidate, Icy Wind, Sticky Web, and all stat-lowering moves still lower the holder's stats.
- Mirror Herb: opponents can freely boost stats (Shell Smash, Swords Dance, etc.) without being copied.
- Covert Cloak: secondary flinches, burns (Scald), paralysis, and confusion from moves all land on the holder.

## Suggested Fix

1. **Clear Amulet**: add `preventsStatDrop?: boolean` to `ItemHooks`. In `effects.ts:applyStatBoost`, check the target Pokémon's item for this flag before applying any negative delta:
   ```typescript
   if (delta < 0 && getItemHooks(pokemon.heldItem).preventsStatDrop) return noOpEvent;
   ```
   Register: `'clear-amulet': { preventsStatDrop: true }`.

2. **Covert Cloak**: add `preventsSecondaryEffects?: boolean` to `ItemHooks`. At `BattleEngine.ts:1722`, add a guard:
   ```typescript
   if (!getItemHooks(target.heldItem).preventsSecondaryEffects) {
     events.push(...applySecondaries({ ... }));
   }
   ```
   Register: `'covert-cloak': { preventsSecondaryEffects: true }`.

3. **Mirror Herb**: add a new hook to `ItemHooks`:
   ```typescript
   onOpponentStatBoosted?: (ctx: ItemContext & {
     boostDeltas: Partial<StatBoosts>;
   }) => { copyBoosts: boolean; consume?: boolean } | null;
   ```
   In the stat-boost path (in `effects.ts` or the BattleEngine caller), after applying positive boosts to a Pokémon, iterate over foes and call `onOpponentStatBoosted` on each foe's held item. If the hook returns `copyBoosts: true`, apply the same deltas to the foe and consume the item.
   Register: `'mirror-herb': { onOpponentStatBoosted: ({ boostDeltas }) => ({ copyBoosts: true, consume: true }) }`.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/effects.ts` (applyStatBoost)
- `packages/server/src/engine/BattleEngine.ts:1722` (secondary effects guard)
