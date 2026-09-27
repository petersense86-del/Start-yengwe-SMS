import { useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";
import type { User, Result, SubjectScore, Homework, Notice, DownloadLog, SystemUpdate, ActivityLog, SchoolSettings, SchoolBiography, Message } from "../types";

/*
 * Data layer backed by Supabase.
 *
 * Pages keep the original synchronous API: getDb() returns a private copy of
 * everything the signed-in user is allowed to see, and saveDb(db) persists
 * whatever changed. Changes are diffed row by row and written in the
 * background; the database's row-level security decides what is permitted,
 * so a rejected write surfaces as an error and the cache is reloaded from the
 * server.
 */

export interface Database {
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
  headteacherRegistered: true,
  deputyRegistered: true,
  setupComplete: true,
};

const DEFAULT_BIOGRAPHY: SchoolBiography = {
  id: "bio-default",
  aboutText: "",
  mission: "",
  vision: "",
  history: "",
  gallery: [],
  animationStyle: "fade",
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
  updatedByName: "",
};

function emptyDb(): Database {
  return {
    users: [], results: [], homework: [], notices: [], downloadLogs: [], systemUpdates: [],
    activityLogs: [], messages: [], settings: { ...DEFAULT_SETTINGS }, biography: { ...DEFAULT_BIOGRAPHY },
  };
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function omit<T extends object>(obj: T, keys: string[]): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) if (!keys.includes(k) && v !== undefined) out[k] = v;
  return out;
}
const orUndef = <T,>(v: T | null | undefined) => (v === null ? undefined : v);

const PROFILE_COLUMNS = ["id", "username", "role", "fullName", "grade", "classSection", "hodDepartment", "mustChangePassword", "password", "createdAt"];
function profileToRow(u: User): Row {
  return {
    id: u.id, username: u.username, role: u.role, full_name: u.fullName,
    grade: u.grade ?? null, class_section: u.classSection ?? null, hod_department: u.hodDepartment ?? null,
    must_change_password: !!u.mustChangePassword, data: omit(u, PROFILE_COLUMNS),
  };
}
function profileFromRow(r: Row): User {
  return {
    ...(r.data as object),
    id: r.id as string, username: r.username as string, role: r.role as User["role"], fullName: r.full_name as string,
    grade: orUndef(r.grade as User["grade"]), classSection: orUndef(r.class_section as string),
    hodDepartment: orUndef(r.hod_department as User["hodDepartment"]),
    mustChangePassword: r.must_change_password as boolean, createdAt: r.created_at as string, password: "",
  } as User;
}

function resultToRow(r: Result): Row {
  return {
    id: r.id, pupil_id: r.pupilId, term: r.term, year: r.year, grade: r.grade, published: !!r.published,
    data: omit(r, ["id", "pupilId", "term", "year", "grade", "published", "scores"]),
  };
}
function scoreId(resultId: string, subject: string) { return `${resultId}|${subject}`; }
function scoreToRow(r: Result, s: SubjectScore): Row {
  return {
    id: scoreId(r.id, s.subject), result_id: r.id, pupil_id: r.pupilId, subject: s.subject,
    teacher_id: s.teacherId || null, published: !!s.published,
    data: omit(s, ["subject", "teacherId", "published"]),
  };
}
function resultFromRows(r: Row, scores: Row[]): Result {
  return {
    ...(r.data as object),
    id: r.id as string, pupilId: r.pupil_id as string, term: r.term as string, year: r.year as number,
    grade: r.grade as Result["grade"], published: r.published as boolean,
    scores: scores.map((s) => ({
      ...(s.data as object),
      subject: s.subject as string, teacherId: (s.teacher_id as string) || "", published: s.published as boolean,
    }) as SubjectScore),
  } as Result;
}

