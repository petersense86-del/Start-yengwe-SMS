import { createClient } from "@supabase/supabase-js";

// The publishable key is designed to be public: every table is protected by
// row-level security, so it grants nothing beyond what each signed-in user's
// role allows. Override both values with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "__SUPABASE_URL__";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "__SUPABASE_ANON_KEY__";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "ypms-auth" },
});

// Accounts created in the app sign in with a username, which maps to an
// email-shaped identifier. Anything containing "@" is used as a real email.
// Must match EMAIL_DOMAIN in supabase/functions/admin-users/index.ts.
const EMAIL_DOMAIN = "ypms.local";
export function authEmail(login: string) {
  const value = login.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${EMAIL_DOMAIN}`;
}

type AdminAction =
  | { action: "bootstrap"; username: string; password: string; fullName: string; email?: string; phone?: string; gender?: string }
  | { action: "create"; username: string; fullName: string; role: string; profile: Record<string, unknown> }
  | { action: "reset_password"; userId: string }
  | { action: "delete"; userId: string };

export interface AdminResult { ok: boolean; id?: string; username?: string; password?: string }

export async function adminUsers(body: AdminAction): Promise<AdminResult> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    // Surface the function's own error message when there is one.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) message = (await ctx.json()).error || message;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return data as AdminResult;
}
