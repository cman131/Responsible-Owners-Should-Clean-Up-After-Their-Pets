# 15 — NPC Terastallize Unavailable in Admin NPC Panel

## State

Complete

## Summary

The `NpcTabPanel` submits NPC moves by building a `{ type: 'move', moveIndex, targetSlotId }` action object. It never passes `terastallize`, even when the NPC's `ActionRequestPayload` has `canTerastallize: true`. Admin cannot Terastallize on behalf of an NPC Pokémon through the UI.

## Problem Details

**File:** `packages/client/src/admin/NpcTabPanel.tsx:45`

```ts
function submitNpcAction(slotId: string, moveIndex: 0 | 1 | 2 | 3, targetSlotId?: string) {
  const action = targetSlotId
    ? { type: 'move' as const, moveIndex, targetSlotId }
    : { type: 'move' as const, moveIndex };
  getSocket().emit('admin:action', { type: 'npc-action', data: { battleId, slotId, action } });
```

The `terastallize` flag is available in `MoveAction` (from `@poke-fighter/shared`) but is never passed here.

**File:** `packages/client/src/battle/overlays/ActionPanel.tsx:113`

`ActionPanel` receives `onSubmitMove` with signature `(moveIndex, targetSlotId?, terastallize?)`. In `NpcTabPanel`, `ActionPanel` is rendered with:

```tsx
onSubmitMove={(moveIndex, targetSlotId) =>
  submitNpcAction(activeRequest.slotId, moveIndex, targetSlotId)
}
```

The third argument `terastallize` is silently dropped.

## Impact

- NPCs with a Tera type configured can never Terastallize during a battle
- This is a significant competitive disadvantage if the battle is intended to feature NPC Tera
- The checkbox in `ActionPanel` will appear (because `canTerastallize` is true) but checking it has no effect

## Suggested Fix

1. Update `submitNpcAction` to accept an optional `terastallize` parameter:
```ts
function submitNpcAction(slotId: string, moveIndex: 0|1|2|3, targetSlotId?: string, terastallize?: boolean) {
  const action: MoveAction = { type: 'move', moveIndex, ...(targetSlotId ? { targetSlotId } : {}), ...(terastallize ? { terastallize: true } : {}) };
  ...
}
```

2. Thread it through the `onSubmitMove` call in `NpcTabPanel`:
```tsx
onSubmitMove={(moveIndex, targetSlotId, tera) =>
  submitNpcAction(activeRequest.slotId, moveIndex, targetSlotId, tera)
}
```

## Related Files

- `packages/client/src/admin/NpcTabPanel.tsx`
- `packages/client/src/battle/overlays/ActionPanel.tsx`
- `packages/shared/src/types.ts` (MoveAction type)
