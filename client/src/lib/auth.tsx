import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { apiRequest, setAuthToken, getAuthToken, API_BASE } from "./queryClient";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, if a token is already stored, restore the user by hitting /api/me.
  // If the token is invalid or expired the server returns 401 and we clear it.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.ok) {
          const me = await res.json();
          setUser(me);
        } else {
          setAuthToken(null);
        }
      })
      .catch(() => {
        // Network error on cold start. Keep the token, but stay logged out
        // until we can verify. Next refresh will retry.
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/login", { email, password });
    const data = await res.json();
    setAuthToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    apiRequest("POST", "/api/logout").catch(() => {});
    setAuthToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
