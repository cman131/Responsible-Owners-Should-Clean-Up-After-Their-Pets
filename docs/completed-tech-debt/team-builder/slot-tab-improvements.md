# Tech Debt: TeamBuilder Slot Tab Improvements (Reorder + Completeness Indicator)

## State

Complete

Two improvements to `TeamBuilder`'s slot tab strip that affect the same lines of code and are best implemented together.

---

## 1 — Always Shows 6 Slots With No Way to Reorder

### Summary

`TeamBuilder` always renders 6 slot tabs regardless of how many Pokémon are in the team. There is no way to reorder Pokémon, and the visual always implies a 6-slot team even for 1–2 Pokémon builds.

### Location

- `packages/client/src/admin/TeamBuilder.tsx` (lines 37–46)

### Root Cause

The slot tabs are rendered from a fixed `Array.from({ length: 6 }, ...)`, not from the actual team length:

```tsx
{Array.from({ length: 6 }, (_, i) => (
  <button
    key={i}
    onClick={() => { setSelectedSlot(i); if (!team[i]) { const t = [...team]; t[i] = {}; setTeam(t); } }}
    ...
  >
    {team[i]?.speciesId ? (team[i]!.nickname ?? `#${team[i]!.speciesId}`) : `Slot ${i + 1}`}
  </button>
))}
```

There is no drag-and-drop, swap, or remove-slot functionality.

### Impact

- For NPC trainers that only need 1–3 Pokémon, the 6-slot UI feels noisy.
- No way to order the team (lead Pokémon, etc.) without rebuilding it from scratch in the right order.
- Clearing a Pokémon from a middle slot leaves an empty gap tab.

### Suggested Fix

**Reorder (higher priority):** Add up/down arrows on each filled slot tab. Swapping just swaps `team[i]` and `team[i±1]`.

**Compact on clear:** When a slot is cleared, remove it from the array entirely rather than leaving an empty `{}`.

**Slot count:** Render only `filled.length + 1` slots (up to 6), with the last visible slot as an "Add" placeholder:

```tsx
const visibleSlots = Math.min(team.filter(s => s.speciesId).length + 1, 6);

{Array.from({ length: visibleSlots }, (_, i) => (
  <button key={i} ...>
    {team[i]?.speciesId ? ... : i < visibleSlots - 1 ? `Slot ${i + 1}` : '+ Add'}
  </button>
))}
```

---

## 2 — No Per-Slot Completeness Indicator

### Summary

`TeamBuilder`'s slot tabs show a species name when a slot has a `speciesId`, but give no indication of whether the Pokémon is actually complete (has moves, has an ability set, etc.). A Pokémon with a species but no moves looks identical to a fully configured one.

### Location

- `packages/client/src/admin/TeamBuilder.tsx` (lines 37–46)
- `packages/client/src/admin/PokemonSlotEditor.tsx`

### Root Cause

The tab button only checks `team[i]?.speciesId` to decide the label. It has no concept of completeness beyond "species is set."

### Impact

- An admin can advance through the Battle Setup wizard with Pokémon that have no moves assigned. (See also `battle-setup/setup-validation.md`.)
- In the Registry NPC editor, the "at least 1 move" validation blocks saving, but there is still no visual hint pointing to *which* Pokémon slot is incomplete.
- Easy to forget a move slot without noticing during rapid pre-event setup.

### Suggested Fix

Define a completeness score for a slot and use it to color the tab:

```tsx
function slotStatus(p: Partial<PokemonSet> | undefined): 'empty' | 'incomplete' | 'complete' {
  if (!p?.speciesId) return 'empty';
  if (!(p.moves ?? []).some(Boolean)) return 'incomplete';
  return 'complete';
}

const status = slotStatus(team[i]);
const borderColor =
  status === 'complete'   ? '#27ae60' :
  status === 'incomplete' ? '#f0c040' :
  selectedSlot === i      ? '#3498db' : '#333';
```

- Green border/checkmark: species + at least one move set.
- Yellow border/warning: species picked but no moves.
- Default/blue: empty or active selection.

Optionally, show a small inline warning inside `PokemonSlotEditor` when species is set but no moves have been chosen:

```tsx
{value.speciesId && !(value.moves ?? []).some(Boolean) && (
  <div style={{ color: '#f0c040', fontSize: 11 }}>⚠ No moves set</div>
)}
```
