import { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Textarea, Badge, PageHeader, EmptyState } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import type { Notice } from "../types";

export default function Notices() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user;
  const canPost = currentUser.role === "headteacher" || currentUser.role === "deputy";
  const canEditDelete = currentUser.role === "headteacher";

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const [modal, setModal] = useState<{ open: boolean; notice: Notice | null; mode: "post" | "view" }>({ open: false, notice: null, mode: "view" });
  const [form, setForm] = useState<Partial<Notice>>({ category: "general" });
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const notices = useMemo(() => {
    let list = [...db.notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter) list = list.filter((n) => n.category === filter);
    return list;
  }, [db, filter]);

  function openPost() {
    setForm({ title: "", content: "", category: "general", eventDate: "" });
    setModal({ open: true, notice: null, mode: "post" });
    setError("");
  }
  function openView(n: Notice) {
    setModal({ open: true, notice: n, mode: "view" });
  }

  function saveNotice() {
    setError("");
    if (!form.title || !form.content) { setError("Title and content required."); return; }
    const db2 = getDb();
    const n: Notice = {
      id: genId("notice"),
      title: form.title!,
      content: form.content!,
      category: (form.category as any) || "general",
      eventDate: form.eventDate || undefined,
      postedBy: currentUser.id,
      postedByName: currentUser.fullName,
      createdAt: new Date().toISOString(),
    };
    db2.notices.push(n);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Posted notice: ${n.title}`, n.category);
    setModal({ open: false, notice: null, mode: "view" });
    setRefreshKey((k) => k + 1);
  }

  function deleteNotice(n: Notice) {
    if (!confirm(`Delete notice "${n.title}"?`)) return;
    const db2 = getDb();
    db2.notices = db2.notices.filter((x) => x.id !== n.id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted notice: ${n.title}`);
    setRefreshKey((k) => k + 1);
  }

  const categoryColors: Record<string, "blue" | "emerald" | "gray"> = {
    event: "blue",
    academic: "emerald",
    general: "gray",
  };

  return (
    <div>
      <PageHeader title="Notice Board" subtitle="School announcements, events, and academic notices" >
        {canPost && <Button variant="gold" onClick={openPost}>+ Post Notice</Button>}
      </PageHeader>

      <Card className="mb-4">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <button onClick={() => setFilter("")} className={`px-3 py-1 rounded-full text-xs font-medium ${!filter ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>All</button>
          <button onClick={() => setFilter("event")} className={`px-3 py-1 rounded-full text-xs font-medium ${filter === "event" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>📅 Events</button>
          <button onClick={() => setFilter("academic")} className={`px-3 py-1 rounded-full text-xs font-medium ${filter === "academic" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>📚 Academic</button>
          <button onClick={() => setFilter("general")} className={`px-3 py-1 rounded-full text-xs font-medium ${filter === "general" ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>📢 General</button>
        </div>
      </Card>

      {notices.length === 0 ? (
        <Card><EmptyState message="No notices yet." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notices.map((n) => (
            <Card key={n.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-lg">{n.title}</h3>
                    <Badge color={categoryColors[n.category]} pulse={n.category === "event"}>
                      {n.category === "event" ? "📅 Event" : n.category === "academic" ? "📚 Academic" : "📢 General"}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap line-clamp-4">{n.content}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs text-gray-500">
                <div>
                  <div><strong>Posted by:</strong> {n.postedByName}</div>
                  <div><strong>Date:</strong> {new Date(n.createdAt).toLocaleDateString()}</div>
                  {n.eventDate && <div><strong>Event Date:</strong> {new Date(n.eventDate).toLocaleDateString()}</div>}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => openView(n)}>Read More</Button>
                  {canEditDelete && <Button variant="danger" className="!py-1 !px-2 !text-xs" onClick={() => deleteNotice(n)}>Delete</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ ...modal, open: false })} title={modal.notice ? modal.notice.title : "Post New Notice"} size="md">
        {modal.mode === "view" && modal.notice ? (
          <div className="space-y-3">
            <Badge color={categoryColors[modal.notice.category]}>{modal.notice.category}</Badge>
            <p className="text-sm text-gray-800 whitespace-pre-wrap mt-2">{modal.notice.content}</p>
            <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t">
              <div><strong>Posted by:</strong> {modal.notice.postedByName}</div>
              <div><strong>Posted on:</strong> {new Date(modal.notice.createdAt).toLocaleString()}</div>
              {modal.notice.eventDate && <div className="col-span-2"><strong>Event Date:</strong> {new Date(modal.notice.eventDate).toLocaleDateString()}</div>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
            <Input label="Notice Title" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as any })}>
              <option value="general">📢 General</option>
              <option value="event">📅 Event</option>
              <option value="academic">📚 Academic</option>
            </Select>
            {form.category === "event" && (
              <Input label="Event Date" type="date" value={form.eventDate || ""} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            )}
            <Textarea label="Content" rows={6} value={form.content || ""} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={saveNotice}>Post Notice</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
