import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import type {
  BattleState, ActionRequestPayload, TurnResolvePayload, SwitchRequestPayload, TurnResolveEvent,
} from '@poke-fighter/shared';

export type LogEntry = { type: 'normal' | 'round-start'; text: string };

export type PlaybackEntry = {
  text?: string;
  hpDelta?: { slotId: string; delta: number };
  animation?: { slotId: string; kind: 'attack' | 'hit' | 'faint' };
  delay: number;
};

const STAT_NAMES: Record<string, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def',
  spe: 'Speed', acc: 'Accuracy', eva: 'Evasion',
};

function statStageText(delta: number): string {
  if (delta >= 3) return 'rose drastically!';
  if (delta === 2) return 'rose sharply!';
  if (delta === 1) return 'rose!';
  if (delta === -1) return 'fell!';
  if (delta === -2) return 'fell sharply!';
  return 'fell drastically!';
}

const WEATHER_START: Record<string, string> = {
  rain: 'It started to rain!',
  sun: 'The sunlight turned harsh!',
  sand: 'A sandstorm kicked up!',
  hail: 'It started to hail!',
  snow: 'It started to snow!',
};
const WEATHER_END: Record<string, string> = {
  rain: 'The rain stopped.',
  sun: 'The harsh sunlight faded.',
  sand: 'The sandstorm subsided.',
  hail: 'The hail stopped.',
  snow: 'The snow stopped.',
};
const TERRAIN_START: Record<string, string> = {
  electric: 'Electric Terrain electrified the field!',
  grassy: 'Grass grew to cover the battlefield!',
  misty: 'Mist swirled about the battlefield!',
  psychic: 'The battlefield got weird!',
};
const SIDE_CONDITION_TEXT: Record<string, string> = {
  reflect: 'Reflect is protecting the team!',
  lightScreen: 'Light Screen is protecting the team!',
  auroraVeil: 'Aurora Veil is protecting the team!',
  spikes: 'Spikes were scattered on the ground!',
  stealthRock: 'Pointed stones float in the air!',
  toxicSpikes: 'Toxic Spikes were scattered on the ground!',
  stickyWeb: 'A sticky web was spread on the ground!',
  tailwind: 'The tailwind blew!',
  safeguard: 'Safeguard is protecting the team!',
  mist: 'Mist shrouded the team!',
};
const HAZARD_NAMES: Record<string, string> = {
  stealthRock: 'Stealth Rock', spikes: 'Spikes',
  toxicSpikes: 'Toxic Spikes', stickyWeb: 'Sticky Web',
};
const SCREEN_NAMES: Record<string, string> = {
  reflect: 'Reflect', lightScreen: 'Light Screen', auroraVeil: 'Aurora Veil',
};
const MOVE_NOTE_TEXT: Record<string, string> = {
  'mud-sport-started':         'Mud Sport weakened Electric moves!',
  'mud-sport-ended':           'The effect of Mud Sport wore off!',
  'water-sport-started':       'Water Sport weakened Fire moves!',
  'water-sport-ended':         'The effect of Water Sport wore off!',
  'item-bestowed':             'An item was bestowed!',
  'item-recycled':             'The item was recycled!',
  'ability-swapped':           'The two Pokémon swapped abilities!',
  'ability-copied':            'The ability was copied!',
  'ability-entrained':         'The ability was entrained!',
  'ability-changed-simple':    "The target's ability became Simple!",
  'ability-changed-insomnia':  "The target's ability became Insomnia!",
  'guard-split':               'Defense and Sp. Def were averaged!',
  'power-split':               'Attack and Sp. Atk were averaged!',
  'power-shift':               'Attack and Defense were swapped!',
  'ally-switched':             'The ally switched positions!',
  'after-you':                 'The target will move next!',
};

