import type { TransactionRow } from '../api/predict';
import { StatusBadge } from './StatusBadge';

type TransactionTableProps = {
  transactions: TransactionRow[];
};

export function TransactionTable({ transactions }: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="table-empty">
        <p>No transactions yet. Simulate a transaction to see results.</p>
        <style>{`
          .table-empty {
            padding: 2rem;
            text-align: center;
            color: var(--color-text-muted);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="tx-table">
        <thead>
          <tr>
            <th>Amount</th>
            <th>Device</th>
            <th>Country</th>
            <th>Risk Score</th>
            <th>Decision</th>
            <th>Alert</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((row) => (
            <tr key={row.id} className="tx-table__row">
              <td>{formatAmount(row.purchase_value)}</td>
              <td>{row.device_id}</td>
              <td>{row.country}</td>
              <td>{row.risk_score ?? '—'}</td>
              <td>{row.decision ? <StatusBadge decision={row.decision} /> : '—'}</td>
              <td className="tx-table__alert">{row.alert_message ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        }
        .tx-table__row {
          transition: background-color var(--transition-fast);
        }
        .tx-table__row:hover {
          background: var(--color-bg);
        }
        .tx-table__row:last-child td {
          border-bottom: none;
        }
        .tx-table__alert {
          max-width: 280px;
          color: var(--color-text-muted);
        }
      `}</style>
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
