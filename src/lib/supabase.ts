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

const SESSION_ENDED = "Your sign-in has ended. Please sign in again.";

async function invokeAdmin(body: AdminAction, token?: string) {
  return supabase.functions.invoke("admin-users", {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function adminUsers(body: AdminAction): Promise<AdminResult> {
  // getSession() refreshes the access token first if it is about to expire.
  const { data: current } = await supabase.auth.getSession();
  if (!current.session && body.action !== "bootstrap") throw new Error(SESSION_ENDED);
  let { data, error } = await invokeAdmin(body, current.session?.access_token);

  // A 401 means the token was rejected: refresh once and retry before giving up.
  const status = (error as { context?: Response } | null)?.context?.status;
  if (error && status === 401 && body.action !== "bootstrap") {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error(SESSION_ENDED);
    }
    ({ data, error } = await invokeAdmin(body, refreshed.session.access_token));
  }

  if (error) {
    // Surface the function's own error message when there is one.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) message = (await ctx.clone().json()).error || message;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return data as AdminResult;
}