// Tables whose extra fields live in a jsonb `data` column.
function dataTable<T extends { id: string }>(cols: Record<string, keyof T>, created: keyof T) {
  const colKeys = Object.values(cols) as string[];
  return {
    toRow(item: T): Row {
      const row: Row = { id: item.id, created_at: item[created] ?? null, data: omit(item, ["id", ...colKeys]) };
      for (const [col, key] of Object.entries(cols)) row[col] = item[key] ?? null;
      return row;
    },
    fromRow(r: Row): T {
      const item = { ...(r.data as object), id: r.id } as Row;
      for (const [col, key] of Object.entries(cols)) item[key as string] = orUndef(r[col]);
      if (item[created as string] === undefined) item[created as string] = r.created_at;
      return item as unknown as T;
    },
  };
}
const homeworkMap = dataTable<Homework>({ teacher_id: "teacherId", grade: "grade", section: "section" }, "createdAt");
const noticeMap = dataTable<Notice>({ posted_by: "postedBy" }, "createdAt");
const updateMap = dataTable<SystemUpdate>({ posted_by: "postedBy" }, "createdAt");
const messageMap = dataTable<Message>({ from_id: "fromId", to_id: "toId", read: "read" }, "timestamp");
const activityMap = dataTable<ActivityLog>({ user_id: "userId" }, "timestamp");
const downloadMap = dataTable<DownloadLog>({ downloaded_by: "downloadedBy" }, "downloadedAt");

// ---------------------------------------------------------------------------
// Table specs used for diffing
// ---------------------------------------------------------------------------
type CollectionKey = "users" | "results" | "homework" | "notices" | "systemUpdates" | "messages" | "activityLogs" | "downloadLogs" | "config";

interface TableSpec {
  table: string;
  pk: "id" | "key";
  collection: CollectionKey;
  rows(db: Database): Row[];
  insert: boolean;
  update: boolean;
  del: boolean;
  appendOnly?: boolean;
  updatePayload?(row: Row): Row;
}

const SPECS: TableSpec[] = [
  {
    table: "profiles", pk: "id", collection: "users", rows: (db) => db.users.map(profileToRow),
    insert: false, update: true, del: false, // created/deleted only via the admin-users function
    updatePayload: ({ id: _id, username: _u, ...rest }) => rest,
  },
  { table: "results", pk: "id", collection: "results", rows: (db) => db.results.map(resultToRow), insert: true, update: true, del: true },
  {
    table: "result_scores", pk: "id", collection: "results",
    rows: (db) => db.results.flatMap((r) => r.scores.map((s) => scoreToRow(r, s))), insert: true, update: true, del: true,
  },
  { table: "homework", pk: "id", collection: "homework", rows: (db) => db.homework.map(homeworkMap.toRow), insert: true, update: false, del: true },
  { table: "notices", pk: "id", collection: "notices", rows: (db) => db.notices.map(noticeMap.toRow), insert: true, update: true, del: true },
  { table: "system_updates", pk: "id", collection: "systemUpdates", rows: (db) => db.systemUpdates.map(updateMap.toRow), insert: true, update: false, del: true },
  {
    table: "messages", pk: "id", collection: "messages", rows: (db) => db.messages.map(messageMap.toRow),
    insert: true, update: true, del: false, updatePayload: (row) => ({ read: row.read }),
  },
  { table: "activity_logs", pk: "id", collection: "activityLogs", rows: (db) => db.activityLogs.map(activityMap.toRow), insert: true, update: false, del: false, appendOnly: true },
  { table: "download_logs", pk: "id", collection: "downloadLogs", rows: (db) => db.downloadLogs.map(downloadMap.toRow), insert: true, update: false, del: false, appendOnly: true },
  {
    table: "app_config", pk: "key", collection: "config", insert: false, update: true, del: false,
    rows: (db) => [
      { key: "settings", data: omit(db.settings, ["headteacherRegistered", "deputyRegistered", "setupComplete"]) },
      { key: "biography", data: db.biography ?? DEFAULT_BIOGRAPHY },
    ],
    updatePayload: (row) => ({ data: row.data }),
  },
];

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------
let cache: Database = emptyDb();
const snapshot = new Map<string, Map<string, string>>(); // table -> pk -> serialized row
let version = 0;
// Per-table change counters. A copy from getDb() remembers them so saveDb can
// tell whether a table changed underneath it (and must not delete from it).
const tableVersions = new Map<string, number>();
const cloneVersions = new WeakMap<object, Map<string, number>>();
const listeners = new Set<() => void>();
const touch = (table: string) => tableVersions.set(table, (tableVersions.get(table) ?? 0) + 1);

