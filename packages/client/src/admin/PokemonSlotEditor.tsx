import { useState, useEffect, useMemo } from 'react';
import type { PokemonSpecies, PokemonSet, PokemonType } from '@poke-fighter/shared';
import { PokemonSearchDropdown } from './PokemonSearchDropdown.js';
import { MoveSearchDropdown } from './MoveSearchDropdown.js';
import { ItemSearchDropdown } from './ItemSearchDropdown.js';
import { TYPE_COLORS } from '../pokemonTypeColors.js';
import { getSocket } from '../socket.js';
import { toShowdownId } from '../battle/utils.js';

const NATURES = [
  { id: 'hardy',   boost: null,  drop: null  },
  { id: 'lonely',  boost: 'Atk', drop: 'Def' },
  { id: 'brave',   boost: 'Atk', drop: 'Spe' },
  { id: 'adamant', boost: 'Atk', drop: 'SpA' },
  { id: 'naughty', boost: 'Atk', drop: 'SpD' },
  { id: 'bold',    boost: 'Def', drop: 'Atk' },
  { id: 'relaxed', boost: 'Def', drop: 'Spe' },
  { id: 'impish',  boost: 'Def', drop: 'SpA' },
  { id: 'lax',     boost: 'Def', drop: 'SpD' },
  { id: 'timid',   boost: 'Spe', drop: 'Atk' },
  { id: 'hasty',   boost: 'Spe', drop: 'Def' },
  { id: 'jolly',   boost: 'Spe', drop: 'SpA' },
  { id: 'naive',   boost: 'Spe', drop: 'SpD' },
  { id: 'modest',  boost: 'SpA', drop: 'Atk' },
  { id: 'mild',    boost: 'SpA', drop: 'Def' },
  { id: 'quiet',   boost: 'SpA', drop: 'Spe' },
  { id: 'rash',    boost: 'SpA', drop: 'SpD' },
  { id: 'calm',    boost: 'SpD', drop: 'Atk' },
  { id: 'gentle',  boost: 'SpD', drop: 'Def' },
  { id: 'sassy',   boost: 'SpD', drop: 'Spe' },
  { id: 'careful', boost: 'SpD', drop: 'SpA' },
  { id: 'docile',  boost: null,  drop: null  },
  { id: 'serious', boost: null,  drop: null  },
  { id: 'bashful', boost: null,  drop: null  },
  { id: 'quirky',  boost: null,  drop: null  },
] as const;

const TERA_TYPES: PokemonType[] = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

const EV_IV_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

const DEFAULT_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const DEFAULT_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

interface Props {
  value: Partial<PokemonSet>;
  onChange: (updated: Partial<PokemonSet>) => void;
  inventory?: Record<string, number>;
  leasedItems?: Record<string, number>;
}

