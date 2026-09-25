import { useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { getDb } from "../utils/db";
import type { Role } from "../data/constants";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: "🏠", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "biography", label: "About School", icon: "🏫", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "profile", label: "My Profile", icon: "👤", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "pupils", label: "Pupils", icon: "🎓", roles: ["headteacher", "deputy", "hod", "teacher"] },
  { id: "teachers", label: "Teachers & HoDs", icon: "👨‍🏫", roles: ["headteacher", "deputy", "hod"] },
  { id: "results", label: "Results", icon: "📊", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "messages", label: "Messages & Calls", icon: "💬", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "homework", label: "Homework", icon: "📝", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "notices", label: "Notice Board", icon: "📢", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "downloads", label: "Download Logs", icon: "📥", roles: ["headteacher"] },
  { id: "activity", label: "Activity Logs", icon: "📋", roles: ["headteacher"] },
  { id: "updates", label: "System Updates", icon: "⚙️", roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "settings", label: "Settings", icon: "🔧", roles: ["headteacher", "deputy"] },
];

export default function DashboardLayout({ children, activeTab, setActiveTab, title }: { children: ReactNode; activeTab: string; setActiveTab: (s: string) => void; title: string }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const db = getDb();
  const logo = db.settings.schoolLogo;

  if (!user) return null;

  const allowedNav = NAV_ITEMS.filter((n) => {
    if (n.id === "teachers") return user.role === "headteacher" || user.role === "deputy";
    if (n.id === "pupils") return user.role !== "pupil";
    if (n.id === "downloads" || n.id === "activity") return user.role === "headteacher";
    if (n.id === "updates") return true;
    if (n.id === "settings") return user.role === "headteacher" || user.role === "deputy";
    return n.roles.includes(user.role);
  });

  const roleColor: Record<Role, string> = {
    headteacher: "from-emerald-700 to-emerald-900",
    deputy: "from-emerald-600 to-emerald-800",
    hod: "from-amber-600 to-amber-800",
    teacher: "from-blue-600 to-blue-800",
    pupil: "from-gray-600 to-gray-800",
  };

  const roleLabel: Record<Role, string> = {
    headteacher: "Headteacher",
    deputy: "Deputy Headteacher",
    hod: "Head of Department",
    teacher: "Teacher",
    pupil: "Pupil",
  };

  const unreadMessages = db.messages.filter((m) => m.toId === user.id && !m.read && m.kind === "message").length;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-20"} transition-all duration-200 bg-gradient-to-b ${roleColor[user.role]} text-white flex flex-col shadow-xl`}>
        <div className="p-4 border-b border-white/20 flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="Logo" className="w-10 h-10 rounded-full object-contain bg-white p-0.5 flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-900 font-bold text-xl font-serif">Y</span>
            </div>
          )}
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="font-bold text-sm truncate leading-tight">YPMS</div>
              <div className="text-[10px] text-white/70 truncate">Yengwe Secondary</div>
            </div>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {allowedNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${activeTab === item.id ? "bg-white/20 font-semibold shadow-inner" : "hover:bg-white/10"}`}
              title={item.label}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate flex-1 text-left">{item.label}</span>}
              {item.id === "messages" && unreadMessages > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {unreadMessages}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-white/20">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors" title="Toggle sidebar">
            <span className="text-lg">{sidebarOpen ? "◀" : "▶"}</span>
            {sidebarOpen && <span>Collapse</span>}
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-red-500/40 transition-colors mt-1">
            <span className="text-lg">🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            <p className="text-xs text-gray-500">School: Yengwe Secondary School • Motto: Rise &amp; Shine</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-gray-900">{user.fullName}</div>
              <div className="text-xs text-emerald-700 font-medium">{roleLabel[user.role]}</div>
            </div>
            {user.profilePicture ? (
              <img src={user.profilePicture} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-emerald-600" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-bold text-sm">
                {user.fullName.charAt(0)}
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 p-6 overflow-auto">
          {children}
        </div>

        <footer className="bg-white border-t border-gray-200 px-6 py-3 text-xs text-gray-500 flex flex-col sm:flex-row justify-between gap-2">
          <div>Headteacher: <strong className="text-emerald-800">{db.settings.headteacherName}</strong></div>
          <div>
            {db.settings.deputyName && <>Deputy: <strong className="text-emerald-800">{db.settings.deputyName}</strong> • </>}
            Domain: <strong className="text-emerald-800">{db.settings.systemDomain || "smart yengwe.sch"}</strong>
          </div>
        </footer>
      </main>
    </div>
  );
}
