import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------- Users ----------------
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type User = typeof users.$inferSelect;

// ---------------- Sites ----------------
export const sites = sqliteTable("sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  clientName: text("client_name").notNull().default(""),
  clientEmail: text("client_email").notNull().default(""),
  clientPhone: text("client_phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  inspectionFrequencyDays: integer("inspection_frequency_days"),
  nextDueDate: text("next_due_date"),
  createdAt: integer("created_at").notNull(),
});

export const insertSiteSchema = createInsertSchema(sites)
  .omit({ id: true, createdAt: true })
  .extend({
    name: z.string().min(1, "Site name is required"),
    address: z.string().optional().default(""),
    clientName: z.string().optional().default(""),
    clientEmail: z.string().optional().default(""),
    clientPhone: z.string().optional().default(""),
    notes: z.string().optional().default(""),
    inspectionFrequencyDays: z.number().int().nullable().optional(),
    nextDueDate: z.string().nullable().optional(),
  });
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;

// ---------------- Checklist Items ----------------
export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  siteId: integer("site_id").notNull(),
  section: text("section").notNull().default(""),
  label: text("label").notNull(),
  requiresPhoto: integer("requires_photo", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertChecklistItemSchema = createInsertSchema(checklistItems)
  .omit({ id: true })
  .extend({
    label: z.string().min(1, "Item label is required"),
    section: z.string().optional().default(""),
    requiresPhoto: z.boolean().optional().default(false),
    sortOrder: z.number().optional().default(0),
  });
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type ChecklistItem = typeof checklistItems.$inferSelect;

// ---------------- Inspections ----------------
export const inspections = sqliteTable("inspections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  siteId: integer("site_id").notNull(),
  inspectorUserId: integer("inspector_user_id").notNull(),
  inspectorName: text("inspector_name").notNull().default(""),
  status: text("status").notNull().default("draft"), // 'draft' | 'submitted'
  startedAt: integer("started_at").notNull(),
  submittedAt: integer("submitted_at"),
  weather: text("weather").notNull().default(""),
  generalNotes: text("general_notes").notNull().default(""),
  pdfPath: text("pdf_path"),
  executiveSummary: text("executive_summary"),
});
export type Inspection = typeof inspections.$inferSelect;

// ---------------- Inspection Entries ----------------
export const inspectionEntries = sqliteTable("inspection_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull(),
  checklistItemId: integer("checklist_item_id"), // null for observations
  label: text("label").notNull().default(""),
  section: text("section").notNull().default(""),
  status: text("status").notNull().default("na"), // 'pass'|'fail'|'na'|'observation'
  note: text("note").notNull().default(""),
  severity: text("severity"), // 'info'|'minor'|'moderate'|'urgent'|null
  sortOrder: integer("sort_order").notNull().default(0),
  isObservation: integer("is_observation", { mode: "boolean" }).notNull().default(false),
});
export type InspectionEntry = typeof inspectionEntries.$inferSelect;

// ---------------- Entry Photos ----------------
export const entryPhotos = sqliteTable("entry_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entryId: integer("entry_id").notNull(),
  filePath: text("file_path").notNull(),
  caption: text("caption").notNull().default(""),
  isAnnotated: integer("is_annotated", { mode: "boolean" }).notNull().default(false),
  uploadedAt: integer("uploaded_at").notNull(),
});
export type EntryPhoto = typeof entryPhotos.$inferSelect;

// ---------------- Issues ----------------
export const issues = sqliteTable("issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entryId: integer("entry_id").notNull(),
  siteId: integer("site_id").notNull(),
  inspectionId: integer("inspection_id").notNull(),
  status: text("status").notNull().default("open"), // 'open'|'in_progress'|'resolved'
  resolutionNote: text("resolution_note").notNull().default(""),
  resolvedAt: integer("resolved_at"),
});
export type Issue = typeof issues.$inferSelect;

// ---------------- Push Subscriptions ----------------
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at").notNull(),
});
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// ---------------- Frequency helpers ----------------
export const FREQUENCY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "oneoff", label: "One off", days: null },
  { value: "weekly", label: "Weekly", days: 7 },
  { value: "fortnightly", label: "Fortnightly", days: 14 },
  { value: "monthly", label: "Monthly", days: 30 },
  { value: "quarterly", label: "Quarterly", days: 91 },
  { value: "halfyear", label: "Every 6 months", days: 182 },
  { value: "yearly", label: "Yearly", days: 365 },
  { value: "custom", label: "Custom days", days: 0 },
];

// ---------------- Auth payloads ----------------
export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------- Severity helpers ----------------
export const SEVERITIES = ["info", "minor", "moderate", "urgent"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const severityRank: Record<string, number> = {
  info: 0,
  minor: 1,
  moderate: 2,
  urgent: 3,
};
