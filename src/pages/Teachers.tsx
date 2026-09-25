import { useState, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import { DEPARTMENTS, JUNIOR_SUBJECTS, SENIOR_SUBJECTS, GRADES } from "../data/constants";
import type { Department } from "../data/constants";
import type { User } from "../types";

const ALL_SUBJECTS = Array.from(new Set([...JUNIOR_SUBJECTS, ...SENIOR_SUBJECTS]));

export default function Teachers() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user;
  const isAdmin = currentUser.role === "headteacher" || currentUser.role === "deputy";
  const isHOD = currentUser.role === "hod";
  const isHead = currentUser.role === "headteacher";
  const isIT = currentUser.role === "headteacher" || currentUser.role === "deputy" || (currentUser.role === "hod" && currentUser.hodDepartment === "IT Department");
  const picRef = useRef<HTMLInputElement>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const teachers = useMemo(() => db.users.filter((u) => u.role === "teacher" || u.role === "hod"), [db]);

  const [modal, setModal] = useState<{ open: boolean; person: User | null; mode: "register" | "assign" | "edit" }>({ open: false, person: null, mode: "register" });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<User>>({});
  const [assignSubjects, setAssignSubjects] = useState<string[]>([]);
  const [assignClasses, setAssignClasses] = useState<{ grade: string; section: string }[]>([]);
  const [newGrade, setNewGrade] = useState("");
  const [newSection, setNewSection] = useState("");
  const [error, setError] = useState("");

  const filtered = teachers.filter((t) => {
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

  function saveTeacher() {
    setError("");
    if (!form.fullName) { setError("Full name required"); return; }
    const db2 = getDb();
    if (modal.mode === "register") {
      if (!form.username) { setError("Username required"); return; }
      const exists = db2.users.some((u) => u.username.toLowerCase() === form.username!.toLowerCase());
      if (exists) { setError("Username exists"); return; }
      if (!form.role) form.role = "teacher";
      // Disallow creating additional head/deputy accounts from this panel (use the one-time registration link)
      if (form.role === "headteacher" || form.role === "deputy") {
        setError("Headteacher and Deputy accounts must be created via the one-time registration link on the login page.");
        return;
      }
      const newT: User = {
        id: genId(form.role),
        username: form.username,
        password: form.role === "hod" ? "hod123" : "teacher123",
        fullName: form.fullName,
        role: form.role as User["role"],
        email: form.email,
        phone: form.phone,
        profilePicture: form.profilePicture,
        gender: form.gender as "Male" | "Female",
        teacherId: form.teacherId || `TCH-${Date.now().toString().slice(-5)}`,
        departments: form.departments || (form.role === "hod" && form.hodDepartment ? [form.hodDepartment as Department] : []),
        hodDepartment: form.role === "hod" ? (form.hodDepartment as Department) : undefined,
        subjects: [],
        classes: [],
        qualifications: form.qualifications,
        employmentStatus: form.employmentStatus || "active",
        statusDate: form.statusDate,
        statusNote: form.statusNote,
        previousSchool: form.previousSchool,
        createdAt: new Date().toISOString(),
        mustChangePassword: true,
      };
      db2.users.push(newT);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Registered ${newT.role} ${newT.fullName}`, newT.hodDepartment ? `HoD ${newT.hodDepartment}` : "");
    } else if (modal.mode === "edit" && modal.person) {
      const idx = db2.users.findIndex((u) => u.id === modal.person!.id);
      if (idx >= 0) {
        const existing = db2.users[idx];
        // Only head can edit name, role of deputy/teachers; admins can edit details
        const updated = { ...existing, ...form };
        // If head is editing, allow role/name change; else keep role same if user isn't head
        if (!isHead) {
          updated.role = existing.role;
          updated.fullName = existing.fullName;
        }
        db2.users[idx] = updated;
        logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Edited staff ${db2.users[idx].fullName}`);
      }
    } else if (modal.mode === "assign" && modal.person) {
      const idx = db2.users.findIndex((u) => u.id === modal.person!.id);
      if (idx >= 0) {
        // HoD can assign only subjects (not department change), admin can fully assign
        db2.users[idx].subjects = assignSubjects;
        db2.users[idx].classes = assignClasses as any;
        // If admin assigning departments
        if (isAdmin && form.departments) {
          db2.users[idx].departments = form.departments as Department[];
        }
        logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Assigned subjects/classes to ${db2.users[idx].fullName}`, assignSubjects.join(", "));
      }
    }
    saveDb(db2);
    setModal({ open: false, person: null, mode: "register" });
    setRefreshKey((k) => k + 1);
  }

  function handleProfilePicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, profilePicture: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function toggleSubject(s: string) {
    setAssignSubjects((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }
  function addClass() {
    if (!newGrade) return;
    if (assignClasses.some((c) => c.grade === newGrade && c.section === (newSection || "A"))) return;
    setAssignClasses([...assignClasses, { grade: newGrade, section: newSection || "A" }]);
    setNewGrade(""); setNewSection("");
  }
  function removeClass(i: number) {
    setAssignClasses(assignClasses.filter((_, idx) => idx !== i));
  }

  function deletePerson(p: User) {
    if (p.role === "deputy" && currentUser.role !== "headteacher") { alert("Only the headteacher can delete the deputy."); return; }
    if (!confirm(`Delete ${p.fullName} (${p.role})?`)) return;
    const db2 = getDb();
    db2.users = db2.users.filter((u) => u.id !== p.id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted ${p.role} ${p.fullName}`);
    setRefreshKey((k) => k + 1);
  }

  function resetPassword(p: User) {
    const defaultPwd = p.role === "hod" ? "hod123" : p.role === "teacher" ? "teacher123" : "deputy123";
    if (!confirm(`Reset password for ${p.fullName} to "${defaultPwd}"?`)) return;
    const db2 = getDb();
    const idx = db2.users.findIndex((u) => u.id === p.id);
    if (idx >= 0) {
      db2.users[idx].password = defaultPwd;
      db2.users[idx].mustChangePassword = true;
      saveDb(db2);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Reset password for ${p.fullName}`);
      alert(`Password reset to ${defaultPwd}`);
      setRefreshKey((k) => k + 1);
    }
  }

  const isEditingDeputy = modal.mode === "edit" && modal.person?.role === "deputy";
  const canEditNameRole = isHead;

  return (
    <div>
      <PageHeader title="Teachers & Heads of Department" subtitle={`Total staff: ${teachers.length}`}>
        {isAdmin && <Button variant="gold" onClick={openRegister}>+ Register Staff</Button>}
      </PageHeader>

      <Card className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Search by name, ID, username..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <Badge color="emerald">HoD</Badge> Head of Department • <Badge color="blue">Teacher</Badge> Teaching staff
          </div>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState message="No staff found." />
        ) : (
          <Table headers={["", "Name", "Role", "Teacher ID", "Subjects/Classes", "Department", "Actions"]}>
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {t.profilePicture ? (
                    <img src={t.profilePicture} className="w-9 h-9 rounded-full object-cover" alt="" />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white ${t.role === "hod" ? "bg-amber-500" : "bg-blue-500"}`}>{t.fullName.charAt(0)}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">
                  <div>{t.fullName}</div>
                  {t.employmentStatus && t.employmentStatus !== "active" && (
                    <div className="mt-1">
                      {t.employmentStatus === "on_leave" && <Badge color="yellow">On Leave</Badge>}
                      {t.employmentStatus === "transferred_in" && <Badge color="green">Transferred In</Badge>}
                      {t.employmentStatus === "transferred_out" && <Badge color="red">Transferred Out</Badge>}
                      {t.statusNote && <span className="text-[10px] text-gray-500 ml-1">{t.statusNote}</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {t.role === "hod" ? <Badge color="emerald">HoD {t.hodDepartment ? `- ${t.hodDepartment}` : ""}</Badge> : <Badge color="blue">Teacher</Badge>}
                </td>
                <td className="px-4 py-3 text-xs">{t.teacherId || "-"}</td>
                <td className="px-4 py-3 text-xs">
                  <div>{(t.subjects || []).slice(0, 2).join(", ")}{(t.subjects || []).length > 2 ? "..." : ""}</div>
                  <div className="text-gray-500">{(t.classes || []).map((c) => `${c.grade}${c.section}`).join(", ")}</div>
                </td>
                <td className="px-4 py-3 text-xs">{(t.departments || []).join(", ") || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap text-xs">
                    {(isAdmin || isHOD) && <button onClick={() => openAssign(t)} className="text-emerald-600 hover:text-emerald-800 font-medium">Assign</button>}
                    {(isAdmin || isHead) && <><span className="text-gray-300">|</span><button onClick={() => openEdit(t)} className="text-amber-600 hover:text-amber-800 font-medium">Edit</button></>}
                    {isHead && <><span className="text-gray-300">|</span><button onClick={() => deletePerson(t)} className="text-red-600 hover:text-red-800 font-medium">Delete</button></>}
                    {isAdmin && <><span className="text-gray-300">|</span><button onClick={() => resetPassword(t)} className="text-gray-600 hover:text-gray-800 font-medium">Reset Pwd</button></>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={modal.open}
        onClose={() => setModal({ ...modal, open: false })}
        title={modal.mode === "register" ? "Register New Staff Member" : modal.mode === "assign" ? `Assign Subjects & Classes - ${modal.person?.fullName}` : `Edit ${modal.person?.fullName}`}
        size="lg"
      >
        {modal.mode === "assign" ? (
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Subjects (select all that apply)</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                {ALL_SUBJECTS.map((s) => (
                  <label key={s} className={`flex items-center gap-2 text-sm p-2 rounded cursor-pointer ${assignSubjects.includes(s) ? "bg-emerald-50 border border-emerald-300" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={assignSubjects.includes(s)} onChange={() => toggleSubject(s)} />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Classes Taught</h4>
              <div className="flex gap-2 mb-2">
                <select value={newGrade} onChange={(e) => setNewGrade(e.target.value)} className="px-3 py-2 rounded-lg border text-sm flex-1">
                  <option value="">Select grade...</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <input placeholder="Section (A/B)" value={newSection} onChange={(e) => setNewSection(e.target.value.toUpperCase())} maxLength={2} className="px-3 py-2 rounded-lg border text-sm w-28" />
                <Button onClick={addClass}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignClasses.length === 0 ? <span className="text-sm text-gray-500">No classes added yet.</span> : assignClasses.map((c, i) => (
                  <Badge key={i} color="blue" className="cursor-pointer" >
                    {c.grade} - Section {c.section}
                    <button onClick={() => removeClass(i)} className="ml-1 text-red-600 font-bold">×</button>
                  </Badge>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div>
                <h4 className="font-semibold mb-2">Departments</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {DEPARTMENTS.map((d) => {
                    const selected = (form.departments as Department[] | undefined) || [];
                    const isSelected = selected.includes(d);
                    return (
                      <label key={d} className={`flex items-center gap-2 text-sm p-2 rounded cursor-pointer border ${isSelected ? "bg-amber-50 border-amber-300" : ""}`}>
                        <input type="checkbox" checked={isSelected} onChange={(e) => {
                          const curr = (form.departments as Department[]) || [];
                          setForm({ ...form, departments: e.target.checked ? [...curr, d] : curr.filter((x) => x !== d) });
                        }} />
                        <span>{d}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={saveTeacher}>Save Assignments</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

            {isIT && (
              <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border">
                {form.profilePicture ? (
                  <img src={form.profilePicture} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-amber-600" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl font-bold">
                    {(form.fullName || "?").charAt(0)}
                  </div>
                )}
                <div>
                  <div className="font-medium text-sm">Profile Picture</div>
                  <div className="text-xs text-gray-600 mb-2">Upload from device (Headteacher, Deputy, or IT HoD only).</div>
                  <Button variant="secondary" className="!py-1 !px-3 !text-xs" onClick={() => picRef.current?.click()}>Choose Photo</Button>
                  {form.profilePicture && (
                    <button type="button" onClick={() => setForm({ ...form, profilePicture: undefined })} className="ml-2 text-xs text-red-600 hover:underline">Remove</button>
                  )}
                  <input ref={picRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePicUpload} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Full Name *" value={form.fullName || ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={modal.mode === "edit" && !canEditNameRole} />
              <Input label="Username *" value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} disabled={modal.mode === "edit"} />
              <Input label="Teacher ID" value={form.teacherId || ""} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} />
              {modal.mode === "register" || canEditNameRole ? (
                <Select label="Role" value={form.role || ""} onChange={(e) => setForm({ ...form, role: e.target.value as any, hodDepartment: e.target.value === "hod" ? form.hodDepartment : undefined })}>
                  <option value="teacher">Teacher</option>
                  <option value="hod">Head of Department (HoD)</option>
                </Select>
              ) : (
                <Input label="Role" value={modal.person?.role || ""} disabled />
              )}
              {form.role === "hod" && (
                <Select label="HoD Department" value={form.hodDepartment || ""} onChange={(e) => setForm({ ...form, hodDepartment: e.target.value as Department, departments: [e.target.value as Department] })}>
                  <option value="">-- Select --</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              )}
              <Select label="Gender" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value as "Male" | "Female" })}>
                <option value="">-- Select --</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </Select>
              <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Qualifications" value={form.qualifications || ""} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} className="md:col-span-2" />
            </div>

            {(form.role === "teacher" || form.role === "hod" || modal.mode === "edit") && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
                <h4 className="md:col-span-3 font-semibold text-sm text-gray-700">Employment Status</h4>
                <Select label="Status" value={form.employmentStatus || "active"} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value as any })}>
                  <option value="active">Active / In post</option>
                  <option value="on_leave">On Leave</option>
                  <option value="transferred_in">Transferred In</option>
                  <option value="transferred_out">Transferred Out</option>
                </Select>
                <Input label="Effective Date" type="date" value={form.statusDate || ""} onChange={(e) => setForm({ ...form, statusDate: e.target.value })} />
                <Input label="Note / Previous School" value={form.statusNote || form.previousSchool || ""} onChange={(e) => setForm({ ...form, statusNote: e.target.value, previousSchool: form.employmentStatus === "transferred_in" ? e.target.value : form.previousSchool })} placeholder="e.g. Maternity leave / transferred from..." />
              </div>
            )}

            {modal.mode === "register" && (
              <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                Default password: <strong>{form.role === "hod" ? "hod123" : "teacher123"}</strong>. They will change it on first login.
              </div>
            )}
            {isEditingDeputy && (
              <div className="p-3 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                Note: You are editing the Deputy Headteacher's details.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={saveTeacher}>{modal.mode === "register" ? "Register" : "Save Changes"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
