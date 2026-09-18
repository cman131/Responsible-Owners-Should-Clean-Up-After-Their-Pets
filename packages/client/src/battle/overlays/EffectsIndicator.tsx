import { useState } from 'react';
import type { PartyMember, StatBoosts, StatusCondition } from '@poke-fighter/shared';

// fnt is required by Record<StatusCondition, string> but is unreachable:
// the component guards with `if (mon.fainted) return null` before building chips.
const STATUS_LABELS: Record<StatusCondition, string> = {
  brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ',
  psn: 'PSN', tox: 'TOX', fnt: 'FNT',
};

const STATUS_COLORS: Record<StatusCondition, string> = {
  brn: '#e67e22', par: '#f0c040', slp: '#95a5a6', frz: '#a8d8ea',
  psn: '#9b59b6', tox: '#6c3483', fnt: '#555',
};

const VOLATILE_ABBREV: Record<string, string> = {
  confusion: 'CNF',
  'leech-seed': 'SEED',
  encore: 'ENC',
};

const STAT_LABELS: Array<{ key: keyof StatBoosts; label: string }> = [
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'spa', label: 'SP.ATK' },
  { key: 'spd', label: 'SP.DEF' },
  { key: 'spe', label: 'SPE' },
  { key: 'accuracy', label: 'ACC' },
  { key: 'evasion', label: 'EVA' },
];

const MAX_VISIBLE = 3;

interface Chip {
  id: string;
  label: string;
  color: string;
}

function abbrev(name: string): string {
  return VOLATILE_ABBREV[name] ?? name.slice(0, 3).toUpperCase();
}

function hasAnyBoost(boosts: StatBoosts): boolean {
  return Object.values(boosts).some((v) => v !== 0);
}

function buildChips(mon: PartyMember): Chip[] {
  const chips: Chip[] = [];
  if (mon.status) {
    chips.push({ id: `status-${mon.status}`, label: STATUS_LABELS[mon.status], color: STATUS_COLORS[mon.status] });
  }
  for (const vs of mon.volatileStatus) {
    chips.push({ id: `volatile-${vs.name}`, label: abbrev(vs.name), color: '#3498db' });
  }
  if (chips.length === 0 && hasAnyBoost(mon.statBoosts)) {
    chips.push({ id: 'stat-boost', label: '±', color: '#7f8c8d' });
  }
  return chips;
}

interface Props {
  mon: PartyMember;
}

export function EffectsIndicator({ mon }: Props) {
  const [hovered, setHovered] = useState(false);

  if (mon.fainted) return null;

  const chips = buildChips(mon);
  if (chips.length === 0) return null;

  const visible = chips.slice(0, MAX_VISIBLE);
  const overflow = chips.length - MAX_VISIBLE;

  const nonZeroStats = STAT_LABELS.filter(({ key }) => mon.statBoosts[key] !== 0);
  const zeroStats = STAT_LABELS.filter(({ key }) => mon.statBoosts[key] === 0);
  const hasBoosts = nonZeroStats.length > 0;
  const hasEffects = mon.status !== undefined || mon.volatileStatus.length > 0;

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2, cursor: 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visible.map((chip) => (
        <span
          key={chip.id}
          style={{
            background: chip.color,
            color: '#fff',
            fontSize: 8,
            padding: '1px 4px',
            borderRadius: 2,
            fontWeight: 'bold',
            letterSpacing: 0.5,
          }}
        >
          {chip.label}
        </span>
      ))}
      {overflow > 0 && (
        <span style={{ color: '#888', fontSize: 8 }}>+{overflow}</span>
      )}

      {hovered && (
        <div
          data-testid="effects-popover"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            width: 190,
            background: '#111',
            border: '1px solid #444',
            borderRadius: 4,
            padding: 10,
            zIndex: 100,
          }}
        >
          {hasEffects && (
            <div style={{ marginBottom: hasBoosts ? 8 : 0, paddingBottom: hasBoosts ? 8 : 0, borderBottom: hasBoosts ? '1px solid #333' : 'none' }}>
              <div style={{ color: '#888', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>EFFECTS</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {mon.status && (
                  <span style={{ background: STATUS_COLORS[mon.status], color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 2, fontWeight: 'bold' }}>
                    {STATUS_LABELS[mon.status]}
                  </span>
                )}
                {mon.volatileStatus.map((vs) => (
                  <span key={vs.name} style={{ background: '#3498db', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 2, fontWeight: 'bold' }}>
                    {abbrev(vs.name)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasBoosts && (
            <div>
              <div style={{ color: '#888', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>STAT STAGES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {nonZeroStats.map(({ key, label }) => {
                  const val = mon.statBoosts[key];
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#fff' }}>
                      <span>{label}</span>
                      <div style={{ display: 'flex', gap: 1 }}>
                        {Array.from({ length: Math.abs(val) }, (_, idx) => (
                          <span key={idx} style={{ color: val > 0 ? '#2ecc71' : '#e74c3c', fontSize: 11 }}>
                            {val > 0 ? '+' : '−'}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {zeroStats.length > 0 && (
                <div style={{ color: '#555', fontSize: 9, marginTop: 5 }}>
                  {zeroStats.map(({ label }) => label).join(' · ')} at 0
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
