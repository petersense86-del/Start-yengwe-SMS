import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "../types";
import { getDb, saveDb, logActivity } from "../utils/db";

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => { success: boolean; message?: string; mustChange?: boolean };
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  resetPassword: (username: string, newPassword: string) => boolean;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const SESSION_KEY = "ypms_current_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const u = JSON.parse(raw) as User;
        // refresh from db in case updates happened
        const db = getDb();
        const dbUser = db.users.find((x) => x.id === u.id);
        if (dbUser) {
          setUser(dbUser);
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(dbUser));
        }
      } catch {}
    }
  }, []);

  function login(username: string, password: string) {
    const db = getDb();
    const found = db.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (!found) return { success: false, message: "Invalid username or password" };

    // update last login
    found.lastLogin = new Date().toISOString();
    saveDb(db);
    setUser(found);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(found));
    logActivity(found.id, found.fullName, found.role, "Logged in");
    return { success: true, mustChange: found.mustChangePassword };
  }

  function logout() {
    if (user) logActivity(user.id, user.fullName, user.role, "Logged out");
    setUser(null);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function updateUser(updates: Partial<User>) {
    if (!user) return;
    const db = getDb();
    const idx = db.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      db.users[idx] = { ...db.users[idx], ...updates };
      saveDb(db);
      setUser(db.users[idx]);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(db.users[idx]));
    }
  }

  function refreshUser() {
    if (!user) return;
    const db = getDb();
    const dbUser = db.users.find((u) => u.id === user.id);
    if (dbUser) {
      setUser(dbUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(dbUser));
    }
  }

  function resetPassword(username: string, newPassword: string) {
    const db = getDb();
    const idx = db.users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
    if (idx < 0) return false;
    db.users[idx].password = newPassword;
    db.users[idx].mustChangePassword = true;
    saveDb(db);
    return true;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, resetPassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
