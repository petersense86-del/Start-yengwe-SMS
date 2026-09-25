import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import DashboardLayout from "./components/DashboardLayout";
import { FeedbackHost, toast } from "./components/feedback";
import { Spinner } from "./components/ui";
import { onSyncError, refreshData } from "./utils/db";
import Overview from "./pages/Overview";
import Profile from "./pages/Profile";
import Pupils from "./pages/Pupils";
import Teachers from "./pages/Teachers";
import Results from "./pages/Results";
import Homework from "./pages/Homework";
import Notices from "./pages/Notices";
import { DownloadLogs, ActivityLogs, SystemUpdates, SettingsPage } from "./pages/AdminPages";
import Biography from "./pages/Biography";
import Messages from "./pages/Messages";

const TITLES: Record<string, string> = {
  overview: "Dashboard",
  biography: "About School",
  messages: "Messages & Calls",
  profile: "My Profile",
  pupils: "Pupils",
  teachers: "Teachers & HoDs",
  results: "Results",
  homework: "Homework",
  notices: "Notice Board",
  downloads: "Download Logs",
  activity: "Activity Logs",
  updates: "System Updates",
  settings: "Settings",
};

function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    document.title = `${TITLES[activeTab] || "Dashboard"} · YPMS`;
  }, [activeTab]);

  if (!user) return null;

  function changeTab(tab: string) {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
    // Pick up changes made on other devices.
    refreshData().catch(() => undefined);
  }

  function renderContent() {
    switch (activeTab) {
      case "overview": return <Overview onNavigate={changeTab} />;
      case "biography": return <Biography />;
      case "messages": return <Messages />;
      case "profile": return <Profile />;
      case "pupils":
        if (user!.role === "pupil") return <ForbiddenPage />;
        return <Pupils />;
      case "teachers":
        if (user!.role === "pupil" || user!.role === "teacher") return <ForbiddenPage />;
        return <Teachers />;
      case "results": return <Results />;
      case "homework": return <Homework />;
      case "notices": return <Notices />;
      case "downloads":
        if (user!.role !== "headteacher") return <ForbiddenPage />;
        return <DownloadLogs />;
      case "activity":
        if (user!.role !== "headteacher") return <ForbiddenPage />;
        return <ActivityLogs />;
      case "updates": return <SystemUpdates />;
      case "settings":
        if (user!.role !== "headteacher" && user!.role !== "deputy") return <ForbiddenPage />;
        return <SettingsPage />;
      default: return <Overview onNavigate={changeTab} />;
    }
  }

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={changeTab} title={TITLES[activeTab] || "Dashboard"}>
      <div key={activeTab} className="animate-pageIn">{renderContent()}</div>
    </DashboardLayout>
  );
}

function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mb-4"><Lock className="w-6 h-6" /></div>
      <h2 className="text-lg font-semibold text-gray-900">Access denied</h2>
      <p className="text-sm text-gray-500 mt-1">You do not have permission to view this page.</p>
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950 text-white">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 border-4 border-yellow-500 flex items-center justify-center shadow-xl mb-5">
        <span className="text-3xl font-serif font-bold text-yellow-400">Y</span>
      </div>
      <Spinner className="text-yellow-400" />
      <p className="mt-3 text-sm text-emerald-100">Loading YPMS…</p>
    </div>
  );
}

function Gate() {
  const { status, user } = useAuth();
  if (status === "loading") return <SplashScreen />;
  if (status === "signedOut" || !user) return <Login />;
  if (user.mustChangePassword) return <ForcePasswordChange />;
  return <Dashboard />;
}

export default function App() {
  useEffect(() => onSyncError((message) => toast.error(message)), []);
  return (
    <AuthProvider>
      <Gate />
      <FeedbackHost />
    </AuthProvider>
  );
}
