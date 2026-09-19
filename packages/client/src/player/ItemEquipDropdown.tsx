import { useState, useEffect, useMemo } from 'react';
import { getSocket } from '../socket.js';
import type { HeldItem } from '@poke-fighter/shared';

interface Props {
  speciesName?: string;
  currentHeldItem?: string;
  inventory: Record<string, number>;
  leasedItems: Record<string, number>;
  onEquip: (itemId: string) => void;
  onClose: () => void;
}

function normalizeId(item: HeldItem): string {
  return item.name.toLowerCase().replace(/\s+/g, '-');
}

export function ItemEquipDropdown({ speciesName, currentHeldItem, inventory, leasedItems, onEquip, onClose }: Props) {
  const [allItems, setAllItems] = useState<HeldItem[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const socket = getSocket();
    function handleItems(payload: { results: HeldItem[] }) {
      setAllItems(payload.results);
    }
    socket.on('player:portal-items', handleItems);
    const queryPayload: { speciesName?: string } = {};
    if (speciesName !== undefined) queryPayload.speciesName = speciesName;
    socket.emit('player:portal-items-query', queryPayload);
    return () => { socket.off('player:portal-items', handleItems); };
  }, [speciesName]);

  const visibleItems = useMemo(() => {
    return allItems.filter((item) => {
      const id = normalizeId(item);
      const owned = inventory[id] ?? 0;
      const leased = leasedItems[id] ?? 0;
      const ownHeld = currentHeldItem === id ? 1 : 0;
      return owned - leased + ownHeld > 0;
    });
  }, [allItems, inventory, leasedItems, currentHeldItem]);

  const filtered = query
    ? visibleItems.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : visibleItems;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div style={{ position: 'relative', zIndex: 10 }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          placeholder="Search items..."
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 11, width: '100%', boxSizing: 'border-box' as const }}
        />
        {filtered.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 150, overflowY: 'auto', zIndex: 10 }}>
            {filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => { onEquip(normalizeId(item)); }}
                style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: '#fff', borderBottom: '1px solid #1a1a2e' }}
              >
                {item.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
