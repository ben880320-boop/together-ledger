import {
  createAppNotification,
  disablePushDevice,
  getActivePushTokens,
  getBudgetUsage,
  getLedgerMembers,
  getNotificationPreferences,
  getNotificationPreferencesByScheduleTaskUid,
  getSettlementSummary,
  listLedgersForUser,
  listMonthlyReminderPreferences,
  updatePushDeliveryStatus,
} from "./db";

type NotificationKind = "income" | "expense" | "settlement" | "budget";

type NotificationPreferenceFlags = {
  incomeEnabled: number;
  expenseEnabled: number;
  minimumAmount: number;
};

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";
/**
 * 使用者要求暫停所有通知功能；保留資料結構與投遞實作，日後完成 FCM 憑證設定後可再啟用。
 */
export const NOTIFICATIONS_ENABLED = false;

export function shouldNotifyTransaction(preference: NotificationPreferenceFlags, type: "income" | "expense" | "transfer", amount: number) {
  if (type === "transfer" || amount < preference.minimumAmount) return false;
  return type === "income" ? preference.incomeEnabled === 1 : preference.expenseEnabled === 1;
}

export function isMonthlyReminderDue(reminderDay: number, currentDay: number) {
  return reminderDay >= 1 && reminderDay <= 28 && reminderDay === currentDay;
}

function currency(amount: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(amount);
}

