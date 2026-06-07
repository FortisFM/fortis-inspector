import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { apiRequest, setAuthToken } from "./queryClient";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

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

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
