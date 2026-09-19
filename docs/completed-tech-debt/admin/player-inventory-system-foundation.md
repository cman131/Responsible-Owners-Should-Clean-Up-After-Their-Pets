# Player Inventory System Foundation

## State

Complete

## Summary

`PlayerProfile` has no `inventory` field, the `players` DB table has no inventory column, and `PlayerProfileEditor` has no UI to manage items a player owns. Without this foundation, there is no way to track which items a player has in their possession or in what quantities. This is the prerequisite for all inventory-enforcement features (constrained equipping, item leasing, type filtering).

## Problem Details

**File:** `packages/shared/src/types/registry.ts:23-29`

```typescript
export interface PlayerProfile {
  profileId: string;
  displayName: string;
  defaultTeam?: TeamTemplate;
  bank?: PokemonSet[];
  createdAt: string;
  // ← no inventory field
}
```

**File:** `packages/server/src/db/Database.ts:201-208`

```sql
CREATE TABLE IF NOT EXISTS players (
  profileId    TEXT PRIMARY KEY,
  displayName  TEXT NOT NULL,
  createdAt    TEXT NOT NULL,
  defaultTeam  TEXT,
  bank         TEXT
  -- ← no inventory column
);
```

**File:** `packages/client/src/admin/PlayerProfileEditor.tsx:17`

```typescript
const [tab, setTab] = useState<'team' | 'bank'>('team');
```

The tab union and UI (lines 80–90) only offer TEAM and BANK — no INVENTORY tab exists.

## Impact

- No way to track player item ownership; all downstream inventory-enforcement plans are blocked.
- Admins cannot give players items independently of pokemon held items.
- Items equipped to pokemon have no authoritative source of truth in the player profile.

## Suggested Fix

1. Add `inventory?: Record<string, number>` to `PlayerProfile` in `packages/shared/src/types/registry.ts`. Keys are hyphenated item IDs (matching ITEM_HOOKS keys, e.g. `'choice-band'`); values are quantity owned.

2. Add the `inventory` column to the `players` table using the try/catch `ALTER TABLE` pattern already established at `Database.ts:234-238` (the same approach used to add `eventLog` to battles):
   ```typescript
   try {
     this.conn.exec(`ALTER TABLE players ADD COLUMN inventory TEXT`);
   } catch { /* column already exists */ }
   ```

3. Update `PlayersStore.list()` (Database.ts:7-19) to deserialize inventory from JSON, and `PlayersStore.save()` (Database.ts:21-36) to serialize it — following the same pattern as `defaultTeam` and `bank`.

4. Extend the `PlayerProfile` object built in `handleSave` (`PlayerProfileEditor.tsx:40-53`) to include the new `inventory` state.

5. Add `'inventory'` to the tab union in `PlayerProfileEditor` and render a new `InventoryTab` component when selected. The INVENTORY tab should:
   - List currently owned items with their quantities (item name + count badge).
   - Provide an `ItemSearchDropdown` to add a new item to the inventory.
   - Show `+` / `−` buttons per item to adjust quantity; remove the entry at 0.
   - Render an empty state when inventory is `{}` or undefined.

## Related Files

- `packages/shared/src/types/registry.ts`
- `packages/server/src/db/Database.ts`
- `packages/server/src/socket/handlers/adminHandlers.ts`
- `packages/client/src/admin/PlayerProfileEditor.tsx`
- `packages/client/src/admin/ItemSearchDropdown.tsx`
- `packages/client/src/admin/InventoryTab.tsx` *(new)*
