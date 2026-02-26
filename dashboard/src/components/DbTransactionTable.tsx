import type { JSX } from 'react';
import type { DbTransaction } from '../api/transactions';

type DbTransactionTableProps = {
  transactions: DbTransaction[];
  loading: boolean;
  error: string | null;
};

export function DbTransactionTable({ transactions, loading, error }: DbTransactionTableProps) {
  if (loading && transactions.length === 0) {
    return (
      <div className="table-empty">
        <p>Loading latest transactions...</p>
        <InlineStyles />
      </div>
    );
  }

  if (error) {
    return (
      <div className="table-empty table-empty--error">
        <p>Unable to load transactions.</p>
        <p className="table-empty__detail">{error}</p>
        <InlineStyles />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="table-empty">
        <p>No transactions yet. Data will appear here in real-time.</p>
        <InlineStyles />
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="tx-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Mobile</th>
            <th>Amount</th>
            <th>Location</th>
            <th>Device</th>
            <th>Risk</th>
            <th>Decision</th>
            <th>Status</th>
            <th>Risk Factors</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const rowClass = getRowClass(tx.status);
            const riskTitle = formatRiskTooltip(tx.risk_score, tx.amount, tx.behavior_score);
            const statusExplanation = explainStatus(tx.status, tx.decision);
            const contributors = getTopRiskContributors(tx);
            return (
              <tr
                key={tx._id}
                className={['tx-table__row', rowClass].filter(Boolean).join(' ')}
              >
                <td>{tx.user_id}</td>
                <td>{tx.mobile_number ?? '—'}</td>
                <td>{formatAmount(tx.amount)}</td>
                <td>{tx.location}</td>
                <td>{tx.device}</td>
                <td>
                  <span className="tx-table__risk" title={riskTitle}>
                    {Number.isFinite(tx.risk_score) ? Math.round(tx.risk_score) : '—'}
                  </span>
                </td>
                <td>
                  <div className="tx-table__stack">
                    <div className="tx-table__primary">{formatDecision(tx.decision)}</div>
                    {statusExplanation && <div className="tx-table__explain">{statusExplanation}</div>}
                  </div>
                </td>
                <td className="tx-table__status">
                  <div className="tx-table__stack">
                    <div className="tx-table__primary">{formatStatus(tx.status)}</div>
                    {statusExplanation && <div className="tx-table__explain">{statusExplanation}</div>}
                  </div>
                </td>
                <td>
                  <div className="tx-table__factors">
                    {formatRiskFactors(tx.behavior_reasons)}
                    {contributors.length > 0 && (
                      <div className="tx-table__contributors">
                        <div className="tx-table__contributors-title">Risk influenced by:</div>
                        <ul className="tx-table__contributors-list">
                          {contributors.slice(0, 3).map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </td>
                <td>{formatTime(tx.timestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <InlineStyles />
    </div>
  );
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string): string {
  const date = parseApiUtcTimestamp(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function parseApiUtcTimestamp(value: string): Date {
  const raw = String(value || '').trim();
  if (!raw) return new Date('');

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const iso = hasTimezone ? normalized : `${normalized}Z`;
  return new Date(iso);
}

function getRowClass(status: DbTransaction['status']): string {
  switch (status) {
    case 'approved':
    case 'APPROVED':
      return 'tx-table__row--approved';
    case 'flagged':
    case 'otp_required':
    case 'OTP_PENDING':
      return 'tx-table__row--pending';
    case 'blocked':
    case 'BLOCKED':
    case 'FAILED_VERIFICATION':
      return 'tx-table__row--blocked';
    default:
      return '';
  }
}

function formatStatus(status: DbTransaction['status']): string {
  switch (status) {
    case 'approved':
    case 'APPROVED':
      return 'Approved';
    case 'flagged':
    case 'otp_required':
    case 'OTP_PENDING':
      return 'OTP pending';
    case 'FAILED_VERIFICATION':
      return 'Failed verification';
    case 'blocked':
    case 'BLOCKED':
      return 'Blocked';
    default:
      return status ?? '—';
  }
}

function formatDecision(decision: DbTransaction['decision']): string {
  if (!decision) return '—';
  switch (decision) {
    case 'ALLOW':
      return 'Allow';
    case 'VERIFY_OTP':
      return 'Verify OTP';
    case 'FRAUD_BLOCKED':
      return 'Fraud blocked';
    default:
      return decision;
  }
}

function formatRiskTooltip(riskScore: number, amount: number, behaviorScore?: number | null): string {
  const riskText = Number.isFinite(riskScore) ? String(Math.round(riskScore)) : '—';
  const amountText = formatAmount(amount);
  if (typeof behaviorScore === 'number' && Number.isFinite(behaviorScore)) {
    return `Amount: ${amountText}\nRisk Score: ${riskText}\nBehavior Score: ${Math.round(behaviorScore)}`;
  }
  return `Amount: ${amountText}\nRisk Score: ${riskText}`;
}

function formatRiskFactors(reasons?: DbTransaction['behavior_reasons']): JSX.Element {
  const list = Array.isArray(reasons) ? reasons.filter(Boolean).map(String) : [];
  if (list.length === 0) {
    return <div className="tx-table__muted">No unusual behavior detected</div>;
  }
  return (
    <div className="tx-table__factor-lines">
      {list.map((r, idx) => (
        <div key={idx} className="tx-table__factor-line">
          {r}
        </div>
      ))}
    </div>
  );
}

function explainStatus(status: DbTransaction['status'], decision?: DbTransaction['decision']): string {
  const s = String(status || '').toUpperCase();
  const d = String(decision || '').toUpperCase();

  if (s === 'APPROVED' || status === 'approved') {
    return 'Transaction matches normal behavior.';
  }
  if (s === 'OTP_PENDING' || status === 'flagged' || status === 'otp_required' || d === 'VERIFY_OTP') {
    return 'Verification required due to unusual activity.';
  }
  if (s === 'BLOCKED' || s === 'FAILED_VERIFICATION' || status === 'blocked' || d === 'FRAUD_BLOCKED') {
    return 'Transaction blocked due to suspicious activity.';
  }
  return '';
}

function getTopRiskContributors(tx: DbTransaction): string[] {
  const candidates: unknown[] = [
    tx.risk_contributors,
    tx.shap_contributors,
    tx.shap_top_features,
  ];

  const labels: string[] = [];

  for (const c of candidates) {
    if (!c) continue;

    // Array of strings
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') labels.push(mapContributor(item));
      }
      continue;
    }

    // Object map: { feature: importance }
    if (typeof c === 'object') {
      try {
        const entries = Object.entries(c as Record<string, unknown>);
        for (const [k] of entries) labels.push(mapContributor(k));
      } catch {
        // ignore
      }
    }
  }

  // Dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of labels) {
    const cleaned = String(l || '').trim();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out.slice(0, 3);
}

function mapContributor(raw: string): string {
  const key = raw.toLowerCase();
  const mapping: Record<string, string> = {
    purchase_value: 'high transaction amount',
    amount: 'high transaction amount',
    velocity: 'rapid transaction velocity',
    rapid: 'rapid transaction velocity',
    device_id: 'new device pattern',
    device: 'new device pattern',
    country: 'unusual location',
    location: 'unusual location',
    behavior: 'unusual spending pattern',
  };

  for (const [needle, label] of Object.entries(mapping)) {
    if (key.includes(needle)) return label;
  }
  // fallback: make it readable
  return raw.replace(/[_-]+/g, ' ').trim();
}

function InlineStyles() {
  return (
    <style>{`
      .table-wrap {
        overflow-x: auto;
        border-radius: var(--card-radius);
        border: 1px solid var(--color-border);
      }
      .tx-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }
      .tx-table th {
        text-align: left;
        padding: 0.75rem 1rem;
        background: var(--color-bg);
        font-weight: 600;
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border);
      }
      .tx-table td {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--color-border);
        vertical-align: middle;
        white-space: normal;
        word-break: break-word;
      }
      .tx-table__row {
        transition: background-color var(--transition-fast), color var(--transition-fast);
      }
      .tx-table__row:hover {
        background: var(--color-bg);
      }
      .tx-table__row:last-child td {
        border-bottom: none;
      }
      .tx-table__row--approved {
        background: rgba(22, 163, 74, 0.06);
      }
      .tx-table__row--pending {
        background: rgba(234, 179, 8, 0.06);
      }
      .tx-table__row--blocked {
        background: rgba(220, 38, 38, 0.06);
      }
      .tx-table__row--approved td:first-child {
        border-left: 3px solid rgb(22, 163, 74);
      }
      .tx-table__row--pending td:first-child {
        border-left: 3px solid rgb(234, 179, 8);
      }
      .tx-table__row--blocked td:first-child {
        border-left: 3px solid rgb(220, 38, 38);
      }
      .tx-table__status {
        font-weight: 600;
      }
      .tx-table__risk {
        cursor: help;
        text-decoration: underline dotted;
        text-underline-offset: 3px;
      }
      .tx-table__stack {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 120px;
      }
      .tx-table__primary {
        line-height: 1.2;
      }
      .tx-table__explain {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        line-height: 1.25;
      }
      .tx-table__factors {
        min-width: 220px;
      }
      .tx-table__factor-lines {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .tx-table__factor-line {
        font-size: 0.8125rem;
        color: var(--color-text);
        opacity: 0.95;
      }
      .tx-table__muted {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
      }
      .tx-table__contributors {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px dashed var(--color-border);
      }
      .tx-table__contributors-title {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin-bottom: 0.25rem;
      }
      .tx-table__contributors-list {
        margin: 0;
        padding-left: 1.1rem;
        font-size: 0.8125rem;
        color: var(--color-text);
      }
      .tx-table__row--approved .tx-table__status {
        color: rgb(22, 163, 74);
      }
      .tx-table__row--pending .tx-table__status {
        color: rgb(234, 179, 8);
      }
      .tx-table__row--blocked .tx-table__status {
        color: rgb(220, 38, 38);
      }
      .table-empty {
        padding: 2rem;
        text-align: center;
        color: var(--color-text-muted);
      }
      .table-empty--error {
        color: var(--color-block);
      }
      .table-empty__detail {
        margin-top: 0.25rem;
        font-size: 0.8125rem;
      }
    `}</style>
  );
}

