import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../socket.js';
import type { Move } from '@poke-fighter/shared';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  speciesId: number;
  value: string;
  selectedMoves: string[];
  onChange: (moveId: string) => void;
}

const CAT: Record<string, string> = { physical: 'Ph', special: 'Sp', status: 'St' };
const CAT_COLOR: Record<string, string> = { physical: '#c03028', special: '#6890f0', status: '#888' };

export function MoveSearchDropdown({ speciesId, value, selectedMoves, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Move[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [allMovesMode, setAllMovesMode] = useState(false);
  const [learnsetCache, setLearnsetCache] = useState<Move[]>([]);
  const [selectedMove, setSelectedMove] = useState<Move | null>(null);
  const [open, setOpen] = useState(false);
  const allModeRef = useRef(false);

  useEffect(() => { allModeRef.current = allMovesMode; }, [allMovesMode]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: any) => {
      if (payload.resource !== 'moves') return;
      const moves = payload.results as Move[];
      if (!allModeRef.current) setLearnsetCache(moves);
      setResults(moves);
      setHighlighted(0);
    };
    socket.on('data:results' as any, handler);
    return () => { socket.off('data:results' as any, handler); };
  }, []);

  useEffect(() => {
    setQuery('');
    setResults([]);
    setLearnsetCache([]);
    setSelectedMove(null);
    setAllMovesMode(false);
    allModeRef.current = false;
    setOpen(false);
    getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'moves', speciesId } } as any);
  }, [speciesId]);

  function handleFocus() {
    if (!allMovesMode) { setResults(learnsetCache); setOpen(true); }
  }

  function handleChange(q: string) {
    setQuery(q);
    if (allMovesMode) {
      if (q.length >= 2) {
        getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'moves', query: q } } as any);
      } else {
        setResults([]);
      }
    } else {
      const lower = q.toLowerCase();
      setResults(q ? learnsetCache.filter((m) => m.id.includes(lower) || m.name.toLowerCase().includes(lower)) : learnsetCache);
      setOpen(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const m = results[highlighted];
      if (m && !(m.id !== value && selectedMoves.includes(m.id))) pick(m);
    }
  }

  function pick(move: Move) {
    setSelectedMove(move);
    onChange(move.id);
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  function clear() {
    setSelectedMove(null);
    onChange('');
    setResults(learnsetCache);
    setOpen(false);
  }

  function toggleAllMovesMode(checked: boolean) {
    setAllMovesMode(checked);
    allModeRef.current = checked;
    setQuery('');
    setResults(checked ? [] : learnsetCache);
    setOpen(!checked);
  }

  const displayMove = selectedMove ?? learnsetCache.find((m) => m.id === value) ?? null;

  if (value && displayMove) {
    return (
      <div>
        <div style={{ background: '#0d1a2e', border: '1px solid #2980b9', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ color: '#fff', flex: 1 }}>{displayMove.name}</span>
          <span style={{ background: TYPE_COLORS[displayMove.type] ?? '#555', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{displayMove.type}</span>
          <span style={{ background: CAT_COLOR[displayMove.category] ?? '#888', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{CAT[displayMove.category]}</span>
          <span style={{ color: '#aaa', fontSize: 10 }}>{displayMove.basePower > 0 ? displayMove.basePower : '—'}</span>
          <button onClick={clear} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <input type="checkbox" checked={false} onChange={() => {}} disabled />
          <span style={{ fontSize: 10, color: '#444' }}>Search all moves</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={allMovesMode ? 'Search all moves...' : 'Search moves...'}
        style={{ background: '#1a1a2e', border: `1px solid ${allMovesMode ? '#f0c040' : '#555'}`, color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
          {results.map((m, i) => {
            const alreadyPicked = m.id !== value && selectedMoves.includes(m.id);
            return (
              <div
                key={m.id}
                onClick={() => { if (!alreadyPicked) pick(m); }}
                style={{ padding: '5px 10px', cursor: alreadyPicked ? 'not-allowed' : 'pointer', background: i === highlighted ? '#1a2a3a' : 'transparent', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: alreadyPicked ? '#555' : '#fff', borderBottom: '1px solid #1a1a2e' }}
              >
                <span style={{ flex: 1, textDecoration: alreadyPicked ? 'line-through' : 'none' }}>{m.name}</span>
                <span style={{ background: TYPE_COLORS[m.type] ?? '#555', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10, opacity: alreadyPicked ? 0.4 : 1 }}>{m.type}</span>
                <span style={{ background: CAT_COLOR[m.category] ?? '#888', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10, opacity: alreadyPicked ? 0.4 : 1 }}>{CAT[m.category]}</span>
                <span style={{ color: '#aaa', minWidth: 24, textAlign: 'right' }}>{m.basePower > 0 ? m.basePower : '—'}</span>
                <span style={{ color: '#555', minWidth: 30, textAlign: 'right' }}>{m.pp}pp</span>
                {alreadyPicked && <span style={{ fontSize: 9 }}>already picked</span>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <input type="checkbox" checked={allMovesMode} onChange={(e) => toggleAllMovesMode(e.target.checked)} />
        <span style={{ fontSize: 10, color: allMovesMode ? '#f0c040' : '#555' }}>Search all moves</span>
        {allMovesMode && <span style={{ fontSize: 10, color: '#444' }}>(type ≥ 2 chars)</span>}
      </div>
    </div>
  );
}
