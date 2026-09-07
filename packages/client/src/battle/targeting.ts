import type { MoveTarget, BattleState } from '@poke-fighter/shared';

export type TargetMode = 'choose' | 'listed' | 'labeled' | 'auto';

export function classifyTarget(targetType: MoveTarget): TargetMode {
  switch (targetType) {
    case 'normal':
    case 'any':
    case 'adjacentFoe':
    case 'adjacentAlly':
    case 'adjacentAllyOrSelf':
      return 'choose';
    case 'allAdjacentFoes':
    case 'allAdjacent':
    case 'allies':
      return 'listed';
    case 'all':
    case 'allyTeam':
    case 'allySide':
    case 'foeSide':
    case 'randomNormal':
      return 'labeled';
    case 'self':
    case 'scripted':
      return 'auto';
  }
}

export function getTargetLabel(targetType: MoveTarget): string {
  switch (targetType) {
    case 'all': return 'All';
    case 'allyTeam': return 'Ally team';
    case 'allySide': return 'Ally side';
    case 'foeSide': return 'Foe side';
    case 'randomNormal': return 'Random';
    default: return '';
  }
}

export function getSlotDisplayName(state: BattleState, slotId: string): string {
  for (const team of state.teams) {
    const slot = team.slots.find((s) => s.slotId === slotId);
    if (slot) return slot.displayName;
  }
  return slotId;
}

export function formatTargetNames(legalTargets: string[], state: BattleState): string {
  const names = legalTargets.slice(0, 3).map((id) => getSlotDisplayName(state, id));
  const suffix = legalTargets.length > 3 ? '…' : '';
  return names.join(', ') + suffix;
}

export function sortLegalTargets(
  targets: string[],
  selfSlotId: string,
  state: BattleState,
): string[] {
  const allyTeamIdx = state.teams.findIndex((t) =>
    t.slots.some((s) => s.slotId === selfSlotId),
  );

  const enemies: string[] = [];
  const allies: string[] = [];
  const self: string[] = [];
  const unresolved: string[] = [];

  for (const targetId of targets) {
    if (targetId === selfSlotId) {
      self.push(targetId);
    } else if (
      allyTeamIdx !== -1 &&
      state.teams[allyTeamIdx]!.slots.some((s) => s.slotId === targetId)
    ) {
      allies.push(targetId);
    } else if (state.teams.some((t) => t.slots.some((s) => s.slotId === targetId))) {
      enemies.push(targetId);
    } else {
      unresolved.push(targetId);
    }
  }

  return [...enemies, ...allies, ...self, ...unresolved];
}
