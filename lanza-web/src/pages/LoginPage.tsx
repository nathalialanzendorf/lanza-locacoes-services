import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LanzaApiError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/BrandMark";

export function LoginPage() {
  const { login, registerAllowed } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof LanzaApiError ? err.message : "Não foi possível entrar. Tente novamente.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__brand">
          <BrandMark variant="auth" />
          <div>
            <strong>Lanza</strong>
            <span className="auth-card__subtitle">Painel operacional</span>
          </div>
        </div>

        <h1>Entrar</h1>
        <p className="auth-card__desc">Use o seu e-mail e senha para aceder ao painel.</p>

        {error ? <div className="alert alert--error">{error}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>E-mail</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span>Senha</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
            {submitting ? "A entrar…" : "Entrar"}
          </button>
        </form>

        {registerAllowed ? (
          <p className="auth-card__footer">
            Ainda não tem conta? <Link to="/registro">Criar conta</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
