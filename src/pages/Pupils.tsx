import { useState, useMemo, useRef } from "react";
import { GraduationCap, Plus, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader, Avatar, RowAction, Alert } from "../components/ui";
import { toast, confirmDialog, showCredentials } from "../components/feedback";
import { getDb, saveDb, logActivity, refreshData, useDbVersion } from "../utils/db";
import { adminUsers } from "../lib/supabase";
import { readImage, IMAGE_SIZES } from "../utils/image";
import { PROVINCES, GRADES, JUNIOR_SUBJECTS, SENIOR_SUBJECTS } from "../data/constants";
import type { User } from "../types";

export default function Pupils() {
  const { user } = useAuth();
  const version = useDbVersion();
  const picRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<{ open: boolean; pupil: User | null; mode: "register" | "view" | "edit" }>({ open: false, pupil: null, mode: "register" });
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [form, setForm] = useState<Partial<User>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const db = useMemo(() => getDb(), [version]);
  const pupils = useMemo(() => db.users.filter((u) => u.role === "pupil").sort((a, b) => a.fullName.localeCompare(b.fullName)), [db]);

  if (!user) return null;
  const currentUser = user;
  const canRegister = currentUser.role === "headteacher" || currentUser.role === "deputy";
  const canEdit = canRegister;
  const canDelete = currentUser.role === "headteacher";
  const isIT = canRegister || (currentUser.role === "hod" && currentUser.hodDepartment === "IT Department");

  const filtered = pupils.filter((p) => {
    const s = search.toLowerCase();
    const m1 = !s || p.fullName.toLowerCase().includes(s) || (p.pupilId || "").toLowerCase().includes(s) || p.username.toLowerCase().includes(s);
    const m2 = !gradeFilter || p.grade === gradeFilter;
    return m1 && m2;
  });

  async function handleProfilePicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const img = await readImage(file, IMAGE_SIZES.avatar);
      setForm((prev) => ({ ...prev, profilePicture: img }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  function openRegister() {
    setForm({ role: "pupil", gender: "Male", classSection: "A" });
    setModal({ open: true, pupil: null, mode: "register" });
    setError("");
  }
  function openView(p: User) { setModal({ open: true, pupil: p, mode: "view" }); }
  function openEdit(p: User) {
    setForm({ ...p }); setModal({ open: true, pupil: p, mode: "edit" }); setError("");
  }
  function closeModal() { setModal({ ...modal, open: false }); }

  async function savePupil() {
    setError("");
    if (!form.fullName?.trim() || !form.grade) { setError("Full name and grade are required."); return; }
    if (modal.mode === "register") {
      if (!form.username) { setError("Username is required."); return; }
      if (pupils.some((u) => u.username === form.username)) { setError("That username already exists."); return; }
      setSaving(true);
      try {
        const profile = {
          email: form.email, phone: form.phone, profilePicture: form.profilePicture, gender: form.gender,
          grade: form.grade, classSection: form.classSection || "A",
          pupilId: form.pupilId || `PUP-${Date.now().toString().slice(-5)}`,
          province: form.province, district: form.district, dateOfBirth: form.dateOfBirth,
          guardiansName: form.guardiansName, guardiansPhone: form.guardiansPhone, address: form.address,
          enrollmentYear: new Date().getFullYear(),
        };
        const res = await adminUsers({ action: "create", role: "pupil", username: form.username, fullName: form.fullName.trim(), profile });
        await refreshData(["users"]);
        closeModal();
        showCredentials({ title: "Pupil registered", name: form.fullName.trim(), username: res.username!, password: res.password! });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not register pupil.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (modal.mode === "edit" && modal.pupil) {
      const db2 = getDb();
      const idx = db2.users.findIndex((u) => u.id === modal.pupil!.id);
      if (idx >= 0) {
        db2.users[idx] = { ...db2.users[idx], ...form, username: db2.users[idx].username, role: "pupil" };
        saveDb(db2);
        logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Edited pupil ${db2.users[idx].fullName}`);
        toast.success("Pupil details saved.");
      }
      closeModal();
    }
  }

  async function deletePupil(p: User) {
    const ok = await confirmDialog({ title: "Delete pupil?", message: `${p.fullName}'s account and all of their results will be permanently deleted.`, confirmLabel: "Delete pupil", danger: true });
    if (!ok) return;
    try {
      await adminUsers({ action: "delete", userId: p.id });
      await refreshData(["users", "results"]);
      toast.success(`${p.fullName} was deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete pupil.");
    }
  }

  async function resetPassword(p: User) {
    const ok = await confirmDialog({ title: "Reset password?", message: `A new temporary password will be generated for ${p.fullName}. Their current password will stop working.`, confirmLabel: "Reset password" });
    if (!ok) return;
    try {
      const res = await adminUsers({ action: "reset_password", userId: p.id });
      await refreshData(["users"]);
      showCredentials({ title: "Password reset", name: p.fullName, username: res.username!, password: res.password! });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password.");
    }
  }

  const provinces = Object.keys(PROVINCES);
  const districts = form.province ? PROVINCES[form.province]?.districts || [] : [];
  const isJuniorGrade = (g?: string) => !!g && ["8A", "8B", "9A", "9B"].includes(g);

  return (
    <div>
      <PageHeader title="Pupils" subtitle={`${pupils.length} pupil${pupils.length === 1 ? "" : "s"} enrolled`}>
        {canRegister && <Button variant="gold" onClick={openRegister}><Plus className="w-4 h-4" />Register pupil</Button>}
      </PageHeader>

      <Card className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input aria-label="Search pupils" placeholder="Search by name, pupil ID or username…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Filter by grade" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
            <option value="">All grades</option>
            {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </Select>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="w-6 h-6" />}
            message={pupils.length === 0 ? "No pupils registered yet." : "No pupils match your search."}
            action={pupils.length === 0 && canRegister ? <Button variant="gold" onClick={openRegister}><Plus className="w-4 h-4" />Register the first pupil</Button> : undefined}
          />
        ) : (
          <Table headers={["Pupil", "Pupil ID", "Grade", "Gender", "Province", ""]}>
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-[180px]">
                    <Avatar name={p.fullName} src={p.profilePicture} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{p.fullName}</div>
                      <div className="text-xs text-gray-500">@{p.username}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{p.pupilId || "—"}</td>
                <td className="px-4 py-3"><Badge color="emerald">{p.grade}{p.classSection && !p.grade?.endsWith(p.classSection) ? ` · ${p.classSection}` : ""}</Badge></td>
                <td className="px-4 py-3 text-gray-600">{p.gender || "—"}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{p.province || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-0.5 justify-end flex-wrap">
                    <RowAction tone="primary" onClick={() => openView(p)}>View</RowAction>
                    {canEdit && <RowAction tone="warn" onClick={() => openEdit(p)}>Edit</RowAction>}
                    {canRegister && <RowAction onClick={() => resetPassword(p)}>Reset password</RowAction>}
                    {canDelete && <RowAction tone="danger" onClick={() => deletePupil(p)}>Delete</RowAction>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal.open} onClose={closeModal} title={modal.mode === "register" ? "Register new pupil" : modal.mode === "edit" ? `Edit ${modal.pupil?.fullName}` : modal.pupil?.fullName || "Pupil"} size="lg">
        {modal.mode === "view" && modal.pupil ? (
          <div className="space-y-5 text-sm">
            <div className="flex items-center gap-4">
              <Avatar name={modal.pupil.fullName} src={modal.pupil.profilePicture} size="lg" className="ring-2 ring-emerald-600 ring-offset-2" />
              <div>
                <div className="font-bold text-lg text-gray-900">{modal.pupil.fullName}</div>
                <Badge color="emerald">Grade {modal.pupil.grade}{modal.pupil.classSection ? ` · Section ${modal.pupil.classSection}` : ""}</Badge>
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {([
                ["Pupil ID", modal.pupil.pupilId], ["Username", modal.pupil.username], ["Gender", modal.pupil.gender],
                ["Email", modal.pupil.email], ["Phone", modal.pupil.phone], ["Date of birth", modal.pupil.dateOfBirth],
                ["Province", modal.pupil.province], ["District", modal.pupil.district], ["Guardian", modal.pupil.guardiansName],
                ["Guardian phone", modal.pupil.guardiansPhone], ["Enrolled", modal.pupil.enrollmentYear?.toString()], ["Address", modal.pupil.address],
              ] as [string, string | undefined][]).map(([k, v]) => (
                <div key={k} className="flex justify-between sm:block gap-4 border-b sm:border-0 border-gray-100 pb-2 sm:pb-0">
                  <dt className="text-xs text-gray-500">{k}</dt>
                  <dd className="font-medium text-gray-900 text-right sm:text-left break-words">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="pt-4 border-t border-gray-100">
              <h4 className="font-semibold text-gray-900 mb-2">Subjects · {isJuniorGrade(modal.pupil.grade) ? "Junior Secondary" : "Senior Secondary"}</h4>
              <div className="flex flex-wrap gap-1.5">
                {(isJuniorGrade(modal.pupil.grade) ? JUNIOR_SUBJECTS : SENIOR_SUBJECTS).map((s) => <Badge key={s} color="gray">{s}</Badge>)}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}

            {isIT && (
              <div className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 ring-1 ring-gray-200">
                <Avatar name={form.fullName || "?"} src={form.profilePicture} size="lg" />
                <div>
                  <div className="font-medium text-sm text-gray-900">Profile picture</div>
                  <div className="text-xs text-gray-500 mb-2">Headteacher, Deputy or IT HoD only.</div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" className="!py-1 !px-3 !text-xs" onClick={() => picRef.current?.click()}>Choose photo</Button>
                    {form.profilePicture && <button type="button" onClick={() => setForm({ ...form, profilePicture: undefined })} className="text-xs text-red-600 font-medium hover:underline">Remove</button>}
                  </div>
                  <input ref={picRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePicUpload} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Full name *" value={form.fullName || ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoFocus />
              <Input label="Username *" value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })} disabled={modal.mode === "edit"} hint={modal.mode === "register" ? "Used to sign in. 3–32 letters/numbers." : "Usernames can't be changed"} />
              <Input label="Pupil ID" value={form.pupilId || ""} onChange={(e) => setForm({ ...form, pupilId: e.target.value })} placeholder="Auto-generated if blank" />
              <Select label="Grade *" value={form.grade || ""} onChange={(e) => setForm({ ...form, grade: e.target.value as User["grade"] })}>
                <option value="">Select…</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Input label="Class section" value={form.classSection || ""} onChange={(e) => setForm({ ...form, classSection: e.target.value.toUpperCase() })} maxLength={2} placeholder="e.g. A, B" />
              <Select label="Gender" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value as "Male" | "Female" })}>
                <option value="">Select…</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </Select>
              <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Phone" type="tel" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Date of birth" type="date" value={form.dateOfBirth || ""} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              <Select label="Province" value={form.province || ""} onChange={(e) => setForm({ ...form, province: e.target.value, district: "" })}>
                <option value="">Select…</option>
                {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Select label="District" value={form.district || ""} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!form.province}>
                <option value="">Select…</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Input label="Guardian name" value={form.guardiansName || ""} onChange={(e) => setForm({ ...form, guardiansName: e.target.value })} />
              <Input label="Guardian phone" type="tel" value={form.guardiansPhone || ""} onChange={(e) => setForm({ ...form, guardiansPhone: e.target.value })} />
              <Input label="Home address" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="md:col-span-2" />
            </div>
            {modal.mode === "register" && (
              <Alert tone="success">A secure temporary password is generated automatically and shown once. The pupil chooses their own password at first sign-in.</Alert>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button variant="gold" onClick={savePupil} loading={saving}>{modal.mode === "register" ? "Register pupil" : "Save changes"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
