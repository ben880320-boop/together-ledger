import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  User,
  activityLogs,
  appNotifications,
  budgets,
  categories,
  ledgerMembers,
  ledgers,
  notificationPreferences,
  paymentMethods,
  pushDevices,
  recurringTransactions,
  settlements,
  transactionSplits,
  transactions,
  travelPlans,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function requireDb() {
  if (!_db) throw new Error("Database is not available");
  return _db;
}

export type NotificationPreferenceInput = {
  incomeEnabled: number;
  expenseEnabled: number;
  minimumAmount: number;
  monthlySettlementEnabled: number;
  monthlyReminderDay: number;
};

const defaultNotificationPreferences: NotificationPreferenceInput = {
  incomeEnabled: 0,
  expenseEnabled: 0,
  minimumAmount: 0,
  monthlySettlementEnabled: 0,
  monthlyReminderDay: 28,
};

export function normalizeNotificationPreferences(input: Partial<NotificationPreferenceInput>): NotificationPreferenceInput {
  const minimumAmount = Math.max(0, Math.min(100_000_000, Math.trunc(input.minimumAmount ?? 0)));
  const monthlyReminderDay = Math.max(1, Math.min(28, Math.trunc(input.monthlyReminderDay ?? 28)));
  return {
    incomeEnabled: input.incomeEnabled ? 1 : 0,
    expenseEnabled: input.expenseEnabled ? 1 : 0,
    minimumAmount,
    monthlySettlementEnabled: input.monthlySettlementEnabled ? 1 : 0,
    monthlyReminderDay,
  };
}

export async function getNotificationPreferences(userId: number) {
  const db = requireDb();
  const existing = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(notificationPreferences).values({ userId, ...defaultNotificationPreferences });
  const created = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return created[0]!;
}

export async function updateNotificationPreferences(userId: number, input: Partial<NotificationPreferenceInput>) {
  const db = requireDb();
  const next = normalizeNotificationPreferences(input);
  const existing = await db.select({ id: notificationPreferences.id }).from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (existing[0]) {
    await db.update(notificationPreferences).set(next).where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({ userId, ...next });
  }
  return getNotificationPreferences(userId);
}

export async function updateNotificationScheduleTaskUid(userId: number, scheduleCronTaskUid: string | null) {
  const db = requireDb();
  await getNotificationPreferences(userId);
  await db.update(notificationPreferences).set({ scheduleCronTaskUid }).where(eq(notificationPreferences.userId, userId));
  return getNotificationPreferences(userId);
}

export async function getNotificationPreferencesByScheduleTaskUid(taskUid: string) {
  const db = requireDb();
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.scheduleCronTaskUid, taskUid)).limit(1);
  return rows[0] ?? null;
}

export async function listMonthlyReminderPreferences() {
  const db = requireDb();
  return db.select().from(notificationPreferences).where(eq(notificationPreferences.monthlySettlementEnabled, 1));
}

export async function reconcilePushDeviceRegistration(
  input: { userId: number; expoPushToken: string; platform: "android" | "ios" },
  existing: { id: number; isActive: number } | undefined,
  operations: {
    update: () => Promise<unknown>;
    create: () => Promise<unknown>;
  }
) {
  if (existing) {
    await operations.update();
    return existing.isActive ? "refreshed" as const : "reactivated" as const;
  }
  await operations.create();
  return "created" as const;
}

export async function upsertPushDevice(input: { userId: number; expoPushToken: string; platform: "android" | "ios" }) {
  const db = requireDb();
  const existing = await db.select({ id: pushDevices.id, isActive: pushDevices.isActive }).from(pushDevices).where(eq(pushDevices.expoPushToken, input.expoPushToken)).limit(1);
  return reconcilePushDeviceRegistration(input, existing[0], {
    update: () => db.update(pushDevices).set({ userId: input.userId, platform: input.platform, isActive: 1 }).where(eq(pushDevices.id, existing[0]!.id)),
    create: () => db.insert(pushDevices).values({ ...input, isActive: 1 }),
  });
}

export async function getActivePushTokens(userId: number) {
  const db = requireDb();
  return db.select({ token: pushDevices.expoPushToken }).from(pushDevices).where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, 1)));
}

export async function disablePushDevice(expoPushToken: string) {
  const db = requireDb();
  await db.update(pushDevices).set({ isActive: 0 }).where(eq(pushDevices.expoPushToken, expoPushToken));
}

