import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import {
  apiRequest,
  setAuthToken,
  getAuthToken,
  API_BASE,
  markSessionActive,
  isSessionActive,
  clearSessionFlags,
  touchActivity,
  getIdleMs,
  IDLE_TIMEOUT_MS,
} from "./queryClient";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: "idle" | "manual" | "closed") => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "pointerdown", "scroll"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  const logout = useCallback((reason: "idle" | "manual" | "closed" = "manual") => {
    apiRequest("POST", "/api/logout").catch(() => {});
    setAuthToken(null);
    clearSessionFlags();
    setUser(null);
    if (reason !== "manual" && typeof window !== "undefined") {
      // Mark why we logged out so the login screen can show a banner.
      try { sessionStorage.setItem("fortis_logout_reason", reason); } catch {}
    }
  }, []);

  // On mount: restore session only if the previous tab/process is still alive
  // (sessionStorage flag) and the idle window has not been exceeded.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    if (!isSessionActive()) {
      // The app was fully closed since the last activity. Force re-login.
      setAuthToken(null);
      clearSessionFlags();
      setLoading(false);
      try { sessionStorage.setItem("fortis_logout_reason", "closed"); } catch {}
      return;
    }
    if (getIdleMs() > IDLE_TIMEOUT_MS) {
      setAuthToken(null);
      clearSessionFlags();
      setLoading(false);
      try { sessionStorage.setItem("fortis_logout_reason", "idle"); } catch {}
      return;
    }
    fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.ok) {
          const me = await res.json();
          setUser(me);
          touchActivity();
        } else {
          setAuthToken(null);
          clearSessionFlags();
        }
      })
      .catch(() => {
        // Network error on cold start. Keep the token, but stay logged out
        // until we can verify. Next refresh will retry.
      })
      .finally(() => setLoading(false));
  }, []);

  // Activity tracking + idle timer. Only runs while the user is logged in.
  useEffect(() => {
    if (!user) return;
    const onActivity = () => touchActivity();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (getIdleMs() > IDLE_TIMEOUT_MS) {
          logout("idle");
        } else {
          touchActivity();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const id = window.setInterval(() => {
      if (getIdleMs() > IDLE_TIMEOUT_MS) logout("idle");
    }, 60_000);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(id);
    };
  }, [user, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/login", { email, password });
    const data = await res.json();
    setAuthToken(data.token);
    markSessionActive();
    setUser(data.user);
    try { sessionStorage.removeItem("fortis_logout_reason"); } catch {}
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
