import { useEffect, useId, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth, MIN_PASSWORD_LENGTH } from "../context/AuthContext";
import { Alert, Button, Input, Select } from "../components/ui";
import { supabase, adminUsers } from "../lib/supabase";
import { toast } from "../components/feedback";

interface Branding { schoolLogo?: string; schoolMotto?: string; hasHeadteacher: boolean }

const BACKGROUND_PHOTOS = [
  { src: "/login/pupils.jpg", position: "center" },
  { src: "/login/campus.jpg", position: "center" },
  { src: "/login/graduation.jpg", position: "center 20%" },
];
const PHOTO_INTERVAL_MS = 6000;

function PhotoBackground() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setCurrent((i) => (i + 1) % BACKGROUND_PHOTOS.length), PHOTO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      {BACKGROUND_PHOTOS.map((photo, i) => (
        <div
          key={photo.src}
          className={`absolute inset-0 bg-cover transition-opacity duration-[1500ms] ease-in-out ${i === current ? "opacity-100" : "opacity-0"}`}
          style={{ backgroundImage: `url(${photo.src})`, backgroundPosition: photo.position }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/80 via-emerald-900/65 to-emerald-950/85" />
    </div>
  );
}

function LogoHeader({ logo, motto }: { logo?: string; motto?: string }) {
  return (
    <div className="flex flex-col items-center mb-6">
      {logo ? (
        <img src={logo} alt="Yengwe Secondary School crest" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-contain bg-white border-4 border-yellow-500 shadow-lg" />
      ) : (
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center border-4 border-yellow-500 shadow-lg">
          <span className="text-4xl sm:text-5xl font-serif font-bold text-yellow-400">Y</span>
        </div>
      )}
      <h1 className="mt-4 text-xl sm:text-2xl font-bold text-emerald-900 tracking-wide text-center leading-tight">YENGWE SECONDARY SCHOOL</h1>
      <p className="text-amber-600 font-semibold italic text-sm mt-1">{motto || "RISE & SHINE"}</p>
    </div>
  );
}

export function PasswordInput({ label, hint, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const [show, setShow] = useState(false);
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          {...props}
          id={inputId}
          type={show ? "text" : "password"}
          className="w-full pl-3 pr-10 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-400 hover:text-gray-700"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "forgot" | "setup">("login");
  const [branding, setBranding] = useState<Branding | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regGender, setRegGender] = useState<"Male" | "Female">("Male");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Sign in · YPMS";
    supabase.rpc("get_login_branding").then(({ data }) => {
      if (data) setBranding(data as Branding);
    });
  }, [mode]);

  const needsSetup = branding ? !branding.hasHeadteacher : false;

  function switchMode(m: typeof mode) {
    setMode(m);
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(username.trim(), password);
    setLoading(false);
    if (!res.success) setError(res.message || "Sign-in failed");
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!regFullName.trim() || !username.trim() || !password) { setError("Full name, username and password are required."); return; }
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await adminUsers({
        action: "bootstrap", username: username.trim().toLowerCase(), password,
        fullName: regFullName.trim(), email: regEmail, phone: regPhone, gender: regGender,
      });
      toast.success("Headteacher account created. Signing you in…");
      const res = await login(username.trim(), password);
      if (!res.success) { setError(res.message || "Account created, but sign-in failed."); switchMode("login"); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-x-hidden">
      <div className="absolute inset-0 bg-emerald-950" />
      <PhotoBackground />

      <div className="relative w-full max-w-md animate-modalIn">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border-t-4 border-yellow-500">
          <LogoHeader logo={branding?.schoolLogo} motto={branding?.schoolMotto} />

          <div className="text-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === "login" ? "Sign in to YPMS" : mode === "forgot" ? "Forgot your password?" : "First-time setup"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "login" ? "Yengwe Pupils Management System" : mode === "forgot" ? "Password resets are handled by the school office" : "Create the headteacher account"}
            </p>
          </div>

          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <Input label="Username or email" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. mbanda" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
              <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
              {error && <Alert tone="error">{error}</Alert>}
              <Button type="submit" className="w-full py-2.5" loading={loading} disabled={!username || !password}>{loading ? "Signing in…" : "Sign in"}</Button>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-2 text-sm pt-1">
                <button type="button" onClick={() => switchMode("forgot")} className="text-emerald-700 hover:text-emerald-900 font-medium text-left">Forgot password?</button>
                {needsSetup && (
                  <button type="button" onClick={() => switchMode("setup")} className="text-amber-700 hover:text-amber-900 font-medium text-left">Set up headteacher account</button>
                )}
              </div>
              {needsSetup && (
                <Alert tone="warning" className="text-xs">This system has not been set up yet. The headteacher should create their account first.</Alert>
              )}
            </form>
          )}

          {mode === "forgot" && (
            <div className="space-y-4">
              <div className="flex gap-3 p-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
                <KeyRound className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-900 space-y-2">
                  <p><strong>Pupils, teachers and HoDs:</strong> ask the Headteacher or Deputy Headteacher to reset your password. They will give you a temporary password, and you'll choose a new one when you sign in.</p>
                  <p><strong>Deputy Headteacher:</strong> ask the Headteacher.</p>
                  <p><strong>Headteacher:</strong> contact the school's system administrator, who can reset it securely from the Supabase dashboard.</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" />For your security, passwords can't be reset from this screen.</p>
              <Button variant="ghost" className="w-full" onClick={() => switchMode("login")}>Back to sign in</Button>
            </div>
          )}

          {mode === "setup" && (
            <form onSubmit={handleSetup} className="space-y-4" noValidate>
              {!needsSetup ? (
                <Alert tone="warning">A headteacher account already exists. Staff and pupil accounts are created by the headteacher or deputy from inside the system.</Alert>
              ) : (
                <>
                  <Input label="Full name *" value={regFullName} onChange={(e) => setRegFullName(e.target.value)} placeholder="e.g. Mr. Banda M." required autoFocus />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Username *" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))} placeholder="Login username" autoComplete="username" hint="3–32 letters, numbers, . _ -" required />
                    <Select label="Gender" value={regGender} onChange={(e) => setRegGender(e.target.value as "Male" | "Female")}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <PasswordInput label="Password *" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`} required />
                    <PasswordInput label="Confirm password *" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Email" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                    <Input label="Phone" type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} />
                  </div>
                  <Alert tone="info" className="text-xs">Only one headteacher account can ever be created here. After setup, the headteacher creates the deputy, staff and pupil accounts.</Alert>
                  {error && <Alert tone="error">{error}</Alert>}
                </>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => switchMode("login")}>Cancel</Button>
                {needsSetup && <Button type="submit" variant="gold" className="flex-1" loading={loading}>Create account</Button>}
              </div>
            </form>
          )}
        </div>
        <p className="text-center text-white/60 text-xs mt-4 px-2">
          © {new Date().getFullYear()} Yengwe Secondary School · <span className="text-yellow-300/90 font-medium">smart yengwe.sch</span>
        </p>
      </div>
    </div>
  );
}