export async function createAppNotification(input: { userId: number; ledgerId?: number; kind: "income" | "expense" | "settlement"; title: string; body: string; dedupeKey: string }) {
  const db = requireDb();
  const existing = await db.select({ id: appNotifications.id }).from(appNotifications).where(eq(appNotifications.dedupeKey, input.dedupeKey)).limit(1);
  if (existing[0]) return { created: false as const, id: existing[0].id };
  const result = await db.insert(appNotifications).values({ ...input, ledgerId: input.ledgerId ?? null });
  return { created: true as const, id: Number(result[0].insertId) };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listLedgersForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ ledger: ledgers, member: ledgerMembers })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgerMembers.ledgerId, ledgers.id))
    .where(eq(ledgerMembers.userId, userId))
    .orderBy(desc(ledgers.createdAt));
}

export async function getLedgerAccess(ledgerId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ ledger: ledgers, member: ledgerMembers })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgerMembers.ledgerId, ledgers.id))
    .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createLedger(input: {
  name: string;
  type: "couple" | "roommate" | "family" | "travel" | "custom";
  createdBy: number;
  inviteCode: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(ledgers).values(input);
  const ledgerId = Number(result[0].insertId);
  await db.insert(ledgerMembers).values({ ledgerId, userId: input.createdBy, role: "admin" });

  // Seed only reference data required by the pasted content. A new ledger must
  // still have no example transactions, budgets, recurring items, or settlements.
  // Payment methods are reference choices, not financial records, so seed the
  // same four suggestions exposed by the Android settings screen.
  const rootPresets = [
    { name: "飲食", type: "expense" as const, icon: "🍽", color: "#C98558" },
    { name: "交通", type: "expense" as const, icon: "🚗", color: "#6D8EA8" },
    { name: "生活", type: "expense" as const, icon: "⌂", color: "#7E8D70" },
    { name: "購物", type: "expense" as const, icon: "◇", color: "#B56C78" },
    { name: "情侶", type: "expense" as const, icon: "♡", color: "#9A6670" },
    { name: "薪資", type: "income" as const, icon: "＋", color: "#7E8D70" },
    { name: "其他收入", type: "income" as const, icon: "✦", color: "#6D8EA8" },
  ];
  const rootIds = new Map<string, number>();
  for (const preset of rootPresets) {
    const inserted = await db.insert(categories).values({ ledgerId, parentCategoryId: 0, ...preset });
    rootIds.set(preset.name, Number(inserted[0].insertId));
  }
  const childPresets = [
    ["飲食", "早餐"], ["飲食", "午餐"], ["飲食", "晚餐"], ["飲食", "飲料"], ["飲食", "宵夜"],
    ["交通", "加油"], ["交通", "停車"], ["交通", "高速公路"], ["交通", "大眾運輸"], ["交通", "計程車"], ["交通", "維修"],
    ["生活", "房租"], ["生活", "水電"], ["生活", "網路"], ["生活", "日用品"], ["生活", "家具"],
    ["購物", "衣服"], ["購物", "3C"], ["購物", "娛樂"], ["購物", "遊戲"],
    ["情侶", "約會"], ["情侶", "禮物"], ["情侶", "旅行"], ["情侶", "紀念日"],
  ] as const;
  await db.insert(categories).values(
    childPresets.map(([parent, name]) => ({
      ledgerId,
      parentCategoryId: rootIds.get(parent) ?? 0,
      name,
      type: "expense" as const,
      icon: "◌",
      color: rootPresets.find(item => item.name === parent)?.color ?? "#B56C78",
    })),
  );
  await db.insert(paymentMethods).values([
    { ledgerId, name: "現金", icon: "現" },
    { ledgerId, name: "信用卡", icon: "卡" },
    { ledgerId, name: "電子支付", icon: "支" },
    { ledgerId, name: "銀行轉帳", icon: "銀" },
  ]);
  return (await getLedgerAccess(ledgerId, input.createdBy))?.ledger;
}

export async function joinLedgerByInviteCode(inviteCode: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(ledgers).where(eq(ledgers.inviteCode, inviteCode)).limit(1);
  const ledger = result[0];
  if (!ledger) return undefined;
  const existing = await db
    .select({ id: ledgerMembers.id })
    .from(ledgerMembers)
    .where(and(eq(ledgerMembers.ledgerId, ledger.id), eq(ledgerMembers.userId, userId)))
    .limit(1);
  if (existing.length > 0) throw new Error("你已經加入這個帳本，不需要重複加入。");
  await db.insert(ledgerMembers).values({ ledgerId: ledger.id, userId, role: "member" });
  return ledger;
}

export async function leaveLedger(input: {
  ledgerId: number;
  userId: number;
  action: "leave" | "transfer" | "delete";
  transferToUserId?: number;
}) {
  const db = requireDb();
  const ledgerRows = await db.select().from(ledgers).where(eq(ledgers.id, input.ledgerId)).limit(1);
  const ledger = ledgerRows[0];
  if (!ledger) throw new Error("找不到帳本。");
  const memberRows = await db
    .select()
    .from(ledgerMembers)
    .where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.userId)))
    .limit(1);
  if (!memberRows[0]) throw new Error("你不是此帳本的成員。");

  if (ledger.createdBy !== input.userId) {
    if (input.action !== "leave") throw new Error("只有帳本持有者可以轉讓或移除帳本。");
    await db.delete(ledgerMembers).where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.userId)));
    return { action: "leave" as const };
  }

  if (input.action === "transfer") {
    if (!input.transferToUserId) throw new Error("請選擇另一位帳本成員接任持有者。");
    await transferLedgerOwnership({ ledgerId: input.ledgerId, userId: input.userId, targetUserId: input.transferToUserId });
    await db.delete(ledgerMembers).where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.userId)));
    return { action: "transfer" as const, transferToUserId: input.transferToUserId };
  }

  if (input.action !== "delete") throw new Error("持有者離開前必須選擇轉讓或刪除帳本。");
  const transactionRows = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, input.ledgerId));
  const transactionIds = transactionRows.map(row => row.id);
  if (transactionIds.length > 0) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, transactionIds));
  await db.delete(activityLogs).where(eq(activityLogs.ledgerId, input.ledgerId));
  await db.delete(budgets).where(eq(budgets.ledgerId, input.ledgerId));
  await db.delete(travelPlans).where(eq(travelPlans.ledgerId, input.ledgerId));
  await db.delete(recurringTransactions).where(eq(recurringTransactions.ledgerId, input.ledgerId));
  await db.delete(settlements).where(eq(settlements.ledgerId, input.ledgerId));
  await db.delete(transactions).where(eq(transactions.ledgerId, input.ledgerId));
  await db.delete(categories).where(eq(categories.ledgerId, input.ledgerId));
  await db.delete(paymentMethods).where(eq(paymentMethods.ledgerId, input.ledgerId));
  await db.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, input.ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, input.ledgerId));
  return { action: "delete" as const };
}

