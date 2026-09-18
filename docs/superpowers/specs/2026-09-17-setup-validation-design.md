# Design: Battle Setup Wizard Validation Gaps

_2026-09-17_

## Problem

Two validation gaps in the Battle Setup wizard allow invalid configurations to reach a live battle:

1. `TeamBuilderStep` NEXT button enables with Pokémon that have zero moves assigned.
2. `PlayerProfileEditor` SAVE button enables when a non-empty team has Pokémon with zero moves.
3. `SlotAssignmentStep` allows the same player/NPC display name to be assigned to multiple slots with no warning.

## Out of scope

- `NpcEditor` (in `ProfileEditor.tsx`) — already validates correctly, no change needed.
- Any changes to `BattleEngine` or server validation — this is UI-only hardening.

## Design

### Fix 1 — Move validation in TeamBuilderStep

**File:** `packages/client/src/admin/steps/TeamBuilderStep.tsx`

Import `slotStatus` from `TeamBuilder.tsx` (already exported). Replace the `allFilled` check:

```tsx
// before
const allFilled = allSlots.every((s) => (teams[s.slotId]?.length ?? 0) > 0);

// after
const allFilled = allSlots.every((s) => {
  const team = teams[s.slotId] ?? [];
  return team.length > 0 && team.every((p) => slotStatus(p) === 'complete');
});
```

No UI change beyond the existing disabled NEXT button.

### Fix 2 — Move validation in PlayerProfileEditor

**File:** `packages/client/src/admin/PlayerProfileEditor.tsx`

Import `slotStatus` from `TeamBuilder.tsx`. Add move check to `isValid`:

```ts
// before
const isValid = name.trim().length > 0;

// after
const teamComplete = team.length === 0 || team.every((p) => slotStatus(p) === 'complete');
const isValid = name.trim().length > 0 && teamComplete;
```

Error message: augment the existing error message area to also indicate incomplete moves when name is valid but team is invalid.

### Fix 3 — Duplicate slot warning in SlotAssignmentStep

**File:** `packages/client/src/admin/steps/SlotAssignmentStep.tsx`

Compute duplicate display names and pass them down to `SlotRow`. Show a non-blocking `⚠ duplicate` badge inline when a slot's display name appears in more than one slot.

```tsx
// In SlotAssignmentStep
const usedNames = slots.map((s) => s.displayName).filter(Boolean);
const duplicateNames = new Set(
  usedNames.filter((name, i) => usedNames.indexOf(name) !== i)
);
// pass duplicateNames down to TeamColumn → SlotRow
```

```tsx
// In SlotRow — after the checkmark
{duplicateNames.has(slot.displayName) && (
  <span style={{ color: '#f0c040', fontSize: 10 }}>⚠ duplicate</span>
)}
```

Non-blocking — NEXT still enables as long as all slots have non-empty display names.

## Testing

New tests in existing test files:

- `TeamBuilderStepPrefill.test.tsx` — add: NEXT disabled when team has Pokémon with no moves; NEXT enabled when all Pokémon complete.
- `PlayerProfileEditor.test.tsx` — add: SAVE disabled when team non-empty and a Pokémon has no moves.
- New `SlotAssignmentStep-duplicates.test.tsx` or extend `SlotAssignmentDefaultTeam.test.tsx` — add: duplicate badge appears when same name selected twice.
