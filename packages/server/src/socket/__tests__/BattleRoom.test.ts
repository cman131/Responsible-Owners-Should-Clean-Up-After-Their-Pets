import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleRoom } from '../BattleRoom.js';
import { make1v1State, makePokemon } from '../../engine/__tests__/fixtures.js';
import type { MoveAction } from '@poke-fighter/shared';

describe('BattleRoom', () => {
  let room: BattleRoom;

  beforeEach(() => {
    const state = make1v1State();
    room = new BattleRoom({ initialState: state });
  });

  it('starts in action phase waiting for submissions', () => {
    expect(room.getState().phase).toBe('action');
  });

  it('collects a valid action from a slot', () => {
    const action: MoveAction = { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' };
    const result = room.submitAction('slot-a1', action);
    expect(result.ok).toBe(true);
  });

  it('resolves turn when all slots have submitted', () => {
    const events: unknown[] = [];
    room.onTurnResolved((e) => events.push(e));

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(events.length).toBeGreaterThan(0);
    expect(room.getState().turnNumber).toBe(2);
  });

  it('rejects action from unknown slot', () => {
    const result = room.submitAction('slot-unknown', { type: 'move', moveIndex: 0 });
    expect(result.ok).toBe(false);
  });

  it('fires onBattleEnd when a team wins', () => {
    const endEvents: string[] = [];
    room.onBattleEnd((winningTeamId) => endEvents.push(winningTeamId));

    const state = room.getState();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(endEvents.length).toBe(1);
    expect(endEvents[0]).toBe('team-a');
  });
});

describe('getPendingActionRequest', () => {
  it('returns an action request for a human slot that has not yet submitted', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req).not.toBeNull();
    expect(req!.slotId).toBe('slot-a1');
    expect(req!.validMoves).toHaveLength(4);
    expect(req!.validMoves[0]!.legalTargets).toContain('slot-b1');
    expect(req!.validMoves[0]!.targetType).toBe('normal'); // flamethrower targets normal
  });

  it('returns null after the slot has submitted an action', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const room = new BattleRoom({ initialState: state });
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0 });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });

  it('returns null for an NPC slot', () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    expect(room.getPendingActionRequest('slot-b1')).toBeNull();
  });

  it('returns null for a fainted slot', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    const room = new BattleRoom({ initialState: state });
    expect(room.getPendingActionRequest('slot-a1')).toBeNull();
  });

  it('returns Struggle as the only move when all move PP is 0', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const active = state.teams[0]!.slots[0]!.party[0]!;
    for (const m of active.moves) m.currentPp = 0;
    const room = new BattleRoom({ initialState: state });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.validMoves).toHaveLength(1);
    expect(req!.validMoves[0]!.moveId).toBe('struggle');
    expect(req!.validMoves[0]!.disabled).toBe(false);
  });
});

describe('onPlayerActionRequired', () => {
  it('fires deferred at construction with one entry per active human slot', async () => {
    // make1v1State has slot-a1 (isNpc=false) and slot-b1 (isNpc=true)
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    // Must not fire synchronously
    expect(cb).not.toHaveBeenCalled();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledOnce();
    const requests: Array<{ slotId: string; request: unknown }> = cb.mock.calls[0]![0];
    expect(requests).toHaveLength(1);
    expect(requests[0]!.slotId).toBe('slot-a1');
  });

  it('fires again after resolveTurn with the next turn human slots', async () => {
    const state = make1v1State();
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    await new Promise<void>((r) => setTimeout(r, 0));
    cb.mockClear();

    // Both slots submit — triggers resolveTurn synchronously
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    // resolveTurn fires synchronously — callback fires synchronously in else-branch
    expect(cb).toHaveBeenCalledOnce();
    const requests: Array<{ slotId: string; request: unknown }> = cb.mock.calls[0]![0];
    expect(requests[0]!.slotId).toBe('slot-a1');
  });

  it('excludes NPC and spectator slots', async () => {
    const state = make1v1State();
    // slot-b1 is isNpc=true, slot-a1 is isNpc=false
    const room = new BattleRoom({ initialState: state });
    const cb = vi.fn();
    room.onPlayerActionRequired(cb);
    await new Promise<void>((r) => setTimeout(r, 0));
    const requests: Array<{ slotId: string }> = cb.mock.calls[0]![0];
    expect(requests.every((r) => r.slotId !== 'slot-b1')).toBe(true);
  });
});