export async function updateUserName(userId: number, name: string) {
  const db = requireDb();
  await db.update(users).set({ name }).where(eq(users.id, userId));
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0];
}

export async function renameLedger(input: { ledgerId: number; userId: number; name: string }) {
  const db = requireDb();
  const name = input.name.trim();
  if (!name) throw new Error("帳本名稱不能是空白。");
  if (name.length > 128) throw new Error("帳本名稱不可超過 128 個字元。");
  const access = await getLedgerAccess(input.ledgerId, input.userId);
  if (!access || access.ledger.createdBy !== input.userId || access.member.role !== "admin") {
    throw new Error("只有帳本持有者可以修改帳本名稱。");
  }
  await db.update(ledgers).set({ name }).where(eq(ledgers.id, input.ledgerId));
  return (await getLedgerAccess(input.ledgerId, input.userId))?.ledger;
}

export async function transferLedgerOwnership(input: { ledgerId: number; userId: number; targetUserId: number }) {
  const db = requireDb();
  const access = await getLedgerAccess(input.ledgerId, input.userId);
  if (!access || access.ledger.createdBy !== input.userId || access.member.role !== "admin") {
    throw new Error("只有目前帳本持有者可以轉讓所有權。");
  }
  if (input.targetUserId === input.userId) throw new Error("新的持有者必須是另一位帳本成員。");
  const target = await db.select().from(ledgerMembers).where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.targetUserId))).limit(1);
  if (!target[0]) throw new Error("接任者必須是目前帳本成員。");
  await db.update(ledgers).set({ createdBy: input.targetUserId }).where(eq(ledgers.id, input.ledgerId));
  await db.update(ledgerMembers).set({ role: "member" }).where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.userId)));
  await db.update(ledgerMembers).set({ role: "admin" }).where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.targetUserId)));
  return { ledgerId: input.ledgerId, targetUserId: input.targetUserId };
}

