/*
 * Pivot-Switch Flow Contract
 * ==========================
 * This file tests all "pivot" status moves: Baton Pass, Shed Tail, Parting Shot, Teleport,
 * Roar, and Whirlwind. They all extend or mirror the pivot infrastructure used by U-turn /
 * Volt Switch (damaging pivot moves).
 *
 * End-to-end flow for a pivot-switch move:
 *   1. BattleEngine.executeMove() detects `secs.some(sec => sec.kind === 'pivot')` after the
 *      move resolves. If the attacker has a bench member, it returns `{ pivotSwitch: true }`.
 *   2. resolveTurn() (BattleEngine.ts ~L153) catches `moveResult.pivotSwitch`, records which
 *      slots still need to act (remainingActions / remainingSlotOrder), and immediately returns
 *      `{ pivotSlots: [slotId], remainingActions, remainingSlotOrder, movedSlotIds }`.
 *   3. BattleRoom.ts (~L491) receives `result.pivotSlots`, stores the interrupted-turn context
 *      in `this.interruptedTurnContext`, and invokes `onSwitchRequestCb` so the client is
 *      prompted to select a replacement.
 *   4. The player responds; BattleRoom calls
 *      `engine.processForceSwitch(state, slotId, targetInstanceId, 'forced')` which delegates
 *      to `performSwitch` — the same path used by all regular switches (ability hooks, hazards,
 *      volatile cleanup, stat-boost resets, etc.).
 *   5. After the forced switch resolves, BattleRoom calls `engine.resumeTurn(...)` with the
 *      saved context to finish any remaining actions in the original turn order.
 *
 * Status pivot moves follow this same contract. The key differences per move are:
 *   - Baton Pass: pass volatile status and stat boosts to the incoming partner.
 *   - Shed Tail: pass a Substitute to the incoming partner.
 *   - Parting Shot: lower target's Atk+SpAtk before switching out (fails vs. Dark types).
 *   - Teleport: switch self without any side effects (fails if attacker is at full-speed trap).
 *   - Roar / Whirlwind: force the *opponent* to switch to a random bench member (phazing).
 */

import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';

describe('switchMoves', () => {
  it.todo('placeholder — individual move suites will be added in subsequent tasks');
});

