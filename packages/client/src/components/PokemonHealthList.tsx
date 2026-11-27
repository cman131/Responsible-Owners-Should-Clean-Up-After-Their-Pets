import type { ReactNode } from 'react';
import type { PokemonHealth, PokemonSet, StatusCondition } from '@poke-fighter/shared';

const STATUS_LABEL: Record<StatusCondition, string> = {
  brn: 'BURNED', par: 'PARALYZED', slp: 'ASLEEP', frz: 'FROZEN',
  psn: 'POISONED', tox: 'BADLY POISONED', fnt: 'FAINTED',
};

interface Props {
  title: string;
  pokemon: PokemonSet[];
  health: PokemonHealth[];
  renderAction?: (entry: PokemonHealth) => ReactNode;
}

export function PokemonHealthList({ title, pokemon, health, renderAction }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ color: '#aaa', fontSize: 11, letterSpacing: 2 }}>{title}</div>
      {pokemon.length === 0 && <div style={{ color: '#555', fontSize: 12 }}>No Pokémon.</div>}
      {pokemon.map((set, i) => {
        const entry = health.find((h) => h.pokemonId === set.pokemonId);
        return (
          <div key={set.pokemonId ?? i} data-testid={`health-row-${set.nickname}`} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 12 }}>{set.nickname} <span style={{ color: '#aaa' }}>Lv.{set.level}</span></div>
              {entry ? <HealthDetails entry={entry} /> : <div style={{ color: '#888', fontSize: 10 }}>No health data yet.</div>}
            </div>
            {entry && renderAction?.(entry)}
          </div>
        );
      })}
    </div>
  );
}

function HealthDetails({ entry }: { entry: PokemonHealth }) {
  const percent = entry.maxHp > 0 ? (entry.currentHp / entry.maxHp) * 100 : 0;
  const color = percent > 50 ? '#27ae60' : percent > 20 ? '#f0c040' : '#e74c3c';
  const label = entry.currentHp === 0 ? 'FAINTED' : entry.status ? STATUS_LABEL[entry.status] : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: '#333', borderRadius: 3 }}>
          <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: 3 }} />
        </div>
        <span style={{ color: '#ccc', fontSize: 10 }}>{`${entry.currentHp}/${entry.maxHp} HP`}</span>
        {label && <span style={{ color: '#e67e22', fontSize: 10 }}>{label}</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: '#888', fontSize: 10 }}>
        {entry.moves.map((m) => <span key={m.moveId}>{`${m.moveId} ${m.currentPp}/${m.maxPp}`}</span>)}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, padding: '6px 10px',
};
