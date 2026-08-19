import type { Stats } from '@poke-fighter/shared';

type StatKey = keyof Omit<Stats, 'hp'>;

interface NatureEntry { boost: StatKey | null; drop: StatKey | null }

export const NATURES: Record<string, NatureEntry> = {
  hardy:   { boost: null,  drop: null  },
  lonely:  { boost: 'atk', drop: 'def' },
  brave:   { boost: 'atk', drop: 'spe' },
  adamant: { boost: 'atk', drop: 'spa' },
  naughty: { boost: 'atk', drop: 'spd' },
  bold:    { boost: 'def', drop: 'atk' },
  docile:  { boost: null,  drop: null  },
  relaxed: { boost: 'def', drop: 'spe' },
  impish:  { boost: 'def', drop: 'spa' },
  lax:     { boost: 'def', drop: 'spd' },
  timid:   { boost: 'spe', drop: 'atk' },
  hasty:   { boost: 'spe', drop: 'def' },
  serious: { boost: null,  drop: null  },
  jolly:   { boost: 'spe', drop: 'spa' },
  naive:   { boost: 'spe', drop: 'spd' },
  modest:  { boost: 'spa', drop: 'atk' },
  mild:    { boost: 'spa', drop: 'def' },
  quiet:   { boost: 'spa', drop: 'spe' },
  bashful: { boost: null,  drop: null  },
  rash:    { boost: 'spa', drop: 'spd' },
  calm:    { boost: 'spd', drop: 'atk' },
  gentle:  { boost: 'spd', drop: 'def' },
  sassy:   { boost: 'spd', drop: 'spe' },
  careful: { boost: 'spd', drop: 'spa' },
  quirky:  { boost: null,  drop: null  },
};

interface StatInput {
  baseStat: number;
  iv: number;
  ev: number;
  level: number;
  natureMod?: number; // 1.0 | 1.1 | 0.9
}

export function calcHp({ baseStat, iv, ev, level }: StatInput): number {
  if (baseStat === 1) return 1; // Shedinja
  const base = Math.floor(Math.floor((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100);
  return base + level + 10;
}

export function calcStat({ baseStat, iv, ev, level, natureMod = 1.0 }: StatInput): number {
  const base = Math.floor(Math.floor((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(base * natureMod);
}

export function getNatureMod(nature: string, stat: StatKey): number {
  const entry = NATURES[nature.toLowerCase()];
  if (!entry) return 1.0;
  if (entry.boost === stat) return 1.1;
  if (entry.drop === stat) return 0.9;
  return 1.0;
}

interface CalcInput {
  baseStats: Stats;
  ivs: Stats;
  evs: Stats;
  level: number;
  nature: string;
}

export function calcAllStats(input: CalcInput): Stats {
  const { baseStats, ivs, evs, level, nature } = input;
  return {
    hp:  calcHp({ baseStat: baseStats.hp, iv: ivs.hp, ev: evs.hp, level }),
    atk: calcStat({ baseStat: baseStats.atk, iv: ivs.atk, ev: evs.atk, level, natureMod: getNatureMod(nature, 'atk') }),
    def: calcStat({ baseStat: baseStats.def, iv: ivs.def, ev: evs.def, level, natureMod: getNatureMod(nature, 'def') }),
    spa: calcStat({ baseStat: baseStats.spa, iv: ivs.spa, ev: evs.spa, level, natureMod: getNatureMod(nature, 'spa') }),
    spd: calcStat({ baseStat: baseStats.spd, iv: ivs.spd, ev: evs.spd, level, natureMod: getNatureMod(nature, 'spd') }),
    spe: calcStat({ baseStat: baseStats.spe, iv: ivs.spe, ev: evs.spe, level, natureMod: getNatureMod(nature, 'spe') }),
  };
}

export function getEffectiveStat(
  statValue: number,
  boost: number,
  stat: 'atk' | 'def' | 'spa' | 'spd' | 'spe'
): number {
  // Boost table: ±1=4/3, ±2=5/3, ±3=6/3, ±4=7/3, ±5=8/3, ±6=9/3
  const clamped = Math.max(-6, Math.min(6, boost));
  const [num, den] = clamped >= 0
    ? [2 + clamped, 2]
    : [2, 2 - clamped];
  return Math.floor(statValue * num / den);
}
