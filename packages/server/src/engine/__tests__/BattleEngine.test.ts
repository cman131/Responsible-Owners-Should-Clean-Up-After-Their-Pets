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

  it('Black Sludge on non-Poison type emits damage-dealt at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'black-sludge';
    // default ability is 'blaze' (non-Poison)
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 }, // willowisp — no damage to p1 from p1
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const sludgeDamage = Math.floor(100 / 8); // 12
    expect(p1.currentHp).toBeLessThanOrEqual(100 - sludgeDamage);
    expect(events.some(e => e.type === 'damage-dealt' && e.data['source'] === 'black-sludge')).toBe(true);
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
    vi.spyOn(Math, 'random').mockReturnValue(0); // accuracy: 0 * 100 = 0 < 85 → always hits
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
    vi.restoreAllMocks();
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

  it('status-cured wake-up event includes pokemonName', () => {
    const state = make1v1State();
    const p1 = state.teams[0]!.slots[0]!.party[0]!;
    p1.status = 'slp';
    p1.volatileStatus = [{ name: 'sleep', counter: 0 }];
    const engine = new BattleEngine();
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const curedEvt = events.find(e => e.type === 'status-cured' && e.data['status'] === 'slp');
    expect(curedEvt).toBeDefined();
    expect(curedEvt!.data['pokemonName']).toBe('Charizard');
  });

  it('status-applied event for sleep includes pokemonName', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'hypnosis', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ rng: () => 0 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const appliedEvt = events.find(e => e.type === 'status-applied' && e.data['status'] === 'slp');
    expect(appliedEvt).toBeDefined();
    expect(appliedEvt!.data['pokemonName']).toBe('Charizard');
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
    const engine = new BattleEngine({ rng: () => 0 });
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
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces accuracy roll to hit (screech is 85%)
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'screech', currentPp: 40, maxPp: 40 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    vi.restoreAllMocks();
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
    const { newState } = new BattleEngine({ rng: () => 0 }).resolveTurn(state, {
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
    // Reflect is set to 5 turns then decremented by 1 at end-of-turn, so 4 remains
    expect(newState.field.sideConditions[0]!.reflect).toBe(4);
  });

  it('Light Screen sets lightScreen on user team side for 5 turns', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[1] = { moveId: 'lightscreen', currentPp: 30, maxPp: 30 };
    const { newState } = new BattleEngine().resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 1 },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    // Light Screen is set to 5 turns then decremented by 1 at end-of-turn, so 4 remains
    expect(newState.field.sideConditions[0]!.lightScreen).toBe(4);
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
    // rng sequence (buildActionOrder consumes 2 tieSeed calls first, then move execution):
    //   roll 0 (tieSeed slot-a1): 0.5 — unused (speeds differ, no tie)
    //   roll 1 (tieSeed slot-b1): 0.5 — unused
    //   roll 2 (accuracy): 0 → 0*100=0 < 100 → hit
    //   roll 3 (crit):     0.5 → 0.5 < 1/24 is false → no crit
    //   roll 4 (secondary): 0.1 → 0.1*100=10 < 20 → secondary fires → def -1
    // Note: randomDamageFactor() uses Math.random() directly, not this.rng
    const rolls = [0.5, 0.5, 0, 0.5, 0.1, 0.5, 0.5, 0, 0.5, 0.1];
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
    // rng sequence (buildActionOrder consumes 2 tieSeed calls first):
    //   rolls 0-1: tieSeeds (no tie, ignored)
    //   roll 2: accuracy=0(hit), roll 3: hitCount=0(→2 hits), then per hit: crit=1(no)
    const rolls = [0.5, 0.5, 0, 0, 1, 1];
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
    // rolls 0-1: tieSeeds (ignored), roll 2: accuracy=0(hit), roll 3: hitCount=0(→2 hits), roll 4+: crit=1(no)
    const rolls = [0.5, 0.5, 0, 0, 1, 1];
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

describe('buildActionOrder — Trick Room', () => {
  it('slower Pokémon moves first when Trick Room is active', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State(); // p1 spe=100 (slot-a1), p2 spe=80 (slot-b1)
    state.field.trickroom = 3;

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const moveUsedEvents = events.filter(e => e.type === 'move-used');
    // p2 (spe=80, slower) should move first under Trick Room
    expect(moveUsedEvents[0]!.data['attackerSlotId']).toBe('slot-b1');
  });

  it('faster Pokémon moves first when Trick Room is NOT active', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State(); // p1 spe=100, p2 spe=80
    state.field.trickroom = 0;

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const moveUsedEvents = events.filter(e => e.type === 'move-used');
    expect(moveUsedEvents[0]!.data['attackerSlotId']).toBe('slot-a1');
  });
});

