import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth, MIN_PASSWORD_LENGTH } from "../context/AuthContext";
import { Alert, Button } from "../components/ui";
import { toast } from "../components/feedback";
import { PasswordInput } from "./Login";

export default function ForcePasswordChange() {
  const { user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = "Choose a new password · YPMS"; }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("New passwords do not match."); return; }
    setLoading(true);
    const res = await changePassword(current, next);
    setLoading(false);
    if (!res.success) { setError(res.message || "Could not change password."); return; }
    toast.success("Password updated. Welcome to YPMS!");
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950" />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border-t-4 border-yellow-500 animate-modalIn">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Choose a new password</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Welcome, {user?.fullName}. You signed in with a temporary password — please replace it with one only you know.
        </p>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <PasswordInput label="Temporary password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus />
          <PasswordInput label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`} required />
          <PasswordInput label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full py-2.5" loading={loading} disabled={!current || !next || !confirm}>Save new password</Button>
          <button type="button" onClick={logout} className="w-full text-center text-sm text-gray-500 hover:text-gray-800">Sign out</button>
        </form>
      </div>
    </div>
  );
}
