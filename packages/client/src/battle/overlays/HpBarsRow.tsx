import type { SlotState } from '@poke-fighter/shared';
import { EffectsIndicator } from './EffectsIndicator.js';

interface Props {
  slots: SlotState[];
  label: string;
  variant: 'enemy' | 'own';
  highlightSlotId?: string;
}

function hpColor(current: number, max: number): string {
  const pct = current / max;
  if (pct > 0.5) return '#27ae60';
  if (pct > 0.2) return '#f39c12';
  return '#e74c3c';
}

export function HpBarsRow({ slots, label, variant, highlightSlotId }: Props) {
  const borderColor = variant === 'enemy' ? '#555' : '#2980b9';
  const labelColor = variant === 'enemy' ? '#e74c3c' : '#3498db';

  return (
    <div style={{ width: 800, background: '#0d0d1a', border: `1px solid ${borderColor}`, borderRadius: 4, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ color: labelColor, fontSize: 9, letterSpacing: 1 }}>{label}</span>
      {slots.map((slot) => {
        const mon = slot.party[slot.activePokemonIndex];
        const isHighlighted = highlightSlotId !== undefined && slot.slotId === highlightSlotId;
        const nameColor = isHighlighted ? '#fff' : (highlightSlotId !== undefined ? '#aaa' : '#fff');
        return (
          <div
            key={slot.slotId}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: isHighlighted ? '#0d1a2e' : 'transparent', borderRadius: 2, padding: '2px 4px' }}
          >
            {highlightSlotId !== undefined && (
              <span style={{ color: '#f0c040', fontSize: 10, width: 14 }}>
                {isHighlighted ? '▶' : ''}
              </span>
            )}
            <span style={{ color: nameColor, fontSize: 10, width: 130 }}>
              {slot.displayName}{mon ? ` L${mon.level}` : ''}
            </span>
            {mon && !mon.fainted ? (
              <>
                <div style={{ flex: 1, background: '#333', height: 6, borderRadius: 3 }}>
                  <div style={{ background: hpColor(mon.currentHp, mon.maxHp), height: 6, borderRadius: 3, width: `${(mon.currentHp / mon.maxHp) * 100}%` }} />
                </div>
                <span style={{ color: '#aaa', fontSize: 9, width: 65, textAlign: 'right' }}>
                  {mon.currentHp}/{mon.maxHp}
                </span>
                <EffectsIndicator mon={mon} />
              </>
            ) : (
              <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
