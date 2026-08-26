import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Stable identity key retained for existing Manus users and new local-account users. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  /** scrypt hash for local email/password authentication; never returned to mobile clients. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  /** Firebase Authentication UID linked after verified email ownership is confirmed. */
  firebaseUid: varchar("firebaseUid", { length: 128 }).unique(),
  /** Increments when an identity-security event must invalidate existing app sessions. */
  sessionVersion: int("sessionVersion").default(0).notNull(),
  /** Optional per-account legacy password migration deadline; null means no legacy-password grace period is active. */
  legacyPasswordLoginDeadline: timestamp("legacyPasswordLoginDeadline"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 共帳 Together Ledger Data Models

export const ledgers = mysqlTable("ledgers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["couple", "roommate", "family", "travel", "custom"]).default("couple").notNull(),
  icon: varchar("icon", { length: 16 }),
  currency: varchar("currency", { length: 8 }).default("NT$").notNull(),
  inviteCode: varchar("inviteCode", { length: 16 }).notNull().unique(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ledgerMembers = mysqlTable("ledgerMembers", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["admin", "member", "viewer"]).default("member").notNull(),
  nickname: varchar("nickname", { length: 64 }),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  parentCategoryId: int("parentCategoryId").default(0).notNull(), // 0 for root category, or parent id for subcategory
  name: varchar("name", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["expense", "income"]).default("expense").notNull(),
  icon: varchar("icon", { length: 32 }).default("🍜").notNull(),
  color: varchar("color", { length: 32 }).default("#FF6B6B").notNull(),
  isActive: int("isActive").default(1).notNull(),
});

export const paymentMethods = mysqlTable("paymentMethods", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  icon: varchar("icon", { length: 32 }).default("💳").notNull(),
  isActive: int("isActive").default(1).notNull(),
});

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  userId: int("userId").notNull(), // recorder
  payerId: int("payerId").notNull(), // who paid
  amount: int("amount").notNull(), // stored in cents or integer NT$
  type: mysqlEnum("type", ["expense", "income", "transfer"]).default("expense").notNull(),
  /** Set only for system-created transfers into a savings bucket. */
  savingsBucketId: int("savingsBucketId"),
  categoryId: int("categoryId").notNull(),
  paymentMethodId: int("paymentMethodId").notNull(),
  date: timestamp("date").notNull(),
  note: text("note"),
  receiptUrl: text("receiptUrl"),
  splitType: mysqlEnum("splitType", ["equal", "custom", "amount", "none"]).default("equal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  ledgerDateIdx: index("transactions_ledger_date_idx").on(table.ledgerId, table.date),
}));

export const transactionSplits = mysqlTable("transactionSplits", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  userId: int("userId").notNull(),
  shareAmount: int("shareAmount").notNull(), // how much this user should bear
});

export const recurringTransactions = mysqlTable("recurringTransactions", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 128 }).notNull(),
  amount: int("amount").notNull(),
  type: mysqlEnum("type", ["expense", "income"]).default("expense").notNull(),
  categoryId: int("categoryId").notNull(),
  paymentMethodId: int("paymentMethodId").notNull(),
  frequency: mysqlEnum("frequency", ["weekly", "monthly", "yearly"]).default("monthly").notNull(),
  dayOfMonth: int("dayOfMonth").default(1).notNull(), // e.g. 5th day of month
  isActive: int("isActive").default(1).notNull(), // 1 for active, 0 paused
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const budgets = mysqlTable("budgets", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  categoryId: int("categoryId").default(0).notNull(), // 0 for total budget
  amount: int("amount").notNull(),
  month: varchar("month", { length: 16 }).notNull(), // e.g. "2026-08"
});