export async function listTravelPlans(ledgerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(travelPlans).where(eq(travelPlans.ledgerId, ledgerId)).orderBy(asc(travelPlans.startDate));
}

export async function createTravelPlan(input: { ledgerId: number; userId: number; name: string; budget: number; startDate: Date; endDate: Date; notes?: string }) {
  const db = requireDb();
  const name = input.name.trim();
  if (!name) throw new Error("出遊規劃名稱不能是空白。");
  if (input.endDate.getTime() < input.startDate.getTime()) throw new Error("結束日期不能早於開始日期。");
  if (!Number.isSafeInteger(input.budget) || input.budget <= 0 || input.budget > 100_000_000) throw new Error("出遊預算必須介於 1 與 100,000,000 之間。");
  const access = await getLedgerAccess(input.ledgerId, input.userId);
  if (!access) throw new Error("你不是此帳本的成員。");
  const result = await db.insert(travelPlans).values({ ledgerId: input.ledgerId, createdBy: input.userId, name, budget: input.budget, startDate: input.startDate, endDate: input.endDate, notes: input.notes?.trim() || null });
  return Number(result[0].insertId);
}

export async function deleteTravelPlan(input: { ledgerId: number; userId: number; planId: number }) {
  const db = requireDb();
  const access = await getLedgerAccess(input.ledgerId, input.userId);
  if (!access) throw new Error("你不是此帳本的成員。");
  const plan = await db.select().from(travelPlans).where(and(eq(travelPlans.id, input.planId), eq(travelPlans.ledgerId, input.ledgerId))).limit(1);
  if (!plan[0]) throw new Error("找不到出遊規劃。");
  if (plan[0].createdBy !== input.userId && access.member.role !== "admin") throw new Error("只有建立者或帳本管理員可以刪除出遊規劃。");
  await db.delete(travelPlans).where(eq(travelPlans.id, input.planId));
  return { deleted: true };
}

export async function getLedgerMembers(ledgerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ member: ledgerMembers, user: users })
    .from(ledgerMembers)
    .innerJoin(users, eq(ledgerMembers.userId, users.id))
    .where(eq(ledgerMembers.ledgerId, ledgerId))
    .orderBy(asc(ledgerMembers.joinedAt));
}

export async function updateLedgerMemberRole(input: { ledgerId: number; userId: number; role: "admin" | "member" | "viewer" }) {
  const db = requireDb();
  await db.update(ledgerMembers).set({ role: input.role }).where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.userId)));
}

export async function getCategories(ledgerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).where(eq(categories.ledgerId, ledgerId)).orderBy(asc(categories.name));
}

async function assertUniqueCategoryName(input: { ledgerId: number; id?: number; name: string }) {
  const db = requireDb();
  const existing = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.ledgerId, input.ledgerId));
  const normalized = input.name.trim().toLocaleLowerCase();
  if (existing.some(item => item.id !== input.id && item.name.trim().toLocaleLowerCase() === normalized)) {
    throw new Error("同一帳本內已有相同名稱的分類，請改用其他名稱。");
  }
}

export async function createCategory(input: { ledgerId: number; parentCategoryId?: number; name: string; type: "expense" | "income"; icon: string; color: string }) {
  const db = requireDb();
  await assertUniqueCategoryName(input);
  const result = await db.insert(categories).values({
    ledgerId: input.ledgerId,
    parentCategoryId: input.parentCategoryId ?? 0,
    name: input.name,
    type: input.type,
    icon: input.icon,
    color: input.color,
  });
  return Number(result[0].insertId);
}
export async function updateCategory(input: { ledgerId: number; id: number; name: string; type: "expense" | "income"; icon: string; color: string }) {
  const db = requireDb();
  await assertUniqueCategoryName(input);
  await db.update(categories).set({ name: input.name, type: input.type, icon: input.icon, color: input.color }).where(and(eq(categories.id, input.id), eq(categories.ledgerId, input.ledgerId)));
  return input.id;
}
export async function setCategoryActive(input: { ledgerId: number; id: number; isActive: number }) {
  const db = requireDb();
  await db.update(categories).set({ isActive: input.isActive }).where(and(eq(categories.id, input.id), eq(categories.ledgerId, input.ledgerId)));
  return input.id;
}
export async function getPaymentMethods(ledgerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paymentMethods).where(eq(paymentMethods.ledgerId, ledgerId)).orderBy(asc(paymentMethods.id));
}

