import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Bell, BookOpen, Building2, ChevronsLeft, ChevronsRight, ClipboardList, Cloud, CloudOff, Download, GraduationCap,
  LayoutDashboard, Loader2, LogOut, Megaphone, Menu, MessageSquare, Settings, UserRound, Users, X, type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { peekDb, useDbVersion, useSyncStatus } from "../utils/db";
import { Avatar } from "./ui";
import type { Role } from "../data/constants";

interface NavItem { id: string; label: string; icon: LucideIcon; roles: Role[] }

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "biography", label: "About School", icon: Building2, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "profile", label: "My Profile", icon: UserRound, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "pupils", label: "Pupils", icon: GraduationCap, roles: ["headteacher", "deputy", "hod", "teacher"] },
  { id: "teachers", label: "Teachers & HoDs", icon: Users, roles: ["headteacher", "deputy", "hod"] },
  { id: "results", label: "Results", icon: BarChart3, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "messages", label: "Messages & Calls", icon: MessageSquare, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "homework", label: "Homework", icon: BookOpen, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "notices", label: "Notice Board", icon: Megaphone, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "downloads", label: "Download Logs", icon: Download, roles: ["headteacher"] },
  { id: "activity", label: "Activity Logs", icon: ClipboardList, roles: ["headteacher"] },
  { id: "updates", label: "System Updates", icon: Bell, roles: ["headteacher", "deputy", "hod", "teacher", "pupil"] },
  { id: "settings", label: "Settings", icon: Settings, roles: ["headteacher", "deputy"] },
];

const ROLE_GRADIENT: Record<Role, string> = {
  headteacher: "from-emerald-700 to-emerald-900",
  deputy: "from-emerald-600 to-emerald-800",
  hod: "from-amber-600 to-amber-800",
  teacher: "from-blue-600 to-blue-800",
  pupil: "from-gray-600 to-gray-800",
};

export const ROLE_LABEL: Record<Role, string> = {
  headteacher: "Headteacher",
  deputy: "Deputy Headteacher",
  hod: "Head of Department",
  teacher: "Teacher",
  pupil: "Pupil",
};

const COLLAPSE_KEY = "ypms.sidebarCollapsed";

export default function DashboardLayout({ children, activeTab, setActiveTab, title }: { children: ReactNode; activeTab: string; setActiveTab: (s: string) => void; title: string }) {
  const { user, logout } = useAuth();
  useDbVersion();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  if (!user) return null;
  const db = peekDb();
  const logo = db.settings.schoolLogo;
  const allowedNav = NAV_ITEMS.filter((n) => n.roles.includes(user.role));
  const unreadMessages = db.messages.filter((m) => m.toId === user.id && !m.read && m.kind === "message").length;

  function go(id: string) {
    setActiveTab(id);
    setMobileOpen(false);
  }

  const sidebar = (isMobile: boolean) => {
    const showLabels = isMobile || !collapsed;
    return (
      <div className={`h-full flex flex-col bg-gradient-to-b ${ROLE_GRADIENT[user.role]} text-white`}>
        <div className="h-16 px-4 border-b border-white/15 flex items-center gap-3 flex-shrink-0">
          {logo ? (
            <img src={logo} alt="" className="w-10 h-10 rounded-full object-contain bg-white p-0.5 flex-shrink-0 shadow" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0 shadow">
              <span className="text-emerald-900 font-bold text-xl font-serif">Y</span>
            </div>
          )}
          {showLabels && (
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm tracking-wide leading-tight">YPMS</div>
              <div className="text-[11px] text-white/70 truncate">Yengwe Secondary School</div>
            </div>
          )}
          {isMobile && (
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-2 -mr-2 rounded-lg hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav aria-label="Main" className="flex-1 p-2.5 space-y-0.5 overflow-y-auto scrollbar-thin">
          {allowedNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                aria-current={active ? "page" : undefined}
                title={showLabels ? undefined : item.label}
                className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 ${
                  active ? "bg-white/20 font-semibold shadow-inner" : "text-white/85 hover:bg-white/10 hover:text-white"
                } ${showLabels ? "" : "justify-center"}`}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-yellow-400" aria-hidden />}
                <Icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden />
                {showLabels && <span className="truncate flex-1 text-left">{item.label}</span>}
                {item.id === "messages" && unreadMessages > 0 && (
                  <span className={`bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${showLabels ? "" : "absolute top-1 right-1"}`}>
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-2.5 border-t border-white/15 space-y-0.5">
          {!isMobile && (
            <button onClick={() => setCollapsed(!collapsed)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors ${showLabels ? "" : "justify-center"}`} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronsRight className="w-[18px] h-[18px]" /> : <ChevronsLeft className="w-[18px] h-[18px]" />}
              {showLabels && <span>Collapse</span>}
            </button>
          )}
          <button onClick={logout} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-red-500/30 hover:text-white transition-colors ${showLabels ? "" : "justify-center"}`} title={showLabels ? undefined : "Sign out"}>
            <LogOut className="w-[18px] h-[18px]" />
            {showLabels && <span>Sign out</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:block fixed inset-y-0 left-0 z-30 shadow-xl transition-[width] duration-200 ${collapsed ? "w-20" : "w-64"}`}>
        {sidebar(false)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-gray-950/50 animate-overlayIn" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl animate-pageIn">{sidebar(true)}</aside>
        </div>
      )}

      <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-20 h-16 bg-white/90 backdrop-blur border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate leading-tight">{title}</h1>
              <p className="hidden sm:block text-xs text-gray-500 truncate">Yengwe Secondary School · Rise &amp; Shine</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <SyncIndicator />
            <button onClick={() => go("profile")} className="flex items-center gap-3 rounded-full sm:rounded-lg sm:pl-3 sm:pr-1 sm:py-1 hover:bg-gray-50 transition-colors">
              <div className="text-right hidden md:block">
                <div className="text-sm font-semibold text-gray-900 leading-tight max-w-[200px] truncate">{user.fullName}</div>
                <div className="text-xs text-emerald-700 font-medium">{ROLE_LABEL[user.role]}</div>
              </div>
              <Avatar name={user.fullName} src={user.profilePicture} className="ring-2 ring-emerald-600 ring-offset-1" />
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {children}
        </main>

        <footer className="border-t border-gray-200 bg-white px-4 sm:px-6 py-3 text-xs text-gray-500 flex flex-col sm:flex-row justify-between gap-1">
          <div>Headteacher: <strong className="text-emerald-800 font-medium">{db.settings.headteacherName}</strong>
            {db.settings.deputyName && <> · Deputy: <strong className="text-emerald-800 font-medium">{db.settings.deputyName}</strong></>}
          </div>
          <div>© {new Date().getFullYear()} Yengwe Secondary School · <strong className="text-emerald-800 font-medium">{db.settings.systemDomain || "smart yengwe.sch"}</strong></div>
        </footer>
      </div>
    </div>
  );
}

function SyncIndicator() {
  const status = useSyncStatus();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (!online) {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600"><CloudOff className="w-4 h-4" /><span className="hidden sm:inline">Offline</span></span>;
  }
  if (status === "saving") {
    return <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Saving…</span></span>;
  }
  return <span className="inline-flex items-center gap-1.5 text-xs text-gray-400" title="All changes saved"><Cloud className="w-4 h-4" /><span className="hidden sm:inline">Saved</span></span>;
}