describe('Baton Pass', () => {
  it('returns pivotSlots when user has a bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give slot-a1 a bench member
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    // Give the active Pokemon Baton Pass as move slot 0
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'batonpass', currentPp: 40, maxPp: 40 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toContain('slot-a1');
  });

  it('emits pivot-skipped when user has no bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // No bench — only one Pokemon in party
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'batonpass', currentPp: 40, maxPp: 40 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toBeUndefined();
    const skippedEvent = result.events.find(e => e.type === 'pivot-skipped');
    expect(skippedEvent).toBeDefined();
    // batonPassData must not linger on the slot when pivot was skipped
    expect(result.newState.teams[0]!.slots[0]!.batonPassData).toBeUndefined();
  });

  it('transfers +2 Atk stat boost to incoming Pokemon', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Set +2 Atk on the active Pokemon
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.atk = 2;

    // Give it a bench member and Baton Pass
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'batonpass', currentPp: 40, maxPp: 40 };

    // Step 1: resolve the turn — Baton Pass triggers pivot
    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result1.pivotSlots).toContain('slot-a1');

    // Step 2: complete the forced switch to the bench Pokemon
    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    // The incoming Pokemon (now at activePokemonIndex=1) should have +2 Atk
    const incomingSlot = result2.newState.teams[0]!.slots[0]!;
    const incoming = incomingSlot.party[incomingSlot.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');
    expect(incoming.statBoosts.atk).toBe(2);
  });

  it('transfers substitute volatile (with hp) to incoming Pokemon', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give the active Pokemon a substitute volatile
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'substitute', hp: 25 });
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 75; // cost was 25

    // Give it a bench member and Baton Pass
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'batonpass', currentPp: 40, maxPp: 40 };

    // Step 1: resolve the turn — Baton Pass triggers pivot
    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result1.pivotSlots).toContain('slot-a1');

    // Step 2: complete the forced switch
    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    // The incoming Pokemon should have the substitute volatile with the same hp
    const incomingSlot = result2.newState.teams[0]!.slots[0]!;
    const incoming = incomingSlot.party[incomingSlot.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');
    const subVolatile = incoming.volatileStatus.find(v => v.name === 'substitute');
    expect(subVolatile).toBeDefined();
    expect(subVolatile?.hp).toBe(25);
  });

  it('transfers both stat boosts and substitute in the same Baton Pass', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Set up the active Pokemon with +2 Atk and a substitute
    const active = state.teams[0]!.slots[0]!.party[0]!;
    active.statBoosts.atk = 2;
    active.statBoosts.spe = 1;
    active.volatileStatus.push({ name: 'substitute', hp: 25 });
    active.currentHp = 75;

    // Give it a bench member and Baton Pass
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    active.moves[0] = { moveId: 'batonpass', currentPp: 40, maxPp: 40 };

    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result1.pivotSlots).toContain('slot-a1');

    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    const incomingSlot = result2.newState.teams[0]!.slots[0]!;
    const incoming = incomingSlot.party[incomingSlot.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');
    expect(incoming.statBoosts.atk).toBe(2);
    expect(incoming.statBoosts.spe).toBe(1);
    expect(incoming.volatileStatus.some(v => v.name === 'substitute')).toBe(true);
  });

  it('does NOT transfer non-Baton-Pass volatiles (e.g. confusion)', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give the active Pokemon confusion (should not be passed) and focusenergy (should be passed)
    const active = state.teams[0]!.slots[0]!.party[0]!;
    active.volatileStatus.push({ name: 'confusion' });
    active.volatileStatus.push({ name: 'focusenergy' });

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    active.moves[0] = { moveId: 'batonpass', currentPp: 40, maxPp: 40 };

    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result1.pivotSlots).toContain('slot-a1');

    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    const incomingSlot = result2.newState.teams[0]!.slots[0]!;
    const incoming = incomingSlot.party[incomingSlot.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');

    // focusenergy should be passed
    expect(incoming.volatileStatus.some(v => v.name === 'focusenergy')).toBe(true);
    // confusion should NOT be passed
    expect(incoming.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });

  it('clears batonPassData from the slot after use', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    state.teams[0]!.slots[0]!.party[0]!.statBoosts.atk = 2;
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'batonpass', currentPp: 40, maxPp: 40 };

    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    // batonPassData should be cleared from the slot after the switch
    const slot = result2.newState.teams[0]!.slots[0]!;
    expect(slot.batonPassData).toBeUndefined();
  });
});

