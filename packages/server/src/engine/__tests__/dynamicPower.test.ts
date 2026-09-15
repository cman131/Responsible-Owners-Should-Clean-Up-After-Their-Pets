import { describe, it, expect } from 'vitest';
import { resolvePower } from '../dynamicPower.js';

// minimal stubs
const mon = (overrides: Record<string, unknown> = {}) => ({
  stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  currentHp: 100, maxHp: 100,
  volatileStatus: [], level: 50,
  ...overrides,
});

const move = (id: string, basePower = 0) => ({ id, effectId: id, basePower, type: 'Normal', category: 'physical' });

const field = () => ({ weather: undefined, terrain: undefined, trickroom: 0, gravity: 0, sideConditions: [{}, {}] });

describe('resolvePower', () => {
  it('returns basePower for unregistered effectId', () => {
    expect(resolvePower(move('tackle', 40), mon(), mon(), field())).toBe(40);
  });

  it('facade: doubles when user has status', () => {
    expect(resolvePower(move('facade', 70), mon({ status: 'brn' }), mon(), field())).toBe(140);
    expect(resolvePower(move('facade', 70), mon(), mon(), field())).toBe(70);
  });

  it('hex: doubles when target has status', () => {
    expect(resolvePower(move('hex', 65), mon(), mon({ status: 'par' }), field())).toBe(130);
    expect(resolvePower(move('hex', 65), mon(), mon(), field())).toBe(65);
  });

  it('flail: 200 at ≤4% HP', () => {
    const low = mon({ currentHp: 2, maxHp: 100 });
    expect(resolvePower(move('flail', 0), low, mon(), field())).toBe(200);
  });

  it('gyroball: capped at 150', () => {
    const fast = mon({ stats: { spe: 200 } as any });
    const slow = mon({ stats: { spe: 10 } as any });
    expect(resolvePower(move('gyroball', 0), slow, fast, field())).toBe(150);
  });

  it('storedpower: 20 + 20 per stage', () => {
    const boosted = mon({ statBoosts: { atk: 2, def: 1, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } });
    expect(resolvePower(move('storedpower', 20), boosted, mon(), field())).toBe(80); // 20 + 3*20
  });

  it('acrobatics: doubled without item', () => {
    expect(resolvePower(move('acrobatics', 55), mon({ heldItem: undefined }), mon(), field())).toBe(110);
    expect(resolvePower(move('acrobatics', 55), mon({ heldItem: 'oran-berry' }), mon(), field())).toBe(55);
  });

  it('payback: doubles (60→120) when target already moved this turn', () => {
    expect(resolvePower(move('payback', 60), mon(), mon({ movedThisTurn: true }), field())).toBe(120);
    expect(resolvePower(move('payback', 60), mon(), mon({ movedThisTurn: false }), field())).toBe(60);
  });

  it('avalanche: doubles (60→120) when target already moved this turn', () => {
    expect(resolvePower(move('avalanche', 60), mon(), mon({ movedThisTurn: true }), field())).toBe(120);
    expect(resolvePower(move('avalanche', 60), mon(), mon({ movedThisTurn: false }), field())).toBe(60);
  });

  it('assurance: doubles (60→120) when target took damage earlier this turn', () => {
    expect(resolvePower(move('assurance', 60), mon(), mon({ tookDamageThisTurn: true }), field())).toBe(120);
    expect(resolvePower(move('assurance', 60), mon(), mon({ tookDamageThisTurn: false }), field())).toBe(60);
  });

  it('retaliate: doubles (70→140) when ally fainted last turn on attacker team', () => {
    const attacker = mon();
    const fieldWithFaint = { ...field(), allyFaintedTeamIndex: 0, attackerTeamIndex: 0 };
    expect(resolvePower(move('retaliate', 70), attacker, mon(), fieldWithFaint)).toBe(140);

    const fieldNoFaint = { ...field(), allyFaintedTeamIndex: undefined, attackerTeamIndex: 0 };
    expect(resolvePower(move('retaliate', 70), attacker, mon(), fieldNoFaint)).toBe(70);

    // ally fainted on opposite team — should NOT double
    const fieldWrongTeam = { ...field(), allyFaintedTeamIndex: 1, attackerTeamIndex: 0 };
    expect(resolvePower(move('retaliate', 70), attacker, mon(), fieldWrongTeam)).toBe(70);
  });

  it('echoedvoice: scales 40/80/120/160/200 based on echoedvoice-active counter', () => {
    const vs = (n: number) => mon({ volatileStatus: [{ name: 'echoedvoice-active', counter: n }] });
    const m = move('echoedvoice', 40);
    expect(resolvePower(m, vs(1), mon(), field())).toBe(40);
    expect(resolvePower(m, vs(2), mon(), field())).toBe(80);
    expect(resolvePower(m, vs(3), mon(), field())).toBe(120);
    expect(resolvePower(m, vs(4), mon(), field())).toBe(160);
    expect(resolvePower(m, vs(5), mon(), field())).toBe(200);
    // No volatile → first use → base power
    expect(resolvePower(m, mon(), mon(), field())).toBe(40);
  });

  it('rollout: doubles power each hit (30/60/120/240/480)', () => {
    const vs = (n: number) => mon({ volatileStatus: [{ name: 'rollout-active', counter: n }] });
    const m = move('rollout', 30);
    expect(resolvePower(m, vs(1), mon(), field())).toBe(30);
    expect(resolvePower(m, vs(2), mon(), field())).toBe(60);
    expect(resolvePower(m, vs(3), mon(), field())).toBe(120);
    expect(resolvePower(m, vs(4), mon(), field())).toBe(240);
    expect(resolvePower(m, vs(5), mon(), field())).toBe(480);
    expect(resolvePower(m, mon(), mon(), field())).toBe(30); // no volatile → first hit
  });

  it('iceball: same scaling as rollout (30/60/120/240/480)', () => {
    const vs = (n: number) => mon({ volatileStatus: [{ name: 'iceball-active', counter: n }] });
    const m = move('iceball', 30);
    expect(resolvePower(m, vs(3), mon(), field())).toBe(120);
  });

  it('trumpcard: 200/80/60/50/40 based on remaining PP', () => {
    const mk = (pp: number) => ({ id: 'trumpcard', effectId: 'trumpcard', basePower: 0, currentPp: pp });
    expect(resolvePower(mk(1), mon(), mon(), field())).toBe(200);
    expect(resolvePower(mk(2), mon(), mon(), field())).toBe(80);
    expect(resolvePower(mk(3), mon(), mon(), field())).toBe(60);
    expect(resolvePower(mk(4), mon(), mon(), field())).toBe(50);
    expect(resolvePower(mk(5), mon(), mon(), field())).toBe(40);
  });

  it('boltbeak: doubles (85→170) when attacker is faster than target', () => {
    expect(resolvePower(move('boltbeak', 85), mon({ fasterThanTarget: true }), mon(), field())).toBe(170);
    expect(resolvePower(move('boltbeak', 85), mon({ fasterThanTarget: false }), mon(), field())).toBe(85);
  });

  it('fishiousrend: doubles (85→170) when attacker is faster than target', () => {
    expect(resolvePower(move('fishiousrend', 85), mon({ fasterThanTarget: true }), mon(), field())).toBe(170);
    expect(resolvePower(move('fishiousrend', 85), mon({ fasterThanTarget: false }), mon(), field())).toBe(85);
  });
});
