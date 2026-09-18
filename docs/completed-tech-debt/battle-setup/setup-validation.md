# Tech Debt: Battle Setup Wizard Validation Gaps

## State

Complete

Two missing validations in the Battle Setup wizard that let invalid configurations slip through to a live battle.

---

## 1 — Inconsistent Move Validation Between NPC Editor and Battle Setup

### Summary

The NPC editor enforces that every Pokémon must have at least one move before saving. The Battle Setup flow's `TeamBuilderStep` has no such check — you can proceed to a live battle with Pokémon that have zero moves.

### Location

- `packages/client/src/admin/ProfileEditor.tsx` (NpcEditor, line 26–27) — has validation
- `packages/client/src/admin/steps/TeamBuilderStep.tsx` (line 31) — missing validation
- `packages/client/src/admin/PlayerProfileEditor.tsx` (line 21) — also missing move validation

### Root Cause

`NpcEditor.teamIsValid` checks moves:
```tsx
const teamIsValid = team.length > 0 && team.every((s) => s.moves.some(Boolean));
```

`TeamBuilderStep.allFilled` only checks that a slot has at least one Pokémon:
```tsx
const allFilled = allSlots.every((s) => (teams[s.slotId]?.length ?? 0) > 0);
```

`PlayerProfileEditor` validates the display name only, with no move check.

### Impact

A battle can be launched with Pokémon that have no moves. At the engine level this will either throw, produce a Pokémon that can do nothing, or cause silent move-picking failures.

### Suggested Fix

Extract the move completeness check into a shared utility:

```ts
// e.g. packages/shared/src/utils/teamValidation.ts
export function isPokemonComplete(p: Partial<PokemonSet>): boolean {
  return !!p.speciesId && (p.moves ?? []).some(Boolean);
}
```

Apply it in `TeamBuilderStep`:
```tsx
const allFilled = allSlots.every((s) => {
  const team = teams[s.slotId] ?? [];
  return team.length > 0 && team.every(isPokemonComplete);
});
```

The NPC editor already has this right — align the other paths to match it. Optionally surface an inline warning on incomplete slots so the user sees the problem rather than just a disabled NEXT button. (See also `team-builder/slot-tab-improvements.md`.)

---

## 2 — No Warning When the Same Player or NPC is Assigned to Multiple Slots

### Summary

`SlotAssignmentStep` allows the same player or NPC to be selected in multiple slots simultaneously with no warning. This can silently produce battles where the same participant appears on both teams.

### Location

- `packages/client/src/admin/steps/SlotAssignmentStep.tsx`

### Root Cause

Each `SlotRow` is independent and has no awareness of what the other slots have chosen. The `allFilled` validation only checks that each slot has a non-empty `displayName`; it does not check for duplicates.

```tsx
const allFilled = slots.every((s) => s.displayName.trim());
// No duplicate check
```

### Impact

An admin can accidentally place the same NPC or player against themselves. At minimum this produces a confusing battle log. In a quick 2v2 setup it's easy to repeat a selection by accident.

### Suggested Fix

Add a cross-slot duplicate check and show a visible warning (non-blocking, since intentional duplication might be desired):

```tsx
// Compute duplicates
const usedNames = slots.map((s) => s.displayName).filter(Boolean);
const duplicateNames = new Set(
  usedNames.filter((name, i) => usedNames.indexOf(name) !== i)
);

// In SlotRow — show warning badge if duplicated
{duplicateNames.has(slot.displayName) && (
  <span style={{ color: '#f0c040', fontSize: 10 }}>⚠ duplicate</span>
)}
```
