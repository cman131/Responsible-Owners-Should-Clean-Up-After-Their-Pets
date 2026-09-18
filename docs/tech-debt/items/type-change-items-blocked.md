# Type-Change Items (Blocked on Form-Change)

## State

New

## Summary

A large family of items — Plates (18), Memories (18), Drives (4), Griseous Orb/Core (Giratina), Adamant Orb/Crystal (Dialga), Lustrous Orb/Globe (Palkia), Rusted Sword (Zacian), and Rusted Shield (Zamazenta) — require the holder's species type and/or signature move type to change dynamically when the item is held. The engine has no form-change infrastructure (no mechanism to alter a Pokémon's effective types based on held item at battle start or on switch-in), so the defensive type changes cannot be implemented. The Adamant and Lustrous Orbs have a partial overlap with regular type-boost items and could be given a stopgap implementation immediately.

**Partially implemented:** Judgment's move type from held Plate and Multi-Attack's move type from held Memory are already handled inline in `BattleEngine.ts` via `PLATE_TYPE_MAP` and `MEMORY_TYPE_MAP`. What remains is the holder's own defensive type change and Techno Blast's Drive type.

## Problem Details

**File:** `packages/server/src/setup/BattleConfigurator.ts` (type assignment) and `packages/server/src/engine/items.ts`

Plates and Memories already change the move type of Judgment and Multi-Attack respectively (handled inline in `BattleEngine.ts:884-893`). What is not done: `BattleConfigurator` never sets `typeOverride` on the holder based on the held item, so Arceus/Silvally still have the wrong defensive types. Drives and Techno Blast have no implementation at all (no `DRIVE_TYPE_MAP` in BattleEngine). The Rusted items change Zacian and Zamazenta to their Crowned forms with different type/stat profiles — also not possible today.

The Adamant and Lustrous Orbs are an exception: in addition to their form-change behavior, they provide a 1.2× boost to specific move types for the holder:
- Adamant Orb (`adamant-orb`, `adamant-crystal`): Dragon and Steel moves ×1.2 for Dialga
- Lustrous Orb (`lustrous-orb`, `lustrous-globe`): Water and Dragon moves ×1.2 for Palkia

This boost component is independent of form-change and can be implemented today using `onAttackerModifier` with a species check — exactly the same pattern as the species-specific items in `species-specific-hold-items.md`.

## Impact

- Arceus with any Plate has the wrong defensive type (Judgment type is correct).
- Silvally with any Memory has the wrong defensive type (Multi-Attack type is correct).
- Genesect with any Drive has the wrong type and Techno Blast uses the wrong type.
- Giratina-Origin, Zacian-Crowned, Zamazenta-Crowned cannot be configured.
- Dialga and Palkia with their orbs get no stat boost.

## Suggested Fix

1. **Short-term (unblocked)**: implement Adamant Orb and Lustrous Orb as `onAttackerModifier` items with species guards (same approach as `thick-club`):
   ```typescript
   'adamant-orb': {
     onAttackerModifier: ({ holder, moveType }) =>
       holder.speciesName === 'dialga' && (moveType === 'Dragon' || moveType === 'Steel') ? 1.2 : 1,
   },
   ```
   Apply the same for `adamant-crystal`, `lustrous-orb`, and `lustrous-globe`.

2. **Short-term (unblocked)**: implement Techno Blast's Drive type following the same inline pattern used for Judgment/Multi-Attack — add a `DRIVE_TYPE_MAP` constant in `BattleEngine.ts` and a `if (move.id === 'technoblast')` branch in the move-type resolution block (around line 889).

3. **Long-term (blocked)**: set holder defensive type in `BattleConfigurator`:
   - Inspect the configured `heldItem` and set `typeOverride` for Arceus (Plates) and Silvally (Memories) at battle setup time.
   - Rusted Sword and Rusted Shield require stat profile changes in addition to type changes — handle via form-specific `PokemonSet` stat overrides in `BattleConfigurator`.

## Related Files

- `packages/server/src/engine/items.ts`
- `packages/server/src/engine/BattleEngine.ts:884-893` (PLATE_TYPE_MAP / MEMORY_TYPE_MAP — already done)
- `packages/server/src/setup/BattleConfigurator.ts`
- `packages/shared/src/types/battle.ts` (PartyMember.typeOverride)
