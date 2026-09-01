import { createContext, useContext, useEffect, useState } from 'react';
import { getSocket } from '../socket.js';
import type {
  BattleState, ActionRequestPayload, TurnResolvePayload, SwitchRequestPayload, TurnResolveEvent,
} from '@poke-fighter/shared';

export type LogEntry = { type: 'normal' | 'round-start'; text: string };

interface BattleContextValue {
  state: BattleState | null;
  mySlotId: string;
  actionRequest: ActionRequestPayload | null;
  switchRequest: SwitchRequestPayload | null;
  turnLog: LogEntry[];
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
  initialState?: BattleState | null;
  children: React.ReactNode;
}

export function BattleProvider({ mySlotId, initialState, children }: Props) {
  const [state, setState] = useState<BattleState | null>(initialState ?? null);
  const [actionRequest, setActionRequest] = useState<ActionRequestPayload | null>(null);
  const [switchRequest, setSwitchRequest] = useState<SwitchRequestPayload | null>(null);
  const [turnLog, setTurnLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('battle:start', ({ state: s }) => {
      setState(s);
      setTurnLog([{ type: 'normal', text: `Battle started! Turn ${s.turnNumber}` }]);
    });

    socket.on('state:sync', (s: BattleState) => {
      setState(s);
    });

    socket.on('turn:resolve', ({ turnNumber, events, state: s }: TurnResolvePayload) => {
      setState(s);
      const roundEntry: LogEntry = { type: 'round-start', text: `-------Round ${turnNumber - 1}-------` };
      const eventEntries: LogEntry[] = events
        .flatMap((e) => {
          const result = eventToText(e);
          return Array.isArray(result) ? result : [result];
        })
        .filter(Boolean)
        .map((text) => ({ type: 'normal' as const, text }));
      setTurnLog((prev) => [...prev, roundEntry, ...eventEntries].slice(-50));
    });

    socket.on('battle:history', ({ turns }: { turns: Array<{ turnNumber: number; events: TurnResolveEvent[] }> }) => {
      const entries: LogEntry[] = [];
      for (const turn of turns) {
        entries.push({ type: 'round-start', text: `-------Round ${turn.turnNumber - 1}-------` });
        for (const event of turn.events) {
          const result = eventToText(event);
          const texts = Array.isArray(result) ? result : [result];
          for (const text of texts) {
            if (text) entries.push({ type: 'normal', text });
          }
        }
      }
      setTurnLog(entries);
    });

    socket.on('action:request', (payload: ActionRequestPayload) => {
      if (payload.slotId === mySlotId) setActionRequest(payload);
    });
    socket.emit('action:resync');

    socket.on('switch:request', (payload: SwitchRequestPayload) => {
      if (payload.slotId === mySlotId) setSwitchRequest(payload);
    });

    socket.on('battle:end', ({ winningTeamId }) => {
      setTurnLog((prev) => [...prev, { type: 'normal', text: `Battle over! Winner: ${winningTeamId}` }]);
      setActionRequest(null);
    });

    return () => {
      socket.off('battle:start');
      socket.off('state:sync');
      socket.off('turn:resolve');
      socket.off('battle:history');
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

function eventToText(event: TurnResolveEvent): string | string[] {
  switch (event.type) {
    case 'move-used': return `${String(event.data['attackerName'])} used ${String(event.data['moveName'])}!`;
    case 'damage-dealt': {
      const target = event.data['targetSlotId'] ?? event.data['slotId'];
      const dmgLine = `Dealt ${String(event.data['damage'])} damage to ${String(target)}.`;
      if (!event.data['moveId']) return dmgLine;
      const eff = event.data['effectiveness'] as number;
      if (eff > 1) return [dmgLine, "It's super effective!"];
      if (eff < 1) return [dmgLine, "It's not very effective..."];
      return dmgLine;
    }
    case 'faint': return `${String(event.data['slotId'])}'s Pokémon fainted!`;
    case 'heal': return `${String(event.data['slotId'])} restored HP.`;
    case 'status-applied': return `${String(event.data['pokemonName'])} was ${String(event.data['status'])}!`;
    case 'status-cured': {
      if (event.data['status'] === 'slp') return `${String(event.data['pokemonName'] ?? event.data['slotId'])} woke up!`;
      return '';
    }
    case 'terastallize': return `${String(event.data['slotId'])} Terastallized into ${String(event.data['teraType'])} type!`;
    case 'pokemon-switched': return `${String(event.data['slotId'])}'s Pokémon was switched out!`;
    case 'crit': return 'A critical hit!';
    default: return '';
  }
}
