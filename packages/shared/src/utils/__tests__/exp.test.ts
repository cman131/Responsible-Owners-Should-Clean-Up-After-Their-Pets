import { describe, it, expect } from 'vitest';
import { expForLevel } from '../exp.js';

describe('expForLevel', () => {
  it('MediumFast: level^3', () => {
    expect(expForLevel('MediumFast', 50)).toBe(125000);
  });

  it('Fast: floor(4 * level^3 / 5)', () => {
    expect(expForLevel('Fast', 50)).toBe(100000);
  });

  it('Slow: floor(5 * level^3 / 4)', () => {
    expect(expForLevel('Slow', 50)).toBe(156250);
  });

  it('Erratic applies formula for n <= 50', () => {
    const n = 50;
    expect(expForLevel('Erratic', n)).toBe(Math.floor((n ** 3) * (100 - n) / 50));
  });

  it('MediumSlow applies polynomial formula', () => {
    const n = 50;
    expect(expForLevel('MediumSlow', n)).toBe(
      Math.floor(6 * (n ** 3) / 5 - 15 * (n ** 2) + 100 * n - 140)
    );
  });

  it('Fluctuating applies formula for n <= 15', () => {
    const n = 10;
    expect(expForLevel('Fluctuating', n)).toBe(
      Math.floor((n ** 3) * (Math.floor((n + 1) / 3) + 24) / 50)
    );
  });

  it('clamps level to 100', () => {
    expect(expForLevel('MediumFast', 101)).toBe(expForLevel('MediumFast', 100));
  });

  it('level 100 MediumFast is 1000000', () => {
    expect(expForLevel('MediumFast', 100)).toBe(1000000);
  });

  it('unknown growth rate falls back to level^3', () => {
    expect(expForLevel('UnknownCurve', 10)).toBe(1000);
  });
});
