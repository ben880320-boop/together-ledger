import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2";
import {
  InsertUser,
  User,
  activityLogs,
  appNotifications,
  budgets,
  categories,
  diagnosticReports,
  ledgerMembers,
  ledgerSyncEvents,
  ledgers,
  monthlySettlementSnapshots,
  notificationPreferences,
  paymentMethods,
  pushDevices,
  recurringTransactions,
  savingsAllocations,
  savingsAutomationSettings,
  savingsBuckets,
  settlements,
  transactionSplits,
  transactions,
  travelPlans,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

function initializeDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool ??= createPool(process.env.DATABASE_URL);
      _db = drizzle({ client: _pool });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function getDb() {
  return initializeDb();
}

function requireDb() {
  // Public auth routes may be the first request after a cold start, before an
  // authenticated context has had a chance to call getDb().
  const db = initializeDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export type NotificationPreferenceInput = {
  incomeEnabled: number;
  expenseEnabled: number;
  minimumAmount: number;
  monthlySettlementEnabled: number;
  monthlyReminderDay: number;
  budgetAlert80Enabled: number;
  budgetAlert100Enabled: number;
};

const defaultNotificationPreferences: NotificationPreferenceInput = {
  // Shared-ledger entries should be visible to the other member by default.
  // Users can still explicitly turn either channel off in Personal Settings.
  incomeEnabled: 1,
  expenseEnabled: 1,
  minimumAmount: 0,
  monthlySettlementEnabled: 0,
  monthlyReminderDay: 28,
  budgetAlert80Enabled: 1,
  budgetAlert100Enabled: 1,
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
    budgetAlert80Enabled: input.budgetAlert80Enabled === undefined ? 1 : (input.budgetAlert80Enabled ? 1 : 0),
    budgetAlert100Enabled: input.budgetAlert100Enabled === undefined ? 1 : (input.budgetAlert100Enabled ? 1 : 0),
  };
}

export async function getNotificationPreferences(userId: number) {
  const db = requireDb();
  // The profile screen can read the preference while a user taps a setting.
  // Ensure the first-row creation is atomic so two overlapping requests cannot
  // both observe no row and then collide on the unique userId index.
  await db.insert(notificationPreferences).values({ userId, ...defaultNotificationPreferences }).onDuplicateKeyUpdate({
    set: { userId: sql`${notificationPreferences.userId}` },
  });
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

export async function updateDiagnosticReportingEnabled(userId: number, enabled: boolean) {
  const db = requireDb();
  // Keep explicit consent as a single database operation. This eliminates the
  // read-then-insert race with diagnosticsPreference on first use.
  await db.insert(notificationPreferences).values({
    userId,
    ...defaultNotificationPreferences,
    diagnosticReportsEnabled: enabled ? 1 : 0,
  }).onDuplicateKeyUpdate({
    set: { diagnosticReportsEnabled: enabled ? 1 : 0 },
  });
  return getNotificationPreferences(userId);
}

export function scrubDiagnosticText(value: string, maxLength: number) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(authorization|bearer|token|password|inviteCode)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/mysql:\/\/[^\s]+/gi, "[redacted-database-url]")
    .slice(0, maxLength);
}

export type DiagnosticReportInput = {
  platform: "android" | "ios" | "web";
  appVersion: string;
  errorCode: string;
  message: string;
  stack?: string;
};

/** Disabled diagnostics is a hard no-op; all accepted text is server-side redacted. */
export async function createDiagnosticReport(userId: number, input: DiagnosticReportInput) {
  const db = requireDb();
  const preferences = await getNotificationPreferences(userId);
  if (!preferences.diagnosticReportsEnabled) return { accepted: false as const };
  await db.insert(diagnosticReports).values({
    userId,
    platform: input.platform,
    appVersion: scrubDiagnosticText(input.appVersion, 32),
    errorCode: scrubDiagnosticText(input.errorCode, 80),
    message: scrubDiagnosticText(input.message, 512),
    stack: input.stack ? scrubDiagnosticText(input.stack, 8_000) : null,
  });
  return { accepted: true as const };
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
    update: () => db.update(pushDevices).set({ userId: input.userId, platform: input.platform, isActive: 1, lastRegisteredAt: new Date(), lastDeliveryStatus: null, lastDeliveryError: null }).where(eq(pushDevices.id, existing[0]!.id)),
    create: () => db.insert(pushDevices).values({ ...input, isActive: 1, lastRegisteredAt: new Date(), lastDeliveryStatus: null, lastDeliveryError: null }),
  });
}

export async function getActivePushTokens(userId: number) {
  const db = requireDb();
  return db.select({ id: pushDevices.id, token: pushDevices.expoPushToken, platform: pushDevices.platform }).from(pushDevices).where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, 1)));
}

export async function updatePushDeliveryStatus(input: { id: number; status: "delivered" | "failed" | "disabled"; error?: string | null }) {
  const db = requireDb();
  await db.update(pushDevices).set({
    lastDeliveryAt: new Date(),
    lastDeliveryStatus: input.status,
    lastDeliveryError: input.error?.slice(0, 255) ?? null,
    ...(input.status === "disabled" ? { isActive: 0 } : {}),
  }).where(eq(pushDevices.id, input.id));
}

