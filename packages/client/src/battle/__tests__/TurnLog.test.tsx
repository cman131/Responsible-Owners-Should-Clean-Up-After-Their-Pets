import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TurnLog } from '../overlays/TurnLog.js';
import type { LogEntry } from '../BattleContext.js';

describe('TurnLog', () => {
  it('renders a normal log entry', () => {
    const messages: LogEntry[] = [{ type: 'normal', text: 'Charizard used Flamethrower!' }];
    render(<TurnLog messages={messages} />);
    expect(screen.getByText('Charizard used Flamethrower!')).toBeTruthy();
  });

  it('renders a round-start entry', () => {
    const messages: LogEntry[] = [{ type: 'round-start', text: '-------Round 1-------' }];
    render(<TurnLog messages={messages} />);
    expect(screen.getByText('-------Round 1-------')).toBeTruthy();
  });

  it('filters entries with empty text', () => {
    const messages: LogEntry[] = [
      { type: 'normal', text: '' },
      { type: 'normal', text: 'Bulbasaur fainted!' },
    ];
    const { container } = render(<TurnLog messages={messages} />);
    const entries = container.querySelectorAll('[data-testid="log-entry"]');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.textContent).toBe('Bulbasaur fainted!');
  });

  it('renders multiple entries in order', () => {
    const messages: LogEntry[] = [
      { type: 'round-start', text: '-------Round 2-------' },
      { type: 'normal', text: 'Squirtle used Surf!' },
    ];
    const { container } = render(<TurnLog messages={messages} />);
    const items = container.querySelectorAll('[data-testid="log-entry"]');
    expect(items[0]!.textContent).toBe('-------Round 2-------');
    expect(items[1]!.textContent).toBe('Squirtle used Surf!');
  });
});

describe('TurnLog expand/collapse', () => {
  it('renders a "Show full log" button by default', () => {
    render(<TurnLog messages={[]} />);
    expect(screen.getByRole('button', { name: 'Show full log' })).toBeTruthy();
  });

  it('changes button label to "Collapse" when clicked', () => {
    render(<TurnLog messages={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full log' }));
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
  });

  it('changes button label back to "Show full log" when Collapse is clicked', () => {
    render(<TurnLog messages={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full log' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Show full log' })).toBeTruthy();
  });
});
