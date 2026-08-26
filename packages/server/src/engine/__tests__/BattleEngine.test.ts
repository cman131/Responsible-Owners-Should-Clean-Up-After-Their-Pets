import { describe, it, expect, vi } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { MoveAction, SwitchAction } from '@poke-fighter/shared';

describe('BattleEngine.resolveTurn', () => {
  it('deals damage when a damaging move is used', () => {
    const state = make1v1State();
    const engine = new BattleEngine();

    const actions: Record<string, MoveAction | SwitchAction> = {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    };

    const { newState, events } = engine.resolveTurn(state, actions);

    expect(events.some((e) => e.type === 'move-used')).toBe(true);
    expect(events.some((e) => e.type === 'damage-dealt')).toBe(true);

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p1.currentHp).toBeLessThan(100);
    expect(p2.currentHp).toBeLessThan(100);
  });

  it('faster pokemon moves first (higher spe)', () => {
    const state = make1v1State(); // p1 spe=100, p2 spe=80
    const engine = new BattleEngine();

    const { events: resolvedEvents } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const moveEvents = resolvedEvents.filter((e) => e.type === 'move-used');
    expect(moveEvents[0]!.data['attackerSlotId']).toBe('slot-a1'); // faster acts first
  });

  it('includes attackerName in move-used event', () => {
    const state = make1v1State();
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const moveUsed = events.find(
      (e) => e.type === 'move-used' && e.data['attackerSlotId'] === 'slot-a1'
    );
    expect(moveUsed).toBeDefined();
    expect(moveUsed!.data['attackerName']).toBe('Charizard');
  });

  it('detects win condition when all party faint', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some((e) => e.type === 'faint')).toBe(true);
    expect(newState.phase).toBe('ended');
    expect(newState.winner).toBe(0); // team A wins
  });
});

describe('Status moves', () => {
  it('Swords Dance raises the user attack by 2 stages', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.atk).toBe(2);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('Will-O-Wisp applies burn to the target', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    // Give p2 a Water type so it can be burned (not Fire type)
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise (Water)
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.status).toBe('brn');
    expect(events.some(e => e.type === 'status-applied')).toBe(true);
  });
});

describe('Secondary effects from damaging moves', () => {
  it('Flamethrower can apply burn on a successful roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces secondary roll to succeed
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise (Water, not immune to burn)
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.status).toBe('brn');
    vi.restoreAllMocks();
  });

  it('secondary burn does not apply to a Fire-type target', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    // p2 stays as Charizard (Fire type) — immune to burn
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.status).toBeUndefined();
    vi.restoreAllMocks();
  });
});

describe('Intimidate on switch-in', () => {
  it('lowers the opposing active pokemon attack by 1 when an Intimidate user switches in', () => {
    const state = make1v1State();
    // Add a second party member with Intimidate that switches in
    const intimidateMon = makePokemon({ instanceId: 'intimidate-mon', ability: 'intimidate' });
    state.teams[0]!.slots[0]!.party.push(intimidateMon);
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'intimidate-mon' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.atk).toBe(-1);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });
});

describe('Sleep prevents moving', () => {
  it('a sleeping pokemon cannot use its move', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.status = 'slp';
    p1.volatileStatus = [{ name: 'sleep', counter: 2 }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // p2 should have taken no damage (p1 was asleep and couldn't attack)
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(100);
  });
});
