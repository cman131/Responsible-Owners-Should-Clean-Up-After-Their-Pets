import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { TurnResolveEvent } from '@poke-fighter/shared';

describe('lastDamageTaken tracking', () => {
  it('records physical damage on the target (target does not move this turn)', () => {
    const state = make1v1State();
    // Override p1's first move to tackle (physical) since default is flamethrower (special)
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    // p2 does NOT take any action this turn so its lastDamageTaken is not cleared

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // slot-b1 submits no action
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.lastDamageTaken).toBeDefined();
    expect(p2.lastDamageTaken!.category).toBe('physical');
    expect(p2.lastDamageTaken!.amount).toBeGreaterThan(0);
    expect(p2.lastDamageTaken!.fromSlotId).toBe('slot-a1');
  });

  it('records special damage on the target (target does not move this turn)', () => {
    const state = make1v1State();
    // p1's default move is flamethrower (special), keep it
    // p2 does NOT take any action this turn

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      // slot-b1 submits no action
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.lastDamageTaken).toBeDefined();
    expect(p2.lastDamageTaken!.category).toBe('special');
    expect(p2.lastDamageTaken!.amount).toBeGreaterThan(0);
    expect(p2.lastDamageTaken!.fromSlotId).toBe('slot-a1');
  });

  it('clears lastDamageTaken from the attacker at the start of their moveAction', () => {
    const state = make1v1State();
    // p1 will move first (spe=100 > p2 spe=80)
    // Give p1 a status move (roost) so p2 does NOT get hit by p1, meaning p2's lastDamageTaken
    // should be cleared when p2 moves (p2 uses flamethrower on p1).
    // Pre-populate lastDamageTaken on p2 (the attacker who moves second)
    state.teams[1]!.slots[0]!.party[0]!.lastDamageTaken = {
      amount: 99,
      category: 'physical',
      fromSlotId: 'slot-a1',
    };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      // p1 uses roost (status, self-targeting) — does not deal damage to p2
      'slot-a1': { type: 'move', moveIndex: 2, targetSlotId: 'slot-a1' },
      // p2 uses flamethrower on p1 — p2 is the attacker, so p2's lastDamageTaken should be cleared
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // p2 executed a move, so their lastDamageTaken should have been cleared (deleted) at
    // the start of their move execution. Since nobody hit p2 this turn, it should remain undefined.
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.lastDamageTaken).toBeUndefined();
  });
});