export type SyncStatus = "idle" | "saving" | "error";
let syncStatus: SyncStatus = "idle";
const statusListeners = new Set<() => void>();
const errorListeners = new Set<(message: string) => void>();
let pending = 0;
let queue: Promise<void> = Promise.resolve();

function setStatus(s: SyncStatus) {
  syncStatus = s;
  statusListeners.forEach((l) => l());
}
function bump() {
  version++;
  listeners.forEach((l) => l());
}

function rebuildSnapshot(collections?: CollectionKey[]) {
  for (const spec of SPECS) {
    if (collections && !collections.includes(spec.collection)) continue;
    snapshot.set(spec.table, new Map(spec.rows(cache).map((r) => [r[spec.pk] as string, JSON.stringify(r)])));
    touch(spec.table);
  }
}

/** A private deep copy of the data the current user can see. Mutate freely, then call saveDb. */
export function getDb(): Database {
  const copy = structuredClone(cache);
  cloneVersions.set(copy, new Map(tableVersions));
  return copy;
}

/** The live cache, read-only and without copying. Use for display only; never mutate or pass to saveDb. */
export function peekDb(): Readonly<Database> {
  return cache;
}

/** Persist every difference between `db` and the last known server state. */
export function saveDb(db: Database): void {
  const seenVersions = cloneVersions.get(db);
  const isStale = (table: string) => !!seenVersions && seenVersions.get(table) !== tableVersions.get(table);
  const staleCollections = new Set(SPECS.filter((s) => isStale(s.table)).map((s) => s.collection));
  const ops: { spec: TableSpec; kind: "insert" | "update" | "delete"; id: string; row?: Row }[] = [];

  for (const spec of SPECS) {
    const stale = isStale(spec.table);
    const before = ops.length;
    const snap = snapshot.get(spec.table) ?? new Map<string, string>();
    const rows = spec.rows(db);
    const seen = new Set<string>();
    for (const row of rows) {
      const id = row[spec.pk] as string;
      seen.add(id);
      const serialized = JSON.stringify(row);
      const prev = snap.get(id);
      if (prev === undefined) {
        if (spec.insert) { ops.push({ spec, kind: "insert", id, row }); snap.set(id, serialized); }
      } else if (prev !== serialized) {
        if (spec.update) { ops.push({ spec, kind: "update", id, row }); snap.set(id, serialized); }
      }
    }
    // Only delete rows this copy actually knew about; a stale copy never deletes.
    if (spec.del && !stale) {
      for (const id of [...snap.keys()]) {
        if (!seen.has(id)) { ops.push({ spec, kind: "delete", id }); snap.delete(id); }
      }
    }
    snapshot.set(spec.table, snap);
    if (ops.length > before) touch(spec.table);
  }

  // Keep rows a stale copy (or an append-only log) was missing.
  const merged = structuredClone(db);
  const mergeById = <T extends { id: string }>(next: T[], prev: T[]) => {
    const ids = new Set(next.map((x) => x.id));
    return [...next, ...prev.filter((x) => !ids.has(x.id))];
  };
  merged.activityLogs = mergeById(merged.activityLogs, cache.activityLogs);
  merged.downloadLogs = mergeById(merged.downloadLogs, cache.downloadLogs);
  merged.users = mergeById(merged.users, cache.users);
  if (staleCollections.has("results")) merged.results = mergeById(merged.results, cache.results);
  if (staleCollections.has("homework")) merged.homework = mergeById(merged.homework, cache.homework);
  if (staleCollections.has("notices")) merged.notices = mergeById(merged.notices, cache.notices);
  if (staleCollections.has("systemUpdates")) merged.systemUpdates = mergeById(merged.systemUpdates, cache.systemUpdates);
  if (staleCollections.has("messages")) merged.messages = mergeById(merged.messages, cache.messages);
  cache = merged;
  bump();

  if (ops.length === 0) return;
  // Parents before children on write; children before parents on delete.
  const writes = ops.filter((o) => o.kind !== "delete");
  const deletes = ops.filter((o) => o.kind === "delete").reverse();
  enqueue(async () => {
    for (const op of [...writes, ...deletes]) await runOp(op);
  });
}

