# Item Selection in Pokemon Builder — Spec

**Date:** 2026-09-02  
**Status:** Ready for implementation  
**Scope:** Add item selection to `PokemonSlotEditor` for both player and NPC teams. Items are restricted to those with implemented battle effects.

---

## What changes

### `packages/server/src/data/loader.ts`

Add `getAllItems(): HeldItem[]` method:

```typescript
getAllItems(): HeldItem[] {
  return Array.from(this.items.values());
}
```

### `packages/server/src/engine/items.ts`

Export the set of implemented item IDs so admin handlers can filter without importing battle logic:

```typescript
export const IMPLEMENTED_ITEM_IDS: ReadonlySet<string> = new Set(Object.keys(ITEM_HOOKS));
```

### `packages/server/src/socket/handlers/adminHandlers.ts`

Add `items` case to the `data:query` switch:

```typescript
case 'items': {
  const { query: itemQuery } = payload.data as { query?: string };
  const allItems = data.getAllItems().filter((i) => IMPLEMENTED_ITEM_IDS.has(i.id));
  results = itemQuery
    ? allItems.filter((i) =>
        i.id.includes(itemQuery.toLowerCase()) || i.name.toLowerCase().includes(itemQuery.toLowerCase())
      )
    : allItems;
  break;
}
```

Import `IMPLEMENTED_ITEM_IDS` at the top of the handler.

### `packages/client/src/admin/ItemSearchDropdown.tsx` (new file)

A search dropdown for implemented items. Fetches on mount via `data:query { resource: 'items' }`, stores in local state, filters client-side on each keystroke (no further socket round-trips — list is ~25 items).

**Props:**
```typescript
interface Props {
  value: string;          // current item id, '' if none
  onChange: (itemId: string) => void;
}
```

**Behavior:**
- On mount: emit `admin:action { type: 'data:query', data: { resource: 'items' } }`, listen for `data:results` where `payload.resource === 'items'`, store results.
- When `value` is set: render selected-item chip (item name + berry badge if `isBerry`) with a ✕ clear button. Same visual style as the move dropdown's selected state.
- When `value` is empty: render text input. On focus, show all items. On keystroke, filter by name or id.
- Keyboard: ArrowUp/Down navigate, Enter selects, Escape closes.
- "None" is implicit — clearing the field sets `value` to `''`.

**Visual chip for selected item:**
```
[ Sitrus Berry   [Berry] ✕ ]
[ Choice Band           ✕ ]
```

### `packages/client/src/admin/PokemonSlotEditor.tsx`

Add item row between Ability and Nature:

```tsx
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <label style={lbl}>Item</label>
  <div style={{ flex: 1 }}>
    <ItemSearchDropdown
      value={value.heldItem ?? ''}
      onChange={(itemId) => updateField('heldItem', itemId || undefined)}
    />
  </div>
</div>
```

`PokemonSet.heldItem` is already `string | undefined` — no type changes needed.

---

## What does NOT change

- `PokemonSet.heldItem` — already defined in `packages/shared/src/types/registry.ts`
- `PartyMember.heldItem` — already defined in `packages/shared/src/types/battle.ts`
- `BattleConfigurator.buildPartyMember` — already copies `heldItem` from set to member
- Battle engine item hooks — already implemented in `items.ts`
- NPC builder — uses the same `TeamBuilder → PokemonSlotEditor` path; no separate changes needed

---

## Tests

- **`adminHandlers.test.ts`**: add test that `data:query { resource: 'items' }` returns only implemented items (not raw items.json entries without hooks).
- **`ItemSearchDropdown.test.tsx`**: mount component, mock socket to emit `data:results`, verify items render; verify clear button resets value; verify text filter narrows list.
- **`PokemonSlotEditor.test.tsx`**: verify item row renders; verify `onChange` receives `heldItem` update; verify `heldItem: undefined` when cleared.
