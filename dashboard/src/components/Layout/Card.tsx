import { type ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  title?: string;
  className?: string;
};

export function Card({ children, title, className = '' }: CardProps) {
  return (
    <section className={`card ${className}`}>
      {title && <h2 className="card__title">{title}</h2>}
      {children}
      <style>{`
        .card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--card-radius);
          box-shadow: var(--card-shadow);
          padding: 1.25rem 1.5rem;
          transition: box-shadow var(--transition-fast);
        }
        .card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
        .card__title {
          margin: 0 0 1rem 0;
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text);
        }
      `}</style>
    </section>
  );
}
