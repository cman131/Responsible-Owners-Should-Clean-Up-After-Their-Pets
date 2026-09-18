# Tech Debt: Small Search and Load Fixes in Slot Editor

## State

Complete

Two small, independent UX fixes in the Pokémon slot editing flow. Neither is complex on its own; grouping them avoids two separate one-line PRs.

---

## 1 — Ability Field Appears Broken While Species Data Loads

### Summary

When opening a saved Pokémon in `PokemonSlotEditor`, the Ability field renders as a disabled `<select>` showing a raw ability-id string until the socket response for the species data arrives. This looks like a broken or unresponsive control.

### Location

- `packages/client/src/admin/PokemonSlotEditor.tsx` (lines 150–166)

### Root Cause

The component distinguishes between "species loaded" and "species loading" to decide whether the ability select is editable:

```tsx
{currentSpecies ? (
  <select value={value.ability ?? ''} onChange={...} style={inp}>
    {Object.values(currentSpecies.abilities).map((a) => <option key={a} value={a}>{a}</option>)}
  </select>
) : (
  // Shown while loading — raw id string, disabled
  <select disabled value={value.ability ?? ''} style={inp}>
    <option value={value.ability ?? ''}>{value.ability ?? ''}</option>
  </select>
)}
```

`currentSpecies` starts as `null` even though `value.speciesId` and `value.ability` are already known from saved data. The species fetch is an async socket round-trip.

### Impact

Every time an admin opens a Pokémon loaded from a saved profile or default team, the ability dropdown is briefly (or noticeably) disabled with an unformatted string. Looks like an error state; at best it's a flicker. The same delay affects the base stats row and sprite, but the ability select is the most interactive element.

### Suggested Fix

Show a loading hint rather than a silent broken-looking control:

```tsx
{currentSpecies ? (
  <select value={value.ability ?? ''} onChange={...} style={inp}>
    {Object.values(currentSpecies.abilities).map((a) => <option key={a} value={a}>{a}</option>)}
  </select>
) : value.speciesId ? (
  <select disabled value={value.ability ?? ''} style={{ ...inp, color: '#888' }}>
    <option value={value.ability ?? ''}>{value.ability ?? ''} (loading…)</option>
  </select>
) : null}
```

A better long-term fix is to pre-seed `currentSpecies` from a local cache when the species was recently fetched, or to batch the species fetch for all Pokémon in a team when the editor mounts.

---

## 2 — PokemonSearchDropdown Requires At Least 2 Characters

### Summary

`PokemonSearchDropdown` only fires a search when the query is ≥ 2 characters. Typing a single character (e.g., dex number `1` for Bulbasaur) produces no results.

### Location

- `packages/client/src/admin/PokemonSearchDropdown.tsx` (line 27–30)

### Root Cause

```tsx
function handleChange(q: string) {
  setQuery(q);
  if (q.length >= 2) {
    getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'pokemon', query: q } } as any);
  } else {
    setResults([]);
  }
}
```

The 2-character minimum was likely added to avoid overly broad results, but the server already limits results to 30 (`slice(0, 30)`).

### Impact

- Typing `"1"` to find Bulbasaur produces nothing; you must type `"1 "` or `"bu"`.
- Dex numbers 1–9 require a workaround.
- Pokémon with short names are harder to find by first letter.

### Suggested Fix

Lower the threshold to 1 character and add a short debounce so rapid typing doesn't fire a query per keystroke:

```tsx
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function handleChange(q: string) {
  setQuery(q);
  if (debounceRef.current) clearTimeout(debounceRef.current);
  if (q.length >= 1) {
    debounceRef.current = setTimeout(() => {
      getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'pokemon', query: q } } as any);
    }, 150);
  } else {
    setResults([]);
  }
}
```
