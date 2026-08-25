import type { BattleState, PartyMember, TeamState, SlotState, FieldState, SideConditions } from '@poke-fighter/shared';
import { v4 as uuidv4 } from 'uuid';

function defaultSideConditions(): SideConditions {
  return { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 };
}

function defaultField(): FieldState {
  return { trickroom: 0, gravity: 0, sideConditions: [defaultSideConditions(), defaultSideConditions()] };
}

export function makePokemon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: uuidv4(),
    speciesId: 6,
    speciesName: 'charizard',
    nickname: 'Charizard',
    level: 50,
    currentHp: 100, maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash',     currentPp: 15, maxPp: 15 },
      { moveId: 'roost',        currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp',    currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    ...overrides,
  };
}

function makeSlot(slotId: string, pokemon: PartyMember, isNpc = false): SlotState {
  return {
    slotId, displayName: slotId, isNpc, isSpectator: false,
    party: [pokemon],
    activePokemonIndex: 0,
  };
}

export function make1v1State(): BattleState {
  // p1 has spe=100 (default), p2 has spe=80
  const p1 = makePokemon({ instanceId: 'p1-mon' });
  const p2 = makePokemon({
    instanceId: 'p2-mon',
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 80 },
  });

  const teamA: TeamState = {
    teamId: 'team-a',
    slots: [makeSlot('slot-a1', p1)],
  };
  const teamB: TeamState = {
    teamId: 'team-b',
    slots: [makeSlot('slot-b1', p2, true)],
  };

  return {
    battleId: 'test-battle',
    label: 'Test Battle',
    turnNumber: 1,
    phase: 'action',
    teams: [teamA, teamB],
    field: defaultField(),
  };
}
