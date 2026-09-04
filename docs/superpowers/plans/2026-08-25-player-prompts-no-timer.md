# Player Prompts + Timer Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two cascading bugs: human players never receive `action:request` prompts; turn timer auto-submits for them and fakes Pokémon early, shrinking legal targets and making NPC target selectors appear stuck. Remove the timer entirely so turns only resolve when all submissions arrive.

**Architecture:** Three independent tasks in dependency order: (1) strip timer machinery + `timerSeconds` from `ActionRequestPayload` (no new behaviour, just deletions); (2) add `onPlayerActionRequired`/`buildPlayerRequests()` to `BattleRoom` and wire it in `SocketServer` (TDD); (3) strip `turnTimerSeconds` from `BattleState`, `BattleConfigurator`, `adminHandlers`, and all client UI + fixtures.

**Tech Stack:** TypeScript, Vitest, React 18, Socket.io, pnpm monorepo (`@poke-fighter/shared`, `@poke-fighter/server`, `@poke-fighter/client`).

---

### Task 1: Remove timer machinery + `timerSeconds` from `ActionRequestPayload`

**Files:**
- Modify: `packages/shared/src/types/events.ts`
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/SocketServer.ts`
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Modify: `packages/server/src/socket/__tests__/BattleRoom.test.ts`
- Modify: `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`

- [ ] **Step 1: Remove `timerSeconds` from `ActionRequestPayload` and `'pause'`/`'unpause'` from `AdminActionPayload` in `packages/shared/src/types/events.ts`**

In `ActionRequestPayload` (around line 67), remove the `timerSeconds: number` field:

```ts
export interface ActionRequestPayload {
  slotId: string;
  validMoves: Array<{ index: 0 | 1 | 2 | 3; moveId: string; pp: number; disabled: boolean }>;
  legalTargets: string[];
  canSwitch: boolean;
  switchTargets: string[];
  canTerastallize: boolean;
}
```

In `AdminActionPayload` (around line 32), remove `'pause'` and `'unpause'` from the union:

```ts
export interface AdminActionPayload {
  type:
    | 'npc-action'
    | 'force-faint'
    | 'forfeit'
    | 'force-switch'
    | 'lobby:list'
    | 'lobby:slot-status'
    | 'battles:list'
    | 'battles:connect'
    | 'registry:list'
    | 'registry:save-player'
    | 'registry:delete-player'
    | 'registry:save-npc'
    | 'registry:delete-npc'
    | 'registry:save-team'
    | 'registry:delete-team'
    | 'start-battle'
    | 'data:query';
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Rewrite `packages/server/src/socket/BattleRoom.ts` — remove all timer code**

Replace the full file with the content below. Key changes:
- `BattleRoomOptions` drops `timerSeconds`
- Fields `timer`, `timerSeconds`, `paused` removed
- Methods `startTimer()`, `pause()`, `unpause()` removed
- All `this.startTimer()` / `clearTimeout(this.timer)` call sites removed
- `timerSeconds: this.timerSeconds` removed from `buildNpcRequests()` and `getPendingActionRequest()`
- Constructor no longer calls `this.startTimer()`
- `resolveTurn()` else-branch no longer calls `this.startTimer()`
- `forceFaint()` and `forfeit()` no longer touch the timer

```ts
import type { BattleState, MoveAction, SwitchAction, TurnResolveEvent, SlotState, PartyMember, Stats, ActionRequestPayload } from '@poke-fighter/shared';
import { BattleEngine } from '../engine/index.js';
import { calcExpYield, distributeExp, checkLevelUps, type ExpAward, type LevelUpResult } from '../engine/exp.js';
import { DataLoader } from '../data/loader.js';

type Action = MoveAction | SwitchAction;

interface BattleRoomOptions {
  initialState: BattleState;
}

type TurnResolvedCallback = (events: TurnResolveEvent[], newState: BattleState) => void;
type BattleEndCallback = (winningTeamId: string, finalState: BattleState) => void;
type SwitchRequestCallback = (slots: SlotState[]) => void;
type NpcActionRequiredCallback = (slots: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }>) => void;

export class BattleRoom {
  private state: BattleState;
  private readonly engine = new BattleEngine();
  private readonly pendingActions = new Map<string, Action>();
  private onTurnResolvedCb: TurnResolvedCallback | null = null;
  private onBattleEndCb: BattleEndCallback | null = null;
  private onSwitchRequestCb: SwitchRequestCallback | null = null;
  private onExpAwardCb: ((awards: ExpAward[]) => void) | null = null;
  private onLevelUpCb: ((result: LevelUpResult, newStats: Stats) => void) | null = null;
  private onNpcActionRequiredCb: NpcActionRequiredCallback | null = null;
  private readonly data = new DataLoader();
  private awaitingForcedSwitches = new Set<string>();

  constructor({ initialState }: BattleRoomOptions) {
    this.state = structuredClone(initialState);
    // Defer NPC request emission so SocketServer can wire up onNpcActionRequired first
    setTimeout(() => {
      const npcRequests = this.buildNpcRequests();
      if (npcRequests.length > 0) this.onNpcActionRequiredCb?.(npcRequests);
    }, 0);
  }

  getState(): BattleState {
    return this.state;
  }

  onTurnResolved(cb: TurnResolvedCallback): void {
    this.onTurnResolvedCb = cb;
  }

  onBattleEnd(cb: BattleEndCallback): void {
    this.onBattleEndCb = cb;
  }

  onSwitchRequest(cb: SwitchRequestCallback): void {
    this.onSwitchRequestCb = cb;
  }

  onExpAward(cb: (awards: ExpAward[]) => void): void { this.onExpAwardCb = cb; }

  onLevelUp(cb: (result: LevelUpResult, newStats: Stats) => void): void { this.onLevelUpCb = cb; }

  onNpcActionRequired(cb: NpcActionRequiredCallback): void { this.onNpcActionRequiredCb = cb; }

  submitAction(slotId: string, action: Action): { ok: boolean; reason?: string } {
    // Handle forced switch (after faint) — must come before normal validation
    if (this.awaitingForcedSwitches.has(slotId)) {
      if (action.type !== 'switch') {
        return { ok: false, reason: 'Must submit a switch action' };
      }
      this.awaitingForcedSwitches.delete(slotId);
      const s = structuredClone(this.state);
      let switched = false;
      for (const team of s.teams) {
        const slot = team.slots.find((sl) => sl.slotId === slotId);
        if (!slot) continue;
        const newIndex = slot.party.findIndex((p) => p.instanceId === (action as SwitchAction).targetInstanceId);
        if (newIndex === -1 || slot.party[newIndex]?.fainted) {
          this.awaitingForcedSwitches.add(slotId);
          return { ok: false, reason: 'Invalid switch target' };
        }
        slot.activePokemonIndex = newIndex;
        switched = true;
        break;
      }
      if (!switched) {
        this.awaitingForcedSwitches.add(slotId);
        return { ok: false, reason: 'Slot not found' };
      }
      this.state = s;
      const switchEvent: TurnResolveEvent = { type: 'volatile-applied', data: { note: 'switch', slotId } };
      try {
        this.onTurnResolvedCb?.([switchEvent], this.state);
      } catch (err) {
        console.error('[BattleRoom] onTurnResolvedCb (forced switch) threw:', err);
      }
      return { ok: true };
    }

    // Verify slot exists in the current state
    const slot = this.findSlot(slotId);
    if (!slot) return { ok: false, reason: 'Unknown slot' };
    if (slot.isSpectator) return { ok: false, reason: 'Spectators cannot submit actions' };

    this.pendingActions.set(slotId, action);

    if (this.allActionsCollected()) {
      this.resolveTurn();
    }

    return { ok: true };
  }

  getStateSnapshot(): BattleState {
    return structuredClone(this.state);
  }

  getPendingActionRequest(slotId: string): ActionRequestPayload | null {
    if (this.awaitingForcedSwitches.size > 0) return null;
    if (this.state.phase !== 'action') return null;
    if (this.pendingActions.has(slotId)) return null;
    const slot = this.findSlot(slotId);
    if (!slot || slot.isNpc || slot.isSpectator) return null;
    const active = slot.party[slot.activePokemonIndex];
    if (!active || active.fainted) return null;
    return {
      slotId: slot.slotId,
      validMoves: active.moves.map((m, i) => ({
        index: i as 0 | 1 | 2 | 3,
        moveId: m.moveId,
        pp: m.currentPp,
        disabled: false,
      })),
      legalTargets: this.getOpposingSlotIds(slotId),
      canSwitch: slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
      switchTargets: slot.party
        .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
        .map((p) => p.instanceId),
      canTerastallize: !active.hasTerastallized && !!active.teraType,
    };
  }

  forceFaint(slotId: string): void {
    const s = structuredClone(this.state);
    let mon: import('@poke-fighter/shared').PartyMember | undefined;
    for (const team of s.teams) {
      const slot = team.slots.find((sl) => sl.slotId === slotId);
      if (!slot) continue;
      mon = slot.party[slot.activePokemonIndex];
      break;
    }
    if (!mon || mon.fainted) return;

    mon.fainted = true;
    mon.currentHp = 0;
    this.state = s;

    const faintEvent: TurnResolveEvent = {
      type: 'faint',
      data: { slotId, instanceId: mon.instanceId },
    };
    this.processExpFromEvents([faintEvent], s);

    try {
      this.onTurnResolvedCb?.([faintEvent], s);
    } catch (err) {
      console.error('[BattleRoom] forceFaint onTurnResolvedCb threw:', err);
    }

    const switchSlots = this.getPendingSwitchSlots(s);
    if (switchSlots.length > 0) {
      this.awaitingForcedSwitches = new Set(switchSlots.map((sl) => sl.slotId));
      try {
        this.onSwitchRequestCb?.(switchSlots);
      } catch (err) {
        console.error('[BattleRoom] forceFaint onSwitchRequestCb threw:', err);
      }
      return;
    }

    const winner = this.checkWinner(s);
    if (winner !== null) {
      s.phase = 'ended';
      s.winner = winner;
      this.state = s;
      const winningTeamId = s.teams[winner]?.teamId ?? '';
      try {
        this.onBattleEndCb?.(winningTeamId, s);
      } catch (err) {
        console.error('[BattleRoom] forceFaint onBattleEndCb threw:', err);
      }
    }
  }

  forfeit(teamId: string): void {
    const s = structuredClone(this.state);
    const teamIdx = s.teams.findIndex((t) => t.teamId === teamId);
    if (teamIdx === -1) return;

    for (const slot of s.teams[teamIdx]!.slots) {
      for (const p of slot.party) {
        p.fainted = true;
        p.currentHp = 0;
      }
    }

    const winnerIdx = teamIdx === 0 ? 1 : 0;
    s.phase = 'ended';
    s.winner = winnerIdx as 0 | 1;
    this.state = s;

    const winningTeamId = s.teams[winnerIdx]?.teamId ?? '';
    try {
      this.onBattleEndCb?.(winningTeamId, s);
    } catch (err) {
      console.error('[BattleRoom] forfeit onBattleEndCb threw:', err);
    }
  }

  private getPendingSwitchSlots(state: BattleState): SlotState[] {
    const pending: SlotState[] = [];
    for (const team of state.teams) {
      for (const slot of team.slots) {
        if (slot.isSpectator) continue;
        const active = slot.party[slot.activePokemonIndex];
        if (!active || !active.fainted) continue;
        const hasLiving = slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted);
        if (hasLiving) pending.push(slot);
        else slot.isSpectator = true;
      }
    }
    return pending;
  }

  private processExpFromEvents(events: TurnResolveEvent[], newState: BattleState): void {
    for (const event of events) {
      if (event.type !== 'faint') continue;
      const faintedInstanceId = event.data['instanceId'];
      if (typeof faintedInstanceId !== 'string') continue;

      const faintedTeamIdx = newState.teams.findIndex((t) =>
        t.slots.some((s) => s.party.some((p) => p.instanceId === faintedInstanceId))
      );
      if (faintedTeamIdx === -1) continue;

      let faintedMon: PartyMember | undefined;
      for (const team of newState.teams) {
        for (const slot of team.slots) {
          const mon = slot.party.find((p) => p.instanceId === faintedInstanceId);
          if (mon) { faintedMon = mon; break; }
        }
        if (faintedMon) break;
      }
      if (!faintedMon) continue;

      const species = this.data.getSpecies(faintedMon.speciesId);
      if (!species) continue;

      const expYield = calcExpYield({ baseExpYield: species.baseExpYield, level: faintedMon.level });

      const winningTeamIdx = faintedTeamIdx === 0 ? 1 : 0;
      const recipients = newState.teams[winningTeamIdx]?.slots.flatMap((s) => s.party) ?? [];

      const awards = distributeExp({ expYield, recipients });

      for (const award of awards) {
        for (const team of newState.teams) {
          for (const slot of team.slots) {
            const mon = slot.party.find((p) => p.instanceId === award.instanceId);
            if (!mon) continue;
            mon.expTotal = award.newTotal;
            const growth = this.data.getSpecies(mon.speciesId)?.expGrowth ?? 'MediumFast';
            const levelUp = checkLevelUps(mon, award.newTotal, growth);
            if (levelUp) {
              mon.level = levelUp.newLevel;
              this.onLevelUpCb?.(levelUp, mon.stats);
            }
          }
        }
      }

      if (awards.length > 0) {
        this.onExpAwardCb?.(awards);
      }
    }
  }

  private checkWinner(state: BattleState): 0 | 1 | null {
    for (let i = 0; i < 2; i++) {
      const team = state.teams[i];
      if (!team) continue;
      const allFainted = team.slots.every((slot) => slot.party.every((p) => p.fainted));
      if (allFainted) return i === 0 ? 1 : 0;
    }
    return null;
  }

  private findSlot(slotId: string): SlotState | undefined {
    for (const team of this.state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot;
    }
    return undefined;
  }

  private activeSlotsNeedingAction(): string[] {
    return this.state.teams.flatMap((team) =>
      team.slots
        .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
        .map((s) => s.slotId)
    );
  }

  private allActionsCollected(): boolean {
    return this.activeSlotsNeedingAction().every((slotId) => this.pendingActions.has(slotId));
  }

  private buildNpcRequests(): Array<{ slotId: string; displayName: string; request: ActionRequestPayload }> {
    const result: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }> = [];
    for (const team of this.state.teams) {
      for (const slot of team.slots) {
        if (!slot.isNpc || slot.isSpectator) continue;
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        result.push({
          slotId: slot.slotId,
          displayName: slot.displayName,
          request: {
            slotId: slot.slotId,
            validMoves: active.moves.map((m, i) => ({
              index: i as 0 | 1 | 2 | 3,
              moveId: m.moveId,
              pp: m.currentPp,
              disabled: false,
            })),
            legalTargets: this.getOpposingSlotIds(slot.slotId),
            canSwitch: false,
            switchTargets: [],
            canTerastallize: !active.hasTerastallized && !!active.teraType,
          },
        });
      }
    }
    return result;
  }

  private getOpposingSlotIds(slotId: string): string[] {
    const teamIdx = this.state.teams.findIndex((t) => t.slots.some((s) => s.slotId === slotId));
    const foeTeamIdx = teamIdx === 0 ? 1 : 0;
    return this.state.teams[foeTeamIdx]?.slots
      .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId) ?? [];
  }

  private resolveTurn(): void {
    const actions = Object.fromEntries(this.pendingActions);
    this.pendingActions.clear();

    const { newState, events } = this.engine.resolveTurn(this.state, actions);
    this.state = newState;

    this.processExpFromEvents(events, newState);

    try {
      this.onTurnResolvedCb?.(events, newState);
    } catch (err) {
      console.error('[BattleRoom] onTurnResolved callback threw:', err);
    }

    const switchSlots = this.getPendingSwitchSlots(newState);
    if (switchSlots.length > 0) {
      this.awaitingForcedSwitches = new Set(switchSlots.map((s) => s.slotId));
      try {
        this.onSwitchRequestCb?.(switchSlots);
      } catch (err) {
        console.error('[BattleRoom] onSwitchRequest callback threw:', err);
      }
      return;
    }

    if (newState.phase === 'ended' && newState.winner !== undefined) {
      const winningTeam = newState.teams[newState.winner];
      try {
        this.onBattleEndCb?.(winningTeam?.teamId ?? '', newState);
      } catch (err) {
        console.error('[BattleRoom] onBattleEnd callback threw:', err);
      }
    } else {
      const npcRequests = this.buildNpcRequests();
      if (npcRequests.length > 0) {
        this.onNpcActionRequiredCb?.(npcRequests);
      }
    }
  }
}
```

- [ ] **Step 3: Remove `pause` and `unpause` cases from `packages/server/src/socket/handlers/adminHandlers.ts`**

Delete the two `case` blocks (lines 36-47):

```ts
      case 'pause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.pause();
        const state = getRoom(battleId)?.getState();
        if (state) io.to(`battle:${battleId}`).emit('state:sync', state);
        break;
      }
      case 'unpause': {
        const { battleId } = payload.data as { battleId: string };
        getRoom(battleId)?.unpause();
        break;
      }
```

- [ ] **Step 4: Drop `timerSeconds` from `BattleRoom` constructor in `packages/server/src/socket/SocketServer.ts`**

Change line 138:

```ts
// Before:
const room = new BattleRoom({ initialState: structuredClone(initialState), timerSeconds: initialState.turnTimerSeconds });

// After:
const room = new BattleRoom({ initialState: structuredClone(initialState) });
```

- [ ] **Step 5: Update `packages/server/src/socket/__tests__/BattleRoom.test.ts` — delete timer tests and drop `timerSeconds`**

Delete the two tests that test timer behaviour (they will no longer be valid):
- `'auto-submits and resolves when timer expires'` (lines 40–59)
- `'pause stops the timer from auto-resolving'` (lines 77–92)

Remove `timerSeconds: 60` from every `new BattleRoom(...)` call. The file should look like:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleRoom } from '../BattleRoom.js';
import { make1v1State } from '../../engine/__tests__/fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

