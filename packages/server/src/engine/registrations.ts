import { MoveEffectRegistry } from './MoveEffectRegistry.js';
import type { MoveContext } from './MoveEffectRegistry.js';
import {
  statModSelf, statModTarget, multiStatModSelf,
  applyStatusTarget, applyVolatileTarget, applyVolatileSelf, healPercent,
  setWeather, setTerrain, setSideCondition, trickRoom, gravity, custom,
  protect, endure, substitute, disable, taunt, encore, torment,
  aquaRing, ingrain, magnetRise, perishSong, destinyBond, roost,
  embargoFactory, healBlockFactory, cureTeamStatus, wish,
} from './effectFactories.js';
import { clearHazards, clearScreens } from './sideConditions.js';
import { applyStatBoost } from './effects.js';
import { canApplyStatus } from './status.js';
import { getEffectiveStat } from './stats.js';
import type { TurnResolveEvent } from '@poke-fighter/shared';

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

export function buildDefaultRegistry(): MoveEffectRegistry {
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
  r.register('confuseray',  applyVolatileTarget('confusion'));
  r.register('supersonic',  applyVolatileTarget('confusion'));
  r.register('sweetkiss',   applyVolatileTarget('confusion'));
  r.register('leechseed',   applyVolatileTarget('leech-seed'));
  r.register('yawn',        applyVolatileTarget('yawn', 2));
  r.register('focusenergy', applyVolatileSelf('focusenergy'));
  r.register('aquaring',    aquaRing());
  r.register('ingrain',     ingrain());
  r.register('magnetrise',  magnetRise());
  r.register('perishsong',  perishSong());
  r.register('foresight',   applyVolatileTarget('foresight'));
  r.register('odorsleuth',  applyVolatileTarget('foresight'));
  r.register('miracleeye',  applyVolatileTarget('miracle-eye'));
  r.register('destinybond', destinyBond());

  // ── Self stat boosts ───────────────────────────────────────────────
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

  // ── Target stat drops ──────────────────────────────────────────────
  r.register('leer',       statModTarget('def', -1));
  r.register('growl',      statModTarget('atk', -1));
  r.register('screech',    statModTarget('def', -2));
  r.register('charm',      statModTarget('atk', -2));
  r.register('faketears',  statModTarget('spd', -2));
  r.register('flash',      statModTarget('accuracy', -1));
  r.register('sandattack', statModTarget('accuracy', -1));

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

  return r;
}
