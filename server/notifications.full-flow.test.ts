import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  upsertPushDevice: vi.fn(),
  getLedgerAccess: vi.fn(),
  createTransaction: vi.fn(),
  logActivity: vi.fn(),
  getLedgerMembers: vi.fn(),
  createAppNotification: vi.fn(),
  getActivePushTokens: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getNotificationPreferences: mocks.getPreferences,
    updateNotificationPreferences: mocks.updatePreferences,
    upsertPushDevice: mocks.upsertPushDevice,
    getLedgerAccess: mocks.getLedgerAccess,
    createTransaction: mocks.createTransaction,
    logActivity: mocks.logActivity,
    getLedgerMembers: mocks.getLedgerMembers,
    createAppNotification: mocks.createAppNotification,
    getActivePushTokens: mocks.getActivePushTokens,
  };
});

import { appRouter } from "./routers";

function createContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "notification-suspension-flow",
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

describe("notification suspension end-to-end flow", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps a valid expense write free from notification side effects", async () => {
    mocks.getLedgerAccess.mockResolvedValue({ ledger: { id: 9, name: "共同生活帳本" }, member: { role: "admin" } });
    mocks.createTransaction.mockResolvedValue(81);
    mocks.logActivity.mockResolvedValue(undefined);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const caller = appRouter.createCaller(createContext());
    await expect(caller.notifications.updatePreferences({
      incomeEnabled: false,
      expenseEnabled: true,
      minimumAmount: 300,
      monthlySettlementEnabled: false,
      monthlyReminderDay: 15,
    })).resolves.toEqual({ success: true, disabled: true });
    await expect(caller.notifications.registerDevice({
      expoPushToken: "ExponentPushToken[disabled]", platform: "android",
    })).resolves.toEqual({ success: true, disabled: true });

    await expect(caller.ledger.createTransaction({
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
    })).resolves.toBe(81);

    expect(mocks.createTransaction).toHaveBeenCalledOnce();
    expect(mocks.getPreferences).not.toHaveBeenCalled();
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(mocks.upsertPushDevice).not.toHaveBeenCalled();
    expect(mocks.getLedgerMembers).not.toHaveBeenCalled();
    expect(mocks.createAppNotification).not.toHaveBeenCalled();
    expect(mocks.getActivePushTokens).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