describe('BattleRoom', () => {
  let room: BattleRoom;

  beforeEach(() => {
    const state = make1v1State();
    room = new BattleRoom({ initialState: state });
  });

  it('starts in action phase waiting for submissions', () => {
    expect(room.getState().phase).toBe('action');
  });

  it('collects a valid action from a slot', () => {
    const action: MoveAction = { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' };
    const result = room.submitAction('slot-a1', action);
    expect(result.ok).toBe(true);
  });

  it('resolves turn when all slots have submitted', () => {
    const events: unknown[] = [];
    room.onTurnResolved((e) => events.push(e));

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(events.length).toBeGreaterThan(0);
    expect(room.getState().turnNumber).toBe(2);
  });

  it('rejects action from unknown slot', () => {
    const result = room.submitAction('slot-unknown', { type: 'move', moveIndex: 0 });
    expect(result.ok).toBe(false);
  });

  it('fires onBattleEnd when a team wins', () => {
    const endEvents: string[] = [];
    room.onBattleEnd((winningTeamId) => endEvents.push(winningTeamId));

    const state = room.getState();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(endEvents.length).toBe(1);
    expect(endEvents[0]).toBe('team-a');
  });
});

describe('getPendingActionRequest', () => {
  it('returns an action request for a human slot that has not yet submitted', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req).not.toBeNull();
    expect(req!.slotId).toBe('slot-a1');
    expect(req!.validMoves).toHaveLength(4);
    expect(req!.legalTargets).toContain('slot-b1');
  });

  it('returns null after the slot has submitted an action', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state });
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0 });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });

  it('returns null for an NPC slot', () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    expect(room.getPendingActionRequest('slot-b1')).toBeNull();
  });

  it('returns null for a fainted slot', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    const room = new BattleRoom({ initialState: state });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });
});
```

- [ ] **Step 6: Remove `timerSeconds: 60` from `ActionRequestPayload` fixture in `packages/server/src/socket/__tests__/lobbyHandlers.test.ts`**

Around line 185–193, find `timerSeconds: 60` in `pendingRequest` and remove that line:

```ts
    const pendingRequest = {
      slotId: 'slot-a1',
      validMoves: [{ index: 0 as const, moveId: 'tackle', pp: 35, disabled: false }],
      legalTargets: ['slot-b1'],
      canSwitch: false,
      switchTargets: [],
      canTerastallize: false,
    };
