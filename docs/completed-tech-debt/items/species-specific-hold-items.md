# Species-Specific Hold Items

## State

Complete

## Summary

Eight hold items are present in `data/items.json` but absent from `ITEM_HOOKS` in `items.ts`. Each item is only effective when held by a specific species: Light Ball (Pikachu), Thick Club (Cubone/Marowak), Lucky Punch (Chansey), Leek/Stick (Farfetch'd/Sirfetch'd), Deep Sea Scale/Tooth (Clamperl), Quick Powder and Metal Powder (Ditto not transformed). Most can use the existing hook interface with a `holder.speciesName` guard, but Lucky Punch and Leek expose a gap: `critStageBonus` in `ItemHooks` is a static number with no way to condition it on species. Ditto's transform state also has no tracking field.

## Problem Details

**File:** `packages/server/src/engine/items.ts:17` (`ItemHooks` interface) and `items.ts:55` (`ITEM_HOOKS` map)

None of these eight items appear in `ITEM_HOOKS`. The hooks needed for stat-doubling items (`onAttackerModifier`, `onDefenderModifier`, `onSpeedModifier`) all accept an `ItemContext` that includes `holder: PartyMember`, so a species check via `holder.speciesName` is available today.

The crit-stage items are blocked by the current interface:

```typescript
// items.ts:42
critStageBonus?: number;
```

This is a static value—it applies unconditionally to whoever holds the item. Lucky Punch and Leek/Stick require the bonus only for specific species. A species-conditional variant is needed.

Ditto's Quick Powder and Metal Powder only work when Ditto has not used Transform. There is no volatile status or flag tracking the transformed state in `PartyMember` (`battle.ts:38`), so "not transformed" cannot be checked today without adding one.

## Impact

- Light Ball Pikachu is a common competitive set; damage is halved compared to correct behavior.
- Thick Club Cubone/Marowak: physical output is halved.
- Lucky Punch Chansey and Leek/Stick Farfetch'd/Sirfetch'd: crit rate stays at base stage 0.
- Deep Sea Scale/Tooth Clamperl: Sp.Def or Sp.Atk is half of what it should be.
- Quick Powder and Metal Powder Ditto: Speed and Defense are not boosted.

## Suggested Fix

1. Add entries to `ITEM_HOOKS` for `light-ball`, `thick-club`, `deep-sea-scale`, `deep-sea-tooth`, `quick-powder`, and `metal-powder` using existing hooks with `holder.speciesName` guards:
   - `light-ball`: `onAttackerModifier: ({ holder }) => holder.speciesName === 'pikachu' ? 2 : 1`
   - `thick-club`: `onAttackerModifier: ({ holder, isPhysical }) => isPhysical && ['cubone', 'marowak', 'marowak-alola'].includes(holder.speciesName) ? 2 : 1`
   - `deep-sea-tooth`: `onAttackerModifier: ({ holder, isPhysical }) => !isPhysical && holder.speciesName === 'clamperl' ? 2 : 1`
   - `deep-sea-scale`: `onDefenderModifier: ({ holder, isPhysical }) => !isPhysical && holder.speciesName === 'clamperl' ? 0.5 : 1`
   - `quick-powder`: `onSpeedModifier: ({ holder }) => notTransformed(holder) ? 2 : 1`
   - `metal-powder`: `onDefenderModifier: ({ holder }) => notTransformed(holder) ? 0.5 : 1`
2. Extend `ItemHooks` with a conditional crit-stage hook alongside the static one:
   ```typescript
   critStageBonusFn?: (ctx: ItemContext) => number;
   ```
   Update BattleEngine to call `critStageBonusFn` when present (in addition to the existing static `critStageBonus` path). Register `lucky-punch` and `leek`/`stick`:
   ```typescript
   'lucky-punch': { critStageBonusFn: ({ holder }) => holder.speciesName === 'chansey' ? 2 : 0 },
   ```
3. Add a `'transformed'` volatile status name to track when Ditto has used Transform. Implement a `notTransformed(holder)` helper that checks `!holder.volatileStatus.some(v => v.name === 'transformed')`. Register `quick-powder` and `metal-powder` using this guard.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts`
- `packages/shared/src/types/battle.ts` (PartyMember, VolatileStatusEntry)