async function assertUniquePaymentMethodName(input: { ledgerId: number; id?: number; name: string }) {
  const db = requireDb();
  const existing = await db.select({ id: paymentMethods.id, name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.ledgerId, input.ledgerId));
  const normalized = input.name.trim().toLocaleLowerCase();
  if (existing.some(item => item.id !== input.id && item.name.trim().toLocaleLowerCase() === normalized)) {
    throw new Error("同一帳本內已有相同名稱的支付方式，請改用其他名稱。");
  }
}

export async function createPaymentMethod(input: { ledgerId: number; name: string; icon: string }) {
  const db = requireDb();
  await assertUniquePaymentMethodName(input);
  const result = await db.insert(paymentMethods).values({
    ledgerId: input.ledgerId,
    name: input.name,
    icon: input.icon,
  });
  return Number(result[0].insertId);
}
export async function updatePaymentMethod(input: { ledgerId: number; id: number; name: string; icon: string }) {
  const db = requireDb();
  await assertUniquePaymentMethodName(input);
  await db.update(paymentMethods).set({ name: input.name, icon: input.icon }).where(and(eq(paymentMethods.id, input.id), eq(paymentMethods.ledgerId, input.ledgerId)));
  return input.id;
}
export async function setPaymentMethodActive(input: { ledgerId: number; id: number; isActive: number }) {
  const db = requireDb();
  await db.update(paymentMethods).set({ isActive: input.isActive }).where(and(eq(paymentMethods.id, input.id), eq(paymentMethods.ledgerId, input.ledgerId)));
  return input.id;
}

export async function getTransactions(ledgerId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId)).orderBy(desc(transactions.date)).limit(limit);
}

export async function createTransaction(input: {
  ledgerId: number;
  userId: number;
  payerId: number;
  amount: number;
  type: "expense" | "income" | "transfer";
  categoryId: number;
  paymentMethodId: number;
  date: Date;
  note?: string;
  splitType: "equal" | "custom" | "amount" | "none";
  splits: Array<{ userId: number; shareAmount: number }>;
}) {
  const db = requireDb();
  const result = await db.insert(transactions).values({
    ledgerId: input.ledgerId,
    userId: input.userId,
    payerId: input.payerId,
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    paymentMethodId: input.paymentMethodId,
    date: input.date,
    note: input.note,
    splitType: input.splitType,
  });
  const transactionId = Number(result[0].insertId);
  if (input.splits.length > 0) {
    await db.insert(transactionSplits).values(input.splits.map(split => ({ transactionId, ...split })));
  }
  return transactionId;
}

export async function updateTransaction(input: {
  id: number;
  ledgerId: number;
  payerId: number;
  amount: number;
  type: "expense" | "income" | "transfer";
  categoryId: number;
  paymentMethodId: number;
  date: Date;
  note?: string;
  splitType: "equal" | "custom" | "amount" | "none";
  splits: Array<{ userId: number; shareAmount: number }>;
}) {
  const db = requireDb();
  await db.update(transactions).set({
    payerId: input.payerId,
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    paymentMethodId: input.paymentMethodId,
    date: input.date,
    note: input.note,
    splitType: input.splitType,
  }).where(and(eq(transactions.id, input.id), eq(transactions.ledgerId, input.ledgerId)));
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, input.id));
  if (input.splits.length > 0) {
    await db.insert(transactionSplits).values(input.splits.map(split => ({ transactionId: input.id, ...split })));
  }
  return input.id;
}

export async function deleteTransaction(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, input.id));
  await db.delete(transactions).where(and(eq(transactions.id, input.id), eq(transactions.ledgerId, input.ledgerId)));
  return input.id;
}

export async function archiveCategory(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  await db.update(categories).set({ isActive: 0 }).where(and(eq(categories.id, input.id), eq(categories.ledgerId, input.ledgerId)));
  return input.id;
}

