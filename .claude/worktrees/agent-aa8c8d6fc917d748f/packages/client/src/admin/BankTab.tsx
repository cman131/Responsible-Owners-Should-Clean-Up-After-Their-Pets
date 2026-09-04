import { useState } from 'react';
import type { PokemonSet } from '@poke-fighter/shared';
import { PokemonSlotEditor } from './PokemonSlotEditor.js';

interface Props {
  bank: PokemonSet[];
  teamSize: number;
  onBankChange: (bank: PokemonSet[]) => void;
  onMoveToTeam: (pokemon: PokemonSet) => void;
}

type ModalState = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; index: number };

export function BankTab({ bank, teamSize, onBankChange, onMoveToTeam }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [draft, setDraft] = useState<Partial<PokemonSet>>({});

  const teamFull = teamSize >= 6;

  function openAdd() {
    setDraft({});
    setModal({ kind: 'add' });
  }

  function openEdit(index: number) {
    const entry = bank[index]!;
    setDraft({ ...entry, evs: { ...entry.evs }, ivs: { ...entry.ivs } });
    setModal({ kind: 'edit', index });
    setSelectedIndex(null);
  }

  function handleModalSave() {
    if (!draft.speciesId) return;
    if (modal.kind === 'add') {
      onBankChange([...bank, draft as PokemonSet]);
    } else if (modal.kind === 'edit') {
      const next = [...bank];
      next[modal.index] = draft as PokemonSet;
      onBankChange(next);
    }
    setModal({ kind: 'closed' });
  }

  function handleRemove(index: number) {
    onBankChange(bank.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }

  function handleMoveToTeam(pokemon: PokemonSet, index: number) {
    onMoveToTeam(pokemon);
    onBankChange(bank.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#27ae60', fontSize: 11, letterSpacing: 2 }}>BANK — {bank.length} Pokémon</span>
        <button onClick={openAdd} style={addBtn}>+ ADD TO BANK</button>
      </div>

      {bank.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 32, fontSize: 13 }}>
          No pokemon in bank. Click the button above to add one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {bank.map((pokemon, index) => (
            <div key={index} style={{ position: 'relative' }}>
              <div
                onClick={() => setSelectedIndex(index === selectedIndex ? null : index)}
                style={{ background: '#111', border: `1px solid ${selectedIndex === index ? '#3498db' : '#333'}`, borderRadius: 6, padding: 8, width: 80, textAlign: 'center', cursor: 'pointer' }}
              >
                <img
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.speciesId}.png`}
                  style={{ width: 48, height: 48, imageRendering: 'pixelated' }}
                  alt=""
                />
                <div style={{ color: '#fff', fontSize: 9, marginTop: 2 }}>{pokemon.nickname}</div>
                <div style={{ color: '#aaa', fontSize: 8 }}>Lv.{pokemon.level}</div>
              </div>

              {selectedIndex === index && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setSelectedIndex(null)} />
                  <div style={{ position: 'absolute', top: 0, left: 90, background: '#1a1a2e', border: '1px solid #3498db', borderRadius: 5, padding: 6, width: 130, zIndex: 10 }}>
                    <div style={{ color: '#3498db', fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>{pokemon.nickname.toUpperCase()}</div>
                    <button onClick={() => openEdit(index)} style={popBtn('#2980b9')}>✏ EDIT</button>
                    <button
                      onClick={() => !teamFull && handleMoveToTeam(pokemon, index)}
                      disabled={teamFull}
                      style={popBtn(teamFull ? '#333' : '#27ae60', teamFull)}
                    >→ MOVE TO TEAM</button>
                    <button onClick={() => handleRemove(index)} style={popBtn('#c0392b')}>✕ REMOVE</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {modal.kind !== 'closed' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, width: 520, maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ background: '#111', borderBottom: '1px solid #333', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span data-modal-title style={{ color: '#3498db', fontSize: 11, letterSpacing: 2 }}>
                {modal.kind === 'add' ? 'ADD TO BANK' : 'EDIT POKÉMON'}
              </span>
              <button onClick={() => setModal({ kind: 'closed' })} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <PokemonSlotEditor value={draft} onChange={setDraft} />
            </div>
            <div style={{ padding: '8px 16px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal({ kind: 'closed' })} style={{ background: '#333', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>CANCEL</button>
              <button
                onClick={handleModalSave}
                disabled={!draft.speciesId}
                style={{ background: draft.speciesId ? '#2980b9' : '#555', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, cursor: draft.speciesId ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 11 }}
              >SAVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const addBtn: React.CSSProperties = { background: '#27ae60', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1 };
function popBtn(bg: string, disabled = false): React.CSSProperties {
  return { display: 'block', width: '100%', background: bg, border: 'none', color: '#fff', padding: '4px 0', borderRadius: 3, fontSize: 9, cursor: disabled ? 'not-allowed' : 'pointer', marginBottom: 3, letterSpacing: 1, fontFamily: 'inherit' };
}
