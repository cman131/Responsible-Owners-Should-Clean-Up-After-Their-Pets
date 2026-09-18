import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HpBarsRow } from '../HpBarsRow.js';
import type { SlotState, PartyMember } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'mon-1', speciesId: 1, speciesName: 'bulbasaur', nickname: 'Bulbasaur',
    level: 50, currentHp: 100, maxHp: 200,
    stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    ability: 'overgrow',
    moves: [
      { moveId: 'tackle', currentPp: 35, maxPp: 35 },
      { moveId: 'growl', currentPp: 40, maxPp: 40 },
      { moveId: 'vinewhip', currentPp: 25, maxPp: 25 },
      { moveId: 'leechseed', currentPp: 10, maxPp: 10 },
    ],
    volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false, fainted: false, expTotal: 0,
    growthRate: 'MediumFast',
    ...overrides,
  };
}

function makeSlot(slotId: string, overrides: Partial<PartyMember> = {}): SlotState {
  return {
    slotId, displayName: slotId, isNpc: false, isSpectator: false,
    party: [makeMon(overrides)], activePokemonIndex: 0,
  };
}

describe('HpBarsRow', () => {
  it('renders the label text', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('ENEMY')).toBeTruthy();
  });

  it('renders slot display name and level', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('a1 L50')).toBeTruthy();
  });

  it('renders HP numbers', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('100/200')).toBeTruthy();
  });

  it('shows FAINTED for a fainted pokemon', () => {
    render(<HpBarsRow slots={[makeSlot('a1', { fainted: true })]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('FAINTED')).toBeTruthy();
  });

  it('renders highlight indicator for highlightSlotId', () => {
    render(
      <HpBarsRow
        slots={[makeSlot('a1'), makeSlot('a2')]}
        label="MY TEAM"
        variant="own"
        highlightSlotId="a1"
      />
    );
    expect(screen.getByText('▶')).toBeTruthy();
  });

  it('does not render highlight indicator when highlightSlotId is not provided', () => {
    render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    expect(screen.queryByText('▶')).toBeNull();
  });

  it('renders multiple slots', () => {
    render(
      <HpBarsRow slots={[makeSlot('a1'), makeSlot('a2')]} label="MY TEAM" variant="own" />
    );
    expect(screen.getByText('a1 L50')).toBeTruthy();
    expect(screen.getByText('a2 L50')).toBeTruthy();
  });

  it('renders label and no slot rows when slots is empty', () => {
    render(<HpBarsRow slots={[]} label="ENEMY" variant="enemy" />);
    expect(screen.getByText('ENEMY')).toBeTruthy();
    expect(screen.queryByText(/L\d+/)).toBeNull(); // no "L50" or similar level text
  });

  it('uses displayHp value for HP display and numbers when provided', () => {
    const displayHp = new Map([['a1', 50]]);
    render(
      <HpBarsRow
        slots={[makeSlot('a1')]}  // mon has currentHp: 100, maxHp: 200
        label="MY TEAM"
        variant="own"
        displayHp={displayHp}
      />
    );
    expect(screen.getByText('50/200')).toBeTruthy();
  });

  it('falls back to mon.currentHp when displayHp has no entry for the slot', () => {
    const displayHp = new Map<string, number>(); // no entry for a1
    render(
      <HpBarsRow
        slots={[makeSlot('a1')]}
        label="MY TEAM"
        variant="own"
        displayHp={displayHp}
      />
    );
    expect(screen.getByText('100/200')).toBeTruthy();
  });

  it('falls back to mon.currentHp when displayHp is not provided', () => {
    render(
      <HpBarsRow slots={[makeSlot('a1')]} label="MY TEAM" variant="own" />
    );
    expect(screen.getByText('100/200')).toBeTruthy();
  });

  it('shows EXP percentage for own-variant non-fainted Pokémon below level 100', () => {
    // MediumFast L50: expForLevel('MediumFast', 51) = 51^3 = 132651
    // expTotal 66325 → Math.round(66325/132651*100) = 50
    render(
      <HpBarsRow
        slots={[makeSlot('a1', { expTotal: 66325, level: 50, growthRate: 'MediumFast' })]}
        label="MY TEAM"
        variant="own"
      />
    );
    expect(screen.getByText('EXP 50%')).toBeTruthy();
  });

  it('does not show EXP percentage for enemy-variant rows', () => {
    render(
      <HpBarsRow
        slots={[makeSlot('b1', { expTotal: 66325, level: 50, growthRate: 'MediumFast' })]}
        label="ENEMY"
        variant="enemy"
      />
    );
    expect(screen.queryByText(/EXP \d+%/)).toBeNull();
  });

  it('does not show EXP percentage for level-100 Pokémon', () => {
    render(
      <HpBarsRow
        slots={[makeSlot('a1', { expTotal: 999999, level: 100, growthRate: 'MediumFast' })]}
        label="MY TEAM"
        variant="own"
      />
    );
    expect(screen.queryByText(/EXP \d+%/)).toBeNull();
  });

  it('outer container is fluid with max-width 800', () => {
    const { container } = render(<HpBarsRow slots={[makeSlot('a1')]} label="ENEMY" variant="enemy" />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.width).toBe('100%');
    expect(outer.style.maxWidth).toBe('800px');
  });
});
