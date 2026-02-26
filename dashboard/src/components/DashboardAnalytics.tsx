import { useMemo } from 'react';
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DbTransaction } from '../api/transactions';
import type { TransactionStats } from '../api/transactions';
import { Card } from './Layout/Card';

type DashboardAnalyticsProps = {
  transactions: DbTransaction[];
  loading: boolean;
  summaryStats?: TransactionStats;
};

type SummaryMetrics = {
  total: number;
  approved: number;
  verificationRequired: number;
  blocked: number;
};

type RiskBucketKey = 'approved' | 'verificationRequired' | 'blocked';

type TrendPoint = {
  id: string;
  riskScore: number;
  amount: number;
  time: string;
  fullTime: string;
  ts: number;
};

const STATUS_META: Record<
  RiskBucketKey,
  { label: string; color: string; tone: string; borderColor: string }
> = {
  approved: {
    label: 'Approved',
    color: 'var(--color-approved)',
    tone: 'var(--analytics-approved-soft)',
    borderColor: 'var(--analytics-approved-border)',
  },
  verificationRequired: {
    label: 'Verification Required',
    color: 'var(--color-verify)',
    tone: 'var(--analytics-verify-soft)',
    borderColor: 'var(--analytics-verify-border)',
  },
  blocked: {
    label: 'Blocked',
    color: 'var(--color-block)',
    tone: 'var(--analytics-block-soft)',
    borderColor: 'var(--analytics-block-border)',
  },
};

export function DashboardAnalytics({ transactions, loading, summaryStats }: DashboardAnalyticsProps) {
  const metrics = useMemo<SummaryMetrics>(() => {
    if (summaryStats) {
      return {
        total: Number(summaryStats.total) || 0,
        approved: Number(summaryStats.approved) || 0,
        verificationRequired: Number(summaryStats.otp) || 0,
        blocked: Number(summaryStats.blocked) || 0,
      };
    }
    return calculateSummaryMetrics(transactions);
  }, [summaryStats, transactions]);

  const pieData = useMemo(
    () => [
      {
        key: 'approved' as const,
        name: STATUS_META.approved.label,
        value: metrics.approved,
        color: STATUS_META.approved.color,
      },
      {
        key: 'verificationRequired' as const,
        name: STATUS_META.verificationRequired.label,
        value: metrics.verificationRequired,
        color: STATUS_META.verificationRequired.color,
      },
      {
        key: 'blocked' as const,
        name: STATUS_META.blocked.label,
        value: metrics.blocked,
        color: STATUS_META.blocked.color,
      },
    ],
    [metrics.approved, metrics.verificationRequired, metrics.blocked],
  );

  const trendData = useMemo<TrendPoint[]>(() => {
    return transactions
      .map((tx) => {
        const parsedTime = new Date(tx.timestamp).getTime();
        return {
          id: tx._id,
          riskScore: Number.isFinite(tx.risk_score) ? tx.risk_score : 0,
          amount: Number.isFinite(tx.amount) ? tx.amount : 0,
          time: formatChartTime(tx.timestamp),
          fullTime: formatFullTime(tx.timestamp),
          ts: Number.isNaN(parsedTime) ? 0 : parsedTime,
        };
      })
      .filter((point) => point.ts > 0)
      .sort((a, b) => a.ts - b.ts)
      .slice(-30);
  }, [transactions]);

  const hasPieData = pieData.some((entry) => entry.value > 0);
  const hasTrendData = trendData.length > 0;

  return (
    <section className="dashboard-analytics" aria-label="Fraud analytics overview">
      <div className="analytics-metrics-grid">
        <MetricCard label="Total Transactions" value={metrics.total} tone="neutral" />
        <MetricCard
          label={STATUS_META.approved.label}
          value={metrics.approved}
          tone="approved"
        />
        <MetricCard
          label={STATUS_META.verificationRequired.label}
          value={metrics.verificationRequired}
          tone="verificationRequired"
        />
        <MetricCard label={STATUS_META.blocked.label} value={metrics.blocked} tone="blocked" />
      </div>

      <div className="analytics-charts-grid">
        <Card title="Risk Distribution" className="analytics-card">
          {hasPieData ? (
            <div className="analytics-chart-wrap" role="img" aria-label="Risk distribution by status">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={2}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string | undefined, name: string | undefined) => [
                      typeof value === 'number' ? value.toLocaleString() : String(value ?? '0'),
                      name ?? 'Status',
                    ]}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                  />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legendStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              loading={loading}
              title="No transaction status data"
              description="Status counts will appear as new transactions are ingested."
            />
          )}
        </Card>

        <Card title="Risk Score Trend" className="analytics-card">
          {hasTrendData ? (
            <div className="analytics-chart-wrap" role="img" aria-label="Risk score trend over time">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                  <XAxis
                    dataKey="time"
                    stroke="var(--color-text-muted)"
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    minTickGap={26}
                    label={{ value: 'Time', position: 'insideBottom', offset: -6, fill: 'var(--color-text-muted)' }}
                  />
                  <YAxis
                    stroke="var(--color-text-muted)"
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    width={42}
                    domain={[0, 100]}
                    label={{ value: 'Risk Score', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)' }}
                  />
                  <Tooltip
                    formatter={(value: number | string | undefined) => [
                      typeof value === 'number' ? Math.round(value) : Number(value ?? 0),
                      'Risk Score',
                    ]}
                    labelFormatter={(_, payload) => {
                      const entry = payload?.[0]?.payload as TrendPoint | undefined;
                      if (!entry) return '—';
                      return `${entry.fullTime} • Amount: ${formatInr(entry.amount)}`;
                    }}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="riskScore"
                    stroke="var(--analytics-line-primary)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--analytics-line-accent)' }}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              loading={loading}
              title="No risk trend data"
              description="Recent risk scores with timestamps will populate this chart."
            />
          )}
        </Card>
      </div>
      <style>{`
        .dashboard-analytics {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .analytics-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.85rem;
        }
        .analytics-metric-card {
          border: 1px solid var(--color-border);
          border-radius: 12px;
          box-shadow: var(--card-shadow);
          padding: 0.95rem 1rem;
          min-height: 92px;
          background: var(--color-surface);
          transition: transform var(--transition-fast), box-shadow var(--transition-fast);
        }
        .analytics-metric-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(2, 6, 23, 0.22);
        }
        .analytics-metric-card--neutral {
          background: linear-gradient(180deg, var(--analytics-neutral-soft) 0%, var(--color-surface) 100%);
        }
        .analytics-metric-card--approved {
          background: linear-gradient(180deg, var(--analytics-approved-soft) 0%, var(--color-surface) 100%);
          border-color: var(--analytics-approved-border);
        }
        .analytics-metric-card--verificationRequired {
          background: linear-gradient(180deg, var(--analytics-verify-soft) 0%, var(--color-surface) 100%);
          border-color: var(--analytics-verify-border);
        }
        .analytics-metric-card--blocked {
          background: linear-gradient(180deg, var(--analytics-block-soft) 0%, var(--color-surface) 100%);
          border-color: var(--analytics-block-border);
        }
        .analytics-metric-label {
          display: block;
          color: var(--color-text-muted);
          font-size: 0.8rem;
          margin-bottom: 0.55rem;
          letter-spacing: 0.01em;
        }
        .analytics-metric-value {
          font-size: clamp(1.25rem, 2.6vw, 1.9rem);
          font-weight: 700;
          color: var(--color-text);
          line-height: 1.1;
        }
        .analytics-charts-grid {
          display: grid;
          grid-template-columns: 1fr 1.6fr;
          gap: 1rem;
        }
        .analytics-card {
          min-height: 330px;
        }
        .analytics-card .card__title {
          margin-bottom: 0.75rem;
        }
        .analytics-chart-wrap {
          height: 255px;
          width: 100%;
          animation: chartReveal 420ms ease-out;
        }
        .analytics-empty {
          min-height: 255px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 1rem;
          border: 1px dashed var(--color-border);
          border-radius: 10px;
          background: var(--analytics-neutral-soft);
        }
        .analytics-empty__title {
          margin: 0 0 0.25rem;
          font-size: 0.95rem;
          color: var(--color-text);
          font-weight: 600;
        }
        .analytics-empty__detail {
          margin: 0;
          color: var(--color-text-muted);
          font-size: 0.85rem;
        }
        @keyframes chartReveal {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1180px) {
          .analytics-charts-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 860px) {
          .analytics-metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 520px) {
          .analytics-metrics-grid {
            grid-template-columns: 1fr;
          }
          .analytics-card {
            min-height: 300px;
          }
          .analytics-chart-wrap,
          .analytics-empty {
            min-height: 220px;
            height: 220px;
          }
        }
      `}</style>
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: number;
  tone: RiskBucketKey | 'neutral';
};