describe('Counter / Mirror Coat / Metal Burst', () => {
  it('Counter after p2 physical attack deals 2x that damage to p2', () => {
    // p1 uses Counter (priority -5), p2 uses tackle (priority 0, physical)
    // p2 moves first (higher priority), hits p1, sets p1.lastDamageTaken (physical)
    // p1 then uses Counter targeting p2, dealing 2x the damage p2 dealt
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'counter', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Verify no move-failed event for counter
    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents).toHaveLength(0);

    // p1 took tackle damage; counter should have dealt 2x that to p2
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    const tackleDamage = 100 - p1.currentHp; // damage p2 dealt to p1
    expect(tackleDamage).toBeGreaterThan(0);
    const counterDamage = 100 - p2.currentHp; // damage counter dealt to p2
    expect(counterDamage).toBe(tackleDamage * 2);
  });

  it('Counter with no prior damage emits move-failed', () => {
    // p1 uses Counter but has no lastDamageTaken (p2 also uses Counter, so no physical damage flows)
    // Actually: p2 uses Counter too (priority -5), neither takes damage before their move → both fail
    // Simpler: p1 uses Counter, p2 uses Mirror Coat — neither is physical damage to p1
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'counter', currentPp: 20, maxPp: 20 };
    // p2 uses roost (non-damaging), so p1 takes no damage → lastDamageTaken remains undefined
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'roost', currentPp: 10, maxPp: 10 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // roost is self-targeting
    });

    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents.length).toBeGreaterThan(0);
    const counterFailed = failedEvents.some(
      (e: TurnResolveEvent) => e.type === 'move-failed' && (e.data as { moveId: string }).moveId === 'counter'
    );
    expect(counterFailed).toBe(true);
  });

  it('Mirror Coat after p2 special attack deals 2x that damage to p2', () => {
    // p1 uses Mirror Coat (priority -5), p2 uses flamethrower (priority 0, special)
    // p2 moves first, hits p1 with special damage, p1 counters with 2x
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'mirrorcoat', currentPp: 20, maxPp: 20 };
    // p2 default move[0] is flamethrower (special)

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents).toHaveLength(0);

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    const flamethrowerDamage = 100 - p1.currentHp;
    expect(flamethrowerDamage).toBeGreaterThan(0);
    const mirrorCoatDamage = 100 - p2.currentHp;
    expect(mirrorCoatDamage).toBe(flamethrowerDamage * 2);
  });

  it('Mirror Coat after physical attack emits move-failed', () => {
    // p1 uses Mirror Coat, p2 uses tackle (physical) → Mirror Coat requires special damage → fails
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'mirrorcoat', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents.length).toBeGreaterThan(0);
    const mirrorCoatFailed = failedEvents.some(
      (e: TurnResolveEvent) => e.type === 'move-failed' && (e.data as { moveId: string }).moveId === 'mirrorcoat'
    );
    expect(mirrorCoatFailed).toBe(true);
  });

  it('Mirror Coat after Sonic Boom (special fixed-damage move) deals 2x', () => {
    // p1 uses Mirror Coat (priority -5), p2 uses Sonic Boom (priority 0, special, fixed 20 dmg)
    // p2 moves first, hits p1 with special damage (20 HP), p1 counters with 2x (40 HP)
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'mirrorcoat', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'sonicboom', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents).toHaveLength(0);

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    const sonicBoomDamage = 100 - p1.currentHp; // should be exactly 20
    expect(sonicBoomDamage).toBe(20);
    const mirrorCoatDamage = 100 - p2.currentHp; // should be 2x * 20 = 40
    expect(mirrorCoatDamage).toBe(40);
  });

  it('Metal Burst after taking damage deals floor(1.5x) to attacker', () => {
    // p1 uses Metal Burst (priority -3.5), p2 uses flamethrower (priority 0, special)
    // Make p1 slower so p2 attacks first (natural speed ordering), setting p1.lastDamageTaken
    // Then p1 uses Metal Burst dealing floor(damage * 1.5) back to p2
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'metalburst', currentPp: 10, maxPp: 10 };
    // Make p1 much slower so p2 (flamethrower) attacks first
    state.teams[0]!.slots[0]!.party[0]!.stats = {
      ...state.teams[0]!.slots[0]!.party[0]!.stats,
      spe: 1,
    };
    // p2 default move[0] is flamethrower (special)

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Metal Burst works for any damage category, so no move-failed expected
    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents).toHaveLength(0);

    // p1 took flamethrower damage; Metal Burst should have dealt floor(damage * 1.5) to p2
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    const flamethrowerDamage = 100 - p1.currentHp;
    expect(flamethrowerDamage).toBeGreaterThan(0);
    const metalBurstDamage = 100 - p2.currentHp;
    expect(metalBurstDamage).toBe(Math.floor(flamethrowerDamage * 1.5));
  });

  it('Metal Burst with no prior damage emits move-failed', () => {
    // p1 uses Metal Burst but has no lastDamageTaken (p2 uses roost, deals no damage)
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'metalburst', currentPp: 10, maxPp: 10 };
    // p2 uses roost (non-damaging), so p1 takes no damage → lastDamageTaken remains undefined
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'roost', currentPp: 10, maxPp: 10 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // roost is self-targeting
    });

    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents.length).toBeGreaterThan(0);
    const metalBurstFailed = failedEvents.some(
      (e: TurnResolveEvent) => e.type === 'move-failed' && (e.data as { moveId: string }).moveId === 'metalburst'
    );
    expect(metalBurstFailed).toBe(true);
  });
});

describe('HP-based damage moves', () => {
  it('Super Fang on 100 HP target deals 50 damage', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'superfang', currentPp: 10, maxPp: 10 };
    // p2 uses swordsdance so it does not damage p1
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(50); // floor(100 / 2) = 50 damage
    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents).toHaveLength(0);
  });

  it('Super Fang fails when target is at 1 HP', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'superfang', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(1); // HP unchanged
    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents.length).toBeGreaterThan(0);
    const superfangFailed = failedEvents.some(
      (e: TurnResolveEvent) => e.type === 'move-failed' && (e.data as { moveId: string }).moveId === 'superfang'
    );
    expect(superfangFailed).toBe(true);
  });

  it('Endeavor with attacker at 30 HP and target at 80 HP deals 50 damage, target HP becomes 30', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'endeavor', currentPp: 5, maxPp: 5 };
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 30;
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 80;
    // p2 uses swordsdance so it does not damage p1 (keeping p1 at 30 HP)
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(30); // target HP equals attacker HP
    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents).toHaveLength(0);
  });

  it('Endeavor fails when attacker HP >= target HP', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'endeavor', currentPp: 5, maxPp: 5 };
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 80;
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 30;
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(30); // HP unchanged
    const failedEvents = events.filter((e: TurnResolveEvent) => e.type === 'move-failed');
    expect(failedEvents.length).toBeGreaterThan(0);
    const endeavorFailed = failedEvents.some(
      (e: TurnResolveEvent) => e.type === 'move-failed' && (e.data as { moveId: string }).moveId === 'endeavor'
    );
    expect(endeavorFailed).toBe(true);
  });

  it('Final Gambit with attacker at 40 HP deals 40 damage to target and attacker faints', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'finalgambit', currentPp: 5, maxPp: 5 };
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 40;
    // p2 starts at 100 HP, uses swordsdance so p1 stays at 40 HP
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(60); // 100 - 40 = 60
    expect(p1.currentHp).toBe(0);  // attacker's HP goes to 0
    expect(p1.fainted).toBe(true); // attacker faints
    const faintEvents = events.filter((e: TurnResolveEvent) => e.type === 'faint');
    const attackerFainted = faintEvents.some(
      (e: TurnResolveEvent) => e.type === 'faint' && (e.data as { slotId: string }).slotId === 'slot-a1'
    );
    expect(attackerFainted).toBe(true);
  });
});

