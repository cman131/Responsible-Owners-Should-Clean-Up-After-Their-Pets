// packages/client/src/admin/__tests__/HubPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HubPanel } from '../HubPanel.js';

describe('HubPanel', () => {
  it('calls onSetup when Battle Setup tile is clicked', () => {
    const onSetup = vi.fn();
    render(<HubPanel onSetup={onSetup} onRegistry={vi.fn()} />);
    fireEvent.click(screen.getByText(/battle setup/i));
    expect(onSetup).toHaveBeenCalled();
  });

  it('calls onRegistry when Registry tile is clicked', () => {
    const onRegistry = vi.fn();
    render(<HubPanel onSetup={vi.fn()} onRegistry={onRegistry} />);
    fireEvent.click(screen.getByText(/^registry$/i));
    expect(onRegistry).toHaveBeenCalled();
  });
});
