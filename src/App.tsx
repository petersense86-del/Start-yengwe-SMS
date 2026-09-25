import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
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

function Dashboard() {
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  if (!authUser) return <Login />;
  const user = authUser;

  const titles: Record<string, string> = {
    overview: "Dashboard Overview",
    biography: "About Yengwe Secondary School",
    messages: "Messages & Calls",
    profile: "My Profile",
    pupils: "Pupil Management",
    teachers: "Teachers & Heads of Department",
    results: "Academic Results",
    homework: "Homework Assignments",
    notices: "School Notice Board",
    downloads: "Result Download Logs",
    activity: "System Activity Logs",
    updates: "System Updates",
    settings: "School Settings",
  };

  function renderContent() {
    switch (activeTab) {
      case "overview": return <Overview />;
      case "biography": return <Biography />;
      case "messages": return <Messages />;
      case "profile": return <Profile />;
      case "pupils":
        if (user.role === "pupil") return <ForbiddenPage />;
        return <Pupils />;
      case "teachers":
        if (user.role === "pupil" || user.role === "teacher") return <ForbiddenPage />;
        return <Teachers />;
      case "results": return <Results />;
      case "homework": return <Homework />;
      case "notices": return <Notices />;
      case "downloads":
        if (user.role !== "headteacher") return <ForbiddenPage />;
        return <DownloadLogs />;
      case "activity":
        if (user.role !== "headteacher") return <ForbiddenPage />;
        return <ActivityLogs />;
      case "updates": return <SystemUpdates />;
      case "settings":
        if (user.role !== "headteacher" && user.role !== "deputy") return <ForbiddenPage />;
        return <SettingsPage />;
      default: return <Overview />;
    }
  }

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab} title={titles[activeTab] || "Dashboard"}>
      {renderContent()}
    </DashboardLayout>
  );
}

function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
      <p className="text-gray-600 mt-2">You do not have permission to view this page.</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}
