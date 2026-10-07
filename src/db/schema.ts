import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// 属性遵循 Better Auth 的命名，SQL 字段统一使用 snake_case。
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sessions_user_id_idx").on(table.userId)]);

export const account = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("accounts_user_id_idx").on(table.userId),
  uniqueIndex("accounts_provider_account_idx").on(table.providerId, table.accountId),
]);

export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("verifications_identifier_idx").on(table.identifier)]);

export const measurementImport = pgTable("measurement_imports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileDigest: text("file_digest").notNull(),
  sourceLabel: text("source_label").notNull(),
  captureChannel: text("capture_channel").notNull(),
  status: text("status").notNull().default("completed"),
  insertedCount: integer("inserted_count").notNull(),
  skippedCount: integer("skipped_count").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  initializationMetadata: jsonb("initialization_metadata").$type<import("../features/measurements/initialization").InitializationBatchMetadata>(),
  requestDigest: text("request_digest"),
}, (table) => [
  uniqueIndex("measurement_imports_user_digest_idx").on(table.userId, table.fileDigest),
  uniqueIndex("measurement_imports_user_initialization_idx").on(table.userId).where(sql`${table.initializationMetadata} IS NOT NULL`),
]);

export const measurement = pgTable("measurements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sourceLocalTime: text("source_local_time").notNull(),
  localDate: date("local_date").notNull(),
  // 无来源时区时不伪造 UTC 时刻；本地时间仍可用于晨晚归属。
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  timezone: text("timezone"),
  utcOffsetMinutes: integer("utc_offset_minutes"),
  timePrecision: text("time_precision").notNull().default("second"),
  analysisDate: date("analysis_date").notNull(),
  period: text("period", { enum: ["daytime", "evening"] }).notNull(),
  assignmentMethod: text("assignment_method").notNull(),
  assignmentRuleVersion: text("assignment_rule_version").notNull(),
  fasting: boolean("fasting"),
  fastingSource: text("fasting_source"),
  weightKg: numeric("weight_kg", { precision: 7, scale: 2 }),
  bodyFatPercent: numeric("body_fat_percent", { precision: 5, scale: 2 }),
  sourceType: text("source_type").notNull(),
  recordKind: text("record_kind", { enum: ["observed", "estimated"] }).notNull().default("observed"),
  entryChannel: text("entry_channel", { enum: ["api", "manual", "development_backend"] }),
  deviceLabel: text("device_label"),
  estimation: jsonb("estimation").$type<import("../features/measurements/estimation").EstimationMetadata>(),
  sourceSystem: text("source_system"),
  sourceRecordId: text("source_record_id"),
  importId: text("import_id").references(() => measurementImport.id),
  sourceRow: integer("source_row"),
  originalValues: jsonb("original_values").$type<Record<string, string | null>>().notNull(),
  deduplicationKey: text("deduplication_key").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("measurements_user_dedup_idx").on(table.userId, table.deduplicationKey),
  uniqueIndex("measurements_active_estimate_idx").on(table.userId, table.analysisDate, table.period).where(sql`${table.recordKind} = 'estimated' AND ${table.deletedAt} IS NULL`),
  index("measurements_user_analysis_date_idx").on(table.userId, table.analysisDate),
  check("measurements_weight_valid", sql`${table.weightKg} > 0`),
  check("measurements_metric_presence", sql`${table.weightKg} IS NOT NULL OR ${table.bodyFatPercent} IS NOT NULL`),
  check("measurements_body_fat_valid", sql`${table.bodyFatPercent} IS NULL OR ${table.bodyFatPercent} BETWEEN 0 AND 100`),
  check("measurements_period_valid", sql`${table.period} IN ('daytime', 'evening')`),
  check("measurements_instant_has_timezone", sql`${table.occurredAt} IS NULL OR ${table.timezone} IS NOT NULL`),
  check("measurements_kind_valid", sql`${table.recordKind} IN ('observed', 'estimated')`),
  check("measurements_channel_valid", sql`${table.entryChannel} IS NULL OR ${table.entryChannel} IN ('api', 'manual', 'development_backend')`),
  check("measurements_estimation_valid", sql`(${table.recordKind} = 'estimated' AND ${table.estimation} IS NOT NULL AND ${table.occurredAt} IS NULL) OR (${table.recordKind} = 'observed' AND ${table.estimation} IS NULL)`),
  check("measurements_assumed_time_valid", sql`${table.timePrecision} NOT IN ('assumed', 'day_period') OR ${table.occurredAt} IS NULL`),
]);

// 名称是建议列表；测量保留名称快照，不能通过改建议联动修改历史。
export const measurementSource = pgTable("measurement_sources", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("measurement_sources_user_label_idx").on(table.userId, table.label),
  index("measurement_sources_user_last_used_idx").on(table.userId, table.lastUsedAt),
  check("measurement_sources_label_valid", sql`length(${table.label}) BETWEEN 1 AND 300 AND ${table.label} = btrim(${table.label})`),
]);

// 空白日期与提醒偏好独立于测量事实，不能参与实测统计。
export const measurementDay = pgTable("measurement_days", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  analysisDate: date("analysis_date").notNull(),
  reminderSkippedAt: timestamp("reminder_skipped_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, table => [uniqueIndex("measurement_days_user_date_idx").on(table.userId, table.analysisDate)]);

export const measurementEvent = pgTable("measurement_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  measurementId: text("measurement_id").notNull().references(() => measurement.id),
  action: text("action").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("measurement_events_user_record_idx").on(table.userId, table.measurementId)]);
