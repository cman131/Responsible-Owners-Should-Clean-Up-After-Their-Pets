import type { PartyMember } from '@poke-fighter/shared';

interface Props {
  party: PartyMember[];
  onSwitch: (instanceId: string) => void;
  onCancel?: () => void;
  label?: string;
}

export function SwitchPanel({ party, onSwitch, onCancel, label = 'CHOOSE POKÉMON' }: Props) {
  return (
    <div style={{ background: '#0d0d1a', border: '2px solid #27ae60', borderRadius: 8, padding: 16 }}>
      <div style={{ color: '#27ae60', fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {party.map((mon) => (
          <button
            key={mon.instanceId}
            disabled={mon.fainted}
            onClick={() => onSwitch(mon.instanceId)}
            style={{
              background: mon.fainted ? '#111' : '#1a3a1a',
              border: '1px solid #27ae60',
              color: mon.fainted ? '#555' : '#fff',
              padding: '8px 12px',
              borderRadius: 4,
              cursor: mon.fainted ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              justifyContent: 'space-between',
              opacity: mon.fainted ? 0.5 : 1,
            }}
          >
            <span>Species #{mon.speciesId} L{mon.level}</span>
            <span style={{ color: mon.fainted ? '#e74c3c' : '#2ecc71', fontSize: 11 }}>
              {mon.fainted ? 'FAINTED' : `HP ${mon.currentHp}/${mon.maxHp}`}
            </span>
          </button>
        ))}
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          style={{ marginTop: 10, background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
        >
          [Cancel]
        </button>
      )}
    </div>
  );
}
