import { MoveEffectRegistry } from './MoveEffectRegistry.js';
import type { MoveContext, MoveEffectHandler } from './MoveEffectRegistry.js';
import { isGrounded } from './fieldState.js';
import {
  statModSelf, statModTarget, multiStatModSelf, multiStatModTarget,
  applyStatusTarget, applyVolatileTarget, applyVolatileSelf, healPercent,
  setWeather, setTerrain, setSideCondition, trickRoom, gravity, custom,
  protect, endure, substitute, disable, taunt, encore, torment,
  aquaRing, ingrain, magnetRise, perishSong, destinyBond, roost,
  embargoFactory, healBlockFactory, cureTeamStatus, wish, batonPass, shedTail, partingShot, teleport,
  forceSwitch, itemSwap,
} from './effectFactories.js';
import { clearHazards, clearScreens } from './sideConditions.js';
import { applyStatBoost, applyVolatile, applyStatus } from './effects.js';
import { canApplyStatus } from './status.js';
import { getEffectiveStat } from './stats.js';
import { METRONOME_EXCLUDED, COPYCAT_EXCLUDED, SLEEP_TALK_EXCLUDED } from './metaMoveExclusions.js';
import { executeSubMove } from './subMoveExecutor.js';
import type { TurnResolveEvent, PokemonType } from '@poke-fighter/shared';
import { DataLoader } from '../data/loader.js';

function sunBoostHeal(ctx: MoveContext): { events: TurnResolveEvent[] } {
  const weather = ctx.battle.field.weather?.type;
  const fraction = (weather === 'sun' || weather === 'harsh-sun') ? 2 / 3
    : (!weather) ? 0.5
    : 0.25;
  const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
  if (heal <= 0) return { events: [] };
  ctx.user.currentHp += heal;
  return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
}

function addTypeToTarget(type: PokemonType): MoveEffectHandler {
  return custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const currentTypes = ctx.targetTypes[0] ?? [];
    if (currentTypes.includes(type)) return { events: [] }; // already has this type
    target.typeOverride = [...currentTypes, type];
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'type-changed' } }] };
  });
}

const ALL_TYPES: PokemonType[] = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

