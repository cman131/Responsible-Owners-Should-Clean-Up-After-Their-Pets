import { describe, it, expect, vi } from 'vitest';
import { BattleEngine } from '../BattleEngine.js';
import { MoveEffectRegistry } from '../MoveEffectRegistry.js';
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

describe('Critical hits', () => {
  it('emits crit event when rng forces a crit (both calls return 0)', () => {
    // Call 0 (accuracy): 0*100=0 < 100 → hit
    // Call 1 (crit):     0 < 1/24 → crit
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'crit' && e.data['slotId'] === 'slot-b1')).toBe(true);
  });

  it('does not emit crit event when rng forces no crit', () => {
    // Call 0 (accuracy): 0 → hit; Call 1 (crit): 1 → no crit (1 < 1/24 is false)
    let callIndex = 0;
    const engine = new BattleEngine({ rng: () => (callIndex++ === 0 ? 0 : 1) });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'crit')).toBe(false);
  });

  it('Focus Energy raises crit stage so rng=0.4 crits (stage 2 threshold = 0.5)', () => {
    // Call 0 (accuracy): 0 → hit; Call 1 (crit): 0.4 < 0.5 (stage 2) → crit
    // Without FE: 0.4 < 1/24 (0.042) → false → no crit
    let c = 0;
    const rng = () => (c++ === 0 ? 0 : 0.4);
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'focusenergy' });
    const engine = new BattleEngine({ rng });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'crit' && e.data['slotId'] === 'slot-b1')).toBe(true);
  });

  it('crit event appears after damage-dealt event in the event list', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageIdx = events.findIndex((e) => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1');
    const critIdx = events.findIndex((e) => e.type === 'crit' && e.data['slotId'] === 'slot-b1');
    expect(damageIdx).toBeGreaterThanOrEqual(0);
    expect(critIdx).toBeGreaterThan(damageIdx);
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

  it('a sleeping pokemon with counter 0 wakes up and deals damage on the same turn', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.status = 'slp';
    p1.volatileStatus = [{ name: 'sleep', counter: 0 }];
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // p1 woke up and attacked — p2 should have taken damage
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.currentHp).toBeLessThan(100);
    // p1 status cleared
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
    expect(events.some(e => e.type === 'status-cured')).toBe(true);
  });
});

describe('Volatile move dispatch', () => {
  it('Confuse Ray applies confusion to the target', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'confuseray', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'confusion')).toBe(true);
    expect(events.some(e => e.type === 'volatile-applied')).toBe(true);
  });

  it('Leech Seed applies volatile and drains EOT HP from target', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'leechseed', currentPp: 10, maxPp: 10 };
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    // Leech Seed applied — p2 is now seeded
    expect(p2.volatileStatus.some(v => v.name === 'leech-seed')).toBe(true);
    // EOT drained floor(100/8)=12 HP from p2 (p1 used a status move so p2 took no direct damage)
    expect(p2.currentHp).toBe(88);
    expect(events.some(e => e.type === 'damage-dealt' && e.data['source'] === 'leech-seed')).toBe(true);
  });

  it('Bind applies bound volatile to target and deals EOT damage', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bind', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine();
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'bound')).toBe(true);
    // EOT bind damage should have happened this turn
    const boundDmgEvt = events.find(e => e.type === 'damage-dealt' && e.data['source'] === 'bound');
    expect(boundDmgEvt).toBeDefined();
  });
});

