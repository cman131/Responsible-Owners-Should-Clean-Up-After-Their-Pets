import type { PartyMember, PokemonCondition, PokemonHealth } from '@poke-fighter/shared';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function captureCondition(
  member: PartyMember,
  savedMoveIds: readonly string[],
  previous?: PokemonCondition,
): PokemonCondition {
  // A transformed Pokémon's own moves live in originalForm
  const moves = member.originalForm?.moves ?? member.moves;
  const ppUsed: Record<string, number> = {};
  for (const moveId of savedMoveIds) {
    if (!moveId) {
      continue;
    }
    const slot = moves.find((m) => m.moveId === moveId);
    ppUsed[moveId] = slot ? Math.max(0, slot.maxPp - slot.currentPp) : previous?.ppUsed[moveId] ?? 0;
  }

  const fainted = member.fainted || member.currentHp <= 0;
  const condition: PokemonCondition = {
    currentHp: fainted ? 0 : Math.min(member.currentHp, member.maxHp),
    maxHp: member.maxHp,
    ppUsed,
  };
  if (!fainted && member.status !== undefined && member.status !== 'fnt') {
    condition.status = member.status;
    if (member.status === 'slp') {
      condition.sleepTurns = member.volatileStatus.find((v) => v.name === 'sleep')?.counter ?? 0;
    }
  }
  return condition;
}

function scaleHp(condition: PokemonCondition, maxHp: number): number {
  if (condition.currentHp <= 0) {
    return 0;
  }
  if (condition.maxHp === maxHp) {
    return clamp(condition.currentHp, 1, maxHp);
  }
  return clamp(Math.floor((condition.currentHp * maxHp) / condition.maxHp), 1, maxHp);
}

/** Mutates a freshly built PartyMember. */
export function applyCondition(member: PartyMember, condition: PokemonCondition): void {
  member.currentHp = scaleHp(condition, member.maxHp);
  member.fainted = member.currentHp === 0;
  for (const slot of member.moves) {
    slot.currentPp = clamp(slot.maxPp - (condition.ppUsed[slot.moveId] ?? 0), 0, slot.maxPp);
  }
  if (member.fainted || condition.status === undefined) {
    return;
  }
  member.status = condition.status;
  if (condition.status === 'slp') {
    member.volatileStatus.push({ name: 'sleep', counter: condition.sleepTurns ?? 0 });
  }
}

export function toHealth(pokemonId: string, member: PartyMember): PokemonHealth {
  const health: PokemonHealth = {
    pokemonId,
    currentHp: member.currentHp,
    maxHp: member.maxHp,
    moves: member.moves.filter((m) => m.moveId !== '').map((m) => ({ ...m })),
  };
  if (member.status !== undefined) {
    health.status = member.status;
  }
  return health;
}