describe('Stat-override damage moves', () => {
  it('Foul Play uses target Atk stat: higher target Atk = more damage', () => {
    // Set up state where target has high Atk vs normal
    // p1 uses foulplay (physical, 95 BP), p2 has Atk=150
    // Compare damage vs scenario where p2 has Atk=50
    // Verify higher target Atk → more Foul Play damage

    const engine = new BattleEngine({ rng: () => 0.5 });

    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'foulplay', currentPp: 15, maxPp: 15 };
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 50; // attacker has LOW atk (irrelevant for Foul Play)
    state.teams[1]!.slots[0]!.party[0]!.stats.atk = 150; // target has HIGH atk
    // p2 uses swordsdance so it does not damage or heal itself
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // swordsdance = no damage
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    // Foul Play with p2 Atk=150 should deal meaningful damage
    expect(p2.currentHp).toBeLessThan(100);

    // Now compare with low-Atk target
    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'foulplay', currentPp: 15, maxPp: 15 };
    state2.teams[0]!.slots[0]!.party[0]!.stats.atk = 50; // same low atk
    state2.teams[1]!.slots[0]!.party[0]!.stats.atk = 50; // target also low atk
    state2.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const { newState: newState2 } = engine.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const p2b = newState2.teams[1]!.slots[0]!.party[0]!;

    // Higher target Atk → more Foul Play damage
    expect(p2.currentHp).toBeLessThan(p2b.currentHp);
  });

  it('Body Press uses user Def stat: higher user Def = more damage', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodypress', currentPp: 10, maxPp: 10 };
    state.teams[0]!.slots[0]!.party[0]!.stats.def = 200; // high def → high damage
    state.teams[0]!.slots[0]!.party[0]!.stats.atk = 50;  // low atk (irrelevant)
    // p2 uses swordsdance so it does not damage or heal itself
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // swordsdance = no damage
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;

    // Compare with low-def attacker
    const state2 = make1v1State();
    state2.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'bodypress', currentPp: 10, maxPp: 10 };
    state2.teams[0]!.slots[0]!.party[0]!.stats.def = 50; // low def
    state2.teams[0]!.slots[0]!.party[0]!.stats.atk = 50;
    state2.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const { newState: newState2 } = engine.resolveTurn(state2, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const p2b = newState2.teams[1]!.slots[0]!.party[0]!;

    // High-def attacker deals more Body Press damage
    expect(p2.currentHp).toBeLessThan(p2b.currentHp);
  });
});

describe('Fixed & level-based damage moves', () => {
  it('Seismic Toss at level 50 deals exactly 50 HP', () => {
    const state = make1v1State(); // p1 is level 50 by default
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'seismictoss', currentPp: 20, maxPp: 20 };
    // p2 submits no action — only p1 attacks
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(50); // 100 - 50 = 50
  });

  it('Night Shade at level 50 deals exactly 50 HP', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'nightshade', currentPp: 15, maxPp: 15 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(50); // 100 - 50 = 50
  });

  it('Dragon Rage deals exactly 40 HP', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonrage', currentPp: 10, maxPp: 10 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(60); // 100 - 40 = 60
  });

  it('Sonic Boom deals exactly 20 HP', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'sonicboom', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBe(80); // 100 - 20 = 80
  });
});

