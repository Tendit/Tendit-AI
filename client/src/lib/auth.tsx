import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiRequest } from "./queryClient";

interface AuthUser {
  id: number;
  username: string;
  email: string;
  credits: number;
  plan: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// In-memory token storage (no localStorage in sandboxed iframe)
let memoryToken: string | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(memoryToken);
  const [isLoading, setIsLoading] = useState(true);

  const setAuth = useCallback((newToken: string | null, newUser: AuthUser | null) => {
    memoryToken = newToken;
    (window as any).__AUTH_TOKEN__ = newToken; // expose for SSE fetch
    setToken(newToken);
    setUser(newUser);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!memoryToken) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${"__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__"}/api/auth/me`, {
        headers: { Authorization: `Bearer ${memoryToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setAuth(null, null);
      }
    } catch {
      setAuth(null, null);
    } finally {
      setIsLoading(false);
    }
  }, [setAuth]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setAuth(data.token, data.user);
  }, [setAuth]);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { username, email, password });
    const data = await res.json();
    setAuth(data.token, data.user);
  }, [setAuth]);

  const logout = useCallback(() => {
    if (memoryToken) {
      fetch(`${"__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__"}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${memoryToken}` },
      }).catch(() => {});
    }
    setAuth(null, null);
  }, [setAuth]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Helper to make authenticated API calls
export function useAuthFetch() {
  return useCallback(async (method: string, url: string, data?: any, isFormData?: boolean) => {
    const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    const headers: Record<string, string> = {};
    if (memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
    if (data && !isFormData) headers["Content-Type"] = "application/json";
    // For FormData, don't set Content-Type — browser sets it with boundary
    const res = await fetch(`${API_BASE}${url}`, {
      method,
      headers,
      body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res;
  }, []);
}
