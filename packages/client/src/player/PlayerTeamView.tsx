import { useState } from 'react';
import type { PokemonSet } from '@poke-fighter/shared';
import { NicknameModal } from './NicknameModal.js';
import { ItemEquipDropdown } from './ItemEquipDropdown.js';

interface Props {
  team: PokemonSet[];
  onTeamChange: (team: PokemonSet[]) => void;
  onBankMove: (pokemon: PokemonSet, index: number) => void;
  inventory?: Record<string, number>;
  leasedItems?: Record<string, number>;
}

export function PlayerTeamView({ team, onTeamChange, onBankMove, inventory, leasedItems }: Props) {
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [equippingIndex, setEquippingIndex] = useState<number | null>(null);

  function swap(i: number, j: number) {
    const next = [...team];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    onTeamChange(next);
  }

  function handleRename(index: number, nickname: string) {
    const next = [...team];
    next[index] = { ...next[index]!, nickname };
    onTeamChange(next);
    setRenamingIndex(null);
  }

  function handleUnequip(index: number) {
    const next = [...team];
    const { heldItem: _removed, ...rest } = next[index]!;
    next[index] = rest as PokemonSet;
    onTeamChange(next);
  }

  function handleEquip(index: number, itemId: string) {
    const next = [...team];
    next[index] = { ...next[index]!, heldItem: itemId };
    onTeamChange(next);
    setEquippingIndex(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {team.map((pokemon, i) => (
        <div key={i} style={rowStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <button
              onClick={() => swap(i, i - 1)}
              disabled={i === 0}
              aria-label="Move up"
              style={arrowBtn(i === 0)}
            >▲</button>
            <button
              onClick={() => swap(i, i + 1)}
              disabled={i === team.length - 1}
              aria-label="Move down"
              style={arrowBtn(i === team.length - 1)}
            >▼</button>
          </div>

          <img
            src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.speciesId}.png`}
            style={{ width: 40, height: 40, imageRendering: 'pixelated' }}
            alt=""
          />

          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 12 }}>{pokemon.nickname}</div>
            <div style={{ color: '#aaa', fontSize: 10 }}>Lv.{pokemon.level}</div>
            {pokemon.heldItem && (
              <div style={{ color: '#f0c040', fontSize: 9 }}>{pokemon.heldItem}</div>
            )}
          </div>

          {pokemon.heldItem ? (
            <button onClick={() => handleUnequip(i)} style={actionBtn('#7f8c8d')}>UNEQUIP</button>
          ) : inventory !== undefined ? (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setEquippingIndex(i)} style={actionBtn('#8e44ad')}>EQUIP</button>
              {equippingIndex === i && (
                <div style={{ position: 'absolute', right: 0, top: '100%', width: 180, zIndex: 20 }}>
                  <ItemEquipDropdown
                    {...(pokemon.heldItem !== undefined ? { currentHeldItem: pokemon.heldItem } : {})}
                    inventory={inventory}
                    leasedItems={leasedItems ?? {}}
                    onEquip={(itemId) => handleEquip(i, itemId)}
                    onClose={() => setEquippingIndex(null)}
                  />
                </div>
              )}
            </div>
          ) : null}

          <button onClick={() => setRenamingIndex(i)} style={actionBtn('#2980b9')}>RENAME</button>
          <button onClick={() => onBankMove(pokemon, i)} style={actionBtn('#c0392b')}>→ BANK</button>
        </div>
      ))}

      {renamingIndex !== null && team[renamingIndex] !== undefined && (
        <NicknameModal
          currentNickname={team[renamingIndex]!.nickname}
          onSave={(nick) => handleRename(renamingIndex, nick)}
          onCancel={() => setRenamingIndex(null)}
        />
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, padding: '6px 10px',
};
function arrowBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'none', border: 'none', color: disabled ? '#444' : '#aaa',
    cursor: disabled ? 'default' : 'pointer', padding: '0 2px', fontSize: 9, lineHeight: 1,
  };
}
function actionBtn(bg: string): React.CSSProperties {
  return {
    background: bg, border: 'none', color: '#fff', padding: '4px 8px',
    borderRadius: 3, fontSize: 9, cursor: 'pointer', letterSpacing: 1, fontFamily: 'inherit',
  };
}
