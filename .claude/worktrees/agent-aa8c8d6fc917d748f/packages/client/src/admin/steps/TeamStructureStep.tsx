import { useState } from 'react';

interface Props {
  onNext: (config: { teamASlots: number; teamBSlots: number }) => void;
}

export function TeamStructureStep({ onNext }: Props) {
  const [teamASlots, setTeamASlots] = useState(1);
  const [teamBSlots, setTeamBSlots] = useState(1);

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Team Structure</h2>
      <p style={styles.sub}>How many players/NPCs per team?</p>

      <div style={styles.row}>
        <TeamSlotPicker label="Team A" value={teamASlots} onChange={setTeamASlots} />
        <TeamSlotPicker label="Team B" value={teamBSlots} onChange={setTeamBSlots} />
      </div>

      <button style={styles.button} onClick={() => onNext({ teamASlots, teamBSlots })}>
        NEXT →
      </button>
    </div>
  );
}

function TeamSlotPicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#aaa', fontSize: 12, letterSpacing: 2, marginBottom: 8 }}>{label.toUpperCase()}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={styles.countBtn} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
        <span style={{ fontSize: 32, color: '#fff', minWidth: 32, textAlign: 'center' }}>{value}</span>
        <button style={styles.countBtn} onClick={() => onChange(Math.min(6, value + 1))}>+</button>
      </div>
      <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>slots (1–6)</div>
    </div>
  );
}

const styles = {
  container: { display:'flex', flexDirection:'column' as const, gap:24, padding:24 },
  heading: { color:'#f0c040', fontSize:20, letterSpacing:2 },
  sub: { color:'#aaa', fontSize:14 },
  row: { display:'flex', gap:48, justifyContent:'center' },
  button: { background:'#2980b9', color:'#fff', border:'none', padding:'10px 24px', fontSize:14, letterSpacing:2, cursor:'pointer', borderRadius:4, fontFamily:'inherit', alignSelf:'flex-end' },
  countBtn: { background:'#1a1a2e', color:'#fff', border:'1px solid #3498db', width:32, height:32, cursor:'pointer', fontSize:18, borderRadius:4 },
};
