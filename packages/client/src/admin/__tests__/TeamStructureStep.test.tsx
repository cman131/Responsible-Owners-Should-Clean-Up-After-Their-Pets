import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TeamStructureStep } from '../steps/TeamStructureStep.js';

describe('TeamStructureStep', () => {
  it('renders team A and team B slot count pickers', () => {
    render(<TeamStructureStep onNext={vi.fn()} />);
    expect(screen.getByText(/team a/i)).toBeTruthy();
    expect(screen.getByText(/team b/i)).toBeTruthy();
  });

  it('calls onNext with slot counts when confirmed', () => {
    const onNext = vi.fn();
    render(<TeamStructureStep onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledWith({ teamASlots: 1, teamBSlots: 1 });
  });
});
