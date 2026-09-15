import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionPanel } from '../ActionPanel.js';
import type { ActionRequestPayload, BattleState, PartyMember } from '@poke-fighter/shared';

const activeMon: PartyMember = {
  instanceId: 'active-1', speciesId: 6, speciesName: 'charizard', nickname: 'Charizard',
  level: 50, currentHp: 180, maxHp: 200,
  stats: { hp: 200, atk: 120, def: 100, spa: 130, spd: 100, spe: 110 },
  ability: 'blaze',
  moves: [
    { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
    { moveId: 'airslash', currentPp: 15, maxPp: 15 },
    { moveId: 'roost', currentPp: 10, maxPp: 10 },
    { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
  ],
  volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  hasTerastallized: false, fainted: false, expTotal: 0,
};

const benchMon: PartyMember = {
  instanceId: 'bench-1', speciesId: 9, speciesName: 'blastoise', nickname: 'Blastoise',
  level: 45, currentHp: 140, maxHp: 180,
  stats: { hp: 180, atk: 90, def: 110, spa: 90, spd: 100, spe: 80 },
  ability: 'torrent',
  moves: [
    { moveId: 'surf', currentPp: 15, maxPp: 15 },
    { moveId: 'icebeam', currentPp: 10, maxPp: 10 },
    { moveId: 'flashcannon', currentPp: 10, maxPp: 10 },
    { moveId: 'protect', currentPp: 10, maxPp: 10 },
  ],
  volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
  hasTerastallized: false, fainted: false, expTotal: 0,
};

const mockState: BattleState = {
  battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
  teams: [
    {
      teamId: 'team-a',
      slots: [{ slotId: 'a1', displayName: 'Alice', isNpc: false, isSpectator: false, party: [activeMon, benchMon], activePokemonIndex: 0 }],
    },
    {
      teamId: 'team-b',
      slots: [{ slotId: 'b1', displayName: 'Bob', isNpc: true, isSpectator: false, party: [{ ...activeMon, instanceId: 'foe-1' }], activePokemonIndex: 0 }],
    },
  ],
  field: {
    trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0,
    mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0,
    sideConditions: [
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
      { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
    ],
  },
};

const baseRequest: ActionRequestPayload = {
  slotId: 'a1',
  validMoves: [
    { index: 0, moveId: 'flamethrower', pp: 15, disabled: false, targetType: 'normal', legalTargets: ['b1'] },
    { index: 1, moveId: 'airslash', pp: 15, disabled: false, targetType: 'normal', legalTargets: ['b1'] },
    { index: 2, moveId: 'roost', pp: 10, disabled: false, targetType: 'self', legalTargets: ['a1'] },
    { index: 3, moveId: 'willowisp', pp: 15, disabled: false, targetType: 'normal', legalTargets: ['b1'] },
  ],
  canSwitch: false,
  switchTargets: [],
  canTerastallize: false,
};

describe('ActionPanel — locked state', () => {
  it('shows MUST RECHARGE label when lockedReason is recharge', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'recharge' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('MUST RECHARGE')).toBeTruthy();
  });

  it('shows FAST ASLEEP label when lockedReason is sleep', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'sleep' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('FAST ASLEEP')).toBeTruthy();
  });

  it('shows FROZEN SOLID label when lockedReason is freeze', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'freeze' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('FROZEN SOLID')).toBeTruthy();
  });

  it('does not render move buttons when locked', () => {
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'recharge' }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.queryByText('Flamethrower')).toBeNull();
  });

  it('Confirm on locked panel calls onSubmitMove(0)', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={{ ...baseRequest, lockedReason: 'recharge' }} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSubmitMove).toHaveBeenCalledWith(0);
  });
});

