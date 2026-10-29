import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// 登录前按来源和入口计数，不属于用户健康数据；所有服务实例共用。
export const rateLimit = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
}, table => [index("rate_limits_last_request_idx").on(table.lastRequest)]);

// 属性遵循 Better Auth 的命名，SQL 字段统一使用 snake_case。
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  accessVersion: integer("access_version").notNull().default(0),
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
  impersonatedBy: text("impersonated_by"),
  accessVersion: integer("access_version").notNull().default(0),
  adminVerifiedAt: timestamp("admin_verified_at", { withTimezone: true }),
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

// 手动交付的激活／重设链接；原文只生成时返回，数据库仅保存摘要。
export const accountLink = pgTable("account_links", {
  id: text("id").primaryKey(),
  purpose: text("purpose").$type<"invite" | "reset_password">().notNull(),
  email: text("email").notNull(),
  userId: text("user_id").references(() => user.id),
  createdBy: text("created_by").notNull().references(() => user.id),
  requestId: text("request_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [
  uniqueIndex("account_links_issuer_request_idx").on(t.createdBy, t.requestId),
  uniqueIndex("account_links_active_email_idx").on(t.email, t.purpose).where(sql`${t.consumedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  index("account_links_user_idx").on(t.userId),
  check("account_links_purpose_valid", sql`${t.purpose} IN ('invite','reset_password') AND (${t.purpose}<>'reset_password' OR ${t.userId} IS NOT NULL)`),
]);

// 只记录账号操作元数据，不记录健康内容、密码、令牌或完整链接。
export const accountEvent = pgTable("account_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => user.id),
  userId: text("user_id").references(() => user.id),
  email: text("email").notNull(),
  action: text("action").notNull(),
  outcome: text("outcome").notNull().default("success"),
  reason: text("reason"),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("account_events_request_idx").on(t.requestId), index("account_events_created_idx").on(t.createdAt)]);

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
  // 无来源时区时不伪造 UTC 时刻；本地时间仍可用于晨晚归属。
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  timezone: text("timezone"),
  utcOffsetMinutes: integer("utc_offset_minutes"),
  timePrecision: text("time_precision").notNull().default("second"),
  recordDate: date("record_date").notNull(),
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
  uniqueIndex("measurements_active_estimate_idx").on(table.userId, table.recordDate, table.period).where(sql`${table.recordKind} = 'estimated' AND ${table.deletedAt} IS NULL`),
  index("measurements_user_record_date_idx").on(table.userId, table.recordDate),
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
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by").references(() => user.id),
}, table => [
  uniqueIndex("measurement_sources_user_label_idx").on(table.userId, table.label),
  index("measurement_sources_user_last_used_idx").on(table.userId, table.lastUsedAt),
  check("measurement_sources_label_valid", sql`length(${table.label}) BETWEEN 1 AND 300 AND ${table.label} = btrim(${table.label})`),
]);

// 消耗来源建议与身体来源独立；健康记录继续保留自己的名称快照。
export const energySource = pgTable("energy_sources", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by").references(() => user.id),
}, table => [
  uniqueIndex("energy_sources_user_label_idx").on(table.userId, table.label),
  index("energy_sources_user_last_used_idx").on(table.userId, table.lastUsedAt),
  check("energy_sources_label_valid", sql`length(${table.label}) BETWEEN 1 AND 200 AND ${table.label} = btrim(${table.label})`),
]);

// 空白日期与提醒偏好独立于测量事实，不能参与实测统计。
export const measurementDay = pgTable("measurement_days", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  recordDate: date("record_date").notNull(),
  reminderSkippedAt: timestamp("reminder_skipped_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, table => [uniqueIndex("measurement_days_user_date_idx").on(table.userId, table.recordDate)]);

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

export const aiToken = pgTable("ai_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  permission: text("permission", { enum: ["read", "write"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => [index("ai_tokens_user_idx").on(table.userId), check("ai_tokens_permission_valid", sql`${table.permission} IN ('read', 'write')`)]);

export const oauthClient = pgTable("oauth_client", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: boolean("disabled").default(false),
  skipConsent: boolean("skip_consent"),
  enableEndSession: boolean("enable_end_session"),
  subjectType: text("subject_type"),
  scopes: text("scopes").array(),
  clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
  userId: text("user_id").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").array().notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: text("grant_types").array(),
  responseTypes: text("response_types").array(),
  requirePKCE: boolean("require_p_k_c_e"),
  dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
  referenceId: text("reference_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, table => [index("oauth_client_user_id_idx").on(table.userId)]);

export const oauthResource = pgTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims").$type<Record<string, unknown>>(),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const oauthClientResource = pgTable("oauth_client_resource", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => oauthResource.identifier, { onDelete: "cascade" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }),
}, table => [index("oauth_client_resource_client_id_idx").on(table.clientId), index("oauth_client_resource_resource_id_idx").on(table.resourceId), uniqueIndex("oauth_client_resource_pair_idx").on(table.clientId, table.resourceId)]);

export const oauthRefreshToken = pgTable("oauth_refresh_token", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => user.id),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  revoked: timestamp("revoked", { withTimezone: true }),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", { withTimezone: true }),
  authTime: timestamp("auth_time", { withTimezone: true }),
  confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
  scopes: text("scopes").array().notNull(),
}, table => [index("oauth_refresh_token_client_id_idx").on(table.clientId), index("oauth_refresh_token_session_id_idx").on(table.sessionId), index("oauth_refresh_token_user_id_idx").on(table.userId), index("oauth_refresh_token_authorization_code_id_idx").on(table.authorizationCodeId)]);

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  refreshId: text("refresh_id").references(() => oauthRefreshToken.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  revoked: timestamp("revoked", { withTimezone: true }),
  confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
  scopes: text("scopes").array().notNull(),
}, table => [index("oauth_access_token_client_id_idx").on(table.clientId), index("oauth_access_token_session_id_idx").on(table.sessionId), index("oauth_access_token_user_id_idx").on(table.userId), index("oauth_access_token_authorization_code_id_idx").on(table.authorizationCodeId), index("oauth_access_token_refresh_id_idx").on(table.refreshId)]);

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId),
  userId: text("user_id").references(() => user.id),
  referenceId: text("reference_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [index("oauth_consent_client_id_idx").on(table.clientId), index("oauth_consent_user_id_idx").on(table.userId)]);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  alg: text("alg"),
  crv: text("crv"),
});

// 稳定授权连接贯穿访问令牌轮换；撤销后旧审核和旧授权码不能恢复连接。
export const oauthConnection = pgTable("oauth_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId),
  scopes: text("scopes").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => [index("oauth_connections_owner_client_idx").on(table.userId, table.clientId)]);

export const measurementOperation = pgTable("measurement_operations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  tokenId: text("token_id").references(() => aiToken.id),
  oauthConnectionId: text("oauth_connection_id").references(() => oauthConnection.id),
  operationId: text("operation_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  snapshotDigest: text("snapshot_digest").notNull(),
  payload: jsonb("payload").$type<import("../features/measurements/ai-operations").AiMeasurementInput>().notNull(),
  preview: jsonb("preview").$type<import("../features/measurements/ai-operations").OperationPreview>().notNull(),
  revision: integer("revision").notNull().default(1),
  status: text("status", { enum: ["pending", "partially_confirmed", "confirmed", "completed", "cancelled"] }).notNull().default("pending"),
  result: jsonb("result").$type<{ message: string; saved: number }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, table => [
  check("measurement_operations_one_credential", sql`num_nonnulls(${table.tokenId}, ${table.oauthConnectionId}) = 1`),
  uniqueIndex("measurement_operations_user_request_idx").on(table.userId, table.operationId),
  index("measurement_operations_user_created_idx").on(table.userId, table.createdAt),
  check("measurement_operations_status_valid", sql`${table.status} IN ('pending', 'partially_confirmed', 'confirmed', 'completed', 'cancelled')`),
]);

const nutritionColumns = () => ({ caloriesKcal: numeric("calories_kcal", { precision: 14, scale: 4 }), proteinG: numeric("protein_g", { precision: 14, scale: 4 }), carbsG: numeric("carbs_g", { precision: 14, scale: 4 }), fatG: numeric("fat_g", { precision: 14, scale: 4 }) });
export const food = pgTable("foods", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id),
  category: text("category").notNull().default("ingredient"), name: text("name").notNull(), brand: text("brand"), preparation: text("preparation"), identityKey: text("identity_key").notNull(),
  servingQuantity: numeric("serving_quantity",{precision:14,scale:4}), servingUnit:text("serving_unit"),
  baseQuantity: numeric("base_quantity", { precision: 14, scale: 4 }).notNull(), unit: text("unit").notNull(), ...nutritionColumns(),
  sourceKind: text("source_kind").notNull(), basis: text("basis"), evidenceUrl: text("evidence_url"),
  version: integer("version").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [uniqueIndex("foods_owner_identity_idx").on(t.userId, t.identityKey).where(sql`${t.deletedAt} IS NULL`), uniqueIndex("foods_owner_id_idx").on(t.userId, t.id), check("foods_category_valid", sql`${t.category} IN ('meal','ingredient')`), check("foods_serving_valid",sql`(${t.servingQuantity} IS NULL AND ${t.servingUnit} IS NULL) OR (${t.servingQuantity} IS NOT NULL AND ${t.servingUnit} IS NOT NULL AND ${t.servingQuantity}>0 AND lower(trim(${t.servingUnit}))<>lower(trim(${t.unit})) AND length(trim(${t.servingUnit}))>0)`), check("foods_quantity_valid", sql`${t.baseQuantity}>0`), check("foods_nutrition_valid", sql`(${t.caloriesKcal} IS NULL OR ${t.caloriesKcal}>=0) AND (${t.proteinG} IS NULL OR ${t.proteinG}>=0) AND (${t.carbsG} IS NULL OR ${t.carbsG}>=0) AND (${t.fatG} IS NULL OR ${t.fatG}>=0)`), check("foods_source_valid", sql`${t.sourceKind} IN ('label','composition_table','reference','estimated','unknown')`)]);
export const mealImport = pgTable("meal_imports", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), fileDigest: text("file_digest").notNull(), sourceLabel: text("source_label").notNull(),
  originalRows: jsonb("original_rows").$type<Record<string, string>[]>().notNull(), decisions: jsonb("decisions").$type<Record<string, unknown>>().notNull(),
  createdBy: text("created_by").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, t => [uniqueIndex("meal_imports_owner_digest_idx").on(t.userId, t.fileDigest), uniqueIndex("meal_imports_owner_id_idx").on(t.userId, t.id)]);
export const meal = pgTable("meals", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), localDate: date("local_date").notNull(), mealType: text("meal_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }), timezone: text("timezone"), notes: text("notes"), source: text("source").notNull(), sourceSystem: text("source_system"), sourceRecordId: text("source_record_id"), syncStatus: text("sync_status").notNull().default("local"),
  importId: text("import_id"), sourceRow: integer("source_row"), version: integer("version").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [uniqueIndex("meals_owner_id_idx").on(t.userId, t.id), uniqueIndex("meals_owner_source_idx").on(t.userId, t.sourceSystem, t.sourceRecordId), index("meals_owner_date_idx").on(t.userId, t.localDate), foreignKey({ columns: [t.userId, t.importId], foreignColumns: [mealImport.userId, mealImport.id] }), check("meals_source_valid", sql`${t.source} IN ('manual','ai','initialization')`), check("meals_time_valid", sql`${t.occurredAt} IS NULL OR ${t.timezone} IS NOT NULL`)]);
// 用户确认当天是否记完，独立于餐次营养是否有未知字段。
export const mealDay = pgTable("meal_days", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id),
  date: date("date").notNull(), status: text("status", { enum: ["complete", "incomplete", "unconfirmed"] }).notNull(),
  contentDigest: text("content_digest").notNull(), version: integer("version").notNull().default(1),
  source: text("source").notNull(), updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("meal_days_owner_date_idx").on(t.userId,t.date),
  check("meal_days_status_valid",sql`${t.status} IN ('complete','incomplete','unconfirmed')`),
  check("meal_days_version_valid",sql`${t.version}>0`)]);
export const mealDayEvent = pgTable("meal_day_events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id),
  date: date("date").notNull(), requestId: text("request_id").notNull(), requestDigest: text("request_digest").notNull(),
  actorId: text("actor_id").notNull(), snapshot: jsonb("snapshot").$type<Record<string,unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("meal_day_events_owner_request_idx").on(t.userId,t.requestId), index("meal_day_events_owner_date_idx").on(t.userId,t.date)]);

export const mealItem = pgTable("meal_items", {
  nutritionBasis:text("nutrition_basis").$type<"consumed_total"|"per_portion">().notNull().default("consumed_total"), perPortionNutrition:jsonb("per_portion_nutrition").$type<import("../features/meals/model").Nutrition>(),
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), mealId: text("meal_id").notNull(), position: integer("position").notNull(), kind: text("kind").notNull(), name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 4 }), amountDecision: text("amount_decision"), reviewExplanation: jsonb("review_explanation").$type<import("../features/meals/model").ReviewExplanation>(), unit: text("unit"), foodId: text("food_id"), foodSnapshot: jsonb("food_snapshot").$type<import("../features/meals/model").FoodView>(), ...nutritionColumns(),
  sourceKind: text("source_kind").notNull(), basis: text("basis"), evidenceUrl: text("evidence_url"), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [foreignKey({ columns: [t.userId, t.mealId], foreignColumns: [meal.userId, meal.id] }), foreignKey({ columns: [t.userId, t.foodId], foreignColumns: [food.userId, food.id] }), index("meal_items_owner_meal_idx").on(t.userId, t.mealId), check("meal_items_basis_valid",sql`${t.nutritionBasis} IN ('consumed_total','per_portion') AND (${t.nutritionBasis}<>'per_portion' OR ${t.perPortionNutrition} IS NOT NULL)`), check("meal_items_amount_decision_valid",sql`${t.amountDecision} IS NULL OR ${t.amountDecision} IN ('provided','estimate_accepted','unknown_accepted')`), check("meal_items_quantity_valid", sql`${t.quantity} IS NULL OR ${t.quantity}>0`), check("meal_items_kind_valid", sql`${t.kind} IN ('food','misc','whole')`), check("meal_items_nutrition_valid", sql`(${t.caloriesKcal} IS NULL OR ${t.caloriesKcal}>=0) AND (${t.proteinG} IS NULL OR ${t.proteinG}>=0) AND (${t.carbsG} IS NULL OR ${t.carbsG}>=0) AND (${t.fatG} IS NULL OR ${t.fatG}>=0)`)]);
export const mealOperation = pgTable("meal_operations", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), operationId: text("operation_id").notNull(), origin: text("origin").notNull(), tokenId: text("token_id").references(() => aiToken.id), oauthConnectionId: text("oauth_connection_id").references(() => oauthConnection.id), importId: text("import_id"),
  requestDigest: text("request_digest").notNull(), snapshotDigest: text("snapshot_digest").notNull(), payload: jsonb("payload").$type<import("../features/meals/model").MealInput>().notNull(), draft: jsonb("draft").$type<import("../features/meals/model").MealInput>().notNull(), preview: jsonb("preview").$type<import("../features/meals/model").PreviewRow[]>().notNull(),
  revision: integer("revision").notNull().default(1), status: text("status").notNull().default("pending"), result: jsonb("result").$type<{ saved: number; message: string }>(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), expiresAt: timestamp("expires_at", { withTimezone: true }), confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, t => [uniqueIndex("meal_operations_owner_request_idx").on(t.userId, t.operationId), index("meal_operations_owner_created_idx").on(t.userId, t.createdAt), foreignKey({ columns: [t.userId, t.importId], foreignColumns: [mealImport.userId, mealImport.id] }), check("meal_operations_credential_valid", sql`(${t.origin}='ai' AND num_nonnulls(${t.tokenId},${t.oauthConnectionId})=1 AND ${t.importId} IS NULL) OR (${t.origin}='manual' AND num_nonnulls(${t.tokenId},${t.oauthConnectionId},${t.importId})=0) OR (${t.origin}='initialization' AND num_nonnulls(${t.tokenId},${t.oauthConnectionId})=0 AND ${t.importId} IS NOT NULL)`), check("meal_operations_status_valid", sql`${t.status} IN ('pending','confirmed','cancelled')`)]);
export const mealEvent = pgTable("meal_events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), recordId: text("record_id").notNull(), recordType: text("record_type").notNull(), operationId: text("operation_id").notNull().references(() => mealOperation.id), actorType: text("actor_type").notNull(), actorId: text("actor_id").notNull(), confirmedBy: text("confirmed_by").notNull(), snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("meal_events_owner_record_idx").on(t.userId, t.recordId)]);

// 饮食原图独立于营养请求；原图保留，记录删除仅影响可见状态。
export const mealImage = pgTable("meal_images", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id),
  pathname: text("pathname").notNull(), sha256: text("sha256").notNull(), mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(), fileName: text("file_name").notNull(), source: text("source").notNull(),
  sourceFileId: text("source_file_id"), createdBy: text("created_by").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("meal_images_owner_hash_idx").on(t.userId,t.sha256), uniqueIndex("meal_images_owner_id_idx").on(t.userId,t.id), check("meal_images_size_valid",sql`${t.byteSize}>0 AND ${t.byteSize}<=20971520`), check("meal_images_type_valid",sql`${t.mimeType} IN ('image/jpeg','image/png','image/webp')`)]);
export const mealImageLink = pgTable("meal_image_links", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), imageId: text("image_id").notNull(),
  mealId: text("meal_id"), foodId: text("food_id"), position: integer("position").notNull(),
}, t => [foreignKey({columns:[t.userId,t.imageId],foreignColumns:[mealImage.userId,mealImage.id]}), foreignKey({columns:[t.userId,t.mealId],foreignColumns:[meal.userId,meal.id]}), foreignKey({columns:[t.userId,t.foodId],foreignColumns:[food.userId,food.id]}), check("meal_image_links_target_valid",sql`num_nonnulls(${t.mealId},${t.foodId})=1`), uniqueIndex("meal_image_links_meal_idx").on(t.userId,t.mealId,t.imageId), uniqueIndex("meal_image_links_food_idx").on(t.userId,t.foodId,t.imageId)]);

const energyIdentityColumns = () => ({
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id),
  version: integer("version").notNull().default(1), deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
const energySourceColumns = () => ({
  timezone: text("timezone").notNull(), sourceSystem: text("source_system"), sourceRecordId: text("source_record_id"),
  sourceOccurredAt: timestamp("source_occurred_at", { withTimezone: true }), sourceUnit: text("source_unit").notNull().default("kcal"), syncStatus: text("sync_status").notNull().default("confirmed"),
});
export const energyDefault = pgTable("energy_defaults", {
  ...energyIdentityColumns(), restingFrom: date("resting_from").notNull(), restingKcal: numeric("resting_kcal", { precision: 14, scale: 4 }), zeroActivityFrom: date("zero_activity_from"),
}, t => [uniqueIndex("energy_defaults_owner_idx").on(t.userId).where(sql`${t.deletedAt} IS NULL`), check("energy_defaults_valid", sql`(${t.restingKcal} IS NULL OR ${t.restingKcal}>=0) AND ${t.version}>0`)]);
export const energyProfile = pgTable("energy_profiles", {
  ...energyIdentityColumns(), effectiveFrom: date("effective_from").notNull(), heightCm: numeric("height_cm", { precision: 7, scale: 4 }).notNull(), birthDate: date("birth_date").notNull(), sex: text("sex").notNull(),
}, t => [uniqueIndex("energy_profiles_owner_date_idx").on(t.userId, t.effectiveFrom).where(sql`${t.deletedAt} IS NULL`), check("energy_profiles_valid", sql`${t.heightCm}>0 AND ${t.heightCm}<=300 AND ${t.sex} IN ('male','female') AND ${t.birthDate}<${t.effectiveFrom} AND ${t.version}>0`)]);
export const energyDay = pgTable("energy_days", {
  entryMode: text("entry_mode").$type<"components" | "total">(), activityMode: text("activity_mode").$type<"total" | "activities">(), restingSourceSystem: text("resting_source_system"), activeSourceSystem: text("active_source_system"), restingEstimated: boolean("resting_estimated").notNull().default(false),
  ...energyIdentityColumns(), ...energySourceColumns(), activeEstimated: boolean("active_estimated").notNull().default(false), notes: text("notes"), date: date("local_date").notNull(), restingKcal: numeric("resting_kcal", { precision: 14, scale: 4 }), activeKcal: numeric("active_kcal", { precision: 14, scale: 4 }), totalKcal: numeric("total_kcal", { precision: 14, scale: 4 }),
}, t => [uniqueIndex("energy_days_owner_date_idx").on(t.userId,t.date).where(sql`${t.deletedAt} IS NULL`), check("energy_days_modes_valid", sql`${t.entryMode} IN ('components','total') AND ${t.activityMode} IN ('total','activities')`), check("energy_days_values_valid", sql`(${t.restingKcal} IS NULL OR ${t.restingKcal}>=0) AND (${t.activeKcal} IS NULL OR ${t.activeKcal}>=0) AND (${t.totalKcal} IS NULL OR ${t.totalKcal}>=0) AND ${t.version}>0 AND ${t.sourceUnit}='kcal' AND ${t.syncStatus}='confirmed'`)]);
export const activity = pgTable("activities", {
  calorieMode:text("calorie_mode").$type<"total"|"components">(), exerciseRestingKcal:numeric("resting_kcal",{precision:14,scale:4}), exerciseActiveKcal:numeric("active_kcal",{precision:14,scale:4}),
  inclusion:text("inclusion").$type<"included"|"additional">(), inclusionBasis:text("inclusion_basis"),
  ...energyIdentityColumns(), ...energySourceColumns(), date: date("local_date").notNull(), name: text("name").notNull(), durationMinutes: numeric("duration_minutes", { precision: 14, scale: 4 }), caloriesKcal: numeric("calories_kcal", { precision: 14, scale: 4 }), completed: boolean("completed").notNull().default(true),
}, t => [index("activities_owner_date_idx").on(t.userId,t.date), uniqueIndex("activities_owner_source_idx").on(t.userId,t.sourceSystem,t.sourceRecordId).where(sql`${t.sourceSystem} IS NOT NULL AND ${t.sourceRecordId} IS NOT NULL AND ${t.deletedAt} IS NULL`), check("activities_inclusion_valid",sql`(${t.inclusion} IS NULL AND ${t.inclusionBasis} IS NULL) OR (${t.inclusion} IS NOT NULL AND ${t.inclusion} IN ('included','additional') AND ${t.inclusionBasis} IS NOT NULL)`), check("activities_calorie_mode_valid",sql`(${t.calorieMode} IS NULL OR ${t.calorieMode} IN ('total','components')) AND (${t.exerciseRestingKcal} IS NULL OR ${t.exerciseRestingKcal}>=0) AND (${t.exerciseActiveKcal} IS NULL OR ${t.exerciseActiveKcal}>=0)`), check("activities_values_valid", sql`length(trim(${t.name}))>0 AND (${t.durationMinutes} IS NULL OR ${t.durationMinutes}>=0) AND (${t.caloriesKcal} IS NULL OR ${t.caloriesKcal}>=0) AND ${t.version}>0 AND ${t.sourceUnit}='kcal' AND ${t.syncStatus}='confirmed'`)]);
export const energyOperation = pgTable("energy_operations", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), operationId: text("operation_id").notNull(), origin: text("origin").notNull(),
  tokenId: text("token_id").references(() => aiToken.id), oauthConnectionId: text("oauth_connection_id").references(() => oauthConnection.id),
  requestDigest: text("request_digest").notNull(), snapshotDigest: text("snapshot_digest").notNull(), payload: jsonb("payload").$type<import("../features/activities/model").EnergyInput>().notNull(), draft: jsonb("draft").$type<import("../features/activities/model").EnergyInput>().notNull(), preview: jsonb("preview").$type<import("../features/activities/model").EnergyPreview[]>().notNull(),
  revision: integer("revision").notNull().default(1), status: text("status").notNull().default("pending"), expiresAt: timestamp("expires_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, t => [uniqueIndex("energy_operations_owner_request_idx").on(t.userId,t.operationId), uniqueIndex("energy_operations_owner_id_idx").on(t.userId,t.id), check("energy_operations_valid", sql`${t.origin} IN ('manual','ai') AND ${t.status} IN ('pending','confirmed','cancelled') AND ${t.revision}>0 AND ((${t.origin}='manual' AND ${t.tokenId} IS NULL AND ${t.oauthConnectionId} IS NULL) OR (${t.origin}='ai' AND num_nonnulls(${t.tokenId},${t.oauthConnectionId})=1))`)]);
export const energyEvent = pgTable("energy_events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), operationId: text("operation_id").notNull(), recordId: text("record_id").notNull(), recordType: text("record_type").notNull(), actorType: text("actor_type").notNull(), actorId: text("actor_id").notNull(), confirmedBy: text("confirmed_by").notNull().references(() => user.id), snapshot: jsonb("snapshot").$type<{ originalInput: import("../features/activities/model").EnergyAction; action: import("../features/activities/model").EnergyAction; before: import("../features/activities/model").EnergyRecord | null; after: import("../features/activities/model").EnergyRecord | null; permanentDeletion?:boolean }>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [foreignKey({columns:[t.userId,t.operationId],foreignColumns:[energyOperation.userId,energyOperation.id]}), index("energy_events_owner_record_idx").on(t.userId,t.recordId)]);

// 一个审核批次关联既有业务操作；事实写入仍由对应 feature 完成。
export const recordOperation = pgTable("record_operations", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id), operationId: text("operation_id").notNull(),
  measurementRevision: integer("measurement_revision"), mealRevision: integer("meal_revision"), energyRevision: integer("energy_revision"),
  requestDigest: text("request_digest").notNull(), payload: jsonb("payload").$type<import("../features/records/model").RecordInput>().notNull(),
  draft: jsonb("draft").$type<import("../features/records/model").RecordItem[]>().notNull(),
  measurementOperationId: text("measurement_operation_id").references(() => measurementOperation.id), mealOperationId: text("meal_operation_id").references(() => mealOperation.id), energyOperationId: text("energy_operation_id"),
  revision: integer("revision").notNull().default(1), status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, t => [foreignKey({columns:[t.userId,t.energyOperationId],foreignColumns:[energyOperation.userId,energyOperation.id]}), uniqueIndex("record_operations_energy_idx").on(t.energyOperationId), uniqueIndex("record_operations_owner_request_idx").on(t.userId,t.operationId), uniqueIndex("record_operations_measurement_idx").on(t.measurementOperationId), uniqueIndex("record_operations_meal_idx").on(t.mealOperationId), index("record_operations_owner_created_idx").on(t.userId,t.createdAt), check("record_operations_status_valid", sql`${t.status} IN ('pending','confirmed','cancelled','completed')`)]);
