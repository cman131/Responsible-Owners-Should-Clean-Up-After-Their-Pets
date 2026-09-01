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

describe('crit event', () => {
  it('produces a "A critical hit!" log entry', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [{ type: 'crit', data: { slotId: 's1' } }],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(2); // round-start + crit
    expect(log[1]).toEqual({ type: 'normal', text: 'A critical hit!' });
  });

  it('crit message also appears via battle:history', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['battle:history']?.({
        turns: [
          { turnNumber: 1, events: [{ type: 'crit', data: { slotId: 's1' } }] },
        ],
      });
    });
    const log = result.current.turnLog;
    expect(log[1]).toEqual({ type: 'normal', text: 'A critical hit!' });
  });
});

describe('damage-dealt effectiveness lines', () => {
  function fireDamageEvent(effectiveness: number, hasMove = true) {
    const data: Record<string, unknown> = {
      damage: 40,
      targetSlotId: 's2',
      effectiveness,
      remainingHp: 60,
    };
    if (hasMove) {
      data['moveId'] = 'thunderbolt';
      data['attackerSlotId'] = 's1';
    } else {
      data['source'] = 'brn';
      data['slotId'] = 's2';
    }
    return { type: 'damage-dealt' as const, data };
  }

  it('appends "It\'s super effective!" as a separate log entry when effectiveness > 1', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(2)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(3); // round-start + damage + effectiveness
    expect(log[1]).toEqual({ type: 'normal', text: 'Dealt 40 damage to s2.' });
    expect(log[2]).toEqual({ type: 'normal', text: "It's super effective!" });
  });

  it('appends "It\'s not very effective..." as a separate log entry when effectiveness < 1', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(0.5)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(3); // round-start + damage + effectiveness
    expect(log[2]).toEqual({ type: 'normal', text: "It's not very effective..." });
  });

  it('does not add an effectiveness line when effectiveness === 1', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(1)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(2); // round-start + damage only
    expect(log[1]).toEqual({ type: 'normal', text: 'Dealt 40 damage to s2.' });
  });

  it('does not add an effectiveness line for passive damage (no moveId)', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [fireDamageEvent(2, false)],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    // passive damage uses slotId not targetSlotId; only round-start + one damage line
    expect(log).toHaveLength(2);
    expect(log[1]).toEqual({ type: 'normal', text: 'Dealt 40 damage to s2.' });
  });

  it('effectiveness lines also appear via battle:history', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['battle:history']?.({
        turns: [
          { turnNumber: 1, events: [fireDamageEvent(4)] },
        ],
      });
    });
    const log = result.current.turnLog;
    expect(log[2]).toEqual({ type: 'normal', text: "It's super effective!" });
  });

  it('produces the full sequence: damage, effectiveness, then crit on a super-effective crit', () => {
    const { result } = renderHook(() => useBattle(), { wrapper });
    act(() => {
      socketListeners['turn:resolve']?.({
        turnNumber: 2,
        events: [
          fireDamageEvent(2),
          { type: 'crit', data: { slotId: 's2' } },
        ],
        state: { turnNumber: 2, phase: 'action', teams: [], field: {} },
      });
    });
    const log = result.current.turnLog;
    expect(log).toHaveLength(4); // round-start + damage + effectiveness + crit
    expect(log[1]).toEqual({ type: 'normal', text: 'Dealt 40 damage to s2.' });
    expect(log[2]).toEqual({ type: 'normal', text: "It's super effective!" });
    expect(log[3]).toEqual({ type: 'normal', text: 'A critical hit!' });
  });
});
