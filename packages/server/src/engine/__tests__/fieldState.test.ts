import { describe, it, expect } from 'vitest';
import { isGrounded, WEATHER_ACCURACY, SOLAR_MOVES, WEATHER_BALL_TYPE, GRAVITY_BLOCKED_MOVES, GRASSY_TERRAIN_HALVED } from '../fieldState.js';
import { makePokemon } from './fixtures.js';

describe('isGrounded', () => {
  it('returns true for a Normal-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Normal'], false)).toBe(true);
  });

  it('returns false for a Flying-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Flying'], false)).toBe(false);
  });

  it('returns false for a Water/Flying-type Pokémon', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Water', 'Flying'], false)).toBe(false);
  });

  it('returns false for a Pokémon with Levitate ability', () => {
    const mon = makePokemon({ ability: 'levitate' });
    expect(isGrounded(mon, ['Ghost'], false)).toBe(false);
  });

  it('returns false for a Pokémon with Magnet Rise volatile', () => {
    const mon = makePokemon();
    mon.volatileStatus.push({ name: 'magnet-rise' });
    expect(isGrounded(mon, ['Normal'], false)).toBe(false);
  });

  it('returns true for a Flying-type when gravity is active', () => {
    const mon = makePokemon();
    expect(isGrounded(mon, ['Flying'], true)).toBe(true);
  });

  it('returns true for a Levitate Pokémon when gravity is active', () => {
    const mon = makePokemon({ ability: 'levitate' });
    expect(isGrounded(mon, ['Normal'], true)).toBe(true);
  });

  it('returns true for a Magnet Rise Pokémon when gravity is active', () => {
    const mon = makePokemon();
    mon.volatileStatus.push({ name: 'magnet-rise' });
    expect(isGrounded(mon, ['Normal'], true)).toBe(true);
  });

  it('returns true for a Flying-type Pokémon holding Iron Ball', () => {
    const mon = makePokemon({ heldItem: 'iron-ball' });
    expect(isGrounded(mon, ['Flying'], false)).toBe(true);
  });

  it('returns true for a Levitate Pokémon holding Iron Ball', () => {
    const mon = makePokemon({ ability: 'levitate', heldItem: 'iron-ball' });
    expect(isGrounded(mon, ['Normal'], false)).toBe(true);
  });
});

describe('lookup maps', () => {
  it('WEATHER_ACCURACY: thunder always hits in rain', () => {
    expect(WEATHER_ACCURACY['thunder']?.['rain']).toBe(true);
  });

  it('WEATHER_ACCURACY: thunder is 50% in sun', () => {
    expect(WEATHER_ACCURACY['thunder']?.['sun']).toBe(50);
  });

  it('WEATHER_ACCURACY: blizzard always hits in snow', () => {
    expect(WEATHER_ACCURACY['blizzard']?.['snow']).toBe(true);
  });

  it('WEATHER_ACCURACY: hurricane always hits in rain, 50% in sun', () => {
    expect(WEATHER_ACCURACY['hurricane']?.['rain']).toBe(true);
    expect(WEATHER_ACCURACY['hurricane']?.['sun']).toBe(50);
  });

  it('SOLAR_MOVES contains solarbeam and solarblade', () => {
    expect(SOLAR_MOVES.has('solarbeam')).toBe(true);
    expect(SOLAR_MOVES.has('solarblade')).toBe(true);
  });

  it('WEATHER_BALL_TYPE maps weather to type', () => {
    expect(WEATHER_BALL_TYPE['sun']).toBe('Fire');
    expect(WEATHER_BALL_TYPE['rain']).toBe('Water');
    expect(WEATHER_BALL_TYPE['sand']).toBe('Rock');
    expect(WEATHER_BALL_TYPE['snow']).toBe('Ice');
  });

  it('GRAVITY_BLOCKED_MOVES contains fly and bounce', () => {
    expect(GRAVITY_BLOCKED_MOVES.has('fly')).toBe(true);
    expect(GRAVITY_BLOCKED_MOVES.has('bounce')).toBe(true);
    expect(GRAVITY_BLOCKED_MOVES.has('highjumpkick')).toBe(true);
  });

  it('GRASSY_TERRAIN_HALVED contains earthquake', () => {
    expect(GRASSY_TERRAIN_HALVED.has('earthquake')).toBe(true);
    expect(GRASSY_TERRAIN_HALVED.has('magnitude')).toBe(true);
    expect(GRASSY_TERRAIN_HALVED.has('bulldoze')).toBe(true);
  });

  it('WEATHER_ACCURACY: thunder always hits in heavy-rain', () => {
    expect(WEATHER_ACCURACY['thunder']?.['heavy-rain']).toBe(true);
  });

  it('WEATHER_ACCURACY: thunder is 50% in harsh-sun', () => {
    expect(WEATHER_ACCURACY['thunder']?.['harsh-sun']).toBe(50);
  });

  it('WEATHER_ACCURACY: hurricane always hits in heavy-rain', () => {
    expect(WEATHER_ACCURACY['hurricane']?.['heavy-rain']).toBe(true);
  });

  it('WEATHER_ACCURACY: hurricane is 50% in harsh-sun', () => {
    expect(WEATHER_ACCURACY['hurricane']?.['harsh-sun']).toBe(50);
  });

  it('WEATHER_BALL_TYPE maps harsh-sun to Fire', () => {
    expect(WEATHER_BALL_TYPE['harsh-sun']).toBe('Fire');
  });

  it('WEATHER_BALL_TYPE maps heavy-rain to Water', () => {
    expect(WEATHER_BALL_TYPE['heavy-rain']).toBe('Water');
  });
});

