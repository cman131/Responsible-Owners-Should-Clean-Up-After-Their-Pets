import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MovePanel } from '../overlays/MovePanel.js';
import type { ActionRequestPayload } from '@poke-fighter/shared';

const mockRequest: ActionRequestPayload = {
  slotId: 'slot-a1',
  validMoves: [
    { index: 0, moveId: 'flamethrower', pp: 15, disabled: false },
    { index: 1, moveId: 'airslash', pp: 15, disabled: false },
    { index: 2, moveId: 'roost', pp: 10, disabled: false },
    { index: 3, moveId: 'willowisp', pp: 15, disabled: false },
  ],
  legalTargets: ['slot-b1'],
  canSwitch: false,
  switchTargets: [],
  canTerastallize: true,
};

describe('MovePanel', () => {
  it('renders all 4 moves', () => {
    render(<MovePanel request={mockRequest} onSelectMove={vi.fn()} />);
    expect(screen.getByText('flamethrower')).toBeTruthy();
    expect(screen.getByText('airslash')).toBeTruthy();
    expect(screen.getByText('roost')).toBeTruthy();
    expect(screen.getByText('willowisp')).toBeTruthy();
  });

  it('calls onSelectMove with index when a move is clicked', () => {
    const onSelectMove = vi.fn();
    render(<MovePanel request={mockRequest} onSelectMove={onSelectMove} />);
    fireEvent.click(screen.getByText('flamethrower'));
    expect(onSelectMove).toHaveBeenCalledWith(0);
  });

  it('disables moves with 0 PP', () => {
    const req = { ...mockRequest, validMoves: [{ ...mockRequest.validMoves[0]!, pp: 0 }, ...mockRequest.validMoves.slice(1)] };
    render(<MovePanel request={req} onSelectMove={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
