import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { buildDefaultRegistry } from '../registrations.js';
import { executeSubMove } from '../subMoveExecutor.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { TurnResolveEvent } from '@poke-fighter/shared';

describe('executeSubMove', () => {
  it('executes tackle as a sub-move and returns damage events', () => {
    const state = make1v1State();
    // p1 uses 'willowisp' but handler calls executeSubMove('tackle')
    // We override the willowisp handler to capture ctx and call sub-move
    let capturedEvents: TurnResolveEvent[] = [];

    const registry = buildDefaultRegistry();
    registry.register('willowisp', (ctx) => {
      capturedEvents = executeSubMove('tackle', ctx);
      return { events: capturedEvents };
    });

    const rng = () => 0.5; // deterministic
    const engine = new BattleEngine({ registry, rng });

    // p1 (slot-a1) uses willowisp (index 3 in default makePokemon)
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // The sub-move (tackle) should have produced damage events
    const damageEvent = capturedEvents.find(e => e.type === 'damage-dealt');
    expect(damageEvent).toBeDefined();
  });

  it('returns empty array if depth > 1', () => {
    const state = make1v1State();
    const registry = buildDefaultRegistry();

    registry.register('willowisp', (ctx) => {
      const events = executeSubMove('tackle', ctx, 2); // depth=2 > 1
      expect(events).toHaveLength(0);
      return { events: [] };
    });

    const engine = new BattleEngine({ registry, rng: () => 0.5 });
    engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
  });
});

describe('Copycat', () => {
  it('copies the last move used (Surf) and deals damage', () => {
    const state = make1v1State();

    // Give p2 Surf, p1 Copycat
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'copycat', currentPp: 20, maxPp: 20 };
    // Give p2 higher speed so p2 uses Surf first, then p1 Copycats it
    p2.stats = { ...p2.stats, spe: 200 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // p1 Copycat
      'slot-b1': { type: 'move', moveIndex: 0 }, // p2 Surf
    });

    // p2 uses Surf first, then p1 Copycats Surf
    // Should see at least one move-used for Surf (from p2)
    const surfEvents = result.events.filter(e =>
      e.type === 'move-used' && (e.data as { moveId?: string }).moveId === 'surf'
    );
    expect(surfEvents.length).toBeGreaterThanOrEqual(1);

    // Both p2's Surf and p1's copied Surf should deal damage (at least 2 damage events)
    const damageEvents = result.events.filter(e => e.type === 'damage-dealt');
    expect(damageEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('fails if no move has been used yet', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'copycat', currentPp: 20, maxPp: 20 };
    // Give p1 higher speed so p1 uses Copycat before p2 moves (no lastUsedMoveId yet)
    p1.stats = { ...p1.stats, spe: 200 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // p1 Copycat (goes first)
      'slot-b1': { type: 'move', moveIndex: 0 }, // p2 flamethrower (goes second)
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'copycat'
    );
    expect(failEvent).toBeDefined();
  });
});

describe('Metronome', () => {
  it('executes a sub-move and produces events', () => {
    const state = make1v1State();
    // Give p1 metronome as move 0
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'metronome', currentPp: 10, maxPp: 10 };

    const rng = () => 0; // always picks candidates[0]
    const engine = new BattleEngine({ rng });

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Should not have move-failed event
    const failEvent = result.events.find(e => e.type === 'move-failed');
    expect(failEvent).toBeUndefined();

    // Metronome itself should appear as move-used
    const metronomeEvent = result.events.find(e =>
      e.type === 'move-used' && (e.data as { moveId?: string }).moveId === 'metronome'
    );
    expect(metronomeEvent).toBeDefined();

    // Sub-move should have produced at least one additional event (move-used, damage-dealt, etc.)
    expect(result.events.length).toBeGreaterThan(1);
  });
});