describe('buildActionOrder — speed-tie tiebreaker', () => {
  it('uses injected rng for speed ties, not Math.random', () => {
    // Freeze Math.random so the buggy comparator always returns the same value.
    // If the bug exists, both runs produce the same order regardless of injected rng.
    // If the fix is in place, opposite tieSeed sequences produce opposite first-mover results.
    vi.spyOn(Math, 'random').mockReturnValue(0);

    function makeEqualSpeedState() {
      const s = make1v1State();
      s.teams[1]!.slots[0]!.party[0]!.stats.spe = 100; // match slot-a1 speed
      return s;
    }

    // Run A: slot-a1 gets high tieSeed (0.9), slot-b1 gets low tieSeed (0.1)
    let callA = 0;
    const rngA = () => { callA++; return callA === 1 ? 0.9 : callA === 2 ? 0.1 : 0.5; };
    const { events: eventsA } = new BattleEngine({ rng: rngA }).resolveTurn(makeEqualSpeedState(), {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const firstMoverA = eventsA.find(e => e.type === 'move-used')?.data['attackerSlotId'];

    // Run B: slot-a1 gets low tieSeed (0.1), slot-b1 gets high tieSeed (0.9) — opposite
    let callB = 0;
    const rngB = () => { callB++; return callB === 1 ? 0.1 : callB === 2 ? 0.9 : 0.5; };
    const { events: eventsB } = new BattleEngine({ rng: rngB }).resolveTurn(makeEqualSpeedState(), {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const firstMoverB = eventsB.find(e => e.type === 'move-used')?.data['attackerSlotId'];

    // If injected rng controls the tie, opposite seeds must yield opposite first movers.
    // Bug: Math.random frozen to 0 → same result both runs → firstMoverA === firstMoverB.
    expect(firstMoverA).not.toBe(firstMoverB);
    vi.restoreAllMocks();
  });
});

describe('executeMove — weather and gravity accuracy', () => {
  it('Thunder always hits in rain (never misses across 100 trials)', () => {
    let misses = 0;
    for (let i = 0; i < 100; i++) {
      const engine = new BattleEngine({ rng: () => Math.random() });
      const state = make1v1State();
      state.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };
      state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunder', currentPp: 10, maxPp: 10 };
      const { events } = engine.resolveTurn(state, {
        'slot-a1': { type: 'move', moveIndex: 0 },
        'slot-b1': { type: 'move', moveIndex: 0 },
      });
      if (events.some(e => e.type === 'miss' && e.data['moveId'] === 'thunder')) misses++;
    }
    expect(misses).toBe(0);
  });

  it('Gravity boosts accuracy — thunder at 50% in sun becomes 83% under gravity (fixed rng=0.5 lands)', () => {
    // Thunder in sun has 50% accuracy. With gravity: floor(50 * 5/3) = 83%.
    // rng=0.5 → rng * 100 = 50 < 83 → hits (no miss event).
    // Without gravity: rng*100=50 >= 50 → misses.
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 5;
    state.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunder', currentPp: 10, maxPp: 10 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    // With gravity boost: 83% — rng=0.5 means 50 < 83 → hits (no miss event)
    expect(events.some(e => e.type === 'miss' && e.data['moveId'] === 'thunder')).toBe(false);
  });
});

describe('executeMove — Psychic Terrain priority block', () => {
  it('blocks a priority move targeting a grounded Pokémon under Psychic Terrain', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'psychic', turnsRemaining: 5 };
    // Give p1 a priority move — quickattack has priority: 1
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'quickattack', currentPp: 30, maxPp: 30 };
    // Make p2 a grounded Pokémon (Blastoise, Water type — not Flying)
    state.teams[1]!.slots[0]!.party[0]!.speciesId = 9;
    state.teams[1]!.slots[0]!.party[0]!.speciesName = 'blastoise';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failedEvt = events.find(e => e.type === 'move-failed' && e.data['reason'] === 'psychic-terrain');
    expect(failedEvt).toBeDefined();
    expect(failedEvt!.data['targetSlotId']).toBe('slot-b1');
  });

  it('does not block a normal-priority move under Psychic Terrain', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.terrain = { type: 'psychic', turnsRemaining: 5 };
    // default move (flamethrower) has priority 0

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'psychic-terrain')).toBe(false);
  });
});

describe('executeMove — Gravity move blocking', () => {
  it('emits move-failed with reason gravity when an airborne move is used under Gravity', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 5;
    // Override p1's first move to 'fly'
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'fly', currentPp: 15, maxPp: 15 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const failedEvt = events.find(e => e.type === 'move-failed' && e.data['reason'] === 'gravity');
    expect(failedEvt).toBeDefined();
    expect(failedEvt!.data['moveId']).toBe('fly');
  });

  it('allows moves not in the blocked list under Gravity', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.field.gravity = 5;
    // p1's default move (moveIndex 0) is flamethrower — not gravity-blocked

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'gravity')).toBe(false);
  });
});

describe('executeMove — Solar Beam / Weather Ball', () => {
  it('Solar Beam deals less damage in rain (half base power)', () => {
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const mkState = () => {
      const s = make1v1State();
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'solarbeam', currentPp: 10, maxPp: 10 };
      // Pre-apply charge volatile so it fires this turn
      s.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'charging-solarbeam' });
      return s;
    };

    const clear = mkState();
    const rain = mkState();
    rain.field.weather = { type: 'rain', turnsRemaining: 5, fromAbility: false };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events: clearEvents } = engine.resolveTurn(clear, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: rainEvents }  = engine.resolveTurn(rain,  { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });

    mockRandom.mockRestore();

    const clearDmg = clearEvents.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const rainDmg  = rainEvents.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    expect(clearDmg).toBeGreaterThan(0);
    expect(rainDmg).toBeGreaterThan(0);
    // Half base power → roughly half damage (rain also gives 1.5× water moves but no boost to Grass moves)
    expect(clearDmg).toBeGreaterThan(rainDmg);
  });

  it('Weather Ball doubles power and changes type in sun', () => {
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const clearState = make1v1State();
    clearState.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'weatherball', currentPp: 10, maxPp: 10 };

    const sunState = make1v1State();
    sunState.field.weather = { type: 'sun', turnsRemaining: 5, fromAbility: false };
    sunState.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'weatherball', currentPp: 10, maxPp: 10 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events: clearEvts } = engine.resolveTurn(clearState, { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: sunEvts }   = engine.resolveTurn(sunState,   { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });

    mockRandom.mockRestore();

    const clearDmg = clearEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const sunDmg   = sunEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    // Sun: 80bp Fire ×1.5 sun = effectively 120bp-equivalent (plus Fire effectiveness vs target).
    // Clear: 50bp Normal. Sun should deal significantly more damage.
    expect(sunDmg).toBeGreaterThan(clearDmg);
  });
});

