import type { StatusCondition, StatBoosts } from './battle.js';

export type StatName = keyof StatBoosts;

export type Secondary =
  | { kind: 'status';      status: StatusCondition; chance: number; target: 'target' | 'user' }
  | { kind: 'stat';        stat: StatName; stages: number; chance: number; target: 'target' | 'user' }
  | { kind: 'flinch';      chance: number }
  | { kind: 'confusion';   chance: number; target: 'target' | 'user' }
  | { kind: 'drain';       fraction: [number, number] }
  | { kind: 'recoil';      fraction: [number, number] }
  | { kind: 'recoil-hp';   fraction: [number, number] }
  | { kind: 'multihit';    hits: number | [number, number] }
  | { kind: 'ohko' }
  | { kind: 'selfdestruct'; variant: 'normal' | 'memento' | 'healingwish' }
  | { kind: 'charge';      chargeVolatile: string }
  | { kind: 'recharge' }
  | { kind: 'clear-hazards-self' }
  | { kind: 'break-screens'; screensOnly: boolean }
  | { kind: 'pivot' };
