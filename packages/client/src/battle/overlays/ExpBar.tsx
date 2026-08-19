import { useEffect, useState } from 'react';
import { getSocket } from '../../socket.js';
import type { ExpAwardPayload, LevelUpPayload } from '@poke-fighter/shared';

interface Props {
  instanceId: string;
  currentLevel: number;
}

export function ExpBar({ instanceId, currentLevel }: Props) {
  const [expGain, setExpGain] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onExpAward = (payload: ExpAwardPayload) => {
      const award = payload.awards.find((a) => a.instanceId === instanceId);
      if (award) {
        setExpGain(award.amount);
        setTimeout(() => setExpGain(null), 3000);
      }
    };

    const onLevelUp = (payload: LevelUpPayload) => {
      if (payload.instanceId === instanceId) {
        setLevelUp(payload.newLevel);
        setTimeout(() => setLevelUp(null), 4000);
      }
    };

    socket.on('exp:award', onExpAward);
    socket.on('level:up', onLevelUp);

    return () => {
      socket.off('exp:award', onExpAward);
      socket.off('level:up', onLevelUp);
    };
  }, [instanceId]);

  if (!expGain && !levelUp) return null;

  return (
    <div style={styles.container}>
      {levelUp && (
        <div style={styles.levelUp}>
          Level Up! Now Lv.{levelUp}
        </div>
      )}
      {expGain && !levelUp && (
        <div style={styles.expGain}>
          +{expGain} EXP
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { position: 'absolute' as const, bottom: 220, left: 80, zIndex: 100, pointerEvents: 'none' as const },
  levelUp: { background: '#f0c040', color: '#000', padding: '6px 14px', borderRadius: 4, fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  expGain: { background: '#1a3a5c', color: '#3498db', border: '1px solid #3498db', padding: '4px 10px', borderRadius: 3, fontSize: 12, letterSpacing: 1 },
};