describe('executeMove — terrain power modifiers', () => {
  it('Electric move by grounded attacker deals 1.5× damage in Electric Terrain', () => {
    const mkState = (withTerrain: boolean) => {
      const s = make1v1State();
      // Give p1 a grounded Pokémon (Blastoise, Water type)
      s.teams[0]!.slots[0]!.party[0]!.speciesId = 9;
      s.teams[0]!.slots[0]!.party[0]!.speciesName = 'blastoise';
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
      // Give p2 enough HP so damage isn't capped by currentHp
      s.teams[1]!.slots[0]!.party[0]!.maxHp = 300;
      s.teams[1]!.slots[0]!.party[0]!.currentHp = 300;
      if (withTerrain) s.field.terrain = { type: 'electric', turnsRemaining: 5 };
      return s;
    };

    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const engine = new BattleEngine({ rng: () => 0.85 });
    const { events: plainEvts }    = engine.resolveTurn(mkState(false), { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: electricEvts } = engine.resolveTurn(mkState(true),  { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    mockRandom.mockRestore();

    const plainDmg    = plainEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const electricDmg = electricEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    expect(electricDmg).toBeGreaterThan(plainDmg);
    expect(Math.abs(electricDmg / plainDmg - 1.5)).toBeLessThan(0.05);
  });

  it('Earthquake deals half power in Grassy Terrain', () => {
    const mkState = (withTerrain: boolean) => {
      const s = make1v1State();
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'earthquake', currentPp: 10, maxPp: 10 };
      // Replace p2 with Blastoise (Water, grounded) — not immune to Ground moves
      s.teams[1]!.slots[0]!.party[0]!.speciesId = 9;
      s.teams[1]!.slots[0]!.party[0]!.speciesName = 'blastoise';
      if (withTerrain) s.field.terrain = { type: 'grassy', turnsRemaining: 5 };
      return s;
    };

    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const engine = new BattleEngine({ rng: () => 0.85 });
    const { events: plainEvts }  = engine.resolveTurn(mkState(false), { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: grassyEvts } = engine.resolveTurn(mkState(true),  { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    mockRandom.mockRestore();

    const plainDmg  = plainEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const grassyDmg = grassyEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    expect(grassyDmg).toBeLessThan(plainDmg);
    expect(Math.abs(plainDmg / grassyDmg - 2)).toBeLessThan(0.1);
  });

  it('Dragon move is halved against a grounded defender in Misty Terrain', () => {
    const mkState = (withTerrain: boolean) => {
      const s = make1v1State();
      s.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'dragonpulse', currentPp: 10, maxPp: 10 };
      // p2 is Charizard (Fire/Flying) — NOT grounded.
      // For Misty Terrain to halve Dragon, the defender must be grounded.
      // Replace p2 with Blastoise (Water, grounded)
      s.teams[1]!.slots[0]!.party[0]!.speciesId = 9;
      s.teams[1]!.slots[0]!.party[0]!.speciesName = 'blastoise';
      if (withTerrain) s.field.terrain = { type: 'misty', turnsRemaining: 5 };
      return s;
    };

    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const engine = new BattleEngine({ rng: () => 0.85 });
    const { events: plainEvts } = engine.resolveTurn(mkState(false), { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    const { events: mistyEvts } = engine.resolveTurn(mkState(true),  { 'slot-a1': { type: 'move', moveIndex: 0 }, 'slot-b1': { type: 'move', moveIndex: 0 } });
    mockRandom.mockRestore();

    const plainDmg = plainEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;
    const mistyDmg = mistyEvts.find(e => e.type === 'damage-dealt' && e.data['attackerSlotId'] === 'slot-a1')?.data['damage'] as number;

    expect(mistyDmg).toBeLessThan(plainDmg);
    expect(Math.abs(plainDmg / mistyDmg - 2)).toBeLessThan(0.1);
  });
});

describe('screens — re-cast guard', () => {
  it('Reflect fails (move-failed) when Reflect is already active', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.reflect = 3;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'reflect', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'already-active')).toBe(true);
  });

  it('Aurora Veil fails when weather is not snow', () => {
    const state = make1v1State(); // no weather
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'auroraveil', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'move-failed' && e.data['reason'] === 'no-hail')).toBe(true);
  });

  it('Aurora Veil succeeds in snow weather', () => {
    const state = make1v1State();
    state.field.weather = { type: 'snow', turnsRemaining: 5, fromAbility: false };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'auroraveil', currentPp: 20, maxPp: 20 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(events.some(e => e.type === 'side-condition-set')).toBe(true);
    // Aurora Veil is set to 5 turns then decremented by 1 at end-of-turn, so 4 remains
    expect(newState.field.sideConditions[0]!.auroraVeil).toBe(4);
  });
});

describe('Defog', () => {
  it('lowers target evasion, clears hazards from both sides, and clears screens from target side', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.stealthRock = true;       // user's side
    state.field.sideConditions[0]!.reflect = 3;              // user has Reflect too
    state.field.sideConditions[1]!.stealthRock = true;       // foe's side
    state.field.sideConditions[1]!.reflect = 3;              // foe's screen
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'defog', currentPp: 15, maxPp: 15 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.field.sideConditions[0]!.stealthRock).toBe(false);
    expect(newState.field.sideConditions[1]!.stealthRock).toBe(false);
    expect(newState.field.sideConditions[1]!.reflect).toBe(0);
    expect(newState.field.sideConditions[0]!.reflect).toBeGreaterThan(0); // user screens NOT cleared
    expect(events.some(e => e.type === 'hazard-cleared')).toBe(true);
    expect(events.some(e => e.type === 'screen-broken')).toBe(true);
  });

  it('removes active terrain and emits terrain-ended', () => {
    const state = make1v1State();
    state.field.terrain = { type: 'electric', turnsRemaining: 3 };
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'defog', currentPp: 15, maxPp: 15 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.field.terrain).toBeUndefined();
    expect(events.some(e => e.type === 'terrain-ended')).toBe(true);
  });
});

describe('Court Change', () => {
  it('swaps both sides sideConditions wholesale', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.reflect = 4;
    state.field.sideConditions[1]!.stealthRock = true;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'courtchange', currentPp: 10, maxPp: 10 };
    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    expect(newState.field.sideConditions[0]!.stealthRock).toBe(true);  // swapped
    expect(newState.field.sideConditions[1]!.reflect).toBe(3);          // swapped, then decremented by 1 at end-of-turn
    expect(events.some(e => e.type === 'court-change')).toBe(true);
  });
});