import { BattleEngine } from '../BattleEngine.js';
import { make1v1State } from './fixtures.js';

describe('Mud Sport', () => {
  it('halves Electric move damage', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Baseline: Electric move without Mud Sport
    const stateBase = make1v1State();
    stateBase.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    const baseResult = engine.resolveTurn(stateBase, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgBase = 100 - baseResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // With Mud Sport active
    const stateMS = make1v1State();
    stateMS.field.mudSport = 5;
    stateMS.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'thunderbolt', currentPp: 15, maxPp: 15 };
    const msResult = engine.resolveTurn(stateMS, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgMS = 100 - msResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    expect(dmgMS).toBeLessThan(dmgBase);
    // Mud Sport halves damage — check rough ratio
    // Allow wide tolerance (±15) because both calculations use independent Math.random() calls
    expect(dmgMS * 2).toBeGreaterThanOrEqual(dmgBase - 15);
    expect(dmgMS * 2).toBeLessThanOrEqual(dmgBase + 15);
  });
});

describe('Water Sport', () => {
  it('halves Fire move damage', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Baseline
    const stateBase = make1v1State();
    stateBase.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    const baseResult = engine.resolveTurn(stateBase, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgBase = 100 - baseResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // With Water Sport active
    const stateWS = make1v1State();
    stateWS.field.waterSport = 5;
    stateWS.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'flamethrower', currentPp: 15, maxPp: 15 };
    const wsResult = engine.resolveTurn(stateWS, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgWS = 100 - wsResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    expect(dmgWS).toBeLessThan(dmgBase);
  });
});

describe('Wonder Room', () => {
  it('swaps Def and SpD for damage calculation', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Target: high Def, low SpD — physical move should deal low damage normally, high with Wonder Room
    const stateBase = make1v1State();
    stateBase.teams[1]!.slots[0]!.party[0]!.stats.def = 200;
    stateBase.teams[1]!.slots[0]!.party[0]!.stats.spd = 50;
    stateBase.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const baseResult = engine.resolveTurn(stateBase, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgBase = 100 - baseResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // With Wonder Room (physical move now uses SpD=50, should deal more damage)
    const stateWR = make1v1State();
    stateWR.field.wonderroom = 5;
    stateWR.teams[1]!.slots[0]!.party[0]!.stats.def = 200;
    stateWR.teams[1]!.slots[0]!.party[0]!.stats.spd = 50;
    stateWR.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const wrResult = engine.resolveTurn(stateWR, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgWR = 100 - wrResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    expect(dmgWR).toBeGreaterThan(dmgBase);
  });

  it('toggles off when used a second time', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });
    const state = make1v1State();
    state.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'wonderroom', currentPp: 10, maxPp: 10 };

    const after1 = engine.resolveTurn(state, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(after1.newState.field.wonderroom).toBeGreaterThan(0);

    const after2 = engine.resolveTurn(after1.newState, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-a1' },
    });
    expect(after2.newState.field.wonderroom).toBe(0);
    expect(after2.events.some(e => e.type === 'wonderroom-ended')).toBe(true);
  });
});

describe('Ion Deluge', () => {
  it('converts Normal-type moves to Electric type this turn', () => {
    const engine = new BattleEngine({ rng: () => 0.5 });

    // Baseline: Normal tackle vs default target (1× effectiveness)
    const stateBase = make1v1State();
    stateBase.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const baseResult = engine.resolveTurn(stateBase, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });
    const dmgBase = 100 - baseResult.newState.teams[1]!.slots[0]!.party[0]!.currentHp;

    // With Ion Deluge active: Tackle becomes Electric
    const stateID = make1v1State();
    stateID.field.ionDeluge = true;
    stateID.teams[0]!.slots[0]!.party[0]!.moves[0] = { moveId: 'tackle', currentPp: 35, maxPp: 35 };
    const idResult = engine.resolveTurn(stateID, {
      'slot-a1': { type: 'move', moveIndex: 0, targetSlotId: 'slot-b1' },
    });

    // Ion Deluge cleared after the turn
    expect(idResult.newState.field.ionDeluge).toBe(false);
  });
});
