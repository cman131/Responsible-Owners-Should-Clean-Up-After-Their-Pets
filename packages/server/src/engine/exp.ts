import type { PartyMember } from '@poke-fighter/shared';
import { expForLevel } from '@poke-fighter/shared';

export { expForLevel };

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