export async function dispatchExpoPush(userId: number, title: string, body: string, data: Record<string, unknown>) {
  if (!NOTIFICATIONS_ENABLED) return { delivered: 0, skipped: "notifications-disabled" as const };
  const devices = await getActivePushTokens(userId);
  if (devices.length === 0) return { delivered: 0 };

  const messages = devices.map(device => ({
    to: device.token,
    sound: "default",
    priority: "high" as const,
    title,
    body,
    data,
    ...(device.platform === "android" ? { channelId: "ledger-updates" } : {}),
  }));
  try {
    const response = await fetch(expoPushEndpoint, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      const error = `Expo HTTP ${response.status}`;
      await Promise.all(devices.map(device => updatePushDeliveryStatus({ id: device.id, status: "failed", error })));
      console.warn("[Notifications] Expo push request failed", response.status);
      return { delivered: 0 };
    }
    const result = (await response.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
    await Promise.all(result.data?.map(async (receipt, index) => {
      const device = devices[index];
      if (!device) return;
      if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
        await disablePushDevice(device.token);
        return;
      }
      await updatePushDeliveryStatus({
        id: device.id,
        status: receipt.status === "ok" ? "delivered" : "failed",
        error: receipt.status === "ok" ? null : (receipt.details?.error ?? "Expo rejected the notification"),
      });
    }) ?? []);
    return { delivered: result.data?.filter(receipt => receipt.status === "ok").length ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expo transport error";
    await Promise.all(devices.map(device => updatePushDeliveryStatus({ id: device.id, status: "failed", error: message })));
    console.warn("[Notifications] Expo push transport error", error);
    return { delivered: 0 };
  }
}

async function createAndSend(input: { userId: number; ledgerId?: number; kind: NotificationKind; title: string; body: string; dedupeKey: string; data: Record<string, unknown> }) {
  if (!NOTIFICATIONS_ENABLED) return { created: false, delivered: 0, skipped: "notifications-disabled" as const };
  const saved = await createAppNotification(input);
  if (!saved.created) return { created: false, delivered: 0 };
  const sent = await dispatchExpoPush(input.userId, input.title, input.body, input.data);
  return { created: true, ...sent };
}

function taipeiMonth(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}`;
}

export async function notifyBudgetThresholds(input: { ledgerId: number; ledgerName: string; actorUserId: number; transactionId: number; transactionDate: Date }) {
  if (!NOTIFICATIONS_ENABLED) return;
  const month = taipeiMonth(input.transactionDate);
  const [members, usages] = await Promise.all([getLedgerMembers(input.ledgerId), getBudgetUsage(input.ledgerId, month)]);
  if (usages.length === 0) return;
  await Promise.all((members ?? []).map(async member => {
    const preference = await getNotificationPreferences(member.user.id);
    const thresholds = [
      { ratio: 0.8, enabled: preference.budgetAlert80Enabled === 1, label: "80%" },
      { ratio: 1, enabled: preference.budgetAlert100Enabled === 1, label: "100%" },
    ];
    await Promise.all(usages.flatMap(usage => thresholds
      .filter(threshold => threshold.enabled && usage.spent >= Math.ceil(usage.amount * threshold.ratio))
      .map(threshold => {
        const budgetLabel = usage.categoryId === 0 ? "月總預算" : "分類預算";
        return createAndSend({
          userId: member.user.id,
          ledgerId: input.ledgerId,
          kind: "budget",
          title: `預算已達 ${threshold.label}`,
          body: `${input.ledgerName}・${budgetLabel}已使用 ${currency(usage.spent)}／${currency(usage.amount)}`,
          dedupeKey: `budget:${input.ledgerId}:${usage.budgetId}:${usage.month}:${threshold.label}:user:${member.user.id}`,
          data: { ledgerId: input.ledgerId, transactionId: input.transactionId, categoryId: usage.categoryId, month: usage.month, kind: "budget", actionPath: `/ledger/${input.ledgerId}/records?month=${usage.month}&categoryId=${usage.categoryId}` },
        });
      })));
  }));
}

export async function notifyLedgerMembersAboutTransaction(input: {
  ledgerId: number;
  ledgerName: string;
  actorUserId: number;
  transactionId: number;
  type: "income" | "expense" | "transfer";
  amount: number;
  note?: string;
}) {
  if (!NOTIFICATIONS_ENABLED) return;
  if (input.type === "transfer") return;
  const members = (await getLedgerMembers(input.ledgerId)) ?? [];
  const kind = input.type === "income" ? "income" : "expense";
  const label = kind === "income" ? "入帳" : "支出";
  await Promise.all(members
    .filter(member => member.user.id !== input.actorUserId)
    .map(async member => {
      const preference = await getNotificationPreferences(member.user.id);
      if (!shouldNotifyTransaction(preference, input.type, input.amount)) return;
      await createAndSend({
        userId: member.user.id,
        ledgerId: input.ledgerId,
        kind,
        title: `共帳${label}通知`,
        body: `${input.ledgerName}・${currency(input.amount)}${input.note ? `・${input.note}` : ""}`,
        dedupeKey: `transaction:${input.transactionId}:user:${member.user.id}`,
        data: { ledgerId: input.ledgerId, transactionId: input.transactionId, kind },
      });
    }));
}

export async function processMonthlySettlementReminders(now = new Date(), userId?: number) {
  if (!NOTIFICATIONS_ENABLED) return { created: 0 };
  const taipeiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => taipeiDate.find(item => item.type === type)?.value ?? "";
  const day = Number(part("day"));
  const monthKey = `${part("year")}-${part("month")}`;
  const preferences = userId
    ? [await getNotificationPreferences(userId)].filter(preference => preference.monthlySettlementEnabled === 1)
    : await listMonthlyReminderPreferences();
  let created = 0;

  for (const preference of preferences) {
    if (!isMonthlyReminderDue(preference.monthlyReminderDay, day)) continue;
    const ledgers = await listLedgersForUser(preference.userId);
    for (const row of ledgers) {
      const summary = await getSettlementSummary(row.ledger.id);
      const amount = summary.settlement?.amount ?? 0;
      const body = amount > 0
        ? `${row.ledger.name} 目前待結算 ${currency(amount)}，可開啟 App 查看分攤。`
        : `${row.ledger.name} 本期目前沒有待結算款項。`;
      const saved = await createAndSend({
        userId: preference.userId,
        ledgerId: row.ledger.id,
        kind: "settlement",
        title: "每月結算提醒",
        body,
        dedupeKey: `settlement:${monthKey}:ledger:${row.ledger.id}:user:${preference.userId}`,
        data: { ledgerId: row.ledger.id, kind: "settlement", month: monthKey },
      });
      if (saved.created) created += 1;
    }
  }
  return { created };
}

export async function processMonthlySettlementReminderForTask(taskUid: string, now = new Date()) {
  if (!NOTIFICATIONS_ENABLED) return { created: 0, skipped: "notifications-disabled" as const };
  const preference = await getNotificationPreferencesByScheduleTaskUid(taskUid);
  if (!preference || preference.monthlySettlementEnabled !== 1) return { created: 0, skipped: "inactive-or-orphan" as const };
  return processMonthlySettlementReminders(now, preference.userId);
}
