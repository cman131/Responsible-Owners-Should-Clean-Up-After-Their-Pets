import { describe, it, expect } from 'vitest';
import { canApplyStatus, tickStatus, getBurnDamage, PARALYSIS_SPEED_MOD } from '../status.js';
import type { PartyMember } from '@poke-fighter/shared';

describe('canApplyStatus', () => {
  it('cannot apply burn to Fire type', () => {
    expect(canApplyStatus({ status: 'brn', types: ['Fire'], currentStatus: undefined, ability: 'blaze' })).toBe(false);
  });

  it('cannot apply paralysis to Electric type', () => {
    expect(canApplyStatus({ status: 'par', types: ['Electric'], currentStatus: undefined, ability: '' })).toBe(false);
  });

  it('cannot apply status if already statused', () => {
    expect(canApplyStatus({ status: 'brn', types: ['Water'], currentStatus: 'par', ability: '' })).toBe(false);
  });

  it('can apply burn to non-Fire type without existing status', () => {
    expect(canApplyStatus({ status: 'brn', types: ['Water'], currentStatus: undefined, ability: '' })).toBe(true);
  });
});

describe('getBurnDamage', () => {
  it('deals 1/16 of max HP rounded down, min 1', () => {
    expect(getBurnDamage(160)).toBe(10);
    expect(getBurnDamage(100)).toBe(6);
    expect(getBurnDamage(1)).toBe(1); // minimum 1
  });
});

describe('PARALYSIS_SPEED_MOD', () => {
  it('is 0.5', () => {
    expect(PARALYSIS_SPEED_MOD).toBe(0.5);
  });
});

describe('tickStatus for sleep', () => {
  it('returns cured: true when sleep volatile entry counter is 0', () => {
    const result = tickStatus('slp', 100, { name: 'sleep', counter: 0 });
    expect(result.cured).toBe(true);
  });

  it('returns cured: false when sleep counter is greater than 0', () => {
    const result = tickStatus('slp', 100, { name: 'sleep', counter: 2 });
    expect(result.cured).toBe(false);
  });

  it('returns cured: true when no volatile entry is provided', () => {
    const result = tickStatus('slp', 100, undefined);
    expect(result.cured).toBe(true);
  });
});

describe('tickStatus for toxic', () => {
  it('deals escalating damage based on the counter in the volatile entry', () => {
    const r1 = tickStatus('tox', 160, { name: 'toxic', counter: 1 });
    const r3 = tickStatus('tox', 160, { name: 'toxic', counter: 3 });
    expect(r1.hpDelta).toBe(-10); // floor(160 * 1/16) = 10
    expect(r3.hpDelta).toBe(-30); // floor(160 * 3/16) = 30
  });
});
