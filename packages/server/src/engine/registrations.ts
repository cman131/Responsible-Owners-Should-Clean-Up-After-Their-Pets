import { MoveEffectRegistry } from './MoveEffectRegistry.js';
import type { MoveContext, MoveEffectHandler } from './MoveEffectRegistry.js';
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
import { applyStatBoost, applyVolatile } from './effects.js';
import { canApplyStatus } from './status.js';
import { getEffectiveStat } from './stats.js';
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

export function buildDefaultRegistry(data: DataLoader): MoveEffectRegistry {
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
      ctx.user.lastConsumedItem = ctx.user.heldItem;
      delete ctx.user.heldItem;
      events.push({ type: 'item-consumed', data: { slotId: ctx.userSlotId, item: 'power-herb', reason: 'power-herb' } });
    }

    events.push(applyStatBoost(ctx.user, ctx.userSlotId, { spa: 2, spd: 2, spe: 2 }));
    return { events };
  }));
  r.register('victorydance',multiStatModSelf({ atk: 1, def: 1, spe: 1 }));
  // TODO: autotomize also reduces user weight by 100 kg (min 0.1 kg), but PartyMember
  // does not carry a weightkg field (that lives on PokemonSpecies). Weight reduction
  // is omitted until the battle state is extended to track per-instance weight.
  r.register('autotomize',  statModSelf('spe', 2));

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

  return r;
}
