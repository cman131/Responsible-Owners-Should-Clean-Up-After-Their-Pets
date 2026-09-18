import { describe, it, expect } from 'vitest';
import { classifyTarget, getTargetLabel, formatTargetNames, sortLegalTargets } from '../targeting.js';
import type { BattleState } from '@poke-fighter/shared';

describe('classifyTarget', () => {
  it('choose: normal, any, adjacentFoe, adjacentAlly, adjacentAllyOrSelf', () => {
    expect(classifyTarget('normal')).toBe('choose');
    expect(classifyTarget('any')).toBe('choose');
    expect(classifyTarget('adjacentFoe')).toBe('choose');
    expect(classifyTarget('adjacentAlly')).toBe('choose');
    expect(classifyTarget('adjacentAllyOrSelf')).toBe('choose');
  });

  it('listed: allAdjacentFoes, allAdjacent, allies', () => {
    expect(classifyTarget('allAdjacentFoes')).toBe('listed');
    expect(classifyTarget('allAdjacent')).toBe('listed');
    expect(classifyTarget('allies')).toBe('listed');
  });

  it('labeled: all, allyTeam, allySide, foeSide, randomNormal', () => {
    expect(classifyTarget('all')).toBe('labeled');
    expect(classifyTarget('allyTeam')).toBe('labeled');
    expect(classifyTarget('allySide')).toBe('labeled');
    expect(classifyTarget('foeSide')).toBe('labeled');
    expect(classifyTarget('randomNormal')).toBe('labeled');
  });

  it('auto: self, scripted', () => {
    expect(classifyTarget('self')).toBe('auto');
    expect(classifyTarget('scripted')).toBe('auto');
  });
});

describe('getTargetLabel', () => {
  it('returns correct labels for labeled target types', () => {
    expect(getTargetLabel('all')).toBe('All');
    expect(getTargetLabel('allyTeam')).toBe('Ally team');
    expect(getTargetLabel('allySide')).toBe('Ally side');
    expect(getTargetLabel('foeSide')).toBe('Foe side');
    expect(getTargetLabel('randomNormal')).toBe('Random');
  });
});

describe('formatTargetNames', () => {
  function makeState(slots: Array<{ slotId: string; displayName: string }>): BattleState {
    return {
      battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
      teams: [
        {
          teamId: 'a',
          slots: slots.map((s) => ({
            slotId: s.slotId, displayName: s.displayName, isNpc: false, isSpectator: false,
            party: [{ instanceId: 'p1', speciesId: 6, speciesName: 'charizard', nickname: 'Char',
              level: 50, currentHp: 100, maxHp: 100,
              stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
              ability: 'blaze', moves: [
                { moveId: 'flamethrower', currentPp: 15, maxPp: 15 },
                { moveId: 'airslash', currentPp: 15, maxPp: 15 },
                { moveId: 'roost', currentPp: 10, maxPp: 10 },
                { moveId: 'willowisp', currentPp: 15, maxPp: 15 },
              ],
              volatileStatus: [], statBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
              hasTerastallized: false, fainted: false, expTotal: 0, growthRate: 'MediumFast',
            }],
            activePokemonIndex: 0,
          })),
        },
        { teamId: 'b', slots: [] },
      ],
      field: {
        trickroom: 0, gravity: 0,
        sideConditions: [
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
        ],
      },
    };
  }

  it('returns names joined by comma for ≤ 3 targets', () => {
    const state = makeState([
      { slotId: 's1', displayName: 'Ash' },
      { slotId: 's2', displayName: 'Misty' },
    ]);
    expect(formatTargetNames(['s1', 's2'], state)).toBe('Ash, Misty');
  });

  it('caps at 3 names and appends ellipsis for > 3 targets', () => {
    const state = makeState([
      { slotId: 's1', displayName: 'Ash' },
      { slotId: 's2', displayName: 'Misty' },
      { slotId: 's3', displayName: 'Brock' },
      { slotId: 's4', displayName: 'Gary' },
    ]);
    expect(formatTargetNames(['s1', 's2', 's3', 's4'], state)).toBe('Ash, Misty, Brock…');
  });

  it('returns slotId as fallback when slot not found in state', () => {
    const state = makeState([]);
    expect(formatTargetNames(['unknown-slot'], state)).toBe('unknown-slot');
  });

  it('returns empty string for empty targets array', () => {
    const state = makeState([]);
    expect(formatTargetNames([], state)).toBe('');
  });

  it('exactly 3 targets — no ellipsis', () => {
    const state = makeState([
      { slotId: 's1', displayName: 'Ash' },
      { slotId: 's2', displayName: 'Misty' },
      { slotId: 's3', displayName: 'Brock' },
    ]);
    expect(formatTargetNames(['s1', 's2', 's3'], state)).toBe('Ash, Misty, Brock');
  });
});

describe('sortLegalTargets', () => {
  function makeState(
    team0SlotIds: string[],
    team1SlotIds: string[],
  ): BattleState {
    function makeSlot(slotId: string) {
      return {
        slotId,
        displayName: slotId,
        isNpc: false,
        isSpectator: false,
        party: [],
        activePokemonIndex: 0,
      };
    }
    return {
      battleId: 'test', label: 'Test', turnNumber: 1, phase: 'action',
      teams: [
        { teamId: 'a', slots: team0SlotIds.map(makeSlot) },
        { teamId: 'b', slots: team1SlotIds.map(makeSlot) },
      ],
      field: {
        trickroom: 0, gravity: 0, wonderroom: 0, magicroom: 0, mudSport: 0, waterSport: 0, ionDeluge: false, fairyLock: 0,
        sideConditions: [
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
          { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, reflect: 0, lightScreen: 0, auroraVeil: 0, tailwind: 0, safeguard: 0, mist: 0, luckychant: 0 },
        ],
      },
    };
  }

  it('places enemies before allies before self', () => {
    const state = makeState(['a1', 'a2'], ['b1', 'b2']);
    const result = sortLegalTargets(['a1', 'a2', 'b1', 'b2'], 'a1', state);
    expect(result).toEqual(['b1', 'b2', 'a2', 'a1']);
  });

  it('works when targets contain only enemies', () => {
    const state = makeState(['a1'], ['b1', 'b2']);
    const result = sortLegalTargets(['b1', 'b2'], 'a1', state);
    expect(result).toEqual(['b1', 'b2']);
  });

  it('works when targets contain only allies', () => {
    const state = makeState(['a1', 'a2'], ['b1']);
    const result = sortLegalTargets(['a2'], 'a1', state);
    expect(result).toEqual(['a2']);
  });

  it('works when targets contain only self', () => {
    const state = makeState(['a1'], ['b1']);
    const result = sortLegalTargets(['a1'], 'a1', state);
    expect(result).toEqual(['a1']);
  });

  it('preserves relative order within each bucket', () => {
    // b2, b1 both go to enemies bucket — their relative order must be preserved
    const state = makeState(['a1', 'a2'], ['b1', 'b2']);
    const result = sortLegalTargets(['b2', 'b1', 'a2', 'a1'], 'a1', state);
    expect(result).toEqual(['b2', 'b1', 'a2', 'a1']);
  });

  it('puts unresolvable slot ids at the end', () => {
    const state = makeState(['a1'], ['b1']);
    const result = sortLegalTargets(['unknown', 'b1', 'a1'], 'a1', state);
    expect(result).toEqual(['b1', 'a1', 'unknown']);
  });
});
