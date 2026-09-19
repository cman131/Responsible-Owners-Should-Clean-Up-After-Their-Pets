# Player Portal: Item Equipping and Unequipping

## State

New

## Summary

Players need to equip items from their inventory onto Pokémon in their team or bank, and unequip them back into inventory — entirely through the player portal without admin involvement. This plan adds equip/unequip controls to the player-facing Pokémon cards built in `player-team-bank-and-nickname-management.md`. It reuses the inventory-aware leasing logic already present in the admin `PokemonSlotEditor`, but scoped to items the player actually owns, with species restriction enforcement, and tied to the portal's save flow rather than admin save.

## Problem Details

**File:** `packages/client/src/admin/PokemonSlotEditor.tsx:48-53`

```typescript
interface Props {
  value: Partial<PokemonSet>;
  onChange: (updated: Partial<PokemonSet>) => void;
  inventory?: Record<string, number>;
  leasedItems?: Record<string, number>;
}
```

The admin `PokemonSlotEditor` already supports inventory-constrained item equipping via `inventory` and `leasedItems` props. The player portal needs equivalent logic but built into the lighter `PlayerTeamView` / `PlayerBankTab` cards — not the full slot editor.

**File:** `packages/client/src/admin/InventoryTab.tsx:22`

```typescript
socket.emit('admin:action', { type: 'data:query', data: { resource: 'items' } } as any);
```

The existing item lookup is gated behind `admin:action`. The player portal needs to fetch items via the `player:portal-items-query` event added in `player-access-key-and-portal-socket-infrastructure.md`.

**File:** `packages/shared/src/types/registry.ts:7`

```typescript
heldItem?: string;
```

`PokemonSet.heldItem` is the field being set/cleared. When the server validates a `player:portal-save` payload, it must permit `heldItem` changes (per the field-locking rules in `player-team-bank-and-nickname-management.md`) while checking that the net held-item counts across team + bank do not exceed the player's inventory quantities.

## Impact

- Players must ask the admin to equip or swap items between Pokémon — a frequent task during DnD sessions.
- Without inventory-count enforcement, a player could equip the same single item on two Pokémon (ghost item duplication).
- Species-restricted items (e.g. `thick-club` for Marowak only) could be equipped to wrong Pokémon if filtering is omitted.

## Suggested Fix

1. Add an equip affordance to `PlayerTeamView` and `PlayerBankTab` Pokémon cards (both built in the previous plan):
   - If `heldItem` is set: show the item name badge and an UNEQUIP button. Clicking UNEQUIP clears `heldItem` and increments the in-flight inventory count.
   - If `heldItem` is unset: show an "EQUIP ITEM" button that opens `ItemEquipDropdown`.

2. Create `packages/client/src/player/ItemEquipDropdown.tsx`:
   - On mount, emits `player:portal-items-query` (added to `ClientToServerEvents` in Plan A) and listens for `player:portal-items` response.
   - Filters results to `equippable: true`, `speciesRestriction === undefined || speciesRestriction === pokemon.speciesName`, and `availableQty > 0` (available = `inventory[id] - leasedAcrossTeamAndBank[id]`, same formula as admin's `PokemonSlotEditor.tsx:58-68`).
   - Renders a searchable dropdown (reuse the visual style of `ItemSearchDropdown.tsx`).
   - On selection: calls a callback with the chosen item ID; parent component updates `PokemonSet.heldItem` and decrements the in-flight inventory count.

3. `PlayerPortalPage.tsx` computes `leasedItems` reactively from `localTeam` + `localBank` (same helper used in the admin `PlayerProfileEditor`). Pass it as a prop to `PlayerTeamView` and `PlayerBankTab` so the available-count calculation stays consistent across both views.

4. The portal's "SAVE CHANGES" flow (from Plan C) already sends updated `team` and `bank`. No additional save event is needed — `heldItem` changes are part of the same save payload.

5. On `player:portal-save` in `playerPortalHandlers.ts`, add a leasing validation: for each item ID held across the incoming `team + bank`, check that the count does not exceed `profile.inventory[itemId] ?? 0`. Reject with `player:portal-error` if exceeded.

6. Add a read-only inventory count display to the portal's Inventory tab (no add/remove — the player cannot change quantities): shows item name and current quantity, updating live to reflect in-flight local equips/unequips before saving.

## Related Files

- `packages/client/src/pages/PlayerPortalPage.tsx`
- `packages/client/src/player/PlayerTeamView.tsx`
- `packages/client/src/player/PlayerBankTab.tsx`
- `packages/client/src/player/ItemEquipDropdown.tsx` (new)
- `packages/client/src/admin/PokemonSlotEditor.tsx` (pattern reference)
- `packages/client/src/admin/ItemSearchDropdown.tsx` (pattern reference)
- `packages/server/src/socket/handlers/playerPortalHandlers.ts`
- `packages/shared/src/types/registry.ts`
- `packages/shared/src/types/events.ts`