function MetricCard({ label, value, tone }: MetricCardProps) {
  return (
    <article className={`analytics-metric-card analytics-metric-card--${tone}`}>
      <span className="analytics-metric-label">{label}</span>
      <div className="analytics-metric-value">{value.toLocaleString()}</div>
    </article>
  );
}

type EmptyStateProps = {
  loading: boolean;
  title: string;
  description: string;
};

function EmptyState({ loading, title, description }: EmptyStateProps) {
  return (
    <div className="analytics-empty" role="status" aria-live="polite">
      <div>
        <p className="analytics-empty__title">{loading ? 'Loading analytics…' : title}</p>
        <p className="analytics-empty__detail">{loading ? 'Fetching latest transaction data.' : description}</p>
      </div>
    </div>
  );
}

function calculateSummaryMetrics(transactions: DbTransaction[]): SummaryMetrics {
  return transactions.reduce<SummaryMetrics>(
    (acc, tx) => {
      const bucket = mapToRiskBucket(tx);
      acc.total += 1;
      if (bucket === 'approved') acc.approved += 1;
      if (bucket === 'verificationRequired') acc.verificationRequired += 1;
      if (bucket === 'blocked') acc.blocked += 1;
      return acc;
    },
    { total: 0, approved: 0, verificationRequired: 0, blocked: 0 },
  );
}

function mapToRiskBucket(tx: DbTransaction): RiskBucketKey | null {
  const status = String(tx.status ?? '').trim().toUpperCase();
  const decision = String(tx.decision ?? '').trim().toUpperCase();

  if (!status) {
    return null;
  }

  if (status === 'APPROVED' || decision === 'ALLOW') {
    return 'approved';
  }

  if (status === 'OTP_PENDING' || decision === 'VERIFY_OTP') {
    return 'verificationRequired';
  }

  if (status === 'BLOCKED' || status === 'FAILED_VERIFICATION' || decision === 'FRAUD_BLOCKED') {
    return 'blocked';
  }

  return null;
}

function formatChartTime(value: string): string {
  const date = parseApiUtcTimestamp(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullTime(value: string): string {
  const date = parseApiUtcTimestamp(value);
  if (Number.isNaN(date.getTime())) return '—';
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

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

const tooltipStyle = {
  backgroundColor: 'var(--analytics-tooltip-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  boxShadow: '0 6px 20px rgba(15, 23, 42, 0.35)',
  color: 'var(--color-text)',
};

const tooltipLabelStyle = {
  color: 'var(--color-text-muted)',
};

const legendStyle = {
  color: 'var(--color-text-muted)',
  paddingTop: 8,
};
