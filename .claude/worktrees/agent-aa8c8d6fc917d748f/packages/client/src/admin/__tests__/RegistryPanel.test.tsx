// packages/client/src/admin/__tests__/RegistryPanel.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../ProfileEditor.js', () => ({
  ProfileEditor: ({ type, onBack }: any) => (
    <div>editor-{type}<button onClick={onBack}>editor-back</button></div>
  ),
}));

import { getSocket } from '../../socket.js';
import { RegistryPanel } from '../RegistryPanel.js';

let registryDataHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'registry:data') registryDataHandler = handler;
  }),
  off: vi.fn(),
};

const mockNpc = { profileId: 'npc-1', name: 'Gym Leader Misty', team: { templateId: 't1', name: "Misty's Team", pokemon: [{ speciesId: 54 }, { speciesId: 120 }], createdAt: '2024-01-01' }, createdAt: '2024-01-01' };
const mockPlayer = { profileId: 'player-1', displayName: 'Ash Ketchum', defaultTeam: { templateId: 't2', name: "Ash's Team", pokemon: [{ speciesId: 25 }], createdAt: '2024-01-01' }, createdAt: '2024-01-01' };

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  registryDataHandler = null;
  vi.clearAllMocks();
});

describe('RegistryPanel', () => {
  it('emits registry:list for both npcs and players on mount', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ data: { resource: 'npcs' } }));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ data: { resource: 'players' } }));
  });

  it('shows NPC tab by default', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    expect(screen.getByText('NPCS')).toBeTruthy();
  });

  it('renders NPC rows from registry:data event', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'npcs', data: [mockNpc] }); });
    expect(screen.getByText('Gym Leader Misty')).toBeTruthy();
    expect(screen.getByText('2 Pokémon')).toBeTruthy();
  });

  it('switches to Players tab and shows player rows', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'players', data: [mockPlayer] }); });
    fireEvent.click(screen.getByText('PLAYERS'));
    expect(screen.getByText('Ash Ketchum')).toBeTruthy();
    expect(screen.getByText('1 Pokémon')).toBeTruthy();
  });

  it('emits registry:delete-npc when Delete clicked', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'npcs', data: [mockNpc] }); });
    fireEvent.click(screen.getByText('DEL'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', expect.objectContaining({ type: 'registry:delete-npc', data: { profileId: 'npc-1' } }));
  });

  it('shows editor when Edit clicked and returns to list on back', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    act(() => { registryDataHandler?.({ resource: 'npcs', data: [mockNpc] }); });
    fireEvent.click(screen.getByText('EDIT'));
    expect(screen.getByText(/editor-npc/)).toBeTruthy();
    fireEvent.click(screen.getByText('editor-back'));
    expect(screen.getByText('Gym Leader Misty')).toBeTruthy();
  });

  it('shows editor for new NPC when + NEW clicked', () => {
    render(<RegistryPanel onBack={vi.fn()} />);
    fireEvent.click(screen.getByText(/new npc/i));
    expect(screen.getByText(/editor-npc/)).toBeTruthy();
  });

  it('calls onBack when ← HUB clicked', () => {
    const onBack = vi.fn();
    render(<RegistryPanel onBack={onBack} />);
    fireEvent.click(screen.getByText(/hub/i));
    expect(onBack).toHaveBeenCalled();
  });
});