describe('Previously-unimplemented status moves', () => {
  it('Agility raises user Speed by 2 stages', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'agility', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spe).toBe(2);
  });

  it('Barrier raises user Defense by 2 stages', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'barrier', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.def).toBe(2);
  });

  it('Dragon Dance raises user Attack and Speed by 1 each', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'dragondance', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.atk).toBe(1);
    expect(p1.statBoosts.spe).toBe(1);
  });

  it('Quiver Dance raises user SpA, SpD, and Spe by 1 each', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'quiverdance', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.spa).toBe(1);
    expect(p1.statBoosts.spd).toBe(1);
    expect(p1.statBoosts.spe).toBe(1);
  });

  it('Shell Smash applies mixed stat changes', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'shellsmash', currentPp: 15, maxPp: 15 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.statBoosts.def).toBe(-1);
    expect(p1.statBoosts.spd).toBe(-1);
    expect(p1.statBoosts.atk).toBe(2);
    expect(p1.statBoosts.spa).toBe(2);
    expect(p1.statBoosts.spe).toBe(2);
  });

  it('Leer lowers target Defense by 1', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'leer', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.def).toBe(-1);
  });

  it('Growl lowers target Attack by 1', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'growl', currentPp: 40, maxPp: 40 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(-1);
  });

  it('Screech lowers target Defense by 2', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'screech', currentPp: 40, maxPp: 40 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.def).toBe(-2);
  });

  it('Charm lowers target Attack by 2', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'charm', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.atk).toBe(-2);
  });

  it('Flash lowers target Accuracy by 1', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'flash', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.accuracy).toBe(-1);
  });

  it('Recover heals user for 50% max HP', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 40;
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'recover', currentPp: 5, maxPp: 5 };
    const { newState, events } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBeGreaterThan(40);
    expect(events.some(e => e.type === 'heal')).toBe(true);
  });

  it('Glare applies paralysis to the target', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'glare', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('par');
  });

  it('Hypnosis puts the target to sleep', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'hypnosis', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBe('slp');
  });

  it('Rain Dance sets rain weather for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'raindance', currentPp: 5, maxPp: 5 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.weather?.type).toBe('rain');
    // Weather is set to 5 turns then decremented by 1 at end-of-turn, so 4 remains
    expect(newState.field.weather?.turnsRemaining).toBe(4);
  });

  it('Electric Terrain sets electric terrain for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'electricterrain', currentPp: 10, maxPp: 10 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.terrain?.type).toBe('electric');
    // Terrain is set to 5 turns then decremented by 1 at end-of-turn, so 4 remains
    expect(newState.field.terrain?.turnsRemaining).toBe(4);
  });

  it('Reflect sets reflect on user team side for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'reflect', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[0]!.reflect).toBe(5);
  });

  it('Light Screen sets lightScreen on user team side for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'lightscreen', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[0]!.lightScreen).toBe(5);
  });

  it('Stealth Rock sets stealthRock on foe team side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'stealthrock', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[1]!.stealthRock).toBe(true);
  });

  it('Spikes increments spikes layer on foe side', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'spikes', currentPp: 20, maxPp: 20 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.field.sideConditions[1]!.spikes).toBe(1);
  });

  it('Trick Room activates for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'trickroom', currentPp: 5, maxPp: 5 };
    const { newState, events } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // Trick room is set to 5 turns then decremented by 1 at end-of-turn, so 4 remains
    expect(newState.field.trickroom).toBe(4);
    expect(events.some(e => e.type === 'trickroom-started')).toBe(true);
  });

  it('emits move-failed with reason unimplemented for an unknown status move', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'swordsdance', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ registry: new MoveEffectRegistry() }); // empty registry
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const fail = events.find(e => e.type === 'move-failed');
    expect(fail).toBeDefined();
    expect(fail!.data['reason']).toBe('unimplemented');
  });
});

describe('Accuracy roll', () => {
  it('emits miss event when rng forces a miss (rng returns 1.0)', () => {
    // Flamethrower accuracy = 100; rng=1.0 → 1.0*100=100 ≥ 100 → miss
    const engine = new BattleEngine({ rng: () => 1 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const missEvent = events.find(
      (e) => e.type === 'miss' && e.data['attackerSlotId'] === 'slot-a1',
    );
    expect(missEvent).toBeDefined();
    expect(missEvent!.data['moveId']).toBe('flamethrower');
  });

  it('does not emit miss event when rng forces a hit (rng returns 0)', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'miss')).toBe(false);
    expect(events.some((e) => e.type === 'damage-dealt')).toBe(true);
  });

  it('auto-hit move (accuracy: true) never misses even when rng returns 1', () => {
    const engine = new BattleEngine({ rng: () => 1 });
    const state = make1v1State();
    // Swift has accuracy: true
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'swift', currentPp: 20, maxPp: 20 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some((e) => e.type === 'miss' && e.data['attackerSlotId'] === 'slot-a1')).toBe(false);
    expect(
      events.some((e) => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1'),
    ).toBe(true);
  });

  it('a missed move does not reduce target HP', () => {
    const engine = new BattleEngine({ rng: () => 1 });
    const state = make1v1State();
    const hpBefore = state.teams[1]!.slots[0]!.party[0]!.currentHp;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // Both miss (rng=1 causes both to miss) → neither takes damage
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(hpBefore);
  });
});

describe('Thaw on fire hit', () => {
  it('thaws a frozen defender struck by a Fire-type move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.status = 'frz';

    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // Flamethrower (Fire)
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const thawEvent = events.find(
      (e) =>
        e.type === 'status-cured' &&
        e.data['slotId'] === 'slot-b1' &&
        e.data['reason'] === 'fire-hit',
    );
    expect(thawEvent).toBeDefined();
    expect(thawEvent!.data['status']).toBe('frz');
    // Damage is still dealt after thaw
    expect(events.some((e) => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1')).toBe(true);
    // Status cleared on defender
    expect(newState.teams[1]!.slots[0]!.party[0]!.status).toBeUndefined();
  });

  it('does not fire-thaw a frozen defender struck by a non-Fire move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    // Replace p1's Flamethrower with Surf (Water type)
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'surf', currentPp: 15, maxPp: 15 };
    state.teams[1]!.slots[0]!.party[0]!.status = 'frz';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // Surf (Water)
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some((e) => e.type === 'status-cured' && e.data['reason'] === 'fire-hit')).toBe(false);
  });
});

