import type { BattleState, MoveAction, SwitchAction, TurnResolveEvent, SlotState } from '@poke-fighter/shared';
import { BattleEngine } from '../engine/index.js';

type Action = MoveAction | SwitchAction;

interface BattleRoomOptions {
  initialState: BattleState;
  timerSeconds: number;
}

type TurnResolvedCallback = (events: TurnResolveEvent[], newState: BattleState) => void;
type BattleEndCallback = (winningTeamId: string, finalState: BattleState) => void;
type SwitchRequestCallback = (slots: SlotState[]) => void;

export class BattleRoom {
  private state: BattleState;
  private readonly engine = new BattleEngine();
  private readonly pendingActions = new Map<string, Action>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timerSeconds: number;
  private onTurnResolvedCb: TurnResolvedCallback | null = null;
  private onBattleEndCb: BattleEndCallback | null = null;
  private onSwitchRequestCb: SwitchRequestCallback | null = null;
  private awaitingForcedSwitches = new Set<string>();
  private paused = false;

  constructor({ initialState, timerSeconds }: BattleRoomOptions) {
    this.state = structuredClone(initialState);
    this.timerSeconds = timerSeconds;
    this.startTimer();
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

  submitAction(slotId: string, action: Action): { ok: boolean; reason?: string } {
    // Handle forced switch (after faint) — must come before normal validation
    if (this.awaitingForcedSwitches.has(slotId)) {
      if (action.type !== 'switch') {
        return { ok: false, reason: 'Must submit a switch action' };
      }
      this.awaitingForcedSwitches.delete(slotId);
      const s = structuredClone(this.state);
      let switched = false;
      // Find and update slot in cloned state
      for (const team of s.teams) {
        const slot = team.slots.find((sl) => sl.slotId === slotId);
        if (!slot) continue;
        const newIndex = slot.party.findIndex((p) => p.instanceId === (action as SwitchAction).targetInstanceId);
        if (newIndex === -1 || slot.party[newIndex]?.fainted) {
          // Invalid target — reject and restore awaiting state
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
      if (this.awaitingForcedSwitches.size === 0) {
        this.startTimer();
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

  pause(): void {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
  }

  unpause(): void {
    this.paused = false;
    this.startTimer();
  }

  getStateSnapshot(): BattleState {
    return structuredClone(this.state);
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
        else slot.isSpectator = true; // no remaining pokemon
      }
    }
    return pending;
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

  private startTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.paused) return;

    this.timer = setTimeout(() => {
      // Auto-submit for slots that haven't submitted
      for (const slotId of this.activeSlotsNeedingAction()) {
        if (!this.pendingActions.has(slotId)) {
          this.pendingActions.set(slotId, { type: 'move', moveIndex: 0 });
        }
      }
      this.resolveTurn();
    }, this.timerSeconds * 1000);
  }

  private resolveTurn(): void {
    if (this.timer) clearTimeout(this.timer);

    const actions = Object.fromEntries(this.pendingActions);
    this.pendingActions.clear();

    const { newState, events } = this.engine.resolveTurn(this.state, actions);
    this.state = newState;

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
      return; // Don't start timer until forced switches are submitted
    }

    if (newState.phase === 'ended' && newState.winner !== undefined) {
      const winningTeam = newState.teams[newState.winner];
      try {
        this.onBattleEndCb?.(winningTeam?.teamId ?? '', newState);
      } catch (err) {
        console.error('[BattleRoom] onBattleEnd callback threw:', err);
      }
    } else {
      this.startTimer();
    }
  }
}
