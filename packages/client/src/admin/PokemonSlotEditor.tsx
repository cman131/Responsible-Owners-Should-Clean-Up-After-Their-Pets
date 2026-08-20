import { useState } from 'react';
import type { PokemonSpecies, PokemonSet } from '@poke-fighter/shared';
import { PokemonSearchDropdown } from './PokemonSearchDropdown.js';
import { MoveSearchDropdown } from './MoveSearchDropdown.js';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  value: Partial<PokemonSet>;
  onChange: (updated: Partial<PokemonSet>) => void;
}

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

export function PokemonSlotEditor({ value, onChange }: Props) {
  const [currentSpecies, setCurrentSpecies] = useState<PokemonSpecies | null>(null);

  function pickPokemon(species: PokemonSpecies) {
    setCurrentSpecies(species);
    onChange({
      speciesId: species.id,
      nickname: species.displayName,
      level: value.level ?? 50,
      ability: Object.values(species.abilities)[0] ?? '',
      moves: value.moves ?? ['', '', '', ''],
      evs: value.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: value.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: value.nature ?? 'hardy',
    });
  }

  function updateField(field: keyof PokemonSet, v: unknown) {
    onChange({ ...value, [field]: v });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PokemonSearchDropdown onSelect={pickPokemon} />

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
            {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map((stat) => (
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
            <img
              src={currentSpecies
                ? `https://play.pokemonshowdown.com/sprites/ani/${currentSpecies.name}.gif`
                : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${value.speciesId}.png`}
              alt=""
              style={{ imageRendering: 'pixelated', width: 80, height: 80 }}
              loading="lazy"
            />
          </div>
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
          <div>
            <label style={lbl}>Moves</label>
            {[0, 1, 2, 3].map((mi) => (
              <div key={mi} style={{ marginBottom: 8 }}>
                <MoveSearchDropdown
                  speciesId={value.speciesId!}
                  value={((value.moves ?? ['', '', '', '']) as string[])[mi] ?? ''}
                  selectedMoves={(value.moves ?? ['', '', '', '']) as string[]}
                  onChange={(moveId) => {
                    const moves = [...((value.moves ?? ['', '', '', '']) as string[])];
                    moves[mi] = moveId;
                    updateField('moves', moves as [string, string, string, string]);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { color: '#aaa', fontSize: 11, minWidth: 52 };
const inp: React.CSSProperties = { background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 };