function volatileAppliedText(slotId: string, volatile: string, data: Record<string, unknown>): string {
  switch (volatile) {
    case 'confusion': return `${slotId} became confused!`;
    case 'substitute': return `${slotId} put in a substitute!`;
    case 'protect':
    case 'crafty-shield':
    case 'wide-guard':
    case 'quick-guard':
    case 'mat-block':
    case 'endure': return `${slotId} is protecting itself!`;
    case 'bide': return `${slotId} is storing energy!`;
    case 'disable': {
      const moveId = data['moveId'] ? ` (${String(data['moveId'])})` : '';
      return `${slotId}'s move${moveId} was disabled!`;
    }
    case 'taunt': return `${slotId} fell for the taunt!`;
    case 'encore': return `${slotId} got an encore!`;
    case 'torment': return `${slotId} was subjected to torment!`;
    case 'leech-seed': return `${slotId} was seeded!`;
    case 'aqua-ring': return `${slotId} surrounded itself with a veil of water!`;
    case 'ingrain': return `${slotId} planted its roots!`;
    case 'destiny-bond': return `${slotId} is trying to take its attacker down!`;
    case 'helping-hand': return `${slotId} is being helped by its ally!`;
    case 'lock-on': return `${slotId} took aim!`;
    case 'perishsong': return `${slotId} will faint after 3 turns!`;
    case 'telekinesis': return `${slotId} was hurled into the air!`;
    case 'curse': return `${slotId} was cursed!`;
    case 'embargo': return `${slotId} can't use items!`;
    case 'heal-block': return `${slotId} can't use healing moves!`;
    case 'tar-shot': return `${slotId} is covered in tar!`;
    case 'no-retreat': return `${slotId} can no longer retreat!`;
    case 'center-of-attention': return `${slotId} became the center of attention!`;
    case 'powder': return `${slotId} was covered in powder!`;
    case 'magnet-rise': return `${slotId} levitated with electromagnetism!`;
    case 'charge': return `${slotId} is charging up!`;
    case 'stockpile': return `${slotId} stockpiled!`;
    case 'flinch':
    case 'roost': return '';
    case 'infatuation':        return `${slotId} fell in love!`;
    case 'yawn':               return `${slotId} began to doze off!`;
    case 'nightmare':          return `${slotId} fell into a nightmare!`;
    case 'focusenergy':        return `${slotId} is getting pumped!`;
    case 'laser-focus':        return `${slotId} is concentrating intensely!`;
    case 'imprison':           return `${slotId} sealed the opponent's moves!`;
    case 'magic-coat':         return `${slotId} shrouded itself with a magic coat!`;
    case 'snatch':             return `${slotId} is waiting to snatch a move!`;
    case 'dragon-cheer':       return `${slotId} received a Dragon Cheer!`;
    case 'foresight':          return `${slotId} was identified!`;
    case 'miracle-eye':        return `${slotId} can no longer evade Psychic moves!`;
    case 'electrify':          return `${slotId}'s moves were electrified!`;
    case 'octolock':           return `${slotId} can no longer escape!`;
    case 'minimize':           return `${slotId} minimized!`;
    case 'geomancy-charge':    return `${slotId} is absorbing power!`;
    case 'transformed':        return `${slotId} transformed!`;
    case 'power-trick':        return `${slotId} switched its Attack and Defense!`;
    case 'psych-up':           return `${slotId} psyched itself up!`;
    case 'charging-solarbeam': return `${slotId} absorbed light!`;
    case 'outrage-active':
    case 'petaldance-active':
    case 'thrash-active':      return `${slotId} began thrashing about!`;
    default: return '';
  }
}

function volatileCuredText(slotId: string, volatile: string): string {
  switch (volatile) {
    case 'confusion': return `${slotId} snapped out of confusion!`;
    case 'disable': return `${slotId} is no longer disabled!`;
    case 'substitute': return `${slotId}'s substitute faded!`;
    case 'taunt': return `${slotId}'s taunt wore off!`;
    case 'encore': return `${slotId}'s encore ended!`;
    case 'bound': return `${slotId} is no longer bound!`;
    case 'magnet-rise': return `${slotId}'s Magnet Rise wore off!`;
    case 'embargo': return `${slotId}'s embargo was lifted!`;
    case 'heal-block': return `${slotId}'s Heal Block wore off!`;
    case 'telekinesis': return `${slotId}'s telekinesis wore off!`;
    case 'nightmare': return `${slotId}'s nightmare ended!`;
    case 'lock-on':           return `${slotId} is no longer taking aim!`;
    case 'powder':            return `${slotId} is no longer covered in powder!`;
    case 'power-trick':       return `${slotId}'s Attack and Defense returned to normal!`;
    case 'outrage-active':
    case 'petaldance-active':
    case 'thrash-active':     return `${slotId} became confused due to fatigue!`;
    default: return '';
  }
}