describe('screens — damage halving', () => {
  it('Reflect halves physical damage dealt to the defending side', () => {
    // Mock Math.random to make randomDamageFactor deterministic (0.9 → factor = 1.0)
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    // rng sequence: 0 (accuracy hit), 1 (no crit) alternating for each attack
    const makeRng = () => { let c = 0; return () => (c++ % 2 === 0 ? 0 : 1); };

    const withReflect = make1v1State();
    withReflect.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    withReflect.field.sideConditions[1]!.reflect = 5;

    const withoutReflect = make1v1State();
    withoutReflect.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };

    const engineWith = new BattleEngine({ rng: makeRng() });
    const { newState: afterReflect } = engineWith.resolveTurn(withReflect, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const engineWithout = new BattleEngine({ rng: makeRng() });
    const { newState: afterNoReflect } = engineWithout.resolveTurn(withoutReflect, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    mockRandom.mockRestore();

    const p2HpWithReflect = afterReflect.teams[1]!.slots[0]!.party[0]!.currentHp;
    const p2HpNoReflect = afterNoReflect.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(p2HpWithReflect).toBeGreaterThan(p2HpNoReflect);
  });

  it('critical hit bypasses Reflect (deals full damage)', () => {
    // Mock Math.random to make randomDamageFactor deterministic (0.9 → factor = 1.0)
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const engine = new BattleEngine({ rng: () => 0 }); // rng=0 → always crit
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    state.field.sideConditions[1]!.reflect = 5;

    const engineNoCrit = new BattleEngine({ rng: () => 1 }); // rng=1 → never crit
    const stateNoCrit = make1v1State();
    stateNoCrit.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    stateNoCrit.field.sideConditions[1]!.reflect = 5;

    const { newState: afterCrit } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const { newState: afterNoCrit } = engineNoCrit.resolveTurn(stateNoCrit, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    mockRandom.mockRestore();

    const p2HpCrit = afterCrit.teams[1]!.slots[0]!.party[0]!.currentHp;
    const p2HpNoCrit = afterNoCrit.teams[1]!.slots[0]!.party[0]!.currentHp;
    // Crit ignores Reflect → more damage → less HP remaining
    expect(p2HpCrit).toBeLessThan(p2HpNoCrit);
  });
});

describe('entry hazards — switch-in', () => {
  it('Stealth Rock damages the incoming Pokémon on switch-in', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'p1-bench', maxHp: 100, currentHp: 100 });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.field.sideConditions[0]!.stealthRock = true;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'hazard-damage' && e.data['hazard'] === 'stealthRock')).toBe(true);
    const benchAfter = newState.teams[0]!.slots[0]!.party.find(p => p.instanceId === 'p1-bench');
    expect(benchAfter!.currentHp).toBeLessThan(100);
  });

  it('Spikes (3 layers) deals 25 damage to a 100 HP grounded switch-in', () => {
    const state = make1v1State();
    // Use Blastoise (speciesId 9, Water type) — grounded, so Spikes apply
    const bench = makePokemon({ instanceId: 'p1-bench', speciesId: 9, speciesName: 'blastoise', maxHp: 100, currentHp: 100 });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.field.sideConditions[0]!.spikes = 3;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: 'p1-bench' },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const spikesDmg = events.find(e => e.type === 'hazard-damage' && e.data['hazard'] === 'spikes');
    expect(spikesDmg!.data['damage']).toBe(25);
  });
});

describe('Rapid Spin — end-to-end', () => {
  it('clears Stealth Rock from user side and grants +1 Spe after successful hit', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.stealthRock = true;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'rapidspin', currentPp: 40, maxPp: 40 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(newState.field.sideConditions[0]!.stealthRock).toBe(false);
    expect(events.some(e => e.type === 'hazard-cleared' && e.data['hazard'] === 'stealthRock')).toBe(true);
    expect(newState.teams[0]!.slots[0]!.party[0]!.statBoosts.spe).toBe(1);
  });
});

describe('Brick Break — end-to-end', () => {
  it('removes Reflect and Light Screen from target side (not Aurora Veil)', () => {
    const state = make1v1State();
    state.field.sideConditions[1]!.reflect = 3;
    state.field.sideConditions[1]!.lightScreen = 3;
    state.field.sideConditions[1]!.auroraVeil = 3;
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'brickbreak', currentPp: 15, maxPp: 15 };

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(newState.field.sideConditions[1]!.reflect).toBe(0);
    expect(newState.field.sideConditions[1]!.lightScreen).toBe(0);
    expect(newState.field.sideConditions[1]!.auroraVeil).toBeGreaterThan(0); // Brick Break doesn't clear Aurora Veil
    expect(events.filter(e => e.type === 'screen-broken')).toHaveLength(2);
  });
});

describe('screens — turn counter + expiry', () => {
  it('Reflect counter decrements each turn and emits screen-ended at 0', () => {
    const state = make1v1State();
    state.field.sideConditions[0]!.reflect = 1;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(newState.field.sideConditions[0]!.reflect).toBe(0);
    expect(events.some(e => e.type === 'screen-ended' && e.data['screen'] === 'reflect')).toBe(true);
  });
});

describe('Pivot moves (U-turn / Volt Switch / Flip Turn)', () => {
  it('resolveTurn returns pivotSlots when attacker has bench', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'bench-a', nickname: 'Bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'uturn', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(result.pivotSlots).toEqual(['slot-a1']);
    expect(result.remainingSlotOrder).toBeDefined();
    expect(result.remainingActions).toBeDefined();
    expect(result.movedSlotIds).toBeDefined();
    expect(result.events.some((e) => e.type === 'move-used')).toBe(true);
    expect(result.events.some((e) => e.type === 'damage-dealt')).toBe(true);
    expect(result.newState.turnNumber).toBe(1);
  });

  it('emits pivot-skipped when attacker has no bench', () => {
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'uturn', currentPp: 20, maxPp: 20 };

    const engine = new BattleEngine({ rng: () => 0 });
    const result = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(result.pivotSlots).toBeUndefined();
    expect(result.events.some((e) => e.type === 'pivot-skipped')).toBe(true);
    expect(result.newState.turnNumber).toBe(2);
  });
});