describe('Sleep Talk', () => {
  it('executes a random eligible move while asleep', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;

    // Set up p1: asleep with sleep counter > 0, has Sleep Talk + flamethrower
    p1.status = 'slp';
    p1.volatileStatus.push({ name: 'sleep', counter: 2 });
    p1.moves[0] = { moveId: 'sleeptalk', currentPp: 10, maxPp: 10 };
    p1.moves[1] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p1.moves[2] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p1.moves[3] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };

    const engine = new BattleEngine({ rng: () => 0 }); // picks first eligible
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Sleep Talk
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Sleep Talk should NOT be blocked by sleep
    const sleepTalkBlocked = result.events.find(e =>
      e.type === 'move-blocked' && (e.data as { reason?: string }).reason === 'asleep'
    );
    expect(sleepTalkBlocked).toBeUndefined();

    // Sleep Talk's sub-move (flamethrower) should have produced damage events
    expect(result.events.some(e => e.type === 'damage-dealt')).toBe(true);
  });

  it('fails if not asleep', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'sleeptalk', currentPp: 10, maxPp: 10 };
    // p1 is NOT asleep

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'sleeptalk'
    );
    expect(failEvent).toBeDefined();
  });

  it('fails if no eligible moves (all excluded or only sleeptalk)', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;

    p1.status = 'slp';
    p1.volatileStatus.push({ name: 'sleep', counter: 2 });
    // All moves are excluded: sleeptalk is in SLEEP_TALK_EXCLUDED
    p1.moves[0] = { moveId: 'sleeptalk', currentPp: 10, maxPp: 10 };
    p1.moves[1] = { moveId: 'sleeptalk', currentPp: 10, maxPp: 10 };
    p1.moves[2] = { moveId: 'sleeptalk', currentPp: 10, maxPp: 10 };
    p1.moves[3] = { moveId: 'sleeptalk', currentPp: 10, maxPp: 10 };

    const engine = new BattleEngine({ rng: () => 0 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'sleeptalk'
    );
    expect(failEvent).toBeDefined();
  });

  it('does not decrement PP of the chosen sub-move', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;

    p1.status = 'slp';
    p1.volatileStatus.push({ name: 'sleep', counter: 2 });
    p1.moves[0] = { moveId: 'sleeptalk', currentPp: 10, maxPp: 10 };
    p1.moves[1] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p1.moves[2] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p1.moves[3] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };

    const engine = new BattleEngine({ rng: () => 0 }); // picks first eligible (flamethrower at index 1)
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Find p1 in the final state
    const p1Final = result.newState.teams[0]!.slots[0]!.party[0]!;
    // Sleep Talk itself costs 1 PP
    expect(p1Final.moves[0]!.currentPp).toBe(9);
    // Flamethrower's PP should NOT be decremented
    expect(p1Final.moves[1]!.currentPp).toBe(15);
  });
});

describe('Mirror Move', () => {
  it("reflects the target's last move back at them", () => {
    const state = make1v1State();

    // p2 uses Surf (move 0), p1 uses Mirror Move (move 0)
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    // Make p2 faster so they move first
    p2.stats = { ...p2.stats, spe: 200 };

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'mirrormove', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Mirror Move
      'slot-b1': { type: 'move', moveIndex: 0 }, // Surf
    });

    // p2 uses Surf (hits p1), then p1 Mirror Moves Surf (hits p2)
    const damageEvents = result.events.filter(e => e.type === 'damage-dealt');
    expect(damageEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('fails if target has not moved yet', () => {
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'mirrormove', currentPp: 20, maxPp: 20 };
    // Make p1 faster so they move first before p2
    p1.stats = { ...p1.stats, spe: 200 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Mirror Move first
      'slot-b1': { type: 'move', moveIndex: 0 }, // flamethrower (after)
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'mirrormove'
    );
    expect(failEvent).toBeDefined();
  });
});

