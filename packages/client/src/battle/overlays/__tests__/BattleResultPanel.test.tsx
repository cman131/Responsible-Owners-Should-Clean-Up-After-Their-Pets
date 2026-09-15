import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BattleResultPanel } from '../BattleResultPanel.js';
import type { BattleState } from '@poke-fighter/shared';

function makeState(): BattleState {
  return {
    battleId: 'b1',
    label: 'Test',
    turnNumber: 3,
    phase: 'ended',
    teams: [
      {
        teamId: 'team-a',
        slots: [
          { slotId: 's1', displayName: 'Ash', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 },
          { slotId: 's2', displayName: 'Misty', isNpc: false, isSpectator: false, party: [], activePokemonIndex: 0 },
        ],
      },
      {
        teamId: 'team-b',
        slots: [
          { slotId: 's3', displayName: 'Brock', isNpc: true, isSpectator: false, party: [], activePokemonIndex: 0 },
        ],
      },
    ],
    field: {} as BattleState['field'],
    winner: 0,
  };
}

describe('BattleResultPanel', () => {
  it('shows VICTORY when mySlotId is on the winning team', () => {
    render(<BattleResultPanel winningTeamId="team-a" finalState={makeState()} mySlotId="s1" onGoHome={() => {}} />);
    expect(screen.getByText('VICTORY')).toBeTruthy();
  });

  it('shows DEFEAT when mySlotId is on the losing team', () => {
    render(<BattleResultPanel winningTeamId="team-a" finalState={makeState()} mySlotId="s3" onGoHome={() => {}} />);
    expect(screen.getByText('DEFEAT')).toBeTruthy();
  });

  it('shows BATTLE OVER when mySlotId is not in any team', () => {
    render(<BattleResultPanel winningTeamId="team-a" finalState={makeState()} mySlotId="unknown" onGoHome={() => {}} />);
    expect(screen.getByText('BATTLE OVER')).toBeTruthy();
  });

  it('displays comma-delimited winner names', () => {
    render(<BattleResultPanel winningTeamId="team-a" finalState={makeState()} mySlotId="s1" onGoHome={() => {}} />);
    expect(screen.getByText('Ash, Misty')).toBeTruthy();
  });

  it('displays loser names', () => {
    render(<BattleResultPanel winningTeamId="team-a" finalState={makeState()} mySlotId="s1" onGoHome={() => {}} />);
    expect(screen.getByText('Brock')).toBeTruthy();
  });

  it('calls onGoHome when Return Home button is clicked', () => {
    const onGoHome = vi.fn();
    render(<BattleResultPanel winningTeamId="team-a" finalState={makeState()} mySlotId="s1" onGoHome={onGoHome} />);
    fireEvent.click(screen.getByText('← Return Home'));
    expect(onGoHome).toHaveBeenCalledOnce();
  });

  it('excludes spectator slots from displayed names', () => {
    const state = makeState();
    state.teams[0]!.slots.push({
      slotId: 's4', displayName: 'Spectator', isNpc: false, isSpectator: true, party: [], activePokemonIndex: 0,
    });
    render(<BattleResultPanel winningTeamId="team-a" finalState={state} mySlotId="s1" onGoHome={() => {}} />);
    expect(screen.queryByText(/Spectator/)).toBeNull();
    expect(screen.getByText('Ash, Misty')).toBeTruthy();
  });
});
