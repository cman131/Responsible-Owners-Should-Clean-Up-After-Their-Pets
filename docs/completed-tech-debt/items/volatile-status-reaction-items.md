# Volatile Status Reaction Items

## State

Complete

## Summary

Mental Herb and Destiny Knot both react when a volatile status is applied to the holder, but there is no `ItemHooks` hook for volatile-application events and neither item is in `ITEM_HOOKS`. Mental Herb cures the holder when specific disruption volatiles land on it (infatuation, Taunt, Encore, Torment, Disable, Heal Block). Destiny Knot spreads infatuation back to the attacker when the holder is inflicted. Both can be covered by a single new hook that fires whenever a volatile is applied to a Pokémon.

## Problem Details

**File:** `packages/server/src/engine/items.ts:17` (`ItemHooks` interface)

Volatile statuses are pushed onto `PartyMember.volatileStatus` at multiple points: via `applySecondaries` in BattleEngine, directly in effect handlers in `registrations.ts` (attract, taunt, encore, etc.), and in `EffectEngine`. There is currently no unified item-hook call after a volatile is added.

**Mental Herb** — targets: `infatuation`, `taunt`, `encore`, `torment`, `disable`, `heal-block`. All of these can land via move effects. The cure should happen immediately when the volatile is applied (before the Pokémon gets to act).

**Destiny Knot** — target: `infatuation` only. When the holder receives the `infatuation` volatile from an opponent's Attract or move secondary, the attacker should also receive the `infatuation` volatile (with `sourceSlotId` pointing back to the holder's slot). Destiny Knot is not consumed — it is a passive effect each time infatuation is applied.

## Impact

- Mental Herb: cannot cure Taunt, Encore, Disable, Attract, Torment, or Heal Block — the item's primary use case is entirely non-functional.
- Destiny Knot: infatuation does not spread back to the attacker; a common anti-Attract tech does nothing.

## Suggested Fix

1. Add a new hook to `ItemHooks`:
   ```typescript
   onVolatileApplied?: (ctx: ItemContext & {
     volatileName: string;
     sourceSlotId?: string;
   }) => {
     cureVolatile?: boolean;
     applyVolatileToSource?: string;  // volatile name to apply back to sourceSlotId
     consume?: boolean;
   } | null;
   ```
2. Call this hook immediately after pushing a volatile onto `PartyMember.volatileStatus` in each application site (in `effects.ts` if there is a central `applyVolatile` helper, otherwise at the key effect handler sites in `registrations.ts` for attract/taunt/encore/torment/disable/heal-block). If `cureVolatile` is returned, remove the just-added volatile and consume the item.
3. Register Mental Herb:
   ```typescript
   'mental-herb': {
     onVolatileApplied: ({ volatileName }) => {
       const targets = new Set(['infatuation', 'taunt', 'encore', 'torment', 'disable', 'heal-block']);
       return targets.has(volatileName) ? { cureVolatile: true, consume: true } : null;
     },
   },
   ```
4. Register Destiny Knot:
   ```typescript
   'destiny-knot': {
     onVolatileApplied: ({ volatileName }) =>
       volatileName === 'infatuation'
         ? { applyVolatileToSource: 'infatuation' }
         : null,
   },
   ```
   The engine, when seeing `applyVolatileToSource`, pushes that volatile onto the Pokémon identified by `sourceSlotId` (if they are still on the field and not already infatuated).

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/effects.ts` (volatile application helpers)
- `packages/server/src/engine/registrations.ts` (attract, taunt, encore, torment, disable, heal-block handlers)
