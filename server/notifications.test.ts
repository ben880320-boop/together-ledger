import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import {
  NOTIFICATIONS_ENABLED,
  dispatchExpoPush,
  notifyBudgetThresholds,
  notifyLedgerMembersAboutTransaction,
  processMonthlySettlementReminders,
} from "./notifications";
import { syncMonthlySettlementReminderSchedule } from "./routers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("notification suspension safeguards", () => {
  it("keeps the global notification delivery switch disabled", () => {
    expect(NOTIFICATIONS_ENABLED).toBe(false);
  });

  it("does not call Expo or read active devices while push delivery is suspended", async () => {
    const devices = vi.spyOn(db, "getActivePushTokens");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(dispatchExpoPush(7, "測試", "訊息", {})).resolves.toEqual({ delivered: 0, skipped: "notifications-disabled" });
    expect(devices).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not create transaction, budget, or settlement notifications while suspended", async () => {
    const members = vi.spyOn(db, "getLedgerMembers");
    const saved = vi.spyOn(db, "createAppNotification");
    const ledgers = vi.spyOn(db, "listLedgersForUser");

    await notifyLedgerMembersAboutTransaction({
      ledgerId: 9, ledgerName: "共同帳本", actorUserId: 1, transactionId: 44,
      type: "expense", amount: 500, note: "晚餐",
    });
    await notifyBudgetThresholds({ ledgerId: 9, ledgerName: "共同帳本", actorUserId: 1, transactionId: 44, transactionDate: new Date() });
    await expect(processMonthlySettlementReminders(new Date(), 7)).resolves.toEqual({ created: 0 });

    expect(members).not.toHaveBeenCalled();
    expect(ledgers).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });

  it("does not create or update monthly reminder schedules while suspended", async () => {
    await expect(syncMonthlySettlementReminderSchedule({
      userId: 7, sessionToken: "session", monthlySettlementEnabled: true, monthlyReminderDay: 18,
    })).resolves.toBeNull();
  });
});
