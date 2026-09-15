import type { BattleState, TeamState } from '@poke-fighter/shared';

interface Props {
  winningTeamId: string;
  finalState: BattleState;
  mySlotId: string;
  onGoHome: () => void;
}

function teamDisplayNames(team: TeamState): string {
  return team.slots.filter(s => !s.isSpectator).map(s => s.displayName).join(', ');
}

export function BattleResultPanel({ winningTeamId, finalState, mySlotId, onGoHome }: Props) {
  const winnerIdx = finalState.teams.findIndex(t => t.teamId === winningTeamId);
  const winnerTeam = finalState.teams[winnerIdx];
  const loserTeam = finalState.teams[winnerIdx === 0 ? 1 : 0];
  const myTeamIdx = finalState.teams.findIndex(t => t.slots.some(s => s.slotId === mySlotId));

  const outcome = myTeamIdx === -1 ? 'neutral' : myTeamIdx === winnerIdx ? 'victory' : 'defeat';
  const accent = outcome === 'victory' ? '#f0c040' : outcome === 'defeat' ? '#e74c3c' : '#555';
  const label = outcome === 'victory' ? 'VICTORY' : outcome === 'defeat' ? 'DEFEAT' : 'BATTLE OVER';

  return (
    <div style={{ background: '#0d0d1a', border: `2px solid ${accent}`, borderRadius: 8, padding: 16 }}>
      <div style={{ color: accent, fontSize: 18, letterSpacing: 2, marginBottom: 12, textAlign: 'center' }}>
        {label}
      </div>
      {winnerTeam && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#555', fontSize: 10, letterSpacing: 1 }}>WINNER</div>
          <div style={{ color: '#f0c040', fontSize: 13 }}>{teamDisplayNames(winnerTeam)}</div>
        </div>
      )}
      {loserTeam && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#555', fontSize: 10, letterSpacing: 1 }}>DEFEATED</div>
          <div style={{ color: '#aaa', fontSize: 13 }}>{teamDisplayNames(loserTeam)}</div>
        </div>
      )}
      <button
        onClick={onGoHome}
        style={{
          background: accent, color: outcome === 'victory' ? '#000' : '#fff',
          border: 'none', padding: '8px 20px', borderRadius: 4,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, width: '100%',
        }}
      >
        ← Return Home
      </button>
    </div>
  );
}
