# Switch Flow Bugs — Design Spec

**Date:** 2026-09-01  
**Branch:** feat/ability-item-completion  
**Scope:** Three related bugs in the battle switching flow — post-faint hang, NPC switch UI, and pivot move (U-turn) switching.

---

## Problem Summary

1. **Post-faint hang:** After a forced switch (due to faint) is submitted, the game freezes. No action requests are sent to start the next turn.
2. **NPC switch UI:** When an NPC's Pokémon faints, no admin notification is sent. The NPC's forced switch sits in `awaitingForcedSwitches` indefinitely, and the game never proceeds.
3. **Pivot moves (U-turn etc.):** Moves like U-turn deal damage but don't trigger the user to switch out. No `pivot` secondary kind exists.

---

## Root Causes

### Bug 1 — Post-faint hang
`BattleRoom.submitAction()` (`BattleRoom.ts:94–101`) handles forced switches, deletes the slot from `awaitingForcedSwitches`, fires `onTurnResolvedCb`, and returns `{ ok: true }`. When the last forced switch resolves and `awaitingForcedSwitches` becomes empty, no code checks that condition — nothing fires NPC/player action requests, and nothing checks for battle end.

### Bug 2 — NPC switch UI
`SocketServer.startBattle()` wires up `room.onSwitchRequest`. That callback calls `this.lobby.getBySlotId(slot.slotId)`, which returns `null` for NPC slots (NPCs aren't in the lobby), so NPC slots are silently skipped. No admin notification is sent, so no one can submit the NPC's forced switch.

### Bug 3 — Pivot moves
No `pivot` secondary kind exists in `Secondary` (`secondary.ts`) or `SecondarySchema` (`move.schema.ts`). U-turn's damage executes normally, but there is no mechanism to halt the turn, request a switch from the user, and then resume remaining actions. `BattleEngine.resolveTurn` processes all actions in a single pass with no concept of mid-turn interruption.

---

## Design

### Fix 1 — Post-forced-switch continuation (`BattleRoom.ts`)

After `awaitingForcedSwitches.delete(slotId)` in `submitAction`, add a size check:

- If `awaitingForcedSwitches.size > 0`: fire `onTurnResolvedCb` with the switch events and return. More switches are still pending; this is expected.
- If `awaitingForcedSwitches.size === 0`: fire `onTurnResolvedCb`, then run post-turn continuation:
  1. If `interruptedTurnContext` is set (Bug 3 path): call `engine.resumeTurn(...)`, fire its events via `onTurnResolvedCb`, clear the context, then fall through to faint/end checking.
  2. Check for battle end via `checkWinner`. If winner found, update state phase and fire `onBattleEndCb`.
  3. Otherwise, fire `buildNpcRequests()` → `onNpcActionRequiredCb` and `buildPlayerRequests()` → `onPlayerActionRequiredCb`.

This is the single shared "continuation" path used by both faint-based forced switches and pivot-based ones.

---

### Fix 2 — NPC forced switch UI

**Server (`SocketServer.ts`):**

In `room.onSwitchRequest`, split slots into two groups:
- **Player slots** (`!slot.isNpc`): existing behaviour — look up player socket, emit `switch:request`.
- **NPC slots** (`slot.isNpc`): build an `ActionRequestPayload` per NPC slot with `validMoves: []`, `canSwitch: true`, `switchTargets: [instanceId, ...]` (non-fainted, non-active party members). Emit these to all admin sockets via the existing `npc:action-request` event.

NPC forced-switch requests arrive after `turn:resolve`, so `ControlPanel`'s `onTurnResolve = () => setNpcRequests([])` clears correctly before the NPC switch request lands.

**Admin UI (`NpcTabPanel.tsx`):**

When the active tab's `request.validMoves.length === 0 && request.canSwitch`:
- Render a "SWITCH REQUIRED" header instead of the move grid.
- Look up bench Pokémon from `state` using `request.switchTargets` (instance IDs).
- Display each as a button showing nickname, level, and HP.
- On click: emit `admin:action → npc-action` with `{ type: 'switch', targetInstanceId: id }`.

The existing `admin:action` handler (`adminHandlers.ts`, case `'npc-action'`) already routes `SwitchAction` to `room.submitAction`, which handles it in the forced-switch branch.

---

### Fix 3 — Pivot moves (mid-turn, accurate)

#### Type changes

**`packages/shared/src/types/secondary.ts`:**
```
| { kind: 'pivot' }
```

**`packages/shared/src/schemas/move.schema.ts` (`SecondarySchema`):**
```
z.object({ kind: z.literal('pivot') }),
```

**`packages/shared/src/types/events.ts` (`TurnResolveEvent.type`):**
```
| 'pivot-skipped'
```

#### BattleEngine changes (`BattleEngine.ts`)

**Extended `TurnResult`:**
```typescript
export interface TurnResult {
  newState: BattleState;
  events: TurnResolveEvent[];
  pivotSlots?: string[];                       // slotIds needing mid-turn switch
  remainingActions?: Record<string, Action>;   // actions not yet executed
  remainingSlotOrder?: string[];               // slots not yet processed
}
```

**`executeMove` return:** Add optional `pivotSwitch: boolean` to indicate the attacker needs to switch mid-turn.

The `pivot` secondary is filtered out of `postSecs` before calling `applySecondaries`, so it is never passed to that function. Instead, after the entire target loop completes, `executeMove` checks once: if any secondary has `kind === 'pivot'` and the attacker has not fainted:
- Check if the attacker's slot has any living bench members by calling `this.findSlot(s, attackerSlotId)`.
- **Has bench:** set `pivotSwitch = true` on the result.
- **No bench:** emit `{ type: 'pivot-skipped', data: { slotId: attackerSlotId } }` and do not set the flag.

**`resolveTurn` action loop:**  
After executing each move, check `moveResult.pivotSwitch`. If true:
- Collect the slot IDs not yet processed (`remainingSlotOrder`).
- Stop the action loop (skip EOT).
- Return with `pivotSlots: [slotId]`, `remainingActions`, `remainingSlotOrder`.

**New `resumeTurn` method:**
```typescript
public resumeTurn(
  state: BattleState,
  remainingSlotOrder: string[],
  actions: Record<string, Action>,
  movedSlotIds: Set<string>,
): TurnResult
```
Runs the remaining actions in order (starting from `remainingSlotOrder`, skipping already-moved slots), then runs EOT. Returns the final `TurnResult` (no `pivotSlots` — pivot can't chain). If a faint occurs during resumed actions, it is handled via the existing faint detection in `BattleRoom`.

#### BattleRoom changes (`BattleRoom.ts`)

Add field:
```typescript
private interruptedTurnContext: {
  remainingActions: Record<string, Action>;
  remainingSlotOrder: string[];
  movedSlotIds: Set<string>;
} | null = null;
```

In `BattleRoom.resolveTurn()`, after calling `engine.resolveTurn`:
1. Fire `onTurnResolvedCb` with the events so far.
2. If `result.pivotSlots` is non-empty:
   - Store `interruptedTurnContext`.
   - Add pivot slots to `awaitingForcedSwitches` as `'forced'`.
   - Call `getPendingSwitchSlots` to pick up any concurrent faints (e.g., foe fainted from pivot damage). Merge all into `awaitingForcedSwitches`.
   - Fire `onSwitchRequestCb` with all affected slots.
   - Return (waiting for switch submissions).
3. Otherwise, continue with existing faint-switch logic (unchanged).

The "continuation" code in `submitAction` (Fix 1) handles the `interruptedTurnContext` check when all switches are resolved.

#### Move data

U-turn, Volt Switch, and Flip Turn entries in the move JSON data get:
```json
"secondaries": [{ "kind": "pivot" }]
```

Note: Parting Shot is a status move and goes through the `MoveEffectRegistry` path, which does not process `pivot` secondaries. It is out of scope for this fix.

#### Battle log

In `BattleContext.eventsToPlaybackEntries` and `eventToText`:
```
case 'pivot-skipped':
  text: `${slotId} has no Pokémon left to send in!`
  delay: 600
```

---

## File Change Summary

| File | Change |
|---|---|
| `packages/shared/src/types/secondary.ts` | Add `{ kind: 'pivot' }` variant |
| `packages/shared/src/schemas/move.schema.ts` | Add pivot to SecondarySchema |
| `packages/shared/src/types/events.ts` | Add `'pivot-skipped'` event type |
| `packages/server/src/socket/BattleRoom.ts` | Fix 1 continuation logic; Fix 3 interrupted context |
| `packages/server/src/socket/SocketServer.ts` | Fix 2 NPC slot handling in onSwitchRequest |
| `packages/server/src/engine/BattleEngine.ts` | Fix 3 pivot detection in executeMove; interrupt in resolveTurn; resumeTurn method |
| `packages/client/src/admin/NpcTabPanel.tsx` | Fix 2 switch-required UI |
| `packages/client/src/battle/BattleContext.tsx` | Fix 3 pivot-skipped event to text |
| Move JSON data files | Add pivot secondary to U-turn, Volt Switch, Flip Turn |

---

## Interaction Between Fixes

Fix 1 must be implemented first as the foundation — it provides the "all switches resolved, what now?" hook that Fix 3's resume path plugs into. Fix 2 is independent of Fix 3 (it uses the same forced switch submission path as faint switches). Fix 3 adds the interrupted context field that Fix 1's continuation code checks.

---

## Out of Scope

- Baton Pass (passes stat boosts on switch) — separate feature, not listed in bug report.
- Mid-turn pivot chaining (U-turn user's replacement also uses U-turn) — handled naturally: after `resumeTurn`, any new pivot would be detected, but the spec treats this as a normal turn continuation. Chained pivots within a single turn are not supported.
- NPC AI choosing which Pokémon to send in — admin manually selects for all NPC switches.
