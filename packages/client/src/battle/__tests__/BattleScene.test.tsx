import { render, screen, fireEvent } from '@testing-library/react';
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
    growthRate: 'MediumFast',
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
    field: { trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0, sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
    ]},
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

  it('shows placeholder div when sprite image fails to load', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    const imgs = container.querySelectorAll('img');
    const foeImg = Array.from(imgs).find((img) => (img as HTMLImageElement).src.includes('charizard'));
    expect(foeImg).toBeTruthy();
    fireEvent.error(foeImg!);
    const imgsAfter = container.querySelectorAll('img');
    const foeImgAfter = Array.from(imgsAfter).find((img) => (img as HTMLImageElement).src.includes('charizard'));
    expect(foeImgAfter).toBeFalsy();
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

  it('scene container is fluid with max-width 800 and aspect-ratio 10/3', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    const scene = container.firstChild as HTMLElement;
    expect(scene.style.width).toBe('100%');
    expect(scene.style.maxWidth).toBe('800px');
    expect(scene.style.aspectRatio).toBe('10/3');
  });
});

describe('animation classes', () => {
  it('applies anim-attack-right to own slot when animating attack', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['a1', 'attack']])} />,
    );
    expect(container.querySelector('.anim-attack-right')).not.toBeNull();
  });

  it('applies anim-attack-left to foe slot when animating attack', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['b1', 'attack']])} />,
    );
    expect(container.querySelector('.anim-attack-left')).not.toBeNull();
  });

  it('applies anim-hit when a slot is animating hit', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['b1', 'hit']])} />,
    );
    expect(container.querySelector('.anim-hit')).not.toBeNull();
  });

  it('applies anim-faint when a slot is animating faint', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['b1', 'faint']])} />,
    );
    expect(container.querySelector('.anim-faint')).not.toBeNull();
  });

  it('applies no animation class when animatingSlots prop is absent', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    expect(container.querySelector('.anim-attack-right')).toBeNull();
    expect(container.querySelector('.anim-attack-left')).toBeNull();
    expect(container.querySelector('.anim-hit')).toBeNull();
    expect(container.querySelector('.anim-faint')).toBeNull();
  });

  it('still renders a fainted sprite when it is animating faint', () => {
    const state = makeState('a1', 'b1');
    state.teams[1]!.slots[0]!.party[0]!.fainted = true;
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['b1', 'faint']])} />,
    );
    expect(container.querySelector('.anim-faint')).not.toBeNull();
  });

  it('applies no animation class when slot is not in animatingSlots', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(
      <BattleScene state={state} mySlotId="a1" animatingSlots={new Map([['c1', 'attack']])} />,
    );
    expect(container.querySelector('.anim-attack-right')).toBeNull();
    expect(container.querySelector('.anim-attack-left')).toBeNull();
  });
});

describe('sprite positions', () => {
  it('own slot uses percentage positions', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    const scene = container.firstChild as HTMLElement;
    const ownSlot = scene.firstChild as HTMLElement;
    expect(ownSlot.style.bottom).toBe('7.5%');
    expect(ownSlot.style.left).toBe('7.5%');
    expect(ownSlot.style.width).toBe('9%');
    expect(ownSlot.style.height).toBe('30%');
  });

  it('foe slot (index 0) uses percentage positions', () => {
    const state = makeState('a1', 'b1');
    const { container } = render(<BattleScene state={state} mySlotId="a1" />);
    const scene = container.firstChild as HTMLElement;
    // makeState produces one own slot, no allies, one foe — children: [0] own, [1] foe
    const foeSlot = scene.children[1] as HTMLElement;
    expect(foeSlot.style.top).toBe('7.5%');
    expect(foeSlot.style.right).toBe('7.5%');
    expect(foeSlot.style.width).toBe('8%');
    expect(foeSlot.style.height).toBe('26.67%');
  });
});