export async function getPushDeviceStatus(userId: number) {
  const db = requireDb();
  return db.select({
    id: pushDevices.id,
    platform: pushDevices.platform,
    isActive: pushDevices.isActive,
    lastRegisteredAt: pushDevices.lastRegisteredAt,
    lastDeliveryAt: pushDevices.lastDeliveryAt,
    lastDeliveryStatus: pushDevices.lastDeliveryStatus,
    lastDeliveryError: pushDevices.lastDeliveryError,
  }).from(pushDevices).where(eq(pushDevices.userId, userId)).orderBy(desc(pushDevices.lastRegisteredAt));
}

export async function disablePushDevice(expoPushToken: string) {
  const db = requireDb();
  await db.update(pushDevices).set({ isActive: 0, lastDeliveryAt: new Date(), lastDeliveryStatus: "disabled", lastDeliveryError: "Expo DeviceNotRegistered" }).where(eq(pushDevices.expoPushToken, expoPushToken));
}

export async function createAppNotification(input: { userId: number; ledgerId?: number; kind: "income" | "expense" | "settlement" | "budget"; title: string; body: string; dedupeKey: string; actionPath?: string }) {
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function derivePasswordKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return result[0];
}

export async function createLocalUser(input: { email: string; password: string; name: string }) {
  const db = requireDb();
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  if (existing) throw new Error("此電子信箱已註冊，請直接登入。");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `scrypt$${salt}$${(await derivePasswordKey(input.password, salt)).toString("hex")}`;
  const openId = `local_${nanoid(21)}`;
  const result = await db.insert(users).values({
    openId,
    email,
    passwordHash,
    name: input.name.trim(),
    loginMethod: "email",
    lastSignedIn: new Date(),
  });
  const userId = Number(result[0].insertId);
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new Error("帳號建立後無法讀取，請稍後再試。");
  return user;
}

export async function verifyLocalPassword(email: string, password: string) {
  const db = requireDb();
  const user = await getUserByEmail(email);
  if (!user?.passwordHash || user.loginMethod !== "email") return undefined;
  const [algorithm, salt, expectedHash] = user.passwordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return undefined;
  const actual = await derivePasswordKey(password, salt);
  const expected = Buffer.from(expectedHash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
  return { ...user, lastSignedIn: new Date() };
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
  icon?: string | null;
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
  await publishLedgerChange({ ledgerId: ledger.id, actorUserId: userId, kind: "member.join", entityId: userId });
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
    await publishLedgerChange({ ledgerId: input.ledgerId, actorUserId: input.userId, kind: "member.leave", entityId: input.userId });
    return { action: "leave" as const };
  }

  if (input.action === "transfer") {
    if (!input.transferToUserId) throw new Error("請選擇另一位帳本成員接任持有者。");
    await transferLedgerOwnership({ ledgerId: input.ledgerId, userId: input.userId, targetUserId: input.transferToUserId });
    await db.delete(ledgerMembers).where(and(eq(ledgerMembers.ledgerId, input.ledgerId), eq(ledgerMembers.userId, input.userId)));
    await publishLedgerChange({ ledgerId: input.ledgerId, actorUserId: input.userId, kind: "member.leave", entityId: input.userId });
    return { action: "transfer" as const, transferToUserId: input.transferToUserId };
  }

  if (input.action !== "delete") throw new Error("持有者離開前必須選擇轉讓或刪除帳本。");
  const transactionRows = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, input.ledgerId));
  const transactionIds = transactionRows.map(row => row.id);
  if (transactionIds.length > 0) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, transactionIds));
  await db.delete(activityLogs).where(eq(activityLogs.ledgerId, input.ledgerId));
  await db.delete(savingsAllocations).where(eq(savingsAllocations.ledgerId, input.ledgerId));
  await db.delete(savingsBuckets).where(eq(savingsBuckets.ledgerId, input.ledgerId));
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

export async function deleteUserAccount(userId: number) {
  const db = requireDb();
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new Error("找不到帳號。");

  const preferences = (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1))[0];
  const ownedLedgers = await db.select({ id: ledgers.id }).from(ledgers).where(eq(ledgers.createdBy, userId));
  for (const owned of ownedLedgers) {
    const members = await db.select({ userId: ledgerMembers.userId, role: ledgerMembers.role })
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, owned.id))
      .orderBy(asc(ledgerMembers.joinedAt));
    const successor = members.find(member => member.userId !== userId);
    if (successor) {
      await db.update(ledgers).set({ createdBy: successor.userId }).where(eq(ledgers.id, owned.id));
      await db.update(ledgerMembers).set({ role: "admin" }).where(and(eq(ledgerMembers.ledgerId, owned.id), eq(ledgerMembers.userId, successor.userId)));
      continue;
    }

    const transactionRows = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, owned.id));
    const transactionIds = transactionRows.map(row => row.id);
    if (transactionIds.length > 0) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, transactionIds));
    await db.delete(activityLogs).where(eq(activityLogs.ledgerId, owned.id));
    await db.delete(savingsAllocations).where(eq(savingsAllocations.ledgerId, owned.id));
    await db.delete(savingsBuckets).where(eq(savingsBuckets.ledgerId, owned.id));
    await db.delete(appNotifications).where(eq(appNotifications.ledgerId, owned.id));
    await db.delete(budgets).where(eq(budgets.ledgerId, owned.id));
    await db.delete(travelPlans).where(eq(travelPlans.ledgerId, owned.id));
    await db.delete(recurringTransactions).where(eq(recurringTransactions.ledgerId, owned.id));
    await db.delete(settlements).where(eq(settlements.ledgerId, owned.id));
    await db.delete(transactions).where(eq(transactions.ledgerId, owned.id));
    await db.delete(categories).where(eq(categories.ledgerId, owned.id));
    await db.delete(paymentMethods).where(eq(paymentMethods.ledgerId, owned.id));
    await db.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, owned.id));
    await db.delete(ledgers).where(eq(ledgers.id, owned.id));
  }

  await db.delete(ledgerMembers).where(eq(ledgerMembers.userId, userId));
  await db.delete(pushDevices).where(eq(pushDevices.userId, userId));
  await db.delete(diagnosticReports).where(eq(diagnosticReports.userId, userId));
  await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  await db.delete(appNotifications).where(eq(appNotifications.userId, userId));
  await db.update(users).set({
    openId: `deleted_${nanoid(21)}`,
    email: null,
    passwordHash: null,
    name: "已刪除帳號",
    loginMethod: "deleted",
  }).where(eq(users.id, userId));
  return { scheduleCronTaskUid: preferences?.scheduleCronTaskUid ?? null };
}

