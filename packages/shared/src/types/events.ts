import type { BattleState, PartyMember } from './battle.js';
import type { MoveTarget } from './pokemon.js';
import type { PlayerProfile, PokemonSet } from './registry.js';
import type { HeldItem } from './pokemon.js';

// ── Client → Server ──────────────────────────────────────────────────────────

export interface PlayerJoinPayload {
  battleId: string;
  slotId: string;
}

export interface MoveAction {
  type: 'move';
  moveIndex: 0 | 1 | 2 | 3;
  targetSlotId?: string;
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
    | 'npc-action'
    | 'force-faint'
    | 'forfeit'
    | 'force-switch'
    | 'submit-default-action'
    | 'lobby:list'
    | 'lobby:slot-status'
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
    | 'cancel-battle'
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
  validMoves: Array<{
    index: 0 | 1 | 2 | 3;
    moveId: string;
    type: string;
    pp: number;
    disabled: boolean;
    targetType: MoveTarget;
    legalTargets: string[];
  }>;
  canSwitch: boolean;
  switchTargets: string[];
  canTerastallize: boolean;
  lockedReason?: 'recharge' | 'bide';
}

export interface TurnResolveEvent {
  type:
    | 'move-used'
    | 'move-blocked'
    | 'move-failed'          // registry miss (reason:'unimplemented') or handler logic failure
    | 'damage-dealt'
    | 'heal'
    | 'status-applied'
    | 'status-cured'
    | 'stat-change'
    | 'weather-started'
    | 'weather-ended'
    | 'terrain-started'
    | 'terrain-ended'
    | 'side-condition-set'   // Reflect, Light Screen, Stealth Rock, Spikes, etc.
    | 'trickroom-started'
    | 'trickroom-ended'
    | 'gravity-started'
    | 'gravity-ended'
    | 'volatile-applied'
    | 'volatile-cured'
    | 'terastallize'
    | 'faint'
    | 'miss'
    | 'crit'
    | 'endure-survived'
    | 'screen-ended'
    | 'screen-broken'
    | 'hazard-damage'
    | 'hazard-cleared'
    | 'court-change'
    | 'pokemon-switched'
    | 'focus-sash'
    | 'item-consumed'
    | 'status-blocked'
    | 'ability-triggered'
    | 'pivot-skipped'
    | 'wonderroom-started'
    | 'wonderroom-ended'
    | 'magicroom-started'
    | 'magicroom-ended'
    | 'fairylock-started'
    | 'iondeluge-started'
    | 'side-condition-ended'
    | 'move-note';
  data: Record<string, unknown>;
}

export interface TurnResolvePayload {
  turnNumber: number;
  events: TurnResolveEvent[];
  state: BattleState;
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
  code: 'NAME_TAKEN' | 'BATTLE_FULL' | 'INVALID_NAME' | 'BATTLE_NOT_FOUND' | 'SLOT_TAKEN';
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
    teamId: string;
    slots: Array<{ displayName: string; isNpc: boolean }>;
  }>;
}

export interface BattleJoinOption {
  battleId: string;
  label: string;
  slots: Array<{
    slotId: string;
    displayName: string;
    status: 'available' | 'reconnectable' | 'occupied';
  }>;
}

export interface SlotStatusPayload {
  battleId: string;
  slots: Array<{ slotId: string; displayName: string; joined: boolean }>;
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
  'registry:error': (payload: { type: string; message: string }) => void;
  'data:results': (payload: { resource: string; results: unknown[] }) => void;
  'lobby:players': (players: string[]) => void;
  'lobby:battles': (payload: { battles: BattleJoinOption[] }) => void;
  'lobby:slot-status': (payload: SlotStatusPayload) => void;
  'battles:data': (payload: { battles: BattleSummary[] }) => void;
  'battle:history': (payload: { turns: Array<{ turnNumber: number; events: TurnResolveEvent[] }> }) => void;
  'admin:authenticated': () => void;
  'admin:error': (payload: { message: string }) => void;
  'npc:action-request': (payload: {
    battleId: string;
    slots: Array<{ slotId: string; displayName: string; request: ActionRequestPayload }>;
  }) => void;
  'player:portal-data': (payload: { profile: PlayerProfile }) => void;
  'player:portal-error': (payload: { message: string }) => void;
  'player:portal-items': (payload: { results: HeldItem[] }) => void;
  'player:portal-roster': (payload: { players: Array<{ profileId: string; displayName: string }> }) => void;
}

export interface ClientToServerEvents {
  'player:join': (payload: PlayerJoinPayload) => void;
  'action:submit': (payload: ActionSubmitPayload) => void;
  'action:resync': () => void;
  'switch:submit': (payload: SwitchSubmitPayload) => void;
  'admin:action': (payload: AdminActionPayload) => void;
  'player:leave': () => void;
  'player:portal-auth': (payload: { profileId: string; playerKey: string }) => void;
  'player:portal-save': (payload: { profileId: string; team: PokemonSet[]; bank: PokemonSet[] }) => void;
  'player:portal-items-query': (payload: { speciesName?: string }) => void;
  'player:portal-roster-request': () => void;
}
