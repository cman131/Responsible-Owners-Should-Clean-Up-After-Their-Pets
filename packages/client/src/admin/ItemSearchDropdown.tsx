import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { HeldItem } from '@poke-fighter/shared';

interface Props {
  value: string;   // hyphenated id, e.g. 'focus-sash', '' if none
  onChange: (itemId: string) => void;  // emits hyphenated id or '' to clear
  equippableOnly?: boolean;
  speciesName?: string;
  availabilityMap?: Record<string, number>;
}

function normalizeItemId(item: HeldItem): string {
  return item.name.toLowerCase().replace(/\s+/g, '-');
}

export function ItemSearchDropdown({ value, onChange, equippableOnly, speciesName, availabilityMap }: Props) {
  const [items, setItems] = useState<HeldItem[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    function handleResults(payload: { resource: string; results: unknown[] }) {
      if (payload.resource !== 'items') return;
      const received = payload.results as HeldItem[];
      const localFiltered = speciesName !== undefined
        ? received.filter((i) => !i.speciesRestriction || i.speciesRestriction === speciesName)
        : received;
      setItems(localFiltered);
    }
    socket.on('data:results', handleResults);
    const data: Record<string, unknown> = { resource: 'items' };
    if (equippableOnly) data['equippableOnly'] = true;
    if (speciesName !== undefined) data['speciesName'] = speciesName;
    socket.emit('admin:action', { type: 'data:query', data } as any);
    return () => { socket.off('data:results', handleResults); };
  }, [equippableOnly, speciesName]);

  const selectedItem = items.find((i) => normalizeItemId(i) === value) ?? null;
  const filtered = query
    ? items.filter((i) => i.id.toLowerCase().includes(query.toLowerCase()) || i.name.toLowerCase().includes(query.toLowerCase()))
    : items;

  function pick(item: HeldItem) {
    onChange(normalizeItemId(item));
    setQuery('');
    setOpen(false);
  }

  function clear() {
    onChange('');
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open || !filtered.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = filtered[highlighted]; if (item) pick(item); }
  }

  if (value && selectedItem) {
    return (
      <div style={{ background: '#0d1a2e', border: '1px solid #2980b9', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ color: '#fff', flex: 1 }}>{selectedItem.name}</span>
        {selectedItem.isBerry && (
          <span style={{ background: '#27ae60', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Berry</span>
        )}
        <button onClick={clear} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
      </div>
    );
  }

  if (value && !selectedItem) {
    return (
      <div style={{ background: '#0d1a2e', border: '1px solid #555', borderRadius: 4, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ color: '#888', flex: 1, fontStyle: 'italic' }}>{value}</span>
        <button onClick={clear} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setHighlighted(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search items..."
        style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
          {filtered.map((item, i) => {
            const normalizedId = normalizeItemId(item);
            const available = availabilityMap !== undefined ? (availabilityMap[normalizedId] ?? Infinity) : Infinity;
            const unavailable = available <= 0;
            return (
              <div
                key={item.id}
                onClick={() => pick(item)}
                style={{ padding: '5px 10px', cursor: 'pointer', background: i === highlighted ? '#1a2a3a' : 'transparent', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: unavailable ? '#666' : '#fff', borderBottom: '1px solid #1a1a2e' }}
              >
                <span style={{ flex: 1 }}>{item.name}</span>
                {item.isBerry && (
                  <span style={{ background: '#27ae60', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Berry</span>
                )}
                {unavailable && (
                  <span style={{ color: '#e74c3c', fontSize: 10 }}>0 available</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
