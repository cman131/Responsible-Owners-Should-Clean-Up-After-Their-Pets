// packages/client/src/admin/__tests__/AdminRouter.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../HubPanel.js', () => ({
  HubPanel: ({ onSetup, onRegistry, onBattles, onLogout }: any) => (
    <div>
      <button onClick={onSetup}>hub-setup</button>
      <button onClick={onRegistry}>hub-registry</button>
      <button onClick={onBattles}>hub-battles</button>
      <button onClick={onLogout}>hub-logout</button>
    </div>
  ),
}));
vi.mock('../SetupPanel.js', () => ({
  SetupPanel: ({ onBack }: any) => <div>setup-panel<button onClick={onBack}>setup-back</button></div>,
}));
vi.mock('../RegistryPanel.js', () => ({
  RegistryPanel: ({ onBack }: any) => <div>registry-panel<button onClick={onBack}>reg-back</button></div>,
}));
vi.mock('../ControlPanel.js', () => ({
  ControlPanel: ({ battleId, onBack }: any) => <div>control-panel-{battleId}<button onClick={onBack}>control-back</button></div>,
}));
vi.mock('../BattlesPanel.js', () => ({
  BattlesPanel: ({ onBack, onWatch }: any) => (
    <div>
      battles-panel
      <button onClick={onBack}>battles-back</button>
      <button onClick={() => onWatch('b99')}>watch-b99</button>
    </div>
  ),
}));

import { getSocket } from '../../socket.js';
import { AdminRouter } from '../AdminRouter.js';

const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  vi.clearAllMocks();
});

describe('AdminRouter', () => {
  it('renders HubPanel by default', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    expect(screen.getByText('hub-setup')).toBeTruthy();
  });

  it('renders SetupPanel when Battle Setup tile clicked', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-setup'));
    expect(screen.getByText('setup-panel')).toBeTruthy();
  });

  it('renders RegistryPanel when Registry tile clicked', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-registry'));
    expect(screen.getByText('registry-panel')).toBeTruthy();
  });

  it('returns to HubPanel from SetupPanel via onBack', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-setup'));
    fireEvent.click(screen.getByText('setup-back'));
    expect(screen.getByText('hub-setup')).toBeTruthy();
  });

  it('renders BattlesPanel when Battles tile clicked', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-battles'));
    expect(screen.getByText('battles-panel')).toBeTruthy();
  });

  it('returns to HubPanel from BattlesPanel via onBack', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-battles'));
    fireEvent.click(screen.getByText('battles-back'));
    expect(screen.getByText('hub-setup')).toBeTruthy();
  });

  it('renders ControlPanel when onWatch is called from BattlesPanel', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-battles'));
    fireEvent.click(screen.getByText('watch-b99'));
    expect(screen.getByText('control-panel-b99')).toBeTruthy();
  });

  it('emits battles:connect when onWatch is called', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-battles'));
    fireEvent.click(screen.getByText('watch-b99'));
    expect(mockSocket.emit).toHaveBeenCalledWith('admin:action', { type: 'battles:connect', data: { battleId: 'b99' } });
  });

  it('returns to BattlesPanel from ControlPanel via onBack', () => {
    render(<AdminRouter onLogout={vi.fn()} />);
    fireEvent.click(screen.getByText('hub-battles'));
    fireEvent.click(screen.getByText('watch-b99'));
    fireEvent.click(screen.getByText('control-back'));
    expect(screen.getByText('battles-panel')).toBeTruthy();
  });

  it('calls onLogout prop when HubPanel triggers logout', () => {
    const onLogout = vi.fn();
    render(<AdminRouter onLogout={onLogout} />);
    fireEvent.click(screen.getByText('hub-logout'));
    expect(onLogout).toHaveBeenCalled();
  });
});
