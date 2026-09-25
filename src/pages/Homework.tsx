import { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Textarea, Badge, EmptyState, PageHeader } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import { GRADES } from "../data/constants";
import type { Homework } from "../types";

export default function HomeworkPage() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user;
  const isTeacher = currentUser.role === "teacher" || currentUser.role === "hod";
  const canPost = isTeacher;
  const isPupil = currentUser.role === "pupil";

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const [modal, setModal] = useState<{ open: boolean; hw: Homework | null }>({ open: false, hw: null });
  const [form, setForm] = useState<Partial<Homework>>({});
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const myClasses = currentUser.classes || [];
  const mySubjects = currentUser.subjects || [];

  const visibleHomework = useMemo(() => {
    let list = [...db.homework];
    if (isPupil) {
      list = list.filter((h) => h.grade === currentUser.grade && h.section === (currentUser.classSection || "A"));
    } else if (isTeacher && currentUser.role !== "headteacher" && currentUser.role !== "deputy") {
      list = list.filter((h) => h.teacherId === currentUser.id);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((h) => h.title.toLowerCase().includes(s) || h.subject.toLowerCase().includes(s));
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db, isPupil, isTeacher, currentUser, search]);

  function openPost() {
    setForm({ grade: myClasses[0]?.grade || "", section: myClasses[0]?.section || "A", subject: mySubjects[0] || "" });
    setModal({ open: true, hw: null });
    setError("");
  }

  function saveHomework() {
    setError("");
    if (!form.title || !form.description || !form.dueDate || !form.grade || !form.subject) {
      setError("Fill in all fields."); return;
    }
    // Check teacher is assigned to this class and subject
    if (currentUser.role !== "headteacher" && currentUser.role !== "deputy" && currentUser.role !== "hod") {
      const allowedClass = myClasses.some((c) => c.grade === form.grade && c.section === (form.section || "A"));
      const allowedSubject = mySubjects.includes(form.subject || "");
      if (!allowedClass || !allowedSubject) {
        setError("You can only post homework to classes and subjects you are assigned to.");
        return;
      }
    }
    const db2 = getDb();
    const hw: Homework = {
      id: genId("hw"),
      teacherId: currentUser.id,
      teacherName: currentUser.fullName,
      subject: form.subject!,
      grade: form.grade as any,
      section: form.section || "A",
      title: form.title!,
      description: form.description!,
      dueDate: form.dueDate!,
      createdAt: new Date().toISOString(),
    };
    db2.homework.push(hw);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Posted homework: ${hw.title}`, `${hw.grade}${hw.section} - ${hw.subject}`);
    setModal({ open: false, hw: null });
    setRefreshKey((k) => k + 1);
  }

  function deleteHomework(hw: Homework) {
    if (!confirm(`Delete homework "${hw.title}"?`)) return;
    const db2 = getDb();
    db2.homework = db2.homework.filter((h) => h.id !== hw.id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted homework ${hw.title}`);
    setRefreshKey((k) => k + 1);
  }

  function viewHomework(hw: Homework) {
    setModal({ open: true, hw });
  }

  return (
    <div>
      <PageHeader title={isPupil ? "My Homework" : "Homework"} subtitle={isPupil ? "Homework posted by your teachers" : "Post and manage homework assignments"}>
        {canPost && <Button variant="gold" onClick={openPost}>+ Post Homework</Button>}
      </PageHeader>

      <Card className="mb-4">
        <Input placeholder="Search homework..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>

      {visibleHomework.length === 0 ? (
        <Card><EmptyState message={isPupil ? "No homework posted for your class yet." : "No homework assignments yet."} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleHomework.map((hw) => {
            const overdue = new Date(hw.dueDate) < new Date();
            return (
              <Card key={hw.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{hw.title}</h3>
                      {overdue ? <Badge color="red">Overdue</Badge> : <Badge color="emerald">Active</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge color="blue">{hw.subject}</Badge>
                      <Badge color="gray">{hw.grade}{hw.section}</Badge>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-3 line-clamp-3">{hw.description}</p>
                <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs text-gray-500">
                  <div>
                    <div><strong>Due:</strong> {new Date(hw.dueDate).toLocaleDateString()}</div>
                    <div><strong>Posted by:</strong> {hw.teacherName}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => viewHomework(hw)}>View</Button>
                    {(hw.teacherId === currentUser.id || currentUser.role === "headteacher") && (
                      <Button variant="danger" className="!py-1 !px-2 !text-xs" onClick={() => deleteHomework(hw)}>Delete</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ ...modal, open: false })} title={modal.hw ? modal.hw.title : "Post New Homework"} size="md">
        {modal.hw ? (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Badge color="blue">{modal.hw.subject}</Badge>
              <Badge color="gray">{modal.hw.grade}{modal.hw.section}</Badge>
            </div>
            <div>
              <div className="text-xs text-gray-500">Description</div>
              <p className="whitespace-pre-wrap mt-1">{modal.hw.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
              <div><strong>Due Date:</strong> {new Date(modal.hw.dueDate).toLocaleDateString()}</div>
              <div><strong>Posted:</strong> {new Date(modal.hw.createdAt).toLocaleDateString()}</div>
              <div className="col-span-2"><strong>Teacher:</strong> {modal.hw.teacherName}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
            <Input label="Title / Assignment" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Grade" value={form.grade || ""} onChange={(e) => setForm({ ...form, grade: e.target.value as any })}>
                <option value="">-- Select --</option>
                {GRADES.map((g) => {
                  const assigned = currentUser.role === "headteacher" || currentUser.role === "deputy" || currentUser.role === "hod" || myClasses.some((c) => c.grade === g);
                  return <option key={g} value={g} disabled={!assigned}>{g}{!assigned && " (not assigned)"}</option>;
                })}
              </Select>
              <Select label="Section" value={form.section || ""} onChange={(e) => setForm({ ...form, section: e.target.value })}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </Select>
            </div>
            <Select label="Subject" value={form.subject || ""} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">-- Select --</option>
              {mySubjects.map((s) => <option key={s} value={s}>{s}</option>)}
              {(currentUser.role === "headteacher" || currentUser.role === "deputy" || currentUser.role === "hod") && (
                <option value="" disabled>-- Admin: all subjects available --</option>
              )}
            </Select>
            <Textarea label="Description / Instructions" rows={5} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input label="Due Date" type="date" value={form.dueDate || ""} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={saveHomework}>Post Homework</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
