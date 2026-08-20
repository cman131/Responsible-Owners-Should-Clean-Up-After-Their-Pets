# Move Search Dropdown Design

**Date:** 2026-08-20
**Status:** Approved

## Summary

Replace the four plain-text move ID inputs in TeamBuilder with `MoveSearchDropdown` components — searchable dropdowns modelled after `PokemonSearchDropdown`. Each slot searches within the Pokémon's learnset by default, with a per-slot checkbox to search all moves in the game. Giving a Pokémon more than one of the same move is invalid and enforced in the UI.

---

## Architecture

Three files change:

| File | Change |
|---|---|
| `packages/client/src/admin/MoveSearchDropdown.tsx` | New component |
| `packages/client/src/admin/TeamBuilder.tsx` | Replace 4 text inputs with 4 `MoveSearchDropdown` instances |
| `packages/server/src/socket/handlers/adminHandlers.ts` | Extend `moves` resource handler |

---

## Component: MoveSearchDropdown

**Location:** `packages/client/src/admin/MoveSearchDropdown.tsx`

### Props

```ts
interface Props {
  speciesId: number;
  value: string;               // currently selected move ID ('' if none)
  selectedMoves: string[];     // all 4 slot IDs for this Pokémon (duplicate check)
  onChange: (moveId: string) => void;
}
```

### Internal state

- `query: string` — current search text
- `results: Move[]` — filtered dropdown options
- `highlighted: number` — keyboard cursor index
- `allMovesMode: boolean` — whether the "all moves" checkbox is checked
- `learnsetCache: Move[]` — full learnset for current `speciesId`, fetched once on mount/species-change
- `selectedMove: Move | null` — the full Move object for the currently selected move ID, used to render the selected-state summary row
- `open: boolean` — whether the dropdown is visible

### Lifecycle

1. On mount or `speciesId` change: emit `data:query { resource: 'moves', speciesId }` and store the result in `learnsetCache`. Call `onChange('')`, clear `query`, `results`, `selectedMove`, reset `allMovesMode` to `false`, and set `open` to `false`.
2. On input focus: in learnset mode, set `results` to the full `learnsetCache` and set `open` to `true`.
3. On query change (learnset mode): filter `learnsetCache` client-side by query text — no server round trip.
4. On query change (all-moves mode, ≥ 2 chars): emit `data:query { resource: 'moves', query }` to server; update `results` from `data:results` response.
5. On `data:results` with `resource === 'moves'`: update `results`, reset `highlighted` to 0.
6. On move picked: store the full Move object in `selectedMove`, call `onChange(move.id)`, clear `query`, set `open` to `false`.

### Dropdown result filtering

A result move is marked "already picked" if `move.id !== value && selectedMoves.includes(move.id)`. These moves are rendered with strikethrough styling, an "already picked" label, and are unclickable. They remain visible so the user understands why they are unavailable.

### Search threshold

- **Learnset mode:** show all learnset results on focus (no minimum characters). Filter narrows as user types.
- **All-moves mode:** require ≥ 2 characters before querying the server.

### Selected state

When `value` is non-empty, the input is replaced by a summary row (blue border, `#0d1a2e` background) showing: move display name, type badge, category badge (`Ph`/`Sp`/`St`), base power (or `—` for status), and a `✕` button to clear. Clicking `✕` calls `onChange('')` and returns to the empty search state.

### Keyboard navigation

- `ArrowDown` / `ArrowUp` — move highlight through selectable results
- `Enter` — select highlighted result
- `Escape` — close dropdown; if a move is already selected, keep it

### Dropdown row format

Each result row shows (left to right): move display name, type badge (colored), category badge (`Ph`/`Sp`/`St`), base power (`—` for status moves), PP.

---

## Server Changes

**File:** `packages/server/src/socket/handlers/adminHandlers.ts`

The `moves` case in the `data:query` handler is extended to support two call shapes:

### Learnset fetch
```ts
{ resource: 'moves', speciesId: number }
```
Returns all `Move` objects for the species' learnset. No text filtering — the client handles that. Called once per species selection.

### All-moves text search
```ts
{ resource: 'moves', query: string }   // no speciesId
```
Returns up to 30 `Move` objects where `move.id` or `move.name` contains the query string (case-insensitive). Called on each keystroke when "all moves" mode is active.

Response shape is unchanged: `{ resource: 'moves', results: Move[] }`.

---

## Duplicate Prevention

- Enforced in the dropdown UI: already-selected moves are shown but unselectable (strikethrough + label).
- No additional validation needed at save time — the UI makes invalid state unreachable.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Species changes in a slot | All 4 move fields clear; learnset cache resets; "all moves" checkboxes reset to unchecked |
| Move selected via all-moves mode (not in learnset) | Kept as-is — the checkbox opted out of learnset restriction |
| Empty learnset | Dropdown shows empty state; "all moves" checkbox still available |
| All 4 moves already filled | Remaining slots still allow changing a move; duplicate check updates reactively |

---

## Files Not Changing

- `PokemonSearchDropdown.tsx` — no changes; serves as the reference pattern
- Shared types (`Move`, `PokemonSet`) — no changes needed
- Any battle or lobby code — move IDs are already strings throughout
