import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EffectsIndicator } from '../EffectsIndicator.js';
import type { PartyMember, MoveSlot } from '@poke-fighter/shared';

function makeMon(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    instanceId: 'test-id',
    speciesId: 6,
    speciesName: 'charizard',
    nickname: 'Charizard',
    level: 50,
    currentHp: 240,
    maxHp: 334,
    stats: { hp: 334, atk: 200, def: 150, spa: 220, spd: 160, spe: 210 },
    ability: 'blaze',
    moves: [
      { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
      { moveId: 'airslash', currentPp: 15, maxPp: 15 },
      { moveId: 'roost', currentPp: 10, maxPp: 10 },
      { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
    ] as [MoveSlot, MoveSlot, MoveSlot, MoveSlot],
    volatileStatus: [],
    statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    hasTerastallized: false,
    fainted: false,
    expTotal: 0,
    ...overrides,
  };
}

describe('EffectsIndicator', () => {
  describe('null cases', () => {
    it('renders nothing when mon is fainted', () => {
      const { container } = render(<EffectsIndicator mon={makeMon({ fainted: true })} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when there are no effects', () => {
      const { container } = render(<EffectsIndicator mon={makeMon()} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('chip display', () => {
    it('shows status chip text for status condition', () => {
      const { getByText } = render(<EffectsIndicator mon={makeMon({ status: 'brn' })} />);
      expect(getByText('BRN')).toBeTruthy();
    });

    it('shows PAR chip for paralysis', () => {
      const { getByText } = render(<EffectsIndicator mon={makeMon({ status: 'par' })} />);
      expect(getByText('PAR')).toBeTruthy();
    });

    it('abbreviates known volatile status names', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({ volatileStatus: [{ name: 'confusion' }] })} />
      );
      expect(getByText('CNF')).toBeTruthy();
    });

    it('falls back to first 3 chars uppercased for unknown volatile names', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({ volatileStatus: [{ name: 'perish' }] })} />
      );
      expect(getByText('PER')).toBeTruthy();
    });

    it('shows ± chip when only stat boosts are active', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({ statBoosts: { atk: 2, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } })} />
      );
      expect(getByText('±')).toBeTruthy();
    });

    it('does not show ± chip when status is also present', () => {
      const { queryByText } = render(
        <EffectsIndicator mon={makeMon({ status: 'brn', statBoosts: { atk: 2, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 } })} />
      );
      expect(queryByText('±')).toBeNull();
    });

    it('collapses chips beyond 3 to +N overflow label', () => {
      const { getByText } = render(
        <EffectsIndicator mon={makeMon({
          status: 'brn',
          volatileStatus: [{ name: 'confusion' }, { name: 'encore' }, { name: 'leechseed' }],
        })} />
      );
      expect(getByText('+1')).toBeTruthy();
    });
  });
});