export async function renameLedger(input: { ledgerId: number; userId: number; name: string; icon?: string | null }) {
  const db = requireDb();
  const name = input.name.trim();
  if (!name) throw new Error("帳本名稱不能是空白。");
  if (name.length > 128) throw new Error("帳本名稱不可超過 128 個字元。");
  const access = await getLedgerAccess(input.ledgerId, input.userId);
  if (!access || access.ledger.createdBy !== input.userId || access.member.role !== "admin") {
    throw new Error("只有帳本持有者可以修改帳本名稱。");
  }
  const icon = input.icon === undefined ? undefined : input.icon?.trim().slice(0, 16) || null;
  await db.update(ledgers).set({ name, ...(icon === undefined ? {} : { icon }) }).where(eq(ledgers.id, input.ledgerId));
  await publishLedgerChange({ ledgerId: input.ledgerId, actorUserId: input.userId, kind: "ledger.settings" });
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
  await publishLedgerChange({ ledgerId: input.ledgerId, actorUserId: input.userId, kind: "ledger.transfer", entityId: input.targetUserId });
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
  await publishLedgerChange({ ledgerId: input.ledgerId, actorUserId: input.userId, kind: "member.role", entityId: input.userId });
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

export async function getTransactionForLedger(ledgerId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: transactions.id, date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createTransaction(input: {
  ledgerId: number;
  userId: number;
  payerId: number;
  amount: number;
  type: "expense" | "income" | "transfer";
  savingsBucketId?: number | null;
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
    savingsBucketId: input.savingsBucketId ?? null,
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
  const existing = await db.select({ savingsBucketId: transactions.savingsBucketId })
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.ledgerId, input.ledgerId)))
    .limit(1);
  if (existing[0]?.savingsBucketId) throw new Error("自動儲蓄轉存不可直接編輯，請調整儲蓄桶設定。");
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
  const existing = await db.select({ savingsBucketId: transactions.savingsBucketId })
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.ledgerId, input.ledgerId)))
    .limit(1);
  if (existing[0]?.savingsBucketId) throw new Error("自動儲蓄轉存不可直接刪除，請停止或調整儲蓄桶。");
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
  const savingsReference = await db.select({ id: savingsBuckets.id }).from(savingsBuckets)
    .where(and(eq(savingsBuckets.ledgerId, input.ledgerId), eq(savingsBuckets.paymentMethodId, input.id), eq(savingsBuckets.isActive, 1)))
    .limit(1);
  if (savingsReference[0]) {
    throw new Error("這個支付方式正被啟用中的儲蓄桶扣款使用，請先停止或更換該儲蓄桶的扣款方式。");
  }
  await db.update(paymentMethods).set({ isActive: 0 }).where(and(eq(paymentMethods.id, input.id), eq(paymentMethods.ledgerId, input.ledgerId)));
  return input.id;
}

export async function deletePaymentMethod(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  const [transactionReference, recurringReference, savingsReference] = await Promise.all([
    db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ledgerId, input.ledgerId), eq(transactions.paymentMethodId, input.id))).limit(1),
    db.select({ id: recurringTransactions.id }).from(recurringTransactions).where(and(eq(recurringTransactions.ledgerId, input.ledgerId), eq(recurringTransactions.paymentMethodId, input.id))).limit(1),
    db.select({ id: savingsBuckets.id }).from(savingsBuckets).where(and(eq(savingsBuckets.ledgerId, input.ledgerId), eq(savingsBuckets.paymentMethodId, input.id))).limit(1),
  ]);
  if (transactionReference[0] || recurringReference[0] || savingsReference[0]) {
    throw new Error("這個支付方式已被交易、固定收支或儲蓄桶使用，為保留歷史資料只能隱藏，無法永久刪除。");
  }
  await db.delete(paymentMethods).where(and(eq(paymentMethods.id, input.id), eq(paymentMethods.ledgerId, input.ledgerId)));
  return input.id;
}

