import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { ItemSearchDropdown } from './ItemSearchDropdown.js';
import type { HeldItem } from '@poke-fighter/shared';

interface Props {
  inventory: Record<string, number>;
  onInventoryChange: (inventory: Record<string, number>) => void;
}

export function InventoryTab({ inventory, onInventoryChange }: Props) {
  const [items, setItems] = useState<HeldItem[]>([]);
  const [addingItem, setAddingItem] = useState('');

  useEffect(() => {
    const socket = getSocket();
    function handleResults(payload: { resource: string; results: unknown[] }) {
      if (payload.resource !== 'items') return;
      setItems(payload.results as HeldItem[]);
    }
    socket.on('data:results', handleResults);
    socket.emit('admin:action', { type: 'data:query', data: { resource: 'items' } } as any);
    return () => { socket.off('data:results', handleResults); };
  }, []);

  const itemNameMap = new Map(items.map((i) => [i.name.toLowerCase().replace(/\s+/g, '-'), i.name]));
  const entries = Object.entries(inventory).filter(([, qty]) => qty > 0);

  function adjust(itemId: string, delta: number) {
    const next = { ...inventory };
    const qty = (next[itemId] ?? 0) + delta;
    if (qty <= 0) {
      delete next[itemId];
    } else {
      next[itemId] = qty;
    }
    onInventoryChange(next);
  }

  function handleAddItem(itemId: string) {
    if (!itemId) return;
    onInventoryChange({ ...inventory, [itemId]: (inventory[itemId] ?? 0) + 1 });
    setAddingItem('');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#8e44ad', fontSize: 11, letterSpacing: 2 }}>
          INVENTORY — {entries.length} item type{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 300 }}>
        <div style={{ color: '#aaa', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>ADD ITEM</div>
        <ItemSearchDropdown value={addingItem} onChange={handleAddItem} />
      </div>

      {entries.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 32, fontSize: 13 }}>
          No items in inventory. Search above to add one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(([itemId, qty]) => (
            <div
              key={itemId}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 4, padding: '6px 10px' }}
            >
              <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>{itemNameMap.get(itemId) ?? itemId}</span>
              <span style={{ background: '#8e44ad', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11, minWidth: 28, textAlign: 'center' }}>{qty}</span>
              <button onClick={() => adjust(itemId, -1)} style={qtyBtn}>−</button>
              <button onClick={() => adjust(itemId, 1)} style={qtyBtn}>+</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const qtyBtn: React.CSSProperties = {
  background: '#2c2c3e',
  border: '1px solid #444',
  color: '#fff',
  width: 22,
  height: 22,
  borderRadius: 3,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  padding: 0,
  lineHeight: '1',
};
