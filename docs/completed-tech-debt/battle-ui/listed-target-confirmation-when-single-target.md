# Listed-Target Confirmation Shown When Only One Target Exists

## State

Complete

## Summary

When a player selects a move whose targeting mode is `listed` (e.g. Sludgewave with `allAdjacentFoes`), the UI always opens a confirmation panel showing "Targets: misty" before submitting. In a 1v1 battle there is always exactly one valid target, so the confirmation adds a click with no decision to make. The `choose` mode already has a fast-path that auto-submits when `legalTargets.length === 1`; the `listed` branch in `handleMoveClick` needs the same treatment.

## Problem Details

**File:** `packages/client/src/battle/overlays/ActionPanel.tsx:81`

The `listed` branch unconditionally opens the targeting panel:

```typescript
} else if (mode === 'listed') {
  setTargetingMove(mv);   // always shows confirmation, even with 1 target
}
```

The `choose` fast-path at lines 74–76 already demonstrates the correct pattern for a single legal target:

```typescript
} else if (mode === 'choose' && mv.legalTargets.length === 1) {
  onSubmitMove(mv.index, mv.legalTargets[0], terastallize || undefined);
  setTerastallize(false);
}
```

`listed` mode is classified in `packages/client/src/battle/targeting.ts:12–15` for target types `allAdjacentFoes`, `allAdjacent`, and `allies`. In 1v1 battles all three of these resolve to a single legal target, making the confirmation redundant every time.

## Impact

- Every spread move (Sludgewave, Earthquake, Discharge, etc.) requires an extra confirmation click in 1v1 battles even though the outcome is not changeable.
- Inconsistent UX: single-target `choose` moves skip confirmation, but single-target `listed` moves do not.

## Suggested Fix

Add a single-target guard to the `listed` branch in `handleMoveClick`:

```typescript
} else if (mode === 'listed') {
  if (mv.legalTargets.length <= 1) {
    onSubmitMove(mv.index, undefined, terastallize || undefined);
    setTerastallize(false);
  } else {
    setTargetingMove(mv);
  }
}
```

Note: `listed` moves submit `undefined` as the target ID (the server derives all targets from the move's target type), which matches the existing confirmation-panel submit path at line 159.

## Related Files

- `packages/client/src/battle/overlays/ActionPanel.tsx`
- `packages/client/src/battle/targeting.ts`
- `packages/client/src/battle/overlays/__tests__/ActionPanel.test.tsx`
