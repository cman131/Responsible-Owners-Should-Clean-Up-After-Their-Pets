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
