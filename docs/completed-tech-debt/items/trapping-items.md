# Trapping Items

## State

Complete

## Summary

Shed Shell, Binding Band, and Grip Claw all modify how partial-trapping (the `bound` volatile) and switch-blocking work, but none are registered in `ITEM_HOOKS` and none have corresponding engine hooks. The three items touch the same trapping subsystem: Shed Shell bypasses the switch-block check; Binding Band increases the per-turn damage of the `bound` volatile from 1/8 to 1/6; Grip Claw extends the bound duration from 4-5 turns to 7.

## Problem Details

**File:** `packages/server/src/engine/BattleEngine.ts:2210` and `packages/server/src/engine/EffectEngine.ts:271`

**Shed Shell** — Two locations in BattleEngine prevent a Pokémon with a trapping volatile from switching:

```typescript
// BattleEngine.ts:2210 — switch action validation
const isTrapped = active.volatileStatus.some(
  v => v.name === 'trapped' || v.name === 'no-retreat' || v.name === 'ingrain',
);
if (isTrapped) { ... block switch ... }

// BattleEngine.ts:675 — pivot (U-turn / Volt Switch) path
const isTrapped = attacker.volatileStatus.some(
  v => v.name === 'trapped' || v.name === 'no-retreat'
);
```

Neither check examines the trapped Pokémon's item before blocking the switch.

**Binding Band** — End-of-turn `bound` damage is hardcoded in `EffectEngine.ts:273`:
```typescript
this.applyDamage(pokemon, slotId, Math.max(1, Math.floor(pokemon.maxHp / 8)), 'bound', events);
```
The `bound` volatile's `sourceSlotId` field (`VolatileStatusEntry.sourceSlotId`) records who applied the trap, but the engine never checks the trapper's item to scale the damage.

**Grip Claw** — The `counter` in the `bound` volatile controls remaining turns. The trapping move effect registration (in `registrations.ts`) sets this counter to a random value (4–5 turns), but doesn't check whether the attacker holds Grip Claw before setting it.

## Impact

- Shed Shell: Pokémon cannot escape trapping moves even when holding the item specifically designed to allow it.
- Binding Band: passive trap chip is weaker than intended — 1/8 instead of 1/6 max HP per turn.
- Grip Claw: traps expire after 4-5 turns instead of the intended 7; trapper loses 2–3 turns of chip damage.

## Suggested Fix

1. **Shed Shell** — add `heldItem !== 'shed-shell'` guards at both trap-block sites:
   ```typescript
   // BattleEngine.ts:2210
   const isTrapped = active.heldItem !== 'shed-shell' && active.volatileStatus.some(
     v => v.name === 'trapped' || v.name === 'no-retreat' || v.name === 'ingrain',
   );
   // BattleEngine.ts:675
   const isTrapped = attacker.heldItem !== 'shed-shell' && attacker.volatileStatus.some(
     v => v.name === 'trapped' || v.name === 'no-retreat'
   );
   ```
   Add `'shed-shell': {}` to `ITEM_HOOKS` so it appears in `IMPLEMENTED_ITEM_IDS`.

2. **Binding Band** — in `EffectEngine.ts:273`, resolve the trapper's active Pokémon via `boundEntry.sourceSlotId` and check their held item:
   ```typescript
   const fraction = trapperHoldsBindingBand(s, boundEntry.sourceSlotId) ? 1/6 : 1/8;
   this.applyDamage(pokemon, slotId, Math.max(1, Math.floor(pokemon.maxHp * fraction)), 'bound', events);
   ```
   Add `'binding-band': {}` stub to `ITEM_HOOKS`.

3. **Grip Claw** — in the trapping move effect handler in `registrations.ts`, before setting the bound volatile's counter, check if the attacker holds `grip-claw` and use 7 instead of rolling 4-5:
   ```typescript
   counter: attacker.heldItem === 'grip-claw' ? 7 : rollTrapDuration(rng),
   ```
   Add `'grip-claw': {}` stub to `ITEM_HOOKS`.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts:2210`, `675`
- `packages/server/src/engine/EffectEngine.ts:271-279`
- `packages/server/src/engine/registrations.ts` (trapping move effect)