export async function logActivity(input: {
  ledgerId: number;
  userId: number;
  action: "create" | "update" | "delete";
  entityType: "transaction" | "category" | "paymentMethod" | "budget" | "recurring" | "savingsBucket" | "savingsAllocation";
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
  try {
    await recordLedgerChange({
      ledgerId: input.ledgerId,
      actorUserId: input.userId,
      kind: input.entityType,
      entityId: input.entityId,
    });
  } catch (error) {
    // Financial writes must remain durable even when the optional realtime hint
    // cannot be recorded. Clients retain their normal refresh/retry fallback.
    console.warn("[Realtime] Failed to record ledger change", error);
  }
}

export async function recordLedgerChange(input: {
  ledgerId: number;
  actorUserId: number;
  kind: string;
  entityId?: number | null;
}) {
  const db = requireDb();
  await db.insert(ledgerSyncEvents).values({
    ledgerId: input.ledgerId,
    actorUserId: input.actorUserId,
    kind: input.kind.slice(0, 64),
    entityId: input.entityId ?? null,
  });
}

async function publishLedgerChange(input: {
  ledgerId: number;
  actorUserId: number;
  kind: string;
  entityId?: number | null;
}) {
  try {
    await recordLedgerChange(input);
  } catch (error) {
    // Realtime is an acceleration layer. A failed hint must never roll back a
    // completed ledger mutation; normal reload remains available to all clients.
    console.warn("[Realtime] Failed to publish ledger change", error);
  }
}

export async function getLedgerChangesSince(input: { ledgerId: number; cursor: number }) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ledgerSyncEvents)
    .where(and(eq(ledgerSyncEvents.ledgerId, input.ledgerId), gt(ledgerSyncEvents.id, input.cursor)))
    .orderBy(asc(ledgerSyncEvents.id))
    .limit(40);
}

export type SavingsBucketWriteInput = {
  ledgerId: number;
  paymentMethodId: number;
  name: string;
  icon: string;
  targetAmount: number;
  monthlyAmount: number;
  dayOfMonth: number;
  priority: number;
  isActive: number;
};

function normalizeSavingsBucketInput(input: SavingsBucketWriteInput) {
  const name = input.name.trim();
  if (!name) throw new Error("儲蓄桶名稱不能是空白。");
  if (name.length > 128) throw new Error("儲蓄桶名稱不可超過 128 個字元。");
  const targetAmount = Math.trunc(input.targetAmount);
  const monthlyAmount = Math.trunc(input.monthlyAmount);
  if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) throw new Error("目標金額必須為大於零的整數。");
  if (!Number.isSafeInteger(monthlyAmount) || monthlyAmount <= 0) throw new Error("每月存入額度必須為大於零的整數。");
  const dayOfMonth = Math.trunc(input.dayOfMonth);
  if (dayOfMonth < 1 || dayOfMonth > 28) throw new Error("每月自動分配日期必須介於 1 至 28 日。");
  return {
    ...input,
    name,
    icon: input.icon.trim().slice(0, 32) || "🎯",
    targetAmount,
    monthlyAmount,
    dayOfMonth,
    priority: Math.max(0, Math.min(100000, Math.trunc(input.priority))),
    isActive: input.isActive ? 1 : 0,
  };
}

async function assertSavingsPaymentMethod(ledgerId: number, paymentMethodId: number) {
  const db = requireDb();
  const paymentMethod = await db.select({ id: paymentMethods.id, isActive: paymentMethods.isActive })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.ledgerId, ledgerId)))
    .limit(1);
  if (!paymentMethod[0] || !paymentMethod[0].isActive) throw new Error("請選擇帳本中啟用的扣款支付方式。");
}

export async function listSavingsBuckets(ledgerId: number) {
  const db = requireDb();
  const [buckets, allocationRows] = await Promise.all([
    db.select().from(savingsBuckets).where(eq(savingsBuckets.ledgerId, ledgerId)).orderBy(asc(savingsBuckets.priority), asc(savingsBuckets.createdAt)),
    db.select({ bucketId: savingsAllocations.bucketId, total: sql<number>`COALESCE(SUM(${savingsAllocations.allocatedAmount}), 0)` })
      .from(savingsAllocations)
      .where(eq(savingsAllocations.ledgerId, ledgerId))
      .groupBy(savingsAllocations.bucketId),
  ]);
  const totals = new Map(allocationRows.map(row => [row.bucketId, Number(row.total ?? 0)]));
  return buckets.map(bucket => {
    const savedAmount = totals.get(bucket.id) ?? 0;
    return { ...bucket, savedAmount, remainingAmount: Math.max(0, Number(bucket.targetAmount) - savedAmount) };
  });
}

export async function listSavingsAllocations(ledgerId: number, bucketId?: number) {
  const db = requireDb();
  return db.select().from(savingsAllocations)
    .where(bucketId === undefined
      ? eq(savingsAllocations.ledgerId, ledgerId)
      : and(eq(savingsAllocations.ledgerId, ledgerId), eq(savingsAllocations.bucketId, bucketId)))
    .orderBy(desc(savingsAllocations.createdAt));
}

export async function createSavingsBucket(input: SavingsBucketWriteInput & { createdBy: number }) {
  const db = requireDb();
  const next = normalizeSavingsBucketInput(input);
  await assertSavingsPaymentMethod(next.ledgerId, next.paymentMethodId);
  const result = await db.insert(savingsBuckets).values({ ...next, createdBy: input.createdBy });
  return Number(result[0].insertId);
}

