import type { PartyMember } from '@poke-fighter/shared';

interface ExpYieldInput {
  baseExpYield: number;
  level: number;
}

export interface ExpAward {
  instanceId: string;
  amount: number;
  newTotal: number;
}

export function calcExpYield({ baseExpYield, level }: ExpYieldInput): number {
  return Math.max(1, Math.floor((baseExpYield * level) / 7));
}

interface DistributeInput {
  expYield: number;
  recipients: PartyMember[];
}

export function distributeExp({ expYield, recipients }: DistributeInput): ExpAward[] {
  return recipients
    .filter((mon) => !mon.fainted)
    .map((mon) => ({
      instanceId: mon.instanceId,
      amount: expYield,
      newTotal: mon.expTotal + expYield,
    }));
}

const EXP_TABLES: Record<string, (level: number) => number> = {
  Erratic: (n) => {
    if (n <= 50) return Math.floor((n ** 3) * (100 - n) / 50);
    if (n <= 68) return Math.floor((n ** 3) * (150 - n) / 100);
    if (n <= 98) return Math.floor((n ** 3) * Math.floor((1911 - 10 * n) / 3) / 500);
    return Math.floor((n ** 3) * (160 - n) / 100);
  },
  Fast: (n) => Math.floor(4 * (n ** 3) / 5),
  MediumFast: (n) => n ** 3,
  MediumSlow: (n) => Math.floor(6 * (n ** 3) / 5 - 15 * (n ** 2) + 100 * n - 140),
  Slow: (n) => Math.floor(5 * (n ** 3) / 4),
  Fluctuating: (n) => {
    if (n <= 15) return Math.floor((n ** 3) * (Math.floor((n + 1) / 3) + 24) / 50);
    if (n <= 35) return Math.floor((n ** 3) * (n + 14) / 50);
    return Math.floor((n ** 3) * (Math.floor(n / 2) + 32) / 50);
  },
};

export function expForLevel(growth: string, level: number): number {
  const fn = EXP_TABLES[growth];
  if (!fn) return level ** 3;
  return fn(Math.min(100, Math.max(1, level)));
}

export interface LevelUpResult {
  instanceId: string;
  newLevel: number;
}

export function checkLevelUps(
  mon: PartyMember,
  newExpTotal: number,
  growth: string
): LevelUpResult | null {
  let level = mon.level;
  while (level < 100 && newExpTotal >= expForLevel(growth, level + 1)) {
    level++;
  }
  if (level > mon.level) return { instanceId: mon.instanceId, newLevel: level };
  return null;
}
