// packages/client/src/admin/AdminRouter.tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { HubPanel } from './HubPanel.js';
import { SetupPanel } from './SetupPanel.js';
import { RegistryPanel } from './RegistryPanel.js';
import { ControlPanel } from './ControlPanel.js';

type Mode = 'setup' | 'registry' | null;

export function AdminRouter() {
  const [mode, setMode] = useState<Mode>(null);
  const [activeBattle, setActiveBattle] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onBattleStart = (payload: { state: { battleId: string } }) => {
      setActiveBattle(payload.state.battleId);
    };
    socket.on('battle:start', onBattleStart);
    return () => { socket.off('battle:start', onBattleStart); };
  }, []);

  if (activeBattle) return <ControlPanel battleId={activeBattle} />;
  if (mode === 'setup') return <SetupPanel onBack={() => setMode(null)} />;
  if (mode === 'registry') return <RegistryPanel onBack={() => setMode(null)} />;
  return <HubPanel onSetup={() => setMode('setup')} onRegistry={() => setMode('registry')} />;
}
