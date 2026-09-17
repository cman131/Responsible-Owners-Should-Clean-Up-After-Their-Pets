# Design: TeamBuilder Slot Tab Improvements

**Date:** 2026-09-17
**Source:** `docs/tech-debt/team-builder/slot-tab-improvements.md`

## Overview

Two cohesive improvements to `TeamBuilder`'s slot tab strip:
1. Dynamic slot count with up/down reordering
2. Per-slot completeness indicator (colored border + inline warning)

Both changes are scoped to `packages/client/src/admin/TeamBuilder.tsx` and a small addition to `PokemonSlotEditor.tsx`.

---

## Data Model & Slot Compaction

`team` remains `Partial<PokemonSet>[]` but is kept dense — no empty `{}` objects in the middle.

**On clear** (`handleSlotChange` receives an object with no `speciesId`):
- Splice the slot out of the array.
- Clamp `selectedSlot` to `Math.min(selectedSlot, newLength - 1)` so it never goes out of bounds.
- If the array becomes empty, retain a single `[{}]` so there is always an Add placeholder.

**On send-to-bank** (`handleSendToBank`):
- Same compaction logic as a clear (was previously setting `next[selectedSlot] = {}`).

**Initial state** stays `initialTeam.length > 0 ? initialTeam : [{}]`.

---

## Dynamic Slot Count & Reorder Arrows

```tsx
const filledCount = team.filter(s => !!s.speciesId).length;
const visibleSlots = Math.min(filledCount + 1, 6);
```

Tabs rendered from `Array.from({ length: visibleSlots }, ...)`.

The last visible tab (`i === visibleSlots - 1` and no `speciesId`) renders as `+ Add` with no arrows.

Each **filled** tab renders:
- **↑ button** — disabled when `i === 0`. Swaps `team[i]` and `team[i-1]`; updates `selectedSlot` to follow the Pokémon.
- **↓ button** — disabled when `i === filledCount - 1` (last filled slot). Swaps `team[i]` and `team[i+1]`; updates `selectedSlot` to follow.
- Arrow clicks call `e.stopPropagation()` so they don't also trigger slot selection.
- The tab label (click to select) shows `nickname ?? #speciesId`.

---

## Completeness Indicator

Module-level helper:

```tsx
function slotStatus(p: Partial<PokemonSet> | undefined): 'empty' | 'incomplete' | 'complete' {
  if (!p?.speciesId) return 'empty';
  if (!(p.moves ?? []).some(Boolean)) return 'incomplete';
  return 'complete';
}
```

Tab border color by status:

| Status | Color | Meaning |
|--------|-------|---------|
| `complete` | `#27ae60` | Species + at least one move set |
| `incomplete` | `#f0c040` | Species set, no moves |
| `empty` + selected | `#3498db` | Active Add placeholder (existing blue) |
| `empty` + unselected | `#333` | Inactive Add placeholder (existing default) |

Selected tab background stays `#2980b9` regardless of status.

**Inline warning in `PokemonSlotEditor`** (added just below the species header row):

```tsx
{value.speciesId && !(value.moves ?? []).some(Boolean) && (
  <div style={{ color: '#f0c040', fontSize: 11 }}>⚠ No moves set</div>
)}
```

---

## Files Changed

| File | Change |
|------|--------|
| `packages/client/src/admin/TeamBuilder.tsx` | Main changes: compaction, reorder, dynamic slots, completeness border |
| `packages/client/src/admin/PokemonSlotEditor.tsx` | Add inline ⚠ warning when no moves set |

---

## Out of Scope

- Drag-and-drop reordering (up/down arrows are sufficient for the admin use case)
- Persistence of slot order beyond what `onTeamSaved` already provides
- Any server-side changes
