// Account management for YPMS. Runs with the service role so it can create
// auth users, but every action first checks who is calling and what their
// role allows. JWT verification is done here (verify_jwt is off) because the
// one-time "bootstrap" action must work before any account exists.
import { createClient } from "npm:@supabase/supabase-js@2";

const EMAIL_DOMAIN = "ypms.local";
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Role = "headteacher" | "deputy" | "hod" | "teacher" | "pupil";
interface Caller { id: string; role: Role; full_name: string }

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function emailFor(username: string) {
  return `${username}@${EMAIL_DOMAIN}`;
}

async function getCaller(req: Request): Promise<Caller> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Session expired. Please sign in again.");
  const { data: profile } = await admin.from("profiles").select("id, role, full_name").eq("id", data.user.id).single();
  if (!profile) throw new HttpError(403, "No profile for this account");
  return profile as Caller;
}

async function logActivity(caller: Caller, action: string, details?: string) {
  await admin.from("activity_logs").insert({
    id: `log-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    user_id: caller.id,
    data: { userId: caller.id, userName: caller.full_name, role: caller.role, action, details, timestamp: new Date().toISOString() },
  });
}

async function createAccount(params: {
  username: string; password: string; role: Role; fullName: string; mustChange: boolean;
  grade?: string | null; classSection?: string | null; hodDepartment?: string | null; data?: Record<string, unknown>;
}) {
  const username = params.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new HttpError(400, "Username must be 3-32 characters: letters, numbers, dot, dash or underscore.");
  if (!params.fullName?.trim()) throw new HttpError(400, "Full name is required.");
  if (params.password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");

  const { data: existing } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existing) throw new HttpError(409, "That username is already taken.");

  const { data: created, error } = await admin.auth.admin.createUser({
    email: emailFor(username),
    password: params.password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !created.user) throw new HttpError(400, error?.message || "Could not create account");

  const data = { ...(params.data || {}) };
  delete data.password;
  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    role: params.role,
    full_name: params.fullName.trim(),
    grade: params.grade ?? null,
    class_section: params.classSection ?? null,
    hod_department: params.hodDepartment ?? null,
    must_change_password: params.mustChange,
    data,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    const msg = profileError.message.includes("profiles_one_") ? `A ${params.role} account already exists.` : profileError.message;
    throw new HttpError(400, msg);
  }
  return created.user.id;
}

async function handle(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "bootstrap") {
    // First-run only: create the single headteacher account.
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "headteacher");
    if ((count ?? 0) > 0) throw new HttpError(409, "A headteacher account already exists. Ask the headteacher to create your account.");
    const id = await createAccount({
      username: body.username, password: String(body.password || ""), role: "headteacher",
      fullName: body.fullName, mustChange: false,
      data: { email: body.email, phone: body.phone, gender: body.gender },
    });
    await admin.from("app_config").update({
      data: { ...(await getSettings()), headteacherName: String(body.fullName).trim() },
    }).eq("key", "settings");
    return { ok: true, id };
  }

  const caller = await getCaller(req);
  const isHead = caller.role === "headteacher";
  const isAdmin = isHead || caller.role === "deputy";

  if (action === "create") {
    if (!isAdmin) throw new HttpError(403, "Only the headteacher or deputy can create accounts.");
    const role = body.role as Role;
    const allowed: Role[] = isHead ? ["deputy", "hod", "teacher", "pupil"] : ["hod", "teacher", "pupil"];
    if (!allowed.includes(role)) throw new HttpError(403, `You cannot create a ${role} account.`);
    const password = tempPassword();
    const profile = (body.profile || {}) as Record<string, unknown>;
    const id = await createAccount({
      username: body.username, password, role, fullName: body.fullName, mustChange: true,
      grade: (profile.grade as string) ?? null,
      classSection: (profile.classSection as string) ?? null,
      hodDepartment: (profile.hodDepartment as string) ?? null,
      data: profile,
    });
    if (role === "deputy") {
      await admin.from("app_config").update({ data: { ...(await getSettings()), deputyName: String(body.fullName).trim() } }).eq("key", "settings");
    }
    await logActivity(caller, `Created ${role} account for ${body.fullName}`, body.username);
    return { ok: true, id, username: String(body.username).trim().toLowerCase(), password };
  }

  if (action === "reset_password") {
    if (!isAdmin) throw new HttpError(403, "Only the headteacher or deputy can reset passwords.");
    const { data: target } = await admin.from("profiles").select("id, role, full_name, username").eq("id", body.userId).single();
    if (!target) throw new HttpError(404, "Account not found");
    if (target.role === "headteacher" && !isHead) throw new HttpError(403, "The deputy cannot reset the headteacher's password.");
    if (target.id === caller.id) throw new HttpError(400, "Use My Profile to change your own password.");
    const password = tempPassword();
    const { error } = await admin.auth.admin.updateUserById(target.id, { password });
    if (error) throw new HttpError(400, error.message);
    await admin.from("profiles").update({ must_change_password: true }).eq("id", target.id);
    await logActivity(caller, `Reset password for ${target.full_name}`);
    return { ok: true, username: target.username, password };
  }

  if (action === "delete") {
    if (!isHead) throw new HttpError(403, "Only the headteacher can delete accounts.");
    const { data: target } = await admin.from("profiles").select("id, role, full_name").eq("id", body.userId).single();
    if (!target) throw new HttpError(404, "Account not found");
    if (target.id === caller.id) throw new HttpError(400, "You cannot delete your own account.");
    const { error } = await admin.auth.admin.deleteUser(target.id);
    if (error) throw new HttpError(400, error.message);
    await logActivity(caller, `Deleted ${target.role} ${target.full_name}`);
    return { ok: true };
  }

  throw new HttpError(400, "Unknown action");
}

async function getSettings(): Promise<Record<string, unknown>> {
  const { data } = await admin.from("app_config").select("data").eq("key", "settings").single();
  return (data?.data as Record<string, unknown>) || {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return json(await handle(req));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Unexpected error";
    if (status === 500) console.error(e);
    return json({ error: message }, status);
  }
});
