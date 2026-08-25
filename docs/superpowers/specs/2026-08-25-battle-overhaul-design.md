---
name: battle-overhaul-design
description: Full overhaul of the battle UI — drop Phaser in favour of a React/CSS scene, add real Pokémon sprites, fix player move selection, and replace the flat NPC action panel with a per-NPC tabbed view.
metadata:
  type: project
---

# Battle UI Overhaul

**Date:** 2026-08-25  
**Status:** Approved

---

## Overview

Three related problems in the current battle mode:

1. **Player view is broken** — players see "Waiting for other players..." throughout the battle because their `mySlotId` doesn't match what the server sends in `action:request`. They never get a chance to choose moves.
2. **No sprites or enemy HP bars** — the Phaser canvas renders coloured placeholder rectangles. No Pokémon sprites are shown and enemy HP is not displayed anywhere.
3. **Admin NPC panel lacks targeting and per-NPC control** — all NPCs are shown in a flat list, moves auto-target the first legal target, and there is no way to choose a different target.

This spec covers the full fix: drop Phaser, introduce a React/CSS battle scene with real sprites, fix the player interaction flow, and replace the NPC panel with a tabbed per-NPC view.

---

## Architecture Changes

### Removed

| File | Reason |
|---|---|
| `packages/client/src/battle/BattleCanvas.tsx` | Replaced by `BattleScene.tsx` |
| `packages/client/src/battle/scenes/FocusedScene.ts` | Phaser removed |
| `packages/client/src/battle/scenes/TargetingScene.ts` | Targeting moved to React inline dropdown |
| `packages/client/src/admin/NpcActionPanel.tsx` | Replaced by `NpcTabPanel.tsx` |

### Added

| File | Purpose |
|---|---|
| `packages/client/src/battle/BattleScene.tsx` | React/CSS battle scene with sprite `<img>` elements |
| `packages/client/src/battle/utils.ts` | Shared `toShowdownId` helper |
| `packages/client/src/admin/NpcTabPanel.tsx` | Tabbed per-NPC move selector |

### Modified

| File | Change |
|---|---|
| `packages/shared/src/types/battle.ts` | Add `speciesName: string` to `PartyMember` |
| `packages/server/src/battle/...` | Populate `speciesName` when building `BattleState` |
| `packages/client/src/pages/BattlePage.tsx` | New layout — `BattleScene`, HP bar rows, inline targeting |
| `packages/client/src/pages/LobbyPage.tsx` | Write `mySlotId` to `sessionStorage` on successful join |
| `packages/client/src/admin/ControlPanel.tsx` | Swap `NpcActionPanel` → `NpcTabPanel`, pass `state` prop |
| `packages/client/src/admin/PokemonSlotEditor.tsx` | Import `toShowdownId` from `battle/utils.ts` |

---

## Section 1 — SlotId Fix (LobbyPage)

The root cause of players never seeing their move panel: `BattlePage` reads `mySlotId` from `sessionStorage.getItem('mySlotId')` with a fallback of `'slot-a1'`. Actual slot IDs from the server are `'a1'`, `'b2'`, etc.

**Fix:** In `LobbyPage`, after a successful `player:join` and before navigating to `/battle`, write:

```ts
sessionStorage.setItem('mySlotId', slotId);
```

No server changes required.

---

## Section 2 — BattleScene Component

`BattleScene.tsx` is a pure React component. Props:

```ts
interface Props {
  state: BattleState;
  mySlotId: string;
}
```

### Layout

An 800×240px `div` with `position: relative` and a CSS gradient background (sky blue top 55%, grass green bottom 45%). Pokémon are rendered as absolutely-positioned `<img>` elements inside this div.

### Sprite URLs

- **Enemy (front-facing):** `https://play.pokemonshowdown.com/sprites/ani/${toShowdownId(speciesName)}.gif`
- **Own Pokémon (back-facing):** `https://play.pokemonshowdown.com/sprites/ani-back/${toShowdownId(speciesName)}.gif`
- **Fallback (species unknown):** coloured placeholder `div` (same heuristic as today — blue for own team, red for enemies)

`toShowdownId` is extracted from `PokemonSlotEditor.tsx` into `packages/client/src/battle/utils.ts` and imported by both `BattleScene.tsx` and `PokemonSlotEditor.tsx`.

### Positions (CSS constants)

| Slot role | CSS position |
|---|---|
| Own Pokémon | `bottom: 18px; left: 60px` — 72×72px |
| Ally slots | `bottom: 24px; left: 155px + (i * 60px)` — 54×54px, 85% opacity |
| Primary enemy | `top: 18px; right: 60px` — 64×64px |
| Secondary enemies | `top: 30px; right: 145px + (i * 60px)` — 50×50px, 85% opacity |

Fainted Pokémon: `display: none`.

Name labels: small `<span>` elements positioned below each sprite, white text with a dark shadow for readability against the gradient.

