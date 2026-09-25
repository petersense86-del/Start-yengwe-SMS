import { useState, useMemo } from "react";
import { CalendarDays, GraduationCap, Megaphone, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Textarea, Badge, PageHeader, EmptyState, Alert } from "../components/ui";
import { toast, confirmDialog } from "../components/feedback";
import { getDb, saveDb, genId, logActivity, useDbVersion } from "../utils/db";
import type { Notice } from "../types";

const CATEGORY = {
  event: { label: "Event", color: "blue" as const, icon: CalendarDays },
  academic: { label: "Academic", color: "emerald" as const, icon: GraduationCap },
  general: { label: "General", color: "gray" as const, icon: Megaphone },
};

export default function Notices() {
  const { user } = useAuth();
  const version = useDbVersion();
  const db = useMemo(() => getDb(), [version]);
  const [modal, setModal] = useState<{ open: boolean; notice: Notice | null; mode: "post" | "view" }>({ open: false, notice: null, mode: "view" });
  const [form, setForm] = useState<Partial<Notice>>({ category: "general" });
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const notices = useMemo(() => {
    let list = [...db.notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter) list = list.filter((n) => n.category === filter);
    return list;
  }, [db, filter]);

  if (!user) return null;
  const currentUser = user;
  const canPost = currentUser.role === "headteacher" || currentUser.role === "deputy";
  const canDelete = currentUser.role === "headteacher";

  function openPost() {
    setForm({ title: "", content: "", category: "general", eventDate: "" });
    setModal({ open: true, notice: null, mode: "post" });
    setError("");
  }

  function saveNotice() {
    setError("");
    if (!form.title?.trim() || !form.content?.trim()) { setError("A title and content are required."); return; }
    const db2 = getDb();
    const n: Notice = {
      id: genId("notice"), title: form.title.trim(), content: form.content.trim(), category: form.category || "general",
      eventDate: form.category === "event" ? form.eventDate || undefined : undefined,
      postedBy: currentUser.id, postedByName: currentUser.fullName, createdAt: new Date().toISOString(),
    };
    db2.notices.push(n);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Posted notice: ${n.title}`, n.category);
    setModal({ open: false, notice: null, mode: "view" });
    toast.success("Notice posted to everyone.");
  }

  async function deleteNotice(n: Notice) {
    if (!await confirmDialog({ title: "Delete notice?", message: `"${n.title}" will be removed from the notice board.`, confirmLabel: "Delete", danger: true })) return;
    const db2 = getDb();
    db2.notices = db2.notices.filter((x) => x.id !== n.id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted notice: ${n.title}`);
    setModal({ open: false, notice: null, mode: "view" });
    toast.success("Notice deleted.");
  }

  const filters: { id: string; label: string }[] = [{ id: "", label: "All" }, { id: "event", label: "Events" }, { id: "academic", label: "Academic" }, { id: "general", label: "General" }];

  return (
    <div>
      <PageHeader title="Notice board" subtitle="School announcements, events and academic notices">
        {canPost && <Button variant="gold" onClick={openPost}><Plus className="w-4 h-4" />Post notice</Button>}
      </PageHeader>

      <div role="tablist" aria-label="Filter notices" className="flex gap-1.5 flex-wrap mb-4">
        {filters.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f.id ? "bg-emerald-700 text-white shadow-sm" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {notices.length === 0 ? (
        <Card><EmptyState icon={<Megaphone className="w-6 h-6" />} message={filter ? "No notices in this category." : "No notices have been posted yet."} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notices.map((n) => {
            const cat = CATEGORY[n.category] || CATEGORY.general;
            const Icon = cat.icon;
            return (
              <Card key={n.id} className="flex flex-col transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.category === "event" ? "bg-blue-50 text-blue-700" : n.category === "academic" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 leading-snug">{n.title}</h3>
                      <Badge color={cat.color} pulse={n.category === "event"}>{cat.label}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap line-clamp-4">{n.content}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 gap-2">
                  <div className="min-w-0">
                    <div className="truncate">{n.postedByName} · {new Date(n.createdAt).toLocaleDateString()}</div>
                    {n.eventDate && <div className="text-blue-700 font-medium">Event: {new Date(n.eventDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button variant="ghost" className="!py-1 !px-2.5 !text-xs" onClick={() => setModal({ open: true, notice: n, mode: "view" })}>Read more</Button>
                    {canDelete && <Button variant="danger" className="!py-1 !px-2.5 !text-xs" onClick={() => deleteNotice(n)}>Delete</Button>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ ...modal, open: false })} title={modal.notice ? modal.notice.title : "Post new notice"} size="md">
        {modal.mode === "view" && modal.notice ? (
          <div className="space-y-4">
            <Badge color={(CATEGORY[modal.notice.category] || CATEGORY.general).color}>{(CATEGORY[modal.notice.category] || CATEGORY.general).label}</Badge>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{modal.notice.content}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs pt-3 border-t border-gray-100">
              <div><dt className="text-gray-500">Posted by</dt><dd className="font-medium text-gray-900">{modal.notice.postedByName}</dd></div>
              <div><dt className="text-gray-500">Posted on</dt><dd className="font-medium text-gray-900">{new Date(modal.notice.createdAt).toLocaleString()}</dd></div>
              {modal.notice.eventDate && <div className="col-span-2"><dt className="text-gray-500">Event date</dt><dd className="font-medium text-gray-900">{new Date(modal.notice.eventDate).toLocaleDateString(undefined, { dateStyle: "full" })}</dd></div>}
            </dl>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <Input label="Title" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
            <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Notice["category"] })}>
              <option value="general">General</option>
              <option value="event">Event</option>
              <option value="academic">Academic</option>
            </Select>
            {form.category === "event" && (
              <Input label="Event date" type="date" value={form.eventDate || ""} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            )}
            <Textarea label="Content" rows={6} value={form.content || ""} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={saveNotice}>Post notice</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