describe('BattleEngine.resumeTurn', () => {
  it('processes remaining actions and EOT after a pivot interrupt', () => {
    const state = make1v1State();
    const bench = makePokemon({ instanceId: 'bench-a', nickname: 'Bench' });
    state.teams[0]!.slots[0]!.party.push(bench);
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'uturn', currentPp: 20, maxPp: 20 };
    state.teams[1]!.slots[0]!.party[0]!.currentHp = 1000;
    state.teams[1]!.slots[0]!.party[0]!.maxHp = 1000;

    const engine = new BattleEngine({ rng: () => 0 });

    const interrupted = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(interrupted.pivotSlots).toEqual(['slot-a1']);

    const afterSwitch = engine.processForceSwitch(
      interrupted.newState,
      'slot-a1',
      'bench-a',
      'forced',
    );
    expect(afterSwitch.events.some((e) => e.type === 'pokemon-switched')).toBe(true);

    const resumed = engine.resumeTurn(
      afterSwitch.newState,
      interrupted.remainingSlotOrder!,
      interrupted.remainingActions!,
      interrupted.movedSlotIds!,
    );

    expect(resumed.events.some((e) => e.type === 'move-used')).toBe(true);
    expect(resumed.newState.turnNumber).toBe(2);
    expect(resumed.pivotSlots).toBeUndefined();
  });

  it('increments turn number to 2 even when remaining actions list is empty', () => {
    const state = make1v1State();
    const movedSlotIds = new Set(['slot-a1', 'slot-b1']);
    const engine = new BattleEngine({ rng: () => 0 });
    const resumed = engine.resumeTurn(state, [], {}, movedSlotIds);
    expect(resumed.newState.turnNumber).toBe(2);
  });
});

describe('Struggle — all-PP-depleted override', () => {
  it('emits move-used with moveId=struggle when all move PP is 0', () => {
    const state = make1v1State();
    const active = state.teams[0]!.slots[0]!.party[0]!;
    for (const m of active.moves) m.currentPp = 0;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    expect(events.some(e => e.type === 'move-used' && e.data['moveId'] === 'struggle')).toBe(true);
  });

  it('applies 1/4 max-HP recoil to the user after Struggle', () => {
    const state = make1v1State();
    const active = state.teams[0]!.slots[0]!.party[0]!;
    for (const m of active.moves) m.currentPp = 0;
    const expectedRecoil = Math.floor(active.maxHp / 4); // 25 for maxHp=100

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const recoilEvent = events.find(
      e => e.type === 'damage-dealt' && e.data['source'] === 'recoil' && e.data['slotId'] === 'slot-a1'
    );
    expect(recoilEvent).toBeDefined();
    expect(recoilEvent!.data['damage']).toBe(expectedRecoil);
  });

  it('does not decrement PP when Struggle is used', () => {
    const state = make1v1State();
    const active = state.teams[0]!.slots[0]!.party[0]!;
    for (const m of active.moves) m.currentPp = 0;

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const updatedActive = newState.teams[0]!.slots[0]!.party[0]!;
    for (const m of updatedActive.moves) {
      expect(m.currentPp).toBe(0); // stays at 0, no underflow
    }
  });
});

describe('executeSwitch — Ingrain blocks voluntary switch', () => {
  it('blocks a voluntary switch when the active Pokémon has Ingrain', () => {
    const state = make1v1State();
    // Give the active Pokémon a second party member to switch to
    const active = state.teams[0]!.slots[0]!.party[0]!;
    const bench = makePokemon();
    state.teams[0]!.slots[0]!.party.push(bench);
    // Apply Ingrain volatile
    active.volatileStatus.push({ name: 'ingrain', turnsRemaining: -1 });

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: bench.instanceId },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const blocked = events.find(e => e.type === 'move-blocked' && e.data['reason'] === 'trapped');
    expect(blocked).toBeDefined();
  });

  it('allows a voluntary switch when the Pokémon has no Ingrain', () => {
    const state = make1v1State();
    const bench = makePokemon();
    state.teams[0]!.slots[0]!.party.push(bench);

    const engine = new BattleEngine({ rng: () => 0.5 });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'switch', targetInstanceId: bench.instanceId },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });

    const blocked = events.find(e => e.type === 'move-blocked' && e.data['reason'] === 'trapped');
    expect(blocked).toBeUndefined();
    expect(events.some(e => e.type === 'pokemon-switched')).toBe(true);
  });
});

describe('BattleEngine._runSubMove — works with fewer than 4 moves', () => {
  it('does not leave a corrupted moves[3] when Pokémon has 2 moves', () => {
    const state = make1v1State();
    const attacker = state.teams[0]!.slots[0]!.party[0]!;
    // Give attacker only 2 moves
    attacker.moves = [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'roost',        currentPp: 10, maxPp: 10 },
    ] as any;

    const engine = new BattleEngine({ rng: () => 0.5 });
    (engine as any)._runSubMove('flamethrower', 'slot-a1', 'slot-b1', state, 0);

    const afterAttacker = state.teams[0]!.slots[0]!.party[0]!;
    expect(afterAttacker.moves).toHaveLength(2);
  });
});

