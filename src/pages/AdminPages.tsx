import { useState, useMemo, useRef } from "react";
import { Bell, ClipboardList, Download, Mail, Plus, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader, Textarea, Alert } from "../components/ui";
import { toast, confirmDialog } from "../components/feedback";
import { getDb, saveDb, genId, logActivity, useDbVersion } from "../utils/db";
import { readImage, IMAGE_SIZES } from "../utils/image";
import type { DownloadLog, SystemUpdate, ActivityLog, SchoolSettings } from "../types";

const ROLE_BADGE: Record<string, "emerald" | "yellow" | "blue" | "gray"> = { headteacher: "emerald", deputy: "emerald", hod: "yellow", teacher: "blue", pupil: "gray" };

// ================= DOWNLOAD LOGS (Headteacher only) =================
export function DownloadLogs() {
  const version = useDbVersion();
  const logs = useMemo(() => [...getDb().downloadLogs].sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt)), [version]);

  return (
    <div>
      <PageHeader title="Download logs" subtitle="Every report-card PDF download, newest first" />
      <Card>
        {logs.length === 0 ? (
          <EmptyState icon={<Download className="w-6 h-6" />} message="No downloads recorded yet." />
        ) : (
          <Table headers={["Date & time", "Downloaded by", "Role", "Pupil record"]}>
            {logs.map((l: DownloadLog) => (
              <tr key={l.id} className="hover:bg-gray-50/80">
                <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{new Date(l.downloadedAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{l.downloadedByName}</td>
                <td className="px-4 py-2.5"><Badge color={ROLE_BADGE[l.role] || "gray"} className="capitalize">{l.role}</Badge></td>
                <td className="px-4 py-2.5 text-sm">{l.pupilName}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ================= ACTIVITY LOGS (Headteacher only) =================
export function ActivityLogs() {
  const version = useDbVersion();
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");

  const logs = useMemo(() => {
    let list: ActivityLog[] = [...getDb().activityLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (roleFilter) list = list.filter((l) => l.role === roleFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((l) => (l.userName || "").toLowerCase().includes(s) || l.action.toLowerCase().includes(s) || (l.details || "").toLowerCase().includes(s));
    }
    return list;
  }, [version, roleFilter, search]);

  return (
    <div>
      <PageHeader title="Activity logs" subtitle="The latest 500 actions across the system. Only the headteacher can see this." />
      <Card className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input aria-label="Search logs" placeholder="Search by person, action or details…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            <option value="headteacher">Headteacher</option>
            <option value="deputy">Deputy</option>
            <option value="hod">HoD</option>
            <option value="teacher">Teacher</option>
            <option value="pupil">Pupil</option>
          </Select>
        </div>
      </Card>
      <Card>
        {logs.length === 0 ? (
          <EmptyState icon={<ClipboardList className="w-6 h-6" />} message="No activity matches." />
        ) : (
          <Table headers={["Time", "User", "Role", "Action", "Details"]}>
            {logs.slice(0, 200).map((l) => (
              <tr key={l.id} className="hover:bg-gray-50/80">
                <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{l.userName}</td>
                <td className="px-4 py-2.5"><Badge color={ROLE_BADGE[l.role] || "gray"} className="capitalize">{l.role}</Badge></td>
                <td className="px-4 py-2.5 text-sm">{l.action}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{l.details || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ================= SYSTEM UPDATES =================
export function SystemUpdates() {
  const { user } = useAuth();
  const version = useDbVersion();
  const db = useMemo(() => getDb(), [version]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [error, setError] = useState("");
  const updates = useMemo(() => [...db.systemUpdates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db]);

  if (!user) return null;
  const currentUser = user;
  const canPost = ["headteacher", "deputy"].includes(currentUser.role) || (currentUser.role === "hod" && currentUser.hodDepartment === "IT Department");
  const canDelete = currentUser.role === "headteacher";

  function postUpdate() {
    setError("");
    if (!form.title.trim() || !form.description.trim()) { setError("Both fields are required."); return; }
    const db2 = getDb();
    db2.systemUpdates.push({
      id: genId("upd"), title: form.title.trim(), description: form.description.trim(),
      postedBy: currentUser.id, postedByName: currentUser.fullName, role: currentUser.role, createdAt: new Date().toISOString(),
    });
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Posted system update: ${form.title}`);
    setForm({ title: "", description: "" });
    setModal(false);
    toast.success("Update posted.");
  }

  async function deleteUpdate(id: string) {
    if (!await confirmDialog({ title: "Delete this update?", message: "It will be removed for everyone.", confirmLabel: "Delete", danger: true })) return;
    const db2 = getDb();
    db2.systemUpdates = db2.systemUpdates.filter((u) => u.id !== id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted system update`);
    toast.success("Update deleted.");
  }

  return (
    <div>
      <PageHeader title="System updates" subtitle="Announcements about changes to YPMS">
        {canPost && <Button variant="gold" onClick={() => setModal(true)}><Plus className="w-4 h-4" />Post update</Button>}
      </PageHeader>

      <Alert tone="info" className="mb-4 flex items-center gap-2">
        <Mail className="w-4 h-4 flex-shrink-0" />
        <span>For support, email <a href={`mailto:${db.settings.schoolEmail}`} className="font-medium underline underline-offset-2">{db.settings.schoolEmail}</a>.</span>
      </Alert>

      {updates.length === 0 ? (
        <Card><EmptyState icon={<Bell className="w-6 h-6" />} message="No system updates yet." /></Card>
      ) : (
        <ol className="relative space-y-3">
          {updates.map((u: SystemUpdate) => (
            <li key={u.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{u.title}</h3>
                      <Badge color="blue" className="capitalize">{u.role}</Badge>
                    </div>
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">{u.description}</p>
                    <div className="text-xs text-gray-500 mt-3">{u.postedByName} · {new Date(u.createdAt).toLocaleString()}</div>
                  </div>
                  {canDelete && <button onClick={() => deleteUpdate(u.id)} className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 rounded-md hover:bg-red-50">Delete</button>}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Post system update">
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
          <Textarea label="Description" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
            <Button variant="gold" onClick={postUpdate}>Post update</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ================= SETTINGS (Head/Deputy) =================
export function SettingsPage() {
  const { user } = useAuth();
  const version = useDbVersion();
  const db = useMemo(() => getDb(), [version]);
  const [form, setForm] = useState<SchoolSettings>(() => ({ ...getDb().settings }));
  const logoRef = useRef<HTMLInputElement>(null);
  const watermarkRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);

  if (!user) return null;
  const currentUser = user;
  const isHead = currentUser.role === "headteacher";
  const isDeputy = currentUser.role === "deputy";

  function updateSettings(patch: Partial<SchoolSettings>, action: string, message: string) {
    const db2 = getDb();
    db2.settings = { ...db2.settings, ...patch };
    saveDb(db2);
    setForm((f) => ({ ...f, ...patch }));
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, action);
    toast.success(message);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>, size: number, apply: (img: string) => void) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      apply(await readImage(file, size));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  function saveSettings() {
    const db2 = getDb();
    db2.settings = { ...db2.settings, ...form };
    const headUser = db2.users.find((u) => u.role === "headteacher");
    const deputyUser = db2.users.find((u) => u.role === "deputy");
    if (headUser && isHead && form.headteacherName) headUser.fullName = form.headteacherName;
    if (deputyUser && (isHead || isDeputy) && form.deputyName) deputyUser.fullName = form.deputyName;
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, "Updated school settings");
    toast.success("Settings saved.");
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="School settings" subtitle="School information, branding and report-card appearance" />

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">School logo</h3>
        <div className="flex items-center gap-5 flex-wrap">
          {db.settings.schoolLogo ? (
            <img src={db.settings.schoolLogo} alt="School logo" className="w-24 h-24 rounded-full object-contain border-4 border-yellow-500 bg-white p-1" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center text-yellow-400 font-serif text-4xl font-bold border-4 border-yellow-500">Y</div>
          )}
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm text-gray-500 mb-3">Shown on the sign-in page, sidebar and report cards. Only the headteacher can change it.</p>
            <Button onClick={() => logoRef.current?.click()} disabled={!isHead} variant={isHead ? "gold" : "ghost"}>{isHead ? "Upload logo" : "Headteacher only"}</Button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, IMAGE_SIZES.logo, (img) => updateSettings({ schoolLogo: img }, "Uploaded school logo", "School logo updated."))} />
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-1">Report-card watermark</h3>
        <p className="text-sm text-gray-500 mb-4">A faint image behind every report card. If none is uploaded, the school logo is used.</p>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-28 h-28 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 p-2 text-gray-400 text-xs text-center">
            {form.watermarkImage ? <img src={form.watermarkImage} alt="Watermark preview" className="max-w-full max-h-full object-contain opacity-60" /> : "Using school logo"}
          </div>
          <div className="space-y-3 flex-1 min-w-[220px]">
            <div className="flex items-center gap-2">
              <Button onClick={() => watermarkRef.current?.click()} variant="gold">Upload watermark</Button>
              {form.watermarkImage && <Button variant="ghost" onClick={() => updateSettings({ watermarkImage: undefined }, "Removed report-card watermark", "Watermark removed.")}>Remove</Button>}
              <input ref={watermarkRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, IMAGE_SIZES.watermark, (img) => updateSettings({ watermarkImage: img }, "Uploaded report-card watermark", "Watermark uploaded."))} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-emerald-600 w-4 h-4" checked={form.watermarkEnabled !== false} onChange={(e) => setForm({ ...form, watermarkEnabled: e.target.checked })} />
              Show watermark on report cards
            </label>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <label htmlFor="wm-opacity" className="font-medium">Opacity</label>
              <input id="wm-opacity" type="range" min={0.01} max={0.2} step={0.01} className="accent-emerald-600 flex-1 max-w-[200px]"
                value={form.watermarkOpacity ?? 0.04} onChange={(e) => setForm({ ...form, watermarkOpacity: Number(e.target.value) })} disabled={form.watermarkEnabled === false} />
              <span className="font-mono w-10 tabular-nums">{Math.round((form.watermarkOpacity ?? 0.04) * 100)}%</span>
            </div>
          </div>
        </div>
      </Card>

      {isHead && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-1">Headteacher signature</h3>
          <p className="text-sm text-gray-500 mb-4">Printed on every report card.</p>
          <div className="flex items-center gap-4 flex-wrap">
            {db.settings.headteacherSignature ? (
              <div className="rounded-lg ring-1 ring-gray-200 p-2 bg-white"><img src={db.settings.headteacherSignature} alt="Headteacher signature" className="h-16" /></div>
            ) : (
              <div className="text-sm italic text-gray-400">No signature uploaded yet.</div>
            )}
            <Button onClick={() => sigRef.current?.click()} variant="secondary">{db.settings.headteacherSignature ? "Replace" : "Upload"} signature</Button>
            <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, IMAGE_SIZES.signature, (img) => updateSettings({ headteacherSignature: img }, "Updated headteacher signature in settings", "Signature updated."))} />
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">School information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="School name" value="YENGWE SECONDARY SCHOOL" disabled />
          <Input label="School motto" value={form.schoolMotto || ""} onChange={(e) => setForm({ ...form, schoolMotto: e.target.value })} />
          <Input label="System domain" value={form.systemDomain || ""} onChange={(e) => setForm({ ...form, systemDomain: e.target.value })} disabled={!isHead} />
          <Input label="School email" type="email" value={form.schoolEmail || ""} onChange={(e) => setForm({ ...form, schoolEmail: e.target.value })} />
          <Input label="Headteacher name" value={form.headteacherName || ""} onChange={(e) => setForm({ ...form, headteacherName: e.target.value })} disabled={!isHead} />
          <Input label="Deputy headteacher name" value={form.deputyName || ""} onChange={(e) => setForm({ ...form, deputyName: e.target.value })} />
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="gold" onClick={saveSettings}>Save settings</Button>
        </div>
      </Card>

      {isHead && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Official desk stamp</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer md:col-span-2">
              <input type="checkbox" className="accent-emerald-600 w-4 h-4" checked={form.stampEnabled !== false} onChange={(e) => setForm({ ...form, stampEnabled: e.target.checked })} />
              Show the official stamp on all report cards
            </label>
            <Select label="Stamp shape" value={form.stampShape || "round"} onChange={(e) => setForm({ ...form, stampShape: e.target.value as SchoolSettings["stampShape"] })}>
              <option value="round">Round</option>
              <option value="square">Square</option>
              <option value="hexagon">Hexagon</option>
            </Select>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="stamp-color" className="text-sm font-medium text-gray-700">Stamp colour</label>
              <div className="flex gap-2 items-center">
                <input id="stamp-color" type="color" value={form.stampColor || "#B41414"} onChange={(e) => setForm({ ...form, stampColor: e.target.value })} className="h-10 w-16 rounded-lg ring-1 ring-gray-300 cursor-pointer" />
                <span className="text-sm text-gray-600 font-mono uppercase">{form.stampColor || "#B41414"}</span>
              </div>
            </div>
            <Input label="Stamp text" value={form.stampText || ""} onChange={(e) => setForm({ ...form, stampText: e.target.value })} placeholder="YENGWE SECONDARY SCHOOL" />
            <Input label="Stamp date" type="date" value={form.stampDate || ""} onChange={(e) => setForm({ ...form, stampDate: e.target.value })} />
            <label className="flex items-center gap-2 text-sm cursor-pointer md:col-span-2">
              <input type="checkbox" className="accent-emerald-600 w-4 h-4" checked={form.stampShowDate !== false} onChange={(e) => setForm({ ...form, stampShowDate: e.target.checked })} />
              Show the date inside the stamp
            </label>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              {([
                ["Size (radius)", "stampSize", 10, 32, 18],
                ["Horizontal offset", "stampXOffset", 20, 80, 38],
                ["Vertical offset", "stampYOffset", -10, 30, 2],
              ] as [string, "stampSize" | "stampXOffset" | "stampYOffset", number, number, number][]).map(([label, key, min, max, def]) => (
                <div key={key}>
                  <label htmlFor={key} className="text-sm font-medium text-gray-700 flex justify-between mb-1"><span>{label}</span><span className="font-mono text-gray-500 tabular-nums">{form[key] ?? def} mm</span></label>
                  <input id={key} type="range" min={min} max={max} step={1} value={form[key] ?? def} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} className="w-full accent-emerald-600" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 p-4 rounded-xl bg-gray-50 ring-1 ring-gray-200 flex items-center gap-4">
            <StampPreview shape={form.stampShape || "round"} color={form.stampColor || "#B41414"} text={form.stampText} date={form.stampShowDate ? form.stampDate : undefined} size={(form.stampSize ?? 18) * 2.5} />
            <span className="text-xs text-gray-500">Preview. The real stamp appears on downloaded report cards.</span>
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="gold" onClick={saveSettings}>Save stamp settings</Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 mb-1">Profile picture permissions</h3>
        <p className="text-sm text-gray-500">
          Only the <strong className="text-gray-700">Headteacher</strong>, <strong className="text-gray-700">Deputy Headteacher</strong> and the <strong className="text-gray-700">IT Department HoD</strong> can upload profile pictures. Pupils and teachers cannot upload their own photos.
        </p>
      </Card>
    </div>
  );
}

function StampPreview({ shape, color, text, date, size = 90 }: { shape: "round" | "square" | "hexagon"; color: string; text?: string; date?: string; size?: number }) {
  const commonStyle: React.CSSProperties = {
    width: size,
    height: size,
    border: `${Math.max(2, size * 0.035)}px double ${color}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color,
    fontFamily: "serif",
    fontWeight: "bold",
    fontSize: Math.max(8, size * 0.11),
    textAlign: "center",
    padding: 4,
    lineHeight: 1.1,
    flexShrink: 0,
    background: "rgba(255,255,255,0.4)",
    borderRadius: shape === "round" ? "50%" : shape === "hexagon" ? `${size * 0.12}px` : "0",
    clipPath: shape === "hexagon" ? "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" : undefined,
  };
  return (
    <div style={commonStyle}>
      <div>
        <div style={{ fontSize: Math.max(7, size * 0.1), letterSpacing: 0.3 }}>{text ? text.slice(0, 22) : "YSS"}</div>
        {date && <div style={{ fontSize: Math.max(6, size * 0.08), marginTop: 2 }}>{date}</div>}
      </div>
    </div>
  );
}
