import { useState, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader, Textarea } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import type { DownloadLog, SystemUpdate, ActivityLog } from "../types";

// ================= DOWNLOAD LOGS (Headteacher only) =================
export function DownloadLogs() {
  const { user } = useAuth();
  if (!user) return null;
  const [refreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);

  const logs = useMemo(() => [...db.downloadLogs].sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt)), [db]);

  return (
    <div>
      <PageHeader title="Download Logs" subtitle="Track every PDF download of pupil results" />
      <Card>
        {logs.length === 0 ? (
          <EmptyState message="No downloads recorded yet." />
        ) : (
          <Table headers={["Date/Time", "Downloaded By", "Role", "Pupil Record"]}>
            {logs.map((l: DownloadLog) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs">{new Date(l.downloadedAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-medium">{l.downloadedByName}</td>
                <td className="px-4 py-2"><Badge color="emerald">{l.role}</Badge></td>
                <td className="px-4 py-2 text-sm">{l.pupilName}</td>
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
  const { user } = useAuth();
  if (!user) return null;
  const [refreshKey] = useState(0);
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const db = useMemo(() => getDb(), [refreshKey]);

  const logs = useMemo(() => {
    let list: ActivityLog[] = [...db.activityLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (roleFilter) list = list.filter((l) => l.role === roleFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((l) => l.userName.toLowerCase().includes(s) || l.action.toLowerCase().includes(s) || (l.details || "").toLowerCase().includes(s));
    }
    return list;
  }, [db, roleFilter, search]);

  return (
    <div>
      <PageHeader title="Activity Logs" subtitle="All system activity (only visible to the Headteacher)" />
      <Card className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
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
          <EmptyState message="No activity recorded yet." />
        ) : (
          <Table headers={["Timestamp", "User", "Role", "Action", "Details"]}>
            {logs.slice(0, 200).map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2 font-medium">{l.userName}</td>
                <td className="px-4 py-2"><Badge color="emerald">{l.role}</Badge></td>
                <td className="px-4 py-2 text-sm">{l.action}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{l.details || "-"}</td>
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
  if (!user) return null;
  const currentUser = user;
  const canPost = ["headteacher", "deputy"].includes(currentUser.role) || (currentUser.role === "hod" && currentUser.hodDepartment === "IT Department");
  const canDelete = currentUser.role === "headteacher";

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [error, setError] = useState("");

  const updates = useMemo(() => [...db.systemUpdates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db]);

  function postUpdate() {
    setError("");
    if (!form.title || !form.description) { setError("Both fields required"); return; }
    const db2 = getDb();
    db2.systemUpdates.push({
      id: genId("upd"),
      title: form.title,
      description: form.description,
      postedBy: currentUser.id,
      postedByName: currentUser.fullName,
      role: currentUser.role,
      createdAt: new Date().toISOString(),
    });
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Posted system update: ${form.title}`);
    setForm({ title: "", description: "" });
    setModal(false);
    setRefreshKey((k) => k + 1);
  }

  function deleteUpdate(id: string) {
    if (!confirm("Delete this update?")) return;
    const db2 = getDb();
    db2.systemUpdates = db2.systemUpdates.filter((u) => u.id !== id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted system update`);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <PageHeader title="System Updates" subtitle="Announcements about system changes (Headteacher, Deputy, and IT Department can post)">
        {canPost && <Button variant="gold" onClick={() => setModal(true)}>+ Post Update</Button>}
      </PageHeader>

      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
        <strong>📧 Contact:</strong> For official updates and support, email <a href={`mailto:${db.settings.schoolEmail}`} className="underline">{db.settings.schoolEmail}</a> (linked to Google).
      </div>

      {updates.length === 0 ? (
        <Card><EmptyState message="No system updates yet." /></Card>
      ) : (
        <div className="space-y-3">
          {updates.map((u: SystemUpdate) => (
            <Card key={u.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{u.title}</h3>
                    <Badge color="blue">{u.role}</Badge>
                  </div>
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{u.description}</p>
                  <div className="text-xs text-gray-500 mt-2">Posted by {u.postedByName} • {new Date(u.createdAt).toLocaleString()}</div>
                </div>
                {canDelete && <button onClick={() => deleteUpdate(u.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Post System Update">
        <div className="space-y-3">
          {error && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="Description" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
            <Button variant="gold" onClick={postUpdate}>Post Update</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ================= SETTINGS (Head/Deputy - mainly Head for logo) =================
export function SettingsPage() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user;
  const isHead = currentUser.role === "headteacher";
  const isDeputy = currentUser.role === "deputy";

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const [form, setForm] = useState({ ...db.settings });
  const logoRef = useRef<HTMLInputElement>(null);
  const watermarkRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isHead) { alert("Only the headteacher can upload the school logo."); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const db2 = getDb();
      db2.settings.schoolLogo = reader.result as string;
      saveDb(db2);
      setForm({ ...form, schoolLogo: reader.result as string });
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, "Uploaded school logo");
      setMsg("School logo updated.");
      setRefreshKey((k) => k + 1);
    };
    reader.readAsDataURL(file);
  }

  function handleWatermarkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const db2 = getDb();
      db2.settings.watermarkImage = reader.result as string;
      saveDb(db2);
      setForm({ ...form, watermarkImage: reader.result as string });
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, "Uploaded report-card watermark");
      setMsg("Watermark uploaded. It will appear faintly in the background of every report card.");
      setRefreshKey((k) => k + 1);
    };
    reader.readAsDataURL(file);
  }

  function handleWatermarkRemove() {
    const db2 = getDb();
    db2.settings.watermarkImage = undefined;
    saveDb(db2);
    const { watermarkImage, ...rest } = form;
    setForm(rest as any);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, "Removed report-card watermark");
    setMsg("Watermark removed. School logo will be used as the background watermark if available.");
    setRefreshKey((k) => k + 1);
  }

  function handleHeadSigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isHead) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const db2 = getDb();
      db2.settings.headteacherSignature = reader.result as string;
      saveDb(db2);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, "Updated headteacher signature in settings");
      setMsg("Headteacher signature updated.");
      setRefreshKey((k) => k + 1);
    };
    reader.readAsDataURL(file);
  }

  function saveSettings() {
    const db2 = getDb();
    db2.settings = { ...db2.settings, ...form };
    // Also update names in the user records for head/deputy so they reflect
    const headUser = db2.users.find((u) => u.role === "headteacher");
    const deputyUser = db2.users.find((u) => u.role === "deputy");
    if (headUser && isHead) {
      headUser.fullName = form.headteacherName;
      db2.settings.headteacherName = form.headteacherName;
    }
    if (deputyUser && (isHead || isDeputy)) {
      deputyUser.fullName = form.deputyName || "";
      db2.settings.deputyName = form.deputyName;
    }
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, "Updated school settings");
    setMsg("Settings saved successfully.");
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="School Settings" subtitle="Configure school information and branding" />

      {msg && <div className="p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm">{msg}</div>}

      <Card>
        <h3 className="font-semibold mb-4">School Logo</h3>
        <div className="flex items-center gap-4 flex-wrap">
          {db.settings.schoolLogo ? (
            <img src={db.settings.schoolLogo} alt="School Logo" className="w-24 h-24 rounded-full object-contain border-4 border-yellow-500 bg-white p-1" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center text-yellow-400 font-serif text-4xl font-bold border-4 border-yellow-500">Y</div>
          )}
          <div>
            <p className="text-sm text-gray-600 mb-2">Upload the school crest/logo. Only the Headteacher can change this.</p>
            <Button onClick={() => logoRef.current?.click()} disabled={!isHead} variant={isHead ? "gold" : "ghost"}>
              {isHead ? "Upload Logo" : "Locked"}
            </Button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-4">Report-Card Background Watermark</h3>
        <p className="text-sm text-gray-600 mb-3">
          Upload a faint background watermark that appears on every PDF report card. The watermark is drawn behind all text/tables and
          at low opacity, so all important information remains clearly readable. If no watermark is uploaded, the school logo is used.
          <strong className="block mt-1">Restricted to Headteacher &amp; Deputy Headteacher only.</strong>
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          {form.watermarkImage ? (
            <div className="w-28 h-28 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 p-2">
              <img src={form.watermarkImage} alt="Watermark preview" className="max-w-full max-h-full object-contain opacity-60" />
            </div>
          ) : (
            <div className="w-28 h-28 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 text-gray-400 text-xs text-center p-2">
              No custom watermark (school logo will be used)
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button onClick={() => watermarkRef.current?.click()} variant="gold" disabled={!isHead && !isDeputy}>
                {isHead || isDeputy ? "Upload Watermark" : "Locked"}
              </Button>
              {form.watermarkImage && (isHead || isDeputy) && (
                <Button variant="ghost" onClick={handleWatermarkRemove}>Remove</Button>
              )}
              <input ref={watermarkRef} type="file" accept="image/*" className="hidden" onChange={handleWatermarkUpload} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.watermarkEnabled !== false}
                onChange={(e) => setForm({ ...form, watermarkEnabled: e.target.checked })}
                disabled={!isHead && !isDeputy}
                className="w-4 h-4"
              />
              <span><strong>Show watermark</strong> on report card PDFs</span>
            </label>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <label className="font-medium">Opacity:</label>
              <input
                type="range" min={0.01} max={0.2} step={0.01}
                value={form.watermarkOpacity ?? 0.04}
                onChange={(e) => setForm({ ...form, watermarkOpacity: Number(e.target.value) })}
                disabled={(!isHead && !isDeputy) || form.watermarkEnabled === false}
              />
              <span className="font-mono w-10">{Math.round((form.watermarkOpacity ?? 0.04) * 100)}%</span>
            </div>
          </div>
        </div>
      </Card>

      {isHead && (
        <Card>
          <h3 className="font-semibold mb-4">Headteacher Signature (for PDF reports)</h3>
          <div className="flex items-center gap-4 flex-wrap">
            {db.settings.headteacherSignature ? (
              <div className="border rounded p-2 bg-white">
                <img src={db.settings.headteacherSignature} alt="Signature" className="h-16" />
              </div>
            ) : (
              <div className="text-sm italic text-gray-400">No signature uploaded yet. Upload from your Profile page or here.</div>
            )}
            <Button onClick={() => sigRef.current?.click()} variant="gold">Upload Signature</Button>
            <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={handleHeadSigUpload} />
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold mb-4">School Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="School Name" value="YENGWE SECONDARY SCHOOL" disabled />
          <Input label="School Motto" value={form.schoolMotto || ""} onChange={(e) => setForm({ ...form, schoolMotto: e.target.value })} />
          <Input label="System Domain" value={form.systemDomain || ""} onChange={(e) => setForm({ ...form, systemDomain: e.target.value })} disabled={!isHead} />
          <Input label="School Email (Google-linked)" type="email" value={form.schoolEmail || ""} onChange={(e) => setForm({ ...form, schoolEmail: e.target.value })} />
          <Input label="Headteacher Name" value={form.headteacherName || ""} onChange={(e) => setForm({ ...form, headteacherName: e.target.value })} disabled={!isHead} />
          <Input label="Deputy Headteacher Name" value={form.deputyName || ""} onChange={(e) => setForm({ ...form, deputyName: e.target.value })} disabled={!isHead && !isDeputy} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="gold" onClick={saveSettings}>Save Settings</Button>
        </div>
      </Card>

      {isHead && (
        <Card>
          <h3 className="font-semibold mb-4">Official Desk Stamp (appears on report cards)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Enable Stamp</label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.stampEnabled !== false} onChange={(e) => setForm({ ...form, stampEnabled: e.target.checked })} />
                Show official stamp on all report cards
              </label>
            </div>
            <Select label="Stamp Shape" value={form.stampShape || "round"} onChange={(e) => setForm({ ...form, stampShape: e.target.value as any })}>
              <option value="round">Round</option>
              <option value="square">Square</option>
              <option value="hexagon">Hexagon</option>
            </Select>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Stamp Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.stampColor || "#B41414"} onChange={(e) => setForm({ ...form, stampColor: e.target.value })} className="h-10 w-20 rounded border cursor-pointer" />
                <span className="text-sm text-gray-600 font-mono">{form.stampColor || "#B41414"}</span>
              </div>
            </div>
            <Input label="Stamp Text (top line)" value={form.stampText || ""} onChange={(e) => setForm({ ...form, stampText: e.target.value })} placeholder="YENGWE SECONDARY SCHOOL" />
            <Input label="Stamp Date" type="date" value={form.stampDate || ""} onChange={(e) => setForm({ ...form, stampDate: e.target.value })} />
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Show Date on Stamp</label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.stampShowDate !== false} onChange={(e) => setForm({ ...form, stampShowDate: e.target.checked })} />
                Display date inside the stamp
              </label>
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Stamp Size (radius, mm)</label>
                <input type="range" min={10} max={32} step={1} value={form.stampSize ?? 18} onChange={(e) => setForm({ ...form, stampSize: Number(e.target.value) })} className="w-full" />
                <div className="text-xs text-gray-600">Size: {form.stampSize ?? 18} mm</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Horizontal Offset (mm from right)</label>
                <input type="range" min={20} max={80} step={1} value={form.stampXOffset ?? 38} onChange={(e) => setForm({ ...form, stampXOffset: Number(e.target.value) })} className="w-full" />
                <div className="text-xs text-gray-600">{form.stampXOffset ?? 38} mm</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Vertical Offset (mm below signatures)</label>
                <input type="range" min={-10} max={30} step={1} value={form.stampYOffset ?? 2} onChange={(e) => setForm({ ...form, stampYOffset: Number(e.target.value) })} className="w-full" />
                <div className="text-xs text-gray-600">{form.stampYOffset ?? 2} mm</div>
              </div>
            </div>
          </div>
          <div className="mt-4 p-4 border rounded-lg bg-gray-50">
            <div className="text-xs font-medium text-gray-600 mb-2">Preview (shape): {form.stampShape} • size: {form.stampSize ?? 18}mm</div>
            <div className="flex items-center gap-3">
              <StampPreview shape={form.stampShape || "round"} color={form.stampColor || "#B41414"} text={form.stampText} date={form.stampShowDate ? form.stampDate : undefined} size={(form.stampSize ?? 18) * 2.5} />
              <span className="text-xs text-gray-500">Preview scales proportionally. The actual stamp appears on downloaded PDF report cards.</span>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="gold" onClick={saveSettings}>Save Stamp Settings</Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold mb-2">Profile Picture Upload Permissions</h3>
        <p className="text-sm text-gray-600">
          Only the <strong>Headteacher</strong>, <strong>Deputy Headteacher</strong>, and the <strong>IT Department HoD</strong> can upload profile pictures for staff and pupils.
          Pupils and regular teachers cannot upload their own photos.
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
    position: "relative",
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


