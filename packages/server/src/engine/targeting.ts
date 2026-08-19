import type { BattleState, MoveTarget } from '@poke-fighter/shared';

export function getLegalTargets(
  state: BattleState,
  attackerSlotId: string,
  target: MoveTarget
): string[] {
  const attackerTeamIdx = state.teams.findIndex((t) =>
    t.slots.some((s) => s.slotId === attackerSlotId)
  );
  const foeTeamIdx = attackerTeamIdx === 0 ? 1 : 0;
  const allyTeam = state.teams[attackerTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];

  const livingFoeSlots = () =>
    (foeTeam?.slots ?? [])
      .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId);

  const livingAllySlots = () =>
    (allyTeam?.slots ?? [])
      .filter((s) => s.slotId !== attackerSlotId && !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId);

  switch (target) {
    case 'normal':
    case 'randomNormal':
      return livingFoeSlots();
    case 'self':
      return [attackerSlotId];
    case 'allAdjacentFoes':
    case 'foeSide':
      return livingFoeSlots();
    case 'adjacentAlly':
      return livingAllySlots();
    case 'allAdjacent':
      return [...livingFoeSlots(), ...livingAllySlots()];
    case 'allySide':
    case 'all':
    case 'scripted':
      return [attackerSlotId]; // field effects — handled specially
    default:
      return livingFoeSlots();
  }
}