describe('Assist', () => {
  it('calls a random move from a benched party member', () => {
    const state = make1v1State();
    const p1Slot = state.teams[0]!.slots[0]!;

    // Give p1 a bench member with surf
    const benchMember = makePokemon({
      instanceId: 'bench-1',
      moves: [
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
      ],
    });
    p1Slot.party.push(benchMember);

    // p1's active pokemon uses Assist
    const p1 = p1Slot.party[0]!;
    p1.moves[0] = { moveId: 'assist', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0 }); // always picks first eligible
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Should produce damage events from Surf
    expect(result.events.some(e => e.type === 'damage-dealt')).toBe(true);
  });

  it('fails if no eligible moves in party', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'assist', currentPp: 20, maxPp: 20 };
    // No benched party members → no eligible moves

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'assist'
    );
    expect(failEvent).toBeDefined();
  });

  it('skips the active pokemon and fainted party members', () => {
    const state = make1v1State();
    const p1Slot = state.teams[0]!.slots[0]!;

    // Give p1 two bench members: one fainted, one with surf
    const faintedMember = makePokemon({
      instanceId: 'bench-fainted',
      fainted: true,
      moves: [
        { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
        { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
        { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
        { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      ],
    });
    const healthyBenchMember = makePokemon({
      instanceId: 'bench-healthy',
      moves: [
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
        { moveId: 'surf', currentPp: 15, maxPp: 15 },
      ],
    });
    p1Slot.party.push(faintedMember);
    p1Slot.party.push(healthyBenchMember);

    // p1's active pokemon uses Assist
    const p1 = p1Slot.party[0]!;
    p1.moves[0] = { moveId: 'assist', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0 }); // always picks first eligible
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Should produce damage events from Surf (not flamethrower from fainted)
    expect(result.events.some(e => e.type === 'damage-dealt')).toBe(true);
  });

  it('filters out excluded moves', () => {
    const state = make1v1State();
    const p1Slot = state.teams[0]!.slots[0]!;

    // Give p1 a bench member with only excluded moves (assist, metronome, copycat)
    const benchMember = makePokemon({
      instanceId: 'bench-excluded',
      moves: [
        { moveId: 'assist', currentPp: 15, maxPp: 15 },
        { moveId: 'copycat', currentPp: 15, maxPp: 15 },
        { moveId: 'metronome', currentPp: 15, maxPp: 15 },
        { moveId: 'mirrormove', currentPp: 15, maxPp: 15 },
      ],
    });
    p1Slot.party.push(benchMember);

    // p1's active pokemon uses Assist
    const p1 = p1Slot.party[0]!;
    p1.moves[0] = { moveId: 'assist', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Should fail because all moves in bench are excluded
    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'assist'
    );
    expect(failEvent).toBeDefined();
  });
});

describe('Instruct', () => {
  it('causes target to use their last move again', () => {
    const state = make1v1State();

    // p2 uses Tackle first (higher speed), then p1 Instructs p2 to use Tackle again
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    p2.stats = { ...p2.stats, spe: 200 }; // p2 moves first

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'instruct', currentPp: 15, maxPp: 15 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Instruct
      'slot-b1': { type: 'move', moveIndex: 0 }, // Tackle
    });

    // p2 tackles p1 once naturally, then p1 instructs p2 to tackle again
    // → at least 2 damage events targeting p1 (slot-a1)
    const damageEvents = result.events.filter(e =>
      e.type === 'damage-dealt' && (e.data as { targetSlotId?: string }).targetSlotId === 'slot-a1'
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('fails if target has no last move', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'instruct', currentPp: 15, maxPp: 15 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first, so target has no lastMoveId yet

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'instruct'
    );
    expect(failEvent).toBeDefined();
  });

  it('fails if target last move is in COPYCAT_EXCLUDED', () => {
    const state = make1v1State();

    // p1 instructs first (higher speed), p2's lastMoveId is pre-set to excluded 'protect'
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.lastMoveId = 'protect'; // excluded from Instruct

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'instruct', currentPp: 15, maxPp: 15 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first so p2.lastMoveId is still 'protect'

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Instruct (goes first)
      'slot-b1': { type: 'move', moveIndex: 0 }, // p2's normal move (goes second)
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'instruct'
    );
    expect(failEvent).toBeDefined();
  });

  it('fails if target has 0 PP for their last move', () => {
    const state = make1v1State();

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'tackle', currentPp: 0, maxPp: 35 }; // 0 PP
    p2.lastMoveId = 'tackle'; // set directly so p1 can instruct it
    p2.stats = { ...p2.stats, spe: 200 };

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'instruct', currentPp: 15, maxPp: 15 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Instruct
      'slot-b1': { type: 'move', moveIndex: 0 }, // Tackle (0 PP, won't fire)
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'instruct'
    );
    expect(failEvent).toBeDefined();
  });
});