### Species Resolution

`BattleScene` needs a species name to build the Showdown sprite URL, but `PartyMember` currently only carries `speciesId`. The fix is to add `speciesName: string` to `PartyMember` in `@poke-fighter/shared` and populate it server-side when the battle is initialised (from the existing Pokémon data). This avoids any client-side fetching and means sprites are available immediately on first render.

The `PartyMember` interface in `packages/shared/src/types/battle.ts` gains one field:

```ts
speciesName: string;  // e.g. "charizard" — lower-case, used to build Showdown sprite URL
```

The server populates this when building the initial `BattleState`. No client-side caching or async resolution is needed. While `speciesName` is an empty string (shouldn't happen in practice), show the coloured placeholder div.

---

## Section 3 — Player View Layout (BattlePage)

Top-to-bottom layout, all at 800px width:

```
[ Title bar: "Battle 1 — Turn 3" ]
[ Enemy HP bar row ]
[ BattleScene 800×240 ]
[ Own team HP bar row ]
[ Move panel (flex-left)  |  Turn log 300px (flex-right) ]
```

### Enemy HP bar row

One entry per enemy slot. Each entry: `displayName + level`, HP bar (`HpBar` component), `currentHp/maxHp` number. If active Pokémon is fainted, show "FAINTED" in grey. Bar colour: green above 50% HP, orange 20–50%, red below 20%.

### Own team HP bar row

One entry per slot on the player's own team. Player's own slot is highlighted with a gold `▶` marker. Ally slots use dimmed text colour. Same HP bar and colour rules as enemy row.

### Move panel states

| Condition | What shows |
|---|---|
| `switchRequest !== null` | `SwitchPanel` (forced faint switch) |
| `showSwitchPanel` | `SwitchPanel` with cancel button |
| `actionRequest !== null && !isSpectator` | `MovePanel` + optional target selector + switch button |
| Action submitted, waiting | "Waiting for others..." placeholder |
| Spectator | "Watching..." |

### Inline targeting

When a move is selected and `actionRequest.legalTargets.length > 1`, a target `<select>` dropdown appears below the move grid. The player first clicks a move (highlighting it), then selects a target and clicks "Confirm". When there is only one legal target, clicking a move submits immediately (auto-target, same as today).

`targetingMoveIndex` state remains in `BattlePage`; the `TargetingScene` Phaser code is deleted.

---

## Section 4 — Admin NPC Tab Panel (NpcTabPanel)

`NpcTabPanel.tsx` props:

```ts
interface Props {
  battleId: string;
  npcRequests: NpcSlotRequest[];
  state: BattleState;
}
```

### Tab strip

One tab per NPC slot with a pending request. Active tab highlighted in red. Submitted tabs show `✓` suffix and are greyed but still selectable to review. Tabs clear (`npcRequests → []`) on `turn:resolve` (existing behaviour, unchanged).

### Tab body

- **NPC name header**
- **VS summary** — compact HP readout for each legal target derived from `state`: `displayName`, HP bar, `currentHp/maxHp`. Only shows slots that appear in `npcRequest.legalTargets`.
- **Move grid** — 2×2 buttons. Disabled after submission for that NPC.
- **Target selector** — `<select>` populated from `npcRequest.legalTargets` mapped to display names via `state`. Only shown when `legalTargets.length > 1`. When there is a single legal target, clicking a move submits immediately.
- **Submission flow (multi-target):** Click move → target dropdown activates → click "Confirm" → emits `admin:action` with `npc-action` type.

`ControlPanel` passes `state` from `useBattle()` to `NpcTabPanel`.

---

## Section 5 — Turn Flow

No server changes required. The server already gates turn resolution until all slots have submitted.

Full cycle after this fix:

1. Server sends `action:request` per player slot; `npc:action-request` to admin
2. Each player sees their `MovePanel`; admin sees `NpcTabPanel`
3. Players submit via `action:submit`; admin submits each NPC via `admin:action → npc-action`
4. When all slots have submitted, server resolves turn and broadcasts `turn:resolve` (events + new state)
5. All clients: HP bars update, turn log appends, `actionRequest` clears, next `action:request` arrives

After a player submits, the move panel area shows a simple "Waiting for others..." message until the next `action:request` arrives.

---

## Testing

- Existing `MovePanel`, `HpBar`, `TurnLog`, `SwitchPanel` tests are unchanged
- New `BattleScene` tests: renders sprite `<img>` with correct Showdown URL; hides fainted Pokémon; falls back to placeholder when species unknown
- New `NpcTabPanel` tests: renders one tab per NPC request; submitted tab shows ✓; target dropdown only appears for multi-target moves; emits correct `admin:action` payload
- `BattlePage` tests: HP bar rows render for all slots; "Waiting for others..." shows after submission; inline target dropdown appears on multi-target move click
