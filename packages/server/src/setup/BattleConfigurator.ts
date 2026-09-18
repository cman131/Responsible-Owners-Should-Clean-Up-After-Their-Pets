import { v4 as uuidv4 } from 'uuid';
import type { BattleState, SlotState, PartyMember, TeamState, FieldState, SideConditions } from '@poke-fighter/shared';
import type { PokemonSet } from '@poke-fighter/shared';
import { DataLoader } from '../data/loader.js';
import { calcAllStats } from '../engine/stats.js';

interface SlotConfig {
  slotId: string;
  displayName: string;
  isNpc: boolean;
  party: PokemonSet[];
}

interface TeamConfig {
  slots: SlotConfig[];
}

interface BuildConfig {
  battleId: string;
  label: string;
  teams: [TeamConfig, TeamConfig];
  levelCap?: number;
}

function defaultSideConditions(): SideConditions {
  return { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 };
}

function defaultField(): FieldState {
  return {
    trickroom: 0, gravity: 0,
    wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0,
    ionDeluge: false, fairyLock: 0,
    sideConditions: [defaultSideConditions(), defaultSideConditions()],
  };
}

export class BattleConfigurator {
  private readonly data = new DataLoader();

  build(config: BuildConfig): BattleState {
    const teams = config.teams.map((teamConfig, teamIdx) => this.buildTeam(teamConfig, teamIdx, config.levelCap)) as [TeamState, TeamState];

    return {
      battleId: config.battleId,
      label: config.label,
      turnNumber: 1,
      phase: 'action',
      teams,
      field: defaultField(),
    };
  }

  private buildTeam(teamConfig: TeamConfig, teamIdx: number, levelCap?: number): TeamState {
    return {
      teamId: `team-${teamIdx === 0 ? 'a' : 'b'}`,
      slots: teamConfig.slots.map((slotConfig) => this.buildSlot(slotConfig, levelCap)),
    };
  }

  private buildSlot(slotConfig: SlotConfig, levelCap?: number): SlotState {
    return {
      slotId: slotConfig.slotId,
      displayName: slotConfig.displayName,
      isNpc: slotConfig.isNpc,
      isSpectator: false,
      party: slotConfig.party.map((set) => this.buildPartyMember(set, levelCap)),
      activePokemonIndex: 0,
    };
  }

  private buildPartyMember(set: PokemonSet, levelCap?: number): PartyMember {
    const species = this.data.getSpecies(set.speciesId);
    if (!species) throw new Error(`Unknown species id: ${set.speciesId}`);

    const effectiveLevel = levelCap !== undefined ? Math.min(set.level, levelCap) : set.level;

    const stats = calcAllStats({
      baseStats: species.baseStats,
      ivs: set.ivs,
      evs: set.evs,
      level: effectiveLevel,
      nature: set.nature,
    });

    const member: PartyMember = {
      instanceId: uuidv4(),
      speciesId: set.speciesId,
      speciesName: species.name,
      level: effectiveLevel,
      currentHp: stats.hp,
      maxHp: stats.hp,
      stats,
      ability: set.ability,
      nickname: set.nickname ?? species.displayName,
      moves: set.moves.map((moveId) => ({
        moveId,
        currentPp: this.data.getMove(moveId)?.pp ?? 0,
        maxPp: this.data.getMove(moveId)?.pp ?? 0,
      })) as PartyMember['moves'],
      volatileStatus: [],
      statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      hasTerastallized: false,
      fainted: false,
      expTotal: 0,
    };

    // Only set optional fields if defined (exactOptionalPropertyTypes)
    if (set.heldItem !== undefined) member.heldItem = set.heldItem;
    if (set.teraType !== undefined) member.teraType = set.teraType;
    member.isEvioliteEligible = species.evolutionStage < 3;
    member.ivs = set.ivs;
    member.evs = set.evs;
    member.nature = set.nature;

    return member;
  }
}