```

- [ ] **Step 7: Run server tests and verify they pass**

```
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass (the two deleted timer tests are gone, no TypeScript errors about `timerSeconds`).

- [ ] **Step 8: Commit**

```
git add packages/shared/src/types/events.ts \
        packages/server/src/socket/BattleRoom.ts \
        packages/server/src/socket/SocketServer.ts \
        packages/server/src/socket/handlers/adminHandlers.ts \
        packages/server/src/socket/__tests__/BattleRoom.test.ts \
        packages/server/src/socket/__tests__/lobbyHandlers.test.ts
git commit -m "feat: remove turn timer, drop timerSeconds from ActionRequestPayload"
```

---

### Task 2: Add `onPlayerActionRequired` + `buildPlayerRequests()` to `BattleRoom`, wire in `SocketServer`

**Files:**
- Modify: `packages/server/src/socket/BattleRoom.ts`
- Modify: `packages/server/src/socket/SocketServer.ts`
- Modify: `packages/server/src/socket/__tests__/BattleRoom.test.ts`

- [ ] **Step 1: Write failing tests for `onPlayerActionRequired` in `packages/server/src/socket/__tests__/BattleRoom.test.ts`**

Add a new `describe` block at the end of the file:

```ts
describe('onPlayerActionRequired', () => {
  it('fires deferred at construction with one entry per active human slot', async () => {
    // make1v1State has slot-a1 (isNpc=false) and slot-b1 (isNpc=true)
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    // Must not fire synchronously
    expect(cb).not.toHaveBeenCalled();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledOnce();
    const requests: Array<{ slotId: string; request: unknown }> = cb.mock.calls[0]![0];
    expect(requests).toHaveLength(1);
    expect(requests[0]!.slotId).toBe('slot-a1');
  });

  it('fires again after resolveTurn with the next turn human slots', async () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    await new Promise<void>((r) => setTimeout(r, 0));
    cb.mockClear();

    // Both slots submit — triggers resolveTurn
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    // resolveTurn fires synchronously — callback fires synchronously in else-branch
    expect(cb).toHaveBeenCalledOnce();
    const requests: Array<{ slotId: string; request: unknown }> = cb.mock.calls[0]![0];
    expect(requests[0]!.slotId).toBe('slot-a1');
  });

  it('excludes NPC and spectator slots', async () => {
    const state = make1v1State();
    // slot-b1 is isNpc=true, slot-a1 is isNpc=false
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    await new Promise<void>((r) => setTimeout(r, 0));
    const requests: Array<{ slotId: string }> = cb.mock.calls[0]![0];
    expect(requests.every((r) => r.slotId !== 'slot-b1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```
