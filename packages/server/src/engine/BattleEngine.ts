import type {
  BattleState, SlotState, PartyMember, MoveAction, SwitchAction,
  TurnResolveEvent, PokemonType, StatusCondition, StatBoosts, Move,
} from '@poke-fighter/shared';
import { DataLoader } from '../data/loader.js';
import { calcDamage, randomDamageFactor } from './damage.js';
import { getEffectiveStat } from './stats.js';
import { computeHitChance, computeCritStage, critProbability } from './accuracy.js';
import { PARALYSIS_SPEED_MOD } from './status.js';
import { EffectEngine, SlotContext } from './EffectEngine.js';
import { getAbilityHooks, effectiveAbilityId } from './abilities.js';
import type { SwitchInResult } from './abilities.js';
import { getItemHooks } from './items.js';
import { applyStatus, applyStatBoost, evaluateSecondaryEffect, evaluateVolatileEffect, applySecondaries, applyVolatile } from './effects.js';
import type { SecondaryContext } from './effects.js';
import { MoveEffectRegistry, MoveContext } from './MoveEffectRegistry.js';
import { buildDefaultRegistry } from './registrations.js';
import { SWITCH_CLEAR_NAMES, SWITCH_CLEAR_PREFIXES } from './volatileClearRules.js';
import { isGrounded, GRAVITY_BLOCKED_MOVES, WEATHER_ACCURACY, SOLAR_MOVES, WEATHER_BALL_TYPE, GRASSY_TERRAIN_HALVED } from './fieldState.js';
import { getScreenMultiplier, applyEntryHazards, decrementScreens } from './sideConditions.js';
import { resolvePower } from './dynamicPower.js';

const ALWAYS_THAW_MOVES = new Set(['scald', 'steameruption', 'sparklingaria']);

const MAGIC_COAT_BOUNCED_EFFECTS = new Set([
  // Status-applying moves
  'willowisp', 'thunderwave', 'glare', 'stunspore', 'toxic', 'spore', 'sleeppowder', 'hypnosis', 'darkvoid',
  // Confusion/volatile targeting opponent
  'attract', 'confuseray', 'supersonic', 'sweetkiss', 'leechseed', 'yawn',
  'nightmare', 'foresight', 'odorsleuth', 'miracleeye',
  // Stat-drop moves on opponent
  'leer', 'growl', 'screech', 'charm', 'faketears', 'flash', 'sandattack',
  'tickle', 'scaryface', 'tearfullook', 'nobleroar', 'featherdance', 'captivate',
  'babydolleyes', 'eerieimpulse', 'stringshot', 'cottonspore', 'smokescreen',
  'kinesis', 'sweetscent', 'confide', 'playnice', 'spicyextract',
  // Entry hazards
  'stealthrock', 'stickyweb', 'spikes', 'toxicspikes',
  // Other debuffs
  'taunt', 'torment', 'embargo', 'healblock', 'spite', 'venomdrench', 'tarshot', 'topsyturvy',
]);

const SNATCH_STEALABLE_EFFECTS = new Set([
  // Self-targeting heals
  'recover', 'softboiled', 'roost', 'slackoff', 'healorder', 'milkdrink', 'moonlight', 'synthesis',
  'shoreup', 'morningsun', 'rest', 'wish',
  // Self-targeting stat boosts
  'swordsdance', 'nastyplot', 'calmmind', 'bulkup', 'quiverdance', 'dragondance',
  'agility', 'rockpolish', 'acupressure', 'shellsmash', 'stockpile', 'swallow',
  'growth', 'geomancy', 'filletaway', 'clangoroussoul', 'bellydrum',
  // Other self-targeting effects
  'substitute', 'focusenergy', 'ingrain', 'aquaring', 'magnetrise',
  'tailwind', 'safeguard', 'mist', 'luckychant',
]);

const MINIMIZE_DOUBLES = new Set(['stomp', 'steamroller', 'bodyslam', 'dragonrush', 'phantomforce', 'shadowforce', 'flyingpress']);

const COUNTER_MOVES = new Set(['counter', 'mirrorcoat', 'metalburst', 'comeuppance']);

const FIXED_DAMAGE_MOVES: Record<string, (attacker: PartyMember) => number> = {
  seismictoss: (a) => a.level,
  nightshade:  (a) => a.level,
  dragonrage:  () => 40,
  sonicboom:   () => 20,
};

const HP_HALVING_MOVES = new Set(['superfang', 'naturesmadness', 'ruination']);

const PHASING_MOVES = new Set(['dragontail', 'circlethrow']);

const CRASH_MOVE_IDS = new Set(['highjumpkick', 'jumpkick']);

const TYPE_STRIPPING_MOVES: Record<string, string> = {
  burnup: 'Fire',
  doubleshock: 'Electric',
};

const FLING_POWER: Record<string, number> = {
  'iron-ball': 130,
  'hard-stone': 100,
  'rocky-helmet': 100,
  'thick-club': 90,
  'flame-orb': 30,
  'toxic-orb': 30,
  'life-orb': 30,
  'choice-band': 30,
  'choice-specs': 30,
  'choice-scarf': 30,
  'leftovers': 10,
  'black-sludge': 30,
  'assault-vest': 10,
  'eviolite': 40,
  'black-belt': 30,
  'razor-fang': 30,
  'kings-rock': 30,
  'light-ball': 30,
  'oran-berry': 10,
  'sitrus-berry': 10,
  'lum-berry': 10,
  'leppa-berry': 10,
};

const NATURAL_GIFT_TABLE: Record<string, { power: number; type: PokemonType }> = {
  'cheri-berry':  { power: 80, type: 'Fire' },
  'chesto-berry': { power: 80, type: 'Water' },
  'pecha-berry':  { power: 80, type: 'Electric' },
  'rawst-berry':  { power: 80, type: 'Grass' },
  'aspear-berry': { power: 80, type: 'Ice' },
  'leppa-berry':  { power: 80, type: 'Fighting' },
  'oran-berry':   { power: 80, type: 'Poison' },
  'persim-berry': { power: 80, type: 'Ground' },
  'lum-berry':    { power: 80, type: 'Flying' },
  'sitrus-berry': { power: 80, type: 'Psychic' },
  'figy-berry':   { power: 80, type: 'Bug' },
  'wiki-berry':   { power: 80, type: 'Rock' },
  'mago-berry':   { power: 80, type: 'Ghost' },
  'aguav-berry':  { power: 80, type: 'Dragon' },
  'iapapa-berry': { power: 80, type: 'Dark' },
  'razz-berry':   { power: 80, type: 'Steel' },
};

const PLATE_TYPE_MAP: Record<string, string> = {
  'flame-plate': 'Fire', 'splash-plate': 'Water', 'zap-plate': 'Electric',
  'meadow-plate': 'Grass', 'icicle-plate': 'Ice', 'fist-plate': 'Fighting',
  'toxic-plate': 'Poison', 'earth-plate': 'Ground', 'sky-plate': 'Flying',
  'mind-plate': 'Psychic', 'insect-plate': 'Bug', 'stone-plate': 'Rock',
  'spooky-plate': 'Ghost', 'draco-plate': 'Dragon', 'dread-plate': 'Dark',
  'iron-plate': 'Steel', 'pixie-plate': 'Fairy',
};

const MEMORY_TYPE_MAP: Record<string, string> = {
  'fire-memory': 'Fire', 'water-memory': 'Water', 'electric-memory': 'Electric',
  'grass-memory': 'Grass', 'ice-memory': 'Ice', 'fighting-memory': 'Fighting',
  'poison-memory': 'Poison', 'ground-memory': 'Ground', 'flying-memory': 'Flying',
  'psychic-memory': 'Psychic', 'bug-memory': 'Bug', 'rock-memory': 'Rock',
  'ghost-memory': 'Ghost', 'dragon-memory': 'Dragon', 'dark-memory': 'Dark',
  'steel-memory': 'Steel', 'fairy-memory': 'Fairy',
};

const DRIVE_TYPE_MAP: Record<string, string> = {
  'burn-drive': 'Fire', 'chill-drive': 'Ice', 'douse-drive': 'Water', 'shock-drive': 'Electric',
};

const PUNCH_MOVES = new Set([
  'bulletpunch', 'cometpunch', 'dizzypunch', 'drainpunch', 'dynamicpunch',
  'firepunch', 'focuspunch', 'hammerarm', 'icepunch', 'jetpunch',
  'machpunch', 'megapunch', 'meteormash', 'poweruppunch', 'shadowpunch',
  'skyuppercut', 'suckerpunch', 'thunderpunch',
]);

function isPunchMove(move: Move): boolean {
  return PUNCH_MOVES.has(move.id);
}

const CHOICE_LOCK_ITEMS = new Set(['choice-band', 'choice-specs', 'choice-scarf']);

const THRASH_LOCK_MOVES = new Set(['outrage', 'petaldance', 'thrash']);
const ROLLOUT_LOCK_MOVES = new Set(['rollout', 'iceball']);

const ABILITY_VOLATILE_CLEAR = new Set(['slow-start', 'truant']);

const PROTECT_FAMILY_IDS = new Set([
  'protect', 'detect', 'kingsshield', 'spikyshield',
  'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark', 'endure',
]);

const CONTACT_PROTECT_VARIANTS: Record<string, { stat?: string; stages?: number; damage?: number; status?: string }> = {
  kingsshield:    { stat: 'atk', stages: -2 },
  spikyshield:    { damage: 8 },   // 1/8 max HP
  obstruct:       { stat: 'def', stages: -2 },
  silktrap:       { stat: 'spe', stages: -1 },
  banefulbunker:  { status: 'psn' },
  burningbulwark: { status: 'brn' },
};

type Action = MoveAction | SwitchAction;

export interface TurnResult {
  newState: BattleState;
  events: TurnResolveEvent[];
  pivotSlots?: string[];
  remainingActions?: Record<string, MoveAction | SwitchAction>;
  remainingSlotOrder?: string[];
  movedSlotIds?: Set<string>;
}

interface MoveResult extends TurnResult {
  pivotSwitch?: boolean;
}

export class BattleEngine {
  private readonly data = new DataLoader();
  private readonly effectEngine = new EffectEngine();
  private readonly registry: MoveEffectRegistry;
  private readonly rng: () => number;

  constructor({ registry, rng }: { registry?: MoveEffectRegistry; rng?: () => number } = {}) {
    this.rng = rng ?? Math.random;
    this.registry = registry ?? buildDefaultRegistry(this.data);
  }