export async function updateSavingsBucket(input: SavingsBucketWriteInput & { id: number; expectedVersion: number }) {
  const db = requireDb();
  const next = normalizeSavingsBucketInput(input);
  await assertSavingsPaymentMethod(next.ledgerId, next.paymentMethodId);
  const existing = await db.select().from(savingsBuckets)
    .where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId)))
    .limit(1);
  if (!existing[0]) throw new Error("找不到儲蓄桶。");
  if (existing[0].version !== input.expectedVersion) throw new Error("SAVINGS_BUCKET_CONFLICT");
  const updateResult = await db.update(savingsBuckets).set({
    paymentMethodId: next.paymentMethodId,
    name: next.name,
    icon: next.icon,
    targetAmount: next.targetAmount,
    monthlyAmount: next.monthlyAmount,
    dayOfMonth: next.dayOfMonth,
    priority: next.priority,
    isActive: next.isActive,
    version: existing[0].version + 1,
  }).where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId), eq(savingsBuckets.version, input.expectedVersion)));
  if (Number(updateResult[0]?.affectedRows ?? 0) !== 1) throw new Error("SAVINGS_BUCKET_CONFLICT");
  const updated = await db.select().from(savingsBuckets).where(eq(savingsBuckets.id, input.id)).limit(1);
  if (!updated[0]) throw new Error("找不到儲蓄桶。");
  return updated[0];
}

export async function stopSavingsBucket(input: { id: number; ledgerId: number; expectedVersion: number }) {
  const db = requireDb();
  const existing = await db.select().from(savingsBuckets)
    .where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId)))
    .limit(1);
  if (!existing[0]) throw new Error("找不到儲蓄桶。");
  if (existing[0].version !== input.expectedVersion) throw new Error("SAVINGS_BUCKET_CONFLICT");
  const stopResult = await db.update(savingsBuckets).set({ isActive: 0, version: existing[0].version + 1 })
    .where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId), eq(savingsBuckets.version, input.expectedVersion)));
  if (Number(stopResult[0]?.affectedRows ?? 0) !== 1) throw new Error("SAVINGS_BUCKET_CONFLICT");
  return input.id;
}

/** Archives a completed goal without deleting its transfer or allocation audit trail. */
export async function archiveSavingsBucket(input: { id: number; ledgerId: number; expectedVersion: number }) {
  const db = requireDb();
  const [existing, totals] = await Promise.all([
    db.select().from(savingsBuckets).where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId))).limit(1),
    db.select({ total: sql<number>`COALESCE(SUM(${savingsAllocations.allocatedAmount}), 0)` }).from(savingsAllocations).where(and(eq(savingsAllocations.ledgerId, input.ledgerId), eq(savingsAllocations.bucketId, input.id))),
  ]);
  if (!existing[0]) throw new Error("找不到儲蓄桶。");
  if (existing[0].version !== input.expectedVersion) throw new Error("SAVINGS_BUCKET_CONFLICT");
  if (Number(totals[0]?.total ?? 0) < Number(existing[0].targetAmount)) throw new Error("只有已達成目標的儲蓄桶可以封存。");
  const result = await db.update(savingsBuckets).set({ isArchived: 1, isActive: 0, version: existing[0].version + 1 })
    .where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId), eq(savingsBuckets.version, input.expectedVersion), eq(savingsBuckets.isArchived, 0)));
  if (Number(result[0]?.affectedRows ?? 0) !== 1) throw new Error("SAVINGS_BUCKET_CONFLICT");
  return input.id;
}

/** Restores an archived goal to the planning view while keeping automatic allocations paused. */
export async function restoreSavingsBucket(input: { id: number; ledgerId: number; expectedVersion: number }) {
  const db = requireDb();
  const existing = await db.select().from(savingsBuckets)
    .where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId)))
    .limit(1);
  if (!existing[0]) throw new Error("找不到儲蓄桶。");
  if (existing[0].version !== input.expectedVersion) throw new Error("SAVINGS_BUCKET_CONFLICT");
  const result = await db.update(savingsBuckets).set({ isArchived: 0, version: existing[0].version + 1 })
    .where(and(eq(savingsBuckets.id, input.id), eq(savingsBuckets.ledgerId, input.ledgerId), eq(savingsBuckets.version, input.expectedVersion), eq(savingsBuckets.isArchived, 1)));
  if (Number(result[0]?.affectedRows ?? 0) !== 1) throw new Error("SAVINGS_BUCKET_CONFLICT");
  return input.id;
}

/**
 * Records a user-confirmed extra deposit as an immutable transfer and allocation audit row.
 * The bucket version is advanced in the same transaction, so a retry or concurrent write
 * cannot double-deposit against the same client-visible balance.
 */
