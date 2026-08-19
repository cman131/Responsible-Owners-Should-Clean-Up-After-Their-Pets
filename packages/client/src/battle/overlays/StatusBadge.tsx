import type { StatusCondition } from '@poke-fighter/shared';

const STATUS_LABELS: Record<StatusCondition, string> = {
  brn: 'BRN',
  par: 'PAR',
  slp: 'SLP',
  frz: 'FRZ',
  psn: 'PSN',
  tox: 'TOX',
  fnt: 'FNT',
};

const STATUS_COLORS: Record<StatusCondition, string> = {
  brn: '#e67e22',
  par: '#f0c040',
  slp: '#95a5a6',
  frz: '#a8d8ea',
  psn: '#9b59b6',
  tox: '#6c3483',
  fnt: '#555',
};

interface Props {
  status: StatusCondition | undefined;
}

export function StatusBadge({ status }: Props) {
  if (!status) return null;
  return (
    <span
      style={{
        background: STATUS_COLORS[status] ?? '#555',
        color: '#fff',
        fontSize: 10,
        padding: '1px 5px',
        borderRadius: 2,
        letterSpacing: 1,
        fontWeight: 'bold',
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
