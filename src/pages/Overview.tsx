import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, Badge, StatusLight } from "../components/ui";
import { getDb } from "../utils/db";
import { getPerformanceColor, JUNIOR_SUBJECTS, SENIOR_SUBJECTS } from "../data/constants";

export default function Overview() {
  const { user } = useAuth();
  if (!user) return null;
  const db = getDb();

  const stats = useMemo(() => {
    const pupils = db.users.filter((u) => u.role === "pupil");
    const teachers = db.users.filter((u) => u.role === "teacher" || u.role === "hod");
    const hods = db.users.filter((u) => u.role === "hod");
    const publishedResults = db.results.filter((r) => r.published);

    // school overall average from published results
    let totalSum = 0;
    let totalCount = 0;
    publishedResults.forEach((r) => {
      r.scores.forEach((s) => {
        totalSum += s.score;
        totalCount++;
      });
    });
    const schoolAvg = totalCount > 0 ? totalSum / totalCount : 0;
    const schoolStatus = schoolAvg === 0 ? "gray" : getPerformanceColor(schoolAvg);

    // personal average for pupils
    let pupilAvg = 0;
    if (user.role === "pupil") {
      const myResults = publishedResults.filter((r) => r.pupilId === user.id);
      const myScores = myResults.flatMap((r) => r.scores.map((s) => s.score));
      pupilAvg = myScores.length > 0 ? myScores.reduce((a, b) => a + b, 0) / myScores.length : 0;
    }

    // classes for teacher
    const myClasses = (user.role === "teacher" || user.role === "hod") ? user.classes || [] : [];
    const mySubjects = (user.role === "teacher" || user.role === "hod") ? user.subjects || [] : [];

    const recentNotices = [...db.notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    const pendingHomework = user.role === "pupil"
      ? db.homework.filter((h) => h.grade === user.grade && h.section === (user.classSection || "A"))
      : db.homework.filter((h) => h.teacherId === user.id);

    return { pupils, teachers, hods, publishedResults, schoolAvg, schoolStatus, pupilAvg, myClasses, mySubjects, recentNotices, pendingHomework };
  }, [user, db]);

  const roleWelcome: Record<string, string> = {
    headteacher: "Welcome, Headteacher",
    deputy: "Welcome, Deputy Headteacher",
    hod: "Welcome, Head of Department",
    teacher: "Welcome, Teacher",
    pupil: "Welcome back, Pupil",
  };

  function StatCard({ label, value, icon, color = "emerald" }: { label: string; value: string | number; icon: string; color?: string }) {
    return (
      <Card className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-${color}-100 text-${color}-700 flex items-center justify-center text-2xl`}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-lg">
        <div>
          <h2 className="text-2xl font-bold">{roleWelcome[user.role]}</h2>
          <p className="text-emerald-100 mt-1">{user.fullName}</p>
          <p className="text-emerald-200 text-sm mt-1">
            {user.grade ? `Grade ${user.grade}${user.classSection ? " - Class " + user.classSection : ""}` : ""}
            {user.hodDepartment ? `Head of ${user.hodDepartment} Department` : ""}
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-xl px-5 py-3 border border-white/20">
          <div className="text-xs uppercase tracking-wide text-emerald-100 mb-1">System Status</div>
          <div className="flex items-center gap-3">
            <StatusLight color={stats.schoolStatus === "green" ? "green" : stats.schoolStatus === "yellow" ? "yellow" : stats.schoolStatus === "red" ? "red" : "gray"} size="lg" />
            <div>
              <div className="font-bold text-lg">
                {stats.schoolStatus === "green" ? "Performance Good" : stats.schoolStatus === "yellow" ? "Needs Attention" : stats.schoolStatus === "red" ? "Below Standard" : "No Data Yet"}
              </div>
              <div className="text-xs text-emerald-100">School Average: {stats.schoolAvg.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      {user.role === "pupil" && (
        <Card className="border-l-4" >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">Your Academic Standing</h3>
              <p className="text-sm text-gray-600">Current average across all published results</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusLight
                size="lg"
                color={stats.pupilAvg === 0 ? "gray" : getPerformanceColor(stats.pupilAvg) as any}
              />
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.pupilAvg.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">
                  {stats.pupilAvg === 0 ? "No results published yet" :
                    stats.pupilAvg >= 65 ? "Excellent! Keep it up." :
                    stats.pupilAvg >= 50 ? "You can do better!" : "Needs urgent improvement"}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {user.role === "pupil" && (
        <div>
          <div className={`h-2 rounded-full mb-2 ${stats.pupilAvg < 50 ? "bg-red-100" : stats.pupilAvg < 65 ? "bg-yellow-100" : "bg-green-100"}`}>
            <div
              className={`h-full rounded-full transition-all ${stats.pupilAvg < 50 ? "bg-red-500" : stats.pupilAvg < 65 ? "bg-yellow-500" : "bg-green-500"}`}
              style={{ width: `${Math.min(stats.pupilAvg, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats grid for admin/teacher */}
      {user.role !== "pupil" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Pupils" value={stats.pupils.length} icon="🎓" color="emerald" />
          <StatCard label="Teachers" value={stats.teachers.length} icon="👨‍🏫" color="blue" />
          <StatCard label="Heads of Dept" value={stats.hods.length} icon="📚" color="amber" />
          <StatCard label="Published Results" value={stats.publishedResults.length} icon="📊" color="purple" />
        </div>
      )}

      {(user.role === "teacher" || user.role === "hod") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">My Classes</h3>
            {stats.myClasses.length === 0 ? (
              <p className="text-sm text-gray-500">No classes assigned yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.myClasses.map((c, i) => (
                  <Badge key={i} color="blue">{c.grade} - Section {c.section}</Badge>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">My Subjects</h3>
            {stats.mySubjects.length === 0 ? (
              <p className="text-sm text-gray-500">No subjects assigned yet. The HoD will assign subjects.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.mySubjects.map((s, i) => (
                  <Badge key={i} color="emerald">{s}</Badge>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {user.role === "hod" && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-2">Department: {user.hodDepartment}</h3>
          <p className="text-sm text-gray-600">You can assign subjects to teachers in your department from the Teachers tab.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">📢 Latest Notices</h3>
          {stats.recentNotices.length === 0 ? (
            <p className="text-sm text-gray-500">No notices yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentNotices.map((n) => (
                <div key={n.id} className="border-l-4 border-emerald-500 pl-3 py-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{n.title}</div>
                    <Badge color={n.category === "event" ? "blue" : n.category === "academic" ? "emerald" : "gray"}>{n.category}</Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{n.content}</p>
                  <div className="text-[10px] text-gray-400 mt-1">{n.postedByName} • {new Date(n.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">📝 Homework</h3>
          {user.role === "pupil" ? (
            stats.pendingHomework.length === 0 ? (
              <p className="text-sm text-gray-500">No homework posted for your class.</p>
            ) : (
              <div className="space-y-3">
                {stats.pendingHomework.slice(0, 4).map((h) => (
                  <div key={h.id} className="border-l-4 border-amber-500 pl-3 py-1">
                    <div className="font-medium text-sm">{h.title}</div>
                    <div className="text-xs text-gray-600">{h.subject} • Due {new Date(h.dueDate).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-sm text-gray-600">You have <strong>{stats.pendingHomework.length}</strong> homework assignments posted. Go to Homework tab to manage.</p>
          )}
        </Card>
      </div>

      {user.role === "pupil" && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">📚 Your Subjects</h3>
          <p className="text-sm text-gray-600 mb-2">
            {user.grade && ["8A", "8B", "9A", "9B"].includes(user.grade)
              ? "Junior Secondary" : "Senior Secondary"} Subjects
          </p>
          <div className="flex flex-wrap gap-2">
            {(user.grade && ["8A", "8B", "9A", "9B"].includes(user.grade) ? JUNIOR_SUBJECTS : SENIOR_SUBJECTS).map((s) => (
              <Badge key={s} color="emerald">{s}</Badge>
            ))}
          </div>
        </Card>
      )}

      {user.role === "pupil" && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-2">Quick Info</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Grade:</span> <strong>{user.grade}</strong></div>
            <div><span className="text-gray-500">Class Section:</span> <strong>{user.classSection || "A"}</strong></div>
            <div><span className="text-gray-500">Pupil ID:</span> <strong>{user.pupilId || "N/A"}</strong></div>
            <div><span className="text-gray-500">Province/District:</span> <strong>{user.province || "-"} / {user.district || "-"}</strong></div>
          </div>
        </Card>
      )}
    </div>
  );
}