describe('BattleEngine.getSpreadTargets — randomNormal picks one foe in doubles', () => {
  function make1v2State(): BattleState {
    const attacker = makePokemon({ instanceId: 'att' });
    const foe1 = makePokemon({ instanceId: 'foe1' });
    const foe2 = makePokemon({ instanceId: 'foe2' });
    return {
      battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
      field: {
        trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0,
        ionDeluge: false, fairyLock: 0,
        sideConditions: [
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
        ],
      },
      teams: [
        { teamId: 'team-a', slots: [{ slotId: 'slot-a1', displayName: 'P1', isNpc: false, isSpectator: false, party: [attacker], activePokemonIndex: 0 }] },
        { teamId: 'team-b', slots: [
          { slotId: 'slot-b1', displayName: 'E1', isNpc: true, isSpectator: false, party: [foe1], activePokemonIndex: 0 },
          { slotId: 'slot-b2', displayName: 'E2', isNpc: true, isSpectator: false, party: [foe2], activePokemonIndex: 0 },
        ]},
      ],
    } as BattleState;
  }

  it('returns exactly one foe when rng picks index 0', () => {
    const state = make1v2State();
    const engine = new BattleEngine({ rng: () => 0 });
    const targets = (engine as any).getSpreadTargets(state, 'slot-a1', 'randomNormal') as string[];
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe('slot-b1');
  });

  it('returns exactly one foe when rng picks index 1', () => {
    const state = make1v2State();
    const engine = new BattleEngine({ rng: () => 0.99 });
    const targets = (engine as any).getSpreadTargets(state, 'slot-a1', 'randomNormal') as string[];
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe('slot-b2');
  });

  it('returns all foes for allAdjacentFoes in doubles (spread unchanged)', () => {
    const state = make1v2State();
    const engine = new BattleEngine({ rng: () => 0.5 });
    const targets = (engine as any).getSpreadTargets(state, 'slot-a1', 'allAdjacentFoes') as string[];
    expect(targets).toHaveLength(2);
  });
});

describe('burnup / doubleshock — type stripping', () => {
  it('burnup strips Fire type from user after landing', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'burnup', currentPp: 5, maxPp: 5 };
    state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Fire', 'Flying'];

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.typeOverride).toEqual(['Flying']); // Fire stripped, Flying remains
    expect(events.some(e => e.type === 'volatile-applied' && (e.data as any)['volatile'] === 'type-changed')).toBe(true);
  });

  it('burnup fails if user has no Fire type', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'burnup', currentPp: 5, maxPp: 5 };
    state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Water']; // not Fire

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any)['reason'] === 'wrong-type')).toBe(true);
  });

  it('doubleshock strips Electric type', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'doubleshock', currentPp: 5, maxPp: 5 };
    state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Electric', 'Normal'];

    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.typeOverride).toEqual(['Normal']);
  });
});

describe('Status-cure berries', () => {
  it('Cheri Berry cures paralysis when inflicted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'cheri-berry';
    state.teams[1]!.slots[0]!.party[0]!.moves[1] = { moveId: 'thunderwave', currentPp: 20, maxPp: 20 };
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 1 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.status).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && (e.data as any)['item'] === 'cheri-berry')).toBe(true);
  });

  it('Rawst Berry cures burn when inflicted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    // Make p1 a Water type so Will-O-Wisp can burn it (Charizard/Fire type is immune)
    state.teams[0]!.slots[0]!.party[0]!.speciesId = 9; // Blastoise (Water)
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'rawst-berry';
    state.teams[1]!.slots[0]!.party[0]!.moves[3] = { moveId: 'willowisp', currentPp: 15, maxPp: 15 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });

  it('Persim Berry cures confusion when inflicted', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'persim-berry';
    state.teams[1]!.slots[0]!.party[0]!.moves[0] = { moveId: 'confuseray', currentPp: 10, maxPp: 10 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 0 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.find(v => v.name === 'confusion')).toBeUndefined();
    expect(p1.heldItem).toBeUndefined();
  });
});

describe('poltergeist', () => {
  it('fails when target holds no item', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'poltergeist', currentPp: 5, maxPp: 5 };
    delete (state.teams[1]!.slots[0]!.party[0]! as any).heldItem;

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some(e => e.type === 'move-failed' && (e.data as any)['reason'] === 'no-item')).toBe(true);
    expect(events.some(e => e.type === 'damage-dealt' && (e.data as any)['attackerSlotId'] === 'slot-a1')).toBe(false);
  });

  it('lands when target holds an item', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'poltergeist', currentPp: 5, maxPp: 5 };
    (state.teams[1]!.slots[0]!.party[0]! as any).heldItem = 'oran-berry';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some(e => e.type === 'damage-dealt' && (e.data as any)['attackerSlotId'] === 'slot-a1')).toBe(true);
  });
});

describe('HP-restore berries', () => {
  it('Oran Berry heals 10 HP when at or below 50% max HP after taking damage', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'oran-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 50; // exactly 50%
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(events.some(e => e.type === 'heal' && e.data['amount'] === 10)).toBe(true);
    expect(p1.heldItem).toBeUndefined();
  });

  it('Oran Berry does not trigger above 50% HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'oran-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 51;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('oran-berry');
  });

  it('Berry Juice heals 20 HP when at or below 50%', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'berry-juice';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 50;
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(events.some(e => e.type === 'heal' && e.data['amount'] === 20)).toBe(true);
  });
});

describe('Type-resist berries', () => {
  it('Occa Berry halves a super-effective Fire hit and is consumed', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[1]!.slots[0]!.party[0]!.typeOverride = ['Grass'];
    stateWith.teams[1]!.slots[0]!.party[0]!.heldItem = 'occa-berry';
    const stateWithout = make1v1State();
    stateWithout.teams[1]!.slots[0]!.party[0]!.typeOverride = ['Grass'];
    const { newState: withBerry } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: withoutBerry } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const dmgWith = 100 - withBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - withoutBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(withBerry.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    expect(dmgWith).toBeLessThan(dmgWithout);
  });

  it('Occa Berry does not trigger when Fire hit is not super-effective', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State(); // Charizard Fire/Flying — Fire not SE
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'occa-berry';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBe('occa-berry');
  });

  it('Chilan Berry halves any Normal-type hit', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[1]!.slots[0]!.party[0]!.heldItem = 'chilan-berry';
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState: withBerry } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: withoutBerry } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(withBerry.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
    const dmgWith = 100 - withBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - withoutBerry.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgWith).toBeLessThan(dmgWithout);
  });
});

describe('Confusion berries (Figy/Wiki/Mago/Aguav/Iapapa)', () => {
  it('Figy Berry heals floor(maxHp/3) when HP drops to or below 33%', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'figy-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 33;
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(events.some(e => e.type === 'heal' && e.data['amount'] === Math.floor(100 / 3))).toBe(true);
    expect(p1.heldItem).toBeUndefined();
  });

  it('Figy Berry does not trigger above 33% HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'figy-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 34;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBe('figy-berry');
  });
});

