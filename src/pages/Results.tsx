import { useState, useMemo } from "react";
import { ArrowLeft, BarChart3, Download, Plus, Rocket, Save, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader, StatusLight, RowAction, Alert } from "../components/ui";
import { toast, confirmDialog } from "../components/feedback";
import { getDb, saveDb, genId, logActivity, useDbVersion } from "../utils/db";
import { JUNIOR_SUBJECTS, SENIOR_SUBJECTS, GRADES, getPerformanceColor } from "../data/constants";
import type { User, Result, SubjectScore } from "../types";
import { yengweGrade, YENGWE_GRADES } from "../types";
import { generateResultPDF } from "../utils/pdf";

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 2015 + 2 }, (_, i) => THIS_YEAR + 1 - i);
const GRADE_TONE: Record<string, string> = {
  Distinction: "bg-green-50 ring-green-200 text-green-900",
  Merit: "bg-emerald-50 ring-emerald-200 text-emerald-900",
  Credit: "bg-yellow-50 ring-yellow-200 text-yellow-900",
  Satisfactory: "bg-orange-50 ring-orange-200 text-orange-900",
  Unsatisfactory: "bg-red-50 ring-red-200 text-red-900",
};

export default function Results() {
  const { user } = useAuth();
  const version = useDbVersion();
  const db = useMemo(() => getDb(), [version]);
  const [modal, setModal] = useState<{ open: boolean; result: Result | null; pupil: User | null; mode: "enter" | "view" }>({ open: false, result: null, pupil: null, mode: "view" });
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(THIS_YEAR.toString());

  // For teachers entering results
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("A");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [selectedYear, setSelectedYear] = useState(THIS_YEAR);
  const [scores, setScores] = useState<{ pupilId: string; pupilName: string; score: number | ""; comment?: string; locked?: boolean }[]>([]);
  const [pupilBehaviourComments, setPupilBehaviourComments] = useState<Record<string, string>>({});

  const pupils = useMemo(() => db.users.filter((u) => u.role === "pupil"), [db]);
  const currentUser = user!;
  const isPupil = currentUser?.role === "pupil";
  const isTeacher = currentUser?.role === "teacher" || currentUser?.role === "hod";
  const isAdmin = currentUser?.role === "headteacher" || currentUser?.role === "deputy";

  const visibleResults = useMemo(() => {
    if (!currentUser) return [];
    let results = db.results;
    if (isPupil) {
      // The server only sends a pupil their own published marks; filter again defensively.
      results = results
        .filter((r) => r.pupilId === currentUser.id)
        .map((r) => ({ ...r, scores: r.scores.filter((s) => s.published) }))
        .filter((r) => r.scores.length > 0);
    } else if (currentUser.role === "teacher") {
      results = results.filter((r) => {
        const mine = r.scores.some((s) => s.teacherId === currentUser.id);
        const taught = currentUser.classes?.some((c) => c.grade === r.grade);
        const hasPublished = r.scores.some((s) => s.published);
        return mine || (taught && hasPublished);
      });
    }
    if (termFilter) results = results.filter((r) => r.term === termFilter);
    if (yearFilter) results = results.filter((r) => r.year.toString() === yearFilter);
    if (gradeFilter) results = results.filter((r) => r.grade === gradeFilter);
    if (search && !isPupil) {
      const s = search.toLowerCase();
      results = results.filter((r) => {
        const p = pupils.find((pu) => pu.id === r.pupilId);
        return p && (p.fullName.toLowerCase().includes(s) || (p.pupilId || "").toLowerCase().includes(s));
      });
    }
    return [...results].sort((a, b) => b.year - a.year || b.term.localeCompare(a.term));
  }, [db, isPupil, currentUser, termFilter, yearFilter, gradeFilter, search, pupils]);

  const availableSubjects = useMemo(() => {
    if (selectedGrade && ["8A", "8B", "9A", "9B"].includes(selectedGrade)) return JUNIOR_SUBJECTS;
    if (selectedGrade) return SENIOR_SUBJECTS;
    return [];
  }, [selectedGrade]);

  if (!user) return null;

  function canEditSubject(r: Result, subject: string): boolean {
    const s = r.scores.find((x) => x.subject === subject);
    if (!s) return false;
    if (isAdmin) return true;
    return s.teacherId === currentUser.id && !s.published;
  }

  function loadPupilsForEntry() {
    if (!selectedGrade || !selectedSection || !selectedSubject) {
      toast.warning("Select a grade, section and subject first.");
      return;
    }
    const allowed = currentUser.subjects?.includes(selectedSubject) && currentUser.classes?.some((c) => c.grade === selectedGrade && c.section === selectedSection);
    if (!allowed && currentUser.role === "teacher") {
      toast.error("You are not assigned to this class and subject.");
      return;
    }
    const classPupils = pupils.filter((p) => p.grade === selectedGrade && (p.classSection || "A") === selectedSection).sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (classPupils.length === 0) { toast.info("No pupils are registered in this class yet."); return; }

    const fresh = getDb();
    const comments: Record<string, string> = {};
    const initialScores = classPupils.map((p) => {
      const existing = fresh.results.find((r) => r.pupilId === p.id && r.term === selectedTerm && r.year === selectedYear && r.grade === selectedGrade);
      const existingScore = existing?.scores.find((s) => s.subject === selectedSubject);
      if (existing?.classTeacherComment) comments[p.id] = existing.classTeacherComment;
      const locked = !!existingScore && !isAdmin && (existingScore.published || existingScore.teacherId !== currentUser.id);
      return { pupilId: p.id, pupilName: p.fullName, score: existingScore ? existingScore.score : ("" as const), locked };
    });
    setScores(initialScores);
    setPupilBehaviourComments(comments);
  }

  function saveResults(publish: boolean) {
    if (!selectedGrade || !selectedSection || !selectedSubject) return;
    const editable = scores.filter((s) => !s.locked);
    if (editable.some((s) => s.score === "" || s.score < 0 || s.score > 100)) {
      toast.error("Every score must be a number between 0 and 100.");
      return;
    }
    const db2 = getDb();
    const now = new Date().toISOString();
    editable.forEach((sc) => {
      let result = db2.results.find((r) => r.pupilId === sc.pupilId && r.term === selectedTerm && r.year === selectedYear && r.grade === selectedGrade);
      const existingScore = result?.scores.find((s) => s.subject === selectedSubject);
      const subjectScore: SubjectScore = {
        subject: selectedSubject,
        score: Number(sc.score),
        term: selectedTerm,
        year: selectedYear,
        teacherId: existingScore && isAdmin ? existingScore.teacherId : currentUser.id,
        teacherName: existingScore && isAdmin ? existingScore.teacherName : currentUser.fullName,
        comment: sc.comment,
        published: publish ? true : (existingScore?.published ?? false),
        publishedAt: publish ? now : existingScore?.publishedAt,
      };
      if (!result) {
        result = {
          id: genId("res"), pupilId: sc.pupilId, term: selectedTerm, year: selectedYear, grade: selectedGrade as Result["grade"],
          scores: [subjectScore], published: publish, publishedAt: publish ? now : undefined, publishedBy: publish ? currentUser.id : undefined,
          createdAt: now, updatedAt: now,
        };
        db2.results.push(result);
      } else {
        const idx = result.scores.findIndex((s) => s.subject === selectedSubject);
        if (idx >= 0) result.scores[idx] = subjectScore;
        else result.scores.push(subjectScore);
        result.updatedAt = now;
      }
      if (publish && result.scores.some((s) => s.published)) {
        result.published = true;
        result.publishedAt = result.publishedAt || now;
        result.publishedBy = currentUser.id;
      }
      const behaviourComment = pupilBehaviourComments[sc.pupilId]?.trim();
      if (behaviourComment) {
        result.classTeacherComment = behaviourComment;
        result.classTeacherId = currentUser.id;
      }
    });
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `${publish ? "Published" : "Saved"} ${selectedSubject} results`, `${selectedGrade}${selectedSection} ${selectedTerm} ${selectedYear}`);
    const skipped = scores.length - editable.length;
    toast.success(`${publish ? `${selectedSubject} results published — pupils can now see them.` : "Draft saved. Pupils can't see it yet."}${skipped ? ` ${skipped} locked mark${skipped === 1 ? " was" : "s were"} left unchanged.` : ""}`);
    setScores([]);
    setModal({ ...modal, open: false });
  }

  async function publishResult(r: Result) {
    const db2 = getDb();
    const res = db2.results.find((x) => x.id === r.id);
    if (!res) return;
    const now = new Date().toISOString();
    if (isAdmin) {
      if (!await confirmDialog({ title: "Publish all subjects?", message: "The pupil will be able to see every subject that has marks entered.", confirmLabel: "Publish all" })) return;
      res.scores.forEach((s) => { s.published = true; s.publishedAt = s.publishedAt || now; });
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Published all results for pupil (admin)`, r.id);
    } else {
      const mine = res.scores.filter((s) => s.teacherId === currentUser.id && !s.published);
      if (mine.length === 0) { toast.info("You have no unpublished subjects for this pupil."); return; }
      if (!await confirmDialog({ title: "Publish your subjects?", message: `Publish your ${mine.length} subject${mine.length === 1 ? "" : "s"} for this pupil? They will see ${mine.length === 1 ? "it" : "them"} immediately.`, confirmLabel: "Publish" })) return;
      mine.forEach((s) => { s.published = true; s.publishedAt = now; });
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Published own subjects for pupil`, r.id);
    }
    if (res.scores.some((s) => s.published)) {
      res.published = true;
      res.publishedAt = now;
      res.publishedBy = currentUser.id;
    }
    saveDb(db2);
    toast.success("Results published.");
  }

  async function unpublishResult(r: Result) {
    if (!await confirmDialog({ title: "Unpublish all subjects?", message: "The pupil will no longer see any of these marks until they are published again.", confirmLabel: "Unpublish", danger: true })) return;
    const db2 = getDb();
    const res = db2.results.find((x) => x.id === r.id);
    if (!res) return;
    res.scores.forEach((s) => { s.published = false; s.publishedAt = undefined; });
    res.published = false;
    res.publishedAt = undefined;
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Unpublished all results for pupil`, r.id);
    toast.success("Results unpublished.");
  }

  async function deleteSubjectScore(r: Result, subject: string) {
    if (!canEditSubject(r, subject)) {
      toast.error("You can only delete your own marks, and only before they are published.");
      return;
    }
    if (!await confirmDialog({ title: `Delete ${subject} mark?`, message: "This mark will be removed from the pupil's result.", confirmLabel: "Delete", danger: true })) return;
    const db2 = getDb();
    const res = db2.results.find((x) => x.id === r.id);
    if (!res) return;
    res.scores = res.scores.filter((s) => s.subject !== subject);
    res.published = res.scores.some((s) => s.published);
    if (res.scores.length === 0) db2.results = db2.results.filter((x) => x.id !== r.id);
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted score for ${subject}`);
    setModal({ ...modal, open: false });
    toast.success("Mark deleted.");
  }

  function viewResult(r: Result) {
    const p = db.users.find((u) => u.id === r.pupilId) || (isPupil ? currentUser : undefined);
    setModal({ open: true, result: r, pupil: p || null, mode: "view" });
  }

  function downloadPDF(r: Result) {
    const p = db.users.find((u) => u.id === r.pupilId) || (r.pupilId === currentUser.id ? currentUser : undefined);
    if (!p) return;
    try {
      generateResultPDF(r, p, currentUser, db.settings);
    } catch {
      toast.error("Could not generate the PDF. Please try again.");
    }
  }

  const teacherSubjects = currentUser.subjects || [];
  const teacherClasses = currentUser.classes || [];
  const openEntry = () => { setModal({ open: true, result: null, pupil: null, mode: "enter" }); setScores([]); };

  return (
    <div>
      <PageHeader
        title={isPupil ? "My results" : "Results"}
        subtitle={isPupil ? "Only results your teachers have published are shown" : "Enter, publish and download pupil results"}
      >
        {isTeacher && <Button variant="gold" onClick={openEntry}><Plus className="w-4 h-4" />Enter results</Button>}
      </PageHeader>

      {!isPupil && (
        <Card className="mb-4">
          <h3 className="font-semibold mb-3 text-sm text-gray-900">Yengwe 9-point grading system</h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 text-[11px]">
            {YENGWE_GRADES.map((g) => (
              <div key={g.grade} className={`px-2 py-1.5 rounded-lg ring-1 ring-inset ${GRADE_TONE[g.name]}`}>
                <div className="font-bold text-sm leading-none">{g.grade}</div>
                <div className="mt-1">{g.min}–{g.max}%</div>
                <div className="opacity-80 truncate">{g.name}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isTeacher && (
        <Card className="mb-4">
          <h3 className="font-semibold mb-2 text-sm text-gray-900">My assigned classes & subjects</h3>
          <div className="flex flex-wrap gap-1.5">
            {teacherClasses.length === 0 && teacherSubjects.length === 0 && <span className="text-sm text-gray-500">Nothing assigned yet. Your HoD or the headteacher will assign your classes.</span>}
            {teacherClasses.map((c, i) => <Badge key={i} color="blue">{c.grade} · Section {c.section}</Badge>)}
            {teacherSubjects.map((s, i) => <Badge key={`s-${i}`} color="emerald">{s}</Badge>)}
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <div className={`grid grid-cols-2 ${isPupil ? "" : "md:grid-cols-4"} gap-3`}>
          {!isPupil && (
            <div className="relative col-span-2 md:col-span-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input aria-label="Search pupil" placeholder="Search pupil…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          )}
          {!isPupil && (
            <Select aria-label="Grade" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">All grades</option>
              {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </Select>
          )}
          <Select aria-label="Term" value={termFilter} onChange={(e) => setTermFilter(e.target.value)}>
            <option value="">All terms</option>
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </Select>
          <Select aria-label="Year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </Card>

      <Card>
        {visibleResults.length === 0 ? (
          <EmptyState icon={<BarChart3 className="w-6 h-6" />} message={isPupil ? "No results have been published for you yet. Check back after your teachers publish marks." : "No results match these filters."}
            action={isTeacher ? <Button variant="gold" onClick={openEntry}><Plus className="w-4 h-4" />Enter results</Button> : undefined} />
        ) : (
          <Table headers={!isPupil ? ["Pupil", "Grade", "Term", "Subjects", "Average", "Status", ""] : ["Term", "Grade", "Subjects", "Average", ""]}>
            {visibleResults.map((r) => {
              const p = db.users.find((u) => u.id === r.pupilId);
              const publishedCount = r.scores.filter((s) => s.published).length;
              const totalCount = r.scores.length;
              const avg = totalCount > 0 ? r.scores.reduce((a, b) => a + b.score, 0) / totalCount : 0;
              const color = totalCount > 0 ? getPerformanceColor(avg) : "gray";
              const hasUnpublishedMine = !isPupil && r.scores.some((s) => s.teacherId === currentUser.id && !s.published);
              const canPublish = (isAdmin && publishedCount < totalCount) || hasUnpublishedMine;
              return (
                <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                  {!isPupil && <td className="px-4 py-3"><div className="font-medium text-gray-900 min-w-[140px]">{p?.fullName || "Unknown pupil"}</div><div className="text-xs text-gray-500 font-mono">{p?.pupilId}</div></td>}
                  {isPupil && <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.term}, {r.year}</td>}
                  <td className="px-4 py-3"><Badge color="emerald">{r.grade}</Badge></td>
                  {!isPupil && <td className="px-4 py-3 text-sm whitespace-nowrap">{r.term}, {r.year}</td>}
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {isPupil ? <>{totalCount} subject{totalCount !== 1 ? "s" : ""}</> : <><strong className="text-gray-900">{publishedCount}</strong> / {totalCount} published</>}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {totalCount > 0 ? <div className="flex items-center gap-2"><StatusLight color={color} size="sm" /> {avg.toFixed(1)}%</div> : <span className="text-gray-400">—</span>}
                  </td>
                  {!isPupil && (
                    <td className="px-4 py-3">
                      {publishedCount === 0 ? <Badge color="yellow">Draft</Badge> : publishedCount === totalCount ? <Badge color="green" pulse>Published</Badge> : <Badge color="blue">Partly published</Badge>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex gap-0.5 justify-end flex-wrap">
                      <RowAction tone="primary" onClick={() => viewResult(r)}>View</RowAction>
                      {publishedCount > 0 && <RowAction tone="success" onClick={() => downloadPDF(r)}>PDF</RowAction>}
                      {canPublish && <RowAction tone="success" onClick={() => publishResult(r)}>Publish</RowAction>}
                      {isAdmin && publishedCount > 0 && <RowAction tone="warn" onClick={() => unpublishResult(r)}>Unpublish</RowAction>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* Enter Results Modal */}
      <Modal open={modal.open && modal.mode === "enter"} onClose={() => { setModal({ ...modal, open: false }); setScores([]); }} title="Enter subject results" size="xl">
        {scores.length === 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Select label="Grade *" value={selectedGrade} onChange={(e) => { setSelectedGrade(e.target.value); setSelectedSubject(""); }}>
                <option value="">Select…</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Select label="Section" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </Select>
              <Select label="Subject *" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} disabled={!selectedGrade} className="col-span-2 md:col-span-1">
                <option value="">{selectedGrade ? "Select…" : "Choose a grade first"}</option>
                {availableSubjects.map((s) => {
                  const assigned = currentUser.role !== "teacher" || teacherSubjects.includes(s);
                  return <option key={s} value={s} disabled={!assigned}>{s}{!assigned ? " (not assigned)" : ""}</option>;
                })}
              </Select>
              <Select label="Term" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </Select>
              <Select label="Year" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <Alert tone="info"><strong>Per-subject publishing:</strong> you can publish this subject's marks as soon as they're entered — no need to wait for other subjects. Pupils only see subjects that are published.</Alert>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={loadPupilsForEntry}>Load class</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50 ring-1 ring-gray-200 p-3 rounded-xl">
              <div>
                <div className="font-semibold text-gray-900">{selectedSubject}</div>
                <div className="text-sm text-gray-500">Grade {selectedGrade} · Section {selectedSection} · {selectedTerm} {selectedYear}</div>
              </div>
              <Badge color="blue">{scores.length} pupils</Badge>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-xl ring-1 ring-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="text-xs uppercase tracking-wide text-gray-600">
                    <th className="px-3 py-2.5 text-left w-10">#</th>
                    <th className="px-3 py-2.5 text-left min-w-[140px]">Pupil</th>
                    <th className="px-3 py-2.5 text-left w-28">Score</th>
                    <th className="px-3 py-2.5 text-left min-w-[220px]">Class-teacher comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scores.map((sc, i) => {
                    const yg = sc.score === "" ? null : yengweGrade(Number(sc.score));
                    return (
                      <tr key={sc.pupilId} className="align-top">
                        <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{sc.pupilName}{sc.locked && <div className="text-[11px] font-normal text-amber-700">Published — locked</div>}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number" inputMode="numeric" min={0} max={100} aria-label={`Score for ${sc.pupilName}`}
                            value={sc.score} disabled={sc.locked}
                            onChange={(e) => {
                              const v = e.target.value;
                              setScores((prev) => prev.map((row, idx) => idx === i ? { ...row, score: v === "" ? "" : Math.max(0, Math.min(100, Number(v))) } : row));
                            }}
                            className="w-20 px-2 py-1.5 rounded-lg border border-gray-300 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
                          />
                          {yg && <div className="text-[11px] text-gray-500 mt-1">Grade {yg.grade} · {yg.name}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            rows={2} aria-label={`Comment for ${sc.pupilName}`}
                            value={pupilBehaviourComments[sc.pupilId] || ""}
                            onChange={(e) => setPupilBehaviourComments((prev) => ({ ...prev, [sc.pupilId]: e.target.value }))}
                            placeholder="Behaviour, conduct, attitude…"
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-sm resize-none outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setScores([])}><ArrowLeft className="w-4 h-4" />Back</Button>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="secondary" onClick={() => saveResults(false)}><Save className="w-4 h-4" />Save draft</Button>
                <Button variant="success" onClick={() => saveResults(true)}><Rocket className="w-4 h-4" />Publish to pupils</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* View Result Modal */}
      <Modal open={modal.open && modal.mode === "view"} onClose={() => setModal({ ...modal, open: false })} title={`Result · ${modal.pupil?.fullName || ""}`} size="lg">
        {modal.result && modal.pupil && (() => {
          const displayScores = modal.result.scores;
          const avg = displayScores.length > 0 ? displayScores.reduce((a, b) => a + b.score, 0) / displayScores.length : 0;
          const c = displayScores.length > 0 ? getPerformanceColor(avg) : "gray";
          const publishedCount = displayScores.filter((s) => s.published).length;
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3 bg-gray-50 ring-1 ring-gray-200 p-4 rounded-xl">
                <div>
                  <div className="font-bold text-lg text-gray-900">{modal.pupil.fullName}</div>
                  <div className="text-sm text-gray-500">Grade {modal.result.grade} · Section {modal.pupil.classSection || "A"} · {modal.result.term} {modal.result.year}</div>
                </div>
                {displayScores.length > 0 && (
                  <div className="flex items-center gap-2"><StatusLight color={c} size="md" /><span className="font-bold text-2xl text-gray-900">{avg.toFixed(1)}%</span></div>
                )}
              </div>
              <Table headers={isPupil ? ["Subject", "Score", "Grade", "Remark", "Teacher"] : ["Subject", "Score", "Status", "Grade", "Remark", "Teacher", ""]}>
                {displayScores.map((s) => {
                  const yg = yengweGrade(s.score);
                  const gradeColor = s.score >= 60 ? "green" : s.score >= 40 ? "yellow" : "red";
                  return (
                    <tr key={s.subject}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.subject}</td>
                      <td className="px-4 py-2.5 font-semibold">{s.score}%</td>
                      {!isPupil && <td className="px-4 py-2.5">{s.published ? <Badge color="green">Published</Badge> : <Badge color="yellow">Draft</Badge>}</td>}
                      <td className="px-4 py-2.5"><Badge color={gradeColor}>Grade {yg.grade}</Badge></td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{yg.name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{s.teacherName}</td>
                      {!isPupil && (
                        <td className="px-4 py-2.5 text-right">
                          {canEditSubject(modal.result!, s.subject) && <RowAction tone="danger" onClick={() => deleteSubjectScore(modal.result!, s.subject)}>Delete</RowAction>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Table>
              {modal.result.classTeacherComment && (
                <div className="p-4 rounded-xl ring-1 ring-emerald-200 bg-emerald-50">
                  <div className="text-xs font-semibold text-emerald-800 mb-1">Class teacher's comment</div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{modal.result.classTeacherComment}</p>
                </div>
              )}

              {isPupil ? (
                <div className="flex justify-end">
                  <Button variant="gold" onClick={() => downloadPDF(modal.result!)}><Download className="w-4 h-4" />Download report card</Button>
                </div>
              ) : publishedCount > 0 ? (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm text-gray-500"><strong className="text-gray-900">{publishedCount}</strong> of {displayScores.length} subjects published. The PDF includes published subjects only.</p>
                  <Button variant="gold" onClick={() => downloadPDF(modal.result!)}><Download className="w-4 h-4" />Download PDF</Button>
                </div>
              ) : (
                <Alert tone="warning">These results are still a draft, so the pupil can't see them. Each teacher can publish their own subject independently.</Alert>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
