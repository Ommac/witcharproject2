import { useState, useEffect } from 'react';
import { PageLayout } from './components/Layout/PageLayout';
import { Card } from './components/Layout/Card';
import { AlertBanners } from './components/AlertBanners';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { DbTransactionTable } from './components/DbTransactionTable';
import {
  fetchTransactions,
  fetchTransactionStats,
  type DbTransaction,
  type TransactionStats,
} from './api/transactions';
import type { TransactionRow } from './api/predict';

function App() {
  const [transactions] = useState<TransactionRow[]>([]);
  const [dbTransactions, setDbTransactions] = useState<DbTransaction[]>([]);
  const [transactionStats, setTransactionStats] = useState<TransactionStats>({
    total: 0,
    approved: 0,
    otp: 0,
    blocked: 0,
  });
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [data, stats] = await Promise.all([
          fetchTransactions(),
          fetchTransactionStats(),
        ]);
        if (!cancelled) {
          setDbTransactions([...data]);
          setTransactionStats({ ...stats });
          setDbError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDbError((err as Error).message ?? 'Failed to load transactions');
        }
      } finally {
        if (!cancelled) {
          setDbLoading(false);
        }
      }
    };

    // Initial load
    load();
    // Poll every 5 seconds
    const id = setInterval(load, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    console.log('transactions length:', dbTransactions.length);
  }, [dbTransactions]);

  return (
    <PageLayout>
      <AlertBanners transactions={transactions} />
      <DashboardAnalytics
        transactions={dbTransactions}
        loading={dbLoading}
        summaryStats={transactionStats}
      />
      <Card title="Live transaction feed (MongoDB)" className="app-card app-card--table">
        <DbTransactionTable transactions={dbTransactions} loading={dbLoading} error={dbError} />
      </Card>
    </PageLayout>
  );
}

export default App;
