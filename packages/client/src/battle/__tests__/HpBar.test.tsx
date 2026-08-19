import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HpBar } from '../overlays/HpBar.js';

describe('HpBar', () => {
  it('renders full bar at 100%', () => {
    render(<HpBar current={100} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('renders half bar at 50%', () => {
    render(<HpBar current={50} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.width).toBe('50%');
  });

  it('uses green color above 50%', () => {
    render(<HpBar current={80} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.background).toContain('rgb(46, 204, 113)');
  });

  it('uses yellow color between 20% and 50%', () => {
    render(<HpBar current={30} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.background).toContain('rgb(240, 192, 64)');
  });

  it('uses red color below 20%', () => {
    render(<HpBar current={10} max={100} />);
    const bar = document.querySelector('[data-testid="hp-fill"]') as HTMLElement;
    expect(bar.style.background).toContain('rgb(231, 76, 60)');
  });
});
