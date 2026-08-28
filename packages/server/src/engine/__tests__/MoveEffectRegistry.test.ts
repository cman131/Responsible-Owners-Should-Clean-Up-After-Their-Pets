import { describe, it, expect, vi } from 'vitest';
import { MoveEffectRegistry } from '../MoveEffectRegistry.js';
import type { MoveContext, MoveEffectHandler } from '../MoveEffectRegistry.js';

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
