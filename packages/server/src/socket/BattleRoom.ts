import type { BattleState, MoveAction, SwitchAction, TurnResolveEvent, SlotState, PartyMember, Stats, ActionRequestPayload } from '@poke-fighter/shared';
import { BattleEngine } from '../engine/index.js';
import { calcExpYield, distributeExp, checkLevelUps, type ExpAward, type LevelUpResult } from '../engine/exp.js';
import { DataLoader } from '../data/loader.js';

type Action = MoveAction | SwitchAction;

interface BattleRoomOptions {
  initialState: BattleState;
  timerSeconds: number;
}

type TurnResolvedCallback = (events: TurnResolveEvent[], newState: BattleState) => void;
type BattleEndCallback = (winningTeamId: string, finalState: BattleState) => void;
type SwitchRequestCallback = (slots: SlotState[]) => void;
type NpcActionRequiredCallback = (slots: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }>) => void;

export class BattleRoom {
  private state: BattleState;
  private readonly engine = new BattleEngine();
  private readonly pendingActions = new Map<string, Action>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timerSeconds: number;
  private onTurnResolvedCb: TurnResolvedCallback | null = null;
  private onBattleEndCb: BattleEndCallback | null = null;
  private onSwitchRequestCb: SwitchRequestCallback | null = null;
  private onExpAwardCb: ((awards: ExpAward[]) => void) | null = null;
  private onLevelUpCb: ((result: LevelUpResult, newStats: Stats) => void) | null = null;
  private onNpcActionRequiredCb: NpcActionRequiredCallback | null = null;
  private readonly data = new DataLoader();
  private awaitingForcedSwitches = new Set<string>();
  private paused = false;

  constructor({ initialState, timerSeconds }: BattleRoomOptions) {
    this.state = structuredClone(initialState);
    this.timerSeconds = timerSeconds;
    this.startTimer();
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

  getPendingActionRequest(slotId: string): ActionRequestPayload | null {
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
      timerSeconds: this.timerSeconds,
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
    if (!mon || mon.fainted) return; // already fainted — no-op

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

    // Check for pending switches (mon with living replacements)
    const switchSlots = this.getPendingSwitchSlots(s);
    if (switchSlots.length > 0) {
      this.awaitingForcedSwitches = new Set(switchSlots.map((sl) => sl.slotId));
      try {
        this.onSwitchRequestCb?.(switchSlots);
      } catch (err) {
        console.error('[BattleRoom] forceFaint onSwitchRequestCb threw:', err);
      }
      return; // timer starts when forced switches are submitted
    }

    // Check for battle end
    const winner = this.checkWinner(s);
    if (winner !== null) {
      if (this.timer) clearTimeout(this.timer);
      s.phase = 'ended';
      s.winner = winner;
      this.state = s;
      const winningTeamId = s.teams[winner]?.teamId ?? '';
      try {
        this.onBattleEndCb?.(winningTeamId, s);
      } catch (err) {
        console.error('[BattleRoom] forceFaint onBattleEndCb threw:', err);
      }
    } else {
      this.startTimer();
    }
  }

  forfeit(teamId: string): void {
    if (this.timer) clearTimeout(this.timer);
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
        else slot.isSpectator = true; // no remaining pokemon
      }
    }
    return pending;
  }

  private processExpFromEvents(events: TurnResolveEvent[], newState: BattleState): void {
    for (const event of events) {
      if (event.type !== 'faint') continue;
      const faintedInstanceId = event.data['instanceId'];
      if (typeof faintedInstanceId !== 'string') continue;

      // Find the fainted team index
      const faintedTeamIdx = newState.teams.findIndex((t) =>
        t.slots.some((s) => s.party.some((p) => p.instanceId === faintedInstanceId))
      );
      if (faintedTeamIdx === -1) continue;

      // Find fainted mon
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

      // Winning team is the other team
      const winningTeamIdx = faintedTeamIdx === 0 ? 1 : 0;
      const recipients = newState.teams[winningTeamIdx]?.slots.flatMap((s) => s.party) ?? [];

      const awards = distributeExp({ expYield, recipients });

      // Apply exp and check level-ups
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
            timerSeconds: this.timerSeconds,
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
    if (this.timer) clearTimeout(this.timer);

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
      const npcRequests = this.buildNpcRequests();
      if (npcRequests.length > 0) {
        this.onNpcActionRequiredCb?.(npcRequests);
      }
    }
  }
}
