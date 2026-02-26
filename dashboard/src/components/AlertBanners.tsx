import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { TransactionRow } from '../api/predict';

type AlertBannersProps = {
  transactions: TransactionRow[];
};

export function AlertBanners({ transactions }: AlertBannersProps) {
  const blocks = transactions.filter((t) => t.decision === 'BLOCK');
  const verifies = transactions.filter((t) => t.decision === 'VERIFY');
  const blocksWithAlert = blocks.filter((t) => t.fraud_alert_sent && t.phone_number);

  return (
    <div className="alert-banners">
      {blocks.length > 0 && (
        <div className="alert-banner alert-banner--block" role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>Fraud alert</strong>: {blocks.length} transaction(s) blocked due to high fraud risk.
            {blocksWithAlert.length > 0 && (
              <span className="alert-banner__sub"> Fraud alert SMS sent to mobile number(s).</span>
            )}
          </div>
        </div>
      )}
      {verifies.length > 0 && (
        <div className="alert-banner alert-banner--verify" role="alert">
          <ShieldAlert size={20} />
          <div>
            <strong>Verification required</strong>: {verifies.length} transaction(s) need additional verification.
          </div>
        </div>
      )}
      <style>{`
        .alert-banners {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .alert-banner {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          border-radius: var(--card-radius);
          border: 1px solid;
          animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .alert-banner--block {
          background: var(--color-block-bg);
          border-color: var(--color-block);
          color: #991b1b;
        }
        .alert-banner--block svg { color: var(--color-block); flex-shrink: 0; }
        .alert-banner__sub { display: block; margin-top: 0.25rem; font-size: 0.875rem; opacity: 0.95; }
        .alert-banner--verify {
          background: var(--color-verify-bg);
          border-color: var(--color-verify);
          color: #92400e;
        }
        .alert-banner--verify svg { color: var(--color-verify); flex-shrink: 0; }
      `}</style>
    </div>
  );
}
