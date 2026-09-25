import { useState, useRef } from "react";
import { Camera, Lock, PenLine } from "lucide-react";
import { useAuth, MIN_PASSWORD_LENGTH } from "../context/AuthContext";
import { Card, Button, Input, Select, Avatar, Badge } from "../components/ui";
import { toast } from "../components/feedback";
import { logActivity } from "../utils/db";
import { readImage, IMAGE_SIZES } from "../utils/image";
import { PROVINCES, GRADES } from "../data/constants";
import { ROLE_LABEL } from "../components/DashboardLayout";
import { PasswordInput } from "./Login";
import type { User as UserType } from "../types";

export default function Profile() {
  const { user: currentUser, updateUser, changePassword } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<UserType>>(currentUser || {});
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  if (!currentUser) return null;
  const user = currentUser;
  const isAdmin = user.role === "headteacher" || user.role === "deputy";

  const canUploadProfile = isAdmin || (user.role === "hod" && user.hodDepartment === "IT Department");

  async function handleUploadPic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      updateUser({ profilePicture: await readImage(file, IMAGE_SIZES.avatar) });
      toast.success("Profile picture updated.");
      logActivity(user.id, user.fullName, user.role, "Updated own profile picture");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function handleUploadSignature(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      updateUser({ signature: await readImage(file, IMAGE_SIZES.signature) });
      toast.success("Signature uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  function handleSave() {
    // Class placement and IDs are managed by the school office.
    const { grade: _g, classSection: _c, pupilId: _p, teacherId: _t, role: _r, username: _u, ...editable } = form;
    updateUser(isAdmin ? form : editable);
    setEditing(false);
    toast.success("Profile updated.");
    logActivity(user.id, user.fullName, user.role, "Updated own profile");
  }

  function cancelEdit() {
    setForm(user);
    setEditing(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (newPassword !== confirmNew) { setPwError("New passwords don't match."); return; }
    setPwLoading(true);
    const res = await changePassword(oldPassword, newPassword);
    setPwLoading(false);
    if (!res.success) { setPwError(res.message || "Could not change password."); return; }
    setOldPassword(""); setNewPassword(""); setConfirmNew("");
    toast.success("Password changed successfully.");
  }

  const provinces = Object.keys(PROVINCES);
  const districts = form.province ? PROVINCES[form.province]?.districts || [] : [];
  const lockedHint = "Managed by the school office";

  return (
    <div className="space-y-5 max-w-4xl">
      <Card className="overflow-hidden !p-0">
        <div className="h-20 bg-gradient-to-r from-emerald-700 to-emerald-900" />
        <div className="px-5 pb-5 -mt-10 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="relative w-fit">
            <Avatar name={user.fullName} src={user.profilePicture} size="xl" className="ring-4 ring-white shadow-md" />
            {canUploadProfile && (
              <button onClick={() => fileRef.current?.click()} className="absolute bottom-1 right-1 bg-emerald-600 hover:bg-emerald-700 text-white w-9 h-9 rounded-full flex items-center justify-center shadow-md ring-2 ring-white transition-colors" aria-label="Upload photo">
                <Camera className="w-4 h-4" />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadPic} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{user.fullName}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge color="emerald">{ROLE_LABEL[user.role]}</Badge>
              {user.hodDepartment && <Badge color="blue">{user.hodDepartment}</Badge>}
              {user.grade && <Badge color="gray">Grade {user.grade}{user.classSection ? ` · ${user.classSection}` : ""}</Badge>}
            </div>
            <p className="text-xs text-gray-500 mt-2">@{user.username} · Joined {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          {!editing && <Button variant="gold" onClick={() => setEditing(true)}><PenLine className="w-4 h-4" />Edit profile</Button>}
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Profile details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Full name" value={form.fullName || ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={!editing} />
          <Input label="Username" value={form.username || ""} disabled hint="Usernames can't be changed" />
          <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!editing} />
          <Input label="Phone" type="tel" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!editing} />
          <Select label="Gender" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value as "Male" | "Female" })} disabled={!editing}>
            <option value="">Select…</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </Select>

          {user.role === "pupil" && (
            <>
              <Input label="Pupil ID" value={form.pupilId || ""} disabled hint={lockedHint} />
              <Select label="Grade" value={form.grade || ""} disabled>
                <option value="">Select…</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Input label="Class section" value={form.classSection || ""} disabled hint={lockedHint} />
              <Select label="Province" value={form.province || ""} onChange={(e) => setForm({ ...form, province: e.target.value, district: "" })} disabled={!editing}>
                <option value="">Select…</option>
                {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Select label="District" value={form.district || ""} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!editing || !form.province}>
                <option value="">Select…</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Input label="Date of birth" type="date" value={form.dateOfBirth || ""} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} disabled={!editing} />
              <Input label="Guardian name" value={form.guardiansName || ""} onChange={(e) => setForm({ ...form, guardiansName: e.target.value })} disabled={!editing} />
              <Input label="Guardian phone" type="tel" value={form.guardiansPhone || ""} onChange={(e) => setForm({ ...form, guardiansPhone: e.target.value })} disabled={!editing} />
              <Input label="Home address" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!editing} className="md:col-span-2" />
            </>
          )}

          {(user.role === "teacher" || user.role === "hod") && (
            <>
              <Input label="Teacher ID" value={form.teacherId || ""} disabled hint={lockedHint} />
              <Input label="Qualifications" value={form.qualifications || ""} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} disabled={!editing} />
            </>
          )}
        </div>
        {editing && (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
            <Button onClick={handleSave}>Save changes</Button>
          </div>
        )}
      </Card>

      {user.role !== "pupil" && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-1">
            {user.role === "headteacher" ? "Headteacher signature" : "My signature"}
          </h3>
          <p className="text-sm text-gray-500 mb-4">Appears on report cards{user.role === "headteacher" ? "" : " for pupils in your class"}. A PNG with a transparent background looks best.</p>
          <div className="flex items-center gap-4 flex-wrap">
            {user.signature ? (
              <div className="rounded-lg ring-1 ring-gray-200 p-2 bg-white">
                <img src={user.signature} alt="Your signature" className="h-16" />
              </div>
            ) : (
              <div className="text-sm italic text-gray-400">No signature uploaded yet</div>
            )}
            <Button variant="secondary" onClick={() => sigRef.current?.click()}>{user.signature ? "Replace" : "Upload"} signature</Button>
            {user.signature && (
              <button type="button" onClick={() => { updateUser({ signature: undefined }); toast.success("Signature removed."); }} className="text-red-600 text-sm font-medium hover:underline">Remove</button>
            )}
            <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={handleUploadSignature} />
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2"><Lock className="w-4 h-4 text-gray-500" />Change password</h3>
        <p className="text-sm text-gray-500 mb-4">Use at least {MIN_PASSWORD_LENGTH} characters. Avoid passwords you use elsewhere.</p>
        <form onSubmit={handleChangePassword} noValidate>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PasswordInput label="Current password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
            <PasswordInput label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            <PasswordInput label="Confirm new password" value={confirmNew} onChange={(e) => setConfirmNew(e.target.value)} autoComplete="new-password" />
          </div>
          {pwError && <p role="alert" className="text-sm text-red-600 mt-3">{pwError}</p>}
          <div className="mt-4 flex justify-end">
            <Button type="submit" loading={pwLoading} disabled={!oldPassword || !newPassword || !confirmNew}>Update password</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