describe('Choice lock enforcement', () => {
  it('enforces choice lock when lockedMoveId is already set in state', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'choice-band';
    p1.lockedMoveId = 'flamethrower'; // already locked from previous turn
    const room = new BattleRoom({ initialState: state });

    // Try to use a different move (index 1 = airslash)
    const result = room.submitAction('slot-a1', { type: 'move', moveIndex: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('choice-locked');
  });

  it('allows using the locked move when choice-locked', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.heldItem = 'choice-band';
    p1.lockedMoveId = 'flamethrower';
    const room = new BattleRoom({ initialState: state });

    // Using the locked move (index 0 = flamethrower) is fine
    const result = room.submitAction('slot-a1', { type: 'move', moveIndex: 0 });
    expect(result.ok).toBe(true);
  });

  it('lockedMoveId is set in state after first move resolves via BattleRoom', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'choice-band';
    const room = new BattleRoom({ initialState: state });

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0 }); // flamethrower
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0 }); // resolves turn

    expect(room.getState().teams[0]!.slots[0]!.party[0]!.lockedMoveId).toBe('flamethrower');
  });

  it('returns Struggle when Torment + Choice lock makes all moves disabled', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    // Choice-locked to flamethrower (move 0) AND tormented (can't use last move = flamethrower)
    p1.heldItem = 'choice-band';
    p1.lockedMoveId = 'flamethrower';
    p1.lastMoveId = 'flamethrower';
    p1.volatileStatus.push({ name: 'torment', turnsRemaining: -1 });

    const room = new BattleRoom({ initialState: state });
    const req = room.getPendingActionRequest('slot-a1');

    expect(req).not.toBeNull();
    expect(req!.validMoves).toHaveLength(1);
    expect(req!.validMoves[0]!.moveId).toBe('struggle');
    expect(req!.validMoves[0]!.disabled).toBe(false);
  });
});

describe('Bug 1 — post-forced-switch continuation', () => {
  it('fires action requests after the only forced switch resolves', () => {
    const state = make1v1State();
    // Give slot-a1 a bench pokemon so it can switch
    const bench = makePokemon({ instanceId: 'bench-mon', nickname: 'Bench' });
    state.teams[0]!.slots[0]!.party.push(bench);

    const room = new BattleRoom({ initialState: state });
    const npcRequests: unknown[] = [];
    const playerRequests: unknown[] = [];

    room.onSwitchRequest(() => {});
    room.onNpcActionRequired((slots) => npcRequests.push(slots));
    room.onPlayerActionRequired((reqs) => playerRequests.push(reqs));

    // Force slot-a1's active mon to faint (triggers switch request)
    room.forceFaint('slot-a1');

    // Submit the forced switch
    room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'bench-mon' });

    // After switch resolves, next-turn action requests must fire
    expect(npcRequests.length + playerRequests.length).toBeGreaterThan(0);
  });

  it('waits when a second forced switch is still pending', () => {
    const state = make1v1State();
    const bench1 = makePokemon({ instanceId: 'bench-a', nickname: 'BenchA' });
    const bench2 = makePokemon({ instanceId: 'bench-b', nickname: 'BenchB' });
    state.teams[0]!.slots[0]!.party.push(bench1);
    state.teams[1]!.slots[0]!.party.push(bench2);

    const room = new BattleRoom({ initialState: state });
    const npcRequests: unknown[] = [];
    const playerRequests: unknown[] = [];

    room.onSwitchRequest(() => {});
    room.onNpcActionRequired((slots) => npcRequests.push(slots));
    room.onPlayerActionRequired((reqs) => playerRequests.push(reqs));

    // Both active mons faint
    room.forceFaint('slot-a1');
    room.forceFaint('slot-b1');

    const countBefore = npcRequests.length + playerRequests.length;

    // Only submit one of the two required switches
    room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'bench-a' });

    // Still waiting on slot-b1 — must not fire action requests yet
    expect(npcRequests.length + playerRequests.length).toBe(countBefore);
  });
});

describe('forced switch correctness', () => {
  function makeStateWithBench() {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    return state;
  }

  it('forced switch applies Stealth Rock to incoming Pokémon', () => {
    const state = makeStateWithBench();
    state.field.sideConditions[0]!.stealthRock = true;
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 0;

    const room = new BattleRoom({ initialState: state });
    const events: import('@poke-fighter/shared').TurnResolveEvent[] = [];
    room.onTurnResolved((evts) => events.push(...evts));

    const result = room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'p1-bench' });
    expect(result.ok).toBe(true);

    const bench = room.getState().teams[0]!.slots[0]!.party[1]!;
    expect(bench.currentHp).toBeLessThan(bench.maxHp);
    expect(events.some(e => e.type === 'hazard-damage')).toBe(true);
  });

  it('forced switch emits pokemon-switched event', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.fainted = true;
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 0;

    const room = new BattleRoom({ initialState: state });
    const events: import('@poke-fighter/shared').TurnResolveEvent[] = [];
    room.onTurnResolved((evts) => events.push(...evts));

    room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'p1-bench' });

    expect(events.some(e => e.type === 'pokemon-switched' && e.data['reason'] === 'forced')).toBe(true);
  });
});

