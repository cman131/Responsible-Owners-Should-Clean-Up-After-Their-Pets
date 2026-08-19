import type { PartyMember, BattleState } from '@poke-fighter/shared';

export interface StatusMoveResult {
  statusToApply?: string;
  statBoostDeltas?: Partial<Record<string, number>>;
  heals?: boolean;
}

export function executeStatusMove(
  moveId: string,
  _user: PartyMember,
  _target: PartyMember,
  _state: BattleState,
): StatusMoveResult {
  // Status move effect dispatch — extend with specific move effects as needed
  switch (moveId) {
    case 'willowisp':    return { statusToApply: 'brn' };
    case 'thunderwave':  return { statusToApply: 'par' };
    case 'toxic':        return { statusToApply: 'tox' };
    case 'spore':
    case 'sleeppowder':  return { statusToApply: 'slp' };
    case 'swordsdance':  return { statBoostDeltas: { atk: 2 } };
    case 'nastyplot':    return { statBoostDeltas: { spa: 2 } };
    case 'calmmind':     return { statBoostDeltas: { spa: 1, spd: 1 } };
    case 'bulkup':       return { statBoostDeltas: { atk: 1, def: 1 } };
    case 'roost':        return { heals: true };
    default:             return {};
  }
}
