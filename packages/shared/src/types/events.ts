import type { BattleState, PartyMember } from './battle.js';

// ── Client → Server ──────────────────────────────────────────────────────────

export interface PlayerJoinPayload {
  displayName: string;
}

export interface MoveAction {
  type: 'move';
  moveIndex: 0 | 1 | 2 | 3;
  targetSlotId?: string;  // required for single-target moves
  terastallize?: boolean;
}

export interface SwitchAction {
  type: 'switch';
  targetInstanceId: string;
}

export interface ActionSubmitPayload {
  slotId: string;
  action: MoveAction | SwitchAction;
}

export interface SwitchSubmitPayload {
  slotId: string;
  targetInstanceId: string;
}

export interface AdminActionPayload {
  type:
    | 'npc-action'     // submit move for NPC slot
    | 'pause'
    | 'unpause'
    | 'force-faint'    // force a pokemon to faint
    | 'forfeit'        // end battle, declare other team winner
    | 'force-switch'   // force a pokemon switch
    | 'lobby:list'
    | 'battles:list'
    | 'battles:connect'
    | 'registry:list'
    | 'registry:save-player'
    | 'registry:delete-player'
    | 'registry:save-npc'
    | 'registry:delete-npc'
    | 'registry:save-team'
    | 'registry:delete-team'
    | 'start-battle'
    | 'data:query';
  data: Record<string, unknown>;
}

// ── Server → Client ──────────────────────────────────────────────────────────

export interface BattleStartPayload {
  state: BattleState;
}

export interface TurnStartPayload {
  turnNumber: number;
  state: BattleState;
}

export interface ActionRequestPayload {
  slotId: string;
  validMoves: Array<{ index: 0 | 1 | 2 | 3; moveId: string; pp: number; disabled: boolean }>;
  legalTargets: string[];        // slotIds of valid target slots
  canSwitch: boolean;
  switchTargets: string[];       // instanceIds of switchable party members
  canTerastallize: boolean;
  timerSeconds: number;
}

export interface TurnResolveEvent {
  type:
    | 'move-used'
    | 'damage-dealt'
    | 'heal'
    | 'status-applied'
    | 'status-cured'
    | 'stat-change'
    | 'weather-change'
    | 'terrain-change'
    | 'volatile-applied'
    | 'terastallize'
    | 'faint';
  data: Record<string, unknown>;
}

export interface TurnResolvePayload {
  turnNumber: number;
  events: TurnResolveEvent[];
  state: BattleState;  // full state snapshot after resolution
}

export interface SwitchRequestPayload {
  slotId: string;
  party: PartyMember[];
  reason: 'faint' | 'forced';
}

export interface ExpAwardPayload {
  awards: Array<{ instanceId: string; amount: number; newTotal: number }>;
}

export interface LevelUpPayload {
  instanceId: string;
  newLevel: number;
  newStats: import('./pokemon.js').Stats;
}

export interface BattleEndPayload {
  winningTeamId: string;
  state: BattleState;
}

export interface LobbyErrorPayload {
  code: 'NAME_TAKEN' | 'BATTLE_FULL' | 'INVALID_NAME';
  message: string;
}

export interface BattleSummary {
  battleId: string;
  label: string;
  status: 'active' | 'ended';
  winningTeamId: string | null;
  startedAt: number;
  endedAt: number | null;
  turnNumber: number;
  teams: Array<{
    slots: Array<{ displayName: string; isNpc: boolean }>;
  }>;
}

// ── Event map (used to type Socket.io) ───────────────────────────────────────

export interface ServerToClientEvents {
  'battle:start': (payload: BattleStartPayload) => void;
  'turn:start': (payload: TurnStartPayload) => void;
  'action:request': (payload: ActionRequestPayload) => void;
  'turn:resolve': (payload: TurnResolvePayload) => void;
  'switch:request': (payload: SwitchRequestPayload) => void;
  'exp:award': (payload: ExpAwardPayload) => void;
  'level:up': (payload: LevelUpPayload) => void;
  'battle:end': (payload: BattleEndPayload) => void;
  'lobby:error': (payload: LobbyErrorPayload) => void;
  'state:sync': (state: BattleState) => void;
  'registry:data': (payload: { resource: string; data: unknown[] }) => void;
  'data:results': (payload: { resource: string; results: unknown[] }) => void;
  'lobby:players': (players: string[]) => void;
  'battles:data': (payload: { battles: BattleSummary[] }) => void;
  'admin:authenticated': () => void;
  'admin:error': (payload: { message: string }) => void;
  'npc:action-request': (payload: {
    battleId: string;
    slots: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }>;
  }) => void;
}

export interface ClientToServerEvents {
  'player:join': (payload: PlayerJoinPayload) => void;
  'action:submit': (payload: ActionSubmitPayload) => void;
  'switch:submit': (payload: SwitchSubmitPayload) => void;
  'admin:action': (payload: AdminActionPayload) => void;
}
