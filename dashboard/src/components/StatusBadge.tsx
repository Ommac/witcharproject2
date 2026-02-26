import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { Decision } from '../api/predict';

type StatusBadgeProps = {
  decision: Decision;
};

const config: Record<Decision, { Icon: typeof ShieldCheck; label: string; className: string }> = {
  APPROVED: { Icon: ShieldCheck, label: 'Approved', className: 'status-badge--approved' },
  VERIFY: { Icon: ShieldAlert, label: 'Verify', className: 'status-badge--verify' },
  BLOCK: { Icon: ShieldX, label: 'Block', className: 'status-badge--block' },
};

export function StatusBadge({ decision }: StatusBadgeProps) {
  const { Icon, label, className } = config[decision];
  return (
    <span className={`status-badge ${className}`}>
      <Icon size={14} />
      <span>{label}</span>
      <style>{`
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          transition: background-color var(--transition-fast), color var(--transition-fast);
        }
        .status-badge--approved {
          background: var(--color-approved-bg);
          color: var(--color-approved);
        }
        .status-badge--verify {
          background: var(--color-verify-bg);
          color: var(--color-verify);
        }
        .status-badge--block {
          background: var(--color-block-bg);
          color: var(--color-block);
        }
      `}</style>
    </span>
  );
}