describe('Beat Up', () => {
  it('hits once per healthy party member — 3 healthy members = 3 damage-dealt events', () => {
    const state = make1v1State();
    // Add 2 more Charizard (speciesId=6, base atk=84) to p1's party
    const extra1 = makePokemon({ instanceId: 'p1-mon2', speciesId: 6 });
    const extra2 = makePokemon({ instanceId: 'p1-mon3', speciesId: 6 });
    state.teams[0]!.slots[0]!.party.push(extra1, extra2);
    // p1 uses beatup
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'beatup', currentPp: 10, maxPp: 10 };
    // p2 uses swordsdance so it doesn't damage p1
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // swordsdance is self-targeting
    });

    const beatUpDmgEvents = events.filter(
      (e: TurnResolveEvent) => e.type === 'damage-dealt' && (e.data as { moveId?: string }).moveId === 'beatup'
    );
    expect(beatUpDmgEvents).toHaveLength(3); // one hit per healthy party member
  });

  it('skips fainted and statused party members — only healthy members hit', () => {
    const state = make1v1State();
    // Add 2 more party members to p1 — one fainted, one with burn status
    const faintedMon = makePokemon({ instanceId: 'p1-mon2', speciesId: 6, fainted: true, currentHp: 0 });
    const burnedMon = makePokemon({ instanceId: 'p1-mon3', speciesId: 6 });
    burnedMon.status = 'brn';
    state.teams[0]!.slots[0]!.party.push(faintedMon, burnedMon);
    // p1 uses beatup — only the active (healthy) member contributes
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'beatup', currentPp: 10, maxPp: 10 };
    // p2 uses swordsdance so it doesn't damage p1
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const beatUpDmgEvents = events.filter(
      (e: TurnResolveEvent) => e.type === 'damage-dealt' && (e.data as { moveId?: string }).moveId === 'beatup'
    );
    expect(beatUpDmgEvents).toHaveLength(1); // only the healthy active mon contributes
  });

  it('each hit deals positive damage based on party member base atk', () => {
    const state = make1v1State();
    // Single healthy party member (the active Charizard, base atk=84)
    // Beat Up power = floor(84/10) + 5 = 13
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'beatup', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    // Should deal some damage (positive hit)
    expect(p2.currentHp).toBeLessThan(100);
  });
});