async function runOp(op: { spec: TableSpec; kind: "insert" | "update" | "delete"; id: string; row?: Row }) {
  const { spec } = op;
  const t = supabase.from(spec.table);
  let res;
  if (op.kind === "insert" && spec.appendOnly) {
    // Most users may write logs but not read them back, so don't ask for the row.
    const { error } = await t.insert(op.row!);
    if (error) throw new Error(friendlyError(error.message, error.code));
    return;
  }
  if (op.kind === "insert") res = await t.insert(op.row!).select(spec.pk);
  else if (op.kind === "update") res = await t.update(spec.updatePayload ? spec.updatePayload(op.row!) : op.row!).eq(spec.pk, op.id).select(spec.pk);
  else res = await t.delete().eq(spec.pk, op.id).select(spec.pk);
  if (res.error) throw new Error(friendlyError(res.error.message, res.error.code));
  if (!res.data || res.data.length === 0) throw new Error("You don't have permission to make that change.");
}

function friendlyError(message: string, code?: string) {
  if (code === "42501" || /row-level security/i.test(message)) return "You don't have permission to make that change.";
  if (code === "23505") return "That record already exists (it may have just been created on another device).";
  if (/Failed to fetch|NetworkError/i.test(message)) return "No internet connection. Your last change was not saved.";
  return message;
}

function enqueue(task: () => Promise<void>) {
  pending++;
  setStatus("saving");
  queue = queue
    .then(task)
    .then(() => {
      pending--;
      if (pending === 0) setStatus("idle");
    })
    .catch(async (e: unknown) => {
      pending--;
      setStatus("error");
      const message = e instanceof Error ? e.message : "Could not save changes.";
      errorListeners.forEach((l) => l(message));
      // Resync with the server's truth after a rejected write.
      try { await loadCollections(); } catch { /* offline; keep local state */ }
      if (pending === 0) setStatus("idle");
    });
}

/** Resolves once every queued write has finished. */
export function flushWrites(): Promise<void> {
  return queue.catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
async function fetchAll(table: string, order = "created_at", opts: { limit?: number; desc?: boolean } = {}): Promise<Row[]> {
  const page = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += page) {
    const to = opts.limit ? Math.min(from + page, opts.limit) - 1 : from + page - 1;
    const { data, error } = await supabase.from(table).select("*").order(order, { ascending: !opts.desc }).range(from, to);
    if (error) throw new Error(error.message);
    out.push(...(data as Row[]));
    if (!data || data.length < page || (opts.limit && out.length >= opts.limit)) break;
  }
  return out;
}