function getActiveName(state: BattleState | null | undefined, slotId: string): string {
  if (!state) return slotId;
  for (const team of state.teams) {
    for (const slot of team.slots) {
      if (slot.slotId === slotId) {
        const mon = slot.party[slot.activePokemonIndex];
        return mon ? mon.nickname : slotId;
      }
    }
  }
  return slotId;
}

export function eventsToPlaybackEntries(events: TurnResolveEvent[], state?: BattleState | null): PlaybackEntry[] {
  const entries: PlaybackEntry[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'move-used': {
        const attackerSlotId = event.data['attackerSlotId'];
        const entry: PlaybackEntry = {
          text: `${String(event.data['attackerName'])} used ${String(event.data['moveName'])}!`,
          delay: 600,
        };
        if (attackerSlotId) entry.animation = { slotId: String(attackerSlotId), kind: 'attack' };
        entries.push(entry);
        break;
      }
      case 'damage-dealt': {
        const targetSlotId = String(event.data['targetSlotId'] ?? event.data['slotId']);
        const damage = Number(event.data['damage']);
        const hpDelta = { slotId: targetSlotId, delta: damage };
        const targetName = getActiveName(state, targetSlotId);
        const dmgText = `Dealt ${damage} damage to ${targetName}.`;
        const eff = event.data['moveId'] ? (event.data['effectiveness'] as number) : 1;
        entries.push({ text: dmgText, hpDelta, animation: { slotId: targetSlotId, kind: 'hit' }, delay: 600 });
        if (eff > 1) entries.push({ text: "It's super effective!", delay: 300 });
        else if (eff < 1) entries.push({ text: "It's not very effective...", delay: 300 });
        break;
      }
      case 'crit':
        entries.push({ text: 'A critical hit!', delay: 300 });
        break;
      case 'faint': {
        const faintSlotId = String(event.data['slotId']);
        const faintName = getActiveName(state, faintSlotId);
        entries.push({ text: `${faintName} fainted!`, animation: { slotId: faintSlotId, kind: 'faint' }, delay: 600 });
        break;
      }
      case 'heal': {
        const healSlotId = String(event.data['slotId']);
        const healName = getActiveName(state, healSlotId);
        const healAmount = event.data['amount'];
        const entry: PlaybackEntry = { text: `${healName} restored HP.`, delay: 600 };
        if (typeof healAmount === 'number' && healAmount > 0) {
          entry.hpDelta = { slotId: healSlotId, delta: -healAmount };
        }
        entries.push(entry);
        break;
      }
      case 'status-applied':
        entries.push({ text: `${String(event.data['pokemonName'])} was ${String(event.data['status'])}!`, delay: 600 });
        break;
      case 'status-cured': {
        const status = String(event.data['status']);
        const name = String(event.data['pokemonName'] ?? event.data['slotId']);
        const textMap: Record<string, string> = {
          slp: `${name} woke up!`,
          brn: `${name}'s burn healed!`,
          par: `${name} was cured of paralysis!`,
          frz: `${name} thawed out!`,
          psn: `${name} was cured of its poisoning!`,
          tox: `${name} was cured of its poisoning!`,
        };
        const text = textMap[status] ?? '';
        if (text) entries.push({ text, delay: 600 });
        break;
      }
      case 'terastallize':
        entries.push({ text: `${String(event.data['slotId'])} Terastallized into ${String(event.data['teraType'])} type!`, delay: 600 });
        break;
      case 'pokemon-switched':
        entries.push({ text: `${String(event.data['slotId'])}'s Pokémon was switched out!`, delay: 600 });
        break;
      case 'pivot-skipped': {
        const slotId = String(event.data['slotId']);
        entries.push({ text: `${slotId} has no Pokémon left to send in!`, delay: 600 });
        break;
      }
      case 'miss': {
        const attacker = String(event.data['attackerSlotId'] ?? '');
        entries.push({ text: attacker ? `${attacker}'s attack missed!` : 'The attack missed!', delay: 600 });
        break;
      }
      case 'stat-change': {
        const slotId = String(event.data['slotId']);
        const changes = event.data['changes'] as Record<string, number>;
        for (const [stat, delta] of Object.entries(changes)) {
          const statName = STAT_NAMES[stat] ?? stat;
          entries.push({ text: `${slotId}'s ${statName} ${statStageText(delta)}`, delay: 300 });
        }
        break;
      }
      case 'weather-started': {
        const text = WEATHER_START[String(event.data['weather'])] ?? 'Weather started!';
        entries.push({ text, delay: 600 });
        break;
      }
      case 'weather-ended': {
        const text = WEATHER_END[String(event.data['weather'])] ?? 'The weather cleared.';
        entries.push({ text, delay: 600 });
        break;
      }
      case 'terrain-started': {
        const text = TERRAIN_START[String(event.data['terrain'])] ?? 'Terrain appeared!';
        entries.push({ text, delay: 600 });
        break;
      }
      case 'terrain-ended':
        entries.push({ text: 'The terrain returned to normal.', delay: 600 });
        break;
      case 'side-condition-set': {
        const condition = String(event.data['condition']);
        const text = SIDE_CONDITION_TEXT[condition] ?? `${condition} was set!`;
        entries.push({ text, delay: 600 });
        break;
      }
      case 'trickroom-started':
        entries.push({ text: 'The dimensions were distorted!', delay: 600 });
        break;
      case 'trickroom-ended':
        entries.push({ text: 'Trick Room ended!', delay: 600 });
        break;
      case 'gravity-started':
        entries.push({ text: 'Gravity intensified!', delay: 600 });
        break;
      case 'gravity-ended':
        entries.push({ text: 'Gravity returned to normal!', delay: 600 });
        break;
      case 'wonderroom-started':
        entries.push({ text: 'Wonder Room was created!', delay: 600 });
        break;
      case 'wonderroom-ended':
        entries.push({ text: 'Wonder Room ended!', delay: 600 });
        break;
      case 'magicroom-started':
        entries.push({ text: 'Magic Room was created!', delay: 600 });
        break;
      case 'magicroom-ended':
        entries.push({ text: 'Magic Room ended!', delay: 600 });
        break;
      case 'fairylock-started':
        entries.push({ text: 'Fairy Lock prevented escape!', delay: 600 });
        break;
      case 'iondeluge-started':
        entries.push({ text: 'Ion Deluge charged the field!', delay: 600 });
        break;
      case 'volatile-applied': {
        const slotId = String(event.data['targetSlotId'] ?? event.data['slotId'] ?? '');
        const volatile = String(event.data['volatile']);
        const text = volatileAppliedText(slotId, volatile, event.data);
        if (text) entries.push({ text, delay: 600 });
        break;
      }
      case 'volatile-cured': {
        const slotId = String(event.data['slotId']);
        const volatile = String(event.data['volatile']);
        const text = volatileCuredText(slotId, volatile);
        if (text) entries.push({ text, delay: 600 });
        break;
      }
      case 'endure-survived': {
        const slotId = String(event.data['slotId']);
        entries.push({ text: `${slotId} endured the hit!`, delay: 600 });
        break;
      }
      case 'move-failed':
        entries.push({ text: 'But it failed!', delay: 600 });
        break;
      case 'focus-sash': {
        const slotId = String(event.data['slotId']);
        entries.push({ text: `${slotId} hung on using its Focus Sash!`, delay: 600 });
        break;
      }
      case 'item-consumed': {
        const slotId = String(event.data['slotId']);
        entries.push({ text: `${slotId} consumed its ${String(event.data['item'])}!`, delay: 600 });
        break;
      }
      case 'status-blocked':
        entries.push({ text: 'The status condition was blocked!', delay: 600 });
        break;
      case 'ability-triggered': {
        const slotId = String(event.data['slotId']);
        const ability = String(event.data['ability']);
        entries.push({ text: `${slotId}'s ${ability} activated!`, delay: 600 });
        break;
      }
      case 'hazard-damage': {
        const slotId = String(event.data['slotId']);
        const hazardName = HAZARD_NAMES[String(event.data['hazard'])] ?? String(event.data['hazard']);
        entries.push({ text: `${slotId} was hurt by ${hazardName}!`, delay: 600 });
        break;
      }
      case 'hazard-cleared':
        entries.push({ text: 'Hazards were cleared!', delay: 600 });
        break;
      case 'screen-ended': {
        const screenName = SCREEN_NAMES[String(event.data['screen'])] ?? String(event.data['screen']);
        entries.push({ text: `${screenName} wore off!`, delay: 600 });
        break;
      }
      case 'screen-broken': {
        const screenName = SCREEN_NAMES[String(event.data['screen'])] ?? String(event.data['screen']);
        entries.push({ text: `${screenName} was shattered!`, delay: 600 });
        break;
      }
      case 'court-change':
        entries.push({ text: 'The sides were swapped!', delay: 600 });
        break;
      case 'move-note': {
        const note = String(event.data['note']);
        let text = MOVE_NOTE_TEXT[note] ?? '';
        if (!text && note.startsWith('pp-reduced-by-')) {
          const n = note.replace('pp-reduced-by-', '');
          text = `Its PP was reduced by ${n}!`;
        }
        if (!text) text = note;
        if (text) entries.push({ text, delay: 600 });
        break;
      }
      case 'move-blocked': {
        const reason = String(event.data['reason']);
        const name = String(event.data['pokemonName'] ?? event.data['slotId'] ?? '');
        const targetSlotId = event.data['targetSlotId'];
        let text = '';
        if (reason === 'paralysis') text = `${name} is fully paralyzed!`;
        else if (reason === 'flinch') text = `${name} flinched!`;
        else if (reason === 'frozen') text = `${name} is frozen solid!`;
        else if (reason === 'asleep') text = `${name} is fast asleep!`;
        else if (reason === 'infatuation') text = `${name} is in love and can't move!`;
        else if (reason === 'protect' || reason === 'crafty-shield' || reason === 'mat-block' || reason === 'wide-guard' || reason === 'quick-guard')
          text = `${String(targetSlotId ?? name)} was protected!`;
        else if (reason === 'disabled') text = `${name}'s move is disabled!`;
        else if (reason === 'taunted') text = `${name} is taunted!`;
        else if (reason === 'imprison') text = `${name} is imprisoned!`;
        else if (reason === 'torment') text = `${name} is tormented!`;
        else if (reason === 'trapped') text = `${name} can't switch out!`;
        else text = `${name} can't move!`;
        entries.push({ text, delay: 600 });
        break;
      }
      default:
        break;
    }
  }
  return entries;
}

