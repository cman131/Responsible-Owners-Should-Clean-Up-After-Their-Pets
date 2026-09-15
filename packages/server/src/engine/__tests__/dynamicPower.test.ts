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
});
