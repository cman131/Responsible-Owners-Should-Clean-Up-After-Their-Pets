import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../socket.js', () => ({
  getSocket: vi.fn(() => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() })),
}));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }));

import { SetupPanel } from '../SetupPanel.js';

describe('SetupPanel', () => {
  it('renders a back-to-hub button and calls onBack when clicked', () => {
    const onBack = vi.fn();
    render(<SetupPanel onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /hub/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
