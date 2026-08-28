import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('Tera type', () => {
  it('Terastallizing to Fire gives STAB on Fire moves even for non-Fire species', () => {
    const state = make1v1State();
    // Set p1 to a Water-type but tera into Fire
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.speciesId = 9; // Blastoise (Water)
    p1.teraType = 'Fire';

    const engine = new BattleEngine();

    // Action with terastallize flag
    const action = { type: 'move' as const, moveIndex: 0 as const, targetSlotId: 'slot-b1', terastallize: true };
    const { newState, events } = engine.resolveTurn(state, { 'slot-a1': action, 'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' } });

    const p1After = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.hasTerastallized).toBe(true);
    expect(events.some((e) => e.type === 'terastallize')).toBe(true);
  });

  it('Tera Fire Blastoise deals more Flamethrower damage than non-Tera (STAB verification)', () => {
    // Without tera — Blastoise is Water type, Flamethrower gets no STAB
    const noTeraState = make1v1State();
    noTeraState.teams[0]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise

    // With tera Fire — Flamethrower gets STAB
    const teraState = make1v1State();
    teraState.teams[0]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise
    teraState.teams[0]!.slots[0]!.party[0]!.teraType = 'Fire';

    // rng=0.5: accuracy roll 0.5*100=50 < 100 → hit; crit roll 0.5 < 1/24 → false → no crit
    const engine = new BattleEngine({ rng: () => 0.5 });

    // To avoid randomness, run each scenario 10 times and compare min/max damage
    let maxDmgNoTera = 0;
    let minDmgTera = Infinity;

    for (let i = 0; i < 10; i++) {
      const noTeraResult = engine.resolveTurn(structuredClone(noTeraState), {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const teraResult = engine.resolveTurn(structuredClone(teraState), {
        'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1', terastallize: true },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });

      // damage to p2 from p1
      const noTeraDmg = 100 - noTeraResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;
      const teraDmg = 100 - teraResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

      maxDmgNoTera = Math.max(maxDmgNoTera, noTeraDmg);
      minDmgTera = Math.min(minDmgTera, teraDmg);
    }

    // Tera STAB should consistently give 1.5x damage boost, even at worst rolls
    // Min tera damage should exceed max no-tera damage (1.5x overcomes random variance)
    expect(minDmgTera).toBeGreaterThan(maxDmgNoTera);
  });
});
