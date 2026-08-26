# Targeting Engine Design

**Date:** 2026-08-26  
**Status:** Approved

## Overview

Wire up a full targeting engine so each move knows which slots it can legally reach and the client renders the correct UI — a dropdown for player-choice targets, an informational name list for spread moves, or a static label for field effects. Self-targeting and scripted moves auto-submit with no extra UI step.

## Target Type Classification

All 15 `MoveTarget` values map to one of four UI modes:

| Mode | Target types | UI |
|---|---|---|
| `choose` | `normal`, `any`, `adjacentFoe`, `adjacentAlly`, `adjacentAllyOrSelf` | Dropdown of valid slot names |
| `listed` | `allAdjacentFoes`, `allAdjacent`, `allies` | Read-only comma list (max 3, trailing `…` if more) |
| `labeled` | `all`, `allyTeam`, `allySide`, `foeSide`, `randomNormal` | Static label string |
| `auto` | `self`, `scripted` | No UI — action submitted immediately |

Label strings for `labeled` mode:

| Target type | Label |
|---|---|
| `all` | All |
| `allyTeam` | Ally team |
| `allySide` | Ally side |
| `foeSide` | Foe side |
| `randomNormal` | Random |

## Adjacency Filtering

Adjacency is determined by slot index within a team's non-spectator slots array. A target slot at index `j` is adjacent to the attacker at index `i` if `|i - j| ≤ 1`.

This applies to:
- `normal` — foe slots within distance 1 of attacker's index
- `adjacentFoe` — same as `normal`
- `adjacentAlly` — ally slots within distance 1 of attacker's index (excludes self)
- `adjacentAllyOrSelf` — ally slots within distance 1 + self
- `allAdjacent` — foe slots within distance 1 + ally slots within distance 1 (excludes self)

All other target types (`allAdjacentFoes`, `any`, `allies`, `all`, `allyTeam`, `allySide`, `foeSide`, `randomNormal`, `self`, `scripted`) are unaffected by position and return all living slots in their category.

In 1v1 every slot is index 0 on both sides, so `|0 - 0| = 0 ≤ 1` — all foes/allies are always adjacent and the filter is a no-op.

## Changes

### 1. Shared types — `packages/shared/src/types/events.ts`

Remove top-level `legalTargets: string[]` from `ActionRequestPayload`. Add `targetType` and `legalTargets` per move:

```ts
validMoves: Array<{
  index: 0 | 1 | 2 | 3;
  moveId: string;
  pp: number;
  disabled: boolean;
  targetType: MoveTarget;    // e.g. 'normal', 'allAdjacentFoes'
  legalTargets: string[];    // slotIds reachable by this move from this attacker
}>;
```

### 2. Server — `packages/server/src/engine/targeting.ts`

Update `getLegalTargets` signature to accept the attacker's slot index and the team slot arrays so it can apply `|i - j| ≤ 1` adjacency filtering for the relevant target types.

```ts
export function getLegalTargets(
  state: BattleState,
  attackerSlotId: string,
  target: MoveTarget
): string[]
```

The signature stays the same externally; the function derives the attacker index and non-spectator slot lists internally from `state`.

Internally, add a helper:

```ts
function nonSpectatorSlots(team: TeamState): SlotState[]
function attackerIndex(team: TeamState, slotId: string): number
function isAdjacent(attackerIdx: number, targetIdx: number): boolean {
  return Math.abs(attackerIdx - targetIdx) <= 1;
}
```

Apply `isAdjacent` filter inside the `normal`, `adjacentFoe`, `adjacentAlly`, `adjacentAllyOrSelf`, and `allAdjacent` cases.

### 3. Server — `packages/server/src/socket/BattleRoom.ts`

In `getPendingActionRequest`, `buildPlayerRequests`, and `buildNpcRequests`: for each move slot, look up `this.data.getMove(moveSlot.moveId)` to get `target: MoveTarget`, then call `getLegalTargets(this.state, slotId, target)`. Include both as `targetType` and `legalTargets` in the move entry. Remove calls to `getOpposingSlotIds`.

`getOpposingSlotIds` becomes unused and can be deleted.

### 4. Client — new `packages/client/src/battle/targeting.ts`

Pure utility module — no React, no side effects:

```ts
export type TargetMode = 'choose' | 'listed' | 'labeled' | 'auto';

export function classifyTarget(targetType: MoveTarget): TargetMode
export function getTargetLabel(targetType: MoveTarget): string
export function formatTargetNames(legalTargets: string[], state: BattleState): string
// returns e.g. "Blaziken, Lucario, Gardevoir…" (max 3 names + ellipsis if more)
```

### 5. Client — `packages/client/src/pages/BattlePage.tsx`

Replace `targetingMoveIndex: 0|1|2|3|null` state with `targetingMove: ValidMove | null` (where `ValidMove` is the enriched move entry type).

`ValidMove` is `ActionRequestPayload['validMoves'][number]` — the enriched per-move type from the shared package.

`handleMoveSelect(moveIndex)`:
1. Look up the move entry from `actionRequest.validMoves`
2. Classify: `mode = classifyTarget(move.targetType)`
3. If `auto` → submit immediately with `targetSlotId: move.legalTargets[0]` (e.g. attacker's own slotId for `self`)
4. If `choose` → set `targetingMove = move`, `selectedTarget = move.legalTargets[0]`
5. If `listed` or `labeled` → set `targetingMove = move`, no `selectedTarget` needed

The targeting strip (the row below the move panel) renders based on `targetingMove`:
- **choose**: `<select>` populated from `targetingMove.legalTargets`, Confirm, Cancel (✕)
- **listed**: `formatTargetNames(targetingMove.legalTargets, state)` as static text, Confirm, Cancel
- **labeled**: `getTargetLabel(targetingMove.targetType)` as static text, Confirm, Cancel

`handleConfirmTarget`:
- `choose` mode: submit with `targetSlotId = selectedTarget`
- `listed`/`labeled` mode: submit with no `targetSlotId` (server resolves)
- Either way: clear `targetingMove`

## Tests to Update

- `packages/server/src/socket/__tests__/BattleRoom.test.ts` — line 64: `req!.legalTargets` moves to `req!.validMoves[0]!.legalTargets`
- `packages/server/src/engine/__tests__/targeting.test.ts` — add adjacency-filtering cases for multi-slot battles

## Out of Scope

- Adjacency highlighting in the battle scene sprite layout
- Move target type display on the move buttons themselves
- NPC targeting strategy changes (NPC picks first `legalTargets[0]` as before)
