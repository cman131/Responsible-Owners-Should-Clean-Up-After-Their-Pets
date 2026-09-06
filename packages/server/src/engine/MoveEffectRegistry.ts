import type {
  BattleState, PartyMember, Move, PokemonType, TurnResolveEvent,
} from '@poke-fighter/shared';

export interface MoveContext {
  battle: BattleState;
  user: PartyMember;
  userSlotId: string;
  userTeamIndex: number;
  userTypes: PokemonType[];  // pre-resolved by BattleEngine
  targets: PartyMember[];
  targetSlotIds: string[];
  targetTypes: PokemonType[][];  // parallel to targets; pre-resolved by BattleEngine
  move: Move;
  rng: () => number;
  executeSubMove?: (moveId: string, depth?: number, attackerSlotId?: string, targetSlotId?: string) => TurnResolveEvent[];
}

export interface MoveEffectOutput {
  events: TurnResolveEvent[];
  pivotSwitch?: boolean;
  forceSwitch?: { targetSlotId: string; targetInstanceId: string };
}

export type MoveEffectHandler = (ctx: MoveContext) => MoveEffectOutput;

export class MoveEffectRegistry {
  private readonly map = new Map<string, MoveEffectHandler>();

  register(effectId: string, handler: MoveEffectHandler): void {
    this.map.set(effectId, handler);
  }

  get(effectId: string): MoveEffectHandler | undefined {
    return this.map.get(effectId);
  }
}
