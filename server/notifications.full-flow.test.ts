import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  saveTaskUid: vi.fn(),
  upsertPushDevice: vi.fn(),
  getLedgerAccess: vi.fn(),
  createTransaction: vi.fn(),
  logActivity: vi.fn(),
  getLedgerMembers: vi.fn(),
  createAppNotification: vi.fn(),
  getActivePushTokens: vi.fn(),
  disablePushDevice: vi.fn(),
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
    getLedgerMembers: mocks.getLedgerMembers,
    createAppNotification: mocks.createAppNotification,
    getActivePushTokens: mocks.getActivePushTokens,
    disablePushDevice: mocks.disablePushDevice,
  };
});

import { appRouter } from "./routers";

function createContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "full-notification-flow",
      email: "flow@example.com",
      name: "流程測試者",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: { authorization: "Bearer flow-session" } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("notification full router-to-delivery flow", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("handles device token lifecycle and delivers a qualifying expense after preference setup", async () => {
    const preference = {
      id: 1, userId: 7, incomeEnabled: 0, expenseEnabled: 1, minimumAmount: 300,
      monthlySettlementEnabled: 0, monthlyReminderDay: 15, scheduleCronTaskUid: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const devices = [{ expoPushToken: "ExponentPushToken[old]", isActive: 0 }];
    mocks.getPreferences.mockResolvedValue(preference);
    mocks.updatePreferences.mockResolvedValue(preference);
    mocks.upsertPushDevice.mockImplementation(async (input: { expoPushToken: string }) => {
      const existing = devices.find(device => device.expoPushToken === input.expoPushToken);
      if (existing) existing.isActive = 1;
      else devices.push({ expoPushToken: input.expoPushToken, isActive: 1 });
      return existing ? "refreshed" : "created";
    });
    mocks.getLedgerAccess.mockResolvedValue({ ledger: { id: 9, name: "共同生活帳本" }, member: { role: "admin" } });
    mocks.createTransaction.mockResolvedValue(81);
    mocks.logActivity.mockResolvedValue(undefined);
    mocks.getLedgerMembers.mockResolvedValue([{ user: { id: 7 } }, { user: { id: 8 } }]);
    mocks.createAppNotification.mockResolvedValue({ created: true, id: 22 });
    mocks.getActivePushTokens.mockResolvedValue([{ token: "ExponentPushToken[new]" }]);
    mocks.disablePushDevice.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "ok" }] }) }));

    const caller = appRouter.createCaller(createContext());
    await caller.notifications.updatePreferences({
      incomeEnabled: false,
      expenseEnabled: true,
      minimumAmount: 300,
      monthlySettlementEnabled: false,
      monthlyReminderDay: 15,
    });
    await caller.notifications.registerDevice({ expoPushToken: "ExponentPushToken[old]", platform: "android" });
    devices[0]!.isActive = 0; // Expo DeviceNotRegistered feedback leaves the old token disabled.
    await caller.notifications.registerDevice({ expoPushToken: "ExponentPushToken[new]", platform: "android" });
    await caller.notifications.registerDevice({ expoPushToken: "ExponentPushToken[new]", platform: "android" });
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

    await vi.waitFor(() => expect(mocks.createAppNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 8,
      dedupeKey: "transaction:81:user:8",
      kind: "expense",
    })));
    expect(devices).toEqual([
      { expoPushToken: "ExponentPushToken[old]", isActive: 0 },
      { expoPushToken: "ExponentPushToken[new]", isActive: 1 },
    ]);
    expect(mocks.upsertPushDevice).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledWith("https://exp.host/--/api/v2/push/send", expect.objectContaining({ method: "POST" }));
  });
});
