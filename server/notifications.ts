import {
  createAppNotification,
  disablePushDevice,
  getActivePushTokens,
  getLedgerMembers,
  getNotificationPreferences,
  getNotificationPreferencesByScheduleTaskUid,
  getSettlementSummary,
  listLedgersForUser,
  listMonthlyReminderPreferences,
} from "./db";

type NotificationKind = "income" | "expense" | "settlement";

type NotificationPreferenceFlags = {
  incomeEnabled: number;
  expenseEnabled: number;
  minimumAmount: number;
};

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";

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
      console.warn("[Notifications] Expo push request failed", response.status);
      return { delivered: 0 };
    }
    const result = (await response.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
    await Promise.all(result.data?.map(async (receipt, index) => {
      if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
        await disablePushDevice(devices[index].token);
      }
    }) ?? []);
    return { delivered: result.data?.filter(receipt => receipt.status === "ok").length ?? 0 };
  } catch (error) {
    console.warn("[Notifications] Expo push transport error", error);
    return { delivered: 0 };
  }
}

async function createAndSend(input: { userId: number; ledgerId?: number; kind: NotificationKind; title: string; body: string; dedupeKey: string; data: Record<string, unknown> }) {
  const saved = await createAppNotification(input);
  if (!saved.created) return { created: false, delivered: 0 };
  const sent = await dispatchExpoPush(input.userId, input.title, input.body, input.data);
  return { created: true, ...sent };
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
  const preference = await getNotificationPreferencesByScheduleTaskUid(taskUid);
  if (!preference || preference.monthlySettlementEnabled !== 1) return { created: 0, skipped: "inactive-or-orphan" as const };
  return processMonthlySettlementReminders(now, preference.userId);
}