describe('Shed Tail', () => {
  it('fails when user HP is at or below 50% of max HP', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Set HP to exactly 50% — should fail
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 50;
    state.teams[0]!.slots[0]!.party[0]!.maxHp = 100;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };
    // Give opponent a non-damaging move so we can check HP precisely
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toBeUndefined();
    const failedEvent = result.events.find(e => e.type === 'move-failed');
    expect(failedEvent).toBeDefined();
    expect((failedEvent as any).data.reason).toBe('not-enough-hp');
    // HP should not be changed by shedtail (opponent used a non-damaging move)
    expect(result.newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(50);
  });

  it('deducts 50% HP from user when successful', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // maxHp = 100, currentHp = 100 → cost = 50, remaining = 50
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const outgoing = result.newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.currentHp).toBe(50); // 100 - floor(100/2)
  });

  it('emits damage-dealt event for the HP cost', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const dmgEvent = result.events.find(e => e.type === 'damage-dealt' && (e as any).data.source === 'shedtail');
    expect(dmgEvent).toBeDefined();
    expect((dmgEvent as any).data.damage).toBe(50);
    expect((dmgEvent as any).data.slotId).toBe('slot-a1');
  });

  it('triggers pivot switch when user has a bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toContain('slot-a1');
  });

  it('fails and does NOT deduct HP when user has no bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 100;
    state.teams[0]!.slots[0]!.party[0]!.maxHp = 100;

    // No bench — only one Pokemon
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };
    // Opponent uses non-damaging move so we can assert HP precisely
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toBeUndefined();
    expect(result.events.some(e => e.type === 'move-failed')).toBe(true);
    // HP must not be deducted when the move fails due to no bench
    expect(result.newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBe(100);
  });

  it('transfers substitute to the incoming Pokemon', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // maxHp=100 → substitute hp = floor(100/4) = 25
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result1.pivotSlots).toContain('slot-a1');

    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    const incomingSlot = result2.newState.teams[0]!.slots[0]!;
    const incoming = incomingSlot.party[incomingSlot.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');

    const subVolatile = incoming.volatileStatus.find(v => v.name === 'substitute');
    expect(subVolatile).toBeDefined();
    expect(subVolatile?.hp).toBe(25); // floor(100/4)
  });

  it('does NOT place a substitute on the outgoing user itself', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // The outgoing Pokemon (index 0) should NOT have a substitute on itself
    const outgoing = result1.newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'substitute')).toBe(false);
  });

  it('clears batonPassData from the slot after processForceSwitch', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'shedtail', currentPp: 10, maxPp: 10 };

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    const slot = result2.newState.teams[0]!.slots[0]!;
    expect(slot.batonPassData).toBeUndefined();
  });
});

describe('Parting Shot', () => {
  it('applies -1 Atk and -1 SpA to the target, then triggers a pivot switch', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give slot-a1 (user) a bench member and Parting Shot
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'partingshot', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Stat drops applied to opponent (slot-b1)
    expect(result.newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(-1);
    expect(result.newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spa).toBe(-1);
    // Pivot switch triggered for user (slot-a1)
    expect(result.pivotSlots).toContain('slot-a1');
  });

  it('emits pivot-skipped and stat drops still apply when user has no bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // No bench — only one Pokemon
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'partingshot', currentPp: 20, maxPp: 20 };
    // Opponent uses a move that doesn't touch Atk or SpA so we can assert precisely
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'agility', currentPp: 30, maxPp: 30 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toBeUndefined();
    // The stat drops still apply even when pivot is skipped (move effect fired first)
    expect(result.newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(-1);
    expect(result.newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spa).toBe(-1);
  });

  it('fails with move-failed (immune) when target is a Dark-type', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give bench so pivot would otherwise fire
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'partingshot', currentPp: 20, maxPp: 20 };

    // Make target Dark-type via Terastallization (resolveEffectiveTypes checks teraType first)
    state.teams[1]!.slots[0]!.party[0]!.hasTerastallized = true;
    state.teams[1]!.slots[0]!.party[0]!.teraType = 'Dark';

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Move fails: no stat drops, no pivot
    expect(result.pivotSlots).toBeUndefined();
    expect(result.newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(0);
    expect(result.newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spa).toBe(0);
    const failedEvent = result.events.find(e => e.type === 'move-failed');
    expect(failedEvent).toBeDefined();
    expect((failedEvent as any).data.reason).toBe('immune');
  });

  it('does NOT carry over batonPassData (no stat boosts/volatiles passed to incoming)', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Set +2 Atk on user — Parting Shot should NOT pass it along
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.atk = 2;

    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'partingshot', currentPp: 20, maxPp: 20 };

    const result1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result1.pivotSlots).toContain('slot-a1');
    // No batonPassData should be set on the slot
    expect(result1.newState.teams[0]!.slots[0]!.batonPassData).toBeUndefined();

    const result2 = engine.processForceSwitch(result1.newState, 'slot-a1', 'p1-bench', 'forced');

    const incomingSlot = result2.newState.teams[0]!.slots[0]!;
    const incoming = incomingSlot.party[incomingSlot.activePokemonIndex]!;
    expect(incoming.instanceId).toBe('p1-bench');
    // Incoming should NOT have +2 Atk (no baton pass)
    expect(incoming.statBoosts.atk).toBe(0);
  });
});