export const travelPlans = mysqlTable("travelPlans", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  createdBy: int("createdBy").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  budget: int("budget").notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** A ledger-scoped savings goal, stored in the same integer unit as transactions. */
export const savingsBuckets = mysqlTable("savingsBuckets", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  createdBy: int("createdBy").notNull(),
  /** Existing ledger payment method from which each monthly savings transfer is funded. */
  paymentMethodId: int("paymentMethodId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  icon: varchar("icon", { length: 32 }).default("🎯").notNull(),
  targetAmount: int("targetAmount").notNull(),
  monthlyAmount: int("monthlyAmount").notNull(),
  dayOfMonth: int("dayOfMonth").default(1).notNull(),
  priority: int("priority").default(0).notNull(),
  isActive: int("isActive").default(1).notNull(),
  /** Archived goals are hidden from the default planning view and never receive new allocations. */
  isArchived: int("isArchived").default(0).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** One immutable automated or manual funding record; the unique key makes retries idempotent. */
export const savingsAllocations = mysqlTable("savingsAllocations", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  bucketId: int("bucketId").notNull(),
  transactionId: int("transactionId"),
  month: varchar("month", { length: 16 }).notNull(),
  scheduledAmount: int("scheduledAmount").notNull(),
  allocatedAmount: int("allocatedAmount").notNull(),
  shortfallAmount: int("shortfallAmount").notNull(),
  status: mysqlEnum("status", ["completed", "partial", "skipped"]).notNull(),
  /** `automatic` is a scheduled allocation; `manual` is a user-confirmed extra deposit. */
  source: mysqlEnum("source", ["automatic", "manual"]).default("automatic").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Durable lookup and status row for the project-level daily allocation Heartbeat. */
export const savingsAutomationSettings = mysqlTable("savingsAutomationSettings", {
  id: int("id").autoincrement().primaryKey(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).unique(),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 32 }),
  lastRunError: varchar("lastRunError", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Durable status for the daily cleanup of Firebase identities that never completed email verification. */
export const authAutomationSettings = mysqlTable("authAutomationSettings", {
  id: int("id").autoincrement().primaryKey(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).unique(),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 32 }),
  lastRunError: varchar("lastRunError", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Immutable, minimum-necessary audit record for privileged account administration. */
export const adminAccountAuditLogs = mysqlTable("adminAccountAuditLogs", {
  id: int("id").autoincrement().primaryKey(),
  adminUserId: int("adminUserId").notNull(),
  targetUserId: int("targetUserId"),
  action: mysqlEnum("action", ["promote", "delete", "emailChange", "cleanup"]).notNull(),
  summary: varchar("summary", { length: 255 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  adminCreatedIdx: index("admin_account_audit_admin_created_idx").on(table.adminUserId, table.createdAt),
  targetCreatedIdx: index("admin_account_audit_target_created_idx").on(table.targetUserId, table.createdAt),
}));

export const activityLogs = mysqlTable("activityLogs", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
  entityType: mysqlEnum("entityType", ["transaction", "category", "paymentMethod", "budget", "recurring", "savingsBucket", "savingsAllocation"]).notNull(),
  entityId: int("entityId").notNull(),
  summary: varchar("summary", { length: 255 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Durable ledger change cursors used by Web, PWA and Android SSE subscribers.
 * Events carry no financial details; clients re-fetch authorized tRPC queries.
 */
export const ledgerSyncEvents = mysqlTable("ledgerSyncEvents", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  entityId: int("entityId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  ledgerCursorIdx: index("ledgerSyncEvents_ledger_cursor_idx").on(table.ledgerId, table.id),
}));

export const settlements = mysqlTable("settlements", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  fromUserId: int("fromUserId").notNull(),
  toUserId: int("toUserId").notNull(),
  amount: int("amount").notNull(),
  month: varchar("month", { length: 16 }).notNull(), // e.g. "2026-08"
  status: mysqlEnum("status", ["pending", "settled"]).default("settled").notNull(),
  settledAt: timestamp("settledAt").defaultNow().notNull(),
});

/**
 * The current monthly settlement workflow. It remains separate from the
 * legacy history because old records can contain repeated ledger/month rows.
 */
export const monthlySettlementSnapshots = mysqlTable("monthlySettlementSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  month: varchar("month", { length: 16 }).notNull(),
  fromUserId: int("fromUserId").notNull(),
  toUserId: int("toUserId").notNull(),
  amount: int("amount").notNull(),
  proposedByUserId: int("proposedByUserId").notNull(),
  confirmedByUserId: int("confirmedByUserId"),
  status: mysqlEnum("status", ["pending", "settled", "reopened"]).default("pending").notNull(),
  version: int("version").default(1).notNull(),
  proposedAt: timestamp("proposedAt").defaultNow().notNull(),
  confirmedAt: timestamp("confirmedAt"),
  reopenedAt: timestamp("reopenedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  ledgerMonthIdx: uniqueIndex("monthly_settlements_ledger_month_idx").on(table.ledgerId, table.month),
  ledgerStatusIdx: index("monthly_settlements_ledger_status_idx").on(table.ledgerId, table.status),
}));

/** Per-user choices for transaction and monthly settlement notifications. */
export const notificationPreferences = mysqlTable("notificationPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  incomeEnabled: int("incomeEnabled").default(1).notNull(),
  expenseEnabled: int("expenseEnabled").default(1).notNull(),
  minimumAmount: int("minimumAmount").default(0).notNull(),
  monthlySettlementEnabled: int("monthlySettlementEnabled").default(0).notNull(),
  monthlyReminderDay: int("monthlyReminderDay").default(28).notNull(),
  budgetAlert80Enabled: int("budgetAlert80Enabled").default(1).notNull(),
  budgetAlert100Enabled: int("budgetAlert100Enabled").default(1).notNull(),
  /** Explicit opt-in only. Diagnostic reporting remains disabled by default. */
  diagnosticReportsEnabled: int("diagnosticReportsEnabled").default(0).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Minimal opt-in diagnostics. Ledger, transaction, invite and account data are not stored here. */
export const diagnosticReports = mysqlTable("diagnosticReports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: mysqlEnum("platform", ["android", "ios", "web"]).notNull(),
  appVersion: varchar("appVersion", { length: 32 }).notNull(),
  errorCode: varchar("errorCode", { length: 80 }).notNull(),
  message: varchar("message", { length: 512 }).notNull(),
  stack: text("stack"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("diagnosticReports_user_created_idx").on(table.userId, table.createdAt)]);

/** Multiple phones may belong to one user; tokens are disabled rather than deleted when unregistered. */
export const pushDevices = mysqlTable("pushDevices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  expoPushToken: varchar("expoPushToken", { length: 255 }).notNull().unique(),
  platform: mysqlEnum("platform", ["android", "ios"]).default("android").notNull(),
  isActive: int("isActive").default(1).notNull(),
  lastRegisteredAt: timestamp("lastRegisteredAt").defaultNow().notNull(),
  lastDeliveryAt: timestamp("lastDeliveryAt"),
  lastDeliveryStatus: varchar("lastDeliveryStatus", { length: 32 }),
  lastDeliveryError: varchar("lastDeliveryError", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Durable in-app notification feed; dedupeKey makes retries and cron callbacks idempotent. */
export const appNotifications = mysqlTable("appNotifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ledgerId: int("ledgerId"),
  kind: mysqlEnum("kind", ["income", "expense", "settlement", "budget"]).notNull(),
  title: varchar("title", { length: 128 }).notNull(),
  body: varchar("body", { length: 255 }).notNull(),
  dedupeKey: varchar("dedupeKey", { length: 128 }).notNull().unique(),
  actionPath: varchar("actionPath", { length: 255 }),
  isRead: int("isRead").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
