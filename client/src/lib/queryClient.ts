import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Auth token persisted in localStorage so the token value survives reloads.
// Session activity is tracked separately so we can enforce a 30 minute idle
// timeout and require re-login after the PWA is fully closed.
const TOKEN_KEY = "fortis_auth_token";
const ACTIVE_SESSION_KEY = "fortis_active_session";
const LAST_ACTIVITY_KEY = "fortis_last_activity";
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

let authToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();
export function setAuthToken(token: string | null) {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage unavailable, in-memory only */
  }
}
export function getAuthToken() {
  return authToken;
}
export function markSessionActive() {
  try {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, "1");
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {}
}
export function isSessionActive(): boolean {
  try {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
export function clearSessionFlags() {
  try {
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {}
}
export function touchActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {}
}
export function getIdleMs(): number {
  try {
    const v = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!v) return Infinity;
    return Date.now() - Number(v);
  } catch {
    return Infinity;
  }
}
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch {
      /* keep text */
    }
    throw new Error(`${res.status}: ${msg}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? authHeaders({ "Content-Type": "application/json" }) : authHeaders(),
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

// Upload a file (multipart). Returns parsed JSON.
export async function uploadPhoto(file: File): Promise<{ id: number; filePath: string; url: string }> {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await fetch(`${API_BASE}/api/photos`, {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  await throwIfResNotOk(res);
  return res.json();
}

// Download a file from an authed endpoint. Auth is a Bearer token held in
// memory, so a plain anchor href cannot carry it. Fetch the bytes, then
// trigger a browser download from a temporary blob URL.
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${url}`, { headers: authHeaders() });
  await throwIfResNotOk(res);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: authHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