  resolveTurn(state: BattleState, actions: Record<string, Action>): TurnResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    // Clear per-turn damage flag before new turn begins
    for (const team of s.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (active) {
          active.volatileStatus = active.volatileStatus.filter((v: any) => v.name !== 'damaged-this-turn');
        }
      }
    }

    // Snapshot last turn's faint info before resetting (used by retaliate resolver)
    const lastTurnFaintedTeamIndex = s.lastTurnFaintedTeamIndex;
    delete s.lastTurnFaintedTeamIndex;

    // 1. Determine action order (priority, then speed)
    const order = this.buildActionOrder(s, actions);

    // 1b. Consume start-of-turn speed items (Room Service) now that ordering is set
    for (const team of s.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted || !active.heldItem) continue;
        const hooks = getItemHooks(active.heldItem);
        if (hooks.onSpeedModifierConsuming) {
          const result = hooks.onSpeedModifierConsuming({ holder: active, state: s });
          if (typeof result !== 'number' && result.consume) {
            const consumed = active.heldItem;
            active.lastConsumedItem = consumed;
            delete active.heldItem;
            events.push({ type: 'item-consumed', data: { slotId: slot.slotId, item: consumed, reason: 'triggered' } });
          }
        }
      }
    }

    // 2. Execute each action
    const movedSlotIds = new Set<string>();
    for (const slotId of order) {
      const action = actions[slotId];
      if (!action) continue;

      const slot = this.findSlot(s, slotId);
      if (!slot) continue;
      const active = slot.party[slot.activePokemonIndex];
      // Skip moves when there is no active (or active has fainted).
      // Allow switches even when active has fainted (faint-replacement flow).
      if (action.type !== 'switch' && (!active || active.fainted)) continue;

      if (action.type === 'move') {
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds, order, lastTurnFaintedTeamIndex);
        events.push(...moveResult.events);
        s = moveResult.newState;

        if (moveResult.pivotSwitch) {
          movedSlotIds.add(slotId);
          const currentIdx = order.indexOf(slotId);
          const remainingSlotOrder = order.slice(currentIdx + 1);
          const remainingActions: Record<string, MoveAction | SwitchAction> = {};
          for (const rId of remainingSlotOrder) {
            if (actions[rId]) remainingActions[rId] = actions[rId]!;
          }
          return { newState: s, events, pivotSlots: [slotId], remainingActions, remainingSlotOrder, movedSlotIds };
        }
      } else if (action.type === 'switch') {
        const switchResult = this.executeSwitch(s, slotId, action.targetInstanceId);
        events.push(...switchResult.events);
        s = switchResult.newState;
      }

      movedSlotIds.add(slotId);

      if (this.checkWinCondition(s) !== null) break;
    }

    // 3. End-of-turn effects
    const eotResult = this.endOfTurn(s);
    events.push(...eotResult.events);
    s = eotResult.newState;

    // Record which team had a Pokémon faint this turn (for next turn's Retaliate)
    const faintEvents = events.filter(e => e.type === 'faint');
    if (faintEvents.length > 0) {
      const faintedSlotId = String((faintEvents[0] as any)!.data['slotId']);
      const faintedTeamIdx = s.teams.findIndex(t =>
        t.slots.some(sl => sl.slotId === faintedSlotId)
      );
      if (faintedTeamIdx !== -1) {
        s.lastTurnFaintedTeamIndex = faintedTeamIdx;
      }
    }

    // 4. Check win condition
    const winner = this.checkWinCondition(s);
    if (winner !== null) {
      s = { ...s, phase: 'ended', winner };
    } else {
      s = { ...s, turnNumber: s.turnNumber + 1, phase: 'action' };
    }

    return { newState: s, events };
  }

  private buildActionOrder(state: BattleState, actions: Record<string, Action>): string[] {
    const entries = Object.entries(actions).map(([slotId, action]) => {
      const slot = this.findSlot(state, slotId);
      if (!slot) return { slotId, priority: 0, spe: 0, tieSeed: this.rng() };
      const active = slot.party[slot.activePokemonIndex];
      if (!active) return { slotId, priority: 0, spe: 0, tieSeed: this.rng() };

      let priority = 6; // switches are highest
      if (action.type === 'move') {
        const moveId = active.moves[action.moveIndex]?.moveId ?? '';
        priority = this.data.getMove(moveId)?.priority ?? 0;
      }

      const teamIdx = state.teams.findIndex((t) => t.slots.some((sl) => sl.slotId === slotId)) as 0 | 1;
      const effectiveSpe = this.getEffectiveSpeed(active, state, teamIdx);
      const hasCustap = active.volatileStatus.some(v => v.name === 'custap-active');
      return { slotId, priority, spe: effectiveSpe, tieSeed: this.rng(), hasCustap };
    });

    const trickRoomActive = state.field.trickroom > 0;
    return entries
      .sort((a, b) =>
        b.priority - a.priority ||
        (b.hasCustap ? 1 : 0) - (a.hasCustap ? 1 : 0) ||
        (trickRoomActive ? a.spe - b.spe : b.spe - a.spe) ||
        a.tieSeed - b.tieSeed,
      )
      .map((e) => e.slotId);
  }

  private getEffectiveSpeed(pokemon: PartyMember, state: BattleState, teamIdx: 0 | 1 = 0): number {
    let spe = getEffectiveStat(pokemon.stats.spe, pokemon.statBoosts.spe, 'spe');
    if (pokemon.status === 'par') spe = Math.floor(spe * PARALYSIS_SPEED_MOD);

    const abilityHooks = getAbilityHooks(pokemon.ability);
    if (abilityHooks.onSpeedModifier) {
      spe = Math.floor(spe * abilityHooks.onSpeedModifier({ user: pokemon, state }));
    }
    const itemHooks = getItemHooks(pokemon.heldItem);
    if (itemHooks.onSpeedModifier) {
      spe = Math.floor(spe * itemHooks.onSpeedModifier({ holder: pokemon, state }));
    }
    if (itemHooks.onSpeedModifierConsuming) {
      const result = itemHooks.onSpeedModifierConsuming({ holder: pokemon, state });
      const mult = typeof result === 'number' ? result : result.multiplier;
      spe = Math.floor(spe * mult);
    }
    if (state.field.sideConditions[teamIdx]!.tailwind > 0) spe *= 2;
    return spe;
  }

  private executeMove(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction,
    movedSlotIds: Set<string>,
    order: string[],
    lastTurnFaintedTeamIndex?: number,
  ): MoveResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    const attackerSlot = this.findSlot(s, attackerSlotId);
    if (!attackerSlot) return { newState: s, events };
    const attacker = attackerSlot.party[attackerSlot.activePokemonIndex];
    if (!attacker) return { newState: s, events };

    // Allow Sleep Talk to fire while asleep
    const moveSlotForSleepTalkCheck = attacker.moves[action.moveIndex];
    if (moveSlotForSleepTalkCheck?.moveId === 'sleeptalk' && attacker.status === 'slp') {
      attacker.volatileStatus.push({ name: '__sleeptalk-bypass' });
    }

    const preMoveResult = this.effectEngine.runPreMove(attacker, attackerSlotId, s, this.getAllSlots(s), this.rng);
    events.push(...preMoveResult.events);
    if (preMoveResult.blocked) return { newState: s, events };

    // Save lastDamageTaken before clearing — retaliation moves (Counter/Mirror Coat/etc.) need it
    // Only clear it if the move actually fires (not when blocked by sleep, paralysis, flinch, etc.)
    const savedLastDamageTaken = attacker.lastDamageTaken;
    delete attacker.lastDamageTaken;

    const moveSlot = attacker.moves[action.moveIndex];
    if (!moveSlot) return { newState: s, events };

    const allPpDepleted = attacker.moves.every(m => m.currentPp === 0);
    let move = allPpDepleted
      ? this.data.getMove('struggle')
      : this.data.getMove(moveSlot.moveId);
    if (!move) return { newState: s, events };

    // Check if chosen move is disabled (block before decrement so same-turn disable preserves counter)
    const activeDisable = attacker.volatileStatus.find(v => v.name === 'disable');
    if (activeDisable && activeDisable.moveId === move.id) {
      events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'disabled', moveId: move.id } });
      return { newState: s, events };
    }

    // Taunt: block status moves
    const tauntEntry = attacker.volatileStatus.find(v => v.name === 'taunt');
    if (tauntEntry && move.category === 'status') {
      events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'taunted', moveId: move.id } });
      return { newState: s, events };
    }

    // Encore: force the encored move
    const encoreEntry = attacker.volatileStatus.find(v => v.name === 'encore');
    if (encoreEntry && encoreEntry.moveId && move.id !== encoreEntry.moveId) {
      const encoreSlot = attacker.moves.find(m => m.moveId === encoreEntry.moveId);
      if (encoreSlot && encoreSlot.currentPp > 0) {
        const encoreMove = this.data.getMove(encoreEntry.moveId);
        if (encoreMove) move = encoreMove;
      } else {
        // PP ran out, Encore ends
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'encore');
      }
    }

    // Outrage / Thrash / Petaldance / Rollout / Iceball: enforce move lock
    const lockVolatile = attacker.volatileStatus.find((v: any) =>
      v.name.endsWith('-active') && (
        THRASH_LOCK_MOVES.has(v.name.replace('-active', '')) ||
        ROLLOUT_LOCK_MOVES.has(v.name.replace('-active', ''))
      )
    );
    if (lockVolatile?.moveId && move.id !== lockVolatile.moveId) {
      const lockedMoveData = this.data.getMove(lockVolatile.moveId);
      if (lockedMoveData) move = lockedMoveData;
    }

    // Torment: block repeating last move
    const tormentActive = attacker.volatileStatus.some(v => v.name === 'torment');
    if (tormentActive && attacker.lastMoveId === move.id) {
      events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'torment', moveId: move.id } });
      return { newState: s, events };
    }

    // Imprison: block moves that the imprisoning foe also knows
    for (const team of s.teams) {
      if (team.slots.some(sl => sl.slotId === attackerSlotId)) continue; // skip attacker's own team
      for (const sl of team.slots) {
        const activeMon = sl.party[sl.activePokemonIndex];
        if (!activeMon || activeMon.fainted) continue;
        if (activeMon.volatileStatus.some(v => v.name === 'imprison')) {
          if (activeMon.moves.some(m => m.moveId === move.id)) {
            events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'imprison', moveId: move.id } });
            return { newState: s, events };
          }
        }
      }
    }

    // Decrement Disable (only if move was not blocked by it above)
    const disableDecEntry = attacker.volatileStatus.find(v => v.name === 'disable');
    if (disableDecEntry) {
      disableDecEntry.turnsRemaining = (disableDecEntry.turnsRemaining ?? 1) - 1;
      if ((disableDecEntry.turnsRemaining ?? 0) <= 0) {
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'disable');
        events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: 'disable' } });
      }
    }

    // Handle Terastallize
    if (action.terastallize && !attacker.hasTerastallized && attacker.teraType) {
      attacker.hasTerastallized = true;
      events.push({ type: 'terastallize', data: { slotId: attackerSlotId, teraType: attacker.teraType } });
    }

    // Spend PP (Struggle has no PP to consume)
    if (!allPpDepleted) {
      moveSlot.currentPp = Math.max(0, moveSlot.currentPp - 1);
      if (moveSlot.currentPp === 0 && attacker.heldItem === 'leppa-berry') {
        moveSlot.currentPp = Math.min(10, moveSlot.maxPp);
        attacker.lastConsumedItem = 'leppa-berry';
        delete attacker.heldItem;
        events.push({ type: 'item-consumed', data: { slotId: attackerSlotId, item: 'leppa-berry', reason: 'triggered' } });
      }
    }

    events.push({ type: 'move-used', data: { attackerSlotId, attackerName: attacker.nickname, moveId: move.id, moveName: move.name } });

    // Set choice lock after move-used fires so pre-move blocks (sleep, paralysis, flinch) don't lock
    if (!attacker.lockedMoveId) {
      if (CHOICE_LOCK_ITEMS.has(attacker.heldItem ?? '') || effectiveAbilityId(attacker) === 'gorilla-tactics') {
        attacker.lockedMoveId = move.id;
      }
    }

    // Gravity blocks airborne moves
    if (s.field.gravity > 0 && GRAVITY_BLOCKED_MOVES.has(move.id)) {
      events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'gravity' } });
      return { newState: s, events };
    }

    // Bide: apply volatile on first use (turn 1 entry)
    if (move.id === 'bide') {
      if (!attacker.volatileStatus.some(v => v.name === 'bide')) {
        attacker.volatileStatus.push({ name: 'bide', counter: 2, accumulated: 0 });
        events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: 'bide' } });
      }
      attacker.lastMoveId = move.id;
      s.lastUsedMoveId = move.id;
      return { newState: s, events };
    }

    if (move.category === 'status') {
      const { targets: rawTargets, targetSlotIds: rawTargetSlotIds } = this.resolveStatusTargets(s, attackerSlotId, action, move);
      const rawTargetTypes = rawTargets.map(t => this.resolveEffectiveTypes(t));
      const userTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId));

      // Filter out Protect-guarded targets (only for opposing targets)
      const filteredTargets: typeof rawTargets = [];
      const filteredSlotIds: string[] = [];
      const filteredTypes: PokemonType[][] = [];
      for (let i = 0; i < rawTargets.length; i++) {
        const tgt = rawTargets[i]!;
        const tSlotId = rawTargetSlotIds[i]!;
        const isOpponent = s.teams.some(
          team => team !== s.teams[userTeamIndex] && team.slots.some(sl => sl.slotId === tSlotId)
        );
        const protectEntry = tgt.volatileStatus.find(v => v.name === 'protect');
        const craftyShieldBlocks = isOpponent && tgt.volatileStatus.some(v => v.name === 'crafty-shield');
        const matBlockBlocks = isOpponent && tgt.volatileStatus.some(v => v.name === 'mat-block');
        if (isOpponent && protectEntry) {
          events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId: tSlotId, reason: 'protect', variant: protectEntry.variant } });
        } else if (craftyShieldBlocks) {
          events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId: tSlotId, reason: 'crafty-shield' } });
        } else if (matBlockBlocks) {
          events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId: tSlotId, reason: 'mat-block' } });
        } else {
          filteredTargets.push(tgt);
          filteredSlotIds.push(tSlotId);
          filteredTypes.push(rawTargetTypes[i]!);
        }
      }
      if (filteredTargets.length === 0 && rawTargets.length > 0) {
        return { newState: s, events };
      }

      // Accuracy check for status moves (e.g. Will-O-Wisp, Thunder Wave)
      {
        const primaryTargetSlotId = filteredSlotIds[0] ?? '';
        let statusHitChance: number | 'always' = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, 0);
        if (typeof statusHitChance === 'number') {
          const isFirst = order.indexOf(attackerSlotId) < order.indexOf(primaryTargetSlotId);
          const attItemMod = getItemHooks(attacker.heldItem).onAccuracyModifier?.({
            holder: attacker, state: s, move, isFirst,
          });
          if (attItemMod !== undefined) statusHitChance = Math.min(100, Math.floor(statusHitChance * attItemMod));
          // Micle Berry: apply 1.2× accuracy boost from volatile (item already consumed)
          let micleBonus = 1;
          if (attacker.volatileStatus.some(v => v.name === 'micle-active')) {
            micleBonus = 1.2;
            attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'micle-active');
          }
          if (micleBonus !== 1) statusHitChance = Math.min(100, Math.floor(statusHitChance * micleBonus));
          if (filteredSlotIds.length === 1) {
            const tSlot = this.findSlot(s, primaryTargetSlotId);
            const tMon = tSlot?.party[tSlot.activePokemonIndex];
            if (tMon) {
              const defItemMod = getItemHooks(tMon.heldItem).onAccuracyModifier?.({
                holder: tMon, state: s, move, isFirst,
              });
              if (defItemMod !== undefined) statusHitChance = Math.min(100, Math.floor(statusHitChance * defItemMod));
            }
          }
          // Lock-On / Mind Reader: bypass accuracy check for status moves too
          const firstTarget = filteredTargets[0];
          if (firstTarget) {
            const lockOnEntry = firstTarget.volatileStatus.find(v => v.name === 'lock-on' && v.sourceSlotId === attackerSlotId);
            if (lockOnEntry) {
              firstTarget.volatileStatus = firstTarget.volatileStatus.filter(v => v !== lockOnEntry);
              statusHitChance = 'always';
            }
            // Telekinesis: status moves always hit a telekinesis target
            const statusSecs = move.secondaries ?? [];
            const statusIsOhko = statusSecs.some(sec => sec.kind === 'ohko');
            if (!statusIsOhko && firstTarget.volatileStatus.some(v => v.name === 'telekinesis')) {
              statusHitChance = 'always';
            }
          }
          if (statusHitChance !== 'always' && this.rng() * 100 >= statusHitChance) {
            events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
            return { newState: s, events };
          }
        }
      }

      const ctx: MoveContext = {
        battle: s,
        user: attacker,
        userSlotId: attackerSlotId,
        userTeamIndex,
        userTypes: this.resolveEffectiveTypes(attacker),
        targets: filteredTargets,
        targetSlotIds: filteredSlotIds,
        targetTypes: filteredTypes,
        move,
        rng: this.rng,
        executeSubMove: (moveId: string, depth = 0, attackerSlotOverride?: string, targetSlotOverride?: string) =>
          this._runSubMove(
            moveId,
            attackerSlotOverride ?? attackerSlotId,
            targetSlotOverride ?? filteredSlotIds[0],
            s,
            depth,
          ),
      };

      const effectId = move.effectId ?? move.id;
      const handler = this.registry.get(effectId);

      // ── Magic Coat: bounce opponent-targeting status moves back to attacker ──
      const magicCoatIdx = MAGIC_COAT_BOUNCED_EFFECTS.has(effectId)
        ? ctx.targets.findIndex((t) => t.volatileStatus.some((v) => v.name === 'magic-coat'))
        : -1;
      if (magicCoatIdx >= 0 && handler) {
        const bouncer = ctx.targets[magicCoatIdx]!;
        const bouncerSlotId = ctx.targetSlotIds[magicCoatIdx]!;
        const bouncerTeamIdx = s.teams.findIndex((t) => t.slots.some((sl) => sl.slotId === bouncerSlotId)) as 0 | 1;
        bouncer.volatileStatus = bouncer.volatileStatus.filter((v) => v.name !== 'magic-coat');
        const bounceCtx: MoveContext = {
          ...ctx,
          user: bouncer,
          userSlotId: bouncerSlotId,
          userTeamIndex: bouncerTeamIdx,
          userTypes: this.resolveEffectiveTypes(bouncer),
          targets: [attacker],
          targetSlotIds: [attackerSlotId],
          targetTypes: [this.resolveEffectiveTypes(attacker)],
        };
        events.push(...handler(bounceCtx).events);
        return { newState: s, events };
      }

      // ── Snatch: steal self-targeting beneficial status moves from opponent ──
      const snatcherTeamIdx = (1 - userTeamIndex) as 0 | 1;
      const snatcherSlot = s.teams[snatcherTeamIdx]?.slots.find(
        (sl) => sl.party[sl.activePokemonIndex]?.volatileStatus.some((v) => v.name === 'snatch'),
      );
      if (SNATCH_STEALABLE_EFFECTS.has(effectId) && snatcherSlot) {
        const snatcher = snatcherSlot.party[snatcherSlot.activePokemonIndex]!;
        const snatcherSlotId = snatcherSlot.slotId;
        snatcher.volatileStatus = snatcher.volatileStatus.filter((v) => v.name !== 'snatch');
        const snatchCtx: MoveContext = {
          ...ctx,
          user: snatcher,
          userSlotId: snatcherSlotId,
          userTeamIndex: snatcherTeamIdx,
          userTypes: this.resolveEffectiveTypes(snatcher),
          targets: [snatcher],
          targetSlotIds: [snatcherSlotId],
          targetTypes: [this.resolveEffectiveTypes(snatcher)],
        };
        events.push(...handler!(snatchCtx).events);
        return { newState: s, events };
      }

      const preHandlerBoosts = filteredTargets.map(t => ({ ...t.statBoosts }));

      if (handler) {
        const handlerResult = handler(ctx);
        events.push(...handlerResult.events);

        // White Herb / Eject Pack: fire when a status move lowered a stat
        for (let tIdx = 0; tIdx < filteredTargets.length; tIdx++) {
          const t = filteredTargets[tIdx]!;
          const tSlotId = filteredSlotIds[tIdx]!;
          const pre = preHandlerBoosts[tIdx]!;
          if (!t.fainted && t.heldItem) {
            const statWasDropped = (Object.keys(t.statBoosts) as (keyof StatBoosts)[]).some(k => t.statBoosts[k] < pre[k]!);
            if (statWasDropped) {
              const dropResult = getItemHooks(t.heldItem).onStatDropped?.({ holder: t, state: s });
              if (dropResult) {
                if (dropResult.restoreStats) {
                  const toRestore = (Object.keys(t.statBoosts) as (keyof StatBoosts)[]).filter(k => t.statBoosts[k] < 0);
                  for (const k of toRestore) t.statBoosts[k] = 0;
                  if (toRestore.length > 0) {
                    events.push({ type: 'stat-change', data: { slotId: tSlotId, changes: Object.fromEntries(toRestore.map(k => [k, 0])) } });
                  }
                }
                if (dropResult.forceSwitch && !t.fainted) {
                  const defTeam = s.teams.find(tm => tm.slots.some(sl => sl.slotId === tSlotId));
                  const defSlot = defTeam?.slots.find(sl => sl.slotId === tSlotId);
                  if (defSlot) {
                    const bench = defSlot.party.filter((m, i) => i !== defSlot.activePokemonIndex && !m.fainted);
                    if (bench.length > 0) {
                      const pick = bench[Math.floor(this.rng() * bench.length)]!;
                      const packResult = this.performSwitch(s, tSlotId, pick.instanceId, 'phased');
                      events.push(...packResult.events);
                      s = packResult.newState;
                    }
                  }
                }
                if (dropResult.consume && t.heldItem) {
                  const consumed = t.heldItem;
                  t.lastConsumedItem = consumed;
                  delete t.heldItem;
                  events.push({ type: 'item-consumed', data: { slotId: tSlotId, item: consumed, reason: 'triggered' } });
                }
              }
            }
          }
        }

        // Mirror Herb: copy positive stat boosts gained by any target to a foe holding Mirror Herb
        for (let tIdx = 0; tIdx < filteredTargets.length; tIdx++) {
          const t = filteredTargets[tIdx]!;
          const tSlotId = filteredSlotIds[tIdx]!;
          const pre = preHandlerBoosts[tIdx]!;
          const posDeltas: Partial<Record<keyof StatBoosts, number>> = {};
          for (const k of Object.keys(t.statBoosts) as (keyof StatBoosts)[]) {
            const delta = t.statBoosts[k] - pre[k]!;
            if (delta > 0) posDeltas[k] = delta;
          }
          if (Object.keys(posDeltas).length === 0) continue;
          const boostedTeam = s.teams.find(tm => tm.slots.some(sl => sl.slotId === tSlotId));
          for (const foeTeam of s.teams) {
            if (foeTeam === boostedTeam) continue;
            for (const foeSlot of foeTeam.slots) {
              const foeMon = foeSlot.party[foeSlot.activePokemonIndex];
              if (!foeMon || foeMon.fainted) continue;
              const herbResult = getItemHooks(foeMon.heldItem).onOpponentStatBoosted?.({
                holder: foeMon,
                state: s,
                boostDeltas: posDeltas,
              });
              if (herbResult?.copyBoosts) {
                events.push(applyStatBoost(foeMon, foeSlot.slotId, posDeltas));
                if (herbResult.consume && foeMon.heldItem) {
                  const consumed = foeMon.heldItem;
                  foeMon.lastConsumedItem = consumed;
                  delete foeMon.heldItem;
                  events.push({ type: 'item-consumed', data: { slotId: foeSlot.slotId, item: consumed, reason: 'triggered' } });
                }
              }
            }
          }
        }

        if (handlerResult.forceSwitch) {
          const { targetSlotId, targetInstanceId } = handlerResult.forceSwitch;
          const switchResult = this.performSwitch(s, targetSlotId, targetInstanceId, 'phased');
          events.push(...switchResult.events);
          s = switchResult.newState;
        }
        if (handlerResult.pivotSwitch) {
          const attackerSlotForPivot = this.findSlot(s, attackerSlotId);
          const isTrapped = attacker.heldItem !== 'shed-shell' && attacker.volatileStatus.some(
            v => v.name === 'trapped' || v.name === 'no-retreat'
          );
          if (isTrapped) {
            if (attackerSlotForPivot) delete attackerSlotForPivot.batonPassData;
            events.push({ type: 'move-blocked', data: { slotId: attackerSlotId, reason: 'trapped' } });
          } else {
            const hasBench = attackerSlotForPivot?.party.some(
              (p, i) => i !== attackerSlotForPivot.activePokemonIndex && !p.fainted
            ) ?? false;
            if (hasBench) {
              return { newState: s, events, pivotSwitch: true };
            } else {
              events.push({ type: 'pivot-skipped', data: { slotId: attackerSlotId } });
              if (attackerSlotForPivot) delete attackerSlotForPivot.batonPassData;
            }
          }
        }
      } else {
        console.warn(`[MoveEffectRegistry] No handler for effectId="${effectId}" (moveId="${move.id}")`);
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'unimplemented' } });
      }
      s.lastUsedMoveId = move.id;
      return { newState: s, events };
    }

    // Determine targets
    let targetSlotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(s, attackerSlotId, move.target);

    // Center of Attention (Follow Me / Rage Powder / Spotlight): redirect foe-targeting moves
    // to the slot with center-of-attention volatile (only for moves targeting foes)
    if (!['self', 'allyTeam', 'allySide', 'allyOrSelf'].includes(move.target ?? '')) {
      const attackerTeamIdx = s.teams.findIndex((t) => t.slots.some((sl) => sl.slotId === attackerSlotId));
      const foeTeamIdx = attackerTeamIdx === 0 ? 1 : 0;
      const foeTeam = s.teams[foeTeamIdx];
      const cotSlot = foeTeam?.slots.find((sl) => {
        const active = sl.party[sl.activePokemonIndex];
        return active && !active.fainted && active.volatileStatus.some(v => v.name === 'center-of-attention');
      });
      if (cotSlot) targetSlotIds = [cotSlot.slotId];
    }

    const secs = move.secondaries ?? [];
    const isOhko = secs.some(sec => sec.kind === 'ohko');
    if (!['self', 'allyTeam'].includes(move.target) && !isOhko) {
      let defenderEvasion = 0;
      if (targetSlotIds.length === 1) {
        const tSlot = this.findSlot(s, targetSlotIds[0]!);
        const tMon = tSlot && tSlot.party[tSlot.activePokemonIndex];
        defenderEvasion = tMon?.statBoosts.evasion ?? 0;
      }
      let hitChance: number | 'always' = computeHitChance(move.accuracy, attacker.statBoosts.accuracy, defenderEvasion);
      // Weather accuracy override (Thunder in rain, Blizzard in snow, Hurricane in rain)
      if (s.field.weather) {
        const weatherOverride = WEATHER_ACCURACY[move.id]?.[s.field.weather.type];
        if (weatherOverride === true) hitChance = 'always';
        else if (typeof weatherOverride === 'number') hitChance = weatherOverride;
      }
      // Gravity boosts all move accuracy by 5/3
      if (s.field.gravity > 0 && hitChance !== 'always') {
        hitChance = Math.min(100, Math.floor((hitChance as number) * 5 / 3));
      }
      // Item-based accuracy modifiers (Wide Lens, Zoom Lens, Bright Powder)
      if (typeof hitChance === 'number') {
        const primaryTargetSlotId = targetSlotIds[0] ?? '';
        const isFirst = order.indexOf(attackerSlotId) < order.indexOf(primaryTargetSlotId);
        const attItemMod = getItemHooks(attacker.heldItem).onAccuracyModifier?.({
          holder: attacker, state: s, move, isFirst,
        });
        if (attItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * attItemMod));
        // Micle Berry: apply 1.2× accuracy boost from volatile (item already consumed)
        let micleBonus = 1;
        if (attacker.volatileStatus.some(v => v.name === 'micle-active')) {
          micleBonus = 1.2;
          attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'micle-active');
        }
        if (micleBonus !== 1) hitChance = Math.min(100, Math.floor(hitChance * micleBonus));
        if (targetSlotIds.length === 1) {
          const tSlot = this.findSlot(s, primaryTargetSlotId);
          const tMon = tSlot?.party[tSlot.activePokemonIndex];
          if (tMon) {
            const defItemMod = getItemHooks(tMon.heldItem).onAccuracyModifier?.({
              holder: tMon, state: s, move, isFirst,
            });
            if (defItemMod !== undefined) hitChance = Math.min(100, Math.floor(hitChance * defItemMod));
          }
        }
      }
      // Lock-On / Mind Reader: bypass accuracy check
      if (targetSlotIds.length === 1) {
        const primarySlot = this.findSlot(s, targetSlotIds[0]!);
        const primaryTarget = primarySlot?.party[primarySlot.activePokemonIndex];
        if (primaryTarget) {
          const lockOnEntry = primaryTarget.volatileStatus.find(v => v.name === 'lock-on' && v.sourceSlotId === attackerSlotId);
          if (lockOnEntry) {
            primaryTarget.volatileStatus = primaryTarget.volatileStatus.filter(v => v !== lockOnEntry);
            hitChance = 'always';
          }
          // Telekinesis: non-OHKO moves always hit a telekinesis target
          if (!isOhko && primaryTarget.volatileStatus.some(v => v.name === 'telekinesis')) {
            hitChance = 'always';
          }
        }
      }
      if (hitChance !== 'always' && this.rng() * 100 >= hitChance) {
        events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
        if (CRASH_MOVE_IDS.has(move.id)) {
          const crash = Math.floor(attacker.maxHp / 2);
          const actual = Math.min(crash, attacker.currentHp);
          attacker.currentHp -= actual;
          events.push({ type: 'damage-dealt', data: { source: 'crash', slotId: attackerSlotId, damage: actual, remainingHp: attacker.currentHp } });
          if (attacker.currentHp <= 0) {
            attacker.fainted = true;
            attacker.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
          }
        }
        if (!attacker.fainted && attacker.heldItem) {
          const missResult = getItemHooks(attacker.heldItem).onMoveMissed?.({ holder: attacker, state: s });
          if (missResult) {
            if (missResult.statBoostDeltas) {
              events.push(applyStatBoost(attacker, attackerSlotId, missResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
            }
            if (missResult.consume && attacker.heldItem) {
              const consumed = attacker.heldItem;
              attacker.lastConsumedItem = consumed;
              delete attacker.heldItem;
              events.push({ type: 'item-consumed', data: { slotId: attackerSlotId, item: consumed, reason: 'triggered' } });
            }
          }
        }
        return { newState: s, events };
      }
    }

    // Charge-turn check
    const chargeSec = secs.find(sec => sec.kind === 'charge');
    if (chargeSec) {
      const isSun = s.field.weather?.type === 'sun' || s.field.weather?.type === 'harsh-sun';
      const hasCharge = attacker.volatileStatus.some(v => v.name === chargeSec.chargeVolatile);
      if (!hasCharge && !isSun) {
        attacker.volatileStatus.push({ name: chargeSec.chargeVolatile });
        events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: chargeSec.chargeVolatile, note: 'charging' } });
        return { newState: s, events };
      }
      if (hasCharge) {
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== chargeSec.chargeVolatile);
      }
    }

    // Move type and base power overrides (computed once, apply to all targets)
    let effectiveBasePower = move.basePower;
    let effectiveMoveType = move.type;

    // Solar Beam / Solar Blade: half power in any non-sun weather
    if (SOLAR_MOVES.has(move.id) && s.field.weather && !['sun', 'harsh-sun'].includes(s.field.weather.type)) {
      effectiveBasePower = Math.floor(effectiveBasePower / 2);
    }
    // Weather Ball: double power + type change in active weather
    if (move.id === 'weatherball' && s.field.weather) {
      effectiveBasePower = 80;
      effectiveMoveType = WEATHER_BALL_TYPE[s.field.weather.type] ?? move.type;
    }

    // Magnitude: weighted random tier → sets base power
    if (move.id === 'magnitude') {
      const roll = this.rng();
      let magnitudeNum: number;
      let magnitudeBp: number;
      if (roll < 0.05)       { magnitudeNum = 4;  magnitudeBp = 10;  }
      else if (roll < 0.15)  { magnitudeNum = 5;  magnitudeBp = 30;  }
      else if (roll < 0.35)  { magnitudeNum = 6;  magnitudeBp = 50;  }
      else if (roll < 0.65)  { magnitudeNum = 7;  magnitudeBp = 70;  }
      else if (roll < 0.85)  { magnitudeNum = 8;  magnitudeBp = 90;  }
      else if (roll < 0.95)  { magnitudeNum = 9;  magnitudeBp = 110; }
      else                   { magnitudeNum = 10; magnitudeBp = 150; }
      effectiveBasePower = magnitudeBp;
      events.push({ type: 'move-note', data: { note: `Magnitude ${magnitudeNum}!` } });
    }

    // Fling: check for item and set power before the target loop; consume item here so it is
    // always removed even if the target is protected or immune
    if (move.id === 'fling') {
      if (!attacker.heldItem) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-item' } });
        return { newState: s, events };
      }
      effectiveBasePower = FLING_POWER[attacker.heldItem] ?? 30;
      delete attacker.heldItem;
    }

    // Natural Gift: check for berry and set power/type before the target loop; consume berry here
    // so it is always removed even if the target is protected or immune
    if (move.id === 'naturalgift') {
      if (!attacker.heldItem) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-berry' } });
        return { newState: s, events };
      }
      const ngEntry = NATURAL_GIFT_TABLE[attacker.heldItem];
      if (!ngEntry) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-berry' } });
        return { newState: s, events };
      }
      effectiveBasePower = ngEntry.power;
      effectiveMoveType = ngEntry.type;
      delete attacker.heldItem;
    }

    // Electrify: force the attacker's move to Electric type
    const electrifyIdx = attacker.volatileStatus.findIndex(v => v.name === 'electrify');
    if (electrifyIdx !== -1) {
      effectiveMoveType = 'Electric';
      attacker.volatileStatus.splice(electrifyIdx, 1);
    }

    // Ion Deluge: this-turn field flag makes Normal moves Electric
    if (s.field.ionDeluge && effectiveMoveType === 'Normal') {
      effectiveMoveType = 'Electric';
    }

    // Judgment: type from held Plate
    if (move.id === 'judgment') {
      const plate = (attacker as any).heldItem ?? '';
      effectiveMoveType = (PLATE_TYPE_MAP[plate] ?? 'Normal') as any;
    }
    // Multiattack: type from held Memory
    if (move.id === 'multiattack') {
      const memory = (attacker as any).heldItem ?? '';
      effectiveMoveType = (MEMORY_TYPE_MAP[memory] ?? 'Normal') as any;
    }
    // Techno Blast: type from held Drive
    if (move.id === 'technoblast') {
      const drive = (attacker as any).heldItem ?? '';
      effectiveMoveType = (DRIVE_TYPE_MAP[drive] ?? 'Normal') as any;
    }

    // Powder: if attacker has powder volatile and uses a Fire move, cancel move and self-damage
    const powderIdx = attacker.volatileStatus.findIndex(v => v.name === 'powder');
    if (powderIdx !== -1) {
      attacker.volatileStatus.splice(powderIdx, 1);
      if (effectiveMoveType === 'Fire') {
        const selfDmg = Math.floor(attacker.maxHp / 4);
        const taken = Math.min(selfDmg, attacker.currentHp);
        attacker.currentHp -= taken;
        events.push({ type: 'damage-dealt', data: { source: 'powder', slotId: attackerSlotId, damage: taken, remainingHp: attacker.currentHp } });
        if (attacker.currentHp <= 0) {
          attacker.fainted = true;
          events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
        }
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'powder' } });
        return { newState: s, events };
      }
    }

    // Extreme-weather move nullification (must come after effectiveMoveType is resolved)
    if (s.field.weather) {
      const wt = s.field.weather.type;
      if (
        (wt === 'heavy-rain' && effectiveMoveType === 'Fire') ||
        (wt === 'harsh-sun'  && effectiveMoveType === 'Water')
      ) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: wt } });
        return { newState: s, events };
      }
    }

    // Burnup / Doubleshock: fail if user lacks the required type
    const typeToStrip = TYPE_STRIPPING_MOVES[move.id];
    if (typeToStrip) {
      const userTypes = this.resolveEffectiveTypes(attacker);
      if (!userTypes.includes(typeToStrip as any)) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'wrong-type' } });
        return { newState: s, events };
      }
    }

    if (attacker.heldItem === 'metronome') {
      const existing = attacker.volatileStatus.find(v => v.name === 'metronome-count');
      if (attacker.lastMoveId === move.id) {
        if (existing) {
          existing.accumulated = (existing.accumulated ?? 0) + 1;
        } else {
          attacker.volatileStatus.push({ name: 'metronome-count', accumulated: 1 });
        }
      } else {
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'metronome-count');
      }
    }

    for (const targetSlotId of targetSlotIds) {
      const targetSlot = this.findSlot(s, targetSlotId);
      if (!targetSlot) continue;
      const target = targetSlot.party[targetSlot.activePokemonIndex];
      if (!target || target.fainted) continue;

      // Psychic Terrain: priority moves fail against grounded targets
      if (s.field.terrain?.type === 'psychic' && move.priority > 0) {
        const tTypesForGrounding = this.resolveEffectiveTypes(target);
        if (isGrounded(target, tTypesForGrounding, s.field.gravity > 0)) {
          events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'psychic-terrain', targetSlotId } });
          continue;
        }
      }

      // Poltergeist: fail if target holds no item
      if (move.id === 'poltergeist' && !(target as any).heldItem) {
        events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-item' } });
        continue;
      }

      // Protect check
      const protectEntry = target.volatileStatus.find(v => v.name === 'protect');
      if (protectEntry) {
        events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId, reason: 'protect', variant: protectEntry.variant } });
        // Variant contact effects
        const variantEffects = CONTACT_PROTECT_VARIANTS[protectEntry.variant ?? ''];
        if (variantEffects && move.makesContact) {
          if (variantEffects.stat && variantEffects.stages !== undefined) {
            events.push(applyStatBoost(attacker, attackerSlotId, { [variantEffects.stat]: variantEffects.stages } as Partial<Record<keyof StatBoosts, number>>));
          }
          if (variantEffects.damage) {
            const recoil = Math.max(1, Math.floor(attacker.maxHp / variantEffects.damage));
            const taken = Math.min(recoil, attacker.currentHp);
            attacker.currentHp -= taken;
            events.push({ type: 'damage-dealt', data: { source: 'protect-contact', slotId: attackerSlotId, damage: taken, remainingHp: attacker.currentHp } });
            if (attacker.currentHp <= 0) {
              attacker.fainted = true;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
          if (variantEffects.status) {
            const attackerSpecies = this.data.getSpecies(attacker.speciesId);
            const attackerTypes = attacker.hasTerastallized && attacker.teraType
              ? [attacker.teraType] as PokemonType[]
              : attacker.typeOverride
              ?? (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
            const evt = applyStatus(attacker, attackerSlotId, variantEffects.status as StatusCondition, attackerTypes, undefined, s);
            if (evt) events.push(evt);
          }
        }
        if (CRASH_MOVE_IDS.has(move.id)) {
          const crash = Math.floor(attacker.maxHp / 2);
          const actual = Math.min(crash, attacker.currentHp);
          attacker.currentHp -= actual;
          events.push({ type: 'damage-dealt', data: { source: 'crash', slotId: attackerSlotId, damage: actual, remainingHp: attacker.currentHp } });
          if (attacker.currentHp <= 0) {
            attacker.fainted = true;
            attacker.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
          }
        }
        continue;
      }

      // Wide Guard: blocks spread moves
      const isSpreadTarget = ['allAdjacent', 'allAdjacentFoes'].includes(move.target ?? '');
      if (isSpreadTarget && target.volatileStatus.some(v => v.name === 'wide-guard')) {
        events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId, reason: 'wide-guard' } });
        continue;
      }

      // Quick Guard: blocks priority moves
      if ((move.priority ?? 0) > 0 && target.volatileStatus.some(v => v.name === 'quick-guard')) {
        events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId, reason: 'quick-guard' } });
        continue;
      }

      // Mat Block: blocks physical/special moves (status moves are already handled in a separate branch)
      if (target.volatileStatus.some(v => v.name === 'mat-block')) {
        events.push({ type: 'move-blocked', data: { attackerSlotId, targetSlotId, reason: 'mat-block' } });
        continue;
      }

      if (target.status === 'frz' && (effectiveMoveType === 'Fire' || ALWAYS_THAW_MOVES.has(move.id))) {
        delete target.status;
        events.push({
          type: 'status-cured',
          data: { slotId: targetSlotId, status: 'frz', reason: 'fire-hit' },
        });
      }

      // Type effectiveness
      const targetSpecies = this.data.getSpecies(target.speciesId);
      const defTypes = target.hasTerastallized && target.teraType
        ? [target.teraType] as PokemonType[]
        : target.typeOverride
        ?? (targetSpecies?.types ?? ['Normal']) as PokemonType[];

      // Foresight/Odor Sleuth: Normal/Fighting hits Ghost
      let effectiveDefTypes = defTypes;
      if (target.volatileStatus.some(v => v.name === 'foresight')) {
        if (effectiveMoveType === 'Normal' || effectiveMoveType === 'Fighting') {
          effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Ghost');
        }
      }
      // Miracle Eye: Psychic hits Dark
      if (target.volatileStatus.some(v => v.name === 'miracle-eye') && effectiveMoveType === 'Psychic') {
        effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Dark');
      }
      // Roost: user loses Flying type for the rest of this turn
      if (target.volatileStatus.some(v => v.name === 'roost')) {
        effectiveDefTypes = effectiveDefTypes.filter(t => t !== 'Flying');
        if (effectiveDefTypes.length === 0) effectiveDefTypes = ['Normal'];
      }

      let effectiveness = this.data.getCombinedEffectiveness(effectiveMoveType, effectiveDefTypes);
      if (effectiveness === 0) {
        if (target.heldItem === 'ring-target') {
          effectiveness = 1;
        } else {
          events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
          continue;
        }
      }

      // Strong Winds: super-effective moves against Flying-type targets are reduced
      if (s.field.weather?.type === 'strong-winds' && effectiveDefTypes.includes('Flying')) {
        if (effectiveness >= 4) effectiveness /= 2;
        else if (effectiveness > 1) effectiveness = 1;
      }

      // Tar Shot: Fire moves deal double damage against tar-shot targets
      if (target.volatileStatus.some(v => v.name === 'tar-shot') && effectiveMoveType === 'Fire') {
        effectiveness *= 2;
      }

      // Magnet Rise: Ground immunity
      if (effectiveMoveType === 'Ground' && target.volatileStatus.some(v => v.name === 'magnet-rise')) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // Mold Breaker / Turboblaze / Teravolt: suppress defender ability hooks
      const ignoresAbilities = ['mold-breaker', 'turboblaze', 'teravolt']
        .includes(effectiveAbilityId(attacker));

      // Ability-based move immunity (Levitate, Volt Absorb, etc.)
      if (!ignoresAbilities) {
        const abilityImmunityResult = getAbilityHooks(effectiveAbilityId(target))
          .onMoveImmunity?.({ move, defender: target, state: s });
        if (abilityImmunityResult) {
          if (abilityImmunityResult.hpHealFraction) {
            const healAmt = Math.min(
              Math.floor(target.maxHp * abilityImmunityResult.hpHealFraction),
              target.maxHp - target.currentHp,
            );
            if (healAmt > 0) {
              target.currentHp += healAmt;
              events.push({ type: 'heal', data: { slotId: targetSlotId, amount: healAmt, remainingHp: target.currentHp } });
            }
          }
          if (abilityImmunityResult.statBoostDeltas) {
            events.push(applyStatBoost(target, targetSlotId, abilityImmunityResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
          }
          if (abilityImmunityResult.chargeFlashFire) {
            if (!target.volatileStatus.some(v => v.name === 'flash-fire-charged')) {
              target.volatileStatus.push({ name: 'flash-fire-charged' });
            }
          }
          events.push({ type: 'ability-triggered', data: { slotId: targetSlotId, ability: effectiveAbilityId(target), effect: 'immune' } });
          continue;
        }
      }

      // Air Balloon Ground immunity (item-based, inline)
      if (target.heldItem === 'air-balloon' && effectiveMoveType === 'Ground') {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // Telekinesis: target is lifted — immune to Ground-type moves
      if (effectiveMoveType === 'Ground' && target.volatileStatus.some(v => v.name === 'telekinesis')) {
        events.push({ type: 'move-used', data: { note: 'no-effect', targetSlotId, attackerName: attacker.nickname, moveName: move.name } });
        continue;
      }

      // OHKO check — bypasses normal damage formula
      const ohkoSec = secs.find(sec => sec.kind === 'ohko');
      if (ohkoSec) {
        if (target.level > attacker.level) {
          events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
          continue;
        }
        const ohkoAcc = Math.max(1, Math.min(100, 30 + attacker.level - target.level));
        if (this.rng() * 100 >= ohkoAcc) {
          events.push({ type: 'miss', data: { attackerSlotId, moveId: move.id } });
          continue;
        }
        const ohkoDmg = target.currentHp;
        target.currentHp = 0;
        target.fainted = true;
        target.lastDamageTaken = { amount: ohkoDmg, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
        const bideVolOhko = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolOhko) bideVolOhko.accumulated = (bideVolOhko.accumulated ?? 0) + ohkoDmg;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: ohkoDmg, effectiveness: 1, remainingHp: 0,
        }});
        events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        continue;
      }

      // Counter / Mirror Coat / Metal Burst / Comeuppance — retaliation moves
      if (COUNTER_MOVES.has(move.id)) {
        const ldt = savedLastDamageTaken;
        let counterDamage: number | null = null;
        if (move.id === 'counter') {
          counterDamage = (ldt?.category === 'physical') ? ldt.amount * 2 : null;
        } else if (move.id === 'mirrorcoat') {
          counterDamage = (ldt?.category === 'special') ? ldt.amount * 2 : null;
        } else { // metalburst, comeuppance
          counterDamage = ldt ? Math.floor(ldt.amount * 1.5) : null;
        }

        if (counterDamage === null) {
          events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-damage-to-counter' } });
          continue;
        }

        const actualCounter = Math.min(counterDamage, target.currentHp);
        target.currentHp -= actualCounter;
        target.lastDamageTaken = { amount: actualCounter, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
        const bideVolCounter = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolCounter) bideVolCounter.accumulated = (bideVolCounter.accumulated ?? 0) + actualCounter;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: actualCounter, effectiveness: 1, remainingHp: target.currentHp,
        }});
        if (target.currentHp <= 0) {
          target.fainted = true;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
        continue; // skip normal damage formula
      }

      // Fixed-damage moves — bypass calcDamage
      const fixedDmgFn = FIXED_DAMAGE_MOVES[move.id];
      if (fixedDmgFn) {
        const fixedDamage = fixedDmgFn(attacker);
        const actualFixed = Math.min(fixedDamage, target.currentHp);
        target.currentHp -= actualFixed;
        target.lastDamageTaken = { amount: actualFixed, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
        const bideVolFixed = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolFixed) bideVolFixed.accumulated = (bideVolFixed.accumulated ?? 0) + actualFixed;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: actualFixed, effectiveness: 1, remainingHp: target.currentHp,
        }});
        if (target.currentHp <= 0) {
          target.fainted = true;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
        continue; // skip normal damage formula
      }

      // HP-halving moves (Super Fang, Nature's Madness, Ruination)
      if (HP_HALVING_MOVES.has(move.id)) {
        if (target.currentHp <= 1) {
          events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'target-at-1hp' } });
          continue;
        }
        const halfDmg = Math.max(1, Math.floor(target.currentHp / 2));
        const cappedHalf = Math.min(halfDmg, target.currentHp);
        target.currentHp -= cappedHalf;
        target.lastDamageTaken = { amount: cappedHalf, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
        const bideVolHalf = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolHalf) bideVolHalf.accumulated = (bideVolHalf.accumulated ?? 0) + cappedHalf;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: cappedHalf, effectiveness: 1, remainingHp: target.currentHp,
        }});
        if (target.currentHp <= 0) {
          target.fainted = true;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
        continue;
      }

      // Endeavor: sets target HP to attacker HP
      if (move.id === 'endeavor') {
        if (target.currentHp <= attacker.currentHp) {
          events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'attacker-hp-not-lower' } });
          continue;
        }
        const endeavorDmg = target.currentHp - attacker.currentHp;
        target.currentHp -= endeavorDmg;
        target.lastDamageTaken = { amount: endeavorDmg, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
        const bideVolEndeavor = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolEndeavor) bideVolEndeavor.accumulated = (bideVolEndeavor.accumulated ?? 0) + endeavorDmg;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: endeavorDmg, effectiveness: 1, remainingHp: target.currentHp,
        }});
        // Endeavor never kills (target HP = attacker HP, which is >= 1)
        continue;
      }

      // Final Gambit: deals damage equal to attacker's HP, then attacker faints
      if (move.id === 'finalgambit') {
        const gambitDmg = attacker.currentHp;
        const cappedGambit = Math.min(gambitDmg, target.currentHp);
        target.currentHp -= cappedGambit;
        target.lastDamageTaken = { amount: cappedGambit, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
        const bideVolGambit = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolGambit) bideVolGambit.accumulated = (bideVolGambit.accumulated ?? 0) + cappedGambit;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: cappedGambit, effectiveness: 1, remainingHp: target.currentHp,
        }});
        if (target.currentHp <= 0) {
          target.fainted = true;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
        // Attacker also faints regardless
        attacker.currentHp = 0;
        attacker.fainted = true;
        events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
        continue;
      }

      // Beat Up: hits once per healthy, non-statused party member (Gen 5+ mechanics)
      if (move.id === 'beatup') {
        const beatUpMembers = attackerSlot.party.filter(m => !m.fainted && !m.status);
        if (beatUpMembers.length === 0) {
          events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-healthy-members' } });
          continue;
        }

        let beatUpTotal = 0;
        for (const member of beatUpMembers) {
          if (target.fainted) break;

          const memberSpecies = this.data.getSpecies(member.speciesId);
          const memberBaseAtk = memberSpecies?.baseStats.atk ?? 60;
          const beatUpPower = Math.floor(memberBaseAtk / 10) + 5;

          const { damage: beatUpDmg } = calcDamage({
            level: attacker.level,
            attackStat: 10,
            defenseStat: target.stats.def,
            basePower: beatUpPower,
            typeEffectiveness: effectiveness,
            stab: false,
            isBurned: false,
            randomFactor: randomDamageFactor(),
            isCritical: false,
            moveType: 'Dark',
            otherModifiers: 1,
          });

          const actualBeatUp = Math.min(beatUpDmg, target.currentHp);
          target.currentHp -= actualBeatUp;
          beatUpTotal += actualBeatUp;

          events.push({ type: 'damage-dealt', data: {
            attackerSlotId, targetSlotId, moveId: move.id,
            damage: actualBeatUp, effectiveness, remainingHp: target.currentHp,
          }});

          if (target.currentHp <= 0) {
            target.fainted = true;
            events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
          }
        }

        if (beatUpTotal > 0) {
          target.lastDamageTaken = { amount: beatUpTotal, category: 'physical', fromSlotId: attackerSlotId };
          const bideVolBeatUp = target.volatileStatus.find(v => v.name === 'bide');
          if (bideVolBeatUp) bideVolBeatUp.accumulated = (bideVolBeatUp.accumulated ?? 0) + beatUpTotal;
        }
        continue;
      }

      // Psywave: level-based random damage, bypasses type effectiveness
      if (move.id === 'psywave') {
        const psywaveDmg = Math.max(1, Math.floor(attacker.level * (this.rng() * 1.5 + 0.5)));
        const actualPsywave = Math.min(psywaveDmg, target.currentHp);
        target.currentHp -= actualPsywave;
        target.lastDamageTaken = { amount: actualPsywave, category: 'special', fromSlotId: attackerSlotId };
        const bideVolPsywave = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolPsywave) bideVolPsywave.accumulated = (bideVolPsywave.accumulated ?? 0) + actualPsywave;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: actualPsywave, effectiveness: 1, remainingHp: target.currentHp,
        }});
        if (target.currentHp <= 0) {
          target.fainted = true;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
        continue;
      }

      // Present: RNG roll determines 40/80/120 BP damage or 25% heal
      if (move.id === 'present') {
        const presentRoll = this.rng();
        if (presentRoll >= 0.80) {
          // Heal target for 25% of their max HP
          const healAmount = Math.max(1, Math.floor(target.maxHp / 4));
          const actualHeal = Math.min(healAmount, target.maxHp - target.currentHp);
          target.currentHp += actualHeal;
          events.push({ type: 'heal', data: { slotId: targetSlotId, amount: actualHeal, remainingHp: target.currentHp } });
          continue;
        }
        // Damage case: use standard calcDamage inline with rolled BP
        let presentBp: number;
        if (presentRoll < 0.40)      presentBp = 40;
        else if (presentRoll < 0.70) presentBp = 80;
        else                          presentBp = 120;

        const presentAttackerSpecies = this.data.getSpecies(attacker.speciesId);
        const presentAttackerTypes = attacker.hasTerastallized && attacker.teraType
          ? [attacker.teraType] as PokemonType[]
          : attacker.typeOverride
          ?? (presentAttackerSpecies?.types ?? ['Normal']) as PokemonType[];
        const presentStab = presentAttackerTypes.includes('Normal' as PokemonType);
        const { damage: presentDmg } = calcDamage({
          level: attacker.level,
          attackStat: attacker.stats.atk,
          defenseStat: target.stats.def,
          basePower: presentBp,
          typeEffectiveness: effectiveness,
          stab: presentStab,
          isBurned: false,
          randomFactor: randomDamageFactor(),
          isCritical: false,
          moveType: 'Normal',
          otherModifiers: 1,
        });
        const actualPresent = Math.min(presentDmg, target.currentHp);
        target.currentHp -= actualPresent;
        target.lastDamageTaken = { amount: actualPresent, category: 'physical', fromSlotId: attackerSlotId };
        const bideVolPresent = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolPresent) bideVolPresent.accumulated = (bideVolPresent.accumulated ?? 0) + actualPresent;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: actualPresent, effectiveness, remainingHp: target.currentHp,
        }});
        if (target.currentHp <= 0) {
          target.fainted = true;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
        continue;
      }

      // Spit Up: damage based on stockpile stacks, then remove stockpile
      if (move.id === 'spitup') {
        const stockpileVol = attacker.volatileStatus.find(v => v.name === 'stockpile');
        if (!stockpileVol) {
          events.push({ type: 'move-failed', data: { moveId: move.id, reason: 'no-stockpile' } });
          continue;
        }
        const stackCount = stockpileVol.counter ?? 1;
        const spitUpDmg = 100 * stackCount;
        const actualSpitUp = Math.min(spitUpDmg, target.currentHp);
        target.currentHp -= actualSpitUp;
        target.lastDamageTaken = { amount: actualSpitUp, category: 'special', fromSlotId: attackerSlotId };
        const bideVolSpitUp = target.volatileStatus.find(v => v.name === 'bide');
        if (bideVolSpitUp) bideVolSpitUp.accumulated = (bideVolSpitUp.accumulated ?? 0) + actualSpitUp;
        events.push({ type: 'damage-dealt', data: {
          attackerSlotId, targetSlotId, moveId: move.id,
          damage: actualSpitUp, effectiveness: 1, remainingHp: target.currentHp,
        }});
        if (target.currentHp <= 0) {
          target.fainted = true;
          events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
        }
        // Remove stockpile volatile
        attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'stockpile');
        continue;
      }

      const multihitSec = secs.find(sec => sec.kind === 'multihit');
      const hitCount = multihitSec
        ? (attacker.heldItem === 'loaded-dice' && Array.isArray(multihitSec.hits)
            ? multihitSec.hits[1]
            : this.rollHitCount(multihitSec.hits))
        : 1;

      const isPhysical = move.category === 'physical';
      const itemHooks = getItemHooks(attacker.heldItem);

      // Sheer Force: removes secondaries but boosts power by 1.3×
      const attackerAbilityForDmg = effectiveAbilityId(attacker);
      const sheerForceActive = getAbilityHooks(attackerAbilityForDmg).removesSecondaries === true;
      const moveHasSecondaries = sheerForceActive && (
        (move.effectChance !== undefined && move.effect !== undefined) ||
        secs.some(sec => ['status', 'stat', 'flinch', 'confusion'].includes(sec.kind))
      );

      // Look up species weights for weight-based move power
      const attackerSpeciesForPower = this.data.getSpecies(attacker.speciesId);
      const targetSpeciesForPower = this.data.getSpecies(target.speciesId);
      const targetTookDmgThisTurn = target.volatileStatus.some((v: any) => v.name === 'damaged-this-turn');
      const targetMovedThisTurn = movedSlotIds.has(targetSlotId);
      const attackerTeamIdx = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === attackerSlotId)) as 0 | 1;

      // Boltbeak / Fishiousrend: faster-than-target check
      const attSpd = getEffectiveStat(attacker.stats.spe, attacker.statBoosts.spe, 'spe');
      const defSpd = getEffectiveStat(target.stats.spe, target.statBoosts.spe, 'spe');
      const fasterThanTarget = s.field.trickroom > 0 ? attSpd <= defSpd : attSpd >= defSpd;

      // Trumpcard: current PP in the move slot
      const trumpCardPp: number | undefined = move.id === 'trumpcard'
        ? (attacker.moves.find((m: any) => m.moveId === 'trumpcard')?.currentPp ?? 1)
        : undefined;
      const moveInputForPower = trumpCardPp !== undefined ? { ...move, currentPp: trumpCardPp } : move;

      const fieldForPower = lastTurnFaintedTeamIndex !== undefined
        ? { ...s.field, allyFaintedTeamIndex: lastTurnFaintedTeamIndex, attackerTeamIndex: attackerTeamIdx }
        : { ...s.field, attackerTeamIndex: attackerTeamIdx };

      const attackerBaseWeight = attackerSpeciesForPower?.weightkg ?? 0;
      const targetBaseWeight = targetSpeciesForPower?.weightkg ?? 0;
      const resolvedPower = resolvePower(
        moveInputForPower,
        { ...attacker, weightkg: attacker.heldItem === 'float-stone' ? attackerBaseWeight * 0.5 : attackerBaseWeight,
          fasterThanTarget,
        },
        { ...target, weightkg: target.heldItem === 'float-stone' ? targetBaseWeight * 0.5 : targetBaseWeight,
          movedThisTurn: targetMovedThisTurn,
          tookDamageThisTurn: targetTookDmgThisTurn,
        },
        fieldForPower,
      );
      let perTargetBasePower = resolvedPower !== move.basePower ? resolvedPower : effectiveBasePower;

      // Minimize: certain moves deal double base power against a minimized target
      if (target.volatileStatus.some(v => v.name === 'minimize') && MINIMIZE_DOUBLES.has(move.id)) {
        perTargetBasePower *= 2;
      }

      let makesContact = move.makesContact === true;
      if (makesContact) {
        if (attacker.heldItem === 'protective-pads') makesContact = false;
        if (attacker.heldItem === 'punching-glove' && isPunchMove(move)) makesContact = false;
      }

      let totalDamage = 0;
      let hpDamageTaken = 0;
      let typeResistBerryToConsume = false;
      for (let hit = 0; hit < hitCount; hit++) {
        if (target.fainted) break;

        const attackerSpecies = this.data.getSpecies(attacker.speciesId);
        const attackerTypes = attacker.hasTerastallized && attacker.teraType
          ? [attacker.teraType] as PokemonType[]
          : attacker.typeOverride
          ?? (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
        const stab = attackerTypes.includes(effectiveMoveType);

        let rawAtkStat = isPhysical ? attacker.stats.atk : attacker.stats.spa;
        let boostKey: keyof StatBoosts = isPhysical ? 'atk' : 'spa';
        let rawDefStat = isPhysical ? target.stats.def : target.stats.spd;
        // Wonder Room: swap Def and SpD for damage calculation
        if (s.field.wonderroom > 0) {
          rawDefStat = isPhysical ? target.stats.spd : target.stats.def;
        }
        const defBoostKey = (s.field.wonderroom > 0)
          ? (isPhysical ? 'spd' as const : 'def' as const)
          : (isPhysical ? 'def' as const : 'spd' as const);

        // Stat-override moves
        if (move.id === 'foulplay') rawAtkStat = target.stats.atk;
        if (move.id === 'bodypress') { rawAtkStat = attacker.stats.def; boostKey = 'def'; }

        const fnCritBonus = itemHooks.critStageBonusFn ? itemHooks.critStageBonusFn({ holder: attacker, state: s }) : 0;
        const critStage = computeCritStage(move.critRatio, attacker.volatileStatus, (itemHooks.critStageBonus ?? 0) + fnCritBonus);
        let isCritical = this.rng() < critProbability(critStage);
        const defenderTeamIndexForCrit = s.teams.findIndex((t) => t.slots.some((sl) => sl.slotId === targetSlotId)) as 0 | 1;
        if (isCritical && s.field.sideConditions[defenderTeamIndexForCrit]!.luckychant > 0) isCritical = false;
        // For Foul Play, use target's atk boost; otherwise use attacker's boost
        const boostSource = move.id === 'foulplay' ? target : attacker;
        const atkBoost = isCritical ? Math.max(0, boostSource.statBoosts[boostKey as keyof StatBoosts]) : boostSource.statBoosts[boostKey as keyof StatBoosts];
        const defBoost = isCritical ? Math.min(0, target.statBoosts[defBoostKey]) : target.statBoosts[defBoostKey];

        let atkStat = getEffectiveStat(rawAtkStat, atkBoost, boostKey);
        const abilityHooks = getAbilityHooks(attacker.ability);
        if (abilityHooks.onAttackerModifier) {
          atkStat = Math.floor(atkStat * abilityHooks.onAttackerModifier({
            user: attacker, state: s, moveType: effectiveMoveType, basePower: perTargetBasePower, target,
          }));
        }
        const defStat = getEffectiveStat(rawDefStat, defBoost, defBoostKey);
        const isSpread = targetSlotIds.length > 1;
        let otherModifiers = isSpread ? 0.75 : 1;
        if (moveHasSecondaries) otherModifiers *= 1.3;
        if (itemHooks.onAttackerModifier) {
          otherModifiers *= itemHooks.onAttackerModifier({
            holder: attacker, state: s, moveType: effectiveMoveType, basePower: perTargetBasePower, target, isPhysical,
          });
        }
        if (attacker.heldItem === 'punching-glove' && isPunchMove(move)) otherModifiers *= 1.1;

        // Terrain power modifiers
        const terrain = s.field.terrain?.type;
        if (terrain) {
          const gravityActive = s.field.gravity > 0;
          const atkGrounded = isGrounded(attacker, attackerTypes, gravityActive);
          const defGrounded = isGrounded(target, effectiveDefTypes, gravityActive);
          if (terrain === 'electric' && effectiveMoveType === 'Electric' && atkGrounded) otherModifiers *= 1.5;
          if (terrain === 'grassy'   && effectiveMoveType === 'Grass'    && atkGrounded) otherModifiers *= 1.5;
          if (terrain === 'grassy'   && GRASSY_TERRAIN_HALVED.has(move.id))              otherModifiers *= 0.5;
          if (terrain === 'misty'    && effectiveMoveType === 'Dragon'   && defGrounded) otherModifiers *= 0.5;
          if (terrain === 'psychic'  && effectiveMoveType === 'Psychic'  && atkGrounded) otherModifiers *= 1.5;
        }

        // Mud Sport / Water Sport damage reduction
        if (s.field.mudSport   > 0 && effectiveMoveType === 'Electric') otherModifiers *= 0.5;
        if (s.field.waterSport > 0 && effectiveMoveType === 'Fire')     otherModifiers *= 0.5;

        // Charge: doubles Electric move base power (consumed on use)
        const chargeIdx = attacker.volatileStatus.findIndex(v => v.name === 'charge');
        if (chargeIdx !== -1 && effectiveMoveType === 'Electric') {
          otherModifiers *= 2;
          attacker.volatileStatus.splice(chargeIdx, 1);
        }

        // Helping Hand: boosts ally's move by 1.5×, consumed after use
        const hhIdx = attacker.volatileStatus.findIndex(v => v.name === 'helping-hand');
        if (hhIdx !== -1) {
          otherModifiers *= 1.5;
          attacker.volatileStatus.splice(hhIdx, 1);
        }

        // Screen damage halving — crits bypass screens
        const defenderTeamIndex = s.teams.findIndex(t =>
          t.slots.some(sl => sl.slotId === targetSlotId)
        ) as 0 | 1;
        otherModifiers *= getScreenMultiplier(
          s.field.sideConditions[defenderTeamIndex]!,
          move.category as 'physical' | 'special',
          isCritical,
        );

        // Ability-based defender modifier (Multiscale, Thick Fat, etc.)
        if (!ignoresAbilities) {
          const defAbilityMod = getAbilityHooks(effectiveAbilityId(target)).onDefenderModifier?.({
            defender: target,
            attacker,
            state: s,
            move,
            moveType: effectiveMoveType,
            basePower: perTargetBasePower,
            isPhysical,
            makesContact,
            effectiveness,
          });
          if (defAbilityMod !== undefined) otherModifiers *= defAbilityMod;
        }

        // Item-based defender modifier
        typeResistBerryToConsume = false;
        const defItemResult = getItemHooks(target.heldItem).onDefenderModifier?.({
          holder: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: perTargetBasePower,
          target: attacker,
          isPhysical,
          effectiveness,
        });
        if (defItemResult !== undefined) {
          const mult = typeof defItemResult === 'number' ? defItemResult : defItemResult.multiplier;
          otherModifiers *= mult;
          if (typeof defItemResult !== 'number' && defItemResult.consume) typeResistBerryToConsume = true;
        }

        const { damage } = calcDamage({
          level: attacker.level,
          attackStat: atkStat,
          defenseStat: defStat,
          basePower: perTargetBasePower,
          typeEffectiveness: effectiveness,
          stab,
          isBurned: isPhysical && attacker.status === 'brn',
          randomFactor: randomDamageFactor(),
          isCritical,
          moveType: effectiveMoveType,
          ...(s.field.weather && !getItemHooks(attacker.heldItem).ignoresWeather && !getItemHooks(target.heldItem).ignoresWeather
            ? { weather: s.field.weather.type }
            : {}),
          otherModifiers,
        });

        let finalDamage = damage;
        const abilityDmgMod = abilityHooks.onDamageModifier?.({ user: attacker, state: s, moveType: effectiveMoveType, basePower: perTargetBasePower, target });
        if (abilityDmgMod !== undefined) finalDamage = Math.floor(finalDamage * abilityDmgMod);
        const itemDmgMod = itemHooks.onDamageModifier?.({ holder: attacker, state: s, moveType: effectiveMoveType, basePower: perTargetBasePower, target, isPhysical, effectiveness });
        if (itemDmgMod !== undefined) finalDamage = Math.floor(finalDamage * itemDmgMod);

        const subEntry = target.volatileStatus.find(v => v.name === 'substitute');
        if (subEntry && subEntry.hp !== undefined) {
          // Substitute absorbed — lastDamageTaken only tracks direct HP damage
          const subDamage = Math.min(finalDamage, subEntry.hp);
          subEntry.hp -= subDamage;
          totalDamage += subDamage;
          events.push({ type: 'damage-dealt', data: {
            attackerSlotId, targetSlotId, moveId: move.id,
            damage: subDamage, effectiveness, remainingHp: target.currentHp, note: 'substitute',
          }});
          if (subEntry.hp <= 0) {
            target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'substitute');
            events.push({ type: 'volatile-cured', data: { slotId: targetSlotId, volatile: 'substitute' } });
          }
        } else {
          const actualDamage = Math.min(finalDamage, target.currentHp);
          // Endure: cap damage so HP stays at 1
          const endureEntry = target.volatileStatus.find(v => v.name === 'endure');
          let cappedDamage = (endureEntry && target.currentHp - actualDamage <= 0)
            ? target.currentHp - 1
            : actualDamage;
          // Focus Sash: survive OHKO at 1 HP if currently at full HP
          if (
            target.heldItem === 'focus-sash' &&
            target.currentHp === target.maxHp &&
            target.currentHp - cappedDamage <= 0
          ) {
            cappedDamage = target.currentHp - 1;
            target.lastConsumedItem = target.heldItem;
            delete target.heldItem;
            events.push({ type: 'focus-sash', data: { slotId: targetSlotId } });
            events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'focus-sash', reason: 'triggered' } });
          }
          target.currentHp -= cappedDamage;
          totalDamage += cappedDamage;
          hpDamageTaken += cappedDamage;

          events.push({ type: 'damage-dealt', data: {
            attackerSlotId, targetSlotId, moveId: move.id,
            damage: cappedDamage, effectiveness, remainingHp: target.currentHp,
            moveType: effectiveMoveType,
          }});

          if (endureEntry && cappedDamage < actualDamage) {
            events.push({ type: 'endure-survived', data: { slotId: targetSlotId } });
          }

          if (isCritical) {
            events.push({ type: 'crit', data: { slotId: targetSlotId } });
          }

          if (target.currentHp <= 0) {
            target.fainted = true;
            target.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: targetSlotId, instanceId: target.instanceId } });
            // Grudge: drain attacker's current move PP to 0
            if (target.volatileStatus.some(v => v.name === 'grudge')) {
              const attackerMoveSlot = attacker.moves.find(m => m.moveId === move.id);
              if (attackerMoveSlot) {
                attackerMoveSlot.currentPp = 0;
                events.push({ type: 'move-note', data: { slotId: attackerSlotId, moveId: move.id, note: 'pp-grudge-drained' } });
              }
            }
            // Destiny Bond: if the target had destiny-bond, the attacker also faints
            const dbEntry = target.volatileStatus.find(v => v.name === 'destiny-bond');
            if (dbEntry && !attacker.fainted) {
              attacker.currentHp = 0;
              attacker.fainted = true;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
        }
      }

      // Laser Focus: consumed after the attack fires (volatile cleared post-hit)
      attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'laser-focus');

      // Record total HP damage taken from this move (covers multi-hit moves correctly)
      if (hpDamageTaken > 0) {
        target.lastDamageTaken = { amount: hpDamageTaken, category: move.category as 'physical' | 'special', fromSlotId: attackerSlotId };
        // Bide: accumulate HP damage taken
        const bideEntry = target.volatileStatus.find(v => v.name === 'bide');
        if (bideEntry) {
          bideEntry.accumulated = (bideEntry.accumulated ?? 0) + hpDamageTaken;
        }
        // Mark target as having taken damage this turn (for Assurance)
        if (!target.volatileStatus.some((v: any) => v.name === 'damaged-this-turn')) {
          target.volatileStatus.push({ name: 'damaged-this-turn' });
        }
      }

      // Post-hit secondaries (applied after final hit, uses accumulated totalDamage)
      const targetHasSub = target.volatileStatus.some(v => v.name === 'substitute');
      if (totalDamage > 0) {
        const covertCloakActive = getItemHooks(target.heldItem).preventsSecondaryEffects === true;
        if (!target.fainted && !targetHasSub && !sheerForceActive && !covertCloakActive) {
          const secondaryEvent = evaluateSecondaryEffect(move, target, targetSlotId, defTypes, s, attackerAbilityForDmg);
          if (secondaryEvent) events.push(secondaryEvent);
          const volatileEvent = evaluateVolatileEffect(move.id, target, targetSlotId, attackerSlotId, attacker);
          if (volatileEvent) events.push(volatileEvent);
        }

        const postSecs = secs.filter(sec =>
          sec.kind !== 'multihit' && sec.kind !== 'ohko' && sec.kind !== 'charge' && sec.kind !== 'pivot'
        );
        const isSoundMove = move.soundMove === true;
        const preSecBoosts = { ...target.statBoosts };
        if (postSecs.length > 0 && !target.fainted && (!targetHasSub || isSoundMove) && !sheerForceActive && !covertCloakActive) {
          events.push(...applySecondaries({
            secondaries: postSecs,
            totalDamage,
            user: attacker,
            userSlotId: attackerSlotId,
            userAbility: attackerAbilityForDmg,
            target,
            targetSlotId,
            targetTypes: defTypes,
            battle: s,
            rng: this.rng,
            movedSlotIds,
          }));

          // Lum Berry: cure status applied by secondary effects
          if (target.status && !target.fainted) {
            const lumResult = getItemHooks(target.heldItem).onStatusApplied?.({
              holder: target,
              state: s,
              status: target.status,
            });
            if (lumResult?.cureStatus) {
              const curedStatus = target.status;
              delete target.status;
              events.push({ type: 'status-cured', data: { slotId: targetSlotId, status: curedStatus, reason: 'lum-berry' } });
              if (lumResult.consume && target.heldItem) {
                const itemName = target.heldItem;
                target.lastConsumedItem = itemName;
                delete target.heldItem;
                events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: itemName, reason: 'triggered' } });
              }
            }
          }
        }

        // White Herb / Eject Pack: fire when a stat was just lowered
        if (!target.fainted && target.heldItem) {
          const statWasDropped = (Object.keys(target.statBoosts) as (keyof StatBoosts)[]).some(
            k => target.statBoosts[k] < preSecBoosts[k]!
          );
          if (statWasDropped) {
            const dropResult = getItemHooks(target.heldItem).onStatDropped?.({ holder: target, state: s });
            if (dropResult) {
              if (dropResult.restoreStats) {
                const toRestore = (Object.keys(target.statBoosts) as (keyof StatBoosts)[]).filter(k => target.statBoosts[k] < 0);
                for (const k of toRestore) target.statBoosts[k] = 0;
                if (toRestore.length > 0) {
                  events.push({ type: 'stat-change', data: { slotId: targetSlotId, changes: Object.fromEntries(toRestore.map(k => [k, 0])) } });
                }
              }
              if (dropResult.forceSwitch && !target.fainted) {
                const defTeam2 = s.teams.find(t => t.slots.some(sl => sl.slotId === targetSlotId));
                const defSlot2 = defTeam2?.slots.find(sl => sl.slotId === targetSlotId);
                if (defSlot2) {
                  const bench = defSlot2.party.filter((m, i) => i !== defSlot2.activePokemonIndex && !m.fainted);
                  if (bench.length > 0) {
                    const pick = bench[Math.floor(this.rng() * bench.length)]!;
                    const packResult = this.performSwitch(s, targetSlotId, pick.instanceId, 'phased');
                    events.push(...packResult.events);
                    s = packResult.newState;
                  }
                }
              }
              if (dropResult.consume && target.heldItem) {
                const consumed = target.heldItem;
                target.lastConsumedItem = consumed;
                delete target.heldItem;
                events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
              }
            }
          }
        }

        // Mirror Herb: copy positive stat boosts from secondary effects to an opposing holder
        const secPosDeltas: Partial<Record<keyof StatBoosts, number>> = {};
        for (const k of Object.keys(target.statBoosts) as (keyof StatBoosts)[]) {
          const delta = target.statBoosts[k] - preSecBoosts[k]!;
          if (delta > 0) secPosDeltas[k] = delta;
        }
        if (Object.keys(secPosDeltas).length > 0) {
          const boostedTeam = s.teams.find(tm => tm.slots.some(sl => sl.slotId === targetSlotId));
          for (const foeTeam of s.teams) {
            if (foeTeam === boostedTeam) continue;
            for (const foeSlot of foeTeam.slots) {
              const foeMon = foeSlot.party[foeSlot.activePokemonIndex];
              if (!foeMon || foeMon.fainted) continue;
              const herbResult = getItemHooks(foeMon.heldItem).onOpponentStatBoosted?.({
                holder: foeMon,
                state: s,
                boostDeltas: secPosDeltas,
              });
              if (herbResult?.copyBoosts) {
                events.push(applyStatBoost(foeMon, foeSlot.slotId, secPosDeltas));
                if (herbResult.consume && foeMon.heldItem) {
                  const consumed = foeMon.heldItem;
                  foeMon.lastConsumedItem = consumed;
                  delete foeMon.heldItem;
                  events.push({ type: 'item-consumed', data: { slotId: foeSlot.slotId, item: consumed, reason: 'triggered' } });
                }
              }
            }
          }
        }
      }

      // Knock Off: remove target's held item after dealing damage
      if (move.id === 'knockoff' && totalDamage > 0 && !target.fainted && target.heldItem) {
        const knockedItem = target.heldItem;
        target.lastConsumedItem = knockedItem;
        delete target.heldItem;
        events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: knockedItem, reason: 'knocked-off' } });
      }

      // Defender's ability triggers (e.g. Static, Flame Body, Rough Skin, Iron Barbs)
      if (totalDamage > 0 && !target.fainted) {
        const afterHitCtx = {
          user: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target: attacker,
          isPhysical: move.category === 'physical',
          makesContact,
          rng: this.rng,
        };
        const afterHitResult = getAbilityHooks(effectiveAbilityId(target)).onAfterHit?.(afterHitCtx);
        if (afterHitResult) {
          if (afterHitResult.statusToApply && !attacker.fainted) {
            const attackerSpecies = this.data.getSpecies(attacker.speciesId);
            const attackerTypes = attacker.hasTerastallized && attacker.teraType
              ? [attacker.teraType] as PokemonType[]
              : attacker.typeOverride
              ?? (attackerSpecies?.types ?? ['Normal']) as PokemonType[];
            const evt = applyStatus(attacker, attackerSlotId, afterHitResult.statusToApply as StatusCondition, attackerTypes, undefined, s);
            if (evt) events.push(evt);
          }
          if (afterHitResult.statBoostDeltas && !attacker.fainted) {
            events.push(applyStatBoost(attacker, attackerSlotId, afterHitResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
          }
          if (afterHitResult.abilityOverride && !attacker.fainted) {
            attacker.ability = afterHitResult.abilityOverride;
            events.push({ type: 'ability-triggered', data: { slotId: attackerSlotId, ability: afterHitResult.abilityOverride, effect: 'mummy' } });
          }
          if (afterHitResult.directDamage !== undefined && !attacker.fainted) {
            const dmg = Math.min(afterHitResult.directDamage, attacker.currentHp);
            attacker.currentHp -= dmg;
            events.push({ type: 'damage-dealt', data: { source: 'ability-contact', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
            if (attacker.currentHp <= 0) {
              attacker.fainted = true;
              attacker.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
          if (afterHitResult.volatileToApply && !attacker.fainted) {
            if (!attacker.volatileStatus.some(v => v.name === afterHitResult.volatileToApply)) {
              attacker.volatileStatus.push({ name: afterHitResult.volatileToApply! });
              events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: afterHitResult.volatileToApply } });
            }
          }
          if (afterHitResult.disableMoveId && !attacker.fainted) {
            if (!attacker.volatileStatus.some(v => v.name === 'disable')) {
              attacker.volatileStatus.push({ name: 'disable', moveId: afterHitResult.disableMoveId });
              events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: 'disable', moveId: afterHitResult.disableMoveId } });
            }
          }
        }
      }

      // Shell Bell — heal attacker after dealing damage
      if (totalDamage > 0 && !attacker.fainted) {
        const sbResult = itemHooks.onHealAfterAttack?.({
          holder: attacker,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target,
          isPhysical,
          damageDealt: totalDamage,
        });
        if (sbResult && sbResult.hpDelta > 0) {
          const healed = Math.min(sbResult.hpDelta, attacker.maxHp - attacker.currentHp);
          if (healed > 0) {
            attacker.currentHp += healed;
            events.push({ type: 'heal', data: { slotId: attackerSlotId, amount: healed, remainingHp: attacker.currentHp } });
          }
        }
      }

      // Post-hit item triggers (Rocky Helmet, Air Balloon pop, Weakness Policy)
      if (totalDamage > 0 && !attacker.fainted) {
        // Rocky Helmet
        const helmetResult = getItemHooks(target.heldItem).onAfterHit?.({
          holder: target,
          state: s,
          moveType: effectiveMoveType,
          basePower: effectiveBasePower,
          target: attacker,
          isPhysical,
          makesContact,
          totalDamage,
          rng: this.rng,
        });
        if (helmetResult) {
          if (helmetResult.directDamageToAttacker && !attacker.fainted) {
            const dmg = Math.min(helmetResult.directDamageToAttacker, attacker.currentHp);
            attacker.currentHp -= dmg;
            events.push({ type: 'damage-dealt', data: { source: target.heldItem ?? 'rocky-helmet', slotId: attackerSlotId, damage: dmg, remainingHp: attacker.currentHp } });
            if (attacker.currentHp <= 0) {
              attacker.fainted = true;
              attacker.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
            }
          }
          if (helmetResult.flinchTarget && !attacker.fainted) {
            attacker.volatileStatus = attacker.volatileStatus.filter(v => v.name !== 'flinch');
            attacker.volatileStatus.push({ name: 'flinch' });
          }
          if (helmetResult.consume && target.heldItem) {
            const consumed = target.heldItem;
            target.lastConsumedItem = consumed;
            delete target.heldItem;
            events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
          }
          if (helmetResult.forceAttackerSwitch && !attacker.fainted) {
            const atkTeam = s.teams.find(t => t.slots.some(sl => sl.slotId === attackerSlotId));
            const atkSlot = atkTeam?.slots.find(sl => sl.slotId === attackerSlotId);
            if (atkSlot) {
              const bench = atkSlot.party.filter((m, i) => i !== atkSlot.activePokemonIndex && !m.fainted);
              if (bench.length > 0) {
                const pick = bench[Math.floor(this.rng() * bench.length)]!;
                const redCardResult = this.performSwitch(s, attackerSlotId, pick.instanceId, 'phased');
                events.push(...redCardResult.events);
                s = redCardResult.newState;
              }
            }
            if (helmetResult.consume && target.heldItem) {
              const consumed = target.heldItem;
              target.lastConsumedItem = consumed;
              delete target.heldItem;
              events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
            }
          }
        }
      }

      // Air Balloon pop (any damaging hit bursts the balloon)
      if (totalDamage > 0 && target.heldItem === 'air-balloon') {
        target.lastConsumedItem = target.heldItem;
        delete target.heldItem;
        events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: 'air-balloon', reason: 'popped' } });
      }

      // Type-resist berry: consumed after damage calculation
      if (typeResistBerryToConsume && totalDamage > 0 && target.heldItem) {
        const consumed = target.heldItem;
        target.lastConsumedItem = consumed;
        delete target.heldItem;
        events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
      }

      // Weakness Policy
      if (effectiveness > 1 && totalDamage > 0 && !target.fainted && target.heldItem === 'weakness-policy') {
        const policyItem = target.heldItem;
        target.lastConsumedItem = policyItem;
        delete target.heldItem;
        events.push(applyStatBoost(target, targetSlotId, { atk: 2, spa: 2 }));
        events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: policyItem, reason: 'triggered' } });
      }

      // Defender berry triggers after taking damage (Sitrus Berry, Salac Berry, etc.)
      if (totalDamage > 0 && !target.fainted) {
        const berryHooks = getItemHooks(target.heldItem);
        if (berryHooks.onAfterDamageTaken) {
          const berryResult = berryHooks.onAfterDamageTaken({
            holder: target,
            state: s,
            damageTaken: totalDamage,
            effectiveness,
            moveType: effectiveMoveType,
            isPhysical,
            rng: this.rng,
          });
          if (berryResult.hpDelta > 0) {
            const heal = Math.min(berryResult.hpDelta, target.maxHp - target.currentHp);
            if (heal > 0) {
              target.currentHp += heal;
              events.push({ type: 'heal', data: { slotId: targetSlotId, amount: heal, remainingHp: target.currentHp } });
            }
          }
          if (berryResult.statBoostDeltas) {
            events.push(applyStatBoost(target, targetSlotId, berryResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
          }
          if (berryResult.consume) {
            const itemName = target.heldItem!;
            target.lastConsumedItem = itemName;
            delete target.heldItem;
            events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: itemName, reason: 'triggered' } });
          }
        }
      }

      // Eject Button: force switch the DEFENDER after taking direct damage
      if (totalDamage > 0 && !target.fainted) {
        const ejectFires = getItemHooks(target.heldItem).onAfterDamageTakenForceSwitch?.({
          holder: target, state: s, damageTaken: totalDamage,
        });
        if (ejectFires) {
          const defTeam = s.teams.find(t => t.slots.some(sl => sl.slotId === targetSlotId));
          const defSlot = defTeam?.slots.find(sl => sl.slotId === targetSlotId);
          if (defSlot) {
            const bench = defSlot.party.filter((m, i) => i !== defSlot.activePokemonIndex && !m.fainted);
            if (bench.length > 0) {
              const pick = bench[Math.floor(this.rng() * bench.length)]!;
              const ejectResult = this.performSwitch(s, targetSlotId, pick.instanceId, 'phased');
              events.push(...ejectResult.events);
              s = ejectResult.newState;
              if (target.heldItem) {
                const consumed = target.heldItem;
                target.lastConsumedItem = consumed;
                delete target.heldItem;
                events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item: consumed, reason: 'triggered' } });
              }
            }
          }
        }
      }

      // Life Orb recoil + attacker-held berry triggers (e.g. Custap, Micle, Figy at low HP)
      if (totalDamage > 0 && itemHooks.onAfterDamageTaken) {
        const attackerBerryResult = itemHooks.onAfterDamageTaken({ holder: attacker, state: s, damageTaken: totalDamage, rng: this.rng });
        const { hpDelta } = attackerBerryResult;
        if (hpDelta < 0) {
          const recoil = Math.min(-hpDelta, attacker.currentHp);
          attacker.currentHp -= recoil;
          events.push({ type: 'damage-dealt', data: { source: 'life-orb', slotId: attackerSlotId, damage: recoil, remainingHp: attacker.currentHp } });
          if (attacker.currentHp <= 0) {
            attacker.fainted = true;
            attacker.currentHp = 0;
            events.push({ type: 'faint', data: { slotId: attackerSlotId, instanceId: attacker.instanceId } });
          }
        } else if (hpDelta > 0) {
          const heal = Math.min(hpDelta, attacker.maxHp - attacker.currentHp);
          if (heal > 0) {
            attacker.currentHp += heal;
            events.push({ type: 'heal', data: { slotId: attackerSlotId, amount: heal, remainingHp: attacker.currentHp } });
          }
        }
        if (attackerBerryResult.statBoostDeltas) {
          events.push(applyStatBoost(attacker, attackerSlotId, attackerBerryResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
        }
        if (attackerBerryResult.consume && attacker.heldItem) {
          const consumed = attacker.heldItem;
          attacker.lastConsumedItem = consumed;
          delete attacker.heldItem;
          events.push({ type: 'item-consumed', data: { slotId: attackerSlotId, item: consumed, reason: 'triggered' } });
        }
      }

      attacker.lastMoveId = move.id;
      s.lastUsedMoveId = move.id;

      // Dragon Tail / Circle Throw — force-switch after dealing damage
      if (PHASING_MOVES.has(move.id) && !target.fainted && totalDamage > 0) {
        const benchMembers = targetSlot.party.filter(
          (m, i) => i !== targetSlot.activePokemonIndex && !m.fainted
        );
        if (benchMembers.length > 0) {
          const randomBench = benchMembers[Math.floor(this.rng() * benchMembers.length)]!;
          const phaseResult = this.performSwitch(s, targetSlotId, randomBench.instanceId, 'phased');
          events.push(...phaseResult.events);
          s = phaseResult.newState;
          // Note: target/targetSlot references are stale after s update, but we're done with them
        }
        // If no bench, just skip the force-switch (target stays in)
      }
    }

    // Throat Spray: +1 SpA after successfully using a sound-based move
    if (move.soundMove === true && !attacker.fainted && attacker.heldItem) {
      const sprayResult = getItemHooks(attacker.heldItem).onAfterSoundMove?.({ holder: attacker, state: s });
      if (sprayResult) {
        if (sprayResult.statBoostDeltas) {
          events.push(applyStatBoost(attacker, attackerSlotId, sprayResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
        }
        if (sprayResult.consume && attacker.heldItem) {
          const consumed = attacker.heldItem;
          attacker.lastConsumedItem = consumed;
          delete attacker.heldItem;
          events.push({ type: 'item-consumed', data: { slotId: attackerSlotId, item: consumed, reason: 'triggered' } });
        }
      }
    }

    // Outrage / Petaldance / Thrash: manage lock volatile
    if (THRASH_LOCK_MOVES.has(move.id) && !attacker.fainted) {
      const volatileName = `${move.id}-active`;
      let lockV = attacker.volatileStatus.find((v: any) => v.name === volatileName);
      if (!lockV) {
        // First use: 2 or 3 turns (rng < 0.5 → 2, else → 3)
        const turns = this.rng() < 0.5 ? 2 : 3;
        lockV = { name: volatileName, moveId: move.id, counter: turns };
        attacker.volatileStatus.push(lockV);
        events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: volatileName } });
      }
      lockV.counter = (lockV.counter ?? 1) - 1;
      if (lockV.counter <= 0) {
        attacker.volatileStatus = attacker.volatileStatus.filter((v: any) => v !== lockV);
        events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: volatileName } });
        // Apply confusion after thrash sequence ends
        const confuseEvent = applyVolatile(attacker, attackerSlotId, attackerSlotId, 'confusion');
        if (confuseEvent) events.push(confuseEvent);
      }
    }

    // Rollout / Iceball: manage scaling lock volatile
    if (ROLLOUT_LOCK_MOVES.has(move.id) && !attacker.fainted) {
      const volatileName = `${move.id}-active`;
      let lockV = attacker.volatileStatus.find((v: any) => v.name === volatileName) as any;
      if (!lockV) {
        lockV = { name: volatileName, moveId: move.id, counter: 1 };
        attacker.volatileStatus.push(lockV);
      } else {
        lockV.counter = (lockV.counter ?? 1) + 1;
      }
      if (lockV.counter >= 5) {
        attacker.volatileStatus = attacker.volatileStatus.filter((v: any) => v !== lockV);
        events.push({ type: 'volatile-cured', data: { slotId: attackerSlotId, volatile: volatileName } });
        // No confusion for rollout/iceball
      }
    }

    // Echoed Voice: increment consecutive counter
    if (move.id === 'echoedvoice') {
      let evV = attacker.volatileStatus.find((v: any) => v.name === 'echoedvoice-active') as any;
      if (!evV) {
        attacker.volatileStatus.push({ name: 'echoedvoice-active', counter: 1 });
      } else {
        evV.counter = Math.min(5, (evV.counter ?? 1) + 1);
      }
    }

    // Echoed Voice: clear counter when a different move is used
    if (move.id !== 'echoedvoice') {
      attacker.volatileStatus = attacker.volatileStatus.filter((v: any) => v.name !== 'echoedvoice-active');
    }

    const hasPivot = secs.some(sec => sec.kind === 'pivot');
    if (hasPivot && !attacker.fainted) {
      const attackerSlotForPivot = this.findSlot(s, attackerSlotId);
      const hasBench = attackerSlotForPivot?.party.some(
        (p, i) => i !== attackerSlotForPivot.activePokemonIndex && !p.fainted
      ) ?? false;
      if (hasBench) {
        return { newState: s, events, pivotSwitch: true };
      } else {
        events.push({ type: 'pivot-skipped', data: { slotId: attackerSlotId } });
      }
    }

    // Burnup / Doubleshock: strip type from attacker after dealing damage
    if (typeToStrip && !attacker.fainted) {
      const currentTypes = this.resolveEffectiveTypes(attacker);
      if (currentTypes.includes(typeToStrip as any)) {
        const stripped = currentTypes.filter(t => t !== typeToStrip);
        attacker.typeOverride = stripped.length > 0 ? stripped : ['Normal'];
        events.push({ type: 'volatile-applied', data: { targetSlotId: attackerSlotId, volatile: 'type-changed' } });
      }
    }

    return { newState: s, events };
  }

  public processForceSwitch(
    state: BattleState,
    slotId: string,
    targetInstanceId: string,
    reason: 'forced' | 'phased',
  ): TurnResult {
    return this.performSwitch(state, slotId, targetInstanceId, reason);
  }

  public resumeTurn(
    state: BattleState,
    remainingSlotOrder: string[],
    actions: Record<string, MoveAction | SwitchAction>,
    movedSlotIds: Set<string>,
  ): TurnResult {
    const events: TurnResolveEvent[] = [];
    let s = structuredClone(state);

    for (const slotId of remainingSlotOrder) {
      if (movedSlotIds.has(slotId)) continue;

      const slot = this.findSlot(s, slotId);
      if (!slot) continue;
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;

      const action = actions[slotId];
      if (!action) continue;

      if (action.type === 'move') {
        const moveResult = this.executeMove(s, slotId, action, movedSlotIds, remainingSlotOrder, s.lastTurnFaintedTeamIndex);
        events.push(...moveResult.events);
        s = moveResult.newState;
        // Pivot chaining within a single turn is not supported — ignore pivotSwitch here
      } else if (action.type === 'switch') {
        const switchResult = this.executeSwitch(s, slotId, action.targetInstanceId);
        events.push(...switchResult.events);
        s = switchResult.newState;
      }

      movedSlotIds.add(slotId);
      if (this.checkWinCondition(s) !== null) break;
    }

    const eotResult = this.endOfTurn(s);
    events.push(...eotResult.events);
    s = eotResult.newState;

    const winner = this.checkWinCondition(s);
    if (winner !== null) {
      s = { ...s, phase: 'ended', winner };
    } else {
      s = { ...s, turnNumber: s.turnNumber + 1, phase: 'action' };
    }

    return { newState: s, events };
  }

  private executeSwitch(state: BattleState, slotId: string, targetInstanceId: string): TurnResult {
    const events: TurnResolveEvent[] = [];
    const slot = this.findSlot(state, slotId);
    const active = slot?.party[slot.activePokemonIndex];
    if (active) {
      const isTrapped = active.heldItem !== 'shed-shell' && active.volatileStatus.some(
        v => v.name === 'trapped' || v.name === 'no-retreat' || v.name === 'ingrain',
      );
      if (isTrapped) {
        events.push({ type: 'move-blocked', data: { slotId, reason: 'trapped' } });
        return { newState: state, events };
      }
    }
    return this.performSwitch(state, slotId, targetInstanceId, 'voluntary');
  }

  private performSwitch(
    state: BattleState,
    slotId: string,
    targetInstanceId: string,
    reason: 'voluntary' | 'forced' | 'phased',
  ): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);
    const slot = this.findSlot(s, slotId);
    if (!slot) return { newState: s, events };
    const newIndex = slot.party.findIndex((p) => p.instanceId === targetInstanceId);
    if (newIndex === -1 || slot.party[newIndex]?.fainted) return { newState: s, events };

    const outgoing = slot.party[slot.activePokemonIndex];
    const outInstanceId = outgoing?.instanceId;

    // 1. onSwitchOut before clearing state
    if (outgoing) {
      const outHooks = getAbilityHooks(effectiveAbilityId(outgoing));
      const switchOutResult = outHooks.onSwitchOut?.({ battle: s, slotId, pokemon: outgoing });
      if (switchOutResult) {
        if (switchOutResult.hpDelta) {
          outgoing.currentHp = Math.min(outgoing.maxHp, outgoing.currentHp + switchOutResult.hpDelta);
        }
        if (switchOutResult.clearStatus) {
          delete outgoing.status;
        }
        events.push(...switchOutResult.events);
      }
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v => !ABILITY_VOLATILE_CLEAR.has(v.name));
    }

    // 2. Switch-out cleanup
    if (outgoing) {
      if (outgoing.originalForm) {
        outgoing.stats = outgoing.originalForm.stats;
        outgoing.ability = outgoing.originalForm.ability;
        outgoing.moves = outgoing.originalForm.moves;
        if (outgoing.originalForm.typeOverride) {
          outgoing.typeOverride = outgoing.originalForm.typeOverride;
        } else {
          delete outgoing.typeOverride;
        }
        delete outgoing.originalForm;
        outgoing.volatileStatus = outgoing.volatileStatus.filter(v => v.name !== 'transformed');
      }
      outgoing.volatileStatus = outgoing.volatileStatus.filter(v =>
        !SWITCH_CLEAR_NAMES.has(v.name) &&
        !SWITCH_CLEAR_PREFIXES.some(p => v.name.startsWith(p))
      );
      outgoing.statBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      delete outgoing.lastMoveId;
      delete outgoing.tracedAbilityId;
      delete outgoing.lockedMoveId;
    }

    // 3. Update active slot
    slot.activePokemonIndex = newIndex;
    const incoming = slot.party[slot.activePokemonIndex];

    // 3b. Apply Baton Pass carry-over data if present
    if (slot.batonPassData && incoming) {
      for (const v of slot.batonPassData.volatiles) {
        incoming.volatileStatus.push({ ...v });
      }
      const boosts = slot.batonPassData.statBoosts;
      const statKeys = Object.keys(boosts) as Array<keyof StatBoosts>;
      for (const stat of statKeys) {
        incoming.statBoosts[stat] = Math.max(-6, Math.min(6, incoming.statBoosts[stat] + boosts[stat]));
      }
      delete slot.batonPassData;
    }

    // Mat Block eligibility: mark fresh switch-ins
    if (incoming) {
      incoming.volatileStatus = incoming.volatileStatus.filter(v => v.name !== 'fresh-switcher');
      incoming.volatileStatus.push({ name: 'fresh-switcher', turnsRemaining: 1 });
    }

    // 4. Entry hazards — before onSwitchIn (FR-6)
    if (incoming) {
      const incomingTeamIndex = s.teams.findIndex(t =>
        t.slots.some(sl => sl.slotId === slotId)
      ) as 0 | 1;
      const incomingSide = s.field.sideConditions[incomingTeamIndex]!;
      const incomingTypes = this.resolveEffectiveTypes(incoming);
      const grounded = isGrounded(incoming, incomingTypes, s.field.gravity > 0);
      if (incoming.heldItem !== 'heavy-duty-boots') {
        events.push(...applyEntryHazards(incoming, slotId, incomingSide, incomingTeamIndex, incomingTypes, grounded, this.data));
      }
    }

    // Healing Wish / Lunar Dance: heal incoming Pokemon if flag is set
    if (slot.pendingHeal && incoming) {
      const priorHp = incoming.currentHp;
      incoming.currentHp = incoming.maxHp;
      if (slot.pendingHeal === 'lunardance') {
        for (const m of incoming.moves) m.currentPp = m.maxPp;
      }
      const healAmount = incoming.maxHp - priorHp;
      delete slot.pendingHeal;
      if (healAmount > 0) {
        events.push({ type: 'heal', data: { slotId, amount: healAmount, remainingHp: incoming.maxHp } });
      }
    }

    // 5. onSwitchIn ability hook
    if (incoming) {
      const incomingAbilityHooks = getAbilityHooks(incoming.ability);
      const switchInResult = incomingAbilityHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
      if (switchInResult) {
        this.applySwitchInResult(s, slotId, incoming, switchInResult, events);
      }
    }

    // 5b. onSwitchIn item hook (terrain seeds)
    if (incoming) {
      const itemSwitchHooks = getItemHooks(incoming.heldItem);
      if (itemSwitchHooks.onSwitchIn) {
        const terrain = s.field.terrain?.type ?? null;
        const seedResult = itemSwitchHooks.onSwitchIn({ holder: incoming, state: s, terrain });
        if (seedResult?.statBoostDeltas) {
          events.push(applyStatBoost(incoming, slotId, seedResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
        }
        if (seedResult?.consume && incoming.heldItem) {
          const consumed = incoming.heldItem;
          incoming.lastConsumedItem = consumed;
          delete incoming.heldItem;
          events.push({ type: 'item-consumed', data: { slotId, item: consumed, reason: 'triggered' } });
        }
      }
    }

    // 5c. Booster Energy: activate Quark Drive / Protosynthesis if field condition is absent
    if (incoming?.heldItem === 'booster-energy') {
      const ability = incoming.ability;
      const isQuarkDrive = ability === 'quark-drive';
      const isProtoSynthesis = ability === 'protosynthesis';
      if (isQuarkDrive || isProtoSynthesis) {
        const fieldConditionMet = isQuarkDrive
          ? s.field.terrain?.type === 'electric'
          : s.field.weather?.type === 'sun' || s.field.weather?.type === 'harsh-sun';
        if (!fieldConditionMet) {
          const targetStat = this.boosterEnergyTargetStat(incoming);
          incoming.volatileStatus.push({ name: 'booster-energy-active', variant: targetStat });
          incoming.lastConsumedItem = incoming.heldItem;
          delete incoming.heldItem;
          events.push({ type: 'item-consumed', data: { slotId, item: 'booster-energy', reason: 'triggered' } });
        }
      }
    }

    // 6. Emit pokemon-switched event
    events.push({
      type: 'pokemon-switched',
      data: { slotId, outInstanceId, inInstanceId: targetInstanceId, reason },
    });

    return { newState: s, events };
  }

  private boosterEnergyTargetStat(pokemon: PartyMember): string {
    const candidates: [string, number][] = [
      ['atk', pokemon.stats.atk],
      ['def', pokemon.stats.def],
      ['spa', pokemon.stats.spa],
      ['spd', pokemon.stats.spd],
      ['spe', pokemon.stats.spe],
    ];
    const best = candidates.reduce((a, b) => b[1] > a[1] ? b : a);
    return best[0];
  }

  private applySwitchInResult(
    s: BattleState,
    slotId: string,
    incoming: PartyMember,
    result: SwitchInResult,
    events: TurnResolveEvent[],
  ): void {
    // Apply foe stat deltas (Intimidate)
    if (result.statBoostDeltas) {
      const incomingTeamIndex = s.teams.findIndex(t => t.slots.some(sl => sl.slotId === slotId));
      const foeTeamIndex = incomingTeamIndex === 0 ? 1 : 0;
      const foeTeam = s.teams[foeTeamIndex];
      if (foeTeam) {
        for (const foeSlot of foeTeam.slots) {
          const foePokemon = foeSlot.party[foeSlot.activePokemonIndex];
          if (foePokemon && !foePokemon.fainted) {
            const event = applyStatBoost(
              foePokemon,
              foeSlot.slotId,
              result.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
            );
            events.push(event);
            if (foePokemon.heldItem) {
              const orbResult = getItemHooks(foePokemon.heldItem).onIntimidated?.({ holder: foePokemon, state: s });
              if (orbResult) {
                if (orbResult.statBoostDeltas) {
                  events.push(applyStatBoost(foePokemon, foeSlot.slotId, orbResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
                }
                if (orbResult.consume && foePokemon.heldItem) {
                  const consumed = foePokemon.heldItem;
                  foePokemon.lastConsumedItem = consumed;
                  delete foePokemon.heldItem;
                  events.push({ type: 'item-consumed', data: { slotId: foeSlot.slotId, item: consumed, reason: 'triggered' } });
                }
              }
            }
          }
        }
      }
    }

    // Apply self stat deltas (Download)
    if (result.selfBoostDeltas) {
      const event = applyStatBoost(
        incoming,
        slotId,
        result.selfBoostDeltas as Partial<Record<keyof StatBoosts, number>>,
      );
      events.push(event);
    }

    // Handle Trace — set tracedAbilityId and re-invoke onSwitchIn once (skip if traced is also Trace)
    if (result.traceAbilityId) {
      incoming.tracedAbilityId = result.traceAbilityId;
      if (result.traceAbilityId !== 'trace') {
        const tracedHooks = getAbilityHooks(result.traceAbilityId);
        const tracedResult = tracedHooks.onSwitchIn?.({ user: incoming, state: s, slotId });
        if (tracedResult) {
          this.applySwitchInResult(s, slotId, incoming, tracedResult, events);
        }
      }
    }

    // Handle Screen Cleaner — remove all screens from both sides
    if (result.clearScreens) {
      s.field.sideConditions.forEach((side, sideIdx) => {
        if (side.reflect > 0) {
          side.reflect = 0;
          events.push({ type: 'screen-broken', data: { screen: 'reflect', side: sideIdx } });
        }
        if (side.lightScreen > 0) {
          side.lightScreen = 0;
          events.push({ type: 'screen-broken', data: { screen: 'lightScreen', side: sideIdx } });
        }
        if (side.auroraVeil > 0) {
          side.auroraVeil = 0;
          events.push({ type: 'screen-broken', data: { screen: 'auroraVeil', side: sideIdx } });
        }
      });
    }

    // Handle weather-summoning abilities (Drizzle, Drought, etc.)
    if (result.setWeather) {
      const { type, turnsRemaining, permanent } = result.setWeather;
      // Only overwrite if current weather is not permanent, or new weather is also permanent
      if (!s.field.weather?.permanent || permanent) {
        s.field.weather = { type, turnsRemaining, fromAbility: true, ...(permanent !== undefined ? { permanent } : {}) };
        events.push({ type: 'weather-started', data: { weather: type, turnsRemaining } });
      }
    }
  }

  private endOfTurn(state: BattleState): TurnResult {
    const events: TurnResolveEvent[] = [];
    const s = structuredClone(state);

    for (const team of s.teams) {
      for (const slot of team.slots) {
        // Resolve Wish before per-pokemon EoT effects
        if (slot.wish) {
          slot.wish.turnsRemaining--;
          if (slot.wish.turnsRemaining <= 0) {
            const wishTarget = slot.party[slot.activePokemonIndex];
            if (wishTarget && !wishTarget.fainted && !wishTarget.volatileStatus.some(v => v.name === 'heal-block')) {
              const heal = Math.min(slot.wish.hp, wishTarget.maxHp - wishTarget.currentHp);
              if (heal > 0) {
                wishTarget.currentHp += heal;
                events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: wishTarget.currentHp } });
              }
            }
            delete slot.wish;
          }
        }

        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;

        const eotResult = this.effectEngine.runEndOfTurn(active, slot.slotId, s, this.getAllSlots(s));
        events.push(...eotResult.events);

        const itemHooks = getItemHooks(active.heldItem);
        const hasEmbargo = active.volatileStatus.some(v => v.name === 'embargo');
        if (itemHooks.onEndOfTurn && !hasEmbargo) {
          const eotResult = itemHooks.onEndOfTurn({ holder: active, state: s });
          const { hpDelta, statusToInflict } = eotResult;
          if (hpDelta > 0) {
            const heal = Math.min(hpDelta, active.maxHp - active.currentHp);
            if (heal > 0) {
              active.currentHp += heal;
              events.push({ type: 'heal', data: { slotId: slot.slotId, amount: heal, remainingHp: active.currentHp } });
            }
          } else if (hpDelta < 0) {
            const damage = Math.min(-hpDelta, active.currentHp);
            active.currentHp -= damage;
            events.push({ type: 'damage-dealt', data: { source: active.heldItem, slotId: slot.slotId, damage, remainingHp: active.currentHp } });
            if (active.currentHp <= 0) {
              active.fainted = true;
              active.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: slot.slotId, instanceId: active.instanceId } });
            }
          }
          if (statusToInflict && !active.fainted && !active.status) {
            const activeTypes = this.resolveEffectiveTypes(active);
            const statusEvt = applyStatus(active, slot.slotId, statusToInflict as StatusCondition, activeTypes, undefined, s);
            if (statusEvt) events.push(statusEvt);
          }
        }

        // Terrain seeds: also fire at EoT when terrain is active (handles terrain set mid-battle)
        if (!active.fainted && active.heldItem) {
          const seedEotHooks = getItemHooks(active.heldItem);
          if (seedEotHooks.onSwitchIn && s.field.terrain) {
            const seedResult = seedEotHooks.onSwitchIn({ holder: active, state: s, terrain: s.field.terrain.type });
            if (seedResult?.statBoostDeltas) {
              events.push(applyStatBoost(active, slot.slotId, seedResult.statBoostDeltas as Partial<Record<keyof StatBoosts, number>>));
            }
            if (seedResult?.consume && active.heldItem) {
              const consumed = active.heldItem;
              active.lastConsumedItem = consumed;
              delete active.heldItem;
              events.push({ type: 'item-consumed', data: { slotId: slot.slotId, item: consumed, reason: 'triggered' } });
            }
          }
        }
      }
    }

    // Weather residual damage — sand chips non-Rock/Ground/Steel; snow chips non-Ice
    const activeWeather = s.field.weather?.type;
    if (activeWeather === 'sand' || activeWeather === 'snow') {
      for (const team of s.teams) {
        for (const slot of team.slots) {
          const active = slot.party[slot.activePokemonIndex];
          if (!active || active.fainted) continue;
          const types = this.resolveEffectiveTypes(active);
          const immune =
            (activeWeather === 'sand' && types.some(t => ['Rock', 'Ground', 'Steel'].includes(t))) ||
            (activeWeather === 'snow' && types.includes('Ice')) ||
            getItemHooks(active.heldItem).ignoresWeather === true;
          if (!immune) {
            const chip = Math.floor(active.maxHp / 16);
            const actual = Math.min(chip, active.currentHp);
            active.currentHp -= actual;
            events.push({ type: 'damage-dealt', data: { source: 'weather', slotId: slot.slotId, damage: actual, remainingHp: active.currentHp } });
            if (active.currentHp <= 0) {
              active.fainted = true;
              active.currentHp = 0;
              events.push({ type: 'faint', data: { slotId: slot.slotId, instanceId: active.instanceId } });
            }
          }
        }
      }
    }

    // Grassy Terrain EoT heal — 1/16 maxHp for every grounded Pokémon
    if (s.field.terrain?.type === 'grassy') {
      const gravityActive = s.field.gravity > 0;
      for (const team of s.teams) {
        for (const slot of team.slots) {
          const active = slot.party[slot.activePokemonIndex];
          if (!active || active.fainted) continue;
          const types = this.resolveEffectiveTypes(active);
          if (isGrounded(active, types, gravityActive)) {
            const heal = Math.floor(active.maxHp / 16);
            const actual = Math.min(heal, active.maxHp - active.currentHp);
            if (actual > 0) {
              active.currentHp += actual;
              events.push({ type: 'heal', data: { slotId: slot.slotId, amount: actual, remainingHp: active.currentHp, reason: 'grassy-terrain' } });
            }
          }
        }
      }
    }

    // Field counter decrements + expiry events
    if (s.field.weather) {
      if (!s.field.weather.permanent) {
        s.field.weather.turnsRemaining -= 1;
        if (s.field.weather.turnsRemaining <= 0) {
          events.push({ type: 'weather-ended', data: { weather: s.field.weather.type } });
          delete s.field.weather;
        }
      }
    }
    if (s.field.terrain) {
      s.field.terrain.turnsRemaining -= 1;
      if (s.field.terrain.turnsRemaining <= 0) {
        events.push({ type: 'terrain-ended', data: { terrain: s.field.terrain.type } });
        delete s.field.terrain;
      }
    }
    if (s.field.trickroom > 0) {
      s.field.trickroom -= 1;
      if (s.field.trickroom === 0) {
        events.push({ type: 'trickroom-ended', data: {} });
      }
    }
    if (s.field.gravity > 0) {
      s.field.gravity -= 1;
      if (s.field.gravity === 0) {
        events.push({ type: 'gravity-ended', data: {} });
      }
    }
    if (s.field.wonderroom > 0) {
      s.field.wonderroom -= 1;
      if (s.field.wonderroom === 0) events.push({ type: 'wonderroom-ended', data: {} });
    }
    if (s.field.magicroom > 0) {
      s.field.magicroom -= 1;
      if (s.field.magicroom === 0) events.push({ type: 'magicroom-ended', data: {} });
    }
    if (s.field.mudSport > 0) {
      s.field.mudSport -= 1;
      if (s.field.mudSport === 0) events.push({ type: 'move-note', data: { note: 'mud-sport-ended' } });
    }
    if (s.field.waterSport > 0) {
      s.field.waterSport -= 1;
      if (s.field.waterSport === 0) events.push({ type: 'move-note', data: { note: 'water-sport-ended' } });
    }
    if (s.field.fairyLock > 0) {
      s.field.fairyLock -= 1;
    }
    // Ion Deluge is a single-turn effect; clear it each end-of-turn
    if (s.field.ionDeluge) s.field.ionDeluge = false;

    // Screen turn counter decrements
    for (let i = 0; i < 2; i++) {
      decrementScreens(s.field.sideConditions[i]!, i as 0 | 1, events);
    }

    return { newState: s, events };
  }

  private getSpreadTargets(state: BattleState, attackerSlotId: string, target: string): string[] {
    if (target === 'self') return [attackerSlotId];
    const attackerTeamIndex = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === attackerSlotId));
    const foeTeamIndex = attackerTeamIndex === 0 ? 1 : 0;
    const foeTeam = state.teams[foeTeamIndex];
    if (!foeTeam) return [];
    const allFoes = foeTeam.slots
      .filter((s) => !s.isSpectator && !s.party[s.activePokemonIndex]?.fainted)
      .map((s) => s.slotId);
    if (target === 'randomNormal') {
      if (allFoes.length === 0) return [];
      return [allFoes[Math.floor(this.rng() * allFoes.length)]!];
    }
    return allFoes;
  }

  private checkWinCondition(state: BattleState): 0 | 1 | null {
    for (let i = 0; i < 2; i++) {
      const team = state.teams[i];
      if (!team) continue;
      const allFainted = team.slots.every((slot) =>
        slot.party.every((p) => p.fainted)
      );
      if (allFainted) return i === 0 ? 1 : 0;
    }
    return null;
  }

  private _runSubMove(
    moveId: string,
    attackerSlotId: string,
    defaultTargetSlotId: string | undefined,
    s: BattleState,
    depth: number,
  ): TurnResolveEvent[] {
    if (depth > 1) return [];

    const move = this.data.getMove(moveId);
    if (!move) return [];

    const slot = this.findSlot(s, attackerSlotId);
    if (!slot) return [];
    const attacker = slot.party[slot.activePokemonIndex];
    if (!attacker) return [];

    // Mark attacker to bypass pre-move checks in EffectEngine
    attacker.volatileStatus.push({ name: '__submove-bypass' });

    // Temporarily inject the sub-move at slot 3 (may extend array if < 4 moves)
    const originalMoveCount = attacker.moves.length;
    const savedMove3 = originalMoveCount >= 4 ? { ...attacker.moves[3]! } : null;
    attacker.moves[3] = { moveId, currentPp: 5, maxPp: 5 };

    const action: MoveAction = defaultTargetSlotId
      ? { type: 'move', moveIndex: 3, targetSlotId: defaultTargetSlotId }
      : { type: 'move', moveIndex: 3 };
    const order = defaultTargetSlotId ? [attackerSlotId, defaultTargetSlotId] : [attackerSlotId];

    // executeMove clones `s` internally and works on the clone
    const result = this.executeMove(s, attackerSlotId, action, new Set(), order);

    // Merge the clone's changes back into the live `s`
    // (s is the mutable state ctx.battle in the outer handler — Object.assign replaces its properties)
    Object.assign(s, result.newState);

    // Restore move slot 3 on the merged state (undo the temp patch)
    const mergedSlot = this.findSlot(s, attackerSlotId);
    const mergedAttacker = mergedSlot?.party[mergedSlot.activePokemonIndex];
    if (mergedAttacker) {
      if (savedMove3 !== null) {
        mergedAttacker.moves[3] = savedMove3;
      } else {
        mergedAttacker.moves.length = originalMoveCount;
      }
    }

    return result.events;
  }

  private findSlot(state: BattleState, slotId: string): SlotState | null {
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot;
    }
    return null;
  }

  private getAllSlots(state: BattleState): SlotContext[] {
    return state.teams.flatMap((team, teamIndex) =>
      team.slots.map(slot => ({
        member: slot.party[slot.activePokemonIndex]!,
        slotId: slot.slotId,
        teamIndex,
      }))
    );
  }

  private resolveEffectiveTypes(member: PartyMember): PokemonType[] {
    if (member.hasTerastallized && member.teraType) return [member.teraType];
    if (member.typeOverride) return member.typeOverride;
    const species = this.data.getSpecies(member.speciesId);
    return (species?.types ?? ['Normal']) as PokemonType[];
  }

  private resolveStatusTargets(
    state: BattleState,
    attackerSlotId: string,
    action: MoveAction,
    move: Move,
  ): { targets: PartyMember[]; targetSlotIds: string[] } {
    if (['allySide', 'foeSide', 'all'].includes(move.target)) {
      return { targets: [], targetSlotIds: [] };
    }
    if (['self', 'allyTeam', 'allies', 'adjacentAllyOrSelf', 'adjacentAlly'].includes(move.target)) {
      const slot = this.findSlot(state, attackerSlotId);
      const mon = slot?.party[slot.activePokemonIndex];
      return mon ? { targets: [mon], targetSlotIds: [attackerSlotId] } : { targets: [], targetSlotIds: [] };
    }
    const slotIds = action.targetSlotId
      ? [action.targetSlotId]
      : this.getSpreadTargets(state, attackerSlotId, move.target);
    const targets: PartyMember[] = [];
    const resolvedSlotIds: string[] = [];
    for (const id of slotIds) {
      const slot = this.findSlot(state, id);
      const mon = slot?.party[slot.activePokemonIndex];
      if (mon && !mon.fainted) { targets.push(mon); resolvedSlotIds.push(id); }
    }
    return { targets, targetSlotIds: resolvedSlotIds };
  }

  private rollHitCount(hits: number | [number, number]): number {
    if (typeof hits === 'number') return hits;
    const [min, max] = hits;
    if (min === 2 && max === 5) {
      const r = this.rng();
      if (r < 3 / 8) return 2;
      if (r < 6 / 8) return 3;
      if (r < 7 / 8) return 4;
      return 5;
    }
    return min + Math.floor(this.rng() * (max - min + 1));
  }
}
