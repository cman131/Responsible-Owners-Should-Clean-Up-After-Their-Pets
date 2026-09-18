# Tech Debt: SlotRow State Bugs in SlotAssignmentStep

## State

Complete

Two bugs in `SlotRow` within `SlotAssignmentStep` where slot state is not properly initialized or cleared. They touch the same `onUpdate` calls and should be fixed together.

---

## 1 — `profileId` Never Populated on SlotConfig

### Summary

`SlotConfig` has a `profileId?: string` field intended to track which saved profile is assigned to a slot. The `SlotRow` component never sets it when the user picks a player or NPC from the dropdown. The field is always `undefined`.

### Location

- `packages/client/src/admin/steps/SlotAssignmentStep.tsx` (SlotRow component, lines 128–143)

### Root Cause

The `onUpdate` calls in `SlotRow` only spread `displayName` and `defaultTeam`, omitting `profileId`:

```tsx
// Player selection — profileId not included
onChange={(e) => {
  const name = e.target.value;
  const player = savedPlayers.find((p) => p.displayName === name);
  onUpdate(index, { displayName: name, defaultTeam: player?.defaultTeam });
}}

// NPC selection — profileId not included
onChange={(e) => {
  const name = e.target.value;
  const npc = savedNpcs.find((n) => n.name === name);
  onUpdate(index, { displayName: name, defaultTeam: npc?.defaultTeam });
}}
```

### Impact

- No traceability between a battle's slot and the registry profile that was assigned to it.
- If two profiles share the same display name, they are indistinguishable in slot assignment.
- Prevents any future feature that would look up profile details post-battle (e.g., win/loss records).
- Stale `profileId` compounds bug 2 below: a type-switched slot carries the wrong profile's id to the server.

### Suggested Fix

Pass `profileId` through in both update calls:

```tsx
// Player selection
const player = savedPlayers.find((p) => p.displayName === name);
onUpdate(index, {
  displayName: name,
  profileId: player?.profileId,
  defaultTeam: player?.defaultTeam,
});

// NPC selection
const npc = savedNpcs.find((n) => n.name === name);
onUpdate(index, {
  displayName: name,
  profileId: npc?.profileId,
  defaultTeam: npc?.defaultTeam,
});
```

---

## 2 — Switching Slot Type Leaves Stale `defaultTeam` on SlotConfig

### Summary

When a user changes a slot's type from Player to NPC (or vice versa), the change handler only resets `displayName` to `''`. If a player had been selected (populating `defaultTeam`), switching to NPC leaves that player's team silently attached to the slot.

### Location

- `packages/client/src/admin/steps/SlotAssignmentStep.tsx` (SlotRow, line 116–118)

### Root Cause

```tsx
<select
  value={slot.type}
  onChange={(e) => onUpdate(index, { type: e.target.value, displayName: '' })}
```

Only `displayName` is cleared. `defaultTeam` and `profileId` are left on the slot config via the spread in `updateSlot`.

### Impact

The stale `defaultTeam` is now used directly as the slot's party when the battle is started. If a player was selected first (populating `defaultTeam`), then the slot is switched to NPC, the NPC slot gets the player's team sent to the server — silently and with no indication in the UI. Combined with bug 1, a stale `profileId` from the wrong profile is also forwarded.

### Suggested Fix

Clear all profile-related fields when the type changes:

```tsx
onChange={(e) => onUpdate(index, {
  type: e.target.value as 'player' | 'npc',
  displayName: '',
  profileId: undefined,
  defaultTeam: undefined,
})}
```
