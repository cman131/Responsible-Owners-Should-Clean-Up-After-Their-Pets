import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../BattleContext.js';

interface Props { messages: LogEntry[] }

export function TurnLog({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>BATTLE LOG</div>
      <div style={{ ...styles.log, maxHeight: expanded ? 400 : 220 }}>
        {messages.filter((m) => m.text).map((m, i) => (
          <div
            key={i}
            data-testid="log-entry"
            style={m.type === 'round-start' ? styles.roundStart : styles.message}
          >
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <button style={styles.toggle} onClick={() => setExpanded((e) => !e)}>
        {expanded ? 'Collapse' : 'Show full log'}
      </button>
    </div>
  );
}

const styles = {
  container: { background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { color: '#555', fontSize: 10, letterSpacing: 2 },
  log: { overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 3, transition: 'max-height 0.2s ease' },
  message: { color: '#ccc', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.4 },
  roundStart: { color: '#f0c040', fontSize: 11, letterSpacing: 2, textAlign: 'center' as const, fontFamily: 'inherit', lineHeight: 1.4 },
  toggle: { background: 'none', border: 'none', color: '#888', fontSize: 11, cursor: 'pointer', padding: 0, textAlign: 'left' as const, letterSpacing: 1 },
};
