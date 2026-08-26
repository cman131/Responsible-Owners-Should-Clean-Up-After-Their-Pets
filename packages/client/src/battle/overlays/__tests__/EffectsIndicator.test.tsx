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
});
