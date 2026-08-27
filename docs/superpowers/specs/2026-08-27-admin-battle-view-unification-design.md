# Admin Battle View Unification

**Date:** 2026-08-27

## Goal

Make the admin battle view (`ControlPanel`) visually match the player battle view (`BattleView`) as closely as possible. The only meaningful difference is that the NPC action panel (with tabs for each NPC) replaces the player's move panel in the bottom-left action slot.

## Current State

- **Player view** (`BattlePage.tsx / BattleView`): centered 800px column — turn label → enemy HP bars → BattleScene → own-team HP bars → ExpBar → bottom row [MovePanel + TurnLog side-by-side].
- **Admin view** (`ControlPanel.tsx`): two-column flex-row — left column (BattleScene + TurnLog + forfeit buttons) + right 300px sidebar (NpcTabPanel). No HP bars. Different layout entirely.

## Design

### New Shared Component: `HpBarsRow`

**File:** `packages/client/src/battle/overlays/HpBarsRow.tsx`

Extracted from `BattleView`'s inline HP bar sections. Both `BattleView` and `ControlPanel` use it.

```ts
interface Props {
  slots: SlotState[];
  label: string;           // e.g. "ENEMY", "MY TEAM", "TEAM A", "TEAM B"
  variant: 'enemy' | 'own'; // 'enemy' = red border/label; 'own' = blue border/label
  highlightSlotId?: string;  // renders ▶ indicator for the player's own slot
}
```

Renders a bordered box with label, and one row per slot: display name + HP bar + HP numbers + `<EffectsIndicator>`. Fainted slots show "FAINTED" in place of bars. Logic is identical to the current inline implementation in `BattleView`.

### Updated `BattleView`

Replaces the two inline HP bar blocks with:

```tsx
<HpBarsRow
  label="ENEMY"
  variant="enemy"
  slots={foeTeam?.slots.filter(s => !s.isSpectator) ?? []}
/>
<HpBarsRow
  label="MY TEAM"
  variant="own"
  slots={myTeam?.slots.filter(s => !s.isSpectator) ?? []}
  highlightSlotId={mySlotId}
/>
```

No other changes to `BattleView`.

### Updated `ControlPanel`

The two-column layout is replaced with the same centered-column structure as `BattleView`.

**Layout:**
```
background: #0d0d1a, minHeight: 100vh
flexDirection: column, alignItems: center, gap: 12, padding: 16

┌─────────────────────────── 800px ───────────────────────────┐
│  [← BATTLES]  {state.label} Turn {n}  ADMIN  [FORFEIT A][B] │  header row
│  <HpBarsRow label="TEAM B" variant="enemy" />               │
│  <BattleScene state={state} mySlotId="__admin__" />         │
│  <HpBarsRow label="TEAM A" variant="own"  />                │
│  ┌──────────────────────────────┐  ┌────────────────────┐   │
│  │ <NpcTabPanel /> or           │  │ <TurnLog />         │   │  bottom row
│  │ placeholder                  │  │ width: 300          │   │
│  └──────────────────────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Team perspective:** `mySlotId="__admin__"` does not match any slot, so `BattleScene` and the HP bar logic default to `state.teams[0]` as the bottom team. `ControlPanel` uses this same index:
- `state.teams[0]` → bottom, `<HpBarsRow label="TEAM A" variant="own" />`
- `state.teams[1]` → top, `<HpBarsRow label="TEAM B" variant="enemy" />`

Neutral labels ("TEAM A" / "TEAM B") are used instead of "MY TEAM" / "ENEMY" since the admin is not a participant.

**Header row:** `display: flex, alignItems: center, width: 800`. Contains:
- `← BATTLES` back button (left)
- `{state?.label} Turn {state?.turnNumber}` turn label (center-left)
- `ADMIN VIEW` badge (center)
- `[FORFEIT TEAM A] [FORFEIT TEAM B]` buttons pushed right via `marginLeft: auto`

**Empty NPC state:** When `npcRequests` is empty (between turns), `ControlPanel` renders a placeholder in the action slot — same muted style as `BattleView`'s "Waiting for others..." box — so the layout height is stable across turns. `NpcTabPanel` continues to return `null` when empty; the empty-state placeholder is `ControlPanel`'s responsibility.

**No ExpBar:** Admin does not receive the exp bar (player-only feature).

**No changes to `NpcTabPanel`:** NPC action submission logic, tab behavior, move grid, and target selector are all unchanged. Only its render location moves.

## Files Changed

| File | Change |
|------|--------|
| `packages/client/src/battle/overlays/HpBarsRow.tsx` | New — shared HP bar component |
| `packages/client/src/battle/overlays/__tests__/HpBarsRow.test.tsx` | New — tests for both variants, highlight indicator, fainted slots |
| `packages/client/src/pages/BattlePage.tsx` | Use `<HpBarsRow>` instead of inline HP bar blocks |
| `packages/client/src/pages/__tests__/BattlePage.test.tsx` | Update any assertions referencing inline HP bar markup |
| `packages/client/src/admin/ControlPanel.tsx` | Rewrite layout; header with forfeit buttons; use `<HpBarsRow>`; NpcTabPanel in action slot with placeholder |
| `packages/client/src/admin/__tests__/ControlPanel.test.tsx` | New — verify HP bars render, forfeit buttons in header, placeholder when no NPC requests |

## Out of Scope

- No server-side changes
- No routing changes
- No shared-package changes
- No changes to NpcTabPanel logic
- No changes to BattleScene
