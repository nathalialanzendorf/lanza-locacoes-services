import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchAuthMe,
  fetchAuthStatus,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  getStoredToken,
} from "@/api/authClient";
import type { AuthRegisterBody, AuthUser } from "@/api/authTypes";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authRequired: boolean;
  registerAllowed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (body: AuthRegisterBody) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [registerAllowed, setRegisterAllowed] = useState(false);

  const refresh = useCallback(async () => {
    const token = getStoredToken();
    try {
      const status = await fetchAuthStatus();
      const required = status.jwtConfigured || status.userCount > 0;
      setAuthRequired(required);
      setRegisterAllowed(status.registerAllowed);

      if (!token) {
        setUser(null);
        return;
      }

      if (!status.jwtConfigured) {
        setUser(null);
        return;
      }

      const me = await fetchAuthMe();
      setUser(me.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      await refresh();
      if (active) setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setUser(result.user);
    setAuthRequired(true);
  }, []);

  const register = useCallback(async (body: AuthRegisterBody) => {
    const result = await apiRegister(body);
    setUser(result.user);
    setAuthRequired(true);
    setRegisterAllowed(false);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      authRequired,
      registerAllowed,
      login,
      register,
      logout,
      refresh,
    }),
    [user, isLoading, authRequired, registerAllowed, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}
