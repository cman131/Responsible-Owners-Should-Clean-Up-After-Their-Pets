import type { PartyMember, PokemonType, TurnResolveEvent } from '@poke-fighter/shared';

export function applyTransform(
  user: PartyMember,
  userSlotId: string,
  target: PartyMember,
  targetTypes: PokemonType[],
): TurnResolveEvent[] {
  const alreadyTransformed = user.volatileStatus.some(v => v.name === 'transformed');

  // Snapshot the true original form once per stint, before the first transform.
  if (!alreadyTransformed) {
    user.originalForm = {
      stats: { ...user.stats },
      ability: user.ability,
      moves: user.moves.map(slot => ({ ...slot })) as [any, any, any, any],
      ...(user.typeOverride ? { typeOverride: [...user.typeOverride] } : {}),
    };
  }

  // Copy stats (not HP)
  user.stats = { ...target.stats, hp: user.stats.hp };

  // Copy stat boosts
  user.statBoosts = { ...target.statBoosts };

  // Copy ability
  user.ability = target.ability;

  // Copy effective types
  if (targetTypes.length > 0) {
    user.typeOverride = [...targetTypes];
  } else {
    delete user.typeOverride;
  }

  // Copy moves with PP capped at 5
  user.moves = target.moves.map(slot => ({
    moveId: slot.moveId,
    currentPp: Math.min(slot.currentPp, 5),
    maxPp: 5,
  })) as [any, any, any, any];

  if (!alreadyTransformed) {
    user.volatileStatus.push({ name: 'transformed' });
  }

  return [{ type: 'volatile-applied', data: { targetSlotId: userSlotId, volatile: 'transformed' } }];
}