export async function addSavingsDeposit(input: {
  ledgerId: number;
  bucketId: number;
  expectedVersion: number;
  amount: number;
  userId: number;
}) {
  const db = requireDb();
  const amount = Math.trunc(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("額外存入金額必須為大於零的整數。");

  const now = new Date();
  const { month } = taipeiMonthAndDay(now);
  const categoryId = await ensureSavingsTransferCategoryId(input.ledgerId);

  return db.transaction(async tx => {
    const [bucket] = await tx.select().from(savingsBuckets)
      .where(and(eq(savingsBuckets.id, input.bucketId), eq(savingsBuckets.ledgerId, input.ledgerId)))
      .limit(1);
    if (!bucket) throw new Error("找不到儲蓄桶。");
    if (bucket.version !== input.expectedVersion) throw new Error("SAVINGS_BUCKET_CONFLICT");
    if (bucket.isArchived) throw new Error("已封存的儲蓄桶無法額外存入，請先重新顯示此目標。");

    const [payment, savedRows, currentTransactions] = await Promise.all([
      tx.select({ id: paymentMethods.id }).from(paymentMethods)
        .where(and(eq(paymentMethods.id, bucket.paymentMethodId), eq(paymentMethods.ledgerId, input.ledgerId), eq(paymentMethods.isActive, 1)))
        .limit(1),
      tx.select({ total: sql<number>`COALESCE(SUM(${savingsAllocations.allocatedAmount}), 0)` }).from(savingsAllocations)
        .where(and(eq(savingsAllocations.ledgerId, input.ledgerId), eq(savingsAllocations.bucketId, bucket.id))),
      tx.select({ type: transactions.type, amount: transactions.amount }).from(transactions)
        .where(eq(transactions.ledgerId, input.ledgerId)),
    ]);

    if (!payment[0]) throw new Error("此儲蓄桶的扣款支付方式已停用，請先在設定中啟用或更換支付方式。");
    const savedAmount = Number(savedRows[0]?.total ?? 0);
    const remainingAmount = Math.max(0, Number(bucket.targetAmount) - savedAmount);
    if (remainingAmount <= 0) throw new Error("此儲蓄桶已達成目標，無法再額外存入。");
    if (amount > remainingAmount) throw new Error(`額外存入不可超過剩餘目標 ${remainingAmount}。`);

    const availableAmount = Math.max(0, currentTransactions.reduce(
      (total, row) => total + (row.type === "income" ? Number(row.amount) : -Number(row.amount)),
      0,
    ));
    if (amount > availableAmount) throw new Error(`帳本可用餘額不足，目前可存入 ${availableAmount}。`);

    const transactionResult = await tx.insert(transactions).values({
      ledgerId: input.ledgerId,
      userId: input.userId,
      payerId: input.userId,
      amount,
      type: "transfer",
      savingsBucketId: bucket.id,
      categoryId,
      paymentMethodId: bucket.paymentMethodId,
      date: now,
      note: `[儲蓄桶:${bucket.id}:manual] ${bucket.name} 額外存入`,
      splitType: "none",
    });
    const transactionId = Number(transactionResult[0].insertId);
    const allocationResult = await tx.insert(savingsAllocations).values({
      ledgerId: input.ledgerId,
      bucketId: bucket.id,
      transactionId,
      month,
      scheduledAmount: amount,
      allocatedAmount: amount,
      shortfallAmount: 0,
      status: "completed",
      source: "manual",
      idempotencyKey: `savings:manual:${bucket.id}:v${input.expectedVersion}`,
    });
    const allocationId = Number(allocationResult[0].insertId);
    const versionResult = await tx.update(savingsBuckets).set({ version: bucket.version + 1 })
      .where(and(eq(savingsBuckets.id, bucket.id), eq(savingsBuckets.ledgerId, input.ledgerId), eq(savingsBuckets.version, input.expectedVersion)));
    if (Number(versionResult[0]?.affectedRows ?? 0) !== 1) throw new Error("SAVINGS_BUCKET_CONFLICT");
    await tx.insert(activityLogs).values({
      ledgerId: input.ledgerId,
      userId: input.userId,
      action: "create",
      entityType: "savingsAllocation",
      entityId: allocationId,
      summary: `額外存入 ${bucket.name}`,
      metadata: JSON.stringify({ bucketId: bucket.id, transactionId, amount, source: "manual" }),
    });
    return { bucketId: bucket.id, allocationId, transactionId, amount, source: "manual" as const };
  });
}

async function ensureSavingsTransferCategoryId(ledgerId: number) {
  const db = requireDb();
  const existing = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.name, "儲蓄轉存"), eq(categories.type, "expense")))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const result = await db.insert(categories).values({
    ledgerId,
    parentCategoryId: 0,
    name: "儲蓄轉存",
    type: "expense",
    icon: "🏦",
    color: "#6D8EA8",
    isActive: 0,
  });
  return Number(result[0].insertId);
}

function taipeiMonthAndDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return { month: `${value("year")}-${value("month")}`, day: Number(value("day")) };
}