describe('Roar & Whirlwind', () => {
  it('Roar forces target to switch to bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give slot-b1 (opponent) a bench member
    const oppBench = makePokemon({ instanceId: 'opp-bench' });
    state.teams[1]!.slots[0]!.party.push(oppBench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'roar', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Target was force-switched to bench member
    const targetSlot = result.newState.teams[1]!.slots[0]!;
    const activeTarget = targetSlot.party[targetSlot.activePokemonIndex]!;
    expect(activeTarget.instanceId).toBe('opp-bench');
    // pokemon-switched event emitted
    expect(result.events.some(e => e.type === 'pokemon-switched')).toBe(true);
  });

  it('fails when target has no bench (single Pokemon)', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // No bench for opponent — only one Pokemon in party
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'roar', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failedEvent = result.events.find(e => e.type === 'move-failed');
    expect(failedEvent).toBeDefined();
    expect((failedEvent as any).data.reason).toBe('no-eligible-bench');
    // Target should not have switched
    expect(result.newState.teams[1]!.slots[0]!.activePokemonIndex).toBe(0);
  });

  it('fails when target has ingrain volatile', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give opponent a bench and ingrain
    const oppBench = makePokemon({ instanceId: 'opp-bench' });
    state.teams[1]!.slots[0]!.party.push(oppBench);
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'ingrain' });
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'roar', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failedEvent = result.events.find(e => e.type === 'move-failed');
    expect(failedEvent).toBeDefined();
    expect((failedEvent as any).data.reason).toBe('ingrain');
    // Target should not have switched
    const targetSlot = result.newState.teams[1]!.slots[0]!;
    expect(targetSlot.party[targetSlot.activePokemonIndex]!.instanceId).toBe('p2-mon');
  });

  it('fails when target has suction-cups ability', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give opponent a bench and suction-cups ability
    const oppBench = makePokemon({ instanceId: 'opp-bench' });
    state.teams[1]!.slots[0]!.party.push(oppBench);
    state.teams[1]!.slots[0]!.party[0]!.ability = 'suction-cups';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'roar', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failedEvent = result.events.find(e => e.type === 'move-failed');
    expect(failedEvent).toBeDefined();
    expect((failedEvent as any).data.reason).toBe('suction-cups');
    // Target should not have switched
    const targetSlot = result.newState.teams[1]!.slots[0]!;
    expect(targetSlot.party[targetSlot.activePokemonIndex]!.instanceId).toBe('p2-mon');
  });

  it('Whirlwind is registered (basic smoke test)', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give opponent a bench member
    const oppBench = makePokemon({ instanceId: 'opp-bench-ww' });
    state.teams[1]!.slots[0]!.party.push(oppBench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'whirlwind', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    // Should not emit 'unimplemented' move-failed
    const unimplEvent = result.events.find(
      e => e.type === 'move-failed' && (e as any).data.reason === 'unimplemented'
    );
    expect(unimplEvent).toBeUndefined();
    // Target was force-switched
    const targetSlot = result.newState.teams[1]!.slots[0]!;
    const activeTarget = targetSlot.party[targetSlot.activePokemonIndex]!;
    expect(activeTarget.instanceId).toBe('opp-bench-ww');
  });
});

describe('Teleport', () => {
  it('returns pivotSlots containing the user slot when user has a bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // Give slot-a1 a bench member and Teleport
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'teleport', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toContain('slot-a1');
  });

  it('emits pivot-skipped and no pivotSlots when user has no bench member', () => {
    const engine = new BattleEngine();
    const state = make1v1State();

    // No bench — only one Pokemon in party
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'teleport', currentPp: 20, maxPp: 20 };

    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(result.pivotSlots).toBeUndefined();
    const skippedEvent = result.events.find(e => e.type === 'pivot-skipped');
    expect(skippedEvent).toBeDefined();
  });
});
