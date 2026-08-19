// packages/client/src/admin/__tests__/AdminRouter.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../socket.js', () => ({ getSocket: vi.fn() }));
vi.mock('../HubPanel.js', () => ({
  HubPanel: ({ onSetup, onRegistry }: any) => (
    <div>
      <button onClick={onSetup}>hub-setup</button>
      <button onClick={onRegistry}>hub-registry</button>
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
  ControlPanel: ({ battleId }: any) => <div>control-panel-{battleId}</div>,
}));

import { getSocket } from '../../socket.js';
import { AdminRouter } from '../AdminRouter.js';

let battleStartHandler: ((p: any) => void) | null = null;
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'battle:start') battleStartHandler = handler;
  }),
  off: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getSocket).mockReturnValue(mockSocket as any);
  battleStartHandler = null;
  vi.clearAllMocks();
});

describe('AdminRouter', () => {
  it('renders HubPanel by default', () => {
    render(<AdminRouter />);
    expect(screen.getByText('hub-setup')).toBeTruthy();
  });

  it('renders SetupPanel when Battle Setup tile clicked', () => {
    render(<AdminRouter />);
    fireEvent.click(screen.getByText('hub-setup'));
    expect(screen.getByText('setup-panel')).toBeTruthy();
  });

  it('renders RegistryPanel when Registry tile clicked', () => {
    render(<AdminRouter />);
    fireEvent.click(screen.getByText('hub-registry'));
    expect(screen.getByText('registry-panel')).toBeTruthy();
  });

  it('returns to HubPanel from SetupPanel via onBack', () => {
    render(<AdminRouter />);
    fireEvent.click(screen.getByText('hub-setup'));
    fireEvent.click(screen.getByText('setup-back'));
    expect(screen.getByText('hub-setup')).toBeTruthy();
  });

  it('renders ControlPanel when battle:start fires', () => {
    render(<AdminRouter />);
    act(() => { battleStartHandler?.({ state: { battleId: 'b1' } }); });
    expect(screen.getByText('control-panel-b1')).toBeTruthy();
  });
});