pnpm --filter @poke-fighter/server test
```

Expected: 3 new tests fail with `room.onPlayerActionRequired is not a function` or similar.

- [ ] **Step 3: Add `PlayerActionRequiredCallback` type, `onPlayerActionRequiredCb` field, `onPlayerActionRequired()` method, and `buildPlayerRequests()` to `packages/server/src/socket/BattleRoom.ts`**

Add the new type alias after the existing `NpcActionRequiredCallback` definition (after line 16 in the current file — but Task 1 has already rewritten the file, so add it alongside the others at the top of the class section):

```ts
type PlayerActionRequiredCallback = (requests: Array<{ slotId: string; request: ActionRequestPayload }>) => void;
```

Add the private field after `onNpcActionRequiredCb`:

```ts
private onPlayerActionRequiredCb: PlayerActionRequiredCallback | null = null;
```

Add the public registration method alongside `onNpcActionRequired`:

```ts
onPlayerActionRequired(cb: PlayerActionRequiredCallback): void { this.onPlayerActionRequiredCb = cb; }
```

Update the constructor's `setTimeout` block to also fire the player callback:

```ts
  constructor({ initialState }: BattleRoomOptions) {
    this.state = structuredClone(initialState);
    // Defer emission so SocketServer can wire up callbacks first
    setTimeout(() => {
      const npcRequests = this.buildNpcRequests();
      if (npcRequests.length > 0) this.onNpcActionRequiredCb?.(npcRequests);
      const playerRequests = this.buildPlayerRequests();
      if (playerRequests.length > 0) this.onPlayerActionRequiredCb?.(playerRequests);
    }, 0);
  }
