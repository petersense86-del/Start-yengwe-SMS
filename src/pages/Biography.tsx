import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Textarea, Select, PageHeader, Modal } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import type { GalleryItem, SchoolBiography } from "../types";

export default function Biography() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user;
  const isIT = currentUser.role === "headteacher" || currentUser.role === "deputy" || (currentUser.role === "hod" && currentUser.hodDepartment === "IT Department");

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const bio: SchoolBiography = db.biography || {
    id: "bio-default",
    aboutText: "",
    mission: "",
    vision: "",
    history: "",
    gallery: [],
    animationStyle: "fade",
    updatedAt: new Date().toISOString(),
    updatedBy: "",
    updatedByName: "",
  };

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Partial<SchoolBiography>>({ ...bio });
  const [currentSlide, setCurrentSlide] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-rotate slides for animation
  useEffect(() => {
    if (bio.gallery.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((s) => (s + 1) % bio.gallery.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [bio.gallery.length]);

  function handleUploadImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const promises = files.map((f) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(f);
    }));
    Promise.all(promises).then((images) => {
      const newItems: GalleryItem[] = images.map((img) => ({
        id: genId("gal"),
        image: img,
        uploadedAt: new Date().toISOString(),
        caption: "",
      }));
      setForm((prev) => ({ ...prev, gallery: [...(prev.gallery || []), ...newItems] }));
    });
  }

  function removeImage(id: string) {
    setForm((prev) => ({ ...prev, gallery: (prev.gallery || []).filter((g) => g.id !== id) }));
  }

  function setCaption(id: string, caption: string) {
    setForm((prev) => ({ ...prev, gallery: (prev.gallery || []).map((g) => g.id === id ? { ...g, caption } : g) }));
  }

  function saveBio() {
    const db2 = getDb();
    db2.biography = {
      ...bio,
      ...form,
      id: bio.id || "bio-default",
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.id,
      updatedByName: currentUser.fullName,
    } as SchoolBiography;
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, "Updated school biography & gallery");
    setEditOpen(false);
    setRefreshKey((k) => k + 1);
  }

  function openEdit() {
    setForm({ ...bio });
    setEditOpen(true);
  }

  const animClass: Record<string, string> = {
    fade: "animate-fadeIn",
    slide: "animate-slideIn",
    zoom: "animate-zoomIn",
    flip: "animate-flipIn",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="About Yengwe Secondary School"
        subtitle="School biography, mission, vision, and animated photo gallery (managed by IT Department)"
      >
        {isIT && <Button variant="gold" onClick={openEdit}>✎ Edit Biography & Gallery</Button>}
      </PageHeader>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 text-white shadow-xl min-h-[380px] flex items-center">
        {bio.gallery.length > 0 ? (
          <>
            {bio.gallery.map((g, i) => (
              <div
                key={g.id}
                className={`absolute inset-0 transition-all duration-1000 ${animClass[bio.animationStyle] || "animate-fadeIn"} ${i === currentSlide ? "opacity-100" : "opacity-0"}`}
                style={{ zIndex: i === currentSlide ? 2 : 1 }}
              >
                <img src={g.image} alt={g.caption || ""} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                {g.caption && (
                  <div className="absolute bottom-8 left-8 right-8 text-xl font-semibold drop-shadow-lg">{g.caption}</div>
                )}
              </div>
            ))}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {bio.gallery.map((_, i) => (
                <button key={i} onClick={() => setCurrentSlide(i)} className={`w-2 h-2 rounded-full transition-all ${i === currentSlide ? "bg-yellow-400 w-6" : "bg-white/60"}`} />
              ))}
            </div>
          </>
        ) : (
          <div className="w-full text-center py-20 px-6">
            <div className="text-6xl mb-4">🏫</div>
            <h2 className="text-3xl font-bold font-serif">YENGWE SECONDARY SCHOOL</h2>
            <p className="italic text-yellow-300 mt-2 text-lg">Rise & Shine</p>
            {isIT && <p className="mt-6 text-white/80 text-sm">IT Department can add an animated photo gallery by clicking "Edit Biography & Gallery".</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2"><span className="text-xl">📖</span> About Us</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{bio.aboutText || "No about text yet. The IT Department will add the school biography here."}</p>
        </Card>
        <Card>
          <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2"><span className="text-xl">🎯</span> Our Mission</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{bio.mission || "Mission statement coming soon."}</p>
        </Card>
        <Card>
          <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2"><span className="text-xl">👁️</span> Our Vision</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{bio.vision || "Vision statement coming soon."}</p>
        </Card>
      </div>

      {bio.history && (
        <Card>
          <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2"><span className="text-xl">📜</span> Our History</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{bio.history}</p>
        </Card>
      )}

      {bio.gallery.length > 0 && (
        <Card>
          <h3 className="font-bold text-emerald-800 mb-4">Photo Gallery</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {bio.gallery.map((g) => (
              <div key={g.id} className="relative rounded-lg overflow-hidden group aspect-square">
                <img src={g.image} alt="" className="w-full h-full object-cover" />
                {g.caption && <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 text-center">{g.caption}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {bio.updatedByName && (
        <div className="text-xs text-gray-500 text-right">
          Last updated by <strong>{bio.updatedByName}</strong> • {new Date(bio.updatedAt).toLocaleString()}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit School Biography & Gallery" size="xl">
        <div className="space-y-4">
          {!isIT ? <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">You do not have permission to edit this page.</div> : (
            <>
              <Textarea label="About the School" rows={4} value={form.aboutText || ""} onChange={(e) => setForm({ ...form, aboutText: e.target.value })} placeholder="Write a brief biography of Yengwe Secondary School..." />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Textarea label="Mission Statement" rows={3} value={form.mission || ""} onChange={(e) => setForm({ ...form, mission: e.target.value })} />
                <Textarea label="Vision Statement" rows={3} value={form.vision || ""} onChange={(e) => setForm({ ...form, vision: e.target.value })} />
              </div>
              <Textarea label="School History" rows={4} value={form.history || ""} onChange={(e) => setForm({ ...form, history: e.target.value })} />
              <Select label="Gallery Animation Style" value={form.animationStyle || "fade"} onChange={(e) => setForm({ ...form, animationStyle: e.target.value as any })}>
                <option value="fade">Fade (smooth crossfade)</option>
                <option value="slide">Slide (horizontal)</option>
                <option value="zoom">Zoom (Ken Burns)</option>
                <option value="flip">Flip (rotate)</option>
              </Select>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Photo Gallery</h4>
                  <Button variant="secondary" onClick={() => fileRef.current?.click()}>+ Upload Photos</Button>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImages} />
                </div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {(form.gallery || []).map((g) => (
                    <div key={g.id} className="relative rounded border overflow-hidden aspect-square group">
                      <img src={g.image} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(g.id)} className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100">×</button>
                      <input
                        type="text"
                        placeholder="Caption..."
                        value={g.caption || ""}
                        onChange={(e) => setCaption(g.id, e.target.value)}
                        className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 outline-none"
                      />
                    </div>
                  ))}
                  {(form.gallery || []).length === 0 && <p className="text-sm text-gray-500 col-span-full">No photos yet. Upload photos to create the animated hero banner.</p>}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button variant="gold" onClick={saveBio}>Save Biography</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
