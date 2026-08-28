import { describe, it, expect, vi } from 'vitest';
import { MoveEffectRegistry } from '../MoveEffectRegistry.js';
import type { MoveContext, MoveEffectHandler } from '../MoveEffectRegistry.js';
import { buildDefaultRegistry } from '../registrations.js';

const noopHandler: MoveEffectHandler = vi.fn().mockReturnValue({ events: [] });

describe('MoveEffectRegistry', () => {
  it('register + get roundtrip returns the registered handler', () => {
    const reg = new MoveEffectRegistry();
    reg.register('swordsdance', noopHandler);
    expect(reg.get('swordsdance')).toBe(noopHandler);
  });

  it('get returns undefined for an unknown effectId', () => {
    const reg = new MoveEffectRegistry();
    expect(reg.get('unknownmove')).toBeUndefined();
  });

  it('second register call overwrites first for same effectId', () => {
    const reg = new MoveEffectRegistry();
    const handler2: MoveEffectHandler = vi.fn().mockReturnValue({ events: [] });
    reg.register('testmove', noopHandler);
    reg.register('testmove', handler2);
    expect(reg.get('testmove')).toBe(handler2);
  });
});

describe('buildDefaultRegistry', () => {
  it('has handlers for all 15 previously-working moves', () => {
    const reg = buildDefaultRegistry();
    const moves = [
      'willowisp', 'thunderwave', 'toxic', 'spore', 'sleeppowder',
      'swordsdance', 'nastyplot', 'calmmind', 'bulkup', 'roost',
      'yawn', 'confuseray', 'supersonic', 'sweetkiss', 'leechseed',
    ];
    for (const m of moves) {
      expect(reg.get(m), `missing: ${m}`).toBeDefined();
    }
  });

  it('has handlers for new factory-wired moves', () => {
    const reg = buildDefaultRegistry();
    const newMoves = [
      'agility', 'barrier', 'acidarmor', 'amnesia', 'irondefense',
      'dragondance', 'quiverdance', 'shellsmash', 'coil',
      'leer', 'growl', 'screech', 'charm', 'faketears', 'flash', 'sandattack',
      'recover', 'softboiled', 'milkdrink', 'moonlight', 'synthesis',
      'raindance', 'sunnyday', 'sandstorm', 'hail', 'snowscape',
      'electricterrain', 'grassyterrain', 'mistyterrain', 'psychicterrain',
      'reflect', 'lightscreen', 'auroraveil',
      'stealthrock', 'spikes', 'toxicspikes', 'stickyweb',
      'trickroom', 'gravity',
    ];
    for (const m of newMoves) {
      expect(reg.get(m), `missing: ${m}`).toBeDefined();
    }
  });

  it('returns undefined for an unknown effectId', () => {
    expect(buildDefaultRegistry().get('completelyfakemove')).toBeUndefined();
  });
});
