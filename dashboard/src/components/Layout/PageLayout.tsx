import { type ReactNode } from 'react';
import { Shield } from 'lucide-react';

type PageLayoutProps = {
  children: ReactNode;
};

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <div className="page-layout">
      <header className="page-layout__header">
        <Shield className="page-layout__icon" size={28} />
        <h1 className="page-layout__title">Fraud Monitoring Dashboard</h1>
      </header>
      <main className="page-layout__main">{children}</main>
      <style>{`
        .page-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .page-layout__header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          box-shadow: var(--card-shadow);
        }
        .page-layout__icon {
          color: var(--color-approved);
        }
        .page-layout__title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--color-text);
        }
        .page-layout__main {
          flex: 1;
          padding: 1.5rem;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }
        @media (max-width: 640px) {
          .page-layout__main { padding: 1rem; }
        }
      `}</style>
    </div>
  );
}
