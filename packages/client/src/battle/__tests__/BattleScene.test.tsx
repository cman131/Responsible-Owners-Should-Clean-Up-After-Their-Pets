import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BattleScene } from '../BattleScene.js';
import type { BattleState, PartyMember, SlotState, TeamState } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1',
    speciesId: 6,
    speciesName: 'charizard',
    nickname: 'Charizard',
    level: 50,
    currentHp: 100,
    maxHp: 100,
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false,
    fainted: false,
    expTotal: 0,
    ...overrides,
  };
}

function makeSlot(slotId: string, mon: PartyMember, isNpc = false): SlotState {
  return { slotId, displayName: slotId, isNpc, isSpectator: false, party: [mon], activePokemonIndex: 0 };
}

function makeState(mySlotId: string, foeSlotId: string): BattleState {
  const myMon = makeMon({ instanceId: 'my-mon', speciesName: 'bulbasaur' });
  const foeMon = makeMon({ instanceId: 'foe-mon', speciesName: 'charizard' });
  const teamA: TeamState = { teamId: 'team-a', slots: [makeSlot(mySlotId, myMon)] };
  const teamB: TeamState = { teamId: 'team-b', slots: [makeSlot(foeSlotId, foeMon, true)] };
  return {
    battleId: 'test',
    label: 'Test',
    turnNumber: 1,
    phase: 'action',
    teams: [teamA, teamB],
    field: { trickroom: 0, gravity: 0, sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0 },
    ]},
    turnTimerSeconds: 60,
  };
}

describe('BattleScene', () => {
  it('renders an img with back-sprite URL for own pokemon', () => {
    const state = makeState('a1', 'b1');
    render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const backSprite = imgs.find((img) => img.src.includes('ani-back') && img.src.includes('bulbasaur'));
    expect(backSprite).toBeTruthy();
  });

  it('renders an img with front-sprite URL for enemy pokemon', () => {
    const state = makeState('a1', 'b1');
    render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const frontSprite = imgs.find((img) => img.src.includes('/sprites/ani/') && !img.src.includes('ani-back') && img.src.includes('charizard'));
    expect(frontSprite).toBeTruthy();
  });

  it('does not render an img for a fainted pokemon', () => {
    const state = makeState('a1', 'b1');
    state.teams[1]!.slots[0]!.party[0]!.fainted = true;
    render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    const frontSprite = imgs.find((img) => img.src.includes('charizard') && !img.src.includes('ani-back'));
    expect(frontSprite).toBeFalsy();
  });

  it('renders a placeholder div when speciesName is empty', () => {
    const state = makeState('a1', 'b1');
    state.teams[0]!.slots[0]!.party[0]!.speciesName = '';
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = container.querySelectorAll('img');
    // Only the enemy sprite img should be present; own slot uses a div
    expect(imgs.length).toBe(1);
  });

  it('renders both teams when mySlotId is not found in any team (admin view)', () => {
    const state = makeState('a1', 'b1');
    render(<BattleScene state={state} mySlotId="__admin__" />);
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    // Both bulbasaur (team 0) and charizard (team 1) should be rendered
    const bulbasaurImg = imgs.find((img) => img.src.includes('bulbasaur'));
    const charizardImg = imgs.find((img) => img.src.includes('charizard'));
    expect(bulbasaurImg).toBeTruthy();
    expect(charizardImg).toBeTruthy();
  });
});
