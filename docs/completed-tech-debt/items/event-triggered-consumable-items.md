# Event-Triggered Consumable Items

## State

Complete

## Summary

Four items that fire in response to specific in-battle events — using a sound move (Throat Spray), being Intimidated (Adrenaline Orb), a move missing (Blunder Policy), and a move's PP hitting zero (Leppa Berry) — cannot be implemented today because no `ItemHooks` entries exist for those events, and BattleEngine has no call sites for item hooks at those points. All four items require adding a new hook signature to `ItemHooks` and a corresponding call site in the engine.

## Problem Details

**File:** `packages/server/src/engine/items.ts:17` (`ItemHooks` interface)

The four triggering events exist in the engine but have no item hook:

- **Throat Spray** — fires after the holder successfully uses a sound move. `BattleEngine.ts:1720` reads `move.soundMove === true` to drive secondary-effect logic, but no item hook is called at that point.
- **Adrenaline Orb** — fires when the holder is Intimidated. Intimidate stat drops are applied to foes in `BattleEngine.applySwitchInResult` (~line 2357) via `statBoostDeltas`; no item hook is called on the affected Pokémon at that moment.
- **Blunder Policy** — fires when the holder's move misses. BattleEngine emits a `move-miss` event on a failed accuracy roll, but there is no item hook call after the miss path.
- **Leppa Berry** — restores 10 PP to the first move that reaches 0 PP. PP is decremented when a move is used; no hook fires when a move slot's `currentPp` reaches zero.

## Impact

- Throat Spray: sound-move users get no Sp.Atk boost; a common competitive item does nothing.
- Adrenaline Orb: Intimidate-bait strategies don't work — no Speed boost is given.
- Blunder Policy: inaccurate moves using this item get no Speed boost on miss.
- Leppa Berry: PP is not restored; a Pokémon runs out of PP and must struggle sooner than intended.

## Suggested Fix

1. Add three new optional hooks to `ItemHooks` in `items.ts`:
   ```typescript
   onAfterSoundMove?: (ctx: ItemContext) => {
     statBoostDeltas?: Partial<StatBoosts>; consume?: boolean;
   } | null;
   onIntimidated?: (ctx: ItemContext) => {
     statBoostDeltas?: Partial<StatBoosts>; consume?: boolean;
   } | null;
   onMoveMissed?: (ctx: ItemContext) => {
     statBoostDeltas?: Partial<StatBoosts>; consume?: boolean;
   } | null;
   ```
2. In BattleEngine, after confirming a sound move landed (around line 1720), call `getItemHooks(attacker.heldItem).onAfterSoundMove?.({...})` and apply any returned boosts/consume.
3. In `BattleEngine.applySwitchInResult` (around line 2357), after applying Intimidate stat drops to each foe Pokémon, call `getItemHooks(foePokemon.heldItem).onIntimidated?.({...})` and apply returned boosts/consume.
4. In BattleEngine's miss path (where `move-miss` event is emitted), call `getItemHooks(attacker.heldItem).onMoveMissed?.({...})` and apply returned boosts/consume.
5. Register the three items:
   ```typescript
   'throat-spray': { onAfterSoundMove: () => ({ statBoostDeltas: { spa: 1 }, consume: true }) },
   'adrenaline-orb': { onIntimidated: () => ({ statBoostDeltas: { spe: 1 }, consume: true }) },
   'blunder-policy': { onMoveMissed: () => ({ statBoostDeltas: { spe: 2 }, consume: true }) },
   ```
6. For Leppa Berry: after decrementing PP for a used move in BattleEngine, check if `currentPp === 0` and the holder has `leppa-berry` — restore 10 PP to that move and consume the item. This can be handled inline rather than via a new hook since the PP decrement location is a single point.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts` (sound-move path ~line 1720, miss path, `applySwitchInResult` ~line 2357, PP decrement path)
