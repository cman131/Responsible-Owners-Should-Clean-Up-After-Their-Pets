# Type-Reactive Consumable Items

## State

New

## Summary

Seven items that trigger on a specific damage condition and are then consumed are absent from `ITEM_HOOKS` in `items.ts`, despite the existing `onAfterDamageTaken` hook already providing all the information each item needs. Absorb Bulb, Cell Battery, Luminous Moss, and Snowball each fire when hit by a specific move type. Enigma Berry heals on a super-effective hit. Lansat Berry and Starf Berry trigger at low HP — Lansat needs crit-stage handling and Starf needs a random stat, which requires minor additions to the hook signature but no structural engine change.

## Problem Details

**File:** `packages/server/src/engine/items.ts:55` (`ITEM_HOOKS` map)

None of these items appear in `ITEM_HOOKS`. The `onAfterDamageTaken` hook already receives `damageTaken`, `moveType`, and `effectiveness` — the exact fields needed:

```typescript
// items.ts:24
onAfterDamageTaken?: (ctx: ItemContext & {
  damageTaken: number;
  effectiveness?: number;
  moveType?: PokemonType;
  isPhysical?: boolean;
}) => {
  hpDelta: number;
  statBoostDeltas?: Partial<StatBoosts>;
  consume?: boolean;
};
```

Absorb Bulb, Cell Battery, Luminous Moss, Snowball, and Enigma Berry all fit this pattern exactly. Lansat Berry's crit-stage boost cannot be expressed through `statBoostDeltas` (accuracy/evasion are in `StatBoosts` but crit stage is not), so it would need a `volatileBoost` or a dedicated volatile like `lansat-active` handled in BattleEngine's crit calculation. Starf Berry's random stat selection requires `rng`, which is not currently in the hook context.

## Impact

- Absorb Bulb, Cell Battery, Luminous Moss, Snowball: popular one-use items are completely inert.
- Enigma Berry: provides no healing on super-effective hits.
- Lansat Berry and Starf Berry: do not trigger their stat bonuses at low HP.

## Suggested Fix

1. Add the four type-reactive items to `ITEM_HOOKS`:
   ```typescript
   'absorb-bulb': {
     onAfterDamageTaken: ({ damageTaken, moveType }) =>
       damageTaken > 0 && moveType === 'Water'
         ? { hpDelta: 0, statBoostDeltas: { spa: 1 }, consume: true }
         : { hpDelta: 0 },
   },
   'cell-battery': { ... Electric → atk +1 },
   'luminous-moss': { ... Water → spd +1 },
   'snowball':      { ... Ice → atk +1 },
   ```
2. Add Enigma Berry:
   ```typescript
   'enigma-berry': {
     onAfterDamageTaken: ({ holder, damageTaken, effectiveness }) =>
       damageTaken > 0 && (effectiveness ?? 1) > 1
         ? { hpDelta: Math.floor(holder.maxHp / 4), consume: true }
         : { hpDelta: 0 },
   },
   ```
3. Lansat Berry: add a `lansat-active` volatile in `onAfterDamageTaken` when HP ≤ 25% (same pattern as `custap-berry` and `micle-berry` at `items.ts:241`). Check for this volatile in BattleEngine's crit-stage calculation and add +2.
4. Starf Berry: add `rng?: () => number` to the `onAfterDamageTaken` context in `ItemHooks`. Pass `this.rng` when calling the hook in BattleEngine (same pattern as the `rng` already passed in `ItemAttackContext`). Then implement:
   ```typescript
   'starf-berry': {
     onAfterDamageTaken: ({ holder, damageTaken, rng }) => {
       if (damageTaken <= 0 || holder.currentHp > Math.floor(holder.maxHp / 4)) return { hpDelta: 0 };
       const stats = ['atk', 'def', 'spa', 'spd', 'spe'] as const;
       const stat = stats[Math.floor((rng?.() ?? Math.random()) * stats.length)]!;
       return { hpDelta: 0, statBoostDeltas: { [stat]: 2 }, consume: true };
     },
   },
   ```

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts` (crit-stage calculation for Lansat; `onAfterDamageTaken` call site)
