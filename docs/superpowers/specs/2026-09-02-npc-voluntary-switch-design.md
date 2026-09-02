# NPC Voluntary Switch — Design Spec
Date: 2026-09-02

## Problem

The admin control panel's NPC tab only lets the admin pick a move for each NPC slot. The player view can optionally switch Pokémon instead of using a move, but the NPC panel has no equivalent. The server also hardcodes `canSwitch: false` for NPC action requests, so the option is never surfaced.

## Goal

Allow the admin to choose to switch an NPC's active Pokémon during the action-selection phase, with the same validity rules that apply to a player switch.

## Scope

- Server: one function change in `BattleRoom.buildNpcRequests()`
- Client: UI additions to `NpcTabPanel.tsx`
- Tests: new cases in `NpcTabPanel.test.tsx`

Out of scope: AI-driven auto-switching, forced post-faint switches (already work), any changes to the switch action processing path.

---

## Server change

**File:** `packages/server/src/socket/BattleRoom.ts`  
**Function:** `buildNpcRequests()` (line ~375)

Replace hardcoded `canSwitch: false, switchTargets: []` with the same ingrain-aware logic used in `buildPlayerRequests()`:

```ts
const hasIngrain = active.volatileStatus.some(v => v.name === 'ingrain');
// ...
canSwitch: !hasIngrain && slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
switchTargets: hasIngrain ? [] : slot.party
  .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
  .map((p) => p.instanceId),
```

No other server changes are needed. The `admin:action → npc-action → type: 'switch'` path already processes NPC switches correctly.

---

## Client change

**File:** `packages/client/src/admin/NpcTabPanel.tsx`

### New state

```ts
const [switchingSlotId, setSwitchingSlotId] = useState<string | null>(null);
```

Reset `switchingSlotId` to `null` inside the existing `useEffect` that resets on `npcRequests` change.

### Tab body rendering (three branches)

**Branch 1 — Voluntary switch mode** (`switchingSlotId === activeRequest.slotId`):
- Hide the move grid and VS summary entirely.
- Show the bench Pokémon list using `activeRequest.request.switchTargets`, resolved to `PartyMember` via the existing `getBenchMon()` helper.
- Button style: matches the existing forced-switch button style.
- Include a Cancel button (`setSwitchingSlotId(null)`) below the list.
- On bench Pokémon click: call existing `submitNpcSwitch(slotId, instanceId)` and `setSwitchingSlotId(null)`.

**Branch 2 — Forced switch** (`validMoves.length === 0 && canSwitch`):
- Unchanged from today. No Cancel button (forced).

**Branch 3 — Normal move mode** (default):
- Existing VS summary and move grid, unchanged.
- If `activeRequest.request.canSwitch && activeRequest.request.switchTargets.length > 0` and the slot is not submitted: render a "SWITCH POKÉMON" button below the move grid.
  - Style: green border (`#27ae60`), dark green background (`#1a3a1a`), full width — matches player's `MovePanel` switch button.
  - On click: `setSwitchingSlotId(activeRequest.slotId)`.
- Existing target selector and pending-move state are unaffected.

---

## Testing

**File:** `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`

New test cases:
1. When `canSwitch: true` and `validMoves` are present, a "SWITCH POKÉMON" button is rendered.
2. Clicking "SWITCH POKÉMON" shows the bench Pokémon list and a Cancel button.
3. Clicking a bench Pokémon emits the correct `npc-action` switch event and marks the slot submitted.
4. Clicking Cancel returns to the move grid without submitting.
5. When `canSwitch: true` and `validMoves` is empty (forced switch), no Cancel button is shown (existing behavior, regression guard).