export async function deleteCategory(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  const [transactionReference, recurringReference, budgetReference] = await Promise.all([
    db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ledgerId, input.ledgerId), eq(transactions.categoryId, input.id))).limit(1),
    db.select({ id: recurringTransactions.id }).from(recurringTransactions).where(and(eq(recurringTransactions.ledgerId, input.ledgerId), eq(recurringTransactions.categoryId, input.id))).limit(1),
    db.select({ id: budgets.id }).from(budgets).where(and(eq(budgets.ledgerId, input.ledgerId), eq(budgets.categoryId, input.id))).limit(1),
  ]);
  if (transactionReference[0] || recurringReference[0] || budgetReference[0]) {
    throw new Error("這個分類已被交易、固定收支或預算使用，為保留歷史資料只能隱藏，無法永久刪除。");
  }
  await db.delete(categories).where(and(eq(categories.id, input.id), eq(categories.ledgerId, input.ledgerId)));
  return input.id;
}

export async function archivePaymentMethod(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  await db.update(paymentMethods).set({ isActive: 0 }).where(and(eq(paymentMethods.id, input.id), eq(paymentMethods.ledgerId, input.ledgerId)));
  return input.id;
}

export async function deletePaymentMethod(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  const [transactionReference, recurringReference] = await Promise.all([
    db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ledgerId, input.ledgerId), eq(transactions.paymentMethodId, input.id))).limit(1),
    db.select({ id: recurringTransactions.id }).from(recurringTransactions).where(and(eq(recurringTransactions.ledgerId, input.ledgerId), eq(recurringTransactions.paymentMethodId, input.id))).limit(1),
  ]);
  if (transactionReference[0] || recurringReference[0]) {
    throw new Error("這個支付方式已被交易或固定收支使用，為保留歷史資料只能隱藏，無法永久刪除。");
  }
  await db.delete(paymentMethods).where(and(eq(paymentMethods.id, input.id), eq(paymentMethods.ledgerId, input.ledgerId)));
  return input.id;
}

export async function logActivity(input: {
  ledgerId: number;
  userId: number;
  action: "create" | "update" | "delete";
  entityType: "transaction" | "category" | "paymentMethod";
  entityId: number;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const db = requireDb();
  await db.insert(activityLogs).values({
    ledgerId: input.ledgerId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary.slice(0, 255),
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export async function getActivityLogs(ledgerId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ log: activityLogs, user: users })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.ledgerId, ledgerId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

export async function getCalendarTransactions(ledgerId: number, start: Date, end: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions).where(and(eq(transactions.ledgerId, ledgerId), gte(transactions.date, start), lt(transactions.date, end))).orderBy(asc(transactions.date));
}

export async function getAnalytics(ledgerId: number, start: Date, end: Date) {
  const db = await getDb();
  if (!db) return { income: 0, expense: 0, balance: 0, categories: [] };
  const rows = await db
    .select({
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.ledgerId, ledgerId), gte(transactions.date, start), lt(transactions.date, end)))
    .groupBy(transactions.type, transactions.categoryId, categories.name, categories.color);

  let income = 0;
  let expense = 0;
  const categoryMap = new Map<number, { id: number; name: string; color: string; amount: number }>();
  for (const row of rows) {
    const total = Number(row.total || 0);
    if (row.type === "income") income += total;
    if (row.type === "expense") {
      expense += total;
      const previous = categoryMap.get(row.categoryId) ?? { id: row.categoryId, name: row.categoryName ?? "未分類", color: row.categoryColor ?? "#B56C78", amount: 0 };
      previous.amount += total;
      categoryMap.set(row.categoryId, previous);
    }
  }
  return { income, expense, balance: income - expense, categories: Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount) };
}

export type SettlementRow = { transactionId: number; payerId: number; splitUserId: number; amount: number; shareAmount: number };

export function calculateSettlement(rows: SettlementRow[]) {
  const balances = new Map<number, number>();
  const countedTransactions = new Set<number>();
  for (const row of rows) {
    if (!countedTransactions.has(row.transactionId)) {
      balances.set(row.payerId, (balances.get(row.payerId) ?? 0) + Number(row.amount));
      countedTransactions.add(row.transactionId);
    }
    balances.set(row.splitUserId, (balances.get(row.splitUserId) ?? 0) - Number(row.shareAmount));
  }
  const sorted = Array.from(balances.entries()).sort((a, b) => b[1] - a[1]);
  const receiver = sorted[0];
  const payer = sorted[sorted.length - 1];
  const amount = receiver ? Math.max(0, Math.round(receiver[1])) : 0;
  return {
    balances: sorted.map(([userId, net]) => ({ userId, net })),
    settlement: receiver && payer && receiver[0] !== payer[0] && amount > 0 ? { fromUserId: payer[0], toUserId: receiver[0], amount } : null,
  };
}

