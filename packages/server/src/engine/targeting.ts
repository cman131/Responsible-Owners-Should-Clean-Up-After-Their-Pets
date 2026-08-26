import type { BattleState, MoveTarget, TeamState, SlotState } from '@poke-fighter/shared';

function nonSpectatorSlots(team: TeamState): SlotState[] {
  return team.slots.filter((s) => !s.isSpectator);
}

function isAdjacent(attackerIdx: number, targetIdx: number): boolean {
  return Math.abs(attackerIdx - targetIdx) <= 1;
}

export function getLegalTargets(
  state: BattleState,
  attackerSlotId: string,
  target: MoveTarget
): string[] {
  const attackerTeamIdx = state.teams.findIndex((t) =>
    t.slots.some((s) => s.slotId === attackerSlotId)
  );
  if (attackerTeamIdx === -1) return [];

  const foeTeamIdx = attackerTeamIdx === 0 ? 1 : 0;
  const allyTeam = state.teams[attackerTeamIdx]!;
  const foeTeam = state.teams[foeTeamIdx];

  const allySlots = nonSpectatorSlots(allyTeam);
  const foeSlots = foeTeam ? nonSpectatorSlots(foeTeam) : [];
  const attackerIdx = allySlots.findIndex((s) => s.slotId === attackerSlotId);

  const isLiving = (s: SlotState) => !s.party[s.activePokemonIndex]?.fainted;
  const isLivingAlly = (s: SlotState) => s.slotId !== attackerSlotId && isLiving(s);

  const allLivingFoes = () => foeSlots.filter(isLiving).map((s) => s.slotId);
  const allLivingAllies = () => allySlots.filter(isLivingAlly).map((s) => s.slotId);
  const adjacentLivingFoes = () =>
    foeSlots.filter((s, i) => isLiving(s) && isAdjacent(attackerIdx, i)).map((s) => s.slotId);
  const adjacentLivingAllies = () =>
    allySlots.filter((s, i) => isLivingAlly(s) && isAdjacent(attackerIdx, i)).map((s) => s.slotId);

  switch (target) {
    case 'normal':
    case 'adjacentFoe':
    case 'randomNormal':
      return adjacentLivingFoes();
    case 'self':
      return [attackerSlotId];
    case 'allAdjacentFoes':
    case 'foeSide':
      return allLivingFoes();
    case 'adjacentAlly':
      return adjacentLivingAllies();
    case 'adjacentAllyOrSelf':
      return [attackerSlotId, ...adjacentLivingAllies()];
    case 'allAdjacent':
      return [...adjacentLivingFoes(), ...adjacentLivingAllies()];
    case 'any':
      return [attackerSlotId, ...allLivingFoes(), ...allLivingAllies()];
    case 'allies':
      return allLivingAllies();
    case 'allyTeam':
    case 'allySide':
    case 'all':
    case 'scripted':
      return [attackerSlotId];
    default:
      return adjacentLivingFoes();
  }
}