```

Update the `resolveTurn()` else-branch to also fire the player callback:

```ts
    } else {
      const npcRequests = this.buildNpcRequests();
      if (npcRequests.length > 0) {
        this.onNpcActionRequiredCb?.(npcRequests);
      }
      const playerRequests = this.buildPlayerRequests();
      if (playerRequests.length > 0) {
        this.onPlayerActionRequiredCb?.(playerRequests);
      }
    }
```

Add the `buildPlayerRequests()` private method alongside `buildNpcRequests()`:

```ts
  private buildPlayerRequests(): Array<{ slotId: string; request: ActionRequestPayload }> {
    const result: Array<{ slotId: string; request: ActionRequestPayload }> = [];
    for (const team of this.state.teams) {
      for (const slot of team.slots) {
        if (slot.isNpc || slot.isSpectator) continue;
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        result.push({
          slotId: slot.slotId,
          request: {
            slotId: slot.slotId,
            validMoves: active.moves.map((m, i) => ({
              index: i as 0 | 1 | 2 | 3,
              moveId: m.moveId,
              pp: m.currentPp,
              disabled: false,
            })),
            legalTargets: this.getOpposingSlotIds(slot.slotId),
            canSwitch: slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
            switchTargets: slot.party
              .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
              .map((p) => p.instanceId),
            canTerastallize: !active.hasTerastallized && !!active.teraType,
          },
        });
      }
    }
    return result;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass, including the 3 new `onPlayerActionRequired` tests.

- [ ] **Step 5: Wire up `room.onPlayerActionRequired()` in `packages/server/src/socket/SocketServer.ts`**

After the existing `room.onNpcActionRequired(...)` block (around line 209), add:

```ts
    room.onPlayerActionRequired((requests) => {
      for (const { slotId, request } of requests) {
        const player = this.lobby.getBySlotId(slotId);
        if (!player) continue;
        const socket = this.io.sockets.sockets.get(player.socketId);
        socket?.emit('action:request', request);
      }
    });
```

- [ ] **Step 6: Run all server tests**

```
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```
git add packages/server/src/socket/BattleRoom.ts \
        packages/server/src/socket/SocketServer.ts \
        packages/server/src/socket/__tests__/BattleRoom.test.ts
git commit -m "feat(server): add onPlayerActionRequired + buildPlayerRequests, wire in SocketServer"
```

---

### Task 3: Remove `turnTimerSeconds` from `BattleState`, `BattleConfigurator`, client UI, and all remaining fixtures

**Files:**
- Modify: `packages/shared/src/types/battle.ts`
- Modify: `packages/server/src/setup/BattleConfigurator.ts`
- Modify: `packages/server/src/socket/handlers/adminHandlers.ts`
- Modify: `packages/server/src/engine/__tests__/fixtures.ts`
- Modify: `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`
- Modify: `packages/server/src/db/__tests__/Database.test.ts`
- Modify: `packages/client/src/admin/ControlPanel.tsx`
- Modify: `packages/client/src/admin/steps/BattleSettingsStep.tsx`
- Modify: `packages/client/src/admin/SetupPanel.tsx`
- Modify: `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`
- Modify: `packages/client/src/pages/__tests__/BattlePage.test.tsx`
- Modify: `packages/client/src/battle/__tests__/MovePanel.test.tsx`

- [ ] **Step 1: Remove `turnTimerSeconds` from `BattleState` in `packages/shared/src/types/battle.ts`**

In the `BattleState` interface (around line 80), remove `turnTimerSeconds: number`:

```ts
export interface BattleState {
  battleId: string;
  label: string;
  turnNumber: number;
  phase: BattlePhase;
  teams: [TeamState, TeamState];
  field: FieldState;
  winner?: 0 | 1;
}
```

- [ ] **Step 2: Update `packages/server/src/setup/BattleConfigurator.ts`**

Remove `turnTimerSeconds` from the `BuildConfig` interface and from the returned object in `build()`:

```ts
interface BuildConfig {
  battleId: string;
  label: string;
  teams: [TeamConfig, TeamConfig];
}
```

In `build()`, remove `turnTimerSeconds: config.turnTimerSeconds` from the return object:

```ts
  build(config: BuildConfig): BattleState {
    const teams = config.teams.map((teamConfig, teamIdx) => this.buildTeam(teamConfig, teamIdx)) as [TeamState, TeamState];

    return {
      battleId: config.battleId,
      label: config.label,
      turnNumber: 1,
      phase: 'action',
      teams,
      field: defaultField(),
    };
  }
```

- [ ] **Step 3: Remove `turnTimerSeconds` from `start-battle` case in `packages/server/src/socket/handlers/adminHandlers.ts`**

In the `start-battle` case (around line 49), remove `turnTimerSeconds` from the destructured payload and from the `configurator.build()` call:

```ts
      case 'start-battle': {
        const { battleId, label, teams } = payload.data as {
          battleId: string; label: string;
          teams: [{ slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }, { slots: { slotId: string; displayName: string; isNpc: boolean; party: import('@poke-fighter/shared').PokemonSet[] }[] }];
        };
        const { BattleConfigurator } = await import('../../setup/BattleConfigurator.js');
        const configurator = new BattleConfigurator();
        const state = configurator.build({ battleId, label, teams });
        db.battles.insert(state);
        startBattle(state);
        break;
      }
```

- [ ] **Step 4: Remove `turnTimerSeconds: 60` from `make1v1State()` in `packages/server/src/engine/__tests__/fixtures.ts`**

In the returned object at the bottom of `make1v1State()`, remove `turnTimerSeconds: 60`:

```ts
  return {
    battleId: 'test-battle',
    label: 'Test Battle',
    turnNumber: 1,
    phase: 'action',
    teams: [teamA, teamB],
    field: defaultField(),
  };
```

- [ ] **Step 5: Remove `turnTimerSeconds: 60` from both `config.build()` calls in `packages/server/src/setup/__tests__/BattleConfigurator.test.ts`**

First test (around line 17):

```ts
    const state = config.build({
      battleId: 'test-battle',
      label: 'Test',
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'Ash', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Gary', isNpc: true, party: [mockSet] }] },
      ],
    });
