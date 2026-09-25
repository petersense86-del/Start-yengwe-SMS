import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Button, Input, Select } from "../components/ui";
import { getDb } from "../utils/db";

function LogoHeader() {
  const db = getDb();
  const logo = db.settings.schoolLogo;
  return (
    <div className="flex flex-col items-center mb-4 sm:mb-6">
      {logo ? (
        <img src={logo} alt="School Logo" className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-contain border-4 border-yellow-500 shadow-lg" />
      ) : (
        <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center border-4 border-yellow-500 shadow-lg">
          <span className="text-3xl sm:text-5xl font-serif font-bold text-yellow-400">Y</span>
        </div>
      )}
      <h1 className="mt-3 sm:mt-4 text-xl sm:text-2xl font-bold text-emerald-900 tracking-wide text-center leading-tight">YENGWE SECONDARY SCHOOL</h1>
      <p className="text-amber-600 font-semibold italic text-xs sm:text-sm mt-1">RISE &amp; SHINE</p>
    </div>
  );
}

export default function Login() {
  const { login, resetPassword } = useAuth();
  const [mode, setMode] = useState<"login" | "forgot" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [regRole, setRegRole] = useState<"headteacher" | "deputy">("headteacher");
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regGender, setRegGender] = useState<"Male" | "Female">("Male");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbState, setDbState] = useState(getDb());

  useEffect(() => { setDbState(getDb()); }, [mode]);

  const headRegistered = dbState.settings.headteacherRegistered;
  const deputyRegistered = dbState.settings.deputyRegistered;
  const canRegisterHead = !headRegistered;
  const canRegisterDeputy = !deputyRegistered;
  const canRegister = canRegisterHead || canRegisterDeputy;

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      const res = login(username.trim(), password);
      if (!res.success) setError(res.message || "Login failed");
      setLoading(false);
    }, 300);
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    if (newPassword.length < 4) { setError("Password must be at least 4 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    const ok = resetPassword(username.trim(), newPassword);
    if (ok) {
      setInfo("Password reset successfully. You can now log in.");
      setTimeout(() => { setMode("login"); setPassword(""); setNewPassword(""); setConfirmPassword(""); }, 1500);
    } else {
      setError("Username not found.");
    }
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    if (!regFullName.trim() || !username.trim() || !password) { setError("Full name, username, and password are required."); return; }
    if (password.length < 4) { setError("Password must be at least 4 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (regRole === "headteacher" && !canRegisterHead) { setError("A Headteacher account already exists. Only one Headteacher account is permitted per system."); return; }
    if (regRole === "deputy" && !canRegisterDeputy) { setError("A Deputy Headteacher account already exists. Only one Deputy account is permitted per system."); return; }
    import("../utils/db").then(({ registerAdmin }) => {
      const res = registerAdmin({
        role: regRole,
        username: username.trim().toLowerCase(),
        password,
        fullName: regFullName.trim(),
        email: regEmail,
        phone: regPhone,
        gender: regGender,
      });
      if (!res.ok) { setError(res.message || "Registration failed."); return; }
      setInfo(`${regRole === "headteacher" ? "Headteacher" : "Deputy"} account created. You may now log in.`);
      setDbState(getDb());
      setTimeout(() => { setMode("login"); setUsername(""); setPassword(""); setNewPassword(""); setConfirmPassword(""); setRegFullName(""); setRegEmail(""); setRegPhone(""); }, 1800);
    });
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-3 sm:p-4 overflow-x-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950" />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 25% 25%, rgba(212,175,55,0.3) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(212,175,55,0.2) 0%, transparent 50%)" }} />

      <div className="relative w-full max-w-md sm:max-w-lg">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-5 sm:p-8 border-t-4 border-yellow-500">
          <LogoHeader />

          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              {mode === "login" ? "YPMS Login" : mode === "forgot" ? "Reset Password" : "Create Admin Account"}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              {mode === "login" ? "Yengwe Pupils Management System" : mode === "forgot" ? "Enter your new password" : "One-time admin registration (one Head, one Deputy)"}
            </p>
          </div>

          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
              <Input label="Username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" required autoFocus />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required />
              {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm text-center">{error}</div>}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-2 text-sm">
                <button type="button" onClick={() => { setMode("forgot"); setError(""); setInfo(""); }} className="text-emerald-700 hover:text-emerald-900 font-medium">Forgot Password?</button>
                {canRegister && (
                  <button type="button" onClick={() => { setMode("register"); setError(""); setInfo(""); }} className="text-amber-700 hover:text-amber-900 font-medium">+ Create Admin Account</button>
                )}
              </div>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleReset} className="space-y-3 sm:space-y-4">
              <Input label="Username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" required autoFocus />
              <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm text-center">{error}</div>}
              {info && <div className="p-2 rounded bg-green-50 border border-green-200 text-green-700 text-sm text-center">{info}</div>}
              <Button type="submit" className="w-full" variant="gold">Reset Password</Button>
              <button type="button" onClick={() => { setMode("login"); setError(""); setInfo(""); }} className="w-full text-center text-sm text-emerald-700 hover:text-emerald-900 font-medium mt-2">Back to Login</button>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={handleRegister} className="space-y-3 sm:space-y-4">
              {!canRegister ? (
                <div className="p-3 rounded bg-yellow-50 border border-yellow-300 text-yellow-900 text-sm">
                  Both the Headteacher and Deputy Headteacher accounts have already been registered. No additional admin accounts can be created on this system. If you believe this is an error, please contact the current administrator.
                </div>
              ) : (
                <>
                  <Select label="Registering as" value={regRole} onChange={(e) => setRegRole(e.target.value as any)}>
                    {canRegisterHead && <option value="headteacher">Headteacher</option>}
                    {canRegisterDeputy && <option value="deputy">Deputy Headteacher</option>}
                  </Select>
                  <Input label="Full Name *" value={regFullName} onChange={(e) => setRegFullName(e.target.value)} placeholder="e.g. Mr. Banda M." required />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Username *" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} placeholder="Login username" required />
                    <Select label="Gender" value={regGender} onChange={(e) => setRegGender(e.target.value as any)}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Password *" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <Input label="Confirm Password *" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Email" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                    <Input label="Phone" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} />
                  </div>
                  <div className="p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-xs">
                    🔒 Each role slot may be registered only ONCE across the entire system (even from other devices). Once an account is created, the link is permanently locked.
                  </div>
                  {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm text-center">{error}</div>}
                  {info && <div className="p-2 rounded bg-green-50 border border-green-200 text-green-700 text-sm text-center">{info}</div>}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>Cancel</Button>
                    <Button type="submit" variant="gold" className="flex-1">Create Account</Button>
                  </div>
                </>
              )}
            </form>
          )}

          {mode === "login" && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500 text-center space-y-1">
                <p><strong>Default pupil password:</strong> 1234</p>
                {!headRegistered || !deputyRegistered ? (
                  <p className="text-amber-700 font-medium">
                    ⚠ Admin account{!headRegistered && !deputyRegistered ? "s" : ""} not yet registered. Click "Create Admin Account" above.
                  </p>
                ) : (
                  <>
                    <p className="hidden sm:block">Head: <code className="bg-gray-100 px-1 rounded">headteacher</code> / <code className="bg-gray-100 px-1 rounded">admin123</code></p>
                    <p className="hidden sm:block">Deputy: <code className="bg-gray-100 px-1 rounded">deputy</code> / <code className="bg-gray-100 px-1 rounded">deputy123</code></p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-white/70 text-[10px] sm:text-xs mt-3 sm:mt-4 px-2">
          © {new Date().getFullYear()} Yengwe Secondary School • <strong className="text-yellow-300">smart yengwe.sch</strong> • YPMS • Fully responsive for phones, tablets, laptops &amp; large screens
        </p>
      </div>
    </div>
  );
}
