import type { Grade, Department, Role } from "../data/constants";

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: Role;
  email?: string;
  phone?: string;
  profilePicture?: string; // base64
  gender?: "Male" | "Female";
  // pupil-specific
  grade?: Grade;
  classSection?: string;
  pupilId?: string;
  province?: string;
  district?: string;
  dateOfBirth?: string;
  enrollmentYear?: number;
  guardiansName?: string;
  guardiansPhone?: string;
  address?: string;
  // teacher-specific
  teacherId?: string;
  subjects?: string[]; // subjects assigned
  classes?: { grade: Grade; section: string }[];
  departments?: Department[];
  qualifications?: string;
  employmentStatus?: "active" | "on_leave" | "transferred_in" | "transferred_out";
  statusNote?: string;
  statusDate?: string;
  previousSchool?: string; // for transfers in
  // hod-specific
  hodDepartment?: Department;
  // signatures (headteacher + class teachers)
  signature?: string; // base64 signature (headteacher or class teacher)
  lastLogin?: string;
  createdAt: string;
  mustChangePassword?: boolean;
}

export interface SubjectScore {
  subject: string;
  score: number;
  term: string;
  year: number;
  teacherId: string;
  teacherName: string;
  comment?: string;
  published?: boolean; // per-subject publish: pupil only sees when true
  publishedAt?: string;
}

// Yengwe 9-point grading system
export interface YengweGrade {
  grade: string;
  name: string; // e.g. Distinction, Merit, Credit, Satisfactory, Unsatisfactory
  min: number;
  max: number;
}

export const YENGWE_GRADES: YengweGrade[] = [
  { grade: "1", name: "Distinction", min: 75, max: 100 },
  { grade: "2", name: "Distinction", min: 70, max: 74 },
  { grade: "3", name: "Merit",       min: 65, max: 69 },
  { grade: "4", name: "Merit",       min: 60, max: 64 },
  { grade: "5", name: "Credit",      min: 55, max: 59 },
  { grade: "6", name: "Credit",      min: 50, max: 54 },
  { grade: "7", name: "Satisfactory", min: 45, max: 49 },
  { grade: "8", name: "Satisfactory", min: 40, max: 44 },
  { grade: "9", name: "Unsatisfactory", min: 0, max: 39 },
];

export function yengweGrade(score: number): YengweGrade {
  return YENGWE_GRADES.find((g) => score >= g.min && score <= g.max) || YENGWE_GRADES[YENGWE_GRADES.length - 1];
}


export interface Result {
  id: string;
  pupilId: string;
  term: string;
  year: number;
  grade: Grade;
  scores: SubjectScore[];
  published: boolean;
  publishedAt?: string;
  publishedBy?: string;
  classTeacherComment?: string;   // overall behavioural/academic comment from class teacher
  classTeacherId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Homework {
  id: string;
  teacherId: string;
  teacherName: string;
  subject: string;
  grade: Grade;
  section: string;
  title: string;
  description: string;
  dueDate: string;
  createdAt: string;
  attachments?: string[];
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  category: "event" | "general" | "academic";
  postedBy: string;
  postedByName: string;
  eventDate?: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface DownloadLog {
  id: string;
  resultId: string;
  pupilName: string;
  downloadedBy: string;
  downloadedByName: string;
  downloadedAt: string;
  role: Role;
}

export interface SystemUpdate {
  id: string;
  title: string;
  description: string;
  postedBy: string;
  postedByName: string;
  role: Role;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  action: string;
  details?: string;
  timestamp: string;
}

export interface Message {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  timestamp: string;
  read: boolean;
  kind: "message" | "call-missed" | "call-answered" | "voice";
  callDuration?: number; // seconds
  voiceDataUrl?: string; // for voice notes (base64 webm/mp3)
  voiceDuration?: number; // seconds
}

export interface SchoolSettings {
  schoolLogo?: string;
  watermarkImage?: string;  // separate background watermark for report cards
  watermarkOpacity: number; // 0.0 - 1.0, default 0.04
  watermarkEnabled: boolean; // show/hide watermark on report cards
  headteacherName: string;
  deputyName?: string;
  schoolEmail: string;
  schoolMotto: string;
  headteacherSignature?: string;
  systemDomain: string;
  // Desk stamp settings (editable by headteacher)
  stampShape: "round" | "square" | "hexagon";
  stampColor: string;
  stampDate?: string;
  stampShowDate: boolean;
  stampText?: string;
  stampEnabled: boolean;
  stampSize: number; // radius/half-size in mm (default 18)
  stampXOffset: number; // horizontal offset from right edge (mm)
  stampYOffset: number; // vertical offset from signature area (mm)
  // One-time admin registration links/tokens
  headteacherRegistered: boolean;
  deputyRegistered: boolean;
  setupComplete: boolean;
}

export interface GalleryItem {
  id: string;
  caption?: string;
  image: string; // base64
  uploadedAt: string;
}

export interface SchoolBiography {
  id: string;
  aboutText: string;
  mission?: string;
  vision?: string;
  history?: string;
  gallery: GalleryItem[];
  animationStyle: "fade" | "slide" | "zoom" | "flip";
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}
