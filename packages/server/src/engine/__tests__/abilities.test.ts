import { describe, it, expect, vi, afterEach } from 'vitest';
import { canApplyStatus } from '../status.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('onStatusImmunity — canApplyStatus routing', () => {
  it('Limber blocks par', () => {
    expect(canApplyStatus({ status: 'par', types: [], currentStatus: undefined, ability: 'limber' })).toBe(false);
  });
  it('Limber allows brn', () => {
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'limber' })).toBe(true);
  });
  it('Immunity blocks psn', () => {
    expect(canApplyStatus({ status: 'psn', types: [], currentStatus: undefined, ability: 'immunity' })).toBe(false);
  });
  it('Immunity blocks tox', () => {
    expect(canApplyStatus({ status: 'tox', types: [], currentStatus: undefined, ability: 'immunity' })).toBe(false);
  });
  it('Magma Armor blocks frz', () => {
    expect(canApplyStatus({ status: 'frz', types: [], currentStatus: undefined, ability: 'magma-armor' })).toBe(false);
  });
  it('Water Veil blocks brn', () => {
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'water-veil' })).toBe(false);
  });
  it('Insomnia blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'insomnia' })).toBe(false);
  });
  it('Vital Spirit blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'vital-spirit' })).toBe(false);
  });
  it('Sweet Veil blocks slp', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'sweet-veil' })).toBe(false);
  });
  it('Comatose blocks all status', () => {
    expect(canApplyStatus({ status: 'slp', types: [], currentStatus: undefined, ability: 'comatose' })).toBe(false);
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'comatose' })).toBe(false);
  });
  it('Leaf Guard blocks status in sun', () => {
    const battle = { field: { weather: { type: 'sun', turnsRemaining: 3, fromAbility: true } } } as any;
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'leaf-guard', battle })).toBe(false);
  });
  it('Leaf Guard allows status outside sun', () => {
    const battle = { field: {} } as any;
    expect(canApplyStatus({ status: 'brn', types: [], currentStatus: undefined, ability: 'leaf-guard', battle })).toBe(true);
  });
  it('old hardcoded limber entry is gone (no regression)', () => {
    // After refactor, limber still blocks par — routed through hook
    expect(canApplyStatus({ status: 'par', types: ['Electric'], currentStatus: undefined, ability: 'limber' })).toBe(false);
  });
});
