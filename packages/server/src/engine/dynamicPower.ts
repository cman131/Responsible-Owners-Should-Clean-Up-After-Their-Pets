interface MoveInput {
  id: string;
  effectId?: string;
  basePower: number;
  currentPp?: number;      // for trumpcard: PP remaining in the move slot
}

interface MonInput {
  stats: { atk: number; def: number; spa: number; spd: number; spe: number };
  statBoosts: { atk: number; def: number; spa: number; spd: number; spe: number; accuracy: number; evasion: number };
  currentHp: number;
  maxHp: number;
  status?: string;
  heldItem?: string;
  volatileStatus: unknown[];
  level: number;
  friendship?: number;
  weightkg?: number;
  movedThisTurn?: boolean;      // true if this Pokémon already moved this turn (payback/avalanche)
  tookDamageThisTurn?: boolean; // true if this Pokémon took HP damage earlier this turn (assurance)
  fasterThanTarget?: boolean;   // true if attacker moves before target (boltbeak/fishiousrend)
}

interface FieldInput {
  weather?: unknown;
  terrain?: unknown;
  trickroom: number;
  gravity: number;
  sideConditions: unknown[];
  allyFaintedTeamIndex?: number; // 0 or 1 — team that had a faint last turn (retaliate)
  attackerTeamIndex?: number;    // 0 or 1 — the attacker's team index (retaliate)
}

function sumPositiveStages(boosts: MonInput['statBoosts']): number {
  return (
    Math.max(0, boosts.atk) +
    Math.max(0, boosts.def) +
    Math.max(0, boosts.spa) +
    Math.max(0, boosts.spd) +
    Math.max(0, boosts.spe)
  );
}

function hpRatioAttackerPower(ratio: number): number {
  if (ratio > 0.50) return 20;
  if (ratio > 0.35) return 40;
  if (ratio > 0.20) return 80;
  if (ratio > 0.10) return 100;
  if (ratio > 0.04) return 150;
  return 200;
}

function weightPower(w: number): number {
  if (w >= 200) return 120;
  if (w >= 100) return 100;
  if (w >= 50) return 80;
  if (w >= 25) return 60;
  if (w >= 10) return 40;
  return 20;
}

type PowerResolver = (move: MoveInput, attacker: MonInput, target: MonInput, field: FieldInput) => number;

const resolvers: Record<string, PowerResolver> = {
  facade: (move, attacker) =>
    attacker.status ? move.basePower * 2 : move.basePower,

  hex: (move, _attacker, target) =>
    target.status ? move.basePower * 2 : move.basePower,

  venoshock: (move, _attacker, target) =>
    target.status === 'psn' || target.status === 'tox' ? move.basePower * 2 : move.basePower,

  brine: (move, _attacker, target) =>
    target.currentHp / target.maxHp <= 0.5 ? move.basePower * 2 : move.basePower,

  smellingsalts: (move, _attacker, target) =>
    target.status === 'par' ? move.basePower * 2 : move.basePower,

  wakeupslap: (move, _attacker, target) =>
    target.status === 'slp' ? move.basePower * 2 : move.basePower,

  storedpower: (_move, attacker) =>
    20 + 20 * sumPositiveStages(attacker.statBoosts),

  punishment: (_move, _attacker, target) =>
    Math.min(200, 60 + 20 * sumPositiveStages(target.statBoosts)),

  flail: (_move, attacker) =>
    hpRatioAttackerPower(attacker.currentHp / attacker.maxHp),

  reversal: (_move, attacker) =>
    hpRatioAttackerPower(attacker.currentHp / attacker.maxHp),

  wringout: (_move, _attacker, target) =>
    Math.max(1, Math.floor(120 * target.currentHp / target.maxHp)),

  crushgrip: (_move, _attacker, target) =>
    Math.max(1, Math.floor(120 * target.currentHp / target.maxHp)),

  hardpress: (_move, _attacker, target) =>
    Math.max(1, Math.floor(120 * target.currentHp / target.maxHp)),

  gyroball: (_move, attacker, target) =>
    Math.min(150, Math.floor(25 * target.stats.spe / Math.max(1, attacker.stats.spe))),

  electroball: (_move, attacker, target) => {
    const ratio = attacker.stats.spe / Math.max(1, target.stats.spe);
    if (ratio >= 4) return 150;
    if (ratio >= 3) return 120;
    if (ratio >= 2) return 80;
    if (ratio >= 1) return 60;
    return 40;
  },

  acrobatics: (move, attacker) =>
    !attacker.heldItem ? move.basePower * 2 : move.basePower,

  lowkick: (_move, _attacker, target) =>
    weightPower(target.weightkg ?? 0),

  grassknot: (_move, _attacker, target) =>
    weightPower(target.weightkg ?? 0),

  heavyslam: (_move, attacker, target) => {
    const attackerW = attacker.weightkg ?? 1;
    const targetW = target.weightkg ?? 1;
    const ratio = attackerW / Math.max(1, targetW);
    if (ratio >= 5) return 120;
    if (ratio >= 4) return 100;
    if (ratio >= 3) return 80;
    if (ratio >= 2) return 60;
    return 40;
  },

  heatcrash: (_move, attacker, target) => {
    const attackerW = attacker.weightkg ?? 1;
    const targetW = target.weightkg ?? 1;
    const ratio = attackerW / Math.max(1, targetW);
    if (ratio >= 5) return 120;
    if (ratio >= 4) return 100;
    if (ratio >= 3) return 80;
    if (ratio >= 2) return 60;
    return 40;
  },

  return: (_move, attacker) =>
    Math.max(1, Math.floor((attacker.friendship ?? 70) * 2 / 5)),

  frustration: (_move, attacker) =>
    Math.max(1, Math.floor((255 - (attacker.friendship ?? 70)) * 2 / 5)),

  payback: (move, _attacker, target) =>
    target.movedThisTurn ? move.basePower * 2 : move.basePower,

  avalanche: (move, _attacker, target) =>
    target.movedThisTurn ? move.basePower * 2 : move.basePower,

  assurance: (move, _attacker, target) =>
    target.tookDamageThisTurn ? move.basePower * 2 : move.basePower,

  retaliate: (move, _attacker, _target, field) =>
    field.allyFaintedTeamIndex !== undefined && field.allyFaintedTeamIndex === field.attackerTeamIndex
      ? move.basePower * 2 : move.basePower,

  // TODO: needs consecutive-use counters
  echoedvoice: (move) => move.basePower,
  rollout: (move) => move.basePower,
  iceball: (move) => move.basePower,
};

export function resolvePower(
  move: MoveInput,
  attacker: MonInput,
  target: MonInput,
  field: FieldInput
): number {
  const effectId = move.effectId ?? move.id;
  const resolver = resolvers[effectId];
  if (!resolver) return move.basePower;
  return resolver(move, attacker, target, field);
}