```

Second test (around line 35):

```ts
    const state = config.build({
      battleId: 'x', label: 'x',
      teams: [
        { slots: [{ slotId: 'a1', displayName: 'P', isNpc: false, party: [mockSet] }] },
        { slots: [{ slotId: 'b1', displayName: 'Q', isNpc: true, party: [mockSet] }] },
      ],
    });
```

- [ ] **Step 6: Remove `turnTimerSeconds: 60` from `makeBattleState()` in `packages/server/src/db/__tests__/Database.test.ts`**

Around line 50, remove `turnTimerSeconds: 60` from the `makeBattleState` factory. The object becomes:

```ts
const makeBattleState = (overrides: Partial<BattleState> = {}): BattleState => ({
  battleId: 'b1',
  label: 'Test Battle',
  turnNumber: 0,
  phase: 'action',
  teams: [
    { teamId: 'team-a', slots: [{ slotId: 'a1', displayName: 'Conor', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 }] },
    { teamId: 'team-b', slots: [{ slotId: 'b1', displayName: 'Ash', isNpc: true, isSpectator: false, party: [], activePokemonIndex: 0 }] },
  ],
  field: {
    sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    ],
    trickroom: 0,
    gravity: 0,
  },
  ...overrides,
});
```

- [ ] **Step 7: Run server tests to confirm all pass**

```
pnpm --filter @poke-fighter/server test
```

Expected: all tests pass with no TypeScript errors about `turnTimerSeconds`.

- [ ] **Step 8: Remove pause/unpause UI from `packages/client/src/admin/ControlPanel.tsx`**

Remove `const [paused, setPaused] = useState(false);`, the `togglePause()` function, and the PAUSE/UNPAUSE `<button>` element. The buttons row becomes:

```tsx
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleForfeit('team-a')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM A</button>
          <button onClick={() => handleForfeit('team-b')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM B</button>
        </div>
```

Also remove the unused `sendAdminAction` helper if it is now only used by `handleForfeit`. Actually, `sendAdminAction` is still used by `handleForfeit`, so keep it. Just remove `togglePause` and the paused state.

The updated `ControlPanelInner` function starts like this (remove `paused` state and `togglePause`):

```tsx
function ControlPanelInner({ battleId, onBack }: Props) {
  const { state, turnLog } = useBattle();
  const [npcRequests, setNpcRequests] = useState<NpcSlotRequest[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const onNpcRequest = (payload: { battleId: string; slots: NpcSlotRequest[] }) => {
      if (payload.battleId === battleId) setNpcRequests(payload.slots);
    };

    const onTurnResolve = () => setNpcRequests([]);

    socket.on('npc:action-request', onNpcRequest);
    socket.on('turn:resolve', onTurnResolve);

    return () => {
      socket.off('npc:action-request', onNpcRequest);
      socket.off('turn:resolve', onTurnResolve);
    };
  }, [battleId]);

  function sendAdminAction(type: AdminActionPayload['type'], data: Record<string, unknown>) {
    getSocket().emit('admin:action', { type, data: { battleId, ...data } });
  }

  function handleForfeit(teamId: string) {
    if (confirm(`Forfeit ${teamId}?`)) {
      sendAdminAction('forfeit', { teamId });
    }
  }

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', gap: 16, padding: 16 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>← BATTLES</button>
          <div style={{ color: '#e74c3c', fontSize: 12, letterSpacing: 2 }}>ADMIN VIEW — {battleId}</div>
        </div>
        {state && <BattleScene state={state} mySlotId="__admin__" />}
        <TurnLog messages={turnLog} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleForfeit('team-a')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM A</button>
          <button onClick={() => handleForfeit('team-b')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM B</button>
        </div>
      </div>
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <NpcTabPanel battleId={battleId} npcRequests={npcRequests} state={state} />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Simplify `packages/client/src/admin/steps/BattleSettingsStep.tsx` — remove timer input**

Replace the entire file with:

```tsx
import { useState } from 'react';

interface Props {
  onStart: (settings: { label: string }) => void;
  onBack: () => void;
}

export function BattleSettingsStep({ onStart, onBack }: Props) {
  const [label, setLabel] = useState('Battle 1');

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Battle Settings</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: '#aaa', fontSize: 12, letterSpacing: 2 }}>BATTLE NAME</label>
        <input
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 16 }}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}>← BACK</button>
        <button
          onClick={() => onStart({ label })}
          style={{ background: '#27ae60', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}
          disabled={!label.trim()}
        >
          ▶ START BATTLE
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Update `handleStart` in `packages/client/src/admin/SetupPanel.tsx`**

Change the `handleStart` function signature and remove `turnTimerSeconds` from the socket payload:

```ts
  function handleStart({ label }: { label: string }) {
    const socket = getSocket();
    const id = uuidv4();
    setBattleId(id);

    function buildSlotsWithTeams(slots: any[]) {
      return slots.map((slot: any) => {
        const teamData = slotTeams.find((st) => st.slotId === slot.slotId);
        return {
          slotId: slot.slotId,
          displayName: slot.displayName,
          isNpc: slot.type === 'npc',
          party: teamData?.team ?? [],
        };
      });
    }

    socket.emit('admin:action', {
      type: 'start-battle',
      data: {
        battleId: id,
        label,
        teams: [
          { slots: buildSlotsWithTeams(slotAssignment!.teamA) },
          { slots: buildSlotsWithTeams(slotAssignment!.teamB) },
        ],
      },
    } as any);
    setStep('started');
  }
```

- [ ] **Step 11: Remove `timerSeconds` from `makeRequest()` and `turnTimerSeconds` from state fixture in `packages/client/src/admin/__tests__/NpcTabPanel.test.tsx`**

In `makeRequest()` (around line 15), remove `timerSeconds: 60`:

```ts
const makeRequest = (slotId: string, legalTargets: string[]): ActionRequestPayload => ({
  slotId,
  validMoves: [
    { index: 0, moveId: 'surf', pp: 15, disabled: false },
    { index: 1, moveId: 'icebeam', pp: 10, disabled: false },
    { index: 2, moveId: 'blizzard', pp: 5, disabled: false },
    { index: 3, moveId: 'flash', pp: 20, disabled: false },
  ],
  legalTargets,
  canSwitch: false,
  switchTargets: [],
  canTerastallize: false,
});
```

In the `state` fixture (around line 48), remove `turnTimerSeconds: 60`.

- [ ] **Step 12: Remove `turnTimerSeconds: 60` from `makeState()` in `packages/client/src/pages/__tests__/BattlePage.test.tsx`**

In `makeState()` (around line 45), remove `turnTimerSeconds: 60`.

- [ ] **Step 13: Remove `timerSeconds: 60` from `mockRequest` in `packages/client/src/battle/__tests__/MovePanel.test.tsx`**

In `mockRequest` (around line 6), remove `timerSeconds: 60`.

- [ ] **Step 14: Run all tests across the monorepo**

```
pnpm --filter @poke-fighter/server test
pnpm --filter @poke-fighter/client test
```

Expected: all tests pass.

- [ ] **Step 15: Commit**

```
git add packages/shared/src/types/battle.ts \
        packages/server/src/setup/BattleConfigurator.ts \
        packages/server/src/socket/handlers/adminHandlers.ts \
        packages/server/src/engine/__tests__/fixtures.ts \
        packages/server/src/setup/__tests__/BattleConfigurator.test.ts \
        packages/server/src/db/__tests__/Database.test.ts \
        packages/client/src/admin/ControlPanel.tsx \
        packages/client/src/admin/steps/BattleSettingsStep.tsx \
        packages/client/src/admin/SetupPanel.tsx \
        packages/client/src/admin/__tests__/NpcTabPanel.test.tsx \
        packages/client/src/pages/__tests__/BattlePage.test.tsx \
        packages/client/src/battle/__tests__/MovePanel.test.tsx
git commit -m "feat: remove turnTimerSeconds from BattleState, strip timer from client UI and fixtures"
```
