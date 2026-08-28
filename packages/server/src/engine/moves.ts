export interface StatusMoveResult {
  statusToApply?: string;
  volatileToApply?: string;
  volatileCounter?: number;
  statBoostDeltas?: Partial<Record<string, number>>;
  heals?: boolean;
  targetsSelf?: boolean;
}

export function executeStatusMove(moveId: string): StatusMoveResult {
  switch (moveId) {
    case 'willowisp':   return { statusToApply: 'brn', targetsSelf: false };
    case 'thunderwave': return { statusToApply: 'par', targetsSelf: false };
    case 'toxic':       return { statusToApply: 'tox', targetsSelf: false };
    case 'spore':
    case 'sleeppowder': return { statusToApply: 'slp', targetsSelf: false };
    case 'swordsdance': return { statBoostDeltas: { atk: 2 }, targetsSelf: true };
    case 'nastyplot':   return { statBoostDeltas: { spa: 2 }, targetsSelf: true };
    case 'calmmind':    return { statBoostDeltas: { spa: 1, spd: 1 }, targetsSelf: true };
    case 'bulkup':      return { statBoostDeltas: { atk: 1, def: 1 }, targetsSelf: true };
    case 'roost':       return { heals: true, targetsSelf: true };
    case 'yawn':        return { volatileToApply: 'yawn', volatileCounter: 2, targetsSelf: false };
    case 'confuseray':
    case 'supersonic':
    case 'sweetkiss':   return { volatileToApply: 'confusion', targetsSelf: false };
    case 'leechseed':   return { volatileToApply: 'leech-seed', targetsSelf: false };
    default:            return {};
  }
}
