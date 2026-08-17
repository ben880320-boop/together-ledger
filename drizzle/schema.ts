import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
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
  categoryId: int("categoryId").notNull(),
  paymentMethodId: int("paymentMethodId").notNull(),
  date: timestamp("date").notNull(),
  note: text("note"),
  receiptUrl: text("receiptUrl"),
  splitType: mysqlEnum("splitType", ["equal", "custom", "amount", "none"]).default("equal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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

export const activityLogs = mysqlTable("activityLogs", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
  entityType: mysqlEnum("entityType", ["transaction", "category", "paymentMethod"]).notNull(),
  entityId: int("entityId").notNull(),
  summary: varchar("summary", { length: 255 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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