import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { make1v1State, makePokemon } from './fixtures.js';
import type { SwitchAction } from '@poke-fighter/shared';

function makeStateWithBench() {
  const state = make1v1State();
  // Give slot-a1 a bench member so a switch is valid
  const bench = makePokemon({ instanceId: 'p1-bench' });
  state.teams[0]!.slots[0]!.party.push(bench);
  return state;
}

describe('switch-out cleanup', () => {
  it('clears confusion volatile on switch-out', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'confusion' }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'confusion')).toBe(false);
  });

  it('resets stat boosts on switch-out', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.statBoosts.atk = 3;
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.statBoosts.atk).toBe(0);
  });

  it('toxic counter volatile persists through switch-out (Gen 5+ behavior)', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.status = 'tox';
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'toxic', counter: 3 }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    const toxEntry = outgoing.volatileStatus.find(v => v.name === 'toxic');
    expect(toxEntry).toBeDefined();
    expect(toxEntry!.counter).toBe(3);
  });
});

describe('onSwitchOut ability hooks', () => {
  it('Regenerator heals 1/3 max HP on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'regenerator';
    mon.currentHp = 40;
    mon.maxHp = 100;
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.currentHp).toBe(73); // 40 + floor(100/3) = 40 + 33
    expect(events.some(e => e.type === 'heal' && e.data['reason'] === 'regenerator')).toBe(true);
  });

  it('Regenerator does not overheal past max HP', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'regenerator';
    mon.currentHp = 95;
    mon.maxHp = 100;
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.currentHp).toBe(100);
  });

  it('Natural Cure clears status on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'natural-cure';
    mon.status = 'brn';
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured' && e.data['reason'] === 'natural-cure')).toBe(true);
  });

  it('Natural Cure does nothing if Pokémon has no status', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[0]!.ability = 'natural-cure';
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'status-cured')).toBe(false);
  });
});

describe('onSwitchOut — ability-applied volatile removal', () => {
  it('Slow Start volatile is removed on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'slow-start';
    mon.volatileStatus = [{ name: 'slow-start', turnsRemaining: 3 }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'slow-start')).toBe(false);
  });

  it('Truant volatile is removed on switch-out', () => {
    const state = makeStateWithBench();
    const mon = state.teams[0]!.slots[0]!.party[0]!;
    mon.ability = 'truant';
    mon.volatileStatus = [{ name: 'truant' }];
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const outgoing = newState.teams[0]!.slots[0]!.party[0]!;
    expect(outgoing.volatileStatus.some(v => v.name === 'truant')).toBe(false);
  });
});

describe('pokemon-switched event (FR-14)', () => {
  it('voluntary switch emits pokemon-switched event with reason: voluntary', () => {
    const state = makeStateWithBench();
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const switchEvent = events.find(e => e.type === 'pokemon-switched');
    expect(switchEvent).toBeDefined();
    expect(switchEvent!.data['reason']).toBe('voluntary');
    expect(switchEvent!.data['inInstanceId']).toBe('p1-bench');
  });

  it('does not emit volatile-applied with note:switch', () => {
    const state = makeStateWithBench();
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const oldEvent = events.find(
      e => e.type === 'volatile-applied' && e.data['note'] === 'switch'
    );
    expect(oldEvent).toBeUndefined();
  });
});

describe('onSwitchIn — Download', () => {
  function makeDownloadState(foeDefStat: number, foeSpdStat: number) {
    const state = makeStateWithBench();
    // Incoming Pokémon (p1-bench) has Download
    state.teams[0]!.slots[0]!.party[1]!.ability = 'download';
    // Foe has specific def/spd stats, no boosts
    state.teams[1]!.slots[0]!.party[0]!.stats.def = foeDefStat;
    state.teams[1]!.slots[0]!.party[0]!.stats.spd = foeSpdStat;
    state.teams[1]!.slots[0]!.party[0]!.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
    return state;
  }

  it('gives +1 Atk when foe effective Def < effective SpD', () => {
    // foe Def=80, SpD=120 → Def < SpD → Download gives +Atk
    const state = makeDownloadState(80, 120);
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.statBoosts.atk).toBe(1);
    expect(incoming.statBoosts.spa).toBe(0);
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('gives +1 SpA when foe effective SpD <= effective Def', () => {
    // foe Def=120, SpD=80 → SpD < Def → Download gives +SpA
    const state = makeDownloadState(120, 80);
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.statBoosts.spa).toBe(1);
    expect(incoming.statBoosts.atk).toBe(0);
  });

  it('gives +1 SpA on tie (Def === SpD)', () => {
    const state = makeDownloadState(100, 100);
    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.statBoosts.spa).toBe(1);
    expect(incoming.statBoosts.atk).toBe(0);
  });
});

describe('onSwitchIn — Trace', () => {
  it('copies foe ability and fires the traced onSwitchIn (Intimidate)', () => {
    const state = makeStateWithBench();
    // Incoming Pokémon (p1-bench) has Trace
    state.teams[0]!.slots[0]!.party[1]!.ability = 'trace';
    // Foe has Intimidate
    state.teams[1]!.slots[0]!.party[0]!.ability = 'intimidate';

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // Traced Intimidate should lower foe's Atk
    const foe = newState.teams[1]!.slots[0]!.party[0]!;
    expect(foe.statBoosts.atk).toBe(-1);

    // The incoming Pokémon should have tracedAbilityId set
    const incoming = newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.tracedAbilityId).toBe('intimidate');

    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('does not infinite-loop when Trace copies another Trace', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'trace';
    state.teams[1]!.slots[0]!.party[0]!.ability = 'trace';

    const engine = new BattleEngine();
    // Should complete without stack overflow
    expect(() => engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    })).not.toThrow();

    const incoming = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    }).newState.teams[0]!.slots[0]!.party[1]!;
    expect(incoming.tracedAbilityId).toBe('trace');
  });
});

describe('onSwitchIn — Screen Cleaner', () => {
  it('removes Reflect from both sides on switch-in', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'screen-cleaner';
    state.field.sideConditions[0]!.reflect = 5;
    state.field.sideConditions[1]!.reflect = 5;

    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.sideConditions[0]!.reflect).toBe(0);
    expect(newState.field.sideConditions[1]!.reflect).toBe(0);
    const brokenEvents = events.filter(e => e.type === 'screen-broken' && e.data['screen'] === 'reflect');
    expect(brokenEvents).toHaveLength(2);
  });

  it('removes Light Screen and Aurora Veil from both sides', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'screen-cleaner';
    state.field.sideConditions[0]!.lightScreen = 5;
    state.field.sideConditions[1]!.auroraVeil = 3;

    const engine = new BattleEngine();
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(newState.field.sideConditions[0]!.lightScreen).toBe(0);
    expect(newState.field.sideConditions[1]!.auroraVeil).toBe(0);
  });

  it('does not emit screen-broken events for screens that were not active', () => {
    const state = makeStateWithBench();
    state.teams[0]!.slots[0]!.party[1]!.ability = 'screen-cleaner';
    // Only side 0 has Reflect active
    state.field.sideConditions[0]!.reflect = 5;

    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' } as SwitchAction,
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const brokenReflect = events.filter(e => e.type === 'screen-broken' && e.data['screen'] === 'reflect');
    expect(brokenReflect).toHaveLength(1); // only the active one
  });
});
