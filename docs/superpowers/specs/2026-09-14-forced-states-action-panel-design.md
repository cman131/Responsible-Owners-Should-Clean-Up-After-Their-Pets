# Design: Forced States + ActionPanel Extraction

**Date:** 2026-09-14  
**Addresses tech debt:** UI: Forced / No-Choice Action States, UI: NpcTabPanel Duplicates Player Battle Controls

---

## Problem

Two related tech debt items:

1. **Forced/no-choice action states**: When a Pokémon must recharge (after Hyper Beam), is asleep, or is frozen, the player still sees the full move selection UI. The server blocks the move silently in `runPreMove`, but the player has no indication beforehand. They go through pointless move selection for a no-op.

2. **NpcTabPanel duplication**: `NpcTabPanel.tsx` has its own inline move grid, target dropdown, and switch flow that mirror `BattlePage.tsx`. Any fix or feature must be manually mirrored.

---

## Solution Overview

- **Server**: Add `lockedReason` to `ActionRequestPayload` so the client has a single authoritative signal for forced states.
- **Client**: New `<ActionPanel>` component handles all action-selection states (locked, move grid, target row, voluntary switch). Both `BattlePage` and `NpcTabPanel` use it. `MovePanel` is retired.

---

## Section 1: Server — `lockedReason` in `ActionRequestPayload`

### Shared types (`packages/shared/src/types/events.ts`)

Add one optional field to `ActionRequestPayload`:

```typescript
export interface ActionRequestPayload {
  slotId: string;
  validMoves: Array<{ ... }>;
  canSwitch: boolean;
  switchTargets: string[];
  canTerastallize: boolean;
  lockedReason?: 'recharge' | 'sleep' | 'freeze';
}
```

### `BattleRoom.ts` (`packages/server/src/socket/BattleRoom.ts`)

Add a private helper:

```typescript
private getLockedReason(active: PartyMember): 'recharge' | 'sleep' | 'freeze' | undefined {
  if (active.volatileStatus.some(v => v.name === 'recharge')) return 'recharge';
  if (active.status === 'slp') return 'sleep';
  if (active.status === 'frz') return 'freeze';
}
```

Call it in `getPendingActionRequest`, `buildPlayerRequests`, and `buildNpcRequests`, appending:

```typescript
lockedReason: this.getLockedReason(active),
```

`validMoves` are left unchanged — the server continues to block in `runPreMove` as before. Paralysis is not included (probabilistic; player still picks moves). Struggle is out of scope (not yet investigated).

---

## Section 2: New `ActionPanel` Component

**File:** `packages/client/src/battle/overlays/ActionPanel.tsx`

### Props

```typescript
interface ActionPanelProps {
  request: ActionRequestPayload;
  slotId: string;
  state: BattleState;
  onSubmitMove: (moveIndex: 0|1|2|3, targetSlotId?: string, terastallize?: boolean) => void;
  onSubmitSwitch: (instanceId: string) => void;
  submitted?: boolean;      // NpcTabPanel: dims panel after action sent
  theme?: 'player' | 'npc'; // 'player' = blue (#3498db); 'npc' = red (#e74c3c); defaults to 'player'
}
```

### Internal state

All reset via `useEffect` when `request` changes:
- `targetingMove: ValidMove | null` — move pending target selection
- `selectedTarget: string`
- `terastallize: boolean`
- `showSwitch: boolean` — voluntary switch mode

### Deriving switch party

```typescript
const slot = state.teams.flatMap(t => t.slots).find(s => s.slotId === slotId);
const switchTargetMons = request.switchTargets
  .map(id => slot?.party.find(p => p.instanceId === id))
  .filter((p): p is PartyMember => !!p && !p.fainted);
```

### Render logic (priority order)

**1. Locked** — `request.lockedReason` is set:

Show a locked panel with reason label and a single Confirm button. Labels:
- `'recharge'` → "MUST RECHARGE"
- `'sleep'` → "FAST ASLEEP"
- `'freeze'` → "FROZEN SOLID"

Confirm calls `onSubmitMove(0)`. No switch button shown.

**2. Forced switch** — `request.validMoves.length === 0 && request.canSwitch`:

Render `<SwitchPanel party={switchTargetMons} onSwitch={onSubmitSwitch} label="SWITCH REQUIRED" />` without a cancel button.

**3. Voluntary switch mode** — `showSwitch === true`:

Render `<SwitchPanel party={switchTargetMons} onSwitch={onSubmitSwitch} onCancel={() => setShowSwitch(false)} label="CHOOSE POKÉMON" />`.

**4. Move grid** (default):

- 4 move buttons from `request.validMoves`. Disabled when `mv.disabled || mv.pp === 0 || submitted`.
- "SWITCH POKÉMON" button if `request.canSwitch && !submitted`.
- If `targetingMove` is set, show target row below grid:
  - `choose` mode: `<select>` dropdown sorted via `sortLegalTargets` + Confirm + ✕
  - `listed` mode: read-only `formatTargetNames` display + Confirm + ✕
  - other mode: `getTargetLabel` text + Confirm + ✕
- If `request.canTerastallize`: tera checkbox (only visible in move grid state).

### Move click behavior

