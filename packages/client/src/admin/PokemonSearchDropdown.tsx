// packages/client/src/admin/PokemonSearchDropdown.tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { PokemonSpecies } from '@poke-fighter/shared';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  onSelect: (species: PokemonSpecies) => void;
}

export function PokemonSearchDropdown({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PokemonSpecies[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: any) => {
      if (payload.resource === 'pokemon') { setResults(payload.results); setHighlighted(0); }
    };
    socket.on('data:results' as any, handler);
    return () => { socket.off('data:results' as any, handler); };
  }, []);

  function handleChange(q: string) {
    setQuery(q);
    if (q.length >= 2) {
      getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'pokemon', query: q } } as any);
    } else {
      setResults([]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[highlighted]!); }
    else if (e.key === 'Escape') { setResults([]); setQuery(''); }
  }

  function pick(species: PokemonSpecies) {
    onSelect(species);
    setQuery('');
    setResults([]);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search Pokémon by name or dex #..."
        style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '6px 10px', borderRadius: 4, fontFamily: 'inherit', width: '100%', fontSize: 13, boxSizing: 'border-box' }}
      />
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 180, overflowY: 'auto', zIndex: 10 }}>
          {results.map((s, i) => (
            <div
              key={s.id}
              onClick={() => pick(s)}
              style={{ padding: '6px 10px', cursor: 'pointer', background: i === highlighted ? '#1a2a3a' : 'transparent', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fff', borderBottom: '1px solid #222' }}
            >
              <span style={{ color: '#888', minWidth: 36 }}>#{s.id}</span>
              <span>{s.displayName}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {s.types.map((t) => (
                  <span key={t} style={{ background: TYPE_COLORS[t] ?? '#555', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>{t}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
