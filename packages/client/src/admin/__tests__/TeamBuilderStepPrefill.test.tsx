import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ initialTeam }: any) => (
    <div>team-size-{initialTeam?.length ?? 0}</div>
  ),
}));

import { TeamBuilderStep } from '../steps/TeamBuilderStep.js';
import type { PokemonSet } from '@poke-fighter/shared';

const pikachu: PokemonSet = {
  speciesId: 25, nickname: 'Pikachu', level: 36, nature: 'jolly',
  moves: ['thunderbolt', '', '', ''], ability: 'Static',
  evs: { hp:0,atk:0,def:0,spa:0,spd:0,spe:0 },
  ivs: { hp:31,atk:31,def:31,spa:31,spd:31,spe:31 },
};

describe('TeamBuilderStep — defaultTeam pre-fill', () => {
  it('pre-fills TeamBuilder initialTeam from slot.defaultTeam', () => {
    const slots = {
      teamA: [{ slotId: 'a1', displayName: 'Ash', defaultTeam: [pikachu] }],
      teamB: [{ slotId: 'b1', displayName: 'Gary' }],
    };
    render(<TeamBuilderStep slots={slots} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('team-size-1')).toBeTruthy();
  });

  it('starts with empty team when slot has no defaultTeam', () => {
    const slots = {
      teamA: [{ slotId: 'a1', displayName: 'Gary' }],
      teamB: [],
    };
    render(<TeamBuilderStep slots={slots} onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('team-size-0')).toBeTruthy();
  });
});