/** Executes at or after a bucket's configured day; its allocation key makes retries idempotent. */
export async function runDueSavingsAllocations(now = new Date()) {
  const db = requireDb();
  const { month, day } = taipeiMonthAndDay(now);
  const buckets = await db.select().from(savingsBuckets)
    .where(and(eq(savingsBuckets.isActive, 1), eq(savingsBuckets.isArchived, 0), lte(savingsBuckets.dayOfMonth, day)))
    .orderBy(asc(savingsBuckets.ledgerId), asc(savingsBuckets.priority), asc(savingsBuckets.createdAt));
  const results: Array<{ bucketId: number; status: "completed" | "partial" | "skipped"; allocatedAmount: number; shortfallAmount: number }> = [];

  for (const bucket of buckets) {
    const idempotencyKey = `savings:${bucket.id}:${month}`;
    const previous = await db.select({ id: savingsAllocations.id }).from(savingsAllocations)
      .where(eq(savingsAllocations.idempotencyKey, idempotencyKey)).limit(1);
    if (previous[0]) continue;
    const categoryId = await ensureSavingsTransferCategoryId(bucket.ledgerId);
    try {
      const outcome = await db.transaction(async tx => {
        const [currentTransactions, savedRows, payment] = await Promise.all([
          tx.select({ type: transactions.type, amount: transactions.amount }).from(transactions).where(eq(transactions.ledgerId, bucket.ledgerId)),
          tx.select({ total: sql<number>`COALESCE(SUM(${savingsAllocations.allocatedAmount}), 0)` }).from(savingsAllocations).where(eq(savingsAllocations.bucketId, bucket.id)),
          tx.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.id, bucket.paymentMethodId), eq(paymentMethods.ledgerId, bucket.ledgerId), eq(paymentMethods.isActive, 1))).limit(1),
        ]);
        const availableAmount = Math.max(0, currentTransactions.reduce((total, row) => total + (row.type === "income" ? Number(row.amount) : -Number(row.amount)), 0));
        const remainingTarget = Math.max(0, Number(bucket.targetAmount) - Number(savedRows[0]?.total ?? 0));
        const allocatedAmount = payment[0] ? Math.min(Number(bucket.monthlyAmount), availableAmount, remainingTarget) : 0;
        const shortfallAmount = Number(bucket.monthlyAmount) - allocatedAmount;
        const status = allocatedAmount === 0 ? "skipped" as const : shortfallAmount > 0 ? "partial" as const : "completed" as const;
        let transactionId: number | null = null;
        if (allocatedAmount > 0) {
          const transaction = await tx.insert(transactions).values({
            ledgerId: bucket.ledgerId,
            userId: bucket.createdBy,
            payerId: bucket.createdBy,
            amount: allocatedAmount,
            type: "transfer",
            savingsBucketId: bucket.id,
            categoryId,
            paymentMethodId: bucket.paymentMethodId,
            date: now,
            note: `[儲蓄桶:${bucket.id}:${month}] ${bucket.name}`,
            splitType: "none",
          });
          transactionId = Number(transaction[0].insertId);
        }
        await tx.insert(savingsAllocations).values({
          ledgerId: bucket.ledgerId,
          bucketId: bucket.id,
          transactionId,
          month,
          scheduledAmount: Number(bucket.monthlyAmount),
          allocatedAmount,
          shortfallAmount,
          status,
          source: "automatic",
          idempotencyKey,
        });
        await tx.insert(activityLogs).values({
          ledgerId: bucket.ledgerId,
          userId: bucket.createdBy,
          action: "create",
          entityType: "savingsAllocation",
          entityId: bucket.id,
          summary: status === "completed" ? `自動轉存 ${bucket.name}` : status === "partial" ? `${bucket.name} 部分自動轉存` : `${bucket.name} 本月自動轉存略過`,
          metadata: JSON.stringify({ month, scheduledAmount: Number(bucket.monthlyAmount), allocatedAmount, shortfallAmount, transactionId }),
        });
        return { bucketId: bucket.id, status, allocatedAmount, shortfallAmount };
      });
      results.push(outcome);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate|Duplicate/i.test(message)) throw error;
    }
  }
  return { month, results };
}

export async function getSavingsAutomationStatus() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(savingsAutomationSettings).orderBy(desc(savingsAutomationSettings.updatedAt)).limit(1);
  return rows[0] ?? null;
}

export async function getSavingsAutomationStatusByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(savingsAutomationSettings)
    .where(eq(savingsAutomationSettings.scheduleCronTaskUid, taskUid))
    .limit(1);
  return rows[0] ?? null;
}

/** Stores the project-wide daily savings automation task UID in a stable singleton row. */
export async function saveSavingsAutomationTaskUid(taskUid: string) {
  const db = requireDb();
  await db.insert(savingsAutomationSettings).values({ id: 1, scheduleCronTaskUid: taskUid }).onDuplicateKeyUpdate({
    set: { scheduleCronTaskUid: taskUid, updatedAt: new Date() },
  });
  return getSavingsAutomationStatus();
}

export async function recordSavingsAutomationRun(input: {
  taskUid: string;
  status: "success" | "failed";
  error?: string | null;
  ranAt?: Date;
}) {
  const db = requireDb();
  const existing = await db.select({ id: savingsAutomationSettings.id }).from(savingsAutomationSettings)
    .where(eq(savingsAutomationSettings.scheduleCronTaskUid, input.taskUid))
    .limit(1);
  if (!existing[0]) return null;
  await db.update(savingsAutomationSettings).set({
    lastRunAt: input.ranAt ?? new Date(),
    lastRunStatus: input.status,
    lastRunError: input.error ? input.error.slice(0, 255) : null,
  }).where(eq(savingsAutomationSettings.id, existing[0].id));
  return existing[0].id;
}

export async function getActivityLogs(ledgerId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ log: activityLogs, user: users })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.ledgerId, ledgerId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
  // Retain the Android App's { log, user } entry while exposing the log
  // fields directly for the web client.  Older web builds expected a flat
  // object and otherwise attempted to format an undefined createdAt value.
  return rows.map(({ log, user }) => ({ ...log, log, user }));
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

function settlementMonthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error("月份格式必須為 YYYY-MM");
  }
  return { start: new Date(Date.UTC(year, monthNumber - 1, 1)), end: new Date(Date.UTC(year, monthNumber, 1)) };
}

export async function getSettlementSummary(ledgerId: number, month: string) {
  const db = await getDb();
  if (!db) return { balances: [], settlement: null };
  const { start, end } = settlementMonthBounds(month);
  const rows = await db
    .select({ transactionId: transactions.id, payerId: transactions.payerId, splitUserId: transactionSplits.userId, amount: transactions.amount, shareAmount: transactionSplits.shareAmount })
    .from(transactions)
    .innerJoin(transactionSplits, eq(transactions.id, transactionSplits.transactionId))
    .where(and(
      eq(transactions.ledgerId, ledgerId),
      eq(transactions.type, "expense"),
      gte(transactions.date, start),
      lt(transactions.date, end),
    ));
  return calculateSettlement(rows);
}