describe('Bug 3 — pivot move integration', () => {
  it('fires switch request after U-turn then fires action requests after switch submitted', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.isNpc = false;
    const bench = makePokemon({ instanceId: 'bench-a', nickname: 'Bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'uturn', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1000;
    state.teams[1]!.slots[0]!.party[0]!.maxHp = 1000;

    const room = new BattleRoom({ initialState: state });
    const switchRequests: unknown[] = [];
    const npcRequests: unknown[] = [];
    const playerRequests: unknown[] = [];

    room.onSwitchRequest((slots) => switchRequests.push(slots));
    room.onNpcActionRequired((slots) => npcRequests.push(slots));
    room.onPlayerActionRequired((reqs) => playerRequests.push(reqs));

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    expect(switchRequests.length).toBeGreaterThan(0);

    room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'bench-a' });

    expect(npcRequests.length + playerRequests.length).toBeGreaterThan(0);
    expect(room.getState().turnNumber).toBe(2);
  });
});

describe('getPendingActionRequest — lockedReason', () => {
  function makeHumanRoom(overrides: Partial<import('@poke-fighter/shared').PartyMember> = {}) {
    const state = make1v1State();
    Object.assign(state.teams[0]!.slots[0]!.party[0]!, overrides);
    return new BattleRoom({ initialState: state });
  }

  it('returns lockedReason "recharge" when active pokemon has recharge volatile', () => {
    const room = makeHumanRoom({ volatileStatus: [{ name: 'recharge' }] });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBe('recharge');
  });

  it('returns lockedReason "sleep" when active pokemon status is slp', () => {
    const room = makeHumanRoom({ status: 'slp', volatileStatus: [{ name: 'sleep', counter: 2 }] });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBe('sleep');
  });

  it('returns lockedReason "freeze" when active pokemon status is frz', () => {
    const room = makeHumanRoom({ status: 'frz' });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBe('freeze');
  });

  it('returns lockedReason "bide" when active pokemon has bide volatile', () => {
    const room = makeHumanRoom({ volatileStatus: [{ name: 'bide', turnsRemaining: 1 }] });
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBe('bide');
  });

  it('returns no lockedReason for a healthy pokemon', () => {
    const room = makeHumanRoom();
    const req = room.getPendingActionRequest('slot-a1');
    expect(req!.lockedReason).toBeUndefined();
  });
});

describe('level-up stat recalculation', () => {
  // Charizard (speciesId=6): MediumSlow growth, baseExpYield=240
  // Level 51 threshold = floor(6*51^3/5 - 15*51^2 + 100*51 - 140) = 125126
  // Exp gained from killing lv50 Charizard = floor(240*50/7) = 1714
  // So start with expTotal = 125126 - 1714 = 123412 to trigger level-up on one faint
  //
  // Charizard stats at lv50, 31 IVs, 0 EVs, Hardy nature:
  //   atk = floor(floor((2*84+31)*50)/100) + 5 = 104
  // At lv51:
  //   atk = floor(floor((2*84+31)*51)/100) + 5 = 106
  it('updates mon.stats after level-up when ivs/evs/nature are present', () => {
    const state = make1v1State();
    // Set p1 near level-up threshold
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.expTotal = 123412;
    p1.level = 50;
    p1.stats = { hp: 247, atk: 104, def: 97, spa: 136, spd: 106, spe: 123 }; // lv50 values
    p1.maxHp = 247;
    p1.currentHp = 247;
    // Store ivs/evs/nature so BattleRoom can recalculate
    (p1 as any).ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    (p1 as any).evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    (p1 as any).nature = 'hardy';

    // p2 needs very low HP to faint from p1's attack
    const p2 = state.teams[1]!.slots[0]!.party[0]!;
    p2.currentHp = 1;

    const room = new BattleRoom({ initialState: state });
    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    const updatedP1 = room.getState().teams[0]!.slots[0]!.party[0]!;
    expect(updatedP1.level).toBe(51);
    expect(updatedP1.stats.atk).toBe(106); // recalculated, not stale 104
  });
});

describe('pivot switch reason', () => {
  it('pokemon-switched event has reason "phased" for pivot (U-turn) switch', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'uturn', currentPp: 20, maxPp: 20 };

    const room = new BattleRoom({ initialState: state });
    const allEvents: import('@poke-fighter/shared').TurnResolveEvent[] = [];
    room.onTurnResolved((evts) => allEvents.push(...evts));

    room.submitAction('slot-a1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' });
    room.submitAction('slot-b1', { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' });

    // After U-turn resolves, slot-a1 is awaiting a pivot switch
    room.submitAction('slot-a1', { type: 'switch', targetInstanceId: 'p1-bench' });

    const switchedEvent = allEvents.find(
      e => e.type === 'pokemon-switched' && e.data['slotId'] === 'slot-a1'
    );
    expect(switchedEvent).toBeDefined();
    expect(switchedEvent!.data['reason']).toBe('phased');
  });
});
