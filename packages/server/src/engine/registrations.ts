import { MoveEffectRegistry } from './MoveEffectRegistry.js';
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
import type { TurnResolveEvent } from '@poke-fighter/shared';

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
  r.register('moonlight',   healPercent(0.5));
  r.register('synthesis',   healPercent(0.5));
  r.register('slackoff',    healPercent(0.5));
  r.register('shoreup',     healPercent(0.5)); // weather variant added in Task 10
  r.register('morningsun',  healPercent(0.5)); // weather variant added in Task 10
  r.register('aromatherapy', cureTeamStatus());
  r.register('healbell',     cureTeamStatus());
  r.register('wish',         wish());

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