interface BattleContextValue {
  state: BattleState | null;
  mySlotId: string;
  actionRequest: ActionRequestPayload | null;
  switchRequest: SwitchRequestPayload | null;
  turnLog: LogEntry[];
  displayHp: Map<string, number>;
  animatingSlots: Map<string, 'attack' | 'hit' | 'faint'>;
  submitAction: (payload: import('@poke-fighter/shared').ActionSubmitPayload) => void;
  battleResult: { winningTeamId: string; finalState: BattleState } | null;
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
  const stateRef = useRef<BattleState | null>(initialState ?? null);
  const [actionRequest, setActionRequest] = useState<ActionRequestPayload | null>(null);
  const [switchRequest, setSwitchRequest] = useState<SwitchRequestPayload | null>(null);
  const [turnLog, setTurnLog] = useState<LogEntry[]>([]);
  const [displayHp, setDisplayHp] = useState<Map<string, number>>(new Map());
  const [animatingSlots, setAnimatingSlots] = useState<Map<string, 'attack' | 'hit' | 'faint'>>(new Map());
  const [eventQueue, _setEventQueue] = useState<PlaybackEntry[]>([]);
  const eventQueueRef = useRef<PlaybackEntry[]>([]);
  const animClearTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [pendingState, setPendingState] = useState<BattleState | null>(null);
  const [pendingActionRequest, setPendingActionRequest] = useState<ActionRequestPayload | null>(null);
  const [pendingSwitchRequest, setPendingSwitchRequest] = useState<SwitchRequestPayload | null>(null);
  const [pendingBattleEnd, setPendingBattleEnd] = useState<{ winningTeamId: string; finalState: BattleState } | null>(null);
  const [battleResult, setBattleResult] = useState<{ winningTeamId: string; finalState: BattleState } | null>(null);

