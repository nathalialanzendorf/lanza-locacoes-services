import type { ReactNode } from "react";

type Props = {
  title: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "ok";
};

export function StatCard({ title, value, hint, tone = "default" }: Props) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__title">{title}</span>
      <strong className="stat-card__value">{value}</strong>
      {hint ? <span className="stat-card__hint">{hint}</span> : null}
    </article>
  );
}
