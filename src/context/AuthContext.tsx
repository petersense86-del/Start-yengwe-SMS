import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../types";
import { supabase, authEmail } from "../lib/supabase";
import { getDb, saveDb, logActivity, refreshData, resetDb, findUser, useDbVersion } from "../utils/db";

type AuthStatus = "loading" | "signedOut" | "ready";

interface AuthContextType {
  status: AuthStatus;
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
export const MIN_PASSWORD_LENGTH = 8;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const version = useDbVersion();

  // The signed-in user's record always reflects the latest data.
  const user = useMemo(() => (userId ? findUser(userId) ?? null : null), [userId, version]);

  const startSession = useCallback(async (id: string) => {
    try {
      await refreshData();
    } catch {
      // Offline or server error: fall back to the sign-in screen.
      setStatus("signedOut");
      return;
    }
    if (!findUser(id)) {
      await supabase.auth.signOut();
      resetDb();
      setStatus("signedOut");
      return;
    }
    setUserId(id);
    setStatus("ready");
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) startSession(data.session.user.id);
      else setStatus("signedOut");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        resetDb();
        setUserId(null);
        setStatus("signedOut");
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [startSession]);

  // Keep data fresh across devices: live chat, periodic refresh, refresh on focus.
  useEffect(() => {
    if (status !== "ready" || !userId) return;
    let timer: number | undefined;
    const refreshSoon = (collections?: Parameters<typeof refreshData>[0]) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { refreshData(collections).catch(() => undefined); }, 400);
    };
    const channel = supabase
      .channel("ypms-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => refreshSoon(["messages"]))
      .subscribe();
    const interval = window.setInterval(() => refreshSoon(), 90_000);
    const onFocus = () => { if (document.visibilityState === "visible") refreshSoon(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      supabase.removeChannel(channel);
    };
  }, [status, userId]);

  async function login(username: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail(username), password });
    if (error || !data.user) {
      const offline = /fetch|network/i.test(error?.message || "");
      return { success: false, message: offline ? "Can't reach the server. Check your internet connection." : "Incorrect username or password." };
    }
    setStatus("loading");
    await startSession(data.user.id);
    const me = findUser(data.user.id);
    if (!me) return { success: false, message: "This account has no profile. Contact the headteacher." };
    const db = getDb();
    const idx = db.users.findIndex((u) => u.id === me.id);
    if (idx >= 0) {
      db.users[idx].lastLogin = new Date().toISOString();
      saveDb(db);
    }
    logActivity(me.id, me.fullName, me.role, "Logged in");
    return { success: true };
  }

  async function logout() {
    if (user) logActivity(user.id, user.fullName, user.role, "Logged out");
    await supabase.auth.signOut();
  }

  function updateUser(updates: Partial<User>) {
    if (!userId) return;
    const db = getDb();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      db.users[idx] = { ...db.users[idx], ...updates };
      saveDb(db);
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!user) return { success: false, message: "Not signed in." };
    if (newPassword.length < MIN_PASSWORD_LENGTH) return { success: false, message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    if (newPassword === currentPassword) return { success: false, message: "Choose a password different from your current one." };
    // Confirm the current password before changing it.
    const check = await supabase.auth.signInWithPassword({ email: authEmail(user.username), password: currentPassword });
    if (check.error) return { success: false, message: "Current password is incorrect." };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, message: error.message };
    updateUser({ mustChangePassword: false });
    logActivity(user.id, user.fullName, user.role, "Changed own password");
    return { success: true };
  }

  function refreshUser() {
    refreshData(["users"]).catch(() => undefined);
  }

  return (
    <AuthContext.Provider value={{ status, user, login, logout, updateUser, changePassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
