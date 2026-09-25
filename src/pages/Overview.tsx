import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, ChevronRight, GraduationCap, Library, Megaphone, NotebookPen, Users, type LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Card, Badge, StatusLight } from "../components/ui";
import { getDb, useDbVersion } from "../utils/db";
import { supabase } from "../lib/supabase";
import { getPerformanceColor, JUNIOR_SUBJECTS, SENIOR_SUBJECTS } from "../data/constants";

interface SchoolStats { pupils: number; teachers: number; hods: number; publishedResults: number; schoolAvg: number }

const STAT_TONES = {
  emerald: "bg-emerald-100 text-emerald-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
};

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: LucideIcon; tone: keyof typeof STAT_TONES }) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${STAT_TONES[tone]}`}>
        <Icon className="w-6 h-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
        <div className="text-xs text-gray-500 uppercase tracking-wide truncate">{label}</div>
      </div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, children, onMore }: { icon: LucideIcon; children: React.ReactNode; onMore?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Icon className="w-4 h-4 text-emerald-700" />{children}</h3>
      {onMore && <button onClick={onMore} className="text-xs font-medium text-emerald-700 hover:text-emerald-900 inline-flex items-center">View all<ChevronRight className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

export default function Overview({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { user } = useAuth();
  const version = useDbVersion();
  const [school, setSchool] = useState<SchoolStats | null>(null);

  useEffect(() => {
    supabase.rpc("get_school_stats").then(({ data }) => { if (data) setSchool(data as SchoolStats); });
  }, [version]);

  const stats = useMemo(() => {
    const db = getDb();
    if (!user) return null;
    const myPublished = db.results.filter((r) => r.pupilId === user.id).flatMap((r) => r.scores.filter((s) => s.published).map((s) => s.score));
    const pupilAvg = myPublished.length > 0 ? myPublished.reduce((a, b) => a + b, 0) / myPublished.length : 0;
    const recentNotices = [...db.notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    const homework = user.role === "pupil"
      ? db.homework.filter((h) => h.grade === user.grade && h.section === (user.classSection || "A"))
      : db.homework.filter((h) => h.teacherId === user.id);
    const upcoming = [...homework].filter((h) => new Date(h.dueDate) >= new Date(new Date().toDateString())).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return { pupilAvg, recentNotices, homework, upcoming };
  }, [user, version]);

  if (!user || !stats) return null;

  const schoolAvg = Number(school?.schoolAvg ?? 0);
  const schoolStatus = schoolAvg === 0 ? "gray" : getPerformanceColor(schoolAvg);
  const isJunior = !!user.grade && ["8A", "8B", "9A", "9B"].includes(user.grade);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user.fullName.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, "").split(" ")[0];
  const roleLine: Record<string, string> = {
    headteacher: "Headteacher", deputy: "Deputy Headteacher", hod: `Head of ${user.hodDepartment || "Department"}`,
    teacher: "Teacher", pupil: user.grade ? `Grade ${user.grade}${user.classSection ? ` · Section ${user.classSection}` : ""}` : "Pupil",
  };

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-700 to-emerald-900 text-white rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-5 shadow-lg">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-yellow-400/10" aria-hidden />
        <div className="relative">
          <p className="text-emerald-200 text-sm">{greeting},</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{firstName}</h2>
          <p className="text-emerald-100 text-sm mt-1">{roleLine[user.role]} · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="relative bg-white/10 backdrop-blur rounded-xl px-5 py-3.5 ring-1 ring-white/20 w-full md:w-auto">
          <div className="text-[11px] uppercase tracking-wider text-emerald-100 mb-1.5">School performance</div>
          <div className="flex items-center gap-3">
            <StatusLight color={schoolStatus} size="lg" />
            <div>
              <div className="font-bold text-lg leading-tight">
                {schoolStatus === "green" ? "Performing well" : schoolStatus === "yellow" ? "Needs attention" : schoolStatus === "red" ? "Below standard" : "No data yet"}
              </div>
              <div className="text-xs text-emerald-100">School average {schoolAvg.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      {user.role === "pupil" && (
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">Your academic standing</h3>
              <p className="text-sm text-gray-500">Average across all your published results</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusLight size="lg" color={stats.pupilAvg === 0 ? "gray" : getPerformanceColor(stats.pupilAvg)} />
              <div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">{stats.pupilAvg.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">
                  {stats.pupilAvg === 0 ? "No results published yet" : stats.pupilAvg >= 65 ? "Excellent — keep it up!" : stats.pupilAvg >= 50 ? "Good. You can do even better!" : "Let's work on improving this"}
                </div>
              </div>
            </div>
          </div>
          <div className={`h-2 rounded-full mt-4 ${stats.pupilAvg < 50 ? "bg-red-100" : stats.pupilAvg < 65 ? "bg-yellow-100" : "bg-green-100"}`}>
            <div className={`h-full rounded-full transition-all duration-700 ${stats.pupilAvg < 50 ? "bg-red-500" : stats.pupilAvg < 65 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(stats.pupilAvg, 100)}%` }} />
          </div>
        </Card>
      )}

      {user.role !== "pupil" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Pupils" value={school?.pupils ?? "—"} icon={GraduationCap} tone="emerald" />
          <StatCard label="Teachers" value={school?.teachers ?? "—"} icon={Users} tone="blue" />
          <StatCard label="Heads of dept" value={school?.hods ?? "—"} icon={Library} tone="amber" />
          <StatCard label="Published results" value={school?.publishedResults ?? "—"} icon={BarChart3} tone="purple" />
        </div>
      )}

      {(user.role === "teacher" || user.role === "hod") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">My classes</h3>
            {(user.classes || []).length === 0 ? (
              <p className="text-sm text-gray-500">No classes assigned yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(user.classes || []).map((c, i) => <Badge key={i} color="blue">{c.grade} · Section {c.section}</Badge>)}
              </div>
            )}
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">My subjects</h3>
            {(user.subjects || []).length === 0 ? (
              <p className="text-sm text-gray-500">No subjects assigned yet. Your HoD will assign them.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(user.subjects || []).map((s, i) => <Badge key={i} color="emerald">{s}</Badge>)}
              </div>
            )}
          </Card>
        </div>
      )}

      {user.role === "hod" && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-1">Department: {user.hodDepartment}</h3>
          <p className="text-sm text-gray-500">Assign subjects and classes to teachers from the <button onClick={() => onNavigate?.("teachers")} className="text-emerald-700 font-medium hover:underline">Teachers</button> page.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={Megaphone} onMore={() => onNavigate?.("notices")}>Latest notices</SectionTitle>
          {stats.recentNotices.length === 0 ? (
            <p className="text-sm text-gray-500">No notices yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentNotices.map((n) => (
                <div key={n.id} className="border-l-4 border-emerald-500 pl-3 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm text-gray-900">{n.title}</div>
                    <Badge color={n.category === "event" ? "blue" : n.category === "academic" ? "emerald" : "gray"} className="capitalize">{n.category}</Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{n.content}</p>
                  <div className="text-[11px] text-gray-400 mt-1">{n.postedByName} · {new Date(n.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle icon={NotebookPen} onMore={() => onNavigate?.("homework")}>{user.role === "pupil" ? "Upcoming homework" : "My homework"}</SectionTitle>
          {user.role === "pupil" ? (
            stats.upcoming.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing due. Enjoy your free time!</p>
            ) : (
              <div className="space-y-3">
                {stats.upcoming.slice(0, 4).map((h) => (
                  <div key={h.id} className="border-l-4 border-amber-500 pl-3 py-0.5">
                    <div className="font-medium text-sm text-gray-900">{h.title}</div>
                    <div className="text-xs text-gray-500">{h.subject} · Due {new Date(h.dueDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-sm text-gray-600">You have posted <strong className="text-gray-900">{stats.homework.length}</strong> assignment{stats.homework.length === 1 ? "" : "s"}, <strong className="text-gray-900">{stats.upcoming.length}</strong> still open.</p>
          )}
        </Card>
      </div>

      {user.role === "pupil" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <SectionTitle icon={BookOpen}>Your subjects · {isJunior ? "Junior Secondary" : "Senior Secondary"}</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {(isJunior ? JUNIOR_SUBJECTS : SENIOR_SUBJECTS).map((s) => <Badge key={s} color="emerald">{s}</Badge>)}
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Quick info</h3>
            <dl className="space-y-2 text-sm">
              {([["Grade", user.grade], ["Class section", user.classSection || "A"], ["Pupil ID", user.pupilId || "N/A"], ["Province", user.province], ["District", user.district]] as [string, string | undefined][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-gray-500">{k}</dt><dd className="font-medium text-gray-900 text-right">{v || "—"}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}
