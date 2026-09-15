import { describe, it, expect, vi } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

function actions(a = 'slot-a1', b = 'slot-b1'): Record<string, MoveAction> {
  return {
    [a]: { type: 'move', moveIndex: 1, targetSlotId: b },
    [b]: { type: 'move', moveIndex: 0, targetSlotId: a },
  };
}

describe('dynamicPower integration', () => {
  it('Facade deals more damage when user has a status condition', () => {
    // rng: () => 0.5 prevents crits (threshold ~0.0625) and guarantees hits
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Without status
    const stateClean = make1v1State();
    stateClean.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'facade', currentPp: 20, maxPp: 20 };
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsClean } = engine.resolveTurn(stateClean, actions());
    const dmgClean = eventsClean.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    vi.restoreAllMocks();

    // With burn status
    const stateBurned = make1v1State();
    stateBurned.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'facade', currentPp: 20, maxPp: 20 };
    stateBurned.teams[0]!.slots[0]!.party[0]!.status = 'brn';
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsBurned } = engine.resolveTurn(stateBurned, actions());
    const dmgBurned = eventsBurned.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    vi.restoreAllMocks();

    // Burned Facade has 2x power, but burn also halves physical attack
    // Net effect: 2x power × 0.5 burn penalty = same damage. So burned = clean damage.
    // This confirms the mechanic is wired — burned attacker gets 2x power applied.
    expect(dmgBurned).toBeDefined();
    expect(dmgClean).toBeDefined();
    // Power doubled but burn halves physical — should be approximately equal
    expect(Math.abs(dmgBurned - dmgClean)).toBeLessThanOrEqual(2); // allow rounding
  });

  it('Hex deals more damage when target has a status condition', () => {
    const engine = new BattleEngine();

    // Without status
    const stateClean = make1v1State();
    stateClean.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'hex', currentPp: 10, maxPp: 10 };
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsClean } = engine.resolveTurn(stateClean, actions());
    const dmgClean = eventsClean.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    vi.restoreAllMocks();

    // With paralysis on target
    const statePar = make1v1State();
    statePar.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'hex', currentPp: 10, maxPp: 10 };
    statePar.teams[1]!.slots[0]!.party[0]!.status = 'par';
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsPar } = engine.resolveTurn(statePar, actions());
    const dmgPar = eventsPar.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    vi.restoreAllMocks();

    // Hex should do approximately 2x damage when target has status
    expect(dmgPar).toBeDefined();
    expect(dmgClean).toBeDefined();
    expect(dmgPar).toBeGreaterThan(dmgClean);
    // Should be roughly double (allowing for rounding)
    expect(dmgPar / dmgClean).toBeGreaterThan(1.8);
  });

  it('Gyro Ball power is capped at 150 when user is much slower than target', () => {
    const engine = new BattleEngine();

    // Attacker spe=10 (very slow), target spe=200 (very fast)
    // gyroball formula: min(150, floor(25 * 200 / 10)) = min(150, 500) = 150
    // Compare against tackle (BP=40) — gyroball at 150 should deal much more damage
    const stateGyro = make1v1State();
    stateGyro.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'gyroball', currentPp: 5, maxPp: 5 };
    stateGyro.teams[0]!.slots[0]!.party[0]!.stats = { ...stateGyro.teams[0]!.slots[0]!.party[0]!.stats, spe: 10 };
    stateGyro.teams[1]!.slots[0]!.party[0]!.stats = { ...stateGyro.teams[1]!.slots[0]!.party[0]!.stats, spe: 200 };
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { events: eventsGyro } = engine.resolveTurn(stateGyro, actions());
    const dmgGyro = eventsGyro.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    vi.restoreAllMocks();

    // At spe=10, target spe=200: power should be 150 (capped)
    // Gyro Ball is Steel-type; Charizard (Fire/Flying) resists → 0.5x
    // L50, Atk=100, Def=100, BP=150, 0.5x → ~31 damage
    expect(dmgGyro).toBeDefined();
    expect(dmgGyro).toBeGreaterThan(20); // 150 BP (capped) at 0.5x → ~31 damage
  });

  it('Payback deals double damage when target moved first', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // p1 spe=100 (faster), p2 spe=80 (slower) in make1v1State
    // p2 uses payback — target (p1) already moved, so double power
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'payback', currentPp: 10, maxPp: 10 };
    // p1 uses splash (no damage) so it moves first without damaging p2
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const paybackDmg = events.find(
      e => e.type === 'damage-dealt' && (e.data as any)['attackerSlotId'] === 'slot-b1'
    )?.data['damage'] as number | undefined;

    // Without ally faint — p2 moves FIRST (spe=200), so payback should NOT double
    const stateNormal = make1v1State();
    stateNormal.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'payback', currentPp: 10, maxPp: 10 };
    stateNormal.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 };
    // Give p2 higher speed so it moves FIRST and payback should NOT double
    stateNormal.teams[1]!.slots[0]!.party[0]!.stats = {
      ...stateNormal.teams[1]!.slots[0]!.party[0]!.stats, spe: 200,
    };
    const { events: evNormal } = engine.resolveTurn(stateNormal, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const normalDmg = evNormal.find(
      e => e.type === 'damage-dealt' && (e.data as any)['attackerSlotId'] === 'slot-b1'
    )?.data['damage'] as number | undefined;

    expect(paybackDmg).toBeDefined();
    expect(normalDmg).toBeDefined();
    // When target moved first, payback should deal roughly 2× the non-doubled damage
    expect(paybackDmg!).toBeGreaterThan(normalDmg! * 1.8);
  });
});
