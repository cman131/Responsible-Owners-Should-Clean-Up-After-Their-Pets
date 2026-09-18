# Contact-Modifier Items

## State

Complete

## Summary

Protective Pads and Punching Glove both modify whether the holder's moves are treated as making contact, but `makesContact` is read directly from `move.makesContact` at the point of use in BattleEngine with no opportunity for an item hook to override it. Neither item is registered in `ITEM_HOOKS`. The two items share the same root gap — a holder-side `makesContact` override — and can be implemented together.

## Problem Details

**File:** `packages/server/src/engine/BattleEngine.ts:1572`

The `makesContact` flag is derived unconditionally from the move data:

```typescript
// BattleEngine.ts:1572 (ItemAttackContext passed to defender and after-hit hooks)
makesContact: move.makesContact === true,
```

The same pattern appears at lines 1814 and 1890. There is no path for the attacker's item to suppress or override this value. As a result:

- **Protective Pads**: contact-triggered effects (Rocky Helmet recoil, Static, Rough Skin, Flame Body, etc.) still fire against the holder even though the item is supposed to prevent them.
- **Punching Glove**: punch moves still make contact (meaning Rocky Helmet etc. trigger) and the 1.1× punch-move power bonus is missing.

For Punching Glove, punch move identification also needs to be established. The `Move` type in `move.schema.ts` may already carry a `flags` field or similar; if not, a set of punch move IDs is needed.

## Impact

- Protective Pads holders take recoil from Rocky Helmet, lose HP to Rough Skin/Iron Barbs, can be paralysed/burned by contact abilities — all of which should be suppressed.
- Punching Glove deals ~9% less damage on punch moves and incorrectly triggers contact effects.

## Suggested Fix

1. Compute `makesContact` as a local variable before building contexts, then allow the attacker's item to override it:
   ```typescript
   let makesContact = move.makesContact === true;
   if (makesContact) {
     const heldItem = attacker.heldItem;
     if (heldItem === 'protective-pads') makesContact = false;
     if (heldItem === 'punching-glove' && isPunchMove(move)) makesContact = false;
   }
   ```
   Apply this at all three call sites (lines 1572, 1814, 1890).
2. Implement `isPunchMove(move)`: check if `move.flags` includes a punch flag, or maintain a `PUNCH_MOVES` set in BattleEngine / a shared constant if a flags field doesn't exist.
3. Register `punching-glove` in `ITEM_HOOKS` with an attacker modifier:
   ```typescript
   'punching-glove': {
     onAttackerModifier: ({ holder, /* need move access */ }) => ...,
   },
   ```
   Since `onAttackerModifier` doesn't receive the move, either pass the move in `ItemAttackContext` (it already has `basePower` and `moveType` but not `move`) or add `moveId?: string` to the context so the hook can look it up. Alternatively, handle the power boost inline next to the `makesContact` override.
4. Add `'protective-pads': {}` stub to `ITEM_HOOKS` so it appears in `IMPLEMENTED_ITEM_IDS`.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts:1572`, `1814`, `1890`
- `packages/shared/src/schemas/move.schema.ts`