| Mode | Legal targets | Behavior |
|------|--------------|----------|
| `auto` | any | Submit immediately with `legalTargets[0]` |
| `choose` | 1 | Submit immediately with `legalTargets[0]` |
| `choose` | 2+ | Enter target-selection mode |
| `listed` | any | Enter target-display mode (confirm required) |
| other | any | Submit immediately without target |

---

## Section 3: `BattlePage` Simplification

**File:** `packages/client/src/pages/BattlePage.tsx`

Remove from `BattleView`:
- State: `targetingMove`, `selectedTarget`, `terastallize`, `showSwitchPanel`
- Functions: `handleMoveSelect`, `handleConfirmTarget`

Replace the move panel + targeting JSX block with:

```tsx
<ActionPanel
  request={actionRequest}
  slotId={mySlotId}
  state={state}
  onSubmitMove={(moveIndex, targetSlotId, tera) =>
    submitAction({
      slotId: mySlotId,
      action: { type: 'move', moveIndex,
        ...(targetSlotId ? { targetSlotId } : {}),
        ...(tera ? { terastallize: tera } : {}) },
    })
  }
  onSubmitSwitch={handleSwitch}
  theme="player"
/>
```

`switchRequest` (forced faint-switch) stays handled at the `BattleView` level — it arrives via a separate socket event and is not part of `actionRequest`. `SwitchPanel` stays as-is for this case.

`handleSwitch` is unchanged (calls `submitAction` with a switch action).

---

## Section 4: `NpcTabPanel` Simplification

**File:** `packages/client/src/admin/NpcTabPanel.tsx`

Remove:
- State: `pendingMove`, `selectedTarget`, `switchingSlotId`
- Functions: `renderBenchList`, `getBenchMon`, `handleMoveClick`

Tab body becomes:

```tsx
<div style={styles.tabBody}>
  {/* existing VS summary JSX stays inline — not a new component */}
  {[...new Set(...)].map((targetSlotId) => { /* ... existing HP bar rows ... */ })}
  <ActionPanel
    request={activeRequest.request}
    slotId={activeRequest.slotId}
    state={state}
    onSubmitMove={(moveIndex, targetSlotId) =>
      submitNpcAction(activeRequest.slotId, moveIndex, targetSlotId)
    }
    onSubmitSwitch={(instanceId) =>
      submitNpcSwitch(activeRequest.slotId, instanceId)
    }
    submitted={submitted.has(activeRequest.slotId)}
    theme="npc"
  />
</div>
```

`submitNpcAction` and `submitNpcSwitch` remain in `NpcTabPanel` (they carry the `battleId` and emit the admin socket event).

`getActiveMon` and `getDisplayName` helpers are retained — they're still used by the VS summary.

---

## Section 5: Tests

### `BattleRoom.test.ts`

New tests:
- `getPendingActionRequest` returns `lockedReason: 'recharge'` when active has `recharge` volatile
- `getPendingActionRequest` returns `lockedReason: 'sleep'` when `active.status === 'slp'`
- `getPendingActionRequest` returns `lockedReason: 'freeze'` when `active.status === 'frz'`
- `getPendingActionRequest` returns `lockedReason: undefined` for a healthy Pokémon

### `ActionPanel.test.tsx` (new)

- Locked panel: each `lockedReason` renders correct label; Confirm calls `onSubmitMove(0, undefined, undefined)`
- Forced switch: `validMoves=[]` + `canSwitch=true` renders `SwitchPanel` without cancel, selecting fires `onSubmitSwitch`
- Voluntary switch: switch button visible when `canSwitch`, click enters switch mode, cancel returns to grid
- Move grid: 4 buttons rendered; disabled buttons non-clickable
- Auto-target and choose-1-target moves: submit immediately on click, no target row shown
- Choose-multi-target: target row appears, dropdown updates `selectedTarget`, Confirm fires `onSubmitMove`
- Tera checkbox visible only when `canTerastallize`, value passed through to `onSubmitMove`
- `submitted=true`: all buttons disabled / panel dimmed

### Existing test cleanup

- `MovePanel.test.tsx`: deleted (component retired)
- `BattlePage.test.tsx`: updated — remove tests for targeting/switch state that now live in `ActionPanel.test.tsx`
- `NpcTabPanel.test.tsx`: updated — remove tests for `pendingMove`/`switchingSlotId` logic

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types/events.ts` | Add `lockedReason?` to `ActionRequestPayload` |
| `packages/server/src/socket/BattleRoom.ts` | Add `getLockedReason`, include in 3 request builders |
| `packages/client/src/battle/overlays/ActionPanel.tsx` | **New** |
| `packages/client/src/battle/overlays/ActionPanel.test.tsx` | **New** |
| `packages/client/src/pages/BattlePage.tsx` | Simplify; use `ActionPanel` |
| `packages/client/src/admin/NpcTabPanel.tsx` | Simplify; use `ActionPanel` |
| `packages/client/src/battle/overlays/MovePanel.tsx` | **Deleted** |
| `packages/client/src/battle/overlays/MovePanel.test.tsx` | **Deleted** |
| `packages/server/src/socket/BattleRoom.test.ts` | Add `lockedReason` tests |
| `packages/client/src/pages/BattlePage.test.tsx` | Update for simplified structure |
| `packages/client/src/admin/NpcTabPanel.test.tsx` | Update for simplified structure |
