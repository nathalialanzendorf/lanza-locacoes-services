import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageHeader({ title, description, actions, children }: Props) {
  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>{title}</h1>
          {description ? <p className="page__desc">{description}</p> : null}
        </div>
        {actions ? <div className="page__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function QueryError({ message }: { message: string }) {
  return (
    <div className="alert alert--error" role="alert">
      <strong>Erro ao carregar</strong>
      <p>{message}</p>
      <p className="alert__hint">
        Verifique se a API está a correr (<code>npm run api:dev</code> na raiz do
        Aworklanza) ou se a <code>X-API-Key</code> está correta.
      </p>
    </div>
  );
}
