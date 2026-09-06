import type { TurnResolveEvent } from '@poke-fighter/shared';
import type { MoveContext } from './MoveEffectRegistry.js';

export function executeSubMove(
  moveId: string,
  ctx: MoveContext,
  depth = 0,
  attackerSlotId?: string,
  targetSlotId?: string,
): TurnResolveEvent[] {
  return ctx.executeSubMove?.(moveId, depth, attackerSlotId, targetSlotId) ?? [];
}
