import { useState } from 'react';
import { getSocket } from '../socket.js';
import { HubPanel } from './HubPanel.js';
import { SetupPanel } from './SetupPanel.js';
import { RegistryPanel } from './RegistryPanel.js';
import { ControlPanel } from './ControlPanel.js';
import { BattlesPanel } from './BattlesPanel.js';

type Mode = 'setup' | 'registry' | 'battles' | null;

export function AdminRouter() {
  const [mode, setMode] = useState<Mode>(null);
  const [activeBattle, setActiveBattle] = useState<string | null>(null);

  function handleWatch(battleId: string) {
    getSocket().emit('admin:action', { type: 'battles:connect', data: { battleId } } as any);
    setActiveBattle(battleId);
  }

  if (activeBattle) {
    return <ControlPanel battleId={activeBattle} onBack={() => setActiveBattle(null)} />;
  }
  if (mode === 'setup') return <SetupPanel onBack={() => setMode(null)} onWatch={handleWatch} />;
  if (mode === 'registry') return <RegistryPanel onBack={() => setMode(null)} />;
  if (mode === 'battles') return <BattlesPanel onBack={() => setMode(null)} onWatch={handleWatch} />;
  return (
    <HubPanel
      onSetup={() => setMode('setup')}
      onRegistry={() => setMode('registry')}
      onBattles={() => setMode('battles')}
    />
  );
}