  function setEventQueue(value: PlaybackEntry[]) {
    eventQueueRef.current = value;
    _setEventQueue(value);
  }

  useEffect(() => { stateRef.current = state; }, [state]);

  // Clean up animation clear timers on unmount
  useEffect(() => {
    return () => {
      for (const t of animClearTimersRef.current) clearTimeout(t);
    };
  }, []);

  // Drain one entry per tick
  useEffect(() => {
    if (eventQueue.length === 0) return;
    const entry = eventQueue[0]!;
    const timer = setTimeout(() => {
      if (entry.text) {
        setTurnLog((prev) => [...prev, { type: 'normal', text: entry.text! }].slice(-150));
      }
      if (entry.hpDelta) {
        const { slotId, delta } = entry.hpDelta;
        setDisplayHp((prev) => {
          const next = new Map(prev);
          next.set(slotId, Math.max(0, (next.get(slotId) ?? 0) - delta));
          return next;
        });
      }
      if (entry.animation) {
        const { slotId, kind } = entry.animation;
        setAnimatingSlots((prev) => { const next = new Map(prev); next.set(slotId, kind); return next; });
        const clearDelay = kind === 'attack' ? 350 : kind === 'hit' ? 300 : 600;
        const clearTimer = setTimeout(() => {
          setAnimatingSlots((prev) => { const next = new Map(prev); next.delete(slotId); return next; });
          animClearTimersRef.current.delete(clearTimer);
        }, clearDelay);
        animClearTimersRef.current.add(clearTimer);
      }
      const nextQueue = eventQueue.slice(1);
      eventQueueRef.current = nextQueue;
      _setEventQueue(nextQueue);
    }, entry.delay);
    return () => clearTimeout(timer);
  }, [eventQueue]);