const LOADERS: Record<CollectionKey, () => Promise<void>> = {
  users: async () => { cache.users = (await fetchAll("profiles")).map(profileFromRow); },
  results: async () => {
    const [results, scores] = await Promise.all([fetchAll("results"), fetchAll("result_scores", "id")]);
    const byResult = new Map<string, Row[]>();
    for (const s of scores) {
      const list = byResult.get(s.result_id as string) ?? [];
      list.push(s);
      byResult.set(s.result_id as string, list);
    }
    cache.results = results.map((r) => resultFromRows(r, byResult.get(r.id as string) ?? []));
  },
  homework: async () => { cache.homework = (await fetchAll("homework")).map(homeworkMap.fromRow); },
  notices: async () => { cache.notices = (await fetchAll("notices")).map(noticeMap.fromRow); },
  systemUpdates: async () => { cache.systemUpdates = (await fetchAll("system_updates")).map(updateMap.fromRow); },
  messages: async () => { cache.messages = (await fetchAll("messages")).map(messageMap.fromRow); },
  activityLogs: async () => { cache.activityLogs = (await fetchAll("activity_logs", "created_at", { limit: 500, desc: true })).map(activityMap.fromRow); },
  downloadLogs: async () => { cache.downloadLogs = (await fetchAll("download_logs", "created_at", { limit: 1000, desc: true })).map(downloadMap.fromRow); },
  config: async () => {
    const { data, error } = await supabase.from("app_config").select("key, data");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { key: string; data: Row }[];
    const settings = rows.find((r) => r.key === "settings")?.data ?? {};
    const bio = rows.find((r) => r.key === "biography")?.data;
    cache.settings = { ...DEFAULT_SETTINGS, ...(settings as Partial<SchoolSettings>) };
    cache.biography = { ...DEFAULT_BIOGRAPHY, ...((bio ?? {}) as Partial<SchoolBiography>) };
  },
};

const ALL_COLLECTIONS = Object.keys(LOADERS) as CollectionKey[];

async function loadCollections(collections: CollectionKey[] = ALL_COLLECTIONS) {
  // Each loader assigns its collection only after its fetch succeeds.
  await Promise.all(collections.map((c) => LOADERS[c]()));
  cache = { ...cache };
  const hasHead = cache.users.some((u) => u.role === "headteacher");
  const hasDeputy = cache.users.some((u) => u.role === "deputy");
  cache.settings.headteacherRegistered = hasHead;
  cache.settings.deputyRegistered = hasDeputy;
  cache.settings.setupComplete = hasHead && hasDeputy;
  rebuildSnapshot(collections);
  bump();
}

let lastFullRefresh = 0;

/** Load (or reload) everything for the signed-in user, after pending writes finish. */
export async function refreshData(collections?: CollectionKey[]): Promise<void> {
  await flushWrites();
  const startedAt = Date.now();
  await loadCollections(collections);
  if (!collections) lastFullRefresh = startedAt;
}

/** Reload everything only if the last full reload is older than `maxAgeMs`. */
export function refreshIfStale(maxAgeMs: number): Promise<void> {
  if (Date.now() - lastFullRefresh < maxAgeMs) return Promise.resolve();
  return refreshData();
}

/** Forget all cached data (on sign-out). */
export function resetDb(): void {
  lastFullRefresh = 0;
  cache = emptyDb();
  snapshot.clear();
  bump();
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function subscribeStatus(l: () => void) { statusListeners.add(l); return () => { statusListeners.delete(l); }; }

/** Re-render when data changes (local saves or server refreshes). */
export function useDbVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, () => syncStatus);
}

export function onSyncError(l: (message: string) => void) {
  errorListeners.add(l);
  return () => { errorListeners.delete(l); };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** A copy of one user record, without cloning the whole database. */
export function findUser(id: string): User | undefined {
  const u = cache.users.find((x) => x.id === id);
  return u ? structuredClone(u) : undefined;
}

export function genId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Append an audit entry. The server stamps the real name/role, so it cannot be forged. */
export function logActivity(userId: string, userName: string, role: User["role"], action: string, details?: string) {
  const db = getDb();
  db.activityLogs.unshift({ id: genId("log"), userId, userName, role, action, details, timestamp: new Date().toISOString() });
  saveDb(db);
}
