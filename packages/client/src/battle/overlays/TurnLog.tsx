import { useEffect, useRef } from 'react';

interface Props { messages: string[] }

export function TurnLog({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>BATTLE LOG</div>
      <div style={styles.log}>
        {messages.filter(Boolean).map((msg, i) => (
          <div key={i} style={styles.message}>{msg}</div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

const styles = {
  container: { background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { color: '#555', fontSize: 10, letterSpacing: 2 },
  log: { maxHeight: 150, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 3 },
  message: { color: '#ccc', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.4 },
};
