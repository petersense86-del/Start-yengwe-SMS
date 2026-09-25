import { useState, useMemo, useRef } from "react";
import { Plus, Search, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader, Avatar, RowAction, Alert } from "../components/ui";
import { toast, confirmDialog, showCredentials } from "../components/feedback";
import { getDb, saveDb, logActivity, refreshData, useDbVersion } from "../utils/db";
import { adminUsers } from "../lib/supabase";
import { readImage, IMAGE_SIZES } from "../utils/image";
import { DEPARTMENTS, JUNIOR_SUBJECTS, SENIOR_SUBJECTS, GRADES } from "../data/constants";
import type { Department, Grade } from "../data/constants";
import type { User } from "../types";

const ALL_SUBJECTS = Array.from(new Set([...JUNIOR_SUBJECTS, ...SENIOR_SUBJECTS]));

export default function Teachers() {
  const { user } = useAuth();
  const version = useDbVersion();
  const picRef = useRef<HTMLInputElement>(null);
  const db = useMemo(() => getDb(), [version]);
  const [modal, setModal] = useState<{ open: boolean; person: User | null; mode: "register" | "assign" | "edit" }>({ open: false, person: null, mode: "register" });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<User>>({});
  const [assignSubjects, setAssignSubjects] = useState<string[]>([]);
  const [assignClasses, setAssignClasses] = useState<{ grade: Grade; section: string }[]>([]);
  const [newGrade, setNewGrade] = useState("");
  const [newSection, setNewSection] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  const currentUser = user;
  const isHead = currentUser.role === "headteacher";
  const isAdmin = isHead || currentUser.role === "deputy";
  const isHOD = currentUser.role === "hod";
  const isIT = isAdmin || (isHOD && currentUser.hodDepartment === "IT Department");
  const hasDeputy = db.users.some((u) => u.role === "deputy");

  const staff = db.users
    .filter((u) => u.role === "teacher" || u.role === "hod" || (isHead && u.role === "deputy"))
    .sort((a, b) => (a.role === "deputy" ? -1 : b.role === "deputy" ? 1 : a.fullName.localeCompare(b.fullName)));

  const filtered = staff.filter((t) => {
    const s = search.toLowerCase();
    return !s || t.fullName.toLowerCase().includes(s) || (t.teacherId || "").toLowerCase().includes(s) || t.username.toLowerCase().includes(s);
  });

  function openRegister() {
    setForm({ role: "teacher", gender: "Male" });
    setModal({ open: true, person: null, mode: "register" });
    setError("");
  }
  function openAssign(t: User) {
    setForm(t);
    setAssignSubjects(t.subjects || []);
    setAssignClasses(t.classes || []);
    setModal({ open: true, person: t, mode: "assign" });
    setError("");
  }
  function openEdit(t: User) {
    setForm(t);
    setModal({ open: true, person: t, mode: "edit" });
    setError("");
  }
  function closeModal() { setModal({ ...modal, open: false }); }

  async function saveTeacher() {
    setError("");
    if (modal.mode === "register") {
      if (!form.fullName?.trim()) { setError("Full name is required."); return; }
      if (!form.username) { setError("Username is required."); return; }
      if (db.users.some((u) => u.username === form.username)) { setError("That username already exists."); return; }
      const role = (form.role || "teacher") as User["role"];
      if (role === "hod" && !form.hodDepartment) { setError("Select the department this HoD leads."); return; }
      setSaving(true);
      try {
        const profile = {
          email: form.email, phone: form.phone, profilePicture: form.profilePicture, gender: form.gender,
          teacherId: form.teacherId || (role === "deputy" ? undefined : `TCH-${Date.now().toString().slice(-5)}`),
          departments: form.departments || (role === "hod" && form.hodDepartment ? [form.hodDepartment] : []),
          hodDepartment: role === "hod" ? form.hodDepartment : undefined,
          subjects: [], classes: [], qualifications: form.qualifications,
          employmentStatus: form.employmentStatus || "active", statusDate: form.statusDate, statusNote: form.statusNote, previousSchool: form.previousSchool,
        };
        const res = await adminUsers({ action: "create", role, username: form.username, fullName: form.fullName.trim(), profile });
        await refreshData(["users", "config"]);
        closeModal();
        showCredentials({ title: `${role === "deputy" ? "Deputy Headteacher" : role === "hod" ? "Head of Department" : "Teacher"} registered`, name: form.fullName.trim(), username: res.username!, password: res.password! });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not register staff member.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const db2 = getDb();
    const idx = db2.users.findIndex((u) => u.id === modal.person?.id);
    if (idx < 0) return;
    if (modal.mode === "edit") {
      if (!form.fullName?.trim()) { setError("Full name is required."); return; }
      const existing = db2.users[idx];
      const updated = { ...existing, ...form, username: existing.username };
      if (!isHead) {
        updated.role = existing.role;
        updated.fullName = existing.fullName;
      }
      db2.users[idx] = updated;
      saveDb(db2);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Edited staff ${updated.fullName}`);
      toast.success("Staff details saved.");
    } else if (modal.mode === "assign") {
      db2.users[idx].subjects = assignSubjects;
      db2.users[idx].classes = assignClasses;
      if (isAdmin && form.departments) db2.users[idx].departments = form.departments as Department[];
      saveDb(db2);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Assigned subjects/classes to ${db2.users[idx].fullName}`, assignSubjects.join(", "));
      toast.success("Assignments saved.");
    }
    closeModal();
  }

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

  function toggleSubject(s: string) {
    setAssignSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }
  function addClass() {
    if (!newGrade) return;
    const section = newSection || "A";
    if (assignClasses.some((c) => c.grade === newGrade && c.section === section)) return;
    setAssignClasses([...assignClasses, { grade: newGrade as Grade, section }]);
    setNewGrade(""); setNewSection("");
  }

  async function deletePerson(p: User) {
    const ok = await confirmDialog({ title: `Delete ${p.fullName}?`, message: "Their account will be removed permanently. Results they entered stay on pupils' records.", confirmLabel: "Delete account", danger: true });
    if (!ok) return;
    try {
      await adminUsers({ action: "delete", userId: p.id });
      await refreshData(["users"]);
      toast.success(`${p.fullName} was deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete account.");
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

  const roleBadge = (t: User) =>
    t.role === "deputy" ? <Badge color="emerald">Deputy Headteacher</Badge>
      : t.role === "hod" ? <Badge color="yellow">HoD{t.hodDepartment ? ` · ${t.hodDepartment}` : ""}</Badge>
      : <Badge color="blue">Teacher</Badge>;

  return (
    <div>
      <PageHeader title="Teachers & Heads of Department" subtitle={`${staff.filter((s) => s.role !== "deputy").length} teaching staff`}>
        {isAdmin && <Button variant="gold" onClick={openRegister}><Plus className="w-4 h-4" />Register staff</Button>}
      </PageHeader>

      {isHead && !hasDeputy && (
        <Alert tone="info" className="mb-4">No Deputy Headteacher account yet. Use <strong>Register staff</strong> and choose the role <em>Deputy Headteacher</em>.</Alert>
      )}

      <Card className="mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input aria-label="Search staff" placeholder="Search by name, teacher ID or username…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="w-6 h-6" />} message={staff.length === 0 ? "No staff registered yet." : "No staff match your search."}
            action={staff.length === 0 && isAdmin ? <Button variant="gold" onClick={openRegister}><Plus className="w-4 h-4" />Register the first teacher</Button> : undefined} />
        ) : (
          <Table headers={["Staff member", "Role", "Teacher ID", "Subjects / classes", "Department", ""]}>
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/80 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <Avatar name={t.fullName} src={t.profilePicture} size="sm" className={t.profilePicture ? "" : t.role === "hod" ? "from-amber-500 to-amber-700" : t.role === "teacher" ? "from-blue-500 to-blue-700" : ""} />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{t.fullName}</div>
                      {t.employmentStatus && t.employmentStatus !== "active" ? (
                        <div className="mt-0.5 flex items-center gap-1">
                          {t.employmentStatus === "on_leave" && <Badge color="yellow">On leave</Badge>}
                          {t.employmentStatus === "transferred_in" && <Badge color="green">Transferred in</Badge>}
                          {t.employmentStatus === "transferred_out" && <Badge color="red">Transferred out</Badge>}
                        </div>
                      ) : <div className="text-xs text-gray-500">@{t.username}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{roleBadge(t)}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.teacherId || "—"}</td>
                <td className="px-4 py-3 text-xs max-w-[240px]">
                  <div className="text-gray-800 truncate">{(t.subjects || []).join(", ") || <span className="text-gray-400">No subjects</span>}</div>
                  <div className="text-gray-500 truncate">{(t.classes || []).map((c) => `${c.grade}${c.section && !c.grade.endsWith(c.section) ? c.section : ""}`).join(", ")}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{(t.departments || []).join(", ") || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-0.5 justify-end flex-wrap">
                    {(isAdmin || isHOD) && t.role !== "deputy" && <RowAction tone="success" onClick={() => openAssign(t)}>Assign</RowAction>}
                    {isAdmin && <RowAction tone="warn" onClick={() => openEdit(t)}>Edit</RowAction>}
                    {isAdmin && <RowAction onClick={() => resetPassword(t)}>Reset password</RowAction>}
                    {isHead && <RowAction tone="danger" onClick={() => deletePerson(t)}>Delete</RowAction>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={modal.open}
        onClose={closeModal}
        title={modal.mode === "register" ? "Register staff member" : modal.mode === "assign" ? `Assign subjects & classes · ${modal.person?.fullName}` : `Edit ${modal.person?.fullName}`}
        size="lg"
      >
        {modal.mode === "assign" ? (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">Subjects</h4>
                <span className="text-xs text-gray-500">{assignSubjects.length} selected</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto rounded-xl ring-1 ring-gray-200 p-2">
                {ALL_SUBJECTS.map((s) => (
                  <label key={s} className={`flex items-center gap-2 text-sm px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${assignSubjects.includes(s) ? "bg-emerald-50 ring-1 ring-emerald-300 text-emerald-900" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" className="accent-emerald-600 w-4 h-4" checked={assignSubjects.includes(s)} onChange={() => toggleSubject(s)} />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Classes taught</h4>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Select aria-label="Grade" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} className="sm:w-40">
                  <option value="">Select grade…</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
                <Input aria-label="Section" placeholder="Section (A/B)" value={newSection} onChange={(e) => setNewSection(e.target.value.toUpperCase())} maxLength={2} className="sm:w-32" />
                <Button onClick={addClass} disabled={!newGrade}><Plus className="w-4 h-4" />Add class</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignClasses.length === 0 ? <span className="text-sm text-gray-500">No classes added yet.</span> : assignClasses.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-600/20">
                    {c.grade} · Section {c.section}
                    <button onClick={() => setAssignClasses(assignClasses.filter((_, idx) => idx !== i))} aria-label={`Remove ${c.grade} section ${c.section}`} className="p-0.5 rounded-full hover:bg-blue-100"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Departments</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                  {DEPARTMENTS.map((d) => {
                    const selected = (form.departments as Department[] | undefined) || [];
                    const isSelected = selected.includes(d);
                    return (
                      <label key={d} className={`flex items-center gap-2 text-sm px-2.5 py-2 rounded-lg cursor-pointer ring-1 transition-colors ${isSelected ? "bg-amber-50 ring-amber-300" : "ring-gray-200 hover:bg-gray-50"}`}>
                        <input type="checkbox" className="accent-amber-600 w-4 h-4" checked={isSelected} onChange={(e) => {
                          setForm({ ...form, departments: e.target.checked ? [...selected, d] : selected.filter((x) => x !== d) });
                        }} />
                        <span>{d}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button variant="gold" onClick={saveTeacher}>Save assignments</Button>
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
              <Input label="Full name *" value={form.fullName || ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={modal.mode === "edit" && !isHead} autoFocus={modal.mode === "register"} />
              <Input label="Username *" value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })} disabled={modal.mode === "edit"} hint={modal.mode === "register" ? "Used to sign in. 3–32 letters/numbers." : "Usernames can't be changed"} />
              <Input label="Teacher ID" value={form.teacherId || ""} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} placeholder="Auto-generated if blank" />
              {modal.mode === "register" || (isHead && modal.person?.role !== "deputy") ? (
                <Select label="Role" value={form.role || "teacher"} onChange={(e) => setForm({ ...form, role: e.target.value as User["role"], hodDepartment: e.target.value === "hod" ? form.hodDepartment : undefined })}>
                  <option value="teacher">Teacher</option>
                  <option value="hod">Head of Department (HoD)</option>
                  {isHead && modal.mode === "register" && !hasDeputy && <option value="deputy">Deputy Headteacher</option>}
                </Select>
              ) : (
                <Input label="Role" value={modal.person?.role === "hod" ? "Head of Department" : modal.person?.role === "deputy" ? "Deputy Headteacher" : "Teacher"} disabled />
              )}
              {form.role === "hod" && (
                <Select label="HoD department *" value={form.hodDepartment || ""} onChange={(e) => setForm({ ...form, hodDepartment: e.target.value as Department, departments: [e.target.value as Department] })}>
                  <option value="">Select…</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              )}
              <Select label="Gender" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value as "Male" | "Female" })}>
                <option value="">Select…</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </Select>
              <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Phone" type="tel" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Qualifications" value={form.qualifications || ""} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} className="md:col-span-2" />
            </div>

            {form.role !== "deputy" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                <h4 className="md:col-span-3 font-semibold text-sm text-gray-900 -mb-1">Employment status</h4>
                <Select label="Status" value={form.employmentStatus || "active"} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value as User["employmentStatus"] })}>
                  <option value="active">Active / in post</option>
                  <option value="on_leave">On leave</option>
                  <option value="transferred_in">Transferred in</option>
                  <option value="transferred_out">Transferred out</option>
                </Select>
                <Input label="Effective date" type="date" value={form.statusDate || ""} onChange={(e) => setForm({ ...form, statusDate: e.target.value })} />
                <Input label="Note / previous school" value={form.statusNote || form.previousSchool || ""} onChange={(e) => setForm({ ...form, statusNote: e.target.value, previousSchool: form.employmentStatus === "transferred_in" ? e.target.value : form.previousSchool })} placeholder="e.g. Maternity leave" />
              </div>
            )}

            {modal.mode === "register" && (
              <Alert tone="success">A secure temporary password is generated automatically and shown once. They choose their own password at first sign-in.</Alert>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button variant="gold" onClick={saveTeacher} loading={saving}>{modal.mode === "register" ? "Register" : "Save changes"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
