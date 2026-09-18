# Entry Hazard and Type Immunity Items

## State

Complete

## Summary

Heavy-Duty Boots, Iron Ball, Ring Target, and Float Stone all modify how a Pokémon is affected by the field — hazards on switch-in, type-based immunities, and weight-based move power. None are in `ITEM_HOOKS`. Heavy-Duty Boots and Float Stone can be handled with small targeted checks. Iron Ball requires both a `onSpeedModifier` hook and a grounding override in `fieldState.ts`. Ring Target needs the most care because type immunity suppression touches the effectiveness calculation path.

## Problem Details

**File:** `packages/server/src/engine/BattleEngine.ts:2296` and `packages/server/src/engine/sideConditions.ts:80`

**Heavy-Duty Boots** — Entry hazards are applied unconditionally to the incoming Pokémon:
```typescript
// BattleEngine.ts:2296
events.push(...applyEntryHazards(incoming, slotId, incomingSide, incomingTeamIndex, incomingTypes, grounded, this.data));
```
There is no item check before this call.

**Iron Ball** — (a) The `isGrounded` helper in `fieldState.ts` returns false for Flying-type Pokémon, but Iron Ball overrides this; no item check exists in that path. (b) The Speed halve is not registered in `ITEM_HOOKS`.

**Ring Target** — The type-effectiveness calculation consults the type chart; immunities (0× results) are returned but never suppressed by the holder's item. The exact call site depends on how `resolveEffectiveTypes` and `getCombinedEffectiveness` are called in BattleEngine, but no item hook intervenes.

**Float Stone** — Weight is read directly from species data at `BattleEngine.ts:1451-1454`:
```typescript
{ ...target, weightkg: targetSpeciesForPower?.weightkg ?? 0, ... }
```
There is no check to halve `weightkg` when the Pokémon holds Float Stone.

## Impact

- Heavy-Duty Boots: the most common hazard-immunity item doesn't work; switch-in damage and Sticky Web speed drops land on the holder.
- Iron Ball: Flying-type holders are not grounded (Spikes/Sticky Web still miss them) and their Speed is not halved.
- Ring Target: type immunities are not removed; Thunder Wave still can't hit Normal-types holding Ring Target, etc.
- Float Stone: Grass Knot, Low Kick, and other weight-based moves deal more damage than they should against the holder.

## Suggested Fix

1. **Heavy-Duty Boots** — before the `applyEntryHazards` call at `BattleEngine.ts:2296`, add:
   ```typescript
   if (incoming.heldItem !== 'heavy-duty-boots') {
     events.push(...applyEntryHazards(incoming, slotId, incomingSide, incomingTeamIndex, incomingTypes, grounded, this.data));
   }
   ```
   Add `'heavy-duty-boots': {}` to `ITEM_HOOKS`.

2. **Iron Ball** — register in `ITEM_HOOKS`:
   ```typescript
   'iron-ball': { onSpeedModifier: () => 0.5 },
   ```
   In `fieldState.ts:isGrounded`, add a check before the Flying-type early return:
   ```typescript
   if (pokemon.heldItem === 'iron-ball') return true;
   ```
   Also ensure iron-ball grounding applies in the Spikes/Sticky Web hazard path in `sideConditions.ts:109`.

3. **Ring Target** — add an inline check in BattleEngine wherever `0×` effectiveness would block a move. When the target holds `ring-target`, treat any `0` effectiveness result as `1` (neutral) instead. This should be applied to both the damage calculation and the "move has no effect" early-exit guard.

4. **Float Stone** — at `BattleEngine.ts:1451-1454`, halve the weight for Float Stone holders:
   ```typescript
   const targetWeight = (targetSpeciesForPower?.weightkg ?? 0) *
     (target.heldItem === 'float-stone' ? 0.5 : 1);
   ```
   Apply the same to the attacker weight for moves like Heat Crash. Add `'float-stone': {}` stub to `ITEM_HOOKS`.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts:2296`, `1451-1454`
- `packages/server/src/engine/sideConditions.ts:80` (applyEntryHazards)
- `packages/server/src/engine/fieldState.ts` (isGrounded)
