# Weather and Field State Items

## State

New

## Summary

Utility Umbrella, Room Service, and Booster Energy each interact with active field conditions but none are registered in `ITEM_HOOKS`. Utility Umbrella suppresses weather effects on the holder's offensive and defensive interactions — weather multipliers are spread across multiple sites in BattleEngine and EffectEngine with no item check. Room Service halves the holder's Speed specifically in Trick Room and consumes itself — the current `onSpeedModifier` signature returns a bare multiplier with no way to trigger consumption. Booster Energy manually activates Quark Drive or Protosynthesis in the absence of the required field condition — the ability activation path has no item hook.

## Problem Details

**File:** `packages/server/src/engine/items.ts:41` (`onSpeedModifier`) and `packages/server/src/engine/BattleEngine.ts`

**Utility Umbrella** — Weather boosts (rain Water 1.5×, sun Fire 1.5×, etc.) are applied inline in BattleEngine via `WEATHER_BALL_TYPE` lookups and move-type modifier branches. Weather chip damage (sandstorm, snow) is applied in `EffectEngine.ts` end-of-turn processing. None of these sites check `holder.heldItem === 'utility-umbrella'` before applying the weather effect.

**Room Service** — `ItemHooks.onSpeedModifier` is defined as `(ctx: ItemContext) => number`. A consuming speed modifier cannot express itself through this signature:
```typescript
// items.ts:41
onSpeedModifier?: (ctx: ItemContext) => number;
```
Room Service requires `state.field.trickroom > 0` (Trick Room field check is available via `ctx.state`) plus consumption — but the `onSpeedModifier` hook has no `consume` return path.

**Booster Energy** — Quark Drive and Protosynthesis ability activation is handled in the ability hooks system. If the required terrain/weather is absent, the ability doesn't activate. Booster Energy should trigger activation manually from the item side, but no item hook fires on switch-in or turn-start to activate ability effects.

## Impact

- Utility Umbrella: holders are still boosted by rain/sun offensively and still take weather chip; a key doubles support item doesn't work.
- Room Service: never activates; Speed halve under Trick Room never happens.
- Booster Energy: Quark Drive / Protosynthesis Pokémon cannot use the item to activate their stat boosts outside of terrain/weather.

## Suggested Fix

1. **Utility Umbrella** — add `ignoresWeather?: boolean` to `ItemHooks`. Register `'utility-umbrella': { ignoresWeather: true }`. At each weather modifier site in BattleEngine and EffectEngine, add a guard:
   ```typescript
   if (!getItemHooks(attacker.heldItem).ignoresWeather && !getItemHooks(defender.heldItem).ignoresWeather)
   ```
   The check needs to cover: offensive weather boosts (sun Fire, rain Water), defensive suppression (attacker/defender both covered), and end-of-turn weather chip in `EffectEngine`.

2. **Room Service** — extend `onSpeedModifier` to optionally return a tuple with a consume flag, or add a parallel hook:
   ```typescript
   onSpeedModifierConsuming?: (ctx: ItemContext) => { multiplier: number; consume: boolean } | number;
   ```
   Update the speed-modifier call site in BattleEngine to check both `onSpeedModifier` and the new variant, handling consumption when indicated. Register:
   ```typescript
   'room-service': {
     onSpeedModifierConsuming: ({ state }) =>
       state.field.trickroom > 0
         ? { multiplier: 0.5, consume: true }
         : 1,
   },
   ```

3. **Booster Energy** — in the switch-in item hook call (`BattleEngine.ts` around line 2322), after terrain seeds are handled, add a Booster Energy check: if `incoming.heldItem === 'booster-energy'` and no terrain/weather is active and the Pokémon's ability is `quark-drive` or `protosynthesis`, manually fire the ability's activation logic and consume the item. This can be done inline given the limited number of affected abilities.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts` (weather modifier sites, switch-in path ~line 2322)
- `packages/server/src/engine/EffectEngine.ts` (weather chip end-of-turn)