  // When queue empties, apply pending state and release pending requests
  useEffect(() => {
    if (eventQueue.length > 0) return;

    const hasPendingState = pendingState !== null;
    const hasPendingBattleEnd = pendingBattleEnd !== null;

    if (!hasPendingState && !hasPendingBattleEnd) return;

    if (hasPendingState) {
      setState(pendingState!);
      stateRef.current = pendingState!;
      setPendingState(null);
      setDisplayHp(new Map());
    }

    if (hasPendingBattleEnd) {
      if (!hasPendingState) {
        setDisplayHp(new Map());
        setAnimatingSlots(new Map());
        for (const t of animClearTimersRef.current) clearTimeout(t);
        animClearTimersRef.current.clear();
      }
      const { winningTeamId, finalState } = pendingBattleEnd!;
      const winnerTeam = finalState.teams.find(t => t.teamId === winningTeamId);
      const winnerNames = winnerTeam?.slots.filter(s => !s.isSpectator).map(s => s.displayName).join(', ') ?? winningTeamId;
      setTurnLog(prev => [...prev, { type: 'normal', text: `Battle over! Winner: ${winnerNames}` }].slice(-150));
      setBattleResult(pendingBattleEnd!);
      setPendingBattleEnd(null);
      setPendingActionRequest(null);
      setPendingSwitchRequest(null);
      return;
    }

    if (pendingActionRequest !== null) {
      setActionRequest(pendingActionRequest);
      setPendingActionRequest(null);
    }
    if (pendingSwitchRequest !== null) {
      setSwitchRequest(pendingSwitchRequest);
      setPendingSwitchRequest(null);
    }
  }, [eventQueue, pendingState, pendingActionRequest, pendingSwitchRequest, pendingBattleEnd]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('battle:start', ({ state: s }) => {
      setState(s);
      stateRef.current = s;
      setDisplayHp(new Map());
      setTurnLog([{ type: 'normal', text: `Battle started! Turn ${s.turnNumber}` }]);
    });

    socket.on('state:sync', (s: BattleState) => {
      setState(s);
      stateRef.current = s;
    });

    socket.on('turn:resolve', ({ turnNumber, events, state: s }: TurnResolvePayload) => {
      const prevState = stateRef.current;
      if (prevState) {
        const snapshot = new Map<string, number>();
        for (const team of prevState.teams) {
          for (const slot of team.slots) {
            if (!slot.isSpectator) {
              const mon = slot.party[slot.activePokemonIndex];
              if (mon && !mon.fainted) snapshot.set(slot.slotId, mon.currentHp);
            }
          }
        }
        setDisplayHp(snapshot);
      }
      const roundEntry: LogEntry = { type: 'round-start', text: `-------Round ${turnNumber - 1}-------` };
      setTurnLog((prev) => [...prev, roundEntry].slice(-150));
      const entries = eventsToPlaybackEntries(events, prevState);
      setPendingState(s);
      setEventQueue(entries);
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
      if (payload.slotId !== mySlotId) return;
      if (eventQueueRef.current.length > 0) {
        setPendingActionRequest(payload);
      } else {
        setActionRequest(payload);
      }
    });
    socket.emit('action:resync');

    socket.on('switch:request', (payload: SwitchRequestPayload) => {
      if (payload.slotId !== mySlotId) return;
      if (eventQueueRef.current.length > 0) {
        setPendingSwitchRequest(payload);
      } else {
        setSwitchRequest(payload);
      }
    });

    socket.on('battle:end', ({ winningTeamId, state: finalState }: { winningTeamId: string; state: BattleState }) => {
      setPendingBattleEnd({ winningTeamId, finalState });
      setActionRequest(null);
      setPendingActionRequest(null);
      setSwitchRequest(null);
      setPendingSwitchRequest(null);
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
    <BattleContext.Provider value={{ state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, animatingSlots, submitAction, battleResult }}>
      {children}
    </BattleContext.Provider>
  );
}

export function eventToText(event: TurnResolveEvent): string | string[] {
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
    case 'faint': return `${String(event.data['slotId'])} fainted!`;
    case 'heal': return `${String(event.data['slotId'])} restored HP.`;
    case 'status-applied': return `${String(event.data['pokemonName'])} was ${String(event.data['status'])}!`;
    case 'status-cured': {
      const statusCuredName = String(event.data['pokemonName'] ?? event.data['slotId']);
      const statusCuredMap: Record<string, string> = {
        slp: `${statusCuredName} woke up!`,
        brn: `${statusCuredName}'s burn healed!`,
        par: `${statusCuredName} was cured of paralysis!`,
        frz: `${statusCuredName} thawed out!`,
        psn: `${statusCuredName} was cured of its poisoning!`,
        tox: `${statusCuredName} was cured of its poisoning!`,
      };
      return statusCuredMap[String(event.data['status'])] ?? '';
    }
    case 'terastallize': return `${String(event.data['slotId'])} Terastallized into ${String(event.data['teraType'])} type!`;
    case 'pokemon-switched': return `${String(event.data['slotId'])}'s Pokémon was switched out!`;
    case 'pivot-skipped': return `${String(event.data['slotId'])} has no Pokémon left to send in!`;
    case 'crit': return 'A critical hit!';
    case 'miss': {
      const attacker = String(event.data['attackerSlotId'] ?? '');
      return attacker ? `${attacker}'s attack missed!` : 'The attack missed!';
    }
    case 'stat-change': {
      const slotId = String(event.data['slotId']);
      const changes = event.data['changes'] as Record<string, number>;
      return Object.entries(changes).map(([stat, delta]) =>
        `${slotId}'s ${STAT_NAMES[stat] ?? stat} ${statStageText(delta)}`
      );
    }
    case 'weather-started': return WEATHER_START[String(event.data['weather'])] ?? 'Weather started!';
    case 'weather-ended': return WEATHER_END[String(event.data['weather'])] ?? 'The weather cleared.';
    case 'terrain-started': return TERRAIN_START[String(event.data['terrain'])] ?? 'Terrain appeared!';
    case 'terrain-ended': return 'The terrain returned to normal.';
    case 'side-condition-set': return SIDE_CONDITION_TEXT[String(event.data['condition'])] ?? `${String(event.data['condition'])} was set!`;
    case 'trickroom-started': return 'The dimensions were distorted!';
    case 'trickroom-ended': return 'Trick Room ended!';
    case 'gravity-started': return 'Gravity intensified!';
    case 'gravity-ended': return 'Gravity returned to normal!';
    case 'wonderroom-started': return 'Wonder Room was created!';
    case 'wonderroom-ended': return 'Wonder Room ended!';
    case 'magicroom-started': return 'Magic Room was created!';
    case 'magicroom-ended': return 'Magic Room ended!';
    case 'fairylock-started': return 'Fairy Lock prevented escape!';
    case 'iondeluge-started': return 'Ion Deluge charged the field!';
    case 'volatile-applied': {
      const slotId = String(event.data['targetSlotId'] ?? event.data['slotId'] ?? '');
      return volatileAppliedText(slotId, String(event.data['volatile']), event.data);
    }
    case 'volatile-cured': return volatileCuredText(String(event.data['slotId']), String(event.data['volatile']));
    case 'endure-survived': return `${String(event.data['slotId'])} endured the hit!`;
    case 'move-failed': return 'But it failed!';
    case 'focus-sash': return `${String(event.data['slotId'])} hung on using its Focus Sash!`;
    case 'item-consumed': return `${String(event.data['slotId'])} consumed its ${String(event.data['item'])}!`;
    case 'ability-triggered': return `${String(event.data['slotId'])}'s ${String(event.data['ability'])} activated!`;
    case 'hazard-damage': return `${String(event.data['slotId'])} was hurt by ${HAZARD_NAMES[String(event.data['hazard'])] ?? String(event.data['hazard'])}!`;
    case 'hazard-cleared': return 'Hazards were cleared!';
    case 'screen-ended': return `${SCREEN_NAMES[String(event.data['screen'])] ?? String(event.data['screen'])} wore off!`;
    case 'screen-broken': return `${SCREEN_NAMES[String(event.data['screen'])] ?? String(event.data['screen'])} was shattered!`;
    case 'court-change': return 'The sides were swapped!';
    case 'move-note': {
      const note = String(event.data['note']);
      let moveNoteText = MOVE_NOTE_TEXT[note] ?? '';
      if (!moveNoteText && note.startsWith('pp-reduced-by-')) {
        const n = note.replace('pp-reduced-by-', '');
        moveNoteText = `Its PP was reduced by ${n}!`;
      }
      return moveNoteText || note;
    }
    case 'status-blocked': return 'The status condition was blocked!';
    case 'move-blocked': {
      const reason = String(event.data['reason']);
      const name = String(event.data['pokemonName'] ?? event.data['slotId'] ?? '');
      const targetSlotId = event.data['targetSlotId'];
      if (reason === 'paralysis') return `${name} is fully paralyzed!`;
      if (reason === 'flinch') return `${name} flinched!`;
      if (reason === 'frozen') return `${name} is frozen solid!`;
      if (reason === 'asleep') return `${name} is fast asleep!`;
      if (reason === 'infatuation') return `${name} is in love and can't move!`;
      if (reason === 'protect' || reason === 'crafty-shield' || reason === 'mat-block' || reason === 'wide-guard' || reason === 'quick-guard')
        return `${String(targetSlotId ?? name)} was protected!`;
      if (reason === 'disabled') return `${name}'s move is disabled!`;
      if (reason === 'taunted') return `${name} is taunted!`;
      if (reason === 'imprison') return `${name} is imprisoned!`;
      if (reason === 'torment') return `${name} is tormented!`;
      if (reason === 'trapped') return `${name} can't switch out!`;
      return `${name} can't move!`;
    }
    default: return '';
  }
}
