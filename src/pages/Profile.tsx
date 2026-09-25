import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select } from "../components/ui";
import { logActivity } from "../utils/db";
import { PROVINCES, GRADES } from "../data/constants";
import type { User as UserType } from "../types";

export default function Profile() {
  const { user: currentUser, updateUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<UserType>>(currentUser || {});
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!currentUser) return null;
  const user = currentUser;

  const canUploadProfile = ["headteacher", "deputy"].includes(user.role) ||
    (user.role === "hod" && user.hodDepartment === "IT Department");

  function handleUploadPic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateUser({ profilePicture: reader.result as string });
      setMsg({ type: "success", text: "Profile picture updated." });
      logActivity(user.id, user.fullName, user.role, "Updated own profile picture");
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    updateUser(form);
    setEditing(false);
    setMsg({ type: "success", text: "Profile updated." });
    logActivity(user.id, user.fullName, user.role, "Updated own profile");
  }

  function handleChangePassword() {
    setMsg(null);
    if (user.password !== oldPassword) { setMsg({ type: "error", text: "Old password is incorrect" }); return; }
    if (newPassword.length < 4) { setMsg({ type: "error", text: "New password must be at least 4 characters" }); return; }
    if (newPassword !== confirmNew) { setMsg({ type: "error", text: "Passwords don't match" }); return; }
    updateUser({ password: newPassword, mustChangePassword: false });
    setOldPassword(""); setNewPassword(""); setConfirmNew("");
    setMsg({ type: "success", text: "Password changed successfully." });
    logActivity(user.id, user.fullName, user.role, "Changed own password");
  }

  const provinces = Object.keys(PROVINCES);
  const districts = form.province ? PROVINCES[form.province]?.districts || [] : [];

  return (
    <div className="space-y-6 max-w-4xl">
      {user.mustChangePassword && (
        <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-900">
          ⚠️ You must change your default password before continuing.
        </div>
      )}

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
          {msg.text}
        </div>
      )}

      <Card>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="relative">
            {user.profilePicture ? (
              <img src={user.profilePicture} alt="Profile" className="w-28 h-28 rounded-full object-cover border-4 border-emerald-600 shadow" />
            ) : (
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-900 flex items-center justify-center text-white text-4xl font-bold border-4 border-emerald-400">
                {user.fullName.charAt(0)}
              </div>
            )}
            {canUploadProfile && (
              <button onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 bg-emerald-600 hover:bg-emerald-700 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm shadow" title="Upload photo">
                📷
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadPic} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">{user.fullName}</h2>
            <p className="text-emerald-700 font-medium capitalize">{user.role.replace("_", " ")} {user.hodDepartment ? `• ${user.hodDepartment}` : ""}</p>
            <p className="text-sm text-gray-500 mt-1">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
            <div className="flex gap-2 mt-3">
              <Button variant={editing ? "ghost" : "gold"} onClick={() => setEditing(!editing)}>
                {editing ? "Cancel" : "Edit Profile"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Profile Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Full Name" value={form.fullName || ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={!editing} />
          <Input label="Username" value={form.username || ""} disabled />
          <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!editing} />
          <Input label="Phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!editing} />
          <Select label="Gender" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value as "Male" | "Female" })} disabled={!editing}>
            <option value="">-- Select --</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </Select>

          {user.role === "pupil" && (
            <>
              <Input label="Pupil ID" value={form.pupilId || ""} onChange={(e) => setForm({ ...form, pupilId: e.target.value })} disabled={!editing} />
              <Select label="Grade" value={form.grade || ""} onChange={(e) => setForm({ ...form, grade: e.target.value as any })} disabled={!editing}>
                <option value="">-- Select --</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Input label="Class Section" value={form.classSection || ""} onChange={(e) => setForm({ ...form, classSection: e.target.value.toUpperCase() })} disabled={!editing} maxLength={2} placeholder="e.g. A, B" />
              <Select label="Province" value={form.province || ""} onChange={(e) => setForm({ ...form, province: e.target.value, district: "" })} disabled={!editing}>
                <option value="">-- Select --</option>
                {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Select label="District" value={form.district || ""} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!editing || !form.province}>
                <option value="">-- Select --</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Input label="Date of Birth" type="date" value={form.dateOfBirth || ""} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} disabled={!editing} />
              <Input label="Guardian Name" value={form.guardiansName || ""} onChange={(e) => setForm({ ...form, guardiansName: e.target.value })} disabled={!editing} />
              <Input label="Guardian Phone" value={form.guardiansPhone || ""} onChange={(e) => setForm({ ...form, guardiansPhone: e.target.value })} disabled={!editing} />
              <Input label="Home Address" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!editing} className="md:col-span-2" />
            </>
          )}

          {user.role === "teacher" || user.role === "hod" ? (
            <>
              <Input label="Teacher ID" value={form.teacherId || ""} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} disabled={!editing} />
              <Input label="Qualifications" value={form.qualifications || ""} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} disabled={!editing} />
            </>
          ) : null}
        </div>
        {editing && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        )}
      </Card>

      {(user.role === "headteacher" || user.role === "deputy" || user.role === "teacher" || user.role === "hod") && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">
            {user.role === "headteacher" ? "Headteacher Signature (for Reports)" : "My Signature (for class-teacher line on report cards)"}
          </h3>
          <p className="text-sm text-gray-600 mb-3">Upload an image of your signature (PNG with transparent background recommended). For class teachers, this signature will appear on your pupils' report cards.</p>
          <div className="flex items-center gap-4 flex-wrap">
            {user.signature ? (
              <div className="border rounded p-2 bg-white">
                <img src={user.signature} alt="Signature" className="h-16" />
              </div>
            ) : (
              <div className="text-sm italic text-gray-400">No signature uploaded yet</div>
            )}
            <Button onClick={() => sigRef.current?.click()}>Upload Signature</Button>
            {user.signature && (
              <button type="button" onClick={() => { updateUser({ signature: undefined }); setMsg({ type: "success", text: "Signature removed." }); }} className="text-red-600 text-sm hover:underline">Remove</button>
            )}
            <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader();
              r.onload = () => { updateUser({ signature: r.result as string }); setMsg({ type: "success", text: "Signature uploaded." }); };
              r.readAsDataURL(f);
            }} />
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Change Password</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Current Password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
          <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Input label="Confirm New Password" type="password" value={confirmNew} onChange={(e) => setConfirmNew(e.target.value)} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={handleChangePassword}>Update Password</Button>
        </div>
      </Card>
    </div>
  );
}