describe('Secondary effects — single-hit wiring', () => {
  it('Crunch drops target Defense by 1 stage when secondary roll succeeds', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'crunch', currentPp: 15, maxPp: 15 };
    // rng sequence for slot-a1 Crunch:
    //   roll 0 (accuracy): 0 → 0*100=0 < 100 → hit
    //   roll 1 (crit):     0.5 → 0.5 < 1/24 is false → no crit
    //   roll 2 (secondary): 0.1 → 0.1*100=10 < 20 → secondary fires → def -1
    // Note: randomDamageFactor() uses Math.random() directly, not this.rng
    const rolls = [0, 0.5, 0.1, 0, 0.5, 0.1];
    let rollIdx = 0;
    const engine = new BattleEngine({ rng: () => rolls[rollIdx++ % rolls.length]! });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.def).toBe(-1);
  });
});

describe('Multi-hit moves', () => {
  it('Bullet Seed hits the number of times determined by rng', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bulletseed', currentPp: 30, maxPp: 30 };
    // rng: accuracy=0(hit), hitCount=0(→2 hits), then per hit: crit=1(no), damage falls back to Math.random
    const rolls = [0, 0, 1, 1];
    let i = 0;
    const engine = new BattleEngine({ rng: () => rolls[i++ % rolls.length]! });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1');
    expect(damageEvents).toHaveLength(2);
  });

  it('multi-hit stops early if target faints mid-sequence', () => {
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1;
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bulletseed', currentPp: 30, maxPp: 30 };
    const rolls = [0, 0, 1, 1];
    let i = 0;
    const engine = new BattleEngine({ rng: () => rolls[i++ % rolls.length]! });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1');
    expect(damageEvents).toHaveLength(1);
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-b1')).toBe(true);
  });

  it('hit count distribution over 1000 trials is approximately 3/8, 3/8, 1/8, 1/8', () => {
    const counts = { 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let trial = 0; trial < 1000; trial++) {
      const state = make1v1State();
      state.teams[1]!.slots[0]!.party[0]!.currentHp = 9999;
      state.teams[1]!.slots[0]!.party[0]!.maxHp = 9999;
      state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'bulletseed', currentPp: 30, maxPp: 30 };
      let first = true;
      const engine = new BattleEngine({ rng: () => { if (first) { first = false; return 0; } return Math.random(); } });
      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
        'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
      });
      const hits = events.filter(e => e.type === 'damage-dealt' && e.data['targetSlotId'] === 'slot-b1').length;
      counts[hits as 2|3|4|5] = (counts[hits as 2|3|4|5] ?? 0) + 1;
    }
    expect(counts[2]! / 1000).toBeCloseTo(3 / 8, 1);
    expect(counts[3]! / 1000).toBeCloseTo(3 / 8, 1);
    expect(counts[4]! / 1000).toBeCloseTo(1 / 8, 1);
    expect(counts[5]! / 1000).toBeCloseTo(1 / 8, 1);
  });
});

describe('Charge-turn moves', () => {
  function makeSolarBeamState() {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
    return state;
  }

  it('T1: applies charge volatile, deals no damage', () => {
    const state = makeSolarBeamState();
    const engine = new BattleEngine({ rng: () => 0 });
    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(false);
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'charging-solarbeam')).toBe(true);
  });

  it('T2: removes charge volatile and deals damage', () => {
    const state = makeSolarBeamState();
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus = [{ name: 'charging-solarbeam' }];
    const engine = new BattleEngine({ rng: () => 0 });
    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(true);
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'charging-solarbeam')).toBe(false);
  });

  it('T1 in sun: skips charge, deals damage immediately', () => {
    const state = makeSolarBeamState();
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    const engine = new BattleEngine({ rng: () => 0 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')).toBe(true);
    const chargeVolatileApplied = events.some(e =>
      e.type === 'volatile-applied' && e.data['volatile'] === 'charging-solarbeam'
    );
    expect(chargeVolatileApplied).toBe(false);
  });
});

