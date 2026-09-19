# Inventory-Constrained Item Equipping (Item Leasing)

## State

Complete

## Summary

No link exists between a player's inventory and which items their pokemon can hold. `PokemonSlotEditor` allows any implemented item to be equipped regardless of whether the player owns it. The desired model is "item leasing": an item held by a pokemon is counted against the player's inventory, so a player with 1 Choice Band cannot equip it to two different pokemon simultaneously. This plan adds that constraint to the admin UI and server-side save validation. Depends on the player-inventory-system-foundation and item-type-classification-equippable-flag plans.

## Problem Details

**File:** `packages/client/src/admin/PokemonSlotEditor.tsx:193-200`

```typescript
<ItemSearchDropdown
  value={value.heldItem ?? ''}
  onChange={(itemId) => updateField('heldItem', itemId || undefined)}
/>
```

The dropdown has no awareness of the player's inventory. Any item can be selected freely.

**File:** `packages/client/src/admin/PlayerProfileEditor.tsx:15-16`

```typescript
const [team, setTeam] = useState<PokemonSet[]>(profile?.defaultTeam?.pokemon ?? []);
const [bank, setBank] = useState<PokemonSet[]>(profile?.bank ?? []);
```

`PlayerProfileEditor` holds both team and bank state but does not compute how many of each item are currently leased across them. There is no `inventory` state yet (added by the foundation plan).

**File:** `packages/server/src/socket/handlers/adminHandlers.ts` — `registry:save-player` case

The save handler writes the profile to the DB without validating that held items on pokemon are backed by the player's inventory.

## Impact

- Players can equip items they don't own, undermining the inventory economy.
- Two pokemon can hold the same single-quantity item simultaneously, creating ghost items.
- Admins have no feedback in the UI about item availability when building teams.

## Suggested Fix

1. In `PlayerProfileEditor`, compute a `leasedItems` map after each change to `team` or `bank`:
   ```typescript
   function computeLeased(team: PokemonSet[], bank: PokemonSet[]): Record<string, number> {
     const leased: Record<string, number> = {};
     for (const p of [...team, ...bank]) {
       if (p.heldItem) leased[p.heldItem] = (leased[p.heldItem] ?? 0) + 1;
     }
     return leased;
   }
   ```

2. Pass `inventory` and `leasedItems` as props down the component tree:
   - `PlayerProfileEditor` → `TeamBuilder` → `PokemonSlotEditor`
   - `PlayerProfileEditor` → `BankTab` → (add/edit modal) `PokemonSlotEditor`

3. In `PokemonSlotEditor`, compute available count for each item:
   ```
   available(itemId) = (inventory[itemId] ?? 0) - (leasedItems[itemId] ?? 0) + (currentPokemonHeldItem === itemId ? 1 : 0)
   ```
   The `+1` correction accounts for the fact that this pokemon's own held item is already counted in `leasedItems`.

4. In `ItemSearchDropdown`, accept an optional `availabilityMap?: Record<string, number>` prop. Items with `availabilityMap[id] <= 0` should be shown greyed-out with a "0 available" label rather than hidden, so the player knows they own the item but it's fully leased.

5. Block saving in `handleSave` (`PlayerProfileEditor.tsx:37`) if any pokemon holds an item where `available(itemId) < 0` — surface a validation error inline.

6. Add server-side validation in the `registry:save-player` handler in `adminHandlers.ts`: verify that for each item ID held across team + bank, the count does not exceed `profile.inventory[itemId] ?? 0`. Return an error event if violated, rather than silently saving.

## Related Files

- `packages/client/src/admin/PlayerProfileEditor.tsx`
- `packages/client/src/admin/TeamBuilder.tsx`
- `packages/client/src/admin/PokemonSlotEditor.tsx`
- `packages/client/src/admin/BankTab.tsx`
- `packages/client/src/admin/ItemSearchDropdown.tsx`
- `packages/server/src/socket/handlers/adminHandlers.ts`
- `packages/shared/src/types/registry.ts`
