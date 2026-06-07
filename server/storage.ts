import {
  users,
  sites,
  checklistItems,
  inspections,
  inspectionEntries,
  entryPhotos,
  issues,
  pushSubscriptions,
} from "@shared/schema";
import type {
  User,
  Site,
  InsertSite,
  ChecklistItem,
  InsertChecklistItem,
  Inspection,
  InspectionEntry,
  EntryPhoto,
  Issue,
  PushSubscription,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { DB_PATH, ensureDirs } from "./paths";

ensureDirs();
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);

// Create tables if not present (lightweight migration without drizzle-kit at runtime)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  section TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  requires_photo INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  inspector_user_id INTEGER NOT NULL,
  inspector_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  started_at INTEGER NOT NULL,
  submitted_at INTEGER,
  weather TEXT NOT NULL DEFAULT '',
  general_notes TEXT NOT NULL DEFAULT '',
  pdf_path TEXT
);
CREATE TABLE IF NOT EXISTS inspection_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL,
  checklist_item_id INTEGER,
  label TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'na',
  note TEXT NOT NULL DEFAULT '',
  severity TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_observation INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS entry_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  uploaded_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  inspection_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
`);

// Lightweight column migrations for existing databases (v1.1).
function addColumnIfMissing(table: string, column: string, ddl: string) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
addColumnIfMissing("sites", "inspection_frequency_days", "inspection_frequency_days INTEGER");
addColumnIfMissing("sites", "next_due_date", "next_due_date TEXT");
addColumnIfMissing("inspections", "executive_summary", "executive_summary TEXT");
addColumnIfMissing("entry_photos", "is_annotated", "is_annotated INTEGER NOT NULL DEFAULT 0");

const now = () => Date.now();

export const storage = {
  // ---- Users / Auth ----
  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  },
  getUser(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  },
  createUser(email: string, password: string, name: string): User {
    const passwordHash = bcrypt.hashSync(password, 10);
    return db
      .insert(users)
      .values({ email: email.toLowerCase(), passwordHash, name, createdAt: now() })
      .returning()
      .get();
  },
  verifyPassword(user: User, password: string): boolean {
    return bcrypt.compareSync(password, user.passwordHash);
  },
  setPassword(userId: number, newPassword: string): void {
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
  },

  // ---- Sessions (auth tokens, persisted so logins survive restarts) ----
  createSession(userId: number, token: string, ttlSeconds = 60 * 60 * 24 * 30): void {
    const created = now();
    const expires = created + ttlSeconds * 1000;
    sqlite
      .prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .run(token, userId, created, expires);
  },
  getSessionUserId(token: string): number | undefined {
    const row = sqlite
      .prepare(`SELECT user_id, expires_at FROM sessions WHERE token = ?`)
      .get(token) as { user_id: number; expires_at: number } | undefined;
    if (!row) return undefined;
    if (row.expires_at < now()) {
      sqlite.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
      return undefined;
    }
    return row.user_id;
  },
  deleteSession(token: string): void {
    sqlite.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  },
  deleteAllSessionsForUser(userId: number): void {
    sqlite.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  },
  purgeExpiredSessions(): void {
    sqlite.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now());
  },

  // ---- Sites ----
  listSites(): Site[] {
    return db.select().from(sites).all();
  },
  getSite(id: number): Site | undefined {
    return db.select().from(sites).where(eq(sites.id, id)).get();
  },
  createSite(data: InsertSite): Site {
    return db.insert(sites).values({ ...data, createdAt: now() }).returning().get();
  },
  updateSite(id: number, data: Partial<InsertSite>): Site {
    return db.update(sites).set(data).where(eq(sites.id, id)).returning().get();
  },
  deleteSite(id: number): void {
    db.delete(sites).where(eq(sites.id, id)).run();
    const items = db.select().from(checklistItems).where(eq(checklistItems.siteId, id)).all();
    db.delete(checklistItems).where(eq(checklistItems.siteId, id)).run();
    const insp = db.select().from(inspections).where(eq(inspections.siteId, id)).all();
    for (const i of insp) this.deleteInspection(i.id);
    db.delete(issues).where(eq(issues.siteId, id)).run();
    void items;
  },

  // ---- Checklist Items ----
  listChecklistItems(siteId: number): ChecklistItem[] {
    return db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.siteId, siteId))
      .all()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
  createChecklistItem(data: InsertChecklistItem): ChecklistItem {
    const existing = this.listChecklistItems(data.siteId);
    const sortOrder = existing.length;
    return db
      .insert(checklistItems)
      .values({ ...data, sortOrder })
      .returning()
      .get();
  },
  updateChecklistItem(id: number, data: Partial<InsertChecklistItem>): ChecklistItem {
    return db.update(checklistItems).set(data).where(eq(checklistItems.id, id)).returning().get();
  },
  deleteChecklistItem(id: number): void {
    db.delete(checklistItems).where(eq(checklistItems.id, id)).run();
  },
  moveChecklistItem(id: number, direction: "up" | "down"): void {
    const item = db.select().from(checklistItems).where(eq(checklistItems.id, id)).get();
    if (!item) return;
    const items = this.listChecklistItems(item.siteId);
    const idx = items.findIndex((i) => i.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const other = items[swapIdx];
    db.update(checklistItems).set({ sortOrder: other.sortOrder }).where(eq(checklistItems.id, item.id)).run();
    db.update(checklistItems).set({ sortOrder: item.sortOrder }).where(eq(checklistItems.id, other.id)).run();
  },
  duplicateChecklist(fromSiteId: number, toSiteId: number): number {
    const source = this.listChecklistItems(fromSiteId);
    let base = this.listChecklistItems(toSiteId).length;
    for (const item of source) {
      db.insert(checklistItems)
        .values({
          siteId: toSiteId,
          section: item.section,
          label: item.label,
          requiresPhoto: item.requiresPhoto,
          sortOrder: base++,
        })
        .run();
    }
    return source.length;
  },

  // ---- Inspections ----
  listInspections(siteId: number): Inspection[] {
    return db
      .select()
      .from(inspections)
      .where(eq(inspections.siteId, siteId))
      .all()
      .sort((a, b) => b.startedAt - a.startedAt);
  },
  getInspection(id: number): Inspection | undefined {
    return db.select().from(inspections).where(eq(inspections.id, id)).get();
  },
  createInspection(siteId: number, userId: number, inspectorName: string): Inspection {
    return db
      .insert(inspections)
      .values({
        siteId,
        inspectorUserId: userId,
        inspectorName,
        status: "draft",
        startedAt: now(),
      })
      .returning()
      .get();
  },
  updateInspection(id: number, data: Partial<Inspection>): Inspection {
    return db.update(inspections).set(data).where(eq(inspections.id, id)).returning().get();
  },
  deleteInspection(id: number): void {
    const entries = db.select().from(inspectionEntries).where(eq(inspectionEntries.inspectionId, id)).all();
    const entryIds = entries.map((e) => e.id);
    if (entryIds.length) db.delete(entryPhotos).where(inArray(entryPhotos.entryId, entryIds)).run();
    db.delete(inspectionEntries).where(eq(inspectionEntries.inspectionId, id)).run();
    db.delete(issues).where(eq(issues.inspectionId, id)).run();
    db.delete(inspections).where(eq(inspections.id, id)).run();
  },

  // ---- Inspection Entries ----
  listEntries(inspectionId: number): InspectionEntry[] {
    return db
      .select()
      .from(inspectionEntries)
      .where(eq(inspectionEntries.inspectionId, inspectionId))
      .all()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
  getEntry(id: number): InspectionEntry | undefined {
    return db.select().from(inspectionEntries).where(eq(inspectionEntries.id, id)).get();
  },
  createEntry(data: Omit<InspectionEntry, "id">): InspectionEntry {
    return db.insert(inspectionEntries).values(data).returning().get();
  },
  updateEntry(id: number, data: Partial<InspectionEntry>): InspectionEntry {
    return db.update(inspectionEntries).set(data).where(eq(inspectionEntries.id, id)).returning().get();
  },
  deleteEntry(id: number): void {
    db.delete(entryPhotos).where(eq(entryPhotos.entryId, id)).run();
    db.delete(issues).where(eq(issues.entryId, id)).run();
    db.delete(inspectionEntries).where(eq(inspectionEntries.id, id)).run();
  },
  // Replace all entries for an inspection (used by save draft / submit)
  replaceEntries(inspectionId: number, entries: Array<Omit<InspectionEntry, "id" | "inspectionId">> ): InspectionEntry[] {
    const old = this.listEntries(inspectionId);
    const oldIds = old.map((e) => e.id);
    if (oldIds.length) db.delete(entryPhotos).where(inArray(entryPhotos.entryId, oldIds)).run();
    db.delete(issues).where(eq(issues.inspectionId, inspectionId)).run();
    db.delete(inspectionEntries).where(eq(inspectionEntries.inspectionId, inspectionId)).run();
    const created: InspectionEntry[] = [];
    for (const e of entries) {
      created.push(db.insert(inspectionEntries).values({ ...e, inspectionId }).returning().get());
    }
    return created;
  },

  // ---- Photos ----
  listPhotos(entryId: number): EntryPhoto[] {
    return db.select().from(entryPhotos).where(eq(entryPhotos.entryId, entryId)).all();
  },
  listPhotosForEntries(entryIds: number[]): EntryPhoto[] {
    if (!entryIds.length) return [];
    return db.select().from(entryPhotos).where(inArray(entryPhotos.entryId, entryIds)).all();
  },
  addPhoto(entryId: number, filePath: string, caption = ""): EntryPhoto {
    return db
      .insert(entryPhotos)
      .values({ entryId, filePath, caption, uploadedAt: now() })
      .returning()
      .get();
  },
  getPhoto(id: number): EntryPhoto | undefined {
    return db.select().from(entryPhotos).where(eq(entryPhotos.id, id)).get();
  },

  // ---- Issues ----
  listIssues(): Issue[] {
    return db.select().from(issues).all();
  },
  listIssuesForSite(siteId: number): Issue[] {
    return db.select().from(issues).where(eq(issues.siteId, siteId)).all();
  },
  getIssue(id: number): Issue | undefined {
    return db.select().from(issues).where(eq(issues.id, id)).get();
  },
  getIssueByEntry(entryId: number): Issue | undefined {
    return db.select().from(issues).where(eq(issues.entryId, entryId)).get();
  },
  createIssue(entryId: number, siteId: number, inspectionId: number): Issue {
    return db
      .insert(issues)
      .values({ entryId, siteId, inspectionId, status: "open", resolutionNote: "" })
      .returning()
      .get();
  },
  updateIssue(id: number, data: Partial<Issue>): Issue {
    return db.update(issues).set(data).where(eq(issues.id, id)).returning().get();
  },

  // ---- Photos (annotated update) ----
  setPhotoAnnotated(id: number, isAnnotated: boolean): void {
    db.update(entryPhotos).set({ isAnnotated }).where(eq(entryPhotos.id, id)).run();
  },

  // ---- Inspections (helpers) ----
  listAllInspections(): Inspection[] {
    return db.select().from(inspections).all();
  },
  lastSubmittedInspection(siteId: number, beforeId?: number): Inspection | undefined {
    return this.listInspections(siteId)
      .filter((i) => i.status === "submitted" && (beforeId ? i.id !== beforeId : true))
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];
  },
  hasDraft(siteId: number): boolean {
    return this.listInspections(siteId).some((i) => i.status === "draft");
  },

  // ---- Push subscriptions ----
  listPushSubscriptions(): PushSubscription[] {
    return db.select().from(pushSubscriptions).all();
  },
  listPushSubscriptionsForUser(userId: number): PushSubscription[] {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all();
  },
  addPushSubscription(userId: number, endpoint: string, p256dh: string, auth: string): PushSubscription {
    const existing = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
    if (existing) return existing;
    return db
      .insert(pushSubscriptions)
      .values({ userId, endpoint, p256dh, auth, createdAt: now() })
      .returning()
      .get();
  },
  removePushSubscription(endpoint: string): void {
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
  },
};

// Seed admin user on startup
export function seedAdmin() {
  const existing = storage.getUserByEmail("admin@fortisfm.com.au");
  if (!existing) {
    storage.createUser("admin@fortisfm.com.au", "Password123", "Fortis FM Admin");
    console.log("[seed] Created admin user admin@fortisfm.com.au");
  }
}
