import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, authRequired } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__subtitle">A verificar sessão…</p>
        </div>
      </div>
    );
  }

  if (authRequired && !isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (isLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__subtitle">A carregar…</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
