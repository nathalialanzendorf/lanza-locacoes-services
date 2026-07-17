import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LanzaApiError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/BrandMark";

export function RegisterPage() {
  const { register, registerAllowed } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!registerAllowed) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Registo indisponível</h1>
          <p className="auth-card__desc">
            O registo público está desativado. Peça acesso a um administrador.
          </p>
          <Link to="/login" className="btn btn--primary">
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    setSubmitting(true);
    try {
      await register({ name, email, password });
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof LanzaApiError ? err.message : "Não foi possível criar a conta.";
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
            <span className="auth-card__subtitle">Criar conta</span>
          </div>
        </div>

        <h1>Registo</h1>
        <p className="auth-card__desc">
          Crie a primeira conta de administrador ou registe-se enquanto o registo estiver aberto.
        </p>

        {error ? <div className="alert alert--error">{error}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Nome</span>
            <input
              className="input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          <label className="auth-field">
            <span>Confirmar senha</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          <button type="submit" className="btn btn--primary auth-form__submit" disabled={submitting}>
            {submitting ? "A criar…" : "Criar conta"}
          </button>
        </form>

        <p className="auth-card__footer">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
