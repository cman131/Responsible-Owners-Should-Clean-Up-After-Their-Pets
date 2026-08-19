import type { BattleState, MoveAction, SwitchAction, TurnResolveEvent, SlotState } from '@poke-fighter/shared';
import { BattleEngine } from '../engine/index.js';

type Action = MoveAction | SwitchAction;

interface BattleRoomOptions {
  initialState: BattleState;
  timerSeconds: number;
}

type TurnResolvedCallback = (events: TurnResolveEvent[], newState: BattleState) => void;
type BattleEndCallback = (winningTeamId: string, finalState: BattleState) => void;

export class BattleRoom {
  private state: BattleState;
  private readonly engine = new BattleEngine();
  private readonly pendingActions = new Map<string, Action>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timerSeconds: number;
  private onTurnResolvedCb: TurnResolvedCallback | null = null;
  private onBattleEndCb: BattleEndCallback | null = null;
  private paused = false;

  constructor({ initialState, timerSeconds }: BattleRoomOptions) {
    this.state = initialState;
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

  submitAction(slotId: string, action: Action): { ok: boolean; reason?: string } {
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

    this.onTurnResolvedCb?.(events, newState);

    if (newState.phase === 'ended' && newState.winner !== undefined) {
      const winningTeam = newState.teams[newState.winner];
      this.onBattleEndCb?.(winningTeam?.teamId ?? '', newState);
    } else {
      this.startTimer();
    }
  }
}