describe('Magnitude', () => {
  // Magnitude is a Ground-type move. Charizard (speciesId=6) is Fire/Flying and immune to Ground.
  // Use Bulbasaur (speciesId=1, Grass/Poison) as the target — grounded and not immune to Ground.
  function makeMagnitudeState() {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'magnitude', currentPp: 30, maxPp: 30 };
    // p2 uses a grounded species (Bulbasaur, speciesId=1) so Ground moves hit
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 1;
    state.teams[1]!.slots[0]!.party[0]!.speciesName = 'bulbasaur';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    return state;
  }

  it('Magnitude 7 (rng=0.5) deals damage and emits move-note "Magnitude 7!"', () => {
    // rng=0.5 → 0.35 < 0.5 < 0.65 → Magnitude 7 → BP 70
    const state = makeMagnitudeState();

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    // Damage should be > 0
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBeLessThan(100);

    // A move-note event should be emitted with "Magnitude 7!"
    const noteEvent = events.find((e: TurnResolveEvent) => e.type === 'move-note');
    expect(noteEvent).toBeDefined();
    expect((noteEvent!.data as { note: string }).note).toBe('Magnitude 7!');
  });

  it('Magnitude 4 (rng=0.02) deals less damage than Magnitude 7 (rng=0.5)', () => {
    // rng=0.02 → < 0.05 → Magnitude 4 → BP 10 (always hits: 0.02*100=2 < 100)
    // rng=0.5  → Magnitude 7 → BP 70
    // randomDamageFactor uses Math.random directly, not this.rng, so constant rng is safe
    const state4 = makeMagnitudeState();
    const state7 = makeMagnitudeState();

    const engine4 = new BattleEngine({ rng: () => 0.02 });
    const { newState: ns4 } = engine4.resolveTurn(state4, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const engine7 = new BattleEngine({ rng: () => 0.5 });
    const { newState: ns7 } = engine7.resolveTurn(state7, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const damage4 = 100 - ns4.teams[1]!.slots[0]!.party[0]!.currentHp;
    const damage7 = 100 - ns7.teams[1]!.slots[0]!.party[0]!.currentHp;

    // Magnitude 4 (BP 10) should deal less damage than Magnitude 7 (BP 70)
    expect(damage4).toBeGreaterThan(0);
    expect(damage4).toBeLessThan(damage7);
  });

  it('Magnitude 10 (rng=0.97) deals more damage than Magnitude 7 (rng=0.5)', () => {
    // rng=0.97 → >= 0.95 → Magnitude 10 → BP 150 (accuracy: 0.97*100=97 < 100 → hits)
    // rng=0.5 → Magnitude 7 → BP 70
    const state10 = makeMagnitudeState();
    const state7 = makeMagnitudeState();

    const engine10 = new BattleEngine({ rng: () => 0.97 });
    const { newState: ns10 } = engine10.resolveTurn(state10, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const engine7 = new BattleEngine({ rng: () => 0.5 });
    const { newState: ns7 } = engine7.resolveTurn(state7, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const damage10 = 100 - ns10.teams[1]!.slots[0]!.party[0]!.currentHp;
    const damage7 = 100 - ns7.teams[1]!.slots[0]!.party[0]!.currentHp;

    // Magnitude 10 (BP 150) should deal more damage than Magnitude 7 (BP 70)
    expect(damage10).toBeGreaterThan(damage7);
  });

  it('move-note event contains the correct Magnitude tier text for Magnitude 9', () => {
    // rng=0.9 → 0.85 <= 0.9 < 0.95 → Magnitude 9 → BP 110 (accuracy: 0.9*100=90 < 100 → hits)
    const state = makeMagnitudeState();

    const engine9 = new BattleEngine({ rng: () => 0.9 });
    const { events } = engine9.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const noteEvent = events.find((e: TurnResolveEvent) => e.type === 'move-note');
    expect(noteEvent).toBeDefined();
    expect((noteEvent!.data as { note: string }).note).toBe('Magnitude 9!');
  });
});

describe('Phasing moves (Dragon Tail / Circle Throw)', () => {
  it('Dragon Tail deals damage and forces target to switch to bench member', () => {
    // p1 uses dragontail (priority -6), p2 has 2 party members (active + 1 bench)
    // p2 uses swordsdance (priority 0) so p2 acts first (no damage), then p1 uses Dragon Tail
    // After: p2's active pokemon should change to the bench member
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragontail', currentPp: 10, maxPp: 10 };

    // Add a bench member for p2
    const benchMon = makePokemon({ instanceId: 'p2-bench', speciesId: 6 });
    state.teams[1]!.slots[0]!.party.push(benchMon);

    // p2 uses swordsdance (self-targeting, no damage)
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    // p2's active pokemon should have changed to bench member
    const p2Slot = newState.teams[1]!.slots[0]!;
    const newActiveInstanceId = p2Slot.party[p2Slot.activePokemonIndex]!.instanceId;
    expect(newActiveInstanceId).toBe('p2-bench');

    // Damage event should exist for dragontail
    expect(events.some(e => e.type === 'damage-dealt' && (e.data as { moveId?: string }).moveId === 'dragontail')).toBe(true);
  });

  it('Dragon Tail does not force switch when target has no bench members', () => {
    // Default 1v1 state: p2 has only 1 pokemon, no bench
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragontail', currentPp: 10, maxPp: 10 };
    // p2 uses swordsdance (no damage)
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const initialIndex = state.teams[1]!.slots[0]!.activePokemonIndex;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    // Active index should be unchanged — no bench to switch to
    expect(newState.teams[1]!.slots[0]!.activePokemonIndex).toBe(initialIndex);
  });

  it('Circle Throw also forces switch to bench member', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'circlethrow', currentPp: 10, maxPp: 10 };

    // Add a bench member for p2
    const benchMon = makePokemon({ instanceId: 'p2-bench-ct', speciesId: 6 });
    state.teams[1]!.slots[0]!.party.push(benchMon);

    // p2 uses swordsdance (no damage)
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    const p2Slot = newState.teams[1]!.slots[0]!;
    const newActiveInstanceId = p2Slot.party[p2Slot.activePokemonIndex]!.instanceId;
    expect(newActiveInstanceId).toBe('p2-bench-ct');
  });

  it('Dragon Tail does not force switch if target fainted from the damage', () => {
    // Set up p2 with 1 HP so Dragon Tail KOs them
    // Even if there's a bench member, no force-switch should occur after a KO
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragontail', currentPp: 10, maxPp: 10 };
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;

    // Give p2 a bench member
    const benchMon = makePokemon({ instanceId: 'p2-bench-ko', speciesId: 6 });
    state.teams[1]!.slots[0]!.party.push(benchMon);

    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    // p2's original active mon should be fainted
    const p2Slot = newState.teams[1]!.slots[0]!;
    // The activePokemonIndex still points at the original (fainted) mon; no auto-switch from phasing
    const activeIndex = p2Slot.activePokemonIndex;
    expect(p2Slot.party[activeIndex]!.fainted).toBe(true);
  });
});
