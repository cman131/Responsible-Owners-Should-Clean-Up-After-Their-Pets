import { describe, it, expect } from 'vitest';
import { canApplyStatus, getBurnDamage, PARALYSIS_SPEED_MOD } from '../status.js';
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

