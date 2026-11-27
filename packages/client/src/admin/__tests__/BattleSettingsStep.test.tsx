import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleSettingsStep } from '../steps/BattleSettingsStep.js';

afterEach(() => { cleanup(); });

describe('BattleSettingsStep starting weather', () => {
  it('offers None and the four weathers, with None selected', () => {
    render(<BattleSettingsStep onStart={vi.fn()} onBack={vi.fn()} />);
    const select = screen.getByLabelText('STARTING WEATHER') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['None', 'Rain', 'Sun', 'Sandstorm', 'Snow']);
    expect(select.value).toBe('');
  });

  it('omits weather when None is selected', () => {
    const onStart = vi.fn();
    render(<BattleSettingsStep onStart={onStart} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('▶ START BATTLE'));
    expect(onStart).toHaveBeenCalledWith({ label: 'Battle 1' });
  });

  it('passes the chosen weather', () => {
    const onStart = vi.fn();
    render(<BattleSettingsStep onStart={onStart} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('STARTING WEATHER'), { target: { value: 'sand' } });
    fireEvent.click(screen.getByText('▶ START BATTLE'));
    expect(onStart).toHaveBeenCalledWith({ label: 'Battle 1', weather: 'sand' });
  });
});
