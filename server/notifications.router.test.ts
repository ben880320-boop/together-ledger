import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  upsertPushDevice: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getNotificationPreferences: mocks.getPreferences,
    updateNotificationPreferences: mocks.updatePreferences,
    upsertPushDevice: mocks.upsertPushDevice,
  };
});

import { appRouter } from "./routers";

function createNotificationContext(): TrpcContext {
  return {
    user: {
      id: 7, openId: "local_notification-test-user", email: "notify@example.com", name: "通知測試者",
      loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("notification router suspension", () => {
  afterEach(() => vi.resetAllMocks());

  it("returns the disabled state without persisting preferences or push tokens", async () => {
    const caller = appRouter.createCaller(createNotificationContext());

    await expect(caller.notifications.updatePreferences({
      incomeEnabled: true, expenseEnabled: true, minimumAmount: 500,
      monthlySettlementEnabled: true, monthlyReminderDay: 18,
    })).resolves.toEqual({ success: true, disabled: true });
    await expect(caller.notifications.registerDevice({
      expoPushToken: "ExponentPushToken[notification-disabled]", platform: "android",
    })).resolves.toEqual({ success: true, disabled: true });
    await expect(caller.notifications.status()).resolves.toMatchObject({ disabled: true, devices: [] });

    expect(mocks.getPreferences).not.toHaveBeenCalled();
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(mocks.upsertPushDevice).not.toHaveBeenCalled();
  });
});
