export type DbTransactionStatus =
  | 'approved'
  | 'flagged'
  | 'blocked'
  | 'otp_required'
  | 'APPROVED'
  | 'OTP_PENDING'
  | 'FAILED_VERIFICATION'
  | 'BLOCKED';

export type DbTransaction = {
  _id: string;
  user_id: string;
  amount: number;
  location: string;
  device: string;
  risk_score: number;
  behavior_score?: number | null;
  behavior_reasons?: string[] | null;
  // Optional explainability fields (only present if backend provides them)
  risk_contributors?: unknown;
  shap_contributors?: unknown;
  shap_top_features?: unknown;
  status: DbTransactionStatus;
  decision?: string | null;
  mobile_number?: string | null;
  timestamp: string;
};

const TRANSACTION_API_URL = 'http://localhost:5000/transactions';
const TRANSACTION_STATS_API_URL = 'http://localhost:5000/transactions/stats';

export type TransactionStats = {
  total: number;
  approved: number;
  otp: number;
  blocked: number;
};

export async function fetchTransactions(): Promise<DbTransaction[]> {
  const res = await fetch(TRANSACTION_API_URL);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Failed to load transactions');
  }
  return (await res.json()) as DbTransaction[];
}

export async function fetchTransactionStats(): Promise<TransactionStats> {
  const res = await fetch(TRANSACTION_STATS_API_URL);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Failed to load transaction stats');
  }
  return (await res.json()) as TransactionStats;
}