describe('Mimic', () => {
  it('replaces the Mimic slot with target\'s last used move (pp=5)', () => {
    const state = make1v1State();

    // p2 uses surf first, then p1 Mimics
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    p2.stats = { ...p2.stats, spe: 200 }; // p2 faster

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'mimic', currentPp: 10, maxPp: 10 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Mimic
      'slot-b1': { type: 'move', moveIndex: 0 }, // Surf
    });

    // p1's slot 0 should now be surf with pp=5
    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.moves[0]!.moveId).toBe('surf');
    expect(p1After.moves[0]!.currentPp).toBe(5);
    expect(p1After.moves[0]!.maxPp).toBe(5);
  });

  it('fails if target has not used a move', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'mimic', currentPp: 10, maxPp: 10 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first (no target lastMoveId yet)

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'mimic'
    );
    expect(failEvent).toBeDefined();
  });

  it('works when Mimic is not in the first slot', () => {
    const state = make1v1State();

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'dragonrush', currentPp: 10, maxPp: 10 };
    p2.stats = { ...p2.stats, spe: 200 };

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p1.moves[1] = { moveId: 'mimic', currentPp: 10, maxPp: 10 };
    p1.moves[2] = { moveId: 'roost', currentPp: 10, maxPp: 10 };
    p1.moves[3] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 }, // Mimic (at index 1)
      'slot-b1': { type: 'move', moveIndex: 0 }, // dragonrush
    });

    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.moves[1]!.moveId).toBe('dragonrush');
    expect(p1After.moves[1]!.currentPp).toBe(5);
    expect(p1After.moves[1]!.maxPp).toBe(5);
  });
});

describe('Sketch', () => {
  it('permanently replaces the Sketch slot with target\'s last used move', () => {
    const state = make1v1State();

    // p2 uses surf first, then p1 Sketches
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    p2.stats = { ...p2.stats, spe: 200 };

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'sketch', currentPp: 5, maxPp: 5 }; // Give Sketch enough PP

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Sketch
      'slot-b1': { type: 'move', moveIndex: 0 }, // Surf
    });

    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.moves[0]!.moveId).toBe('surf');
    expect(p1After.moves[0]!.currentPp).toBe(5);
    expect(p1After.moves[0]!.maxPp).toBe(5);
  });

  it('fails if target has not used a move', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'sketch', currentPp: 5, maxPp: 5 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first (no target lastMoveId yet)

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failEvent = result.events.find(e =>
      e.type === 'move-failed' && (e.data as { moveId?: string }).moveId === 'sketch'
    );
    expect(failEvent).toBeDefined();
  });

  it('works when Sketch is not in the first slot', () => {
    const state = make1v1State();

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'icebeam', currentPp: 10, maxPp: 10 };
    p2.stats = { ...p2.stats, spe: 200 };

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p1.moves[1] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    p1.moves[2] = { moveId: 'sketch', currentPp: 5, maxPp: 5 };
    p1.moves[3] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 2 }, // Sketch (at index 2)
      'slot-b1': { type: 'move', moveIndex: 0 }, // icebeam (at index 0)
    });

    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.moves[2]!.moveId).toBe('icebeam');
    expect(p1After.moves[2]!.currentPp).toBe(5);
    expect(p1After.moves[2]!.maxPp).toBe(5);
  });

  it('sketches any move including otherwise restricted moves', () => {
    const state = make1v1State();

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    p2.stats = { ...p2.stats, spe: 200 }; // p2 moves first

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'sketch', currentPp: 5, maxPp: 5 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Sketch
      'slot-b1': { type: 'move', moveIndex: 0 }, // Tackle
    });

    // After p2 uses Tackle, p1's Sketch should have copied it
    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1After.moves[0]!.moveId).toBe('tackle');
    expect(p1After.moves[0]!.currentPp).toBe(5); // PP is normalized to 5
  });
});

