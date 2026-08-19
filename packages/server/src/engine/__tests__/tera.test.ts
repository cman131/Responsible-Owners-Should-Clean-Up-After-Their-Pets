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
});
