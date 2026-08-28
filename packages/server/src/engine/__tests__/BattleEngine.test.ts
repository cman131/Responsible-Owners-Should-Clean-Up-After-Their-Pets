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
    // Terrain is set to 5 turns; end-of-turn does not yet decrement terrain, so 5 remains
    expect(newState.field.terrain?.turnsRemaining).toBe(5);
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
    // Trick room is set to 5 turns; end-of-turn does not yet decrement trickroom, so 5 remains
    expect(newState.field.trickroom).toBe(5);
    expect(events.some(e => e.type === 'field-effect-set')).toBe(true);
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