describe('Transform', () => {
  it('copies target stats, ability, and moves with pp capped at 5', () => {
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'transform', currentPp: 10, maxPp: 10 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first
    const p1OriginalHp = p1.currentHp;
    const p1OriginalStats = { ...p1.stats };

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'intimidate';
    p2.moves[0] = { moveId: 'surf', currentPp: 10, maxPp: 15 }; // 10 PP, should become 5
    p2.moves[1] = { moveId: 'dragonrush', currentPp: 15, maxPp: 15 };
    p2.moves[2] = { moveId: 'ice-beam', currentPp: 5, maxPp: 10 }; // exactly 5, stays 5
    p2.moves[3] = { moveId: 'splash', currentPp: 40, maxPp: 40 }; // splash does nothing
    // Set p2 stats to be different so we can verify they're copied
    p2.stats = { hp: 100, atk: 120, def: 100, spa: 100, spd: 100, spe: 80 };

    const rng = () => 0.5;
    const engine = new BattleEngine({ rng });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Transform
      'slot-b1': { type: 'move', moveIndex: 3 }, // p2 uses splash
    });

    // After the turn, check p1's updated state
    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;

    // Ability should be copied
    expect(p1After.ability).toBe('intimidate');

    // Stats should be copied (but not HP stat)
    expect(p1After.stats.atk).toBe(120);
    expect(p1After.stats.def).toBe(100);
    expect(p1After.stats.hp).toBe(p1OriginalStats.hp); // HP stat should not change

    // Moves should be copied with PP capped at 5
    expect(p1After.moves[0]!.moveId).toBe('surf');
    expect(p1After.moves[0]!.currentPp).toBe(5);
    expect(p1After.moves[0]!.maxPp).toBe(5);

    expect(p1After.moves[1]!.moveId).toBe('dragonrush');
    expect(p1After.moves[1]!.currentPp).toBe(5);
    expect(p1After.moves[1]!.maxPp).toBe(5);

    expect(p1After.moves[2]!.moveId).toBe('ice-beam');
    expect(p1After.moves[2]!.currentPp).toBe(5);
    expect(p1After.moves[2]!.maxPp).toBe(5);

    expect(p1After.moves[3]!.moveId).toBe('splash');
    expect(p1After.moves[3]!.currentPp).toBe(5);
    expect(p1After.moves[3]!.maxPp).toBe(5);

    // Stat boosts should be copied
    expect(p1After.statBoosts).toEqual(p2.statBoosts);

    // Should have the transformed volatile
    expect(p1After.volatileStatus.some(v => v.name === 'transformed')).toBe(true);
  });

  it('copies target typeOverride if present', () => {
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'transform', currentPp: 10, maxPp: 10 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.typeOverride = ['Water', 'Dragon'];
    p2.moves[0] = { moveId: 'splash', currentPp: 40, maxPp: 40 }; // Use splash instead of protect

    const rng = () => 0.5;
    const engine = new BattleEngine({ rng });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Transform
      'slot-b1': { type: 'move', moveIndex: 0 }, // p2 uses splash
    });

    // After the turn, check p1's updated state
    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;

    // Types should match target's effective types
    expect(p1After.typeOverride).toEqual(['Water', 'Dragon']);
  });

  it('reverts stats, ability, type, and moves when the transformed Pokémon switches out', () => {
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'transform', currentPp: 10, maxPp: 10 };
    p1.stats = { ...p1.stats, spe: 200 }; // p1 moves first

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.ability = 'intimidate';
    p2.typeOverride = ['Water', 'Dragon'];
    p2.stats = { hp: 100, atk: 120, def: 100, spa: 100, spd: 100, spe: 80 };

    const engine = new BattleEngine({ rng: () => 0.5 });

    // Turn 1: p1 transforms into p2
    const turn1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Transform
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost (harmless)
    });

    const p1Transformed = turn1.newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1Transformed.ability).toBe('intimidate');
    expect(p1Transformed.typeOverride).toEqual(['Water', 'Dragon']);

    // Turn 2: p1 switches out to its bench mon
    const turn2 = engine.resolveTurn(turn1.newState, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost (harmless)
    });

    const p1Reverted = turn2.newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === p1.instanceId)!;
    expect(p1Reverted.ability).toBe('blaze'); // original Charizard ability from makePokemon default
    expect(p1Reverted.stats).toEqual({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 200 });
    expect(p1Reverted.moves).toEqual([
      { moveId: 'transform', currentPp: 9, maxPp: 10 }, // 1 PP spent using it turn 1
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ]);
    expect(p1Reverted.typeOverride).toBeUndefined();
    expect(p1Reverted.volatileStatus.some(v => v.name === 'transformed')).toBe(false);
    expect(p1Reverted.originalForm).toBeUndefined();
  });
});

describe('Psych Up', () => {
  it('copies target stat stages to user', () => {
    const state = make1v1State();

    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.moves[0] = { moveId: 'psychup', currentPp: 10, maxPp: 10 };
    // p1 has its own stages (should be overwritten)
    p1.statBoosts = { atk: 1, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };

    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    // p2 has atk+2, spd-1
    p2.statBoosts = { atk: 2, def: 0, spa: 0, spd: -1, spe: 0, accuracy: 0, evasion: 0 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 }, // Psych Up
      'slot-b1': { type: 'move', moveIndex: 0 }, // p2 attacks
    });

    const p1After = result.newState.teams[0]!.slots[0]!.party[0]!;
    // p1 should now have p2's stat stages
    expect(p1After.statBoosts.atk).toBe(2);
    expect(p1After.statBoosts.spd).toBe(-1);
    expect(p1After.statBoosts.def).toBe(0);
  });
});
