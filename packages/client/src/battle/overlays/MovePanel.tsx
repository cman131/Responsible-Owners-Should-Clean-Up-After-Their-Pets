import type { ActionRequestPayload } from '@poke-fighter/shared';

interface Props {
  request: ActionRequestPayload;
  onSelectMove: (moveIndex: number) => void;
  onSwitchRequested?: () => void;
}

export function MovePanel({ request, onSelectMove, onSwitchRequested }: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.label}>CHOOSE A MOVE</div>
      <div style={styles.grid}>
        {request.validMoves.map((mv) => {
          const disabled = mv.disabled || mv.pp === 0;
          return (
            <button
              key={mv.index}
              style={{ ...styles.moveBtn, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
              disabled={disabled}
              onClick={() => onSelectMove(mv.index)}
            >
              <span style={styles.moveName}>{mv.moveId}</span>
              <span style={styles.movePp}>PP {mv.pp}</span>
            </button>
          );
        })}
      </div>
      {request.canTerastallize && (
        <div style={styles.tera}>
          <label style={{ color: '#aaa', fontSize: 11 }}>
            <input type="checkbox" id="tera" style={{ marginRight: 6 }} />
            Terastallize this turn
          </label>
        </div>
      )}
      {request.canSwitch && onSwitchRequested && (
        <button
          style={{ ...styles.moveBtn, background: '#1a3a1a', borderColor: '#27ae60', marginTop: 8, width: '100%', justifyContent: 'center' }}
          onClick={onSwitchRequested}
        >
          SWITCH POKÉMON
        </button>
      )}
    </div>
  );
}

const styles = {
  panel: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 16 },
  label: { color: '#aaa', fontSize: 10, letterSpacing: 2, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  moveBtn: { background: '#1a1a2e', border: '1px solid #3498db', color: '#fff', padding: '10px 12px', borderRadius: 4, fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  moveName: { fontSize: 13, textTransform: 'capitalize' as const },
  movePp: { fontSize: 11, color: '#aaa' },
  tera: { marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 },
};
