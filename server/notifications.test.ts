import { describe, expect, it, vi, afterEach } from "vitest";
import * as db from "./db";
import { normalizeNotificationPreferences, reconcilePushDeviceRegistration } from "./db";
import {
  dispatchExpoPush,
  isMonthlyReminderDue,
  notifyLedgerMembersAboutTransaction,
  processMonthlySettlementReminders,
  shouldNotifyTransaction,
} from "./notifications";
import { syncMonthlySettlementReminderSchedule } from "./routers";

const basePreference = {
  id: 1, userId: 7, incomeEnabled: 0, expenseEnabled: 0, minimumAmount: 0,
  monthlySettlementEnabled: 0, monthlyReminderDay: 28, scheduleCronTaskUid: null,
  createdAt: new Date(), updatedAt: new Date(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("notification delivery rules", () => {
  const enabled = { incomeEnabled: 1, expenseEnabled: 1, minimumAmount: 500 };

  it("respects per-type toggles and the user-selected amount threshold", () => {
    expect(shouldNotifyTransaction(enabled, "expense", 499)).toBe(false);
    expect(shouldNotifyTransaction(enabled, "expense", 500)).toBe(true);
    expect(shouldNotifyTransaction({ ...enabled, expenseEnabled: 0 }, "expense", 800)).toBe(false);
    expect(shouldNotifyTransaction(enabled, "income", 800)).toBe(true);
    expect(shouldNotifyTransaction(enabled, "transfer", 5_000)).toBe(false);
  });

  it("only issues a monthly settlement reminder on the selected valid day", () => {
    expect(isMonthlyReminderDue(28, 28)).toBe(true);
    expect(isMonthlyReminderDue(28, 27)).toBe(false);
    expect(isMonthlyReminderDue(0, 1)).toBe(false);
    expect(isMonthlyReminderDue(29, 29)).toBe(false);
  });
  it("clamps malformed notification settings to the supported reminder and amount range", () => {
    expect(normalizeNotificationPreferences({ monthlyReminderDay: 0, minimumAmount: -20 })).toMatchObject({ monthlyReminderDay: 1, minimumAmount: 0 });
    expect(normalizeNotificationPreferences({ monthlyReminderDay: 31, minimumAmount: 100_000_001 })).toMatchObject({ monthlyReminderDay: 28, minimumAmount: 100_000_000 });
  });

  it("registers a device once, refreshes duplicate registration, and reactivates a disabled token", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(undefined);
    const input = { userId: 7, expoPushToken: "ExponentPushToken[device]", platform: "android" as const };

    await expect(reconcilePushDeviceRegistration(input, undefined, { create, update })).resolves.toBe("created");
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    await expect(reconcilePushDeviceRegistration(input, { id: 2, isActive: 1 }, { create, update })).resolves.toBe("refreshed");
    await expect(reconcilePushDeviceRegistration(input, { id: 2, isActive: 0 }, { create, update })).resolves.toBe("reactivated");
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("creates, updates, and pauses the user-owned Heartbeat job with a valid Taipei reminder schedule", async () => {
    const createJob = vi.fn().mockResolvedValue({ taskUid: "cron_new" });
    const updateJob = vi.fn().mockResolvedValue({});
    const saveTaskUid = vi.fn().mockResolvedValue({});
    const dependencies = { getPreferences: vi.fn().mockResolvedValue(basePreference), createJob, updateJob, saveTaskUid };

    await syncMonthlySettlementReminderSchedule({ userId: 7, sessionToken: "session", monthlySettlementEnabled: true, monthlyReminderDay: 18 }, dependencies);
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({ name: "together-ledger-settlement-7", cron: "0 0 12 * * *", path: "/api/scheduled/monthly-settlement-reminders" }), "session");
    expect(saveTaskUid).toHaveBeenCalledWith(7, "cron_new");

    dependencies.getPreferences.mockResolvedValueOnce({ ...basePreference, scheduleCronTaskUid: "cron_existing" });
    await syncMonthlySettlementReminderSchedule({ userId: 7, sessionToken: "session", monthlySettlementEnabled: true, monthlyReminderDay: 20 }, dependencies);
    expect(updateJob).toHaveBeenCalledWith("cron_existing", expect.objectContaining({ enable: true, payload: { reminderDay: 20 } }), "session");

    dependencies.getPreferences.mockResolvedValueOnce({ ...basePreference, scheduleCronTaskUid: "cron_existing" });
    await syncMonthlySettlementReminderSchedule({ userId: 7, sessionToken: "session", monthlySettlementEnabled: false, monthlyReminderDay: 20 }, dependencies);
    expect(updateJob).toHaveBeenCalledWith("cron_existing", { enable: false }, "session");
  });

  it("delivers qualifying transaction notifications only to other enabled members", async () => {
    vi.spyOn(db, "getLedgerMembers").mockResolvedValue([
      { user: { id: 1 } }, { user: { id: 2 } },
    ] as Awaited<ReturnType<typeof db.getLedgerMembers>>);
    vi.spyOn(db, "getNotificationPreferences").mockResolvedValue({ ...basePreference, userId: 2, expenseEnabled: 1, minimumAmount: 300 });
    const create = vi.spyOn(db, "createAppNotification").mockResolvedValue({ created: true } as Awaited<ReturnType<typeof db.createAppNotification>>);
    vi.spyOn(db, "getActivePushTokens").mockResolvedValue([{ token: "ExponentPushToken[test]" }] as Awaited<ReturnType<typeof db.getActivePushTokens>>);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "ok" }] }) }));

    await notifyLedgerMembersAboutTransaction({ ledgerId: 9, ledgerName: "共用帳本", actorUserId: 1, transactionId: 44, type: "expense", amount: 500, note: "晚餐" });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 2, dedupeKey: "transaction:44:user:2", kind: "expense" }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not send a duplicated monthly reminder and disables invalid Expo devices", async () => {
    const disable = vi.spyOn(db, "disablePushDevice").mockResolvedValue(undefined as never);
    vi.spyOn(db, "getActivePushTokens").mockResolvedValue([{ token: "ExponentPushToken[stale]" }] as Awaited<ReturnType<typeof db.getActivePushTokens>>);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }) }));
    await dispatchExpoPush(7, "測試", "訊息", {});
    expect(disable).toHaveBeenCalledWith("ExponentPushToken[stale]");

    vi.spyOn(db, "getNotificationPreferences").mockResolvedValue({ ...basePreference, userId: 7, monthlySettlementEnabled: 1, monthlyReminderDay: 28 });
    vi.spyOn(db, "listLedgersForUser").mockResolvedValue([{ ledger: { id: 99, name: "旅行帳本" } }] as Awaited<ReturnType<typeof db.listLedgersForUser>>);
    vi.spyOn(db, "getSettlementSummary").mockResolvedValue({ settlement: { amount: 1200 } } as Awaited<ReturnType<typeof db.getSettlementSummary>>);
    const create = vi.spyOn(db, "createAppNotification")
      .mockResolvedValueOnce({ created: true } as Awaited<ReturnType<typeof db.createAppNotification>>)
      .mockResolvedValueOnce({ created: false } as Awaited<ReturnType<typeof db.createAppNotification>>);

    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(await processMonthlySettlementReminders(now, 7)).toEqual({ created: 1 });
    expect(await processMonthlySettlementReminders(now, 7)).toEqual({ created: 0 });
    expect(create.mock.calls[0]?.[0]).toMatchObject({ dedupeKey: "settlement:2026-08:ledger:99:user:7" });
    expect(create.mock.calls[1]?.[0]).toMatchObject({ dedupeKey: "settlement:2026-08:ledger:99:user:7" });
  });
});