describe('endOfTurn — weather residual', () => {
  it('deals 1/16 maxHp chip to non-Rock/Ground/Steel Pokémon in sandstorm', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 3, fromAbility: false };
    // p1 is Charizard (Fire/Flying) — not immune
    // p2 is Charizard (Fire/Flying) — not immune
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['source'] === 'weather');
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
    // chip = floor(100 / 16) = 6
    expect(damageEvents[0]!.data['damage']).toBe(6);
  });

  it('does not chip Rock-type Pokémon in sandstorm', () => {
    // speciesId 95 = Onix (Rock/Ground) — immune to sand chip.
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'sand', turnsRemaining: 3, fromAbility: false };
    state.teams[1]!.slots[0]!.party[0] = makePokemon({ speciesId: 95, speciesName: 'onix' });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2WeatherDmg = events.filter(e =>
      e.type === 'damage-dealt' &&
      e.data['source'] === 'weather' &&
      e.data['slotId'] === 'slot-b1'
    );
    expect(p2WeatherDmg).toHaveLength(0);
  });

  it('deals 1/16 maxHp chip to non-Ice Pokémon in snow', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'snow', turnsRemaining: 3, fromAbility: false };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const damageEvents = events.filter(e => e.type === 'damage-dealt' && e.data['source'] === 'weather');
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('does not chip Ice-type Pokémon in snow', () => {
    // speciesId 144 = Articuno (Ice/Flying) — immune to snow chip.
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'snow', turnsRemaining: 3, fromAbility: false };
    state.teams[1]!.slots[0]!.party[0] = makePokemon({ speciesId: 144, speciesName: 'articuno' });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p2WeatherDmg = events.filter(e =>
      e.type === 'damage-dealt' &&
      e.data['source'] === 'weather' &&
      e.data['slotId'] === 'slot-b1'
    );
    expect(p2WeatherDmg).toHaveLength(0);
  });
});

describe('OHKO moves', () => {
  function makeOhkoState(attackerLevel: number, defenderLevel: number) {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.level = attackerLevel;
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'guillotine', currentPp: 5, maxPp: 5 };
    state.teams[1]!.slots[0]!.party[0]!.level = defenderLevel;
    return state;
  }

  it('always misses when defender level > attacker level', () => {
    const state = makeOhkoState(50, 60);
    const engine = new BattleEngine({ rng: () => 0 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'miss')).toBe(true);
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-b1')).toBe(false);
  });

  it('faints defender when roll hits (level 50 vs 40)', () => {
    const state = makeOhkoState(50, 40);
    // accuracy = clamp(30 + 50 - 40, 1, 100) = 40; rng=0 → 0 < 40 → hits
    const engine = new BattleEngine({ rng: () => 0 });
    const { events, newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'faint' && e.data['slotId'] === 'slot-b1')).toBe(true);
    expect(newState.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(0);
  });

  it('misses when rng roll fails (level 50 vs 50, accuracy=30, rng=0.31)', () => {
    const state = makeOhkoState(50, 50);
    // accuracy = clamp(30 + 0, 1, 100) = 30; rng=0.31 → 31 >= 30 → miss
    const engine = new BattleEngine({ rng: () => 0.31 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'miss')).toBe(true);
  });
});

describe('endOfTurn — Grassy Terrain', () => {
  it('heals grounded Pokémon by 1/16 maxHp each turn', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 5 };
    // Use Blastoise (speciesId 9, Water type) for p1 — grounded
    state.teams[0]!.slots[0]!.party[0]!.speciesId = 9;
    state.teams[0]!.slots[0]!.party[0]!.speciesName = 'blastoise';
    // Damage p1 so there's HP to heal (maxHp=100, heal = floor(100/16) = 6)
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 84; // 16 missing
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const healEvents = events.filter(e => e.type === 'heal' && e.data['reason'] === 'grassy-terrain');
    expect(healEvents.length).toBeGreaterThanOrEqual(1);
    // heal = floor(100 / 16) = 6
    expect(healEvents[0]!.data['amount']).toBe(6);
  });

  it('does not heal a Flying-type (not grounded)', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'grassy', turnsRemaining: 5 };
    // p1 is already Charizard (speciesId 6, Fire/Flying) — not grounded
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 80;
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const grassyHealP1 = events.filter(e =>
      e.type === 'heal' && e.data['reason'] === 'grassy-terrain' && e.data['slotId'] === 'slot-a1'
    );
    expect(grassyHealP1).toHaveLength(0);
  });
});

describe('endOfTurn — field counter decrements', () => {
  it('emits weather-ended and clears field.weather when turnsRemaining reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.weather = { type: 'rain', turnsRemaining: 1, fromAbility: false };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'weather-ended' && e.data['weather'] === 'rain')).toBe(true);
    expect(newState.field.weather).toBeUndefined();
  });

  it('emits terrain-ended and clears field.terrain when turnsRemaining reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'electric', turnsRemaining: 1 };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'terrain-ended' && e.data['terrain'] === 'electric')).toBe(true);
    expect(newState.field.terrain).toBeUndefined();
  });

  it('emits trickroom-ended when trickroom counter reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.trickroom = 1;
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'trickroom-ended')).toBe(true);
    expect(newState.field.trickroom).toBe(0);
  });

  it('emits gravity-ended when gravity counter reaches 0', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 1;
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'gravity-ended')).toBe(true);
    expect(newState.field.gravity).toBe(0);
  });
});
