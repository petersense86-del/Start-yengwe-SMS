import { lazy, Suspense, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import DashboardLayout from "./components/DashboardLayout";
import { FeedbackHost, toast } from "./components/feedback";
import { Spinner } from "./components/ui";
import { onSyncError, refreshIfStale } from "./utils/db";

// Each page is downloaded the first time it is opened, keeping the first load small.
const Overview = lazy(() => import("./pages/Overview"));
const Profile = lazy(() => import("./pages/Profile"));
const Pupils = lazy(() => import("./pages/Pupils"));
const Teachers = lazy(() => import("./pages/Teachers"));
const Results = lazy(() => import("./pages/Results"));
const Homework = lazy(() => import("./pages/Homework"));
const Notices = lazy(() => import("./pages/Notices"));
const Biography = lazy(() => import("./pages/Biography"));
const Messages = lazy(() => import("./pages/Messages"));
const DownloadLogs = lazy(() => import("./pages/AdminPages").then((m) => ({ default: m.DownloadLogs })));
const ActivityLogs = lazy(() => import("./pages/AdminPages").then((m) => ({ default: m.ActivityLogs })));
const SystemUpdates = lazy(() => import("./pages/AdminPages").then((m) => ({ default: m.SystemUpdates })));
const SettingsPage = lazy(() => import("./pages/AdminPages").then((m) => ({ default: m.SettingsPage })));

// After sign-in, fetch the common pages' code in the background so opening them feels instant.
function preloadPages() {
  const load = () => {
    import("./pages/Results");
    import("./pages/Notices");
    import("./pages/Homework");
    import("./pages/Messages");
    import("./pages/Profile");
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(load);
  else setTimeout(load, 2000);
}

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

  useEffect(preloadPages, []);

  if (!user) return null;

  function changeTab(tab: string) {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
    // Pick up changes made on other devices, at most every 30 seconds.
    refreshIfStale(30_000).catch(() => undefined);
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
      <Suspense fallback={<div className="flex justify-center py-20"><Spinner className="text-emerald-700" /></div>}>
        <div key={activeTab} className="animate-pageIn">{renderContent()}</div>
      </Suspense>
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
