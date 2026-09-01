import type { BattleState, MoveAction, SwitchAction, TurnResolveEvent, SlotState, PartyMember, Stats, ActionRequestPayload } from '@poke-fighter/shared';
import { BattleEngine } from '../engine/index.js';
import { getLegalTargets } from '../engine/targeting.js';
import { calcExpYield, distributeExp, checkLevelUps, type ExpAward, type LevelUpResult } from '../engine/exp.js';
import { DataLoader } from '../data/loader.js';
import { effectiveAbilityId } from '../engine/abilities.js';

type Action = MoveAction | SwitchAction;

interface BattleRoomOptions {
  initialState: BattleState;
}

type TurnResolvedCallback = (events: TurnResolveEvent[], newState: BattleState) => void;
type BattleEndCallback = (winningTeamId: string, finalState: BattleState) => void;
type SwitchRequestCallback = (slots: SlotState[]) => void;
type NpcActionRequiredCallback = (slots: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }>) => void;
type PlayerActionRequiredCallback = (requests: Array<{ slotId: string; request: ActionRequestPayload }>) => void;

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
  private onPlayerActionRequiredCb: PlayerActionRequiredCallback | null = null;
  private readonly data = new DataLoader();
  private awaitingForcedSwitches = new Map<string, 'forced' | 'phased'>();

  constructor({ initialState }: BattleRoomOptions) {
    this.state = structuredClone(initialState);
    // Pre-populate forced switches if the initial state already has fainted active mons
    const initialSwitchSlots = this.getPendingSwitchSlots(this.state);
    if (initialSwitchSlots.length > 0) {
      this.awaitingForcedSwitches = new Map(initialSwitchSlots.map((sl) => [sl.slotId, 'forced' as const]));
    }
    // Defer NPC request emission so SocketServer can wire up onNpcActionRequired first
    setTimeout(() => {
      const npcRequests = this.buildNpcRequests();
      if (npcRequests.length > 0) this.onNpcActionRequiredCb?.(npcRequests);
      const playerRequests = this.buildPlayerRequests();
      if (playerRequests.length > 0) this.onPlayerActionRequiredCb?.(playerRequests);
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

  onPlayerActionRequired(cb: PlayerActionRequiredCallback): void { this.onPlayerActionRequiredCb = cb; }

  getPendingNpcRequests(): Array<{ slotId: string; displayName: string; request: ActionRequestPayload }> {
    return this.buildNpcRequests();
  }

  submitAction(slotId: string, action: Action): { ok: boolean; reason?: string } {
    // Handle forced switch (after faint) — must come before normal validation
    if (this.awaitingForcedSwitches.has(slotId)) {
      if (action.type !== 'switch') {
        return { ok: false, reason: 'Must submit a switch action' };
      }
      const reason = this.awaitingForcedSwitches.get(slotId)!;
      const result = this.engine.processForceSwitch(
        this.state,
        slotId,
        (action as SwitchAction).targetInstanceId,
        reason,
      );
      if (!result.events.some(e => e.type === 'pokemon-switched')) {
        return { ok: false, reason: 'Invalid switch target' };
      }
      this.awaitingForcedSwitches.delete(slotId);
      this.state = result.newState;
      try {
        this.onTurnResolvedCb?.(result.events, this.state);
      } catch (err) {
        console.error('[BattleRoom] onTurnResolvedCb (forced switch) threw:', err);
      }
      return { ok: true };
    }

    // Verify slot exists in the current state
    const slot = this.findSlot(slotId);
    if (!slot) return { ok: false, reason: 'Unknown slot' };
    if (slot.isSpectator) return { ok: false, reason: 'Spectators cannot submit actions' };

    // Choice lockup enforcement
    if (action.type === 'move') {
      const active = slot.party[slot.activePokemonIndex];
      if (active) {
        const CHOICE_ITEMS = ['choice-band', 'choice-specs', 'choice-scarf'];
        const isChoiceLocked =
          CHOICE_ITEMS.includes(active.heldItem ?? '') ||
          effectiveAbilityId(active) === 'gorilla-tactics';

        if (isChoiceLocked && active.lockedMoveId) {
          const moveSlot = active.moves[action.moveIndex];
          if (moveSlot && moveSlot.moveId !== active.lockedMoveId) {
            return { ok: false, reason: 'choice-locked' };
          }
        }
        // First move with choice item — set the lock
        if (isChoiceLocked && !active.lockedMoveId) {
          const moveSlot = active.moves[action.moveIndex];
          if (moveSlot) active.lockedMoveId = moveSlot.moveId;
        }
      }
    }

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
    const hasIngrain = active.volatileStatus.some(v => v.name === 'ingrain');
    return {
      slotId: slot.slotId,
      validMoves: this.buildValidMoves(slotId, active),
      canSwitch: !hasIngrain && slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
      switchTargets: hasIngrain ? [] : slot.party
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
      this.awaitingForcedSwitches = new Map(switchSlots.map((sl) => [sl.slotId, 'forced' as const]));
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

  private buildValidMoves(slotId: string, active: PartyMember): ActionRequestPayload['validMoves'] {
    const disableEntry = active.volatileStatus.find(v => v.name === 'disable');
    const tauntActive = active.volatileStatus.some(v => v.name === 'taunt');
    const encoreEntry = active.volatileStatus.find(v => v.name === 'encore');
    const tormentActive = active.volatileStatus.some(v => v.name === 'torment');

    return active.moves.map((m, i) => {
      const moveData = this.data.getMove(m.moveId);
      if (!moveData) console.warn(`[BattleRoom] Unknown moveId "${m.moveId}" — defaulting targetType to 'normal'`);
      const targetType = moveData?.target ?? 'normal';

      let disabled = false;
      if (m.currentPp === 0) disabled = true;
      if (disableEntry?.moveId === m.moveId) disabled = true;
      if (tauntActive && moveData?.category === 'status') disabled = true;
      if (encoreEntry && encoreEntry.moveId && m.moveId !== encoreEntry.moveId) disabled = true;
      if (tormentActive && active.lastMoveId === m.moveId) disabled = true;
      // Disable non-locked moves when choice-locked
      if (active.lockedMoveId && m.moveId !== active.lockedMoveId) disabled = true;
      // Disable status moves with Assault Vest
      if (active.heldItem === 'assault-vest' && moveData?.category === 'status') disabled = true;

      return {
        index: i as 0 | 1 | 2 | 3,
        moveId: m.moveId,
        pp: m.currentPp,
        disabled,
        targetType,
        legalTargets: getLegalTargets(this.state, slotId, targetType),
      };
    });
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
            validMoves: this.buildValidMoves(slot.slotId, active),
            canSwitch: false,
            switchTargets: [],
            canTerastallize: !active.hasTerastallized && !!active.teraType,
          },
        });
      }
    }
    return result;
  }

  private buildPlayerRequests(): Array<{ slotId: string; request: ActionRequestPayload }> {
    const result: Array<{ slotId: string; request: ActionRequestPayload }> = [];
    for (const team of this.state.teams) {
      for (const slot of team.slots) {
        if (slot.isNpc || slot.isSpectator) continue;
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        const hasIngrain = active.volatileStatus.some(v => v.name === 'ingrain');
        result.push({
          slotId: slot.slotId,
          request: {
            slotId: slot.slotId,
            validMoves: this.buildValidMoves(slot.slotId, active),
            canSwitch: !hasIngrain && slot.party.some((p, i) => i !== slot.activePokemonIndex && !p.fainted),
            switchTargets: hasIngrain ? [] : slot.party
              .filter((p, i) => i !== slot.activePokemonIndex && !p.fainted)
              .map((p) => p.instanceId),
            canTerastallize: !active.hasTerastallized && !!active.teraType,
          },
        });
      }
    }
    return result;
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
      this.awaitingForcedSwitches = new Map(switchSlots.map((s) => [s.slotId, 'forced' as const]));
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
      const playerRequests = this.buildPlayerRequests();
      if (playerRequests.length > 0) {
        this.onPlayerActionRequiredCb?.(playerRequests);
      }
    }
  }
}
