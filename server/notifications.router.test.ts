import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  saveTaskUid: vi.fn(),
  upsertPushDevice: vi.fn(),
  createHeartbeatJob: vi.fn(),
  listHeartbeatJobs: vi.fn(),
  updateHeartbeatJob: vi.fn(),
  getLedgerAccess: vi.fn(),
  createTransaction: vi.fn(),
  logActivity: vi.fn(),
  notifyLedgerMembersAboutTransaction: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getNotificationPreferences: mocks.getPreferences,
    updateNotificationPreferences: mocks.updatePreferences,
    updateNotificationScheduleTaskUid: mocks.saveTaskUid,
    upsertPushDevice: mocks.upsertPushDevice,
    getLedgerAccess: mocks.getLedgerAccess,
    createTransaction: mocks.createTransaction,
    logActivity: mocks.logActivity,
  };
});

vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: mocks.createHeartbeatJob,
  listHeartbeatJobs: mocks.listHeartbeatJobs,
  updateHeartbeatJob: mocks.updateHeartbeatJob,
}));

vi.mock("./notifications", async importOriginal => {
  const actual = await importOriginal<typeof import("./notifications")>();
  return { ...actual, notifyLedgerMembersAboutTransaction: mocks.notifyLedgerMembersAboutTransaction };
});

import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createNotificationContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "notification-test-user",
    email: "notify@example.com",
    name: "通知測試者",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: { authorization: "Bearer test-session" } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("notification router integration", () => {
  afterEach(() => vi.resetAllMocks());

  it("stores preferences, schedules the monthly job, and registers the Android push token", async () => {
    const preference = {
      id: 1, userId: 7, incomeEnabled: 1, expenseEnabled: 1, minimumAmount: 500,
      monthlySettlementEnabled: 1, monthlyReminderDay: 18, scheduleCronTaskUid: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    mocks.getPreferences.mockResolvedValue(preference);
    mocks.createHeartbeatJob.mockResolvedValue({ taskUid: "task_v122" });
    mocks.saveTaskUid.mockResolvedValue(undefined);
    mocks.updatePreferences.mockResolvedValue(preference);
    mocks.upsertPushDevice.mockResolvedValue("created");

    const caller = appRouter.createCaller(createNotificationContext());
    await expect(caller.notifications.updatePreferences({
      incomeEnabled: true,
      expenseEnabled: true,
      minimumAmount: 500,
      monthlySettlementEnabled: true,
      monthlyReminderDay: 18,
    })).resolves.toEqual(preference);
    await expect(caller.notifications.registerDevice({
      expoPushToken: "ExponentPushToken[v122-device]",
      platform: "android",
    })).resolves.toEqual({ success: true });

    expect(mocks.createHeartbeatJob).toHaveBeenCalledWith(
      expect.objectContaining({ name: "together-ledger-settlement-7", payload: { reminderDay: 18 } }),
      "test-session"
    );
    expect(mocks.saveTaskUid).toHaveBeenCalledWith(7, "task_v122");
    expect(mocks.updatePreferences).toHaveBeenCalledWith(7, expect.objectContaining({ minimumAmount: 500, monthlyReminderDay: 18 }));
    expect(mocks.upsertPushDevice).toHaveBeenCalledWith({ userId: 7, expoPushToken: "ExponentPushToken[v122-device]", platform: "android" });
  });

  it("accepts a replacement token after an invalid device token was disabled", async () => {
    mocks.upsertPushDevice.mockResolvedValue("created");
    const caller = appRouter.createCaller(createNotificationContext());
    await caller.notifications.registerDevice({ expoPushToken: "ExponentPushToken[replacement-device]", platform: "android" });
    expect(mocks.upsertPushDevice).toHaveBeenCalledWith({
      userId: 7,
      expoPushToken: "ExponentPushToken[replacement-device]",
      platform: "android",
    });
  });

  it("connects notification setup to a transaction mutation that dispatches to other ledger members", async () => {
    mocks.getLedgerAccess.mockResolvedValue({ ledger: { id: 9, name: "共同生活帳本" }, member: { role: "admin" } });
    mocks.createTransaction.mockResolvedValue(44);
    mocks.logActivity.mockResolvedValue(undefined);
    mocks.notifyLedgerMembersAboutTransaction.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createNotificationContext());
    await expect(caller.ledger.createTransaction({
      ledgerId: 9,
      payerId: 7,
      amount: 500,
      type: "expense",
      categoryId: 1,
      paymentMethodId: 1,
      date: new Date("2026-08-18T00:00:00.000Z"),
      note: "晚餐",
      splitType: "none",
      splits: [],
    })).resolves.toBe(44);

    expect(mocks.notifyLedgerMembersAboutTransaction).toHaveBeenCalledWith({
      ledgerId: 9,
      ledgerName: "共同生活帳本",
      actorUserId: 7,
      transactionId: 44,
      type: "expense",
      amount: 500,
      note: "晚餐",
    });
  });

  it("keeps an invalid old token inactive, deduplicates its replacement, and dispatches after one complete setup flow", async () => {
    const preference = {
      id: 1, userId: 7, incomeEnabled: 0, expenseEnabled: 1, minimumAmount: 300,
      monthlySettlementEnabled: 0, monthlyReminderDay: 15, scheduleCronTaskUid: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const devices = [
      { expoPushToken: "ExponentPushToken[old-invalid]", isActive: 0 },
    ];
    mocks.getPreferences.mockResolvedValue(preference);
    mocks.updatePreferences.mockResolvedValue(preference);
    mocks.upsertPushDevice.mockImplementation(async (input: { expoPushToken: string }) => {
      const existing = devices.find(device => device.expoPushToken === input.expoPushToken);
      if (existing) existing.isActive = 1;
      else devices.push({ expoPushToken: input.expoPushToken, isActive: 1 });
      return existing ? "refreshed" : "created";
    });
    mocks.getLedgerAccess.mockResolvedValue({ ledger: { id: 9, name: "共同生活帳本" }, member: { role: "admin" } });
    mocks.createTransaction.mockResolvedValue(45);
    mocks.logActivity.mockResolvedValue(undefined);
    mocks.notifyLedgerMembersAboutTransaction.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createNotificationContext());
    await caller.notifications.updatePreferences({
      incomeEnabled: false,
      expenseEnabled: true,
      minimumAmount: 300,
      monthlySettlementEnabled: false,
      monthlyReminderDay: 15,
    });
    await caller.notifications.registerDevice({ expoPushToken: "ExponentPushToken[new-device]", platform: "android" });
    await caller.notifications.registerDevice({ expoPushToken: "ExponentPushToken[new-device]", platform: "android" });
    await caller.ledger.createTransaction({
      ledgerId: 9,
      payerId: 7,
      amount: 300,
      type: "expense",
      categoryId: 1,
      paymentMethodId: 1,
      date: new Date("2026-08-18T00:00:00.000Z"),
      note: "交通費",
      splitType: "none",
      splits: [],
    });

    expect(devices).toEqual([
      { expoPushToken: "ExponentPushToken[old-invalid]", isActive: 0 },
      { expoPushToken: "ExponentPushToken[new-device]", isActive: 1 },
    ]);
    expect(mocks.upsertPushDevice).toHaveBeenCalledTimes(2);
    expect(mocks.updatePreferences).toHaveBeenCalledWith(7, expect.objectContaining({ expenseEnabled: 1, minimumAmount: 300 }));
    expect(mocks.notifyLedgerMembersAboutTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 45, amount: 300, type: "expense" }));
  });
});