describe('Custap and Micle berries', () => {
  it('Custap Berry sets custap-active volatile when HP drops to ≤25%', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'custap-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 25;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    expect(p1.volatileStatus.some(v => v.name === 'custap-active')).toBe(true);
    expect(p1.heldItem).toBeUndefined();
  });

  it('Custap-active holder moves before slower same-priority opponent', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State(); // p1 spe=100, p2 spe=80
    // Give p2 custap-active volatile pre-baked (as if set last turn)
    state.teams[1]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'custap-active' });
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const moveEvents = events.filter(e => e.type === 'move-used');
    // p2 has custap-active so should move first despite lower speed
    expect(moveEvents[0]!.data['attackerSlotId']).toBe('slot-b1');
  });

  it('Micle Berry sets micle-active volatile at ≤25% HP', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'micle-berry';
    state.teams[0]!.slots[0]!.party[0]!.currentHp = 25;
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'micle-active')).toBe(true);
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });

  it('Micle Berry clears micle-active volatile and boosts accuracy on next move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    // Pre-bake micle-active as if it was set last turn (item already consumed)
    state.teams[0]!.slots[0]!.party[0]!.volatileStatus.push({ name: 'micle-active' });
    // heldItem is undefined (consumed) — this is the real-world post-consumption state
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    // After using a move, micle-active should be cleared even with no heldItem
    expect(newState.teams[0]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'micle-active')).toBe(false);
    // Note: heldItem stays undefined (already consumed)
    expect(newState.teams[0]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });
});

describe('Reactive berries', () => {
  it('Kee Berry gives +1 Defense when hit by a physical move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'kee-berry';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.def).toBe(1);
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });

  it('Maranga Berry gives +1 Sp.Def when hit by a special move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'maranga-berry';
    // flamethrower (move 0) is special
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spd).toBe(1);
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });

  it('Jaboca Berry damages the attacker when hit by a physical move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'jaboca-berry';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const jabocaDmg = Math.floor(100 / 8); // 12
    expect(newState.teams[0]!.slots[0]!.party[0]!.currentHp).toBeLessThanOrEqual(100 - jabocaDmg);
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });

  it('Rowap Berry damages the attacker when hit by a special move', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'rowap-berry';
    // flamethrower is special (default move at index 0)
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const p1 = newState.teams[0]!.slots[0]!.party[0]!;
    const rowapDmg = Math.floor(100 / 8); // 12
    expect(p1.currentHp).toBeLessThanOrEqual(100 - rowapDmg);
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });

  it('Kee Berry does not trigger on special moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'kee-berry';
    // flamethrower is special — should NOT trigger Kee Berry
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBe('kee-berry');
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.def).toBe(0);
  });

  it('Maranga Berry does not trigger on physical moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'maranga-berry';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBe('maranga-berry');
    expect(newState.teams[1]!.slots[0]!.party[0]!.statBoosts.spd).toBe(0);
  });
});

describe('Flame Orb and Toxic Orb', () => {
  it('Flame Orb burns the holder at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'flame-orb';
    state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Normal'];
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('Flame Orb does not re-burn an already-burned holder', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'flame-orb';
    state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Normal'];
    state.teams[0]!.slots[0]!.party[0]!.status = 'brn';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('brn');
  });

  it('Toxic Orb badly poisons the holder at end of turn', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'toxic-orb';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBe('tox');
  });

  it('Toxic Orb does not inflict on Poison-immune holder', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'toxic-orb';
    state.teams[0]!.slots[0]!.party[0]!.typeOverride = ['Poison'];
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 3 },
      'slot-b1': { type: 'move', moveIndex: 2 }, // roost — no harmful status effect on p1
    });
    expect(newState.teams[0]!.slots[0]!.party[0]!.status).toBeUndefined();
  });
});

describe('highjumpkick crash damage', () => {
  it('user takes half max HP on miss', () => {
    // highjumpkick accuracy=90, so rng=0.95 misses
    const engine = new BattleEngine({ rng: () => 0.95 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'highjumpkick', currentPp: 10, maxPp: 10 };

    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some(e => e.type === 'miss')).toBe(true);
    const crashEvt = events.find(e => e.type === 'damage-dealt' && (e.data as any)['source'] === 'crash');
    expect(crashEvt).toBeDefined();
    expect((crashEvt!.data as any)['damage']).toBe(50); // floor(100 / 2) = 50
  });

  it('jumpkick also crashes on miss', () => {
    const engine = new BattleEngine({ rng: () => 0.96 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'jumpkick', currentPp: 10, maxPp: 10 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    expect(events.some(e => e.type === 'damage-dealt' && (e.data as any)['source'] === 'crash')).toBe(true);
  });
});

describe('judgment', () => {
  it('is Normal type when no plate held', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'judgment', currentPp: 10, maxPp: 10 };
    delete (state.teams[0]!.slots[0]!.party[0]! as any).heldItem;

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const dmg = events.find(e => e.type === 'damage-dealt' && (e.data as any)['attackerSlotId'] === 'slot-a1');
    expect(dmg).toBeDefined();
    // Normal type vs Normal type opponent means at least some damage dealt
  });

  it('becomes Fire type when flame-plate held', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'judgment', currentPp: 10, maxPp: 10 };
    (state.teams[0]!.slots[0]!.party[0]! as any).heldItem = 'flame-plate';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const dmg = events.find(e => e.type === 'damage-dealt' && (e.data as any)['attackerSlotId'] === 'slot-a1');
    expect(dmg!.data['moveType']).toBe('Fire');
  });

  it('multiattack uses fire-memory for Fire type', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'multiattack', currentPp: 10, maxPp: 10 };
    (state.teams[0]!.slots[0]!.party[0]! as any).heldItem = 'fire-memory';

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const dmg = events.find(e => e.type === 'damage-dealt' && (e.data as any)['attackerSlotId'] === 'slot-a1');
    expect(dmg!.data['moveType']).toBe('Fire');
  });
});

