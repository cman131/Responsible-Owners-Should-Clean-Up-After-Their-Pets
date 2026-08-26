# Ability Dropdown in Pokemon Builder

**Date:** 2026-08-26  
**Status:** Approved

## Summary

Add an ability `<select>` dropdown to `PokemonSlotEditor` so admins can choose from the available abilities for the selected species when building teams for NPCs and players. The dropdown defaults to the first ability in the species' abilities object and includes all abilities (slot 0, slot 1, and hidden slot H).

## Scope

Single file change: `packages/client/src/admin/PokemonSlotEditor.tsx`, plus a new test case in `packages/client/src/admin/__tests__/PokemonSlotEditor.test.tsx`.

No changes to shared types, schemas, server, or other components. The `ability` field on `PokemonSet` is already a string (ability display name), and `PokemonSpecies.abilities` already carries all three slots.

## Data Shape

`PokemonSpecies.abilities` is `{ 0: string; 1?: string; H?: string }` where values are display names (e.g. `"Swift Swim"`, `"Rock Head"`). `Object.values(species.abilities)` yields the populated entries in insertion order: `[slot0, slot1?, slotH?]`.

`PokemonSet.ability` stores the display name string directly (e.g. `"Swift Swim"`).

## UI Placement

An **Ability** row is inserted between the Level row and the Nature row inside the `value.speciesId` editor section of `PokemonSlotEditor`.

## Behavior

| State | Rendered element |
|---|---|
| `currentSpecies` loaded | `<select>` with one `<option>` per `Object.values(species.abilities)` entry |
| `currentSpecies` still fetching (socket in flight) | `<select disabled>` with a single option showing `value.ability ?? ''` |
| Species just picked via `pickPokemon` | Already handled — `pickPokemon` sets `ability: Object.values(species.abilities)[0]` |

On `onChange`, call `updateField('ability', selectedValue)`.

## Default Behavior

`pickPokemon` (line 66–78 in `PokemonSlotEditor.tsx`) already sets `ability: Object.values(species.abilities)[0] ?? ''` when a new species is selected. No additional reset logic is required.

## Tests

Add a test case to `PokemonSlotEditor.test.tsx` covering:
- Ability dropdown renders the correct options when `currentSpecies` is available (slot 0, slot 1, hidden)
- Selecting a different option calls `onChange` with the updated `ability` value
- When `currentSpecies` is null (loading), the select is disabled and shows the current `value.ability`
