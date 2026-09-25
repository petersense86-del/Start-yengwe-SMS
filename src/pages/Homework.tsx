import { useState, useMemo } from "react";
import { BookOpen, CalendarClock, Plus, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Textarea, Badge, EmptyState, PageHeader, Alert } from "../components/ui";
import { toast, confirmDialog } from "../components/feedback";
import { getDb, saveDb, genId, logActivity, useDbVersion } from "../utils/db";
import { GRADES, JUNIOR_SUBJECTS, SENIOR_SUBJECTS } from "../data/constants";
import type { Homework } from "../types";

const ALL_SUBJECTS = Array.from(new Set([...JUNIOR_SUBJECTS, ...SENIOR_SUBJECTS]));

function dueLabel(due: string) {
  const days = Math.round((new Date(due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days < 0) return { text: "Overdue", color: "red" as const };
  if (days === 0) return { text: "Due today", color: "yellow" as const };
  if (days === 1) return { text: "Due tomorrow", color: "yellow" as const };
  return { text: `Due in ${days} days`, color: "emerald" as const };
}

export default function HomeworkPage() {
  const { user } = useAuth();
  const version = useDbVersion();
  const db = useMemo(() => getDb(), [version]);
  const [modal, setModal] = useState<{ open: boolean; hw: Homework | null }>({ open: false, hw: null });
  const [form, setForm] = useState<Partial<Homework>>({});
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const currentUser = user;
  const isPupil = currentUser?.role === "pupil";
  const canPost = currentUser?.role !== "pupil";
  const isRestrictedTeacher = currentUser?.role === "teacher";
  const myClasses = currentUser?.classes || [];
  const mySubjects = currentUser?.subjects || [];

  const visibleHomework = useMemo(() => {
    if (!currentUser) return [];
    let list = [...db.homework];
    if (isPupil) list = list.filter((h) => h.grade === currentUser.grade && h.section === (currentUser.classSection || "A"));
    else if (currentUser.role === "teacher" || currentUser.role === "hod") list = list.filter((h) => h.teacherId === currentUser.id);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((h) => h.title.toLowerCase().includes(s) || h.subject.toLowerCase().includes(s));
    }
    // Open work first (soonest due), then past work (most recent first).
    const today = new Date().toISOString().slice(0, 10);
    return list.sort((a, b) => {
      const aOpen = a.dueDate >= today, bOpen = b.dueDate >= today;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return aOpen ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate);
    });
  }, [db, isPupil, currentUser, search]);

  if (!currentUser) return null;
  const me = currentUser;

  function openPost() {
    setForm({ grade: myClasses[0]?.grade, section: myClasses[0]?.section || "A", subject: mySubjects[0] || "" });
    setModal({ open: true, hw: null });
    setError("");
  }

  function saveHomework() {
    setError("");
    if (!form.title?.trim() || !form.description?.trim() || !form.dueDate || !form.grade || !form.subject) {
      setError("Please fill in every field."); return;
    }
    if (isRestrictedTeacher) {
      const allowedClass = myClasses.some((c) => c.grade === form.grade && c.section === (form.section || "A"));
      if (!allowedClass || !mySubjects.includes(form.subject)) {
        setError("You can only post homework to classes and subjects you are assigned to.");
        return;
      }
    }
    const db2 = getDb();
    const hw: Homework = {
      id: genId("hw"), teacherId: me.id, teacherName: me.fullName, subject: form.subject, grade: form.grade,
      section: form.section || "A", title: form.title.trim(), description: form.description.trim(), dueDate: form.dueDate,
      createdAt: new Date().toISOString(),
    };
    db2.homework.push(hw);
    saveDb(db2);
    logActivity(me.id, me.fullName, me.role, `Posted homework: ${hw.title}`, `${hw.grade}${hw.section} - ${hw.subject}`);
    setModal({ open: false, hw: null });
    toast.success("Homework posted.");
  }

  async function deleteHomework(hw: Homework) {
    if (!await confirmDialog({ title: "Delete homework?", message: `"${hw.title}" will be removed for all pupils.`, confirmLabel: "Delete", danger: true })) return;
    const db2 = getDb();
    db2.homework = db2.homework.filter((h) => h.id !== hw.id);
    saveDb(db2);
    logActivity(me.id, me.fullName, me.role, `Deleted homework ${hw.title}`);
    setModal({ open: false, hw: null });
    toast.success("Homework deleted.");
  }

  const subjectOptions = isRestrictedTeacher ? mySubjects : ALL_SUBJECTS;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title={isPupil ? "My homework" : "Homework"} subtitle={isPupil ? "Assignments from your teachers" : "Post and manage homework for your classes"}>
        {canPost && <Button variant="gold" onClick={openPost}><Plus className="w-4 h-4" />Post homework</Button>}
      </PageHeader>

      <Card className="mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input aria-label="Search homework" placeholder="Search by title or subject…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </Card>

      {visibleHomework.length === 0 ? (
        <Card><EmptyState icon={<BookOpen className="w-6 h-6" />} message={isPupil ? "No homework has been posted for your class yet." : "You haven't posted any homework yet."}
          action={canPost ? <Button variant="gold" onClick={openPost}><Plus className="w-4 h-4" />Post homework</Button> : undefined} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleHomework.map((hw) => {
            const due = dueLabel(hw.dueDate);
            return (
              <Card key={hw.id} className={`flex flex-col transition-shadow hover:shadow-md ${hw.dueDate < today ? "opacity-75" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 leading-snug">{hw.title}</h3>
                  <Badge color={due.color}>{due.text}</Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Badge color="blue">{hw.subject}</Badge>
                  <Badge color="gray">{hw.grade} · {hw.section}</Badge>
                </div>
                <p className="text-sm text-gray-600 mt-3 line-clamp-3 flex-1">{hw.description}</p>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{new Date(hw.dueDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
                    <div className="truncate">{hw.teacherName}</div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button variant="ghost" className="!py-1 !px-2.5 !text-xs" onClick={() => setModal({ open: true, hw })}>Open</Button>
                    {(hw.teacherId === me.id || me.role === "headteacher") && (
                      <Button variant="danger" className="!py-1 !px-2.5 !text-xs" onClick={() => deleteHomework(hw)}>Delete</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ ...modal, open: false })} title={modal.hw ? modal.hw.title : "Post new homework"} size="md">
        {modal.hw ? (
          <div className="space-y-4 text-sm">
            <div className="flex gap-1.5 flex-wrap">
              <Badge color="blue">{modal.hw.subject}</Badge>
              <Badge color="gray">{modal.hw.grade} · {modal.hw.section}</Badge>
              <Badge color={dueLabel(modal.hw.dueDate).color}>{dueLabel(modal.hw.dueDate).text}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-gray-800 leading-relaxed">{modal.hw.description}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs pt-3 border-t border-gray-100">
              <div><dt className="text-gray-500">Due</dt><dd className="font-medium text-gray-900">{new Date(modal.hw.dueDate).toLocaleDateString(undefined, { dateStyle: "long" })}</dd></div>
              <div><dt className="text-gray-500">Posted</dt><dd className="font-medium text-gray-900">{new Date(modal.hw.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}</dd></div>
              <div className="col-span-2"><dt className="text-gray-500">Teacher</dt><dd className="font-medium text-gray-900">{modal.hw.teacherName}</dd></div>
            </dl>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <Input label="Title" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Algebra exercise 4B" autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Grade" value={form.grade || ""} onChange={(e) => setForm({ ...form, grade: e.target.value as Homework["grade"] })}>
                <option value="">Select…</option>
                {GRADES.map((g) => {
                  const assigned = !isRestrictedTeacher || myClasses.some((c) => c.grade === g);
                  return <option key={g} value={g} disabled={!assigned}>{g}{!assigned ? " (not assigned)" : ""}</option>;
                })}
              </Select>
              <Select label="Section" value={form.section || "A"} onChange={(e) => setForm({ ...form, section: e.target.value })}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </Select>
            </div>
            <Select label="Subject" value={form.subject || ""} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">{subjectOptions.length ? "Select…" : "No subjects assigned yet"}</option>
              {subjectOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Textarea label="Instructions" rows={5} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What should pupils do?" />
            <Input label="Due date" type="date" min={today} value={form.dueDate || ""} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={saveHomework}>Post homework</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
