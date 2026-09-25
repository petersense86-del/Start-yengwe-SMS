import { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Input, Select, Modal, Badge, Table, EmptyState, PageHeader, StatusLight } from "../components/ui";
import { getDb, saveDb, genId, logActivity } from "../utils/db";
import { JUNIOR_SUBJECTS, SENIOR_SUBJECTS, GRADES, getPerformanceColor } from "../data/constants";
import type { User, Result, SubjectScore } from "../types";
import { yengweGrade } from "../types";
import { generateResultPDF } from "../utils/pdf";

export default function Results() {
  const { user } = useAuth();
  if (!user) return null;
  const currentUser = user;
  const isPupil = currentUser.role === "pupil";
  const isTeacher = currentUser.role === "teacher" || currentUser.role === "hod";
  const isAdmin = currentUser.role === "headteacher" || currentUser.role === "deputy";

  const [refreshKey, setRefreshKey] = useState(0);
  const db = useMemo(() => getDb(), [refreshKey]);
  const [modal, setModal] = useState<{ open: boolean; result: Result | null; pupil: User | null; mode: "enter" | "view" }>({ open: false, result: null, pupil: null, mode: "view" });
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  // For teachers entering results
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("A");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [scores, setScores] = useState<{ pupilId: string; pupilName: string; score: number | ""; comment?: string }[]>([]);
  const [pupilBehaviourComments, setPupilBehaviourComments] = useState<Record<string, string>>({});

  const pupils = useMemo(() => db.users.filter((u) => u.role === "pupil"), [db]);

  const visibleResults = useMemo(() => {
    let results = db.results;
    if (isPupil) {
      // Pupils only see their own results AND only subjects that have been published
      results = results
        .filter((r) => r.pupilId === currentUser.id)
        .map((r) => ({ ...r, scores: r.scores.filter((s) => s.published) }))
        .filter((r) => r.scores.length > 0);
    } else if (isTeacher && currentUser.role !== "headteacher" && currentUser.role !== "deputy" && currentUser.role !== "hod") {
      // Teachers can see results that contain their own subject (any state) OR results for their classes where at least one subject is published
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
    return results;
  }, [db, isPupil, isTeacher, currentUser, termFilter, yearFilter, gradeFilter, search, pupils]);

  function canEditSubject(r: Result, subject: string): boolean {
    const s = r.scores.find((x) => x.subject === subject);
    if (!s) return false;
    if (isAdmin) return true;
    if (s.teacherId !== currentUser.id) return false;
    if (s.published) return false;
    return true;
  }

  function loadPupilsForEntry() {
    if (!selectedGrade || !selectedSection || !selectedSubject) {
      alert("Select grade, section and subject.");
      return;
    }
    // check if teacher is assigned this subject/class
    const allowed = currentUser.subjects?.includes(selectedSubject) && currentUser.classes?.some((c) => c.grade === selectedGrade && c.section === selectedSection);
    if (!allowed && currentUser.role !== "headteacher" && currentUser.role !== "deputy" && currentUser.role !== "hod") {
      alert("You are not assigned to this class/subject.");
      return;
    }
    const classPupils = pupils.filter((p) => p.grade === selectedGrade && (p.classSection || "A") === selectedSection);
    if (classPupils.length === 0) { alert("No pupils found in this class."); return; }

    // Preload existing scores AND class-teacher behaviour comments
    const initialScores = classPupils.map((p) => {
      const existing = getDb().results.find(
        (r) => r.pupilId === p.id && r.term === selectedTerm && r.year === selectedYear && r.grade === selectedGrade
      );
      const existingScore = existing?.scores.find((s) => s.subject === selectedSubject);
      const comment = existing?.classTeacherComment || "";
      return { pupilId: p.id, pupilName: p.fullName, score: existingScore ? existingScore.score : ("" as const), comment };
    });
    setScores(initialScores);
    const comments: Record<string, string> = {};
    classPupils.forEach((p) => {
      const existing = getDb().results.find(
        (r) => r.pupilId === p.id && r.term === selectedTerm && r.year === selectedYear && r.grade === selectedGrade
      );
      if (existing?.classTeacherComment) comments[p.id] = existing.classTeacherComment;
    });
    setPupilBehaviourComments(comments);
  }

  function saveResults(publish: boolean) {
    if (!selectedGrade || !selectedSection || !selectedSubject) return;
    if (scores.some((s) => s.score === "" || s.score < 0 || s.score > 100)) {
      alert("All scores must be between 0 and 100.");
      return;
    }
    const db2 = getDb();
    // For each pupil, find or create a result for term/year/grade and add/update this subject score
    scores.forEach((sc) => {
      let result = db2.results.find(
        (r) => r.pupilId === sc.pupilId && r.term === selectedTerm && r.year === selectedYear && r.grade === selectedGrade
      );
      const existingScore = result?.scores.find((s) => s.subject === selectedSubject);
      const subjectScore: SubjectScore = {
        subject: selectedSubject,
        score: Number(sc.score),
        term: selectedTerm,
        year: selectedYear,
        teacherId: currentUser.id,
        teacherName: currentUser.fullName,
        comment: sc.comment,
        // Preserve published state if it was already published, unless we're explicitly publishing now
        published: publish ? true : (existingScore?.published ?? false),
        publishedAt: publish ? new Date().toISOString() : existingScore?.publishedAt,
      };
      if (!result) {
        result = {
          id: genId("res"),
          pupilId: sc.pupilId,
          term: selectedTerm,
          year: selectedYear,
          grade: selectedGrade as any,
          scores: [subjectScore],
          published: publish,
          publishedAt: publish ? new Date().toISOString() : undefined,
          publishedBy: publish ? currentUser.id : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db2.results.push(result);
      } else {
        const idx = result.scores.findIndex((s) => s.subject === selectedSubject);
        if (idx >= 0) {
          if (result.scores[idx].teacherId !== currentUser.id && !isAdmin) {
            // Teacher doesn't own this subject score
            return;
          }
          result.scores[idx] = subjectScore;
        } else {
          result.scores.push(subjectScore);
        }
        result.updatedAt = new Date().toISOString();
      }
      if (publish) {
        // Result-level published flag = true if any subject is published
        if (result.scores.some((s) => s.published)) {
          result.published = true;
          result.publishedAt = result.publishedAt || new Date().toISOString();
          result.publishedBy = currentUser.id;
        }
      }
      // Save class-teacher behaviour comment if provided
      const behaviourComment = pupilBehaviourComments[sc.pupilId]?.trim();
      if (behaviourComment) {
        result.classTeacherComment = behaviourComment;
        result.classTeacherId = currentUser.id;
      }
    });
    saveDb(db2);
    logActivity(currentUser.id, currentUser.fullName, currentUser.role, `${publish ? "Published" : "Saved"} ${selectedSubject} results`, `${selectedGrade}${selectedSection} ${selectedTerm} ${selectedYear}`);
    alert(publish ? `${selectedSubject} results published successfully. Pupils can now view/download these marks.` : "Draft results saved (not yet visible to pupils).");
    setScores([]);
    setRefreshKey((k) => k + 1);
  }

  function publishResult(r: Result) {
    // Admin can publish all; teachers can only publish their own subjects
    const db2 = getDb();
    const res = db2.results.find((x) => x.id === r.id);
    if (!res) return;
    if (isAdmin) {
      if (!confirm("Publish ALL entered subjects for this pupil? Pupils will see every subject with marks.")) return;
      res.scores.forEach((s) => { s.published = true; s.publishedAt = new Date().toISOString(); });
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Published all results for pupil (admin)`, r.id);
    } else {
      // Publish only subjects belonging to current teacher that are not yet published
      const mine = res.scores.filter((s) => s.teacherId === currentUser.id && !s.published);
      if (mine.length === 0) { alert("You have no unpublished subjects for this pupil."); return; }
      if (!confirm(`Publish your ${mine.length} subject(s) for this pupil? Pupils will see them immediately.`)) return;
      mine.forEach((s) => { s.published = true; s.publishedAt = new Date().toISOString(); });
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Published own subjects for pupil`, r.id);
    }
    if (res.scores.some((s) => s.published)) {
      res.published = true;
      res.publishedAt = new Date().toISOString();
      res.publishedBy = currentUser.id;
    }
    saveDb(db2);
    setRefreshKey((k) => k + 1);
  }

  function unpublishResult(r: Result) {
    if (!confirm("Unpublish all subjects for this pupil? Pupils will no longer see ANY of these marks until they are re-published.")) return;
    const db2 = getDb();
    const res = db2.results.find((x) => x.id === r.id);
    if (res) {
      res.scores.forEach((s) => { s.published = false; s.publishedAt = undefined; });
      res.published = false;
      res.publishedAt = undefined;
      saveDb(db2);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Unpublished all results for pupil`, r.id);
      setRefreshKey((k) => k + 1);
    }
  }

  function deleteSubjectScore(r: Result, subject: string) {
    const score = r.scores.find((s) => s.subject === subject);
    if (!score) return;
    if (!canEditSubject(r, subject)) {
      alert("You can only delete your own subject's scores, and only before they are published.");
      return;
    }
    if (!confirm(`Delete score for ${subject}?`)) return;
    const db2 = getDb();
    const res = db2.results.find((x) => x.id === r.id);
    if (res) {
      res.scores = res.scores.filter((s) => s.subject !== subject);
      // Recompute top-level published flag: published only if any remaining score is published
      res.published = res.scores.some((s) => s.published);
      if (res.scores.length === 0) {
        db2.results = db2.results.filter((x) => x.id !== r.id);
      }
      saveDb(db2);
      logActivity(currentUser.id, currentUser.fullName, currentUser.role, `Deleted score for ${subject}`);
      setRefreshKey((k) => k + 1);
    }
  }

  function viewResult(r: Result) {
    const p = db.users.find((u) => u.id === r.pupilId);
    setModal({ open: true, result: r, pupil: p || null, mode: "view" });
  }

  function downloadPDF(r: Result) {
    const p = db.users.find((u) => u.id === r.pupilId);
    if (!p) return;
    generateResultPDF(r, p, currentUser, db.settings);
    setRefreshKey((k) => k + 1);
  }

  // Subjects list for the teacher's class
  const availableSubjects = useMemo(() => {
    if (selectedGrade && ["8A", "8B", "9A", "9B"].includes(selectedGrade)) return JUNIOR_SUBJECTS;
    if (selectedGrade) return SENIOR_SUBJECTS;
    return [];
  }, [selectedGrade]);

  const teacherSubjects = currentUser.subjects || [];
  const teacherClasses = currentUser.classes || [];

  return (
    <div>
      <PageHeader
        title={isPupil ? "My Results" : "Results Management"}
        subtitle={isPupil ? "Only your published results are visible" : "Enter, publish, and download pupil results"}
      >
        {isTeacher && scores.length === 0 && (
          <Button variant="gold" onClick={() => { setModal({ open: true, result: null, pupil: null, mode: "enter" }); setScores([]); }}>
            + Enter Results
          </Button>
        )}
      </PageHeader>

      {!isPupil && (
        <Card className="mb-4">
          <h3 className="font-semibold mb-2 text-sm">Yengwe Grading System</h3>
          <div className="grid grid-cols-3 md:grid-cols-9 gap-2 text-[11px]">
            <div className="px-2 py-1 rounded bg-green-50 border border-green-200 text-green-900"><strong>1</strong> 75-100% Distinction</div>
            <div className="px-2 py-1 rounded bg-green-50 border border-green-200 text-green-900"><strong>2</strong> 70-74% Distinction</div>
            <div className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-900"><strong>3</strong> 65-69% Merit</div>
            <div className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-900"><strong>4</strong> 60-64% Merit</div>
            <div className="px-2 py-1 rounded bg-yellow-50 border border-yellow-200 text-yellow-900"><strong>5</strong> 55-59% Credit</div>
            <div className="px-2 py-1 rounded bg-yellow-50 border border-yellow-200 text-yellow-900"><strong>6</strong> 50-54% Credit</div>
            <div className="px-2 py-1 rounded bg-orange-50 border border-orange-200 text-orange-900"><strong>7</strong> 45-49% Satisfactory</div>
            <div className="px-2 py-1 rounded bg-orange-50 border border-orange-200 text-orange-900"><strong>8</strong> 40-44% Satisfactory</div>
            <div className="px-2 py-1 rounded bg-red-50 border border-red-200 text-red-900"><strong>9</strong> 0-39% Unsatisfactory</div>
          </div>
        </Card>
      )}

      {isTeacher && (
        <Card className="mb-4">
          <h3 className="font-semibold mb-2 text-sm">My Assigned Classes & Subjects</h3>
          <div className="flex flex-wrap gap-2">
            {teacherClasses.length === 0 && <span className="text-sm text-gray-500">No classes assigned yet.</span>}
            {teacherClasses.map((c, i) => (
              <Badge key={i} color="blue">{c.grade} - Section {c.section}</Badge>
            ))}
            {teacherSubjects.map((s, i) => (
              <Badge key={`s-${i}`} color="emerald">{s}</Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {!isPupil && <Input placeholder="Search pupil..." value={search} onChange={(e) => setSearch(e.target.value)} />}
          {!isPupil && (
            <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">All Grades</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          )}
          <Select value={termFilter} onChange={(e) => setTermFilter(e.target.value)}>
            <option value="">All Terms</option>
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </Select>
          <Select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            {Array.from({ length: 91 }, (_, i) => 2090 - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        {visibleResults.length === 0 ? (
          <EmptyState message={isPupil ? "No results published for you yet." : "No results found."} />
        ) : (
          <Table headers={!isPupil ? ["Pupil", "Grade", "Term/Year", "Subjects", "Avg", "Status", "Actions"] : ["Term/Year", "Grade", "Subjects", "Average", "Status", "Actions"]}>
            {visibleResults.map((r) => {
              const p = db.users.find((u) => u.id === r.pupilId);
              // For pupils, r.scores is already filtered to only published ones
              const publishedCount = isPupil ? r.scores.length : r.scores.filter((s) => s.published).length;
              const totalCount = isPupil ? r.scores.length : r.scores.length;
              const avg = r.scores.length > 0 ? r.scores.reduce((a, b) => a + b.score, 0) / r.scores.length : 0;
              const color = r.scores.length > 0 ? getPerformanceColor(avg) : "gray";
              const hasUnpublishedMine = !isPupil && r.scores.some((s) => s.teacherId === currentUser.id && !s.published);
              const allPublished = totalCount > 0 && publishedCount === totalCount;
              const nonePublished = publishedCount === 0;
              const canPublishAll = isAdmin || hasUnpublishedMine;
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  {!isPupil && <td className="px-4 py-3 font-medium">{p?.fullName || "Unknown"} <div className="text-xs text-gray-500">{p?.pupilId}</div></td>}
                  <td className="px-4 py-3"><Badge color="emerald">{r.grade}</Badge></td>
                  <td className="px-4 py-3 text-sm">{r.term}, {r.year}</td>
                  <td className="px-4 py-3 text-xs">
                    {isPupil ? (
                      <>{publishedCount} subject{publishedCount !== 1 ? "s" : ""}</>
                    ) : (
                      <><strong>{publishedCount}</strong> / {totalCount} published</>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {r.scores.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <StatusLight color={color as any} size="sm" /> {avg.toFixed(1)}%
                      </div>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isPupil ? (
                      <Badge color="green" pulse>Published to you</Badge>
                    ) : nonePublished ? (
                      <Badge color="yellow">Draft</Badge>
                    ) : allPublished ? (
                      <Badge color="green" pulse>All Published</Badge>
                    ) : (
                      <Badge color="blue">Partially published</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap text-xs">
                      <button onClick={() => viewResult(r)} className="text-blue-600 hover:text-blue-800 font-medium">View</button>
                      {publishedCount > 0 && <><span className="text-gray-300">|</span><button onClick={() => downloadPDF(r)} className="text-emerald-600 hover:text-emerald-800 font-medium">Download PDF</button></>}
                      {isAdmin && publishedCount > 0 && <><span className="text-gray-300">|</span><button onClick={() => unpublishResult(r)} className="text-orange-600 hover:text-orange-800 font-medium">Unpublish All</button></>}
                      {canPublishAll && <><span className="text-gray-300">|</span><button onClick={() => publishResult(r)} className="text-green-600 hover:text-green-800 font-medium">Publish</button></>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* Enter Results Modal */}
      <Modal open={modal.open && modal.mode === "enter"} onClose={() => { setModal({ ...modal, open: false }); setScores([]); }} title="Enter Subject Results" size="xl">
        {scores.length === 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Select label="Grade *" value={selectedGrade} onChange={(e) => { setSelectedGrade(e.target.value); setSelectedSubject(""); }}>
                <option value="">-- Select --</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Select label="Section" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </Select>
              <Select label="Subject *" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
                <option value="">-- Select --</option>
                {availableSubjects.map((s) => {
                  const assigned = currentUser.role === "headteacher" || currentUser.role === "deputy" || currentUser.role === "hod" || teacherSubjects.includes(s);
                  return <option key={s} value={s} disabled={!assigned && !!selectedGrade}>{s}{!assigned && " (not assigned to you)"}</option>;
                })}
              </Select>
              <Select label="Term" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </Select>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Year</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border text-sm bg-white">
                  {Array.from({ length: 91 }, (_, i) => 2090 - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-3 rounded bg-blue-50 border border-blue-200 text-sm text-blue-900">
              <strong>Per-subject publishing:</strong> You can publish this subject's marks immediately after entry — you do not need to wait for other teachers or subjects. Pupils will see only the subjects that have been published.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModal({ ...modal, open: false })}>Cancel</Button>
              <Button variant="gold" onClick={loadPupilsForEntry}>Load Class</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50 p-3 rounded-lg">
              <div>
                <div className="font-semibold">{selectedSubject}</div>
                <div className="text-sm text-gray-600">Grade {selectedGrade} - Section {selectedSection} • {selectedTerm} {selectedYear}</div>
              </div>
              <Badge color="blue">{scores.length} pupils</Badge>
            </div>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-left">Pupil Name</th>
                    <th className="px-3 py-2 text-left w-28">Score (0-100)</th>
                    <th className="px-3 py-2 text-left">Behaviour / Class-Teacher Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((sc, i) => (
                    <tr key={sc.pupilId} className="border-t align-top">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2">{sc.pupilName}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={sc.score}
                          onChange={(e) => {
                            const v = e.target.value;
                            const newScores = [...scores];
                            newScores[i].score = v === "" ? "" : Math.max(0, Math.min(100, Number(v)));
                            setScores(newScores);
                          }}
                          className="w-24 px-2 py-1 rounded border text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <textarea
                          rows={2}
                          value={pupilBehaviourComments[sc.pupilId] || ""}
                          onChange={(e) => setPupilBehaviourComments((prev) => ({ ...prev, [sc.pupilId]: e.target.value }))}
                          placeholder="Comment on behaviour, conduct, attitude..."
                          className="w-full px-2 py-1 rounded border text-sm resize-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-2 pt-2 flex-wrap">
              <Button variant="ghost" onClick={() => setScores([])}>← Back</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => saveResults(false)}>💾 Save Draft (only you can see)</Button>
                <Button variant="success" onClick={() => saveResults(true)}>🚀 Publish This Subject To Pupils</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* View Result Modal */}
      <Modal open={modal.open && modal.mode === "view"} onClose={() => setModal({ ...modal, open: false })} title={`Result Details - ${modal.pupil?.fullName || ""}`} size="lg">
        {modal.result && modal.pupil && (() => {
          const displayScores = modal.result.scores;
          const avg = displayScores.length > 0 ? displayScores.reduce((a, b) => a + b.score, 0) / displayScores.length : 0;
          const c = displayScores.length > 0 ? getPerformanceColor(avg) : "gray";
          const publishedCount = displayScores.filter((s) => s.published).length;
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3 bg-gray-50 p-4 rounded-lg">
                <div>
                  <div className="font-bold text-lg">{modal.pupil.fullName}</div>
                  <div className="text-sm text-gray-600">Grade {modal.result.grade} • Section {modal.pupil.classSection || "A"} • {modal.result.term} {modal.result.year}</div>
                </div>
                <div className="flex items-center gap-2">
                  {displayScores.length > 0 ? (
                    <><StatusLight color={c as any} size="md" /><span className="font-bold text-xl">{avg.toFixed(1)}%</span></>
                  ) : <span className="text-gray-400 text-sm">No scores</span>}
                </div>
              </div>
              <Table headers={["Subject", "Score", "Status", "Grade", "Remark", "Teacher", ""]}>
                {displayScores.map((s) => {
                  const yg = yengweGrade(s.score);
                  const gradeColor = s.score >= 60 ? "green" : s.score >= 40 ? "yellow" : "red";
                  const canDelete = !isPupil && canEditSubject(modal.result!, s.subject);
                  return (
                    <tr key={s.subject}>
                      <td className="px-4 py-2 font-medium">{s.subject}</td>
                      <td className="px-4 py-2"><strong>{s.score}%</strong></td>
                      <td className="px-4 py-2">
                        {isPupil ? (
                          <Badge color="green" pulse>Published</Badge>
                        ) : s.published ? (
                          <Badge color="green" pulse>Published</Badge>
                        ) : (
                          <Badge color="yellow">Draft</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2"><Badge color={gradeColor as any}>Grade {yg.grade}</Badge></td>
                      <td className="px-4 py-2 text-xs">{yg.name}</td>
                      <td className="px-4 py-2 text-xs">{s.teacherName}</td>
                      <td className="px-4 py-2">
                        {canDelete && (
                          <button onClick={() => { deleteSubjectScore(modal.result!, s.subject); setModal({ ...modal, open: false }); }} className="text-red-600 text-xs">Delete</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
              {modal.result!.classTeacherComment && (
                <div className="mt-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                  <div className="text-xs font-semibold text-emerald-800 mb-1">Class Teacher's Comment (Behaviour &amp; Attitude):</div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{modal.result!.classTeacherComment}</p>
                </div>
              )}

              {isPupil ? (
                <div className="flex justify-end">
                  <Button variant="gold" onClick={() => downloadPDF(modal.result!)}>📥 Download My Results (PDF)</Button>
                </div>
              ) : publishedCount > 0 ? (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-gray-600">
                    <strong>{publishedCount}</strong> of {displayScores.length} subject{publishedCount === 1 ? "" : "s"} published to pupils. PDF includes only published subjects & uses the Yengwe 9-point grading system.
                  </div>
                  <Button variant="gold" onClick={() => downloadPDF(modal.result!)}>📥 Download PDF</Button>
                </div>
              ) : (
                <div className="p-3 rounded bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                  These results are still in draft. Pupils cannot see them yet. Each teacher can publish their own subject independently as soon as marks are entered — no need to wait for other subjects.
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
