import { useState, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import { PROVINCES, GRADES, JUNIOR_SUBJECTS, SENIOR_SUBJECTS } from "../data/constants";
import type { User } from "../types";

export default function Pupils() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user!;
  const canRegister = currentUser.role === "headteacher" || currentUser.role === "deputy";
  const canEdit = currentUser.role === "headteacher" || currentUser.role === "deputy";
  const canDelete = currentUser.role === "headteacher";
  const isIT = currentUser.role === "headteacher" || currentUser.role === "deputy" || (currentUser.role === "hod" && currentUser.hodDepartment === "IT Department");

  const picRef = useRef<HTMLInputElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);

  const pupils = useMemo(() => db.users.filter((u) => u.role === "pupil"), [db]);
  const [modal, setModal] = useState<{ open: boolean; pupil: User | null; mode: "register" | "view" | "edit" }>({ open: false, pupil: null, mode: "register" });
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [form, setForm] = useState<Partial<User>>({});
  const [error, setError] = useState("");

  const filtered = pupils.filter((p) => {
    const s = search.toLowerCase();
    const m1 = !s || p.fullName.toLowerCase().includes(s) || (p.pupilId || "").toLowerCase().includes(s) || p.username.toLowerCase().includes(s);
    const m2 = !gradeFilter || p.grade === gradeFilter;
    return m1 && m2;
  });

  function handleProfilePicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, profilePicture: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  function openRegister() {
    setForm({ role: "pupil", gender: "Male", password: "1234", classSection: "A" });
    setModal({ open: true, pupil: null, mode: "register" });
    setError("");
  }
  function openView(p: User) { setModal({ open: true, pupil: p, mode: "view" }); }
  function openEdit(p: User) {
    if (!canEdit) { alert("Only the Headteacher and Deputy can edit pupil details."); return; }
    setForm({ ...p }); setModal({ open: true, pupil: p, mode: "edit" }); setError("");
  }

  function savePupil() {
    setError("");
    if (!form.fullName || !form.grade) { setError("Full name and grade are required"); return; }
    const db2 = getDb();
    if (modal.mode === "register") {
      if (!form.username) { setError("Username is required"); return; }
      const exists = db2.users.some((u) => u.username.toLowerCase() === form.username!.toLowerCase());
      if (exists) { setError("Username already exists"); return; }
      const newPupil: User = {
        id: genId("pupil"),
        username: form.username,
        password: "1234",
        fullName: form.fullName,
        role: "pupil",
        email: form.email,
        phone: form.phone,
        profilePicture: form.profilePicture,
        gender: form.gender as "Male" | "Female",
        grade: form.grade as any,
        classSection: form.classSection || "A",
        pupilId: form.pupilId || `PUP-${Date.now().toString().slice(-5)}`,
        province: form.province,
        district: form.district,
        dateOfBirth: form.dateOfBirth,
        guardiansName: form.guardiansName,
        guardiansPhone: form.guardiansPhone,
        address: form.address,
        enrollmentYear: new Date().getFullYear(),
        createdAt: new Date().toISOString(),
        mustChangePassword: true,
      };
      db2.users.push(newPupil);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Registered pupil ${newPupil.fullName}`, `Grade ${newPupil.grade}`);
    } else if (modal.mode === "edit" && modal.pupil) {
      const idx = db2.users.findIndex((u) => u.id === modal.pupil!.id);
      if (idx >= 0) {
        db2.users[idx] = { ...db2.users[idx], ...form };
        logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Edited pupil ${db2.users[idx].fullName}`);
      }
    }
    saveDb(db2);
    setModal({ open: false, pupil: null, mode: "register" });
    setRefreshKey((k) => k + 1);
  }

  function deletePupil(p: User) {
    if (!confirm(`Delete pupil ${p.fullName}? This will remove all their data.`)) return;
    const db2 = getDb();
    db2.users = db2.users.filter((u) => u.id !== p.id);
    db2.results = db2.results.filter((r) => r.pupilId !== p.id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted pupil ${p.fullName}`);
    setRefreshKey((k) => k + 1);
  }

  function resetPassword(p: User) {
    if (!confirm(`Reset password for ${p.fullName} to default (1234)?`)) return;
    const db2 = getDb();
    const idx = db2.users.findIndex((u) => u.id === p.id);
    if (idx >= 0) {
      db2.users[idx].password = "1234";
      db2.users[idx].mustChangePassword = true;
      saveDb(db2);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Reset password for ${p.fullName}`);
      alert("Password reset to 1234");
      setRefreshKey((k) => k + 1);
    }
  }

  const provinces = Object.keys(PROVINCES);
  const districts = form.province ? PROVINCES[form.province]?.districts || [] : [];
  const isJunior = form.grade && ["8A", "8B", "9A", "9B"].includes(form.grade as string);

  return (
    <div>
      <PageHeader title="Pupils Management" subtitle={`Total pupils: ${pupils.length}`}>
        {canRegister && <Button variant="gold" onClick={openRegister}>+ Register New Pupil</Button>}
      </PageHeader>

      <Card className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input placeholder="Search by name, ID, username..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
            <option value="">All Grades</option>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
          <div className="text-sm text-gray-500 flex items-center">
            Default password for new pupils: <Badge color="emerald" className="ml-2">1234</Badge>
          </div>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState message="No pupils found." />
        ) : (
          <Table headers={["", "Name", "Pupil ID", "Grade", "Section", "Gender", "Province", "Actions"]}>
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {p.profilePicture ? (
                    <img src={p.profilePicture} className="w-9 h-9 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">{p.fullName.charAt(0)}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{p.fullName}</td>
                <td className="px-4 py-3 text-xs">{p.pupilId || "-"}</td>
                <td className="px-4 py-3"><Badge color="emerald">{p.grade}</Badge></td>
                <td className="px-4 py-3">{p.classSection || "-"}</td>
                <td className="px-4 py-3">{p.gender || "-"}</td>
                <td className="px-4 py-3 text-xs">{p.province || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => openView(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View</button>
                    {canEdit && <><span className="text-gray-300">|</span><button onClick={() => openEdit(p)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button></>}
                    {canDelete && <><span className="text-gray-300">|</span><button onClick={() => deletePupil(p)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button></>}
                    {canRegister && <><span className="text-gray-300">|</span><button onClick={() => resetPassword(p)} className="text-gray-600 hover:text-gray-800 text-xs font-medium">Reset Pwd</button></>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal.open} onClose={() => setModal({ ...modal, open: false })} title={modal.mode === "register" ? "Register New Pupil" : modal.mode === "edit" ? `Edit ${modal.pupil?.fullName}` : `Pupil Details - ${modal.pupil?.fullName}`} size="lg">
        {modal.mode === "view" && modal.pupil ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-4 mb-4">
              {modal.pupil.profilePicture ? (
                <img src={modal.pupil.profilePicture} className="w-20 h-20 rounded-full object-cover border-2 border-emerald-600" alt="" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-bold">{modal.pupil.fullName.charAt(0)}</div>
              )}
              <div>
                <div className="font-bold text-lg">{modal.pupil.fullName}</div>
                <div><Badge color="emerald">{modal.pupil.grade}{modal.pupil.classSection ? ` - ${modal.pupil.classSection}` : ""}</Badge></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><strong>Pupil ID:</strong> {modal.pupil.pupilId || "-"}</div>
              <div><strong>Username:</strong> {modal.pupil.username}</div>
              <div><strong>Gender:</strong> {modal.pupil.gender || "-"}</div>
              <div><strong>Email:</strong> {modal.pupil.email || "-"}</div>
              <div><strong>Phone:</strong> {modal.pupil.phone || "-"}</div>
              <div><strong>DOB:</strong> {modal.pupil.dateOfBirth || "-"}</div>
              <div><strong>Province:</strong> {modal.pupil.province || "-"}</div>
              <div><strong>District:</strong> {modal.pupil.district || "-"}</div>
              <div><strong>Guardian:</strong> {modal.pupil.guardiansName || "-"}</div>
              <div><strong>Guardian Phone:</strong> {modal.pupil.guardiansPhone || "-"}</div>
              <div className="col-span-2"><strong>Address:</strong> {modal.pupil.address || "-"}</div>
              <div><strong>Enrolled:</strong> {modal.pupil.enrollmentYear || "-"}</div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <h4 className="font-semibold mb-2">Subjects ({isJunior ? "Junior Secondary" : "Senior Secondary"})</h4>
              <div className="flex flex-wrap gap-1.5">
                {(modal.pupil.grade && ["8A", "8B", "9A", "9B"].includes(modal.pupil.grade) ? JUNIOR_SUBJECTS : SENIOR_SUBJECTS).map((s) => (
                  <Badge key={s} color="gray">{s}</Badge>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

            {isIT && (
              <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border">
                {form.profilePicture ? (
                  <img src={form.profilePicture} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-emerald-600" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-bold">
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
              <Input label="Full Name *" value={form.fullName || ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              <Input label="Username *" value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} disabled={modal.mode === "edit" && !canEdit} />
              <Input label="Pupil ID" value={form.pupilId || ""} onChange={(e) => setForm({ ...form, pupilId: e.target.value })} />
              <Select label="Grade *" value={form.grade || ""} onChange={(e) => setForm({ ...form, grade: e.target.value as any })}>
                <option value="">-- Select --</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Input label="Class Section" value={form.classSection || ""} onChange={(e) => setForm({ ...form, classSection: e.target.value.toUpperCase() })} maxLength={2} placeholder="e.g. A, B" />
              <Select label="Gender" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value as "Male" | "Female" })}>
                <option value="">-- Select --</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </Select>
              <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Date of Birth" type="date" value={form.dateOfBirth || ""} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              <Select label="Province" value={form.province || ""} onChange={(e) => setForm({ ...form, province: e.target.value, district: "" })}>
                <option value="">-- Select --</option>
                {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Select label="District" value={form.district || ""} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!form.province}>
                <option value="">-- Select --</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Input label="Guardian Name" value={form.guardiansName || ""} onChange={(e) => setForm({ ...form, guardiansName: e.target.value })} />
              <Input label="Guardian Phone" value={form.guardiansPhone || ""} onChange={(e) => setForm({ ...form, guardiansPhone: e.target.value })} />
              <Input label="Home Address" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="md:col-span-2" />
            </div>
            {modal.mode === "register" && (
              <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                Default password is <strong>1234</strong>. The pupil will be prompted to change it on first login.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={savePupil}>{modal.mode === "register" ? "Register Pupil" : "Save Changes"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
