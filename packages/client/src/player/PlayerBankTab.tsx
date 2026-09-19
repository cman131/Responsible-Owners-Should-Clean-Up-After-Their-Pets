import { useState, useRef } from 'react';
import type { PokemonSet } from '@poke-fighter/shared';
import { NicknameModal } from './NicknameModal.js';

interface Props {
  bank: PokemonSet[];
  partySize: number;
  onBankChange: (bank: PokemonSet[]) => void;
  onMoveToParty: (pokemon: PokemonSet, index: number) => void;
}

interface CardProps {
  pokemon: PokemonSet;
  index: number;
  isSelected: boolean;
  partyFull: boolean;
  onSelect: (index: number | null) => void;
  onRename: (index: number) => void;
  onMoveToParty: (index: number) => void;
}

function BankCard({ pokemon, index, isSelected, partyFull, onSelect, onRename, onMoveToParty }: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [openLeft, setOpenLeft] = useState(false);

  function handleClick() {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setOpenLeft(rect.right + 140 >= window.innerWidth);
    }
    onSelect(isSelected ? null : index);
  }

  return (
    <div ref={cardRef} style={{ position: 'relative' }}>
      <div
        onClick={handleClick}
        style={{ background: '#111', border: `1px solid ${isSelected ? '#3498db' : '#333'}`, borderRadius: 6, padding: 8, width: 80, textAlign: 'center', cursor: 'pointer' }}
      >
        <img
          src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.speciesId}.png`}
          style={{ width: 48, height: 48, imageRendering: 'pixelated' }}
          alt=""
        />
        <div style={{ color: '#fff', fontSize: 9, marginTop: 2 }}>{pokemon.nickname}</div>
        <div style={{ color: '#aaa', fontSize: 8 }}>Lv.{pokemon.level}</div>
      </div>

      {isSelected && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => onSelect(null)} />
          <div
            style={{
              position: 'absolute', top: 0,
              ...(openLeft ? { right: 90 } : { left: 90 }),
              background: '#1a1a2e', border: '1px solid #3498db', borderRadius: 5,
              padding: 6, width: 130, zIndex: 10,
            }}
          >
            <div style={{ color: '#3498db', fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>
              {pokemon.nickname.toUpperCase()}
            </div>
            <button onClick={() => onRename(index)} style={popBtn('#2980b9')}>RENAME</button>
            <button
              onClick={() => !partyFull && onMoveToParty(index)}
              disabled={partyFull}
              style={popBtn(partyFull ? '#333' : '#27ae60', partyFull)}
            >→ PARTY</button>
          </div>
        </>
      )}
    </div>
  );
}

export function PlayerBankTab({ bank, partySize, onBankChange, onMoveToParty }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);

  const partyFull = partySize >= 6;

  function handleRename(index: number) {
    setSelectedIndex(null);
    setRenamingIndex(index);
  }

  function handleRenameSave(nickname: string) {
    if (renamingIndex === null) return;
    const next = [...bank];
    next[renamingIndex] = { ...next[renamingIndex]!, nickname };
    onBankChange(next);
    setRenamingIndex(null);
  }

  function handleMoveToParty(index: number) {
    const pokemon = bank[index];
    if (!pokemon) return;
    onMoveToParty(pokemon, index);
    setSelectedIndex(null);
  }

  return (
    <div>
      <div style={{ color: '#27ae60', fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>
        BANK — {bank.length} Pokémon
      </div>

      {bank.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 32, fontSize: 13 }}>
          No Pokémon in bank.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {bank.map((pokemon, index) => (
            <BankCard
              key={index}
              pokemon={pokemon}
              index={index}
              isSelected={selectedIndex === index}
              partyFull={partyFull}
              onSelect={setSelectedIndex}
              onRename={handleRename}
              onMoveToParty={handleMoveToParty}
            />
          ))}
        </div>
      )}

      {renamingIndex !== null && bank[renamingIndex] !== undefined && (
        <NicknameModal
          currentNickname={bank[renamingIndex]!.nickname}
          onSave={handleRenameSave}
          onCancel={() => setRenamingIndex(null)}
        />
      )}
    </div>
  );
}

function popBtn(bg: string, disabled = false): React.CSSProperties {
  return {
    display: 'block', width: '100%', background: bg, border: 'none', color: '#fff',
    padding: '4px 0', borderRadius: 3, fontSize: 9, cursor: disabled ? 'not-allowed' : 'pointer',
    marginBottom: 3, letterSpacing: 1, fontFamily: 'inherit',
  };
}
