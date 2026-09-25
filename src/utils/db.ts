import type { User, Result, Homework, Notice, DownloadLog, SystemUpdate, ActivityLog, SchoolSettings, SchoolBiography, Message } from "../types";

const DB_KEY = "ypms_db_v1";

interface Database {
  users: User[];
  results: Result[];
  homework: Homework[];
  notices: Notice[];
  downloadLogs: DownloadLog[];
  systemUpdates: SystemUpdate[];
  activityLogs: ActivityLog[];
  messages: Message[];
  settings: SchoolSettings;
  biography?: SchoolBiography;
}

const DEFAULT_HEADTEACHER: User = {
  id: "admin-head-1",
  username: "headteacher",
  password: "admin123",
  fullName: "Mr. Banda M. (Headteacher)",
  role: "headteacher",
  email: "headteacher@yengwe.edu.zm",
  phone: "+260960000000",
  gender: "Male",
  createdAt: new Date().toISOString(),
  mustChangePassword: false,
};

const DEFAULT_DEPUTY: User = {
  id: "admin-deputy-1",
  username: "deputy",
  password: "deputy123",
  fullName: "Mrs. Phiri L. (Deputy Headteacher)",
  role: "deputy",
  email: "deputy@yengwe.edu.zm",
  phone: "+260960000001",
  gender: "Female",
  createdAt: new Date().toISOString(),
  mustChangePassword: false,
};

const DEFAULT_SETTINGS: SchoolSettings = {
  headteacherName: "Headteacher",
  deputyName: "Deputy Headteacher",
  schoolEmail: "info@smart.yengwe.sch",
  schoolMotto: "RISE & SHINE",
  systemDomain: "smart yengwe.sch",
  watermarkOpacity: 0.04,
  watermarkEnabled: true,
  stampShape: "round",
  stampColor: "#B41414",
  stampShowDate: true,
  stampDate: new Date().toISOString().slice(0, 10),
  stampText: "YENGWE SECONDARY SCHOOL",
  stampEnabled: true,
  stampSize: 18,
  stampXOffset: 38,
  stampYOffset: 2,
  headteacherRegistered: true,   // pre-seeded demo account is already registered
  deputyRegistered: true,
  setupComplete: true,
};

function seedDb(): Database {
  return {
    users: [DEFAULT_HEADTEACHER, DEFAULT_DEPUTY],
    results: [],
    homework: [],
    notices: [
      {
        id: "notice-welcome",
        title: "Welcome to YPMS",
        content: "Welcome to the Yengwe Pupils Management System. This is the official notice board. Important announcements will appear here.",
        category: "general",
        postedBy: DEFAULT_HEADTEACHER.id,
        postedByName: DEFAULT_HEADTEACHER.fullName,
        createdAt: new Date().toISOString(),
      },
    ],
    downloadLogs: [],
    systemUpdates: [],
    activityLogs: [],
    messages: [],
    settings: DEFAULT_SETTINGS,
  };
}

export function getDb(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const seeded = seedDb();
      localStorage.setItem(DB_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Database;
    // Back-fill missing settings
    parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
    if (!parsed.notices) parsed.notices = [];
    if (!parsed.downloadLogs) parsed.downloadLogs = [];
    if (!parsed.systemUpdates) parsed.systemUpdates = [];
    if (!parsed.activityLogs) parsed.activityLogs = [];
    if (!parsed.messages) parsed.messages = [];
    if (parsed.settings.watermarkEnabled === undefined) parsed.settings.watermarkEnabled = true;
    if (!parsed.biography) {
      parsed.biography = {
        id: "bio-default",
        aboutText: "",
        mission: "",
        vision: "",
        history: "",
        gallery: [],
        animationStyle: "fade",
        updatedAt: new Date().toISOString(),
        updatedBy: "system",
        updatedByName: "System",
      };
    }
    // Sync admin registration flags with existing users (backward compatibility / enforce uniqueness)
    const hasHead = parsed.users.some((u) => u.role === "headteacher");
    const hasDeputy = parsed.users.some((u) => u.role === "deputy");
    parsed.settings.headteacherRegistered = hasHead;
    parsed.settings.deputyRegistered = hasDeputy;
    parsed.settings.setupComplete = hasHead && hasDeputy;

    // Backfill employment status for teachers/HoDs
    parsed.users.forEach((u) => {
      if ((u.role === "teacher" || u.role === "hod") && !u.employmentStatus) {
        u.employmentStatus = "active";
      }
    });

    return parsed;
  } catch {
    const seeded = seedDb();
    localStorage.setItem(DB_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

/**
 * Attempts to register the single headteacher or deputy account.
 * Returns { ok: true } on success, or { ok: false, message } if that role is already taken.
 * Because the flags are persisted in localStorage, even a user with a "link" on another device/browser
 * will be rejected once that role slot is filled in THIS system's local database.
 */
export function registerAdmin(params: {
  role: "headteacher" | "deputy";
  username: string;
  password: string;
  fullName: string;
  email?: string;
  phone?: string;
  gender?: "Male" | "Female";
}): { ok: boolean; message?: string; user?: User } {
  const db = getDb();
  if (params.role === "headteacher" && db.settings.headteacherRegistered) {
    return { ok: false, message: "A Headteacher account already exists. Only one Headteacher account is permitted." };
  }
  if (params.role === "deputy" && db.settings.deputyRegistered) {
    return { ok: false, message: "A Deputy Headteacher account already exists. Only one Deputy account is permitted." };
  }
  if (db.users.some((u) => u.username.toLowerCase() === params.username.toLowerCase())) {
    return { ok: false, message: "That username is already taken." };
  }
  const newUser: User = {
    id: genId(params.role),
    username: params.username,
    password: params.password,
    fullName: params.fullName,
    role: params.role,
    email: params.email,
    phone: params.phone,
    gender: params.gender,
    createdAt: new Date().toISOString(),
    mustChangePassword: false,
  };
  db.users.push(newUser);
  if (params.role === "headteacher") {
    db.settings.headteacherRegistered = true;
    db.settings.headteacherName = params.fullName;
  } else {
    db.settings.deputyRegistered = true;
    db.settings.deputyName = params.fullName;
  }
  db.settings.setupComplete = db.settings.headteacherRegistered && db.settings.deputyRegistered;
  saveDb(db);
  logActivity(newUser.id, newUser.fullName, newUser.role, `Created ${params.role} account via registration link`);
  return { ok: true, user: newUser };
}

export function saveDb(db: Database): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function resetDb(): Database {
  const seeded = seedDb();
  localStorage.setItem(DB_KEY, JSON.stringify(seeded));
  return seeded;
}

// Helper: generate unique id
export function genId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Log activity helper
export function logActivity(userId: string, userName: string, role: User["role"], action: string, details?: string) {
  const db = getDb();
  db.activityLogs.unshift({
    id: genId("log"),
    userId,
    userName,
    role,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
  // keep max 500 logs
  if (db.activityLogs.length > 500) db.activityLogs = db.activityLogs.slice(0, 500);
  saveDb(db);
}
