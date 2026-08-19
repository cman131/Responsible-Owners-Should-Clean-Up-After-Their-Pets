import { createContext, useContext, useEffect, useState } from 'react';
import { getSocket } from '../socket.js';
import type {
  BattleState, ActionRequestPayload, TurnResolvePayload, SwitchRequestPayload,
} from '@poke-fighter/shared';

interface BattleContextValue {
  state: BattleState | null;
  mySlotId: string;
  actionRequest: ActionRequestPayload | null;
  switchRequest: SwitchRequestPayload | null;
  turnLog: string[];
  submitAction: (payload: import('@poke-fighter/shared').ActionSubmitPayload) => void;
}

const BattleContext = createContext<BattleContextValue | null>(null);

export function useBattle(): BattleContextValue {
  const ctx = useContext(BattleContext);
  if (!ctx) throw new Error('useBattle must be used inside BattleProvider');
  return ctx;
}

interface Props {
  mySlotId: string;
  children: React.ReactNode;
}

export function BattleProvider({ mySlotId, children }: Props) {
  const [state, setState] = useState<BattleState | null>(null);
  const [actionRequest, setActionRequest] = useState<ActionRequestPayload | null>(null);
  const [switchRequest, setSwitchRequest] = useState<SwitchRequestPayload | null>(null);
  const [turnLog, setTurnLog] = useState<string[]>([]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('battle:start', ({ state: s }) => {
      setState(s);
      setTurnLog([`Battle started! Turn ${s.turnNumber}`]);
    });

    socket.on('state:sync', (s: BattleState) => {
      setState(s);
    });

    socket.on('turn:resolve', ({ turnNumber: _turnNumber, events, state: s }: TurnResolvePayload) => {
      setState(s);
      setTurnLog((prev) => [
        ...prev,
        ...events.map((e) => eventToText(e)),
      ].slice(-50));
    });

    socket.on('action:request', (payload: ActionRequestPayload) => {
      if (payload.slotId === mySlotId) setActionRequest(payload);
    });

    socket.on('switch:request', (payload: SwitchRequestPayload) => {
      if (payload.slotId === mySlotId) setSwitchRequest(payload);
    });

    socket.on('battle:end', ({ winningTeamId }) => {
      setTurnLog((prev) => [...prev, `Battle over! Winner: ${winningTeamId}`]);
      setActionRequest(null);
    });

    return () => {
      socket.off('battle:start');
      socket.off('state:sync');
      socket.off('turn:resolve');
      socket.off('action:request');
      socket.off('switch:request');
      socket.off('battle:end');
    };
  }, [mySlotId]);

  function submitAction(payload: import('@poke-fighter/shared').ActionSubmitPayload) {
    getSocket().emit('action:submit', payload);
    setActionRequest(null);
    setSwitchRequest(null);
  }

  return (
    <BattleContext.Provider value={{ state, mySlotId, actionRequest, switchRequest, turnLog, submitAction }}>
      {children}
    </BattleContext.Provider>
  );
}

function eventToText(event: import('@poke-fighter/shared').TurnResolveEvent): string {
  switch (event.type) {
    case 'move-used': return `${String(event.data['attackerSlotId'])} used ${String(event.data['moveName'])}!`;
    case 'damage-dealt': return `Dealt ${String(event.data['damage'])} damage to ${String(event.data['targetSlotId'])}.`;
    case 'faint': return `${String(event.data['slotId'])}'s Pokémon fainted!`;
    case 'heal': return `${String(event.data['slotId'])} restored HP.`;
    case 'status-applied': return `${String(event.data['target'])} was ${String(event.data['status'])}!`;
    case 'terastallize': return `${String(event.data['slotId'])} Terastallized into ${String(event.data['teraType'])} type!`;
    default: return '';
  }
}
