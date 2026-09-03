import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';
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
