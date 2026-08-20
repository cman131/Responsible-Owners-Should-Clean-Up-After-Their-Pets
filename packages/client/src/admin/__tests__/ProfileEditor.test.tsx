// packages/client/src/admin/__tests__/ProfileEditor.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'generated-uuid') }));
vi.mock('../TeamBuilder.js', () => ({
  TeamBuilder: ({ onTeamSaved, initialTeam }: any) => (
    <div>
      <span>team-builder-initial-{initialTeam?.length ?? 0}</span>
      <button onClick={() => onTeamSaved([
        { speciesId: 25, nickname: 'Pikachu', level: 50, ability: 'Static', moves: ['thunderbolt', 'quickattack', 'irontail', 'thunder'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'timid' },
      ])}>save-team</button>
    </div>
  ),
}));

import { getSocket } from '../../socket.js';
import { ProfileEditor } from '../ProfileEditor.js';
import type { NpcProfile, PlayerProfile } from '@poke-fighter/shared';

const mockSocket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

const existingNpc: NpcProfile = {
  profileId: 'npc-1', name: 'Gym Leader Misty',
  team: { templateId: 't1', name: "Misty's Team", pokemon: [{ speciesId: 54, nickname: 'Psyduck', level: 50, ability: 'Damp', moves: ['surf', 'psychic', 'icebeam', 'encore'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'modest' }], createdAt: '2024-01-01' },
  createdAt: '2024-01-01',
};

const existingPlayer: PlayerProfile = {
  profileId: 'player-1', displayName: 'Ash Ketchum',
  defaultTeam: { templateId: 't2', name: "Ash's Team", pokemon: [{ speciesId: 25, nickname: 'Pikachu', level: 50, ability: 'Static', moves: ['thunderbolt', 'quickattack', 'irontail', 'thunder'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'timid' }], createdAt: '2024-01-01' },
  createdAt: '2024-01-01',
};

describe('ProfileEditor — NPC', () => {
  it('shows EDIT NPC title and pre-fills name for existing profile', () => {
    render(<ProfileEditor type="npc" profile={existingNpc} onBack={vi.fn()} />);
    expect(screen.getByText(/edit npc/i)).toBeTruthy();
    expect(screen.getByDisplayValue('Gym Leader Misty')).toBeTruthy();
  });

  it('shows NEW NPC title when profile is null', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    expect(screen.getByText(/new npc/i)).toBeTruthy();
  });

  it('SAVE is disabled when name is empty', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('save-team'));
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('SAVE is disabled when team is empty (no team save triggered)', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. gym/i), { target: { value: 'Test NPC' } });
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits registry:save-npc with correct profile on SAVE', () => {
    render(<ProfileEditor type="npc" profile={null} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. gym/i), { target: { value: 'Elite Four Lance' } });
    fireEvent.click(screen.getByText('save-team'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'registry:save-npc',
      data: expect.objectContaining({
        profile: expect.objectContaining({ name: 'Elite Four Lance', profileId: 'generated-uuid' }),
      }),
    }));
  });

  it('preserves profileId and createdAt when editing existing NPC', () => {
    render(<ProfileEditor type="npc" profile={existingNpc} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('save-team'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      data: expect.objectContaining({
        profile: expect.objectContaining({ profileId: 'npc-1', createdAt: '2024-01-01' }),
      }),
    }));
  });

  it('calls onBack when DISCARD clicked', () => {
    const onBack = vi.fn();
    render(<ProfileEditor type="npc" profile={existingNpc} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('ProfileEditor — Player', () => {
  it('shows DISPLAY NAME label and emits registry:save-player on save', () => {
    render(<ProfileEditor type="player" profile={null} onBack={vi.fn()} />);
    expect(screen.getByText(/display name/i)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/ash/i), { target: { value: 'Gary Oak' } });
    fireEvent.click(screen.getByText('save-team'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({
      type: 'registry:save-player',
      data: expect.objectContaining({
        profile: expect.objectContaining({ displayName: 'Gary Oak' }),
      }),
    }));
  });
});