describe('naturepower', () => {
  it('uses tri-attack with no terrain', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'naturepower', currentPp: 20, maxPp: 20 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    // triattack should be executed — move-used event for triattack
    const used = events.find(e => e.type === 'move-used' && (e.data as any)['moveId'] === 'triattack');
    expect(used).toBeDefined();
  });

  it('uses thunderbolt on electric terrain', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'naturepower', currentPp: 20, maxPp: 20 };
    state.field.terrain = { type: 'electric', turnsRemaining: 5 };

    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });

    const used = events.find(e => e.type === 'move-used' && (e.data as any)['moveId'] === 'thunderbolt');
    expect(used).toBeDefined();
  });
});

describe('White Herb', () => {
  it('Screech lowers target Defense by 2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces accuracy roll to hit (screech is 85%)
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'screech', currentPp: 40, maxPp: 40 }; // -2 Def
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.def).toBe(-2); // Should be lowered by 2
    expect(events.some(e => e.type === 'stat-change')).toBe(true);
  });

  it('White Herb restores all negative stat stages when any stat is lowered', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces accuracy roll to hit (screech is 85%)
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'white-herb';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'screech', currentPp: 40, maxPp: 40 }; // -2 Def
    const { newState, events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.statBoosts.def).toBe(0); // restored from -2 to 0
    expect(p2.heldItem).toBeUndefined();
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'white-herb')).toBe(true);
  });

  it('White Herb only fires once (consumed after first trigger)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // forces accuracy roll to hit (screech is 85%)
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'white-herb';
    state.teams[1]!.slots[0]!.party[0]!.statBoosts.def = -2; // pre-existing drop
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'screech', currentPp: 40, maxPp: 40 };
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3, targetSlotId: 'slot-a1' },
    });
    // White Herb fires on first stat drop, then is consumed
    expect(newState.teams[1]!.slots[0]!.party[0]!.heldItem).toBeUndefined();
  });
});

describe('Muscle Band and Wise Glasses', () => {
  it('Muscle Band gives 1.1x damage on physical moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'muscle-band';
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState: with_ } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: without_ } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const dmgWith = 100 - with_.teams[1]!.slots[0]!.party[0]!.currentHp;
    const dmgWithout = 100 - without_.teams[1]!.slots[0]!.party[0]!.currentHp;
    expect(dmgWith).toBeGreaterThan(dmgWithout);
  });

  it('Muscle Band does not boost special moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'muscle-band';
    // flamethrower is special (default moves[0])
    const stateWithout = make1v1State();
    const { newState: with_ } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: without_ } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(100 - with_.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(
      100 - without_.teams[1]!.slots[0]!.party[0]!.currentHp
    );
  });

  it('Wise Glasses gives 1.1x damage on special moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'wise-glasses';
    const stateWithout = make1v1State();
    const { newState: with_ } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' }, // flamethrower (special)
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: without_ } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(100 - with_.teams[1]!.slots[0]!.party[0]!.currentHp).toBeGreaterThan(
      100 - without_.teams[1]!.slots[0]!.party[0]!.currentHp
    );
  });

  it('Wise Glasses does not boost physical moves', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const stateWith = make1v1State();
    stateWith.teams[0]!.slots[0]!.party[0]!.heldItem = 'wise-glasses';
    stateWith.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const stateWithout = make1v1State();
    stateWithout.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const { newState: with_ } = engine.resolveTurn(stateWith, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    const { newState: without_ } = new BattleEngine({ rng: () => 0 }).resolveTurn(stateWithout, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(100 - with_.teams[1]!.slots[0]!.party[0]!.currentHp).toBe(
      100 - without_.teams[1]!.slots[0]!.party[0]!.currentHp
    );
  });
});

describe("King's Rock and Razor Fang", () => {
  it("King's Rock flinches the target with 10% probability (rng=0 triggers)", () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'kings-rock';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    const p2 = newState.teams[1]!.slots[0]!.party[0]!;
    expect(p2.volatileStatus.some(v => v.name === 'flinch')).toBe(true);
  });

  it("King's Rock does not flinch when rng is above 10%", () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'kings-rock';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flinch')).toBe(false);
  });

  it("Razor Fang flinches with 10% probability", () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.heldItem = 'razor-fang';
    const { newState } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(newState.teams[1]!.slots[0]!.party[0]!.volatileStatus.some(v => v.name === 'flinch')).toBe(true);
  });
});

describe('Eject Button, Eject Pack, Red Card', () => {
  it('Eject Button forces the holder to switch when it takes direct damage', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const extraMon = makePokemon({ instanceId: 'p2-mon2' });
    state.teams[1]!.slots[0]!.party.push(extraMon);
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'eject-button';
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(events.some(e => e.type === 'pokemon-switched' && e.data['slotId'] === 'slot-b1')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'eject-button')).toBe(true);
  });

  it('Eject Button does nothing when bench is empty', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'eject-button';
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(events.some(e => e.type === 'pokemon-switched')).toBe(false);
  });

  it('Eject Pack forces the holder to switch when its stats are lowered', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const extraMon = makePokemon({ instanceId: 'p2-mon2' });
    state.teams[1]!.slots[0]!.party.push(extraMon);
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'eject-pack';
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'screech', currentPp: 40, maxPp: 40 };
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0 },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(events.some(e => e.type === 'pokemon-switched' && e.data['slotId'] === 'slot-b1')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'eject-pack')).toBe(true);
  });

  it('Red Card forces the attacker to switch out', () => {
    const engine = new BattleEngine({ rng: () => 0 });
    const state = make1v1State();
    const extraMon = makePokemon({ instanceId: 'p1-mon2' });
    state.teams[0]!.slots[0]!.party.push(extraMon);
    state.teams[1]!.slots[0]!.party[0]!.heldItem = 'red-card';
    const { events } = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
      'slot-b1': { type: 'move', moveIndex: 3 },
    });
    expect(events.some(e => e.type === 'pokemon-switched' && e.data['slotId'] === 'slot-a1')).toBe(true);
    expect(events.some(e => e.type === 'item-consumed' && e.data['item'] === 'red-card')).toBe(true);
  });
});
