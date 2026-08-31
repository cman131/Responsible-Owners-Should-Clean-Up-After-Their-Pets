import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

let socketListeners: Record<string, (payload: unknown) => void> = {};
const mockEmit = vi.fn();

vi.mock('../../socket.js', () => ({
  getSocket: () => ({
    on: (event: string, handler: (p: unknown) => void) => { socketListeners[event] = handler; },
    off: vi.fn(),
    emit: mockEmit,
  }),
}));

import { BattleProvider, useBattle } from '../BattleContext.js';

function wrapper({ children }: { children: React.ReactNode }) {
  return <BattleProvider mySlotId="s1">{children}</BattleProvider>;
}

beforeEach(() => {
  socketListeners = {};
  mockEmit.mockClear();
});

describe('turn:resolve', () => {
  it('prepends a round-start entry (Round N-1) before the turn events', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'faint', data: { slotId: 's1', instanceId: 'i1' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log[0]).toEqual({ type: 'round-start', text: '-------Round 1-------' });
    expect(log[1]).toEqual({ type: 'normal', text: "s1's Pokémon fainted!" });
  });

  it('filters out events that produce empty text', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [
          { type: 'volatile-applied', data: { something: 'else' } },  // still returns '', filtered
          { type: 'heal', data: { slotId: 's2' } },
        ],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    // round-start + heal only (volatile-applied returns '' and is filtered)
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({ type: 'round-start', text: '-------Round 1-------' });
    expect(log[1]).toEqual({ type: 'normal', text: 's2 restored HP.' });
  });

  it('pokemon-switched event appears in turn log', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [
          { type: 'pokemon-switched', data: { slotId: 's1', outInstanceId: 'out-1', inInstanceId: 'in-1', reason: 'voluntary' } },
        ],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(2);  // round-start + pokemon-switched text
    expect(log[1]).toEqual({ type: 'normal', text: "s1's Pokémon was switched out!" });
  });
});

describe('battle:history', () => {
  it('replaces turnLog with history entries including round-start separators', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['battle:history']?.({
        turns: [
          { turnNumber: 1, events: [{ type: 'faint', data: { slotId: 'a1', instanceId: 'i1' } }] },
          { turnNumber: 2, events: [{ type: 'heal', data: { slotId: 'b1' } }] },
        ],
      });
    });
    const log = result.current.turnLog;
    expect(log[0]).toEqual({ type: 'round-start', text: '-------Round 0-------' });
    expect(log[1]).toEqual({ type: 'normal', text: "a1's Pokémon fainted!" });
    expect(log[2]).toEqual({ type: 'round-start', text: '-------Round 1-------' });
    expect(log[3]).toEqual({ type: 'normal', text: 'b1 restored HP.' });
  });

  it('replaces any existing turnLog entries when history arrives', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'heal', data: { slotId: 'x1' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    expect(result.current.turnLog.length).toBeGreaterThan(0);
    act(() => {
      socketListeners['battle:history']?.({ turns: [] });
    });
    expect(result.current.turnLog).toEqual([]);
  });
});