export async function getMonthlySettlementSnapshot(ledgerId: number, month: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(monthlySettlementSnapshots)
    .where(and(eq(monthlySettlementSnapshots.ledgerId, ledgerId), eq(monthlySettlementSnapshots.month, month)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMonthlySettlementSnapshots(ledgerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monthlySettlementSnapshots)
    .where(eq(monthlySettlementSnapshots.ledgerId, ledgerId))
    .orderBy(desc(monthlySettlementSnapshots.updatedAt));
}

export async function createMonthlySettlementSnapshot(input: {
  ledgerId: number;
  month: string;
  fromUserId: number;
  toUserId: number;
  amount: number;
  proposedByUserId: number;
}) {
  const db = requireDb();
  const result = await db.insert(monthlySettlementSnapshots).values(input);
  return Number(result[0].insertId);
}

export async function reproposeMonthlySettlementSnapshot(input: {
  ledgerId: number;
  month: string;
  expectedVersion: number;
  fromUserId: number;
  toUserId: number;
  amount: number;
  proposedByUserId: number;
}) {
  const db = requireDb();
  const result = await db.update(monthlySettlementSnapshots).set({
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    amount: input.amount,
    proposedByUserId: input.proposedByUserId,
    confirmedByUserId: null,
    confirmedAt: null,
    status: "pending",
    version: input.expectedVersion + 1,
    proposedAt: new Date(),
  }).where(and(
    eq(monthlySettlementSnapshots.ledgerId, input.ledgerId),
    eq(monthlySettlementSnapshots.month, input.month),
    eq(monthlySettlementSnapshots.status, "reopened"),
    eq(monthlySettlementSnapshots.version, input.expectedVersion),
  ));
  return Number(result[0].affectedRows ?? 0) === 1;
}

export async function confirmMonthlySettlementSnapshot(input: { ledgerId: number; month: string; expectedVersion: number; confirmedByUserId: number }) {
  const db = requireDb();
  const result = await db.update(monthlySettlementSnapshots).set({
    status: "settled",
    confirmedByUserId: input.confirmedByUserId,
    confirmedAt: new Date(),
    version: input.expectedVersion + 1,
  }).where(and(
    eq(monthlySettlementSnapshots.ledgerId, input.ledgerId),
    eq(monthlySettlementSnapshots.month, input.month),
    eq(monthlySettlementSnapshots.status, "pending"),
    eq(monthlySettlementSnapshots.version, input.expectedVersion),
  ));
  return Number(result[0].affectedRows ?? 0) === 1;
}

export async function reopenMonthlySettlementSnapshot(input: { ledgerId: number; month: string; expectedVersion: number }) {
  const db = requireDb();
  const result = await db.update(monthlySettlementSnapshots).set({
    status: "reopened",
    reopenedAt: new Date(),
    version: input.expectedVersion + 1,
  }).where(and(
    eq(monthlySettlementSnapshots.ledgerId, input.ledgerId),
    eq(monthlySettlementSnapshots.month, input.month),
    eq(monthlySettlementSnapshots.status, "settled"),
    eq(monthlySettlementSnapshots.version, input.expectedVersion),
  ));
  return Number(result[0].affectedRows ?? 0) === 1;
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

export async function getBudgetUsage(ledgerId: number, month: string) {
  const db = await getDb();
  if (!db) return [];
  const [year, monthNumber] = month.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return [];
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  const [configuredBudgets, expenseRows] = await Promise.all([
    listBudgets(ledgerId, month),
    db.select({ categoryId: transactions.categoryId, amount: transactions.amount })
      .from(transactions)
      .where(and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.type, "expense"),
        gte(transactions.date, start),
        lt(transactions.date, end),
      )),
  ]);
  const totalSpent = expenseRows.reduce((total, row) => total + Number(row.amount), 0);
  const spentByCategory = new Map<number, number>();
  expenseRows.forEach(row => spentByCategory.set(row.categoryId, (spentByCategory.get(row.categoryId) ?? 0) + Number(row.amount)));
  return configuredBudgets
    .filter(budget => Number(budget.amount) > 0)
    .map(budget => ({
      budgetId: budget.id,
      categoryId: budget.categoryId,
      amount: Number(budget.amount),
      spent: budget.categoryId === 0 ? totalSpent : (spentByCategory.get(budget.categoryId) ?? 0),
      month,
    }));
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

export async function deleteBudget(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  await db.delete(budgets).where(and(eq(budgets.id, input.id), eq(budgets.ledgerId, input.ledgerId)));
  return input.id;
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

export async function updateRecurring(input: {
  id: number;
  ledgerId: number;
  title: string;
  amount: number;
  type: "expense" | "income";
  categoryId: number;
  paymentMethodId: number;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: number;
}) {
  const db = requireDb();
  await db.update(recurringTransactions).set({
    title: input.title,
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    paymentMethodId: input.paymentMethodId,
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth,
  }).where(and(eq(recurringTransactions.id, input.id), eq(recurringTransactions.ledgerId, input.ledgerId)));
  return input.id;
}

export async function deleteRecurring(input: { id: number; ledgerId: number }) {
  const db = requireDb();
  await db.delete(recurringTransactions).where(and(eq(recurringTransactions.id, input.id), eq(recurringTransactions.ledgerId, input.ledgerId)));
  return input.id;
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