export function PokemonSlotEditor({ value, onChange, inventory, leasedItems }: Props) {
  const [currentSpecies, setCurrentSpecies] = useState<PokemonSpecies | null>(null);

  const availabilityMap = useMemo(() => {
    if (!inventory) return undefined;
    const map: Record<string, number> = {};
    const allKeys = new Set([...Object.keys(inventory), ...Object.keys(leasedItems ?? {})]);
    for (const itemId of allKeys) {
      const owned = inventory[itemId] ?? 0;
      const leased = leasedItems?.[itemId] ?? 0;
      const ownHeld = value.heldItem === itemId ? 1 : 0;
      map[itemId] = owned - leased + ownHeld;
    }
    return map;
  }, [inventory, leasedItems, value.heldItem]);

  useEffect(() => {
    if (!value.speciesId || currentSpecies?.id === value.speciesId) return;

    let alive = true;
    const socket = getSocket();

    function handleResults(payload: { resource: string; results: unknown[] }) {
      if (!alive || payload.resource !== 'pokemon') return;
      const found = (payload.results as PokemonSpecies[]).find((r) => r.id === value.speciesId);
      if (found) setCurrentSpecies(found);
    }

    socket.on('data:results', handleResults);
    socket.emit('admin:action', { type: 'data:query', data: { resource: 'pokemon', query: `${value.speciesId}` } } as any);

    return () => {
      alive = false;
      socket.off('data:results', handleResults);
    };
  }, [value.speciesId, currentSpecies?.id]);

  function pickPokemon(species: PokemonSpecies) {
    setCurrentSpecies(species);
    onChange({
      speciesId: species.id,
      nickname: species.displayName,
      level: value.level ?? 50,
      ability: Object.values(species.abilities)[0] ?? '',
      moves: value.moves ?? ['', '', '', ''],
      evs: value.evs ?? DEFAULT_EVS,
      ivs: value.ivs ?? DEFAULT_IVS,
      nature: value.nature ?? 'hardy',
      teraType: species.types[0],
    });
  }

  function clearSlot() {
    setCurrentSpecies(null);
    onChange({});
  }

  function updateField<K extends keyof PokemonSet>(field: K, v: PokemonSet[K]) {
    onChange({ ...value, [field]: v });
  }

  function updateTeraType(typeVal: string) {
    if (typeVal) {
      updateField('teraType', typeVal as PokemonType);
    } else {
      const { teraType: _removed, ...rest } = value;
      onChange(rest);
    }
  }

  const evTotal = EV_IV_STATS.reduce((sum, s) => sum + (value.evs?.[s] ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!value.speciesId && <PokemonSearchDropdown onSelect={pickPokemon} />}

      {currentSpecies && (
        <div style={{ background: '#0d1a2e', border: '1px solid #2980b9', borderRadius: 4, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{currentSpecies.displayName}</span>
          <span style={{ color: '#888' }}>#{currentSpecies.id}</span>
          <span style={{ display: 'flex', gap: 3 }}>
            {currentSpecies.types.map((t) => (
              <span key={t} style={{ background: TYPE_COLORS[t] ?? '#555', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>{t}</span>
            ))}
          </span>
          <span style={{ color: '#aaa', marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {EV_IV_STATS.map((stat) => (
              <span key={stat}>
                <span style={{ color: '#666', fontSize: 9 }}>{stat.toUpperCase()} </span>
                <span style={{ color: '#ccc' }}>{currentSpecies.baseStats[stat]}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {value.speciesId && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#aaa', fontSize: 11 }}>
              {currentSpecies?.displayName ?? value.nickname ?? `#${value.speciesId}`}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={clearSlot} style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, letterSpacing: 1 }}>✕ CLEAR</button>
              <img
                src={currentSpecies
                  ? `https://play.pokemonshowdown.com/sprites/ani/${toShowdownId(currentSpecies.name)}.gif`
                  : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${value.speciesId}.png`}
                alt=""
                style={{ imageRendering: 'pixelated', width: 80, height: 80 }}
                loading="lazy"
              />
            </div>
          </div>
          {value.speciesId && !(value.moves ?? []).some(Boolean) && (
            <div style={{ color: '#f0c040', fontSize: 11 }}>⚠ No moves set</div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Name</label>
            <input
              value={value.nickname ?? ''}
              onChange={(e) => updateField('nickname', e.target.value.slice(0, 20))}
              maxLength={20}
              style={{ ...inp, width: 160 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Level</label>
            <input
              type="number" min={1} max={100}
              value={value.level ?? 50}
              onChange={(e) => updateField('level', Number(e.target.value))}
              style={{ ...inp, width: 60 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Ability</label>
            {currentSpecies ? (
              <select
                value={value.ability ?? ''}
                onChange={(e) => updateField('ability', e.target.value)}
                style={{ ...inp, width: 200 }}
              >
                {Object.values(currentSpecies.abilities).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : value.speciesId ? (
              <select disabled value={value.ability ?? ''} style={{ ...inp, width: 200, color: '#888' }}>
                <option value={value.ability ?? ''}>{value.ability ?? ''} (loading…)</option>
              </select>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Item</label>
            <div style={{ flex: 1 }}>
              <ItemSearchDropdown
                value={value.heldItem ?? ''}
                onChange={(itemId) => updateField('heldItem', itemId || undefined)}
                equippableOnly
                {...(availabilityMap !== undefined ? { availabilityMap } : {})}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Nature</label>
            <select
              value={value.nature ?? 'hardy'}
              onChange={(e) => updateField('nature', e.target.value)}
              style={{ ...inp, width: 200 }}
            >
              {NATURES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id.charAt(0).toUpperCase() + n.id.slice(1)}
                  {n.boost ? ` (+${n.boost} / -${n.drop})` : ' (neutral)'}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Tera</label>
            <select
              aria-label="Tera type"
              value={value.teraType ?? ''}
              onChange={(e) => updateTeraType(e.target.value)}
              style={{ ...inp, width: 140 }}
            >
              <option value="">— none —</option>
              {TERA_TYPES.map((t) => (
                <option key={t} value={t} style={{ background: TYPE_COLORS[t] }}>{t}</option>
              ))}
            </select>
          </div>
          <details>
            <summary style={{ ...lbl, cursor: 'pointer', userSelect: 'none' }}>EVs / IVs</summary>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {EV_IV_STATS.map((stat) => (
                <div key={stat} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...lbl, minWidth: 32 }}>{stat.toUpperCase()}</span>
                  <input
                    type="number" min={0} max={252}
                    aria-label={`${stat.toUpperCase()} EV`}
                    value={value.evs?.[stat] ?? 0}
                    onChange={(e) => updateField('evs', { ...(value.evs ?? DEFAULT_EVS), [stat]: +e.target.value })}
                    style={{ ...inp, width: 56 }}
                  />
                  <input
                    type="number" min={0} max={31}
                    aria-label={`${stat.toUpperCase()} IV`}
                    value={value.ivs?.[stat] ?? 31}
                    onChange={(e) => updateField('ivs', { ...(value.ivs ?? DEFAULT_IVS), [stat]: +e.target.value })}
                    style={{ ...inp, width: 48 }}
                  />
                </div>
              ))}
              <div style={{ color: evTotal > 508 ? '#e74c3c' : '#888', fontSize: 11, marginTop: 2 }}>
                Total: {evTotal} / 508
              </div>
            </div>
          </details>
          <div>
            <label style={lbl}>Moves</label>
            {(() => {
              const currentMoves = (value.moves ?? ['', '', '', '']) as [string, string, string, string];
              return [0, 1, 2, 3].map((mi) => (
                <div key={mi} style={{ marginBottom: 8 }}>
                  <MoveSearchDropdown
                    speciesId={value.speciesId!}
                    value={currentMoves[mi] ?? ''}
                    selectedMoves={currentMoves}
                    onChange={(moveId) => {
                      const moves = [...currentMoves] as [string, string, string, string];
                      moves[mi] = moveId;
                      updateField('moves', moves);
                    }}
                  />
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { color: '#aaa', fontSize: 11, minWidth: 52 };
const inp: React.CSSProperties = { background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 };