export async function getSettlementSummary(ledgerId: number) {
  const db = await getDb();
  if (!db) return { balances: [], settlement: null };
  const rows = await db
    .select({ transactionId: transactions.id, payerId: transactions.payerId, splitUserId: transactionSplits.userId, amount: transactions.amount, shareAmount: transactionSplits.shareAmount })
    .from(transactions)
    .innerJoin(transactionSplits, eq(transactions.id, transactionSplits.transactionId))
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "expense")));
  return calculateSettlement(rows);
}

export async function listSettlements(ledgerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(settlements).where(eq(settlements.ledgerId, ledgerId)).orderBy(desc(settlements.settledAt));
}

export async function createSettlement(input: { ledgerId: number; fromUserId: number; toUserId: number; amount: number; month: string }) {
  const db = requireDb();
  const result = await db.insert(settlements).values({ ...input, status: "settled" });
  return Number(result[0].insertId);
}

export async function listBudgets(ledgerId: number, month: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgets).where(and(eq(budgets.ledgerId, ledgerId), eq(budgets.month, month))).orderBy(asc(budgets.categoryId));
}

export async function upsertBudget(input: { ledgerId: number; categoryId: number; amount: number; month: string }) {
  const db = requireDb();
  const existing = await db.select().from(budgets).where(and(eq(budgets.ledgerId, input.ledgerId), eq(budgets.categoryId, input.categoryId), eq(budgets.month, input.month))).limit(1);
  if (existing[0]) {
    await db.update(budgets).set({ amount: input.amount }).where(eq(budgets.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(budgets).values(input);
  return Number(result[0].insertId);
}

export async function listRecurring(ledgerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(recurringTransactions).where(eq(recurringTransactions.ledgerId, ledgerId)).orderBy(asc(recurringTransactions.dayOfMonth));
}

export async function createRecurring(input: {
  ledgerId: number;
  userId: number;
  title: string;
  amount: number;
  type: "expense" | "income";
  categoryId: number;
  paymentMethodId: number;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: number;
}) {
  const db = requireDb();
  const result = await db.insert(recurringTransactions).values(input);
  return Number(result[0].insertId);
}

/**
 * Apply the current due occurrence of recurring rows. The note key makes the
 * operation idempotent when multiple devices open the same ledger.
 */
export async function syncDueRecurring(ledgerId: number, userId: number) {
  const db = requireDb();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const currentDay = today.getDate();
  const members = await getLedgerMembers(ledgerId);
  const memberIds = members.map(row => row.user.id);
  if (memberIds.length === 0) return { inserted: 0 };
  let inserted = 0;
  for (const recurring of await listRecurring(ledgerId)) {
    if (!recurring.isActive || recurring.dayOfMonth > currentDay) continue;
    if (recurring.frequency === "yearly" && recurring.createdAt.getMonth() !== today.getMonth()) continue;
    const occurrence = `${yyyy}-${mm}-${String(recurring.dayOfMonth).padStart(2, "0")}`;
    const note = `[固定收支:${recurring.id}:${occurrence}] ${recurring.title}`;
    const existing = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.note, note))).limit(1);
    if (existing[0]) continue;
    const share = Math.floor(recurring.amount / memberIds.length);
    const remainder = recurring.amount - share * memberIds.length;
    await createTransaction({
      ledgerId,
      userId,
      payerId: userId,
      amount: recurring.amount,
      type: recurring.type,
      categoryId: recurring.categoryId,
      paymentMethodId: recurring.paymentMethodId,
      date: new Date(`${occurrence}T12:00:00`),
      note,
      splitType: "equal",
      splits: memberIds.map((memberId, index) => ({ userId: memberId, shareAmount: share + (index === 0 ? remainder : 0) })),
    });
    inserted += 1;
  }
  return { inserted };
}

export async function seedDemoLedgerForPreview(user: User) {
  if (!process.env.DATABASE_URL) return undefined;
  const ledgersForUser = await listLedgersForUser(user.id);
  return ledgersForUser[0]?.ledger;
}
