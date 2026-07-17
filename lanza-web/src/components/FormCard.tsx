import type { FormEvent, ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  loading?: boolean;
  submitLabel?: string;
  error?: string | null;
};

export function FormCard({
  title,
  children,
  onSubmit,
  loading,
  submitLabel = "Enviar",
  error,
}: Props) {
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit();
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      {title ? <h2 className="form-card__title">{title}</h2> : null}
      <div className="form-grid">{children}</div>
      {error ? <p className="form-card__error">{error}</p> : null}
      <button type="submit" className="btn btn--primary" disabled={loading}>
        {loading ? "A processar…" : submitLabel}
      </button>
    </form>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