describe('ActionPanel — move grid', () => {
  it('renders all 4 move buttons', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(screen.getByText('Airslash')).toBeTruthy();
    expect(screen.getByText('Roost')).toBeTruthy();
    expect(screen.getByText('Willowisp')).toBeTruthy();
  });

  it('disables a move with pp=0', () => {
    const req = { ...baseRequest, validMoves: [{ ...baseRequest.validMoves[0]!, pp: 0 }, ...baseRequest.validMoves.slice(1)] };
    render(<ActionPanel request={req} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables a move with disabled=true', () => {
    const req = { ...baseRequest, validMoves: [{ ...baseRequest.validMoves[0]!, disabled: true }, ...baseRequest.validMoves.slice(1)] };
    render(<ActionPanel request={req} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('auto-submits a self-targeting move immediately on click', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Roost'));
    expect(onSubmitMove).toHaveBeenCalledWith(2, 'a1', undefined);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('auto-submits a choose move with exactly one legal target immediately on click', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Flamethrower'));
    expect(onSubmitMove).toHaveBeenCalledWith(0, 'b1', undefined);
  });

  it('does not show SWITCH POKÉMON button when canSwitch is false', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.queryByText('SWITCH POKÉMON')).toBeNull();
  });
});

describe('ActionPanel — target selector', () => {
  const multiTargetRequest: ActionRequestPayload = {
    ...baseRequest,
    validMoves: [
      { index: 0, moveId: 'earthquake', pp: 10, disabled: false, targetType: 'normal', legalTargets: ['b1', 'b2'] },
      ...baseRequest.validMoves.slice(1),
    ],
  };

  it('shows target dropdown when choose move has multiple legal targets', () => {
    render(<ActionPanel request={multiTargetRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Earthquake'));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('clicking Confirm submits with the selected target', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={multiTargetRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Earthquake'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSubmitMove).toHaveBeenCalledWith(0, 'b1', undefined);
  });

  it('clicking ✕ cancels target selection and returns to move grid', () => {
    render(<ActionPanel request={multiTargetRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Earthquake'));
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Earthquake')).toBeTruthy();
  });

  it('shows formatted names display (not dropdown) for listed moves', () => {
    const listedRequest: ActionRequestPayload = {
      ...baseRequest,
      validMoves: [
        { index: 0, moveId: 'surf', pp: 15, disabled: false, targetType: 'allAdjacentFoes', legalTargets: ['b1'] },
        ...baseRequest.validMoves.slice(1),
      ],
    };
    render(<ActionPanel request={listedRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Surf'));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Confirm')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('Confirm on listed move calls onSubmitMove without targetSlotId', () => {
    const onSubmitMove = vi.fn();
    const listedRequest: ActionRequestPayload = {
      ...baseRequest,
      validMoves: [
        { index: 0, moveId: 'surf', pp: 15, disabled: false, targetType: 'allAdjacentFoes', legalTargets: ['b1'] },
        ...baseRequest.validMoves.slice(1),
      ],
    };
    render(<ActionPanel request={listedRequest} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('Surf'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSubmitMove).toHaveBeenCalledWith(0, undefined, undefined);
  });
});

const switchableRequest: ActionRequestPayload = {
  ...baseRequest,
  canSwitch: true,
  switchTargets: ['bench-1'],
};

describe('ActionPanel — switch mode', () => {
  it('shows SWITCH POKÉMON button when canSwitch is true', () => {
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('SWITCH POKÉMON')).toBeTruthy();
  });

  it('clicking SWITCH POKÉMON shows SwitchPanel with bench members and [Cancel]', () => {
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    expect(screen.getByText('Blastoise L45')).toBeTruthy();
    expect(screen.getByText('[Cancel]')).toBeTruthy();
    expect(screen.queryByText('Flamethrower')).toBeNull();
  });

  it('clicking [Cancel] returns to move grid without submitting', () => {
    const onSubmitSwitch = vi.fn();
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={onSubmitSwitch} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('[Cancel]'));
    expect(screen.getByText('Flamethrower')).toBeTruthy();
    expect(onSubmitSwitch).not.toHaveBeenCalled();
  });

  it('selecting a bench Pokémon calls onSubmitSwitch and returns to grid', () => {
    const onSubmitSwitch = vi.fn();
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={onSubmitSwitch} />);
    fireEvent.click(screen.getByText('SWITCH POKÉMON'));
    fireEvent.click(screen.getByText('Blastoise L45'));
    expect(onSubmitSwitch).toHaveBeenCalledWith('bench-1');
  });

  it('forced switch (no validMoves, canSwitch true) shows SwitchPanel without [Cancel]', () => {
    const forcedRequest: ActionRequestPayload = { ...baseRequest, validMoves: [], canSwitch: true, switchTargets: ['bench-1'] };
    render(<ActionPanel request={forcedRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('Blastoise L45')).toBeTruthy();
    expect(screen.queryByText('[Cancel]')).toBeNull();
  });
});

describe('ActionPanel — tera checkbox', () => {
  it('does not show tera checkbox when canTerastallize is false', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.queryByText('Terastallize this turn')).toBeNull();
  });

  it('shows tera checkbox when canTerastallize is true', () => {
    render(<ActionPanel request={{ ...baseRequest, canTerastallize: true }} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('Terastallize this turn')).toBeTruthy();
  });

  it('passes terastallize=true through to onSubmitMove when checked before clicking auto-submit move', () => {
    const onSubmitMove = vi.fn();
    render(<ActionPanel request={{ ...baseRequest, canTerastallize: true }} slotId="a1" state={mockState} onSubmitMove={onSubmitMove} onSubmitSwitch={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Terastallize this turn'));
    fireEvent.click(screen.getByText('Roost'));
    expect(onSubmitMove).toHaveBeenCalledWith(2, 'a1', true);
  });
});

describe('ActionPanel — move name formatting', () => {
  it('displays formatted move name (capitalised, dashes replaced with spaces)', () => {
    const hyphenatedRequest: ActionRequestPayload = {
      ...baseRequest,
      validMoves: [
        { index: 0, moveId: 'ice-beam', pp: 10, disabled: false, targetType: 'normal', legalTargets: ['b1'] },
        ...baseRequest.validMoves.slice(1),
      ],
    };
    render(<ActionPanel request={hyphenatedRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} />);
    expect(screen.getByText('Ice Beam')).toBeTruthy();
    expect(screen.queryByText('ice-beam')).toBeNull();
  });
});

describe('ActionPanel — submitted prop', () => {
  it('disables all move buttons when submitted=true', () => {
    render(<ActionPanel request={baseRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} submitted={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect((btn as HTMLButtonElement).disabled).toBe(true));
  });

  it('hides SWITCH POKÉMON button when submitted=true', () => {
    render(<ActionPanel request={switchableRequest} slotId="a1" state={mockState} onSubmitMove={vi.fn()} onSubmitSwitch={vi.fn()} submitted={true} />);
    expect(screen.queryByText('SWITCH POKÉMON')).toBeNull();
  });
});
