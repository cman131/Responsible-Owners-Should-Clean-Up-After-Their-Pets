import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, connectAsPlayerPortal } from '../socket.js';
import type { PlayerProfile, PokemonSet } from '@poke-fighter/shared';
import { PlayerTeamView } from '../player/PlayerTeamView.js';
import { PlayerBankTab } from '../player/PlayerBankTab.js';

type Phase = 'entry' | 'loading' | 'portal';
type ActiveTab = 'team' | 'bank' | 'inventory';
type SaveStatus = 'idle' | 'saving' | 'saved';

export function PlayerPortalPage() {
  const [phase, setPhase] = useState<Phase>('entry');
  const [playerKey, setPlayerKey] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [roster, setRoster] = useState<Array<{ profileId: string; displayName: string }>>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [localTeam, setLocalTeam] = useState<PokemonSet[]>([]);
  const [localBank, setLocalBank] = useState<PokemonSet[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('team');
  const navigate = useNavigate();

  const leasedItems = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of [...localTeam, ...localBank]) {
      if (p.heldItem) {
        map[p.heldItem] = (map[p.heldItem] ?? 0) + 1;
      }
    }
    return map;
  }, [localTeam, localBank]);

  useEffect(() => {
    connectAsPlayerPortal();
    const socket = getSocket();
    socket.emit('player:portal-roster-request');

    socket.on('player:portal-roster', (payload: { players: Array<{ profileId: string; displayName: string }> }) => {
      setRoster(payload.players);
    });

    socket.on('player:portal-data', (payload: { profile: PlayerProfile }) => {
      const p = payload.profile;
      setProfile(p);
      setLocalTeam(p.defaultTeam?.pokemon ?? []);
      setLocalBank(p.bank ?? []);
      setSaveError(null);
      if (phase === 'loading') {
        setPhase('portal');
      } else {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    });

    socket.on('player:portal-error', (payload: { message: string }) => {
      if (phase === 'loading') {
        setAuthError(payload.message);
        setPhase('entry');
      } else {
        setSaveError(payload.message);
        setSaveStatus('idle');
      }
    });

    return () => {
      socket.off('player:portal-roster');
      socket.off('player:portal-data');
      socket.off('player:portal-error');
    };
  }, [phase]);

  function handleSubmit() {
    setAuthError(null);
    setPhase('loading');
    getSocket().emit('player:portal-auth', { profileId: selectedProfileId, playerKey });
  }

  function handleSave() {
    if (!profile) return;
    setSaveStatus('saving');
    setSaveError(null);
    getSocket().emit('player:portal-save', {
      profileId: profile.profileId,
      team: localTeam,
      bank: localBank,
    });
  }

  function handleDiscard() {
    if (!profile) return;
    setLocalTeam(profile.defaultTeam?.pokemon ?? []);
    setLocalBank(profile.bank ?? []);
    setSaveError(null);
  }

  function handleBankMoveFromTeam(pokemon: PokemonSet, index: number) {
    setLocalTeam(localTeam.filter((_, i) => i !== index));
    setLocalBank([...localBank, pokemon]);
  }

  function handleMoveToPartyFromBank(pokemon: PokemonSet, index: number) {
    setLocalBank(localBank.filter((_, i) => i !== index));
    setLocalTeam([...localTeam, pokemon]);
  }

  if (phase === 'loading') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <p style={styles.loadingText}>Authenticating…</p>
        </div>
      </div>
    );
  }

  if (phase === 'portal' && profile !== null) {
    const inventory = profile.inventory ?? {};
    const inventoryEntries = Object.entries(inventory);

    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={{ ...styles.box, maxWidth: 600, minWidth: 400 }}>
          <h2 style={styles.displayName}>{profile.displayName}</h2>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabButton, ...(activeTab === 'team' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('team')}
            >Team</button>
            <button
              style={{ ...styles.tabButton, ...(activeTab === 'bank' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('bank')}
            >Bank</button>
            <button
              style={{ ...styles.tabButton, ...(activeTab === 'inventory' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('inventory')}
            >Inventory</button>
          </div>
          <div style={styles.tabContent}>
            {activeTab === 'team' && (
              localTeam.length === 0
                ? <p style={styles.placeholder}>No Pokémon in party.</p>
                : <PlayerTeamView
                    team={localTeam}
                    onTeamChange={setLocalTeam}
                    onBankMove={handleBankMoveFromTeam}
                    inventory={inventory}
                    leasedItems={leasedItems}
                  />
            )}
            {activeTab === 'bank' && (
              <PlayerBankTab
                bank={localBank}
                partySize={localTeam.length}
                onBankChange={setLocalBank}
                onMoveToParty={handleMoveToPartyFromBank}
                inventory={inventory}
                leasedItems={leasedItems}
              />
            )}
            {activeTab === 'inventory' && (
              inventoryEntries.length === 0
                ? <p style={styles.placeholder}>No items in inventory.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {inventoryEntries.map(([itemId, qty]) => (
                      <div key={itemId} style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #222' }}>
                        <span>{itemId}</span>
                        <span style={{ color: '#aaa' }}>×{qty}</span>
                      </div>
                    ))}
                  </div>
                )
            )}
          </div>

          {saveError && <p style={styles.error}>{saveError}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {saveStatus === 'saved' && <span style={styles.savedIndicator}>Saved!</span>}
            <button onClick={handleDiscard} style={styles.discardBtn}>DISCARD</button>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              style={{ ...styles.saveBtn, opacity: saveStatus === 'saving' ? 0.6 : 1 }}
            >SAVE CHANGES</button>
          </div>

          <button style={styles.backLink} onClick={() => navigate('/')}>
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const canSubmit = selectedProfileId !== '' && playerKey.trim() !== '';

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>POKE FIGHTER</h1>
      <div style={styles.box}>
        <div style={styles.sectionLabel}>Player Portal</div>
        <select
          style={styles.select}
          value={selectedProfileId}
          onChange={(e) => setSelectedProfileId(e.target.value)}
        >
          <option value="">— Select Player —</option>
          {roster.map((p) => (
            <option key={p.profileId} value={p.profileId}>{p.displayName}</option>
          ))}
        </select>
        <input
          style={styles.input}
          type="text"
          placeholder="Player Key"
          value={playerKey}
          onChange={(e) => setPlayerKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
        />
        {authError && <p style={styles.error}>{authError}</p>}
        <button
          style={{ ...styles.button, opacity: canSubmit ? 1 : 0.5 }}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          ENTER
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 48, letterSpacing: 8, color: '#f0c040' },
  box: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 14, minWidth: 320, maxWidth: 400 },
  sectionLabel: { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const },
  select: { width: '100%', padding: 8, background: '#1a1a2e', color: '#fff', border: '1px solid #3498db', borderRadius: 4, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  input: { width: '100%', padding: 8, background: '#1a1a2e', color: '#fff', border: '1px solid #3498db', borderRadius: 4, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  error: { color: '#e74c3c', fontSize: 12 },
  button: { background: '#2980b9', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
  loadingText: { color: '#aaa', fontSize: 14, textAlign: 'center' as const },
  displayName: { color: '#f0c040', fontSize: 24, letterSpacing: 2, margin: 0 },
  tabs: { display: 'flex', gap: 8, borderBottom: '1px solid #333', paddingBottom: 8 },
  tabButton: { background: 'transparent', color: '#aaa', border: 'none', padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1 },
  tabActive: { color: '#3498db', borderBottom: '2px solid #3498db' },
  tabContent: { minHeight: 80 },
  placeholder: { color: '#555', fontSize: 13 },
  backLink: { background: 'transparent', color: '#aaa', border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, padding: 0, marginTop: 8 },
  saveBtn: { background: '#27ae60', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1 },
  discardBtn: { background: '#555', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1 },
  savedIndicator: { color: '#27ae60', fontSize: 11, letterSpacing: 1 },
};