export function buildDefaultRegistry(data: DataLoader = new DataLoader()): MoveEffectRegistry {
  const r = new MoveEffectRegistry();

  // ── Status conditions ──────────────────────────────────────────────
  r.register('willowisp',   applyStatusTarget('brn'));
  r.register('thunderwave', applyStatusTarget('par'));
  r.register('glare',       applyStatusTarget('par'));
  r.register('stunspore',   applyStatusTarget('par'));
  r.register('toxic',       applyStatusTarget('tox'));
  r.register('spore',       applyStatusTarget('slp'));
  r.register('sleeppowder', applyStatusTarget('slp'));
  r.register('hypnosis',    applyStatusTarget('slp'));
  r.register('darkvoid',    applyStatusTarget('slp'));
  r.register('sing',         applyStatusTarget('slp'));
  r.register('grasswhistle', applyStatusTarget('slp'));
  r.register('lovelykiss',   applyStatusTarget('slp'));
  r.register('poisongas',    applyStatusTarget('psn'));
  r.register('poisonpowder', applyStatusTarget('psn'));

  // ── Volatiles ──────────────────────────────────────────────────────
  r.register('attract',     applyVolatileTarget('infatuation'));
  r.register('confuseray',  applyVolatileTarget('confusion'));
  r.register('supersonic',  applyVolatileTarget('confusion'));
  r.register('sweetkiss',   applyVolatileTarget('confusion'));
  r.register('leechseed',   applyVolatileTarget('leech-seed'));
  r.register('yawn',        applyVolatileTarget('yawn', 2));
  r.register('focusenergy', applyVolatileSelf('focusenergy'));
  r.register('laserfocus',  applyVolatileSelf('laser-focus'));
  r.register('imprison',    applyVolatileSelf('imprison'));
  r.register('magiccoat',   applyVolatileSelf('magic-coat'));
  r.register('snatch',      applyVolatileSelf('snatch'));
  r.register('aquaring',    aquaRing());
  r.register('ingrain',     ingrain());
  r.register('magnetrise',  magnetRise());
  r.register('perishsong',  perishSong());
  r.register('foresight',   applyVolatileTarget('foresight'));
  r.register('odorsleuth',  applyVolatileTarget('foresight'));
  r.register('miracleeye',  applyVolatileTarget('miracle-eye'));
  r.register('destinybond', destinyBond());
  r.register('nightmare',   applyVolatileTarget('nightmare'));
  r.register('teeterdance', applyVolatileTarget('confusion'));
  r.register('dragoncheer', applyVolatileTarget('dragon-cheer'));
  r.register('curse', custom((ctx) => {
    const isGhost = ctx.userTypes.includes('Ghost');
    if (isGhost) {
      // Ghost variant: pay 50% max HP, apply curse volatile to target
      const target = ctx.targets[0];
      const targetSlotId = ctx.targetSlotIds[0];
      if (!target || !targetSlotId) return { events: [] };
      const cost = Math.floor(ctx.user.maxHp / 2);
      const events: TurnResolveEvent[] = [];
      const actual = Math.min(cost, ctx.user.currentHp);
      ctx.user.currentHp -= actual;
      events.push({ type: 'damage-dealt', data: { source: 'curse', slotId: ctx.userSlotId, damage: actual, remainingHp: ctx.user.currentHp } });
      if (ctx.user.currentHp <= 0) {
        ctx.user.fainted = true;
        ctx.user.currentHp = 0;
        events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
      }
      target.volatileStatus.push({ name: 'curse' });
      events.push({ type: 'volatile-applied', data: { targetSlotId, volatile: 'curse' } });
      return { events };
    } else {
      // Non-Ghost variant: +1 Atk, +1 Def, -1 Spe
      return { events: [applyStatBoost(ctx.user, ctx.userSlotId, { atk: 1, def: 1, spe: -1 })] };
    }
  }));

  // ── Type manipulation ──────────────────────────────────────────────
  r.register('electrify', applyVolatileTarget('electrify'));

  r.register('soak', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.typeOverride = ['Water'];
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'type-changed' } }] };
  }));

  r.register('reflecttype', custom((ctx) => {
    const target = ctx.targets[0];
    if (!target) return { events: [] };
    // Use targetTypes[0] which BattleEngine pre-resolved (respects typeOverride, tera, species)
    const targetTypes = ctx.targetTypes[0];
    if (!targetTypes) return { events: [] };
    ctx.user.typeOverride = [...targetTypes];
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'type-changed' } }] };
  }));

  r.register('trickortreat', addTypeToTarget('Ghost'));
  r.register('forestscurse', addTypeToTarget('Grass'));

  r.register('camouflage', custom((ctx) => {
    const terrain = ctx.battle.field.terrain?.type;
    const typeMap: Record<string, PokemonType> = {
      electric: 'Electric',
      grassy: 'Grass',
      misty: 'Fairy',
      psychic: 'Psychic',
    };
    const newType: PokemonType = (terrain && typeMap[terrain]) ? typeMap[terrain]! : 'Normal';
    ctx.user.typeOverride = [newType];
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'type-changed' } }] };
  }));

  r.register('conversion', custom((ctx) => {
    const firstMoveId = ctx.user.moves[0]?.moveId;
    if (!firstMoveId) return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-moves' } }] };
    const moveData = data.getMove(firstMoveId);
    if (!moveData) return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'unknown-move' } }] };
    ctx.user.typeOverride = [moveData.type as PokemonType];
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'type-changed' } }] };
  }));

  r.register('magicpowder', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.typeOverride = ['Psychic'];
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'type-changed' } }] };
  }));

  r.register('conversion2', custom((ctx) => {
    const target = ctx.targets[0];
    if (!target?.lastMoveId) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-last-move' } }] };
    }
    const lastMove = data.getMove(target.lastMoveId);
    if (!lastMove) return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'unknown-move' } }] };
    const lastMoveType = lastMove.type as PokemonType;

    // Find types that resist the last move type (effectiveness < 1)
    const resistors = ALL_TYPES.filter(t => data.getTypeEffectiveness(lastMoveType, t) < 1);

    if (resistors.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-resistors' } }] };
    }

    // Exclude types the user already has
    const userTypes = ctx.userTypes;
    const eligible = resistors.filter(t => !userTypes.includes(t));

    if (eligible.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-new-resistors' } }] };
    }

    // Pick first eligible type (deterministic)
    ctx.user.typeOverride = [eligible[0]!];
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'type-changed' } }] };
  }));

  // ── Self stat boosts ───────────────────────────────────────────────
  r.register('minimize', custom((ctx) => {
    const events: TurnResolveEvent[] = [applyStatBoost(ctx.user, ctx.userSlotId, { evasion: 2 })];
    if (!ctx.user.volatileStatus.some(v => v.name === 'minimize')) {
      ctx.user.volatileStatus.push({ name: 'minimize' });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'minimize' } });
    }
    return { events };
  }));
  r.register('doubleteam',  statModSelf('evasion', 1));
  r.register('swordsdance', statModSelf('atk', 2));
  r.register('nastyplot',   statModSelf('spa', 2));
  r.register('agility',     statModSelf('spe', 2));
  r.register('barrier',     statModSelf('def', 2));
  r.register('acidarmor',   statModSelf('def', 2));
  r.register('amnesia',     statModSelf('spd', 2));
  r.register('irondefense', statModSelf('def', 2));

  // ── Multi-stat self boosts ─────────────────────────────────────────
  r.register('calmmind',    multiStatModSelf({ spa: 1, spd: 1 }));
  r.register('bulkup',      multiStatModSelf({ atk: 1, def: 1 }));
  r.register('dragondance', multiStatModSelf({ atk: 1, spe: 1 }));
  r.register('quiverdance', multiStatModSelf({ spa: 1, spd: 1, spe: 1 }));
  r.register('shellsmash',  multiStatModSelf({ def: -1, spd: -1, atk: 2, spa: 2, spe: 2 }));
  r.register('coil',        multiStatModSelf({ atk: 1, def: 1, accuracy: 1 }));
  r.register('rockpolish',  statModSelf('spe', 2));
  r.register('tailglow',    statModSelf('spa', 3));
  r.register('growth', custom((ctx) => {
    const weather = ctx.battle.field.weather?.type;
    const stages = (weather === 'sun' || weather === 'harsh-sun') ? 2 : 1;
    return { events: [applyStatBoost(ctx.user, ctx.userSlotId, { atk: stages, spa: stages })] };
  }));
  r.register('workup',      multiStatModSelf({ atk: 1, spa: 1 }));
  r.register('howl',        statModSelf('atk', 1));
  r.register('meditate',    statModSelf('atk', 1));
  r.register('sharpen',     statModSelf('atk', 1));
  r.register('harden',      statModSelf('def', 1));
  r.register('defensecurl', statModSelf('def', 1));
  r.register('withdraw',    statModSelf('def', 1));
  r.register('cottonguard', statModSelf('def', 3));
  r.register('cosmicpower', multiStatModSelf({ def: 1, spd: 1 }));
  r.register('defendorder', multiStatModSelf({ def: 1, spd: 1 }));
  r.register('shiftgear',   multiStatModSelf({ spe: 2, atk: 1 }));
  r.register('geomancy', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const hasCharge = ctx.user.volatileStatus.some(v => v.name === 'geomancy-charge');
    const hasPowerHerb = ctx.user.heldItem === 'power-herb';

    if (!hasCharge && !hasPowerHerb) {
      // Turn 1: start charging
      ctx.user.volatileStatus.push({ name: 'geomancy-charge' });
      events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'geomancy-charge' } });
      return { events };
    }

    // Turn 2 (or Power Herb): remove charge volatile and apply boosts
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'geomancy-charge');

    if (hasPowerHerb) {
      if (ctx.user.heldItem) ctx.user.lastConsumedItem = ctx.user.heldItem;
      delete ctx.user.heldItem;
      events.push({ type: 'item-consumed', data: { slotId: ctx.userSlotId, item: 'power-herb', reason: 'power-herb' } });
    }

    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { spa: 2, spd: 2, spe: 2 }));
    return { events };
  }));
  r.register('victorydance',multiStatModSelf({ atk: 1, def: 1, spe: 1 }));
  r.register('extremeevoboost', multiStatModSelf({ atk: 2, def: 2, spa: 2, spd: 2, spe: 2 }));
  // TODO: autotomize also reduces user weight by 100 kg (min 0.1 kg), but PartyMember
  // does not carry a weightkg field (that lives on PokemonSpecies). Weight reduction
  // is omitted until the battle state is extended to track per-instance weight.
  r.register('autotomize',  statModSelf('spe', 2));
  r.register('honeclaws', multiStatModSelf({ atk: 1, accuracy: 1 }));
  r.register('shelter',   statModSelf('def', 2));

  r.register('filletaway', custom((ctx) => {
    if (ctx.user.currentHp <= 1) {
      return { events: [{ type: 'move-failed', data: { moveId: 'filletaway', reason: 'too-weak' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const cost = Math.floor(ctx.user.currentHp / 2);
    ctx.user.currentHp -= cost;
    events.push({ type: 'damage-dealt', data: { source: 'filletaway', slotId: ctx.userSlotId, damage: cost, remainingHp: ctx.user.currentHp } });
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { atk: 2, spa: 2, spe: 2 }));
    return { events };
  }));

  r.register('clangoroussoul', custom((ctx) => {
    const cost = Math.floor(ctx.user.maxHp / 3);
    if (ctx.user.currentHp <= cost) {
      return { events: [{ type: 'move-failed', data: { moveId: 'clangoroussoul', reason: 'too-weak' } }] };
    }
    ctx.user.currentHp -= cost;
    const events: TurnResolveEvent[] = [];
    events.push({ type: 'damage-dealt', data: { source: 'clangoroussoul', slotId: ctx.userSlotId, damage: cost, remainingHp: ctx.user.currentHp } });
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }));
    return { events };
  }));

  r.register('bellydrum', custom((ctx) => {
    const halfMaxHp = Math.floor(ctx.user.maxHp / 2);
    if (ctx.user.currentHp <= halfMaxHp || ctx.user.statBoosts.atk === 6) {
      return { events: [{ type: 'move-failed', data: { moveId: 'bellydrum', reason: 'cant-use' } }] };
    }
    const events: TurnResolveEvent[] = [];
    ctx.user.currentHp -= halfMaxHp;
    events.push({ type: 'damage-dealt', data: { source: 'bellydrum', slotId: ctx.userSlotId, damage: halfMaxHp, remainingHp: ctx.user.currentHp } });
    const oldAtk = ctx.user.statBoosts.atk;
    ctx.user.statBoosts.atk = 6;
    events.push({ type: 'stat-change', data: { slotId: ctx.userSlotId, changes: { atk: 6 - oldAtk } } });
    return { events };
  }));

  // ── Target stat drops ──────────────────────────────────────────────
  r.register('leer',       statModTarget('def', -1));
  r.register('growl',      statModTarget('atk', -1));
  r.register('screech',    statModTarget('def', -2));
  r.register('tailwhip',    statModTarget('def', -1));
  r.register('metalsound',  statModTarget('spd', -2));
  r.register('decorate',     multiStatModTarget({ atk: 2, spa: 2 }));
  r.register('coaching',     multiStatModTarget({ atk: 1, def: 1 }));
  r.register('aromaticmist', statModTarget('spd', 1));
  r.register('charm',      statModTarget('atk', -2));
  r.register('faketears',  statModTarget('spd', -2));
  r.register('flash',      statModTarget('accuracy', -1));
  r.register('sandattack', statModTarget('accuracy', -1));
  r.register('tickle',       multiStatModTarget({ atk: -1, def: -1 }));
  r.register('scaryface',    statModTarget('spe', -2));
  r.register('tearfullook',  multiStatModTarget({ atk: -1, spa: -1 }));
  r.register('nobleroar',    multiStatModTarget({ atk: -1, spa: -1 }));
  r.register('featherdance', statModTarget('atk', -2));
  r.register('captivate',    statModTarget('spa', -2));
  r.register('babydolleyes', statModTarget('atk', -1));
  r.register('eerieimpulse', statModTarget('spa', -2));
  r.register('stringshot',   statModTarget('spe', -2));
  r.register('cottonspore',  statModTarget('spe', -2));
  r.register('smokescreen',  statModTarget('accuracy', -1));
  r.register('kinesis',      statModTarget('accuracy', -1));
  r.register('sweetscent',   statModTarget('evasion', -2));
  r.register('confide',      statModTarget('spa', -1));
  r.register('playnice',     statModTarget('atk', -1));
  r.register('spicyextract', multiStatModTarget({ spa: 2, def: -2 }));
  r.register('tarshot', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const events: TurnResolveEvent[] = [];
    events.push(applyStatBoost(target, targetSlotId, { spe: -1 }));
    target.volatileStatus.push({ name: 'tar-shot' });
    events.push({ type: 'volatile-applied', data: { targetSlotId, volatile: 'tar-shot' } });
    return { events };
  }));
  r.register('venomdrench', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (target.status !== 'psn' && target.status !== 'tox') {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'not-poisoned' } }] };
    }
    return { events: [applyStatBoost(target, targetSlotId, { atk: -1, spa: -1, spe: -1 })] };
  }));

  r.register('topsyturvy', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };

    const boosts = target.statBoosts;
    const allZero = Object.values(boosts).every(v => v === 0);
    if (allZero) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-stages-to-invert' } }] };
    }

    const deltas: Partial<Record<keyof typeof boosts, number>> = {};
    for (const stat of Object.keys(boosts) as Array<keyof typeof boosts>) {
      if (boosts[stat] !== 0) {
        const oldValue = boosts[stat];
        const newValue = -oldValue;
        const delta = newValue - oldValue;  // new - old = -old - old = -2*old
        deltas[stat] = delta;
      }
    }

    return { events: [applyStatBoost(target, targetSlotId, deltas)] };
  }));

  // ── Protect family ────────────────────────────────────────────────────
  r.register('protect',       protect('protect'));
  r.register('detect',        protect('detect'));
  r.register('kingsshield',   protect('kingsshield'));
  r.register('spikyshield',   protect('spikyshield'));
  r.register('banefulbunker', protect('banefulbunker'));
  r.register('obstruct',      protect('obstruct'));
  r.register('silktrap',      protect('silktrap'));
  r.register('burningbulwark',protect('burningbulwark'));
  r.register('maxguard',      protect('maxguard'));
  r.register('endure',        endure());
  r.register('substitute',    substitute());
  r.register('disable',       disable());
  r.register('spite', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };

    if (!target.lastMoveId) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-last-move' } }] };
    }

    const moveSlot = target.moves.find(m => m.moveId === target.lastMoveId);
    if (!moveSlot || moveSlot.currentPp === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-pp' } }] };
    }

    const oldPp = moveSlot.currentPp;
    moveSlot.currentPp = Math.max(0, moveSlot.currentPp - 4);
    const reduced = oldPp - moveSlot.currentPp;

    return { events: [{ type: 'move-note', data: { slotId: targetSlotId, moveId: target.lastMoveId, note: `pp-reduced-by-${reduced}` } }] };
  }));
  r.register('taunt',         taunt());
  r.register('encore',        encore());
  r.register('torment',       torment());
  r.register('embargo',       embargoFactory());
  r.register('healblock',     healBlockFactory());

  // ── Heals ──────────────────────────────────────────────────────────
  r.register('roost',       roost());
  r.register('recover',     healPercent(0.5));
  r.register('softboiled',  healPercent(0.5));
  r.register('milkdrink',   healPercent(0.5));
  r.register('moonlight',  custom(sunBoostHeal));
  r.register('synthesis',  custom(sunBoostHeal));

  r.register('slackoff',    healPercent(0.5));
  r.register('healorder',   healPercent(0.5));

  r.register('shoreup', custom((ctx) => {
    const weather = ctx.battle.field.weather?.type;
    const fraction = (weather === 'sand') ? 2 / 3
      : (!weather || weather === 'sun') ? 0.5
      : 0.25;
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  }));

  r.register('morningsun', custom(sunBoostHeal));
  r.register('aromatherapy', cureTeamStatus());
  r.register('healbell',     cureTeamStatus());
  r.register('wish',         wish());

  r.register('healingwish', custom((ctx) => {
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    if (!userSlot) return { events: [] };
    ctx.user.currentHp = 0;
    ctx.user.fainted = true;
    userSlot.pendingHeal = 'healingwish';
    return {
      events: [{ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } }],
    };
  }));

  r.register('lunardance', custom((ctx) => {
    const userSlot = ctx.battle.teams[ctx.userTeamIndex]!.slots.find(s => s.slotId === ctx.userSlotId);
    if (!userSlot) return { events: [] };
    ctx.user.currentHp = 0;
    ctx.user.fainted = true;
    userSlot.pendingHeal = 'lunardance';
    return {
      events: [{ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } }],
    };
  }));

  r.register('refresh', custom((ctx) => {
    if (!ctx.user.status) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-status' } }] };
    }
    const old = ctx.user.status;
    delete ctx.user.status;
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
    return { events: [{ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } }] };
  }));

  r.register('purify', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (!target.status) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-status' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const old = target.status;
    delete target.status;
    target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
    events.push({ type: 'status-cured', data: { slotId: targetSlotId, status: old, reason: 'move' } });
    const isHealBlocked = ctx.user.volatileStatus.some(v => v.name === 'heal-block');
    if (!isHealBlocked) {
      const heal = Math.min(Math.floor(ctx.user.maxHp * 0.5), ctx.user.maxHp - ctx.user.currentHp);
      if (heal > 0) {
        ctx.user.currentHp += heal;
        events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
      }
    }
    return { events };
  }));

  r.register('psychoshift', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (!ctx.user.status) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-status' } }] };
    }
    if (target.status) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'target-has-status' } }] };
    }
    const canReceive = canApplyStatus({
      status: ctx.user.status,
      types: ctx.targetTypes[0] ?? [],
      currentStatus: target.status,
      ability: target.ability,
      battle: ctx.battle,
    });
    if (!canReceive) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'immune' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const transferred = ctx.user.status;
    target.status = transferred;
    if (transferred === 'slp') {
      const counter = Math.floor(Math.random() * 3) + 1;
      target.volatileStatus.push({ name: 'sleep', counter });
    }
    delete ctx.user.status;
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
    events.push({ type: 'status-applied', data: { slotId: targetSlotId, status: transferred, pokemonName: target.nickname } });
    events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: transferred, reason: 'move' } });
    return { events };
  }));

  r.register('painsplit', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (ctx.user.currentHp === target.currentHp) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'equal-hp' } }] };
    }
    const newHp = Math.floor((ctx.user.currentHp + target.currentHp) / 2);
    const events: TurnResolveEvent[] = [];

    const oldUserHp = ctx.user.currentHp;
    const oldTargetHp = target.currentHp;
    ctx.user.currentHp = Math.min(newHp, ctx.user.maxHp);
    target.currentHp = Math.min(newHp, target.maxHp);

    const userDelta = ctx.user.currentHp - oldUserHp;
    const targetDelta = target.currentHp - oldTargetHp;

    if (userDelta > 0) {
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: userDelta, remainingHp: ctx.user.currentHp } });
    } else if (userDelta < 0) {
      events.push({ type: 'damage-dealt', data: { source: 'painsplit', slotId: ctx.userSlotId, damage: -userDelta, remainingHp: ctx.user.currentHp } });
    }
    if (targetDelta > 0) {
      events.push({ type: 'heal', data: { slotId: targetSlotId, amount: targetDelta, remainingHp: target.currentHp } });
    } else if (targetDelta < 0) {
      events.push({ type: 'damage-dealt', data: { source: 'painsplit', slotId: targetSlotId, damage: -targetDelta, remainingHp: target.currentHp } });
    }

    return { events };
  }));

  r.register('strengthsap', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (target.statBoosts.atk <= -6) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'atk-min' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const atkValue = getEffectiveStat(target.stats.atk, target.statBoosts.atk, 'atk');
    const heal = Math.min(atkValue, ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    events.push(applyStatBoost(target, targetSlotId, { atk: -1 }));
    return { events };
  }));

  r.register('healpulse', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const heal = Math.min(Math.floor(target.maxHp * 0.5), target.maxHp - target.currentHp);
    if (heal <= 0) return { events: [] };
    target.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: targetSlotId, amount: heal, remainingHp: target.currentHp } }] };
  }));

  r.register('floralhealing', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const isGrassy = ctx.battle.field.terrain?.type === 'grassy';
    const fraction = isGrassy ? 2 / 3 : 0.5;
    const heal = Math.min(Math.floor(target.maxHp * fraction), target.maxHp - target.currentHp);
    if (heal <= 0) return { events: [] };
    target.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: targetSlotId, amount: heal, remainingHp: target.currentHp } }] };
  }));

  r.register('lifedew', custom((ctx) => {
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.25), ctx.user.maxHp - ctx.user.currentHp);
    if (heal <= 0) return { events: [] };
    ctx.user.currentHp += heal;
    return { events: [{ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } }] };
  }));

  r.register('junglehealing', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.25), ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    if (ctx.user.status) {
      const old = ctx.user.status;
      delete ctx.user.status;
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
      events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } });
    }
    return { events };
  }));

  r.register('lunarblessing', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const heal = Math.min(Math.floor(ctx.user.maxHp * 0.25), ctx.user.maxHp - ctx.user.currentHp);
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    if (ctx.user.status) {
      const old = ctx.user.status;
      delete ctx.user.status;
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
      events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } });
    }
    return { events };
  }));

  r.register('takeheart', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    if (ctx.user.status) {
      const old = ctx.user.status;
      delete ctx.user.status;
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
      events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } });
    }
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { spa: 1, spd: 1 }));
    return { events };
  }));

  r.register('acupressure', custom((ctx) => {
    const eligible = (['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const)
      .filter(stat => ctx.user.statBoosts[stat] < 6);
    if (eligible.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: 'acupressure', reason: 'all-maxed' } }] };
    }
    const idx = Math.floor(ctx.rng() * eligible.length);
    const chosen = eligible[idx]!;
    return { events: [applyStatBoost(ctx.user, ctx.userSlotId, { [chosen]: 2 })] };
  }));

  r.register('stockpile', custom((ctx) => {
    const existing = ctx.user.volatileStatus.find(v => v.name === 'stockpile');
    if (existing && (existing.counter ?? 0) >= 3) {
      return { events: [{ type: 'move-failed', data: { moveId: 'stockpile', reason: 'max-stockpile' } }] };
    }
    const events: TurnResolveEvent[] = [];
    if (existing) {
      existing.counter = (existing.counter ?? 0) + 1;
    } else {
      ctx.user.volatileStatus.push({ name: 'stockpile', counter: 1 });
    }
    const newCounter = existing?.counter ?? 1;
    events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'stockpile', counter: newCounter } });
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { def: 1, spd: 1 }));
    return { events };
  }));

  r.register('swallow', custom((ctx) => {
    const stockpile = ctx.user.volatileStatus.find(v => v.name === 'stockpile');
    if (!stockpile) {
      return { events: [{ type: 'move-failed', data: { moveId: 'swallow', reason: 'no-stockpile' } }] };
    }
    if (ctx.user.volatileStatus.some(v => v.name === 'heal-block')) {
      return { events: [{ type: 'move-failed', data: { moveId: 'swallow', reason: 'heal-blocked' } }] };
    }
    const count = stockpile.counter ?? 1;
    const fraction = count === 1 ? 1 / 3 : count === 2 ? 2 / 3 : 1;
    const heal = Math.min(Math.floor(ctx.user.maxHp * fraction), ctx.user.maxHp - ctx.user.currentHp);
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'stockpile');
    const events: TurnResolveEvent[] = [];
    if (heal > 0) {
      ctx.user.currentHp += heal;
      events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: heal, remainingHp: ctx.user.currentHp } });
    }
    return { events };
  }));

  r.register('rest', custom((ctx) => {
    if (ctx.user.status === 'slp') {
      return { events: [{ type: 'move-failed', data: { moveId: 'rest', reason: 'already-asleep' } }] };
    }
    if (ctx.user.currentHp >= ctx.user.maxHp) {
      return { events: [{ type: 'move-failed', data: { moveId: 'rest', reason: 'hp-full' } }] };
    }
    const events: TurnResolveEvent[] = [];
    if (ctx.user.status) {
      const old = ctx.user.status;
      delete ctx.user.status;
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'toxic' && v.name !== 'sleep');
      events.push({ type: 'status-cured', data: { slotId: ctx.userSlotId, status: old, reason: 'move' } });
    }
    ctx.user.status = 'slp';
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'sleep');
    ctx.user.volatileStatus.push({ name: 'sleep', counter: 2 });
    events.push({ type: 'status-applied', data: { slotId: ctx.userSlotId, status: 'slp', pokemonName: ctx.user.nickname } });
    const healAmount = ctx.user.maxHp - ctx.user.currentHp;
    ctx.user.currentHp = ctx.user.maxHp;
    events.push({ type: 'heal', data: { slotId: ctx.userSlotId, amount: healAmount, remainingHp: ctx.user.maxHp } });
    return { events };
  }));

  // ── Weather ────────────────────────────────────────────────────────
  r.register('sunnyday',   setWeather('sun',  5));
  r.register('raindance',  setWeather('rain', 5));
  r.register('sandstorm',  setWeather('sand', 5));
  r.register('hail',       setWeather('snow', 5));
  r.register('snowscape',  setWeather('snow', 5));

  // ── Terrain ────────────────────────────────────────────────────────
  r.register('electricterrain', setTerrain('electric'));
  r.register('grassyterrain',   setTerrain('grassy'));
  r.register('mistyterrain',    setTerrain('misty'));
  r.register('psychicterrain',  setTerrain('psychic'));

  // ── Side conditions ────────────────────────────────────────────────
  r.register('reflect',     setSideCondition('reflect',     5,    'ally', { failIfActive: true }));
  r.register('lightscreen', setSideCondition('lightScreen', 5,    'ally', { failIfActive: true }));
  r.register('auroraveil',  setSideCondition('auroraVeil',  5,    'ally', { failIfActive: true, weatherRequired: ['snow'] }));
  r.register('tailwind',    setSideCondition('tailwind',    4,    'ally', { failIfActive: true }));
  r.register('safeguard',   setSideCondition('safeguard',   5,    'ally', { failIfActive: true }));
  r.register('mist',        setSideCondition('mist',        5,    'ally', { failIfActive: true }));
  r.register('luckychant',  setSideCondition('luckychant',  5,    'ally', { failIfActive: true }));
  r.register('stealthrock', setSideCondition('stealthRock', true, 'foe', { failIfActive: true }));
  r.register('stickyweb',   setSideCondition('stickyWeb',   true, 'foe', { failIfActive: true }));

  r.register('spikes', custom((ctx) => {
    const foeIdx = (1 - ctx.userTeamIndex) as 0 | 1;
    const side = ctx.battle.field.sideConditions[foeIdx]!;
    if (side.spikes >= 3) return { events: [{ type: 'move-failed', data: { moveId: 'spikes', reason: 'max-layers' } }] };
    side.spikes = (side.spikes + 1) as 0 | 1 | 2 | 3;
    return { events: [{ type: 'side-condition-set', data: { side: foeIdx, condition: 'spikes', value: side.spikes } }] };
  }));

  r.register('toxicspikes', custom((ctx) => {
    const foeIdx = (1 - ctx.userTeamIndex) as 0 | 1;
    const side = ctx.battle.field.sideConditions[foeIdx]!;
    if (side.toxicSpikes >= 2) return { events: [{ type: 'move-failed', data: { moveId: 'toxicspikes', reason: 'max-layers' } }] };
    side.toxicSpikes = (side.toxicSpikes + 1) as 0 | 1 | 2;
    return { events: [{ type: 'side-condition-set', data: { side: foeIdx, condition: 'toxicspikes', value: side.toxicSpikes } }] };
  }));

  // ── Field toggles ──────────────────────────────────────────────────
  r.register('trickroom', trickRoom());
  r.register('gravity',   gravity());

  // ── Field-state toggles ────────────────────────────────────────────
  r.register('wonderroom', custom((ctx) => {
    if (ctx.battle.field.wonderroom > 0) {
      ctx.battle.field.wonderroom = 0;
      return { events: [{ type: 'wonderroom-ended', data: {} }] };
    }
    ctx.battle.field.wonderroom = 5;
    return { events: [{ type: 'wonderroom-started', data: { turnsRemaining: 5 } }] };
  }));

  r.register('magicroom', custom((ctx) => {
    if (ctx.battle.field.magicroom > 0) {
      ctx.battle.field.magicroom = 0;
      return { events: [{ type: 'magicroom-ended', data: {} }] };
    }
    ctx.battle.field.magicroom = 5;
    return { events: [{ type: 'magicroom-started', data: { turnsRemaining: 5 } }] };
  }));

  r.register('mudsport', custom((ctx) => {
    if (ctx.battle.field.mudSport > 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'already-active' } }] };
    }
    ctx.battle.field.mudSport = 5;
    return { events: [{ type: 'move-note', data: { note: 'mud-sport-started', turnsRemaining: 5 } }] };
  }));

  r.register('watersport', custom((ctx) => {
    if (ctx.battle.field.waterSport > 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'already-active' } }] };
    }
    ctx.battle.field.waterSport = 5;
    return { events: [{ type: 'move-note', data: { note: 'water-sport-started', turnsRemaining: 5 } }] };
  }));

  r.register('iondeluge', custom((ctx) => {
    ctx.battle.field.ionDeluge = true;
    return { events: [{ type: 'iondeluge-started', data: {} }] };
  }));

  r.register('fairylock', custom((ctx) => {
    ctx.battle.field.fairyLock = 2;
    return { events: [{ type: 'fairylock-started', data: { turnsRemaining: 2 } }] };
  }));

  // ── Defog ──────────────────────────────────────────────────────────
  r.register('defog', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const userIdx = ctx.userTeamIndex as 0 | 1;
    const foeIdx = (1 - ctx.userTeamIndex) as 0 | 1;

    // −1 evasion on target
    for (let i = 0; i < ctx.targets.length; i++) {
      events.push(applyStatBoost(ctx.targets[i]!, ctx.targetSlotIds[i]!, { evasion: -1 }));
    }

    // Clear hazards from both sides
    events.push(...clearHazards(ctx.battle.field.sideConditions[userIdx]!, userIdx));
    events.push(...clearHazards(ctx.battle.field.sideConditions[foeIdx]!, foeIdx));

    // Clear screens from target's (foe's) side only
    events.push(...clearScreens(ctx.battle.field.sideConditions[foeIdx]!, foeIdx));

    // Clear active terrain
    if (ctx.battle.field.terrain) {
      const terrainType = ctx.battle.field.terrain.type;
      delete ctx.battle.field.terrain;
      events.push({ type: 'terrain-ended', data: { terrain: terrainType } });
    }

    return { events };
  }));

  // ── Court Change ───────────────────────────────────────────────────
  r.register('courtchange', custom((ctx) => {
    const [side0, side1] = ctx.battle.field.sideConditions;
    ctx.battle.field.sideConditions = [side1!, side0!];
    return { events: [{ type: 'court-change', data: {} }] };
  }));

  // ── Trapping moves ─────────────────────────────────────────────────
  r.register('meanlook',  applyVolatileTarget('trapped'));
  r.register('block',     applyVolatileTarget('trapped'));
  r.register('spiderweb', applyVolatileTarget('trapped'));

  r.register('octolock', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const events: TurnResolveEvent[] = [];
    const trappedEvent = applyVolatile(target, targetSlotId, ctx.userSlotId, 'trapped');
    if (trappedEvent) events.push(trappedEvent);
    const octolockEvent = applyVolatile(target, targetSlotId, ctx.userSlotId, 'octolock');
    if (octolockEvent) events.push(octolockEvent);
    return { events };
  }));

  r.register('noretreat', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    // Cannot use No Retreat if already trapped
    if (ctx.user.volatileStatus.some(v => v.name === 'no-retreat')) {
      return { events: [{ type: 'move-failed', data: { moveId: 'noretreat', reason: 'already-used' } }] };
    }
    ctx.user.volatileStatus.push({ name: 'no-retreat' });
    events.push({ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'no-retreat' } });
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }));
    return { events };
  }));

  r.register('psychup', custom((ctx) => {
    const target = ctx.targets[0];
    if (!target) {
      return { events: [{ type: 'move-failed', data: { moveId: 'psychup', reason: 'no-target' } }] };
    }

    ctx.user.statBoosts = { ...target.statBoosts };

    return {
      events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'psych-up' } }],
    };
  }));

  // ── Pivot moves ────────────────────────────────────────────────────
  r.register('batonpass',    batonPass());
  r.register('shedtail',    shedTail());
  r.register('partingshot', partingShot());
  r.register('teleport',    teleport());

  // ── Phazing moves ──────────────────────────────────────────────────
  r.register('roar',        forceSwitch());
  r.register('whirlwind',   forceSwitch());

  // ── Item manipulation ──────────────────────────────────────────────
  r.register('trick',      itemSwap());
  r.register('switcheroo', itemSwap());
  r.register('bestow', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };

    if (!ctx.user.heldItem) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-item' } }] };
    }
    if (target.heldItem) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'target-has-item' } }] };
    }

    const item = ctx.user.heldItem;
    target.heldItem = item;
    delete ctx.user.heldItem;

    return {
      events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'item-bestowed' } }],
    };
  }));

  r.register('recycle', custom((ctx) => {
    if (!ctx.user.lastConsumedItem) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-consumed-item' } }] };
    }
    if (ctx.user.heldItem) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'already-holding-item' } }] };
    }
    const item = ctx.user.lastConsumedItem;
    ctx.user.heldItem = item;
    delete ctx.user.lastConsumedItem;
    return {
      events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'item-recycled' } }],
    };
  }));

  // ── Ability manipulation ───────────────────────────────────────────
  r.register('gastroacid', applyVolatileTarget('gastro-acid'));
  r.register('skillswap', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };

    const userAbility = ctx.user.ability;
    const targetAbility = target.ability;
    ctx.user.ability = targetAbility;
    target.ability = userAbility;
    // Clear tracedAbilityId since we're directly swapping the base ability
    delete ctx.user.tracedAbilityId;
    delete target.tracedAbilityId;

    return {
      events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'ability-swapped' } }],
    };
  }));
  r.register('roleplay', custom((ctx) => {
    const target = ctx.targets[0];
    if (!target) return { events: [] };
    ctx.user.ability = target.ability;
    delete ctx.user.tracedAbilityId;
    return {
      events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'ability-copied' } }],
    };
  }));
  r.register('entrainment', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.ability = ctx.user.ability;
    delete target.tracedAbilityId;
    return { events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'ability-entrained' } }] };
  }));
  r.register('simplebeam', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.ability = 'simple';
    delete target.tracedAbilityId;
    return { events: [{ type: 'move-note', data: { slotId: targetSlotId, note: 'ability-changed-simple' } }] };
  }));
  r.register('worryseed', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.ability = 'insomnia';
    delete target.tracedAbilityId;
    return { events: [{ type: 'move-note', data: { slotId: targetSlotId, note: 'ability-changed-insomnia' } }] };
  }));
  r.register('doodle', custom((ctx) => {
    return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'not-implemented' } }] };
  }));

  // ── Priority manipulation (stubbed) ────────────────────────────────
  // Me First requires knowing opponent's pending action before execution,
  // which is not accessible in the current handler architecture.
  r.register('mefirst', (ctx) => ({
    events: [{ type: 'move-failed', data: { moveId: 'mefirst', reason: 'not-implemented' } }],
  }));

  // ── Meta moves ────────────────────────────────────────────────────
  r.register('copycat', (ctx) => {
    const lastMove = ctx.battle.lastUsedMoveId;
    if (!lastMove) {
      return { events: [{ type: 'move-failed', data: { moveId: 'copycat', reason: 'no-last-move' } }] };
    }
    if (COPYCAT_EXCLUDED.has(lastMove)) {
      return { events: [{ type: 'move-failed', data: { moveId: 'copycat', reason: 'excluded' } }] };
    }
    const events = executeSubMove(lastMove, ctx);
    return { events };
  });

  r.register('metronome', (ctx) => {
    const candidates = data.getAllMoves().filter(m => !METRONOME_EXCLUDED.has(m.id));
    if (candidates.length === 0) return { events: [{ type: 'move-failed', data: { moveId: 'metronome', reason: 'no-candidates' } }] };
    const pickedMove = candidates[Math.floor(ctx.rng() * candidates.length)]!;
    const events = executeSubMove(pickedMove.id, ctx);
    return { events };
  });

  r.register('mirrormove', (ctx) => {
    const target = ctx.targets[0];
    if (!target) return { events: [{ type: 'move-failed', data: { moveId: 'mirrormove', reason: 'no-target' } }] };

    const targetLastMove = target.lastMoveId;
    if (!targetLastMove) {
      return { events: [{ type: 'move-failed', data: { moveId: 'mirrormove', reason: 'no-last-move' } }] };
    }
    if (COPYCAT_EXCLUDED.has(targetLastMove)) {
      return { events: [{ type: 'move-failed', data: { moveId: 'mirrormove', reason: 'excluded' } }] };
    }

    const events = executeSubMove(targetLastMove, ctx);
    return { events };
  });

  r.register('sleeptalk', (ctx) => {
    if (ctx.user.status !== 'slp') {
      return { events: [{ type: 'move-failed', data: { moveId: 'sleeptalk', reason: 'not-asleep' } }] };
    }

    const eligible = ctx.user.moves.filter(slot =>
      !SLEEP_TALK_EXCLUDED.has(slot.moveId)
    );

    if (eligible.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: 'sleeptalk', reason: 'no-eligible-moves' } }] };
    }

    const picked = eligible[Math.floor(ctx.rng() * eligible.length)]!;
    const events = executeSubMove(picked.moveId, ctx);
    return { events };
  });

  r.register('assist', (ctx) => {
    const eligible: string[] = [];
    const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
    for (const slot of userTeam.slots) {
      for (let i = 0; i < slot.party.length; i++) {
        if (slot.slotId === ctx.userSlotId && i === slot.activePokemonIndex) continue;
        const member = slot.party[i]!;
        if (member.fainted) continue;
        for (const moveSlot of member.moves) {
          if (!COPYCAT_EXCLUDED.has(moveSlot.moveId)) {
            eligible.push(moveSlot.moveId);
          }
        }
      }
    }

    if (eligible.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: 'assist', reason: 'no-eligible-moves' } }] };
    }

    const picked = eligible[Math.floor(ctx.rng() * eligible.length)]!;
    const events = executeSubMove(picked, ctx);
    return { events };
  });

  r.register('instruct', (ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) {
      return { events: [{ type: 'move-failed', data: { moveId: 'instruct', reason: 'no-target' } }] };
    }

    const lastMove = target.lastMoveId;
    if (!lastMove) {
      return { events: [{ type: 'move-failed', data: { moveId: 'instruct', reason: 'no-last-move' } }] };
    }
    if (COPYCAT_EXCLUDED.has(lastMove)) {
      return { events: [{ type: 'move-failed', data: { moveId: 'instruct', reason: 'excluded' } }] };
    }

    // Check PP > 0 in target's actual move slots
    const targetMoveSlot = target.moves.find(m => m.moveId === lastMove);
    if (!targetMoveSlot || targetMoveSlot.currentPp <= 0) {
      return { events: [{ type: 'move-failed', data: { moveId: 'instruct', reason: 'no-pp' } }] };
    }

    // Execute with target as attacker, user as target
    const events = executeSubMove(lastMove, ctx, 0, targetSlotId, ctx.userSlotId);
    return { events };
  });

  r.register('transform', (ctx) => {
    const target = ctx.targets[0];
    if (!target) {
      return { events: [{ type: 'move-failed', data: { moveId: 'transform', reason: 'no-target' } }] };
    }

    // Copy stats (not HP)
    ctx.user.stats = { ...target.stats, hp: ctx.user.stats.hp };

    // Copy stat boosts
    ctx.user.statBoosts = { ...target.statBoosts };

    // Copy ability
    ctx.user.ability = target.ability;

    // Copy effective types (using pre-resolved ctx.targetTypes[0])
    if (ctx.targetTypes[0]) {
      ctx.user.typeOverride = [...ctx.targetTypes[0]];
    } else {
      delete ctx.user.typeOverride;
    }

    // Copy moves with PP capped at 5
    ctx.user.moves = target.moves.map(slot => ({
      moveId: slot.moveId,
      currentPp: Math.min(slot.currentPp, 5),
      maxPp: 5,
    })) as [any, any, any, any]; // TypeScript tuple assertion

    // Mark as transformed
    if (!ctx.user.volatileStatus.some(v => v.name === 'transformed')) {
      ctx.user.volatileStatus.push({ name: 'transformed' });
    }

    return {
      events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'transformed' } }],
    };
  });

  r.register('mimic', (ctx) => {
    const target = ctx.targets[0];
    if (!target?.lastMoveId) {
      return { events: [{ type: 'move-failed', data: { moveId: 'mimic', reason: 'no-last-move' } }] };
    }

    // Find the Mimic slot
    const mimicSlotIndex = ctx.user.moves.findIndex(m => m.moveId === 'mimic');
    if (mimicSlotIndex === -1) {
      return { events: [{ type: 'move-failed', data: { moveId: 'mimic', reason: 'slot-not-found' } }] };
    }

    // Replace with target's last move (pp=5, temporary)
    ctx.user.moves[mimicSlotIndex] = {
      moveId: target.lastMoveId,
      currentPp: 5,
      maxPp: 5,
    };

    return {
      events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'mimic', moveId: target.lastMoveId } }],
    };
  });

  // ── Stat stage swaps ──────────────────────────────────────────────
  r.register('guardswap', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const events: TurnResolveEvent[] = [];
    const uDef = ctx.user.statBoosts.def, uSpd = ctx.user.statBoosts.spd;
    const tDef = target.statBoosts.def,   tSpd = target.statBoosts.spd;
    ctx.user.statBoosts.def = tDef; ctx.user.statBoosts.spd = tSpd;
    target.statBoosts.def = uDef;  target.statBoosts.spd = uSpd;
    const uChg: Record<string, number> = {};
    if (tDef !== uDef) uChg['def'] = tDef - uDef;
    if (tSpd !== uSpd) uChg['spd'] = tSpd - uSpd;
    if (Object.keys(uChg).length) events.push({ type: 'stat-change', data: { slotId: ctx.userSlotId, changes: uChg } });
    const tChg: Record<string, number> = {};
    if (uDef !== tDef) tChg['def'] = uDef - tDef;
    if (uSpd !== tSpd) tChg['spd'] = uSpd - tSpd;
    if (Object.keys(tChg).length) events.push({ type: 'stat-change', data: { slotId: targetSlotId, changes: tChg } });
    return { events };
  }));

  r.register('powerswap', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const events: TurnResolveEvent[] = [];
    const uAtk = ctx.user.statBoosts.atk, uSpa = ctx.user.statBoosts.spa;
    const tAtk = target.statBoosts.atk,   tSpa = target.statBoosts.spa;
    ctx.user.statBoosts.atk = tAtk; ctx.user.statBoosts.spa = tSpa;
    target.statBoosts.atk = uAtk;  target.statBoosts.spa = uSpa;
    const uChg: Record<string, number> = {};
    if (tAtk !== uAtk) uChg['atk'] = tAtk - uAtk;
    if (tSpa !== uSpa) uChg['spa'] = tSpa - uSpa;
    if (Object.keys(uChg).length) events.push({ type: 'stat-change', data: { slotId: ctx.userSlotId, changes: uChg } });
    const tChg: Record<string, number> = {};
    if (uAtk !== tAtk) tChg['atk'] = uAtk - tAtk;
    if (uSpa !== tSpa) tChg['spa'] = uSpa - tSpa;
    if (Object.keys(tChg).length) events.push({ type: 'stat-change', data: { slotId: targetSlotId, changes: tChg } });
    return { events };
  }));

  r.register('heartswap', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const events: TurnResolveEvent[] = [];
    const stats = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const;
    const uOld = { ...ctx.user.statBoosts };
    const tOld = { ...target.statBoosts };
    for (const s of stats) {
      ctx.user.statBoosts[s] = tOld[s];
      target.statBoosts[s] = uOld[s];
    }
    const uChg: Record<string, number> = {};
    const tChg: Record<string, number> = {};
    for (const s of stats) {
      if (tOld[s] !== uOld[s]) { uChg[s] = tOld[s] - uOld[s]; tChg[s] = uOld[s] - tOld[s]; }
    }
    if (Object.keys(uChg).length) events.push({ type: 'stat-change', data: { slotId: ctx.userSlotId, changes: uChg } });
    if (Object.keys(tChg).length) events.push({ type: 'stat-change', data: { slotId: targetSlotId, changes: tChg } });
    return { events };
  }));

  r.register('speedswap', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const events: TurnResolveEvent[] = [];
    const uSpe = ctx.user.statBoosts.spe, tSpe = target.statBoosts.spe;
    ctx.user.statBoosts.spe = tSpe; target.statBoosts.spe = uSpe;
    if (tSpe !== uSpe) events.push({ type: 'stat-change', data: { slotId: ctx.userSlotId, changes: { spe: tSpe - uSpe } } });
    if (uSpe !== tSpe) events.push({ type: 'stat-change', data: { slotId: targetSlotId, changes: { spe: uSpe - tSpe } } });
    return { events };
  }));

  // ── Stat base-value splits ─────────────────────────────────────────
  r.register('guardsplit', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const newDef = Math.floor((ctx.user.stats.def + target.stats.def) / 2);
    const newSpd = Math.floor((ctx.user.stats.spd + target.stats.spd) / 2);
    ctx.user.stats.def = newDef; ctx.user.stats.spd = newSpd;
    target.stats.def = newDef;  target.stats.spd = newSpd;
    return { events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'guard-split' } }] };
  }));

  r.register('powersplit', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const newAtk = Math.floor((ctx.user.stats.atk + target.stats.atk) / 2);
    const newSpa = Math.floor((ctx.user.stats.spa + target.stats.spa) / 2);
    ctx.user.stats.atk = newAtk; ctx.user.stats.spa = newSpa;
    target.stats.atk = newAtk;  target.stats.spa = newSpa;
    return { events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'power-split' } }] };
  }));

  // ── Stat value swap (self) ─────────────────────────────────────────
  r.register('powertrick', custom((ctx) => {
    const hasTrick = ctx.user.volatileStatus.some(v => v.name === 'power-trick');
    const oldAtk = ctx.user.stats.atk;
    ctx.user.stats.atk = ctx.user.stats.def;
    ctx.user.stats.def = oldAtk;
    if (hasTrick) {
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'power-trick');
      return { events: [{ type: 'volatile-cured', data: { slotId: ctx.userSlotId, volatile: 'power-trick' } }] };
    }
    ctx.user.volatileStatus.push({ name: 'power-trick' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'power-trick' } }] };
  }));

  r.register('powershift', custom((ctx) => {
    const oldAtk = ctx.user.stats.atk;
    ctx.user.stats.atk = ctx.user.stats.def;
    ctx.user.stats.def = oldAtk;
    return { events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'power-shift' } }] };
  }));

  // ── Haze ──────────────────────────────────────────────────────────
  r.register('haze', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const statKeys = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const;
    for (const team of ctx.battle.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        const boosts = active.statBoosts;
        const hasNonZero = statKeys.some(k => boosts[k] !== 0);
        if (!hasNonZero) continue;
        const changes: Record<string, number> = {};
        for (const k of statKeys) {
          if (boosts[k] !== 0) { changes[k] = -boosts[k]; boosts[k] = 0; }
        }
        events.push({ type: 'stat-change', data: { slotId: slot.slotId, changes } });
      }
    }
    return { events };
  }));

  // ── No-op flavor moves ─────────────────────────────────────────────
  r.register('celebrate', custom(() => ({ events: [] })));
  r.register('splash',    custom(() => ({ events: [] })));
  r.register('happyhour', custom(() => ({ events: [] })));
  r.register('holdhands', custom(() => ({ events: [] })));

  r.register('sketch', (ctx) => {
    const target = ctx.targets[0];
    if (!target?.lastMoveId) {
      return { events: [{ type: 'move-failed', data: { moveId: 'sketch', reason: 'no-last-move' } }] };
    }

    // Find the Sketch slot
    const sketchSlotIndex = ctx.user.moves.findIndex(m => m.moveId === 'sketch');
    if (sketchSlotIndex === -1) {
      return { events: [{ type: 'move-failed', data: { moveId: 'sketch', reason: 'slot-not-found' } }] };
    }

    // Permanently replace (use pp=5)
    ctx.user.moves[sketchSlotIndex] = {
      moveId: target.lastMoveId,
      currentPp: 5,
      maxPp: 5,
    };

    return {
      events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'sketch', moveId: target.lastMoveId } }],
    };
  });

  // ── Status-effect combos ───────────────────────────────────────────
  r.register('swagger', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const targetTeamIdx = (1 - ctx.userTeamIndex) as 0 | 1;
    if ((ctx.battle.field.sideConditions[targetTeamIdx]?.safeguard ?? 0) > 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'safeguard' } }] };
    }
    const events: TurnResolveEvent[] = [];
    events.push(applyStatBoost(target, targetSlotId, { atk: 2 }));
    const confuseEvent = applyVolatile(target, targetSlotId, ctx.userSlotId, 'confusion');
    if (confuseEvent) events.push(confuseEvent);
    return { events };
  }));

  r.register('flatter', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const targetTeamIdx = (1 - ctx.userTeamIndex) as 0 | 1;
    if ((ctx.battle.field.sideConditions[targetTeamIdx]?.safeguard ?? 0) > 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'safeguard' } }] };
    }
    const events: TurnResolveEvent[] = [];
    events.push(applyStatBoost(target, targetSlotId, { spa: 1 }));
    const confuseEvent = applyVolatile(target, targetSlotId, ctx.userSlotId, 'confusion');
    if (confuseEvent) events.push(confuseEvent);
    return { events };
  }));

  r.register('toxicthread', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const targetTeamIdx = (1 - ctx.userTeamIndex) as 0 | 1;
    if ((ctx.battle.field.sideConditions[targetTeamIdx]?.safeguard ?? 0) > 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'safeguard' } }] };
    }
    const events: TurnResolveEvent[] = [];
    const statusEvent = applyStatus(target, targetSlotId, 'psn', ctx.targetTypes[0] ?? [], undefined, ctx.battle);
    if (statusEvent) events.push(statusEvent);
    events.push(applyStatBoost(target, targetSlotId, { spe: -1 }));
    return { events };
  }));

  r.register('memento', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    const canDrop = target.statBoosts.atk > -6 || target.statBoosts.spa > -6;
    if (!canDrop) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'stat-cannot-drop' } }] };
    }
    const events: TurnResolveEvent[] = [];
    events.push(applyStatBoost(target, targetSlotId, { atk: -2, spa: -2 }));
    ctx.user.currentHp = 0;
    ctx.user.fainted = true;
    events.push({ type: 'faint', data: { slotId: ctx.userSlotId, instanceId: ctx.user.instanceId } });
    return { events };
  }));

  r.register('revivalblessing', custom((ctx) => {
    const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
    let faintedMember: { p: import('@poke-fighter/shared').PartyMember; slotId: string } | undefined;
    let found = false;
    for (const slot of userTeam.slots) {
      if (found) break;
      for (let i = 0; i < slot.party.length; i++) {
        const p = slot.party[i]!;
        if (slot.slotId === ctx.userSlotId && i === slot.activePokemonIndex) continue;
        if (p.fainted) {
          faintedMember = { p, slotId: slot.slotId };
          found = true;
          break;
        }
      }
    }
    if (!faintedMember) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-fainted-ally' } }] };
    }
    const { p, slotId } = faintedMember;
    p.fainted = false;
    p.currentHp = Math.floor(p.maxHp / 2);
    delete p.status;
    p.volatileStatus = [];
    return {
      events: [{ type: 'heal', data: { slotId, amount: p.currentHp, remainingHp: p.currentHp } }],
    };
  }));

  r.register('stuffcheeks', custom((ctx) => {
    const item = ctx.user.heldItem;
    if (!item || !item.endsWith('-berry')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-berry' } }] };
    }
    const events: TurnResolveEvent[] = [];
    ctx.user.lastConsumedItem = item;
    delete ctx.user.heldItem;
    events.push({ type: 'item-consumed', data: { slotId: ctx.userSlotId, item, reason: 'stuff-cheeks' } });
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { def: 2 }));
    return { events };
  }));

  r.register('corrosivegas', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    for (let i = 0; i < ctx.targets.length; i++) {
      const target = ctx.targets[i]!;
      const targetSlotId = ctx.targetSlotIds[i]!;
      if (!target.heldItem) continue;
      const item = target.heldItem;
      delete target.heldItem;
      events.push({ type: 'item-consumed', data: { slotId: targetSlotId, item, reason: 'corrosive-gas' } });
    }
    return { events };
  }));

  r.register('chillyreception', custom((ctx) => {
    ctx.battle.field.weather = { type: 'snow', turnsRemaining: 5, fromAbility: false };
    return {
      events: [{ type: 'weather-started', data: { weather: 'snow', turnsRemaining: 5 } }],
      pivotSwitch: true,
    };
  }));

  // ── Accuracy/targeting volatiles ──────────────────────────────────────
  r.register('lockon', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'lock-on');
    target.volatileStatus.push({ name: 'lock-on', turnsRemaining: 2, sourceSlotId: ctx.userSlotId });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'lock-on' } }] };
  }));

  r.register('mindreader', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.volatileStatus = target.volatileStatus.filter(v => v.name !== 'lock-on');
    target.volatileStatus.push({ name: 'lock-on', turnsRemaining: 2, sourceSlotId: ctx.userSlotId });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'lock-on' } }] };
  }));

  r.register('telekinesis', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (target.volatileStatus.some(v => v.name === 'ingrain')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'ingrain' } }] };
    }
    if (target.volatileStatus.some(v => v.name === 'telekinesis')) return { events: [] };
    target.volatileStatus.push({ name: 'telekinesis', turnsRemaining: 3 });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'telekinesis' } }] };
  }));

  r.register('charge', custom((ctx) => {
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'charge');
    ctx.user.volatileStatus.push({ name: 'charge' });
    const events: TurnResolveEvent[] = [
      { type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'charge' } },
    ];
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { spd: 1 }));
    return { events };
  }));

  // ── Field / Team manipulation moves ──────────────────────────────────

  // Rototiller: boost ATK and SPA of all grounded Grass-type active Pokémon
  r.register('rototiller', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const gravityActive = ctx.battle.field.gravity > 0;
    for (const team of ctx.battle.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        // Determine the Pokémon's actual types
        let monTypes: PokemonType[];
        if (active.hasTerastallized && active.teraType) {
          monTypes = [active.teraType];
        } else if (active.typeOverride) {
          monTypes = active.typeOverride;
        } else {
          // Look up species types from data loader
          const species = data.getSpecies(active.speciesId);
          monTypes = (species?.types ?? ['Normal']) as PokemonType[];
        }
        if (!monTypes.includes('Grass')) continue;
        if (!isGrounded(active, monTypes, gravityActive)) continue;
        events.push(applyStatBoost(active, slot.slotId, { atk: 1, spa: 1 }));
      }
    }
    if (events.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-targets' } }] };
    }
    return { events };
  }));

  // Flower Shield: boost DEF of all Grass-type active Pokémon (not just grounded)
  r.register('flowershield', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    for (const team of ctx.battle.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        // Determine the Pokémon's actual types
        let monTypes: PokemonType[];
        if (active.hasTerastallized && active.teraType) {
          monTypes = [active.teraType];
        } else if (active.typeOverride) {
          monTypes = active.typeOverride;
        } else {
          // Look up species types from data loader
          const species = data.getSpecies(active.speciesId);
          monTypes = (species?.types ?? ['Normal']) as PokemonType[];
        }
        if (!monTypes.includes('Grass')) continue;
        events.push(applyStatBoost(active, slot.slotId, { def: 1 }));
      }
    }
    if (events.length === 0) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-targets' } }] };
    }
    return { events };
  }));

  // Teatime: forces all active Pokémon to consume their held berries
  r.register('teatime', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    for (const team of ctx.battle.teams) {
      for (const slot of team.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted || !active.heldItem) continue;
        if (!active.heldItem.endsWith('-berry')) continue;
        const item = active.heldItem;
        active.lastConsumedItem = item;
        delete active.heldItem;
        events.push({ type: 'item-consumed', data: { slotId: slot.slotId, item, reason: 'teatime' } });
      }
    }
    return { events };
  }));

  // Helping Hand: boosts ally's next move damage by 1.5×
  r.register('helpinghand', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-ally' } }] };
    }
    if (target.volatileStatus.some(v => v.name === 'helping-hand')) return { events: [] };
    target.volatileStatus.push({ name: 'helping-hand' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'helping-hand' } }] };
  }));

  // Follow Me / Rage Powder / Spotlight: center of attention
  r.register('followme', custom((ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'center-of-attention')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'center-of-attention' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'center-of-attention' } }] };
  }));

  r.register('ragepowder', custom((ctx) => {
    if (ctx.user.volatileStatus.some(v => v.name === 'center-of-attention')) return { events: [] };
    ctx.user.volatileStatus.push({ name: 'center-of-attention' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'center-of-attention' } }] };
  }));

  r.register('spotlight', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (target.volatileStatus.some(v => v.name === 'center-of-attention')) return { events: [] };
    target.volatileStatus.push({ name: 'center-of-attention' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'center-of-attention' } }] };
  }));

  // Wide Guard / Quick Guard / Crafty Shield: team-wide protect variants
  function teamProtect(variant: string): MoveEffectHandler {
    return (ctx) => {
      const streakEntry = ctx.user.volatileStatus.find(v => v.name === 'protect-streak');
      const n = streakEntry?.counter ?? 0;
      const chance = n === 0 ? 1 : 1 / Math.pow(3, n);
      if (ctx.rng() >= chance) {
        ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'protect-streak');
        return { events: [{ type: 'move-failed', data: { moveId: variant, reason: 'protect-failed' } }] };
      }
      if (streakEntry) { streakEntry.counter = n + 1; }
      else { ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 }); }
      const events: TurnResolveEvent[] = [];
      const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
      for (const slot of userTeam.slots) {
        const active = slot.party[slot.activePokemonIndex];
        if (!active || active.fainted) continue;
        if (!active.volatileStatus.some(v => v.name === variant)) {
          active.volatileStatus.push({ name: variant });
          events.push({ type: 'volatile-applied', data: { targetSlotId: slot.slotId, volatile: variant } });
        }
      }
      return { events };
    };
  }

  r.register('wideguard',    teamProtect('wide-guard'));
  r.register('quickguard',   teamProtect('quick-guard'));
  r.register('craftyshield', teamProtect('crafty-shield'));

  // Gear Up: boosts SPA and SPD of Plus/Minus ability Pokémon on user's team
  r.register('gearup', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
    for (const slot of userTeam.slots) {
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;
      if (active.ability === 'plus' || active.ability === 'minus') {
        events.push(applyStatBoost(active, slot.slotId, { spa: 1, spd: 1 }));
      }
    }
    return { events };
  }));

  // Magnetic Flux: boosts DEF and SPD of Plus/Minus ability Pokémon on user's team
  r.register('magneticflux', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
    for (const slot of userTeam.slots) {
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;
      if (active.ability === 'plus' || active.ability === 'minus') {
        events.push(applyStatBoost(active, slot.slotId, { def: 1, spd: 1 }));
      }
    }
    return { events };
  }));

  // Ally Switch: swap user with an ally
  r.register('allyswitch', custom((ctx) => {
    const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
    const userSlotIdx = userTeam.slots.findIndex(s => s.slotId === ctx.userSlotId);
    const allySlot = userTeam.slots.find((s, i) => {
      if (i === userSlotIdx) return false;
      const active = s.party[s.activePokemonIndex];
      return active && !active.fainted;
    });
    if (!allySlot) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'no-ally' } }] };
    }
    const userSlot = userTeam.slots[userSlotIdx]!;
    const tempIdx = userSlot.activePokemonIndex;
    userSlot.activePokemonIndex = allySlot.activePokemonIndex;
    allySlot.activePokemonIndex = tempIdx;
    return { events: [{ type: 'move-note', data: { slotId: ctx.userSlotId, note: 'ally-switched' } }] };
  }));

  // After You: simplified — note that the target moves next
  r.register('afteryou', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    return { events: [{ type: 'move-note', data: { slotId: targetSlotId, note: 'after-you' } }] };
  }));

  // Powder: apply volatile to target; if target uses Fire move, it takes 1/4 max HP damage and move fails
  r.register('powder', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    if (target.volatileStatus.some(v => v.name === 'powder')) return { events: [] };
    target.volatileStatus.push({ name: 'powder', turnsRemaining: 1 });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'powder' } }] };
  }));

  // Quash: applies volatile to target (turn order manipulation is a future enhancement)
  r.register('quash', custom((ctx) => {
    const target = ctx.targets[0];
    const targetSlotId = ctx.targetSlotIds[0];
    if (!target || !targetSlotId) return { events: [] };
    target.volatileStatus.push({ name: 'quash' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId, volatile: 'quash' } }] };
  }));

  // Grudge: if user faints from a direct attack, the attacker's PP for that move is drained to 0
  r.register('grudge', custom((ctx) => {
    ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'grudge');
    ctx.user.volatileStatus.push({ name: 'grudge' });
    return { events: [{ type: 'volatile-applied', data: { targetSlotId: ctx.userSlotId, volatile: 'grudge' } }] };
  }));

  // Mat Block: blocks all damaging moves against the whole team this turn (only works on first turn out)
  r.register('matblock', custom((ctx) => {
    if (!ctx.user.volatileStatus.some(v => v.name === 'fresh-switcher')) {
      return { events: [{ type: 'move-failed', data: { moveId: ctx.move.id, reason: 'not-first-turn' } }] };
    }
    const streakEntry = ctx.user.volatileStatus.find(v => v.name === 'protect-streak');
    const n = streakEntry?.counter ?? 0;
    const chance = n === 0 ? 1 : 1 / Math.pow(3, n);
    if (ctx.rng() >= chance) {
      ctx.user.volatileStatus = ctx.user.volatileStatus.filter(v => v.name !== 'protect-streak');
      return { events: [{ type: 'move-failed', data: { moveId: 'matblock', reason: 'protect-failed' } }] };
    }
    if (streakEntry) { streakEntry.counter = (n + 1); }
    else { ctx.user.volatileStatus.push({ name: 'protect-streak', counter: 1 }); }
    const events: TurnResolveEvent[] = [];
    const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
    for (const slot of userTeam.slots) {
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;
      if (!active.volatileStatus.some(v => v.name === 'mat-block')) {
        active.volatileStatus.push({ name: 'mat-block' });
        events.push({ type: 'volatile-applied', data: { targetSlotId: slot.slotId, volatile: 'mat-block' } });
      }
    }
    return { events };
  }));

  // Tidy Up: removes entry hazards + substitutes, boosts ATK and SPE
  r.register('tidyup', custom((ctx) => {
    const events: TurnResolveEvent[] = [];
    const userSideConditions = ctx.battle.field.sideConditions[ctx.userTeamIndex as 0 | 1]!;
    if (userSideConditions.spikes > 0 || userSideConditions.toxicSpikes > 0 ||
        userSideConditions.stealthRock || userSideConditions.stickyWeb) {
      userSideConditions.spikes = 0;
      userSideConditions.toxicSpikes = 0;
      userSideConditions.stealthRock = false;
      userSideConditions.stickyWeb = false;
      events.push({ type: 'hazard-cleared', data: { side: ctx.userTeamIndex, reason: 'tidy-up' } });
    }
    // Remove substitutes from all user team slots
    const userTeam = ctx.battle.teams[ctx.userTeamIndex]!;
    for (const slot of userTeam.slots) {
      const active = slot.party[slot.activePokemonIndex];
      if (!active || active.fainted) continue;
      const subIdx = active.volatileStatus.findIndex(v => v.name === 'substitute');
      if (subIdx !== -1) {
        active.volatileStatus.splice(subIdx, 1);
        events.push({ type: 'volatile-cured', data: { slotId: slot.slotId, volatile: 'substitute' } });
      }
    }
    // Boost user ATK and SPE by +1 each
    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { atk: 1, spe: 1 }));
    return { events };
  }));

  return r;
}
