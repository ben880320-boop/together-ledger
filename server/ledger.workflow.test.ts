import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  setCategoryActive: vi.fn(),
  createLedger: vi.fn(),
  createPaymentMethod: vi.fn(),
  updatePaymentMethod: vi.fn(),
  setPaymentMethodActive: vi.fn(),
  createRecurring: vi.fn(),
  createSettlement: vi.fn(),
  createMonthlySettlementSnapshot: vi.fn(),
  reproposeMonthlySettlementSnapshot: vi.fn(),
  confirmMonthlySettlementSnapshot: vi.fn(),
  reopenMonthlySettlementSnapshot: vi.fn(),
  createTransaction: vi.fn(),
  getAnalytics: vi.fn(),
  syncDueRecurring: vi.fn(),
  getCalendarTransactions: vi.fn(),
  getCategories: vi.fn(),
  getLedgerAccess: vi.fn(),
  getLedgerMembers: vi.fn(),
  getPaymentMethods: vi.fn(),
  updateLedgerMemberRole: vi.fn(),
  updateUserName: vi.fn(),
  getSettlementSummary: vi.fn(),
  getMonthlySettlementSnapshot: vi.fn(),
  getTransactions: vi.fn(),
  joinLedgerByInviteCode: vi.fn(),
  leaveLedger: vi.fn(),
  renameLedger: vi.fn(),
  transferLedgerOwnership: vi.fn(),
  listTravelPlans: vi.fn(),
  createTravelPlan: vi.fn(),
  deleteTravelPlan: vi.fn(),
  deleteBudget: vi.fn(),
  logActivity: vi.fn(),
  listBudgets: vi.fn(),
  listLedgersForUser: vi.fn(),
  listRecurring: vi.fn(),
  listSettlements: vi.fn(),
  listMonthlySettlementSnapshots: vi.fn(),
  upsertBudget: vi.fn(),
  updateRecurring: vi.fn(),
  deleteRecurring: vi.fn(),
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  updateNotificationScheduleTaskUid: vi.fn(),
  upsertPushDevice: vi.fn(),
  listSavingsBuckets: vi.fn(),
  listSavingsAllocations: vi.fn(),
  createSavingsBucket: vi.fn(),
  updateSavingsBucket: vi.fn(),
  stopSavingsBucket: vi.fn(),
  archiveSavingsBucket: vi.fn(),
  restoreSavingsBucket: vi.fn(),
  addSavingsDeposit: vi.fn(),
}));

vi.mock("./db", () => mocks);

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
const adminAccess = {
  ledger: { id: 1, name: "共同帳本", type: "couple", inviteCode: "A7K29X" },
  member: { ledgerId: 1, userId: 1, role: "admin" as const },
};

function createTestContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `workflow-user-${userId}`,
    email: `workflow-${userId}@example.com`,
    name: userId === 1 ? "管理員" : "成員",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("typed ledger workflow contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLedgerAccess.mockResolvedValue(adminAccess);
    mocks.createLedger.mockResolvedValue(adminAccess.ledger);
    mocks.joinLedgerByInviteCode.mockResolvedValue(adminAccess.ledger);
    mocks.leaveLedger.mockResolvedValue({ success: true });
    mocks.renameLedger.mockResolvedValue({ id: 1, name: "新名稱" });
    mocks.transferLedgerOwnership.mockResolvedValue({ success: true });
    mocks.listTravelPlans.mockResolvedValue([]);
    mocks.createTravelPlan.mockResolvedValue({ id: 21, name: "台南三日遊" });
    mocks.deleteTravelPlan.mockResolvedValue({ success: true });
    mocks.updateUserName.mockResolvedValue({ id: 1, name: "新暱稱" });
    mocks.createCategory.mockResolvedValue(11);
    mocks.updateCategory.mockResolvedValue(11);
    mocks.setCategoryActive.mockResolvedValue(11);
    mocks.createPaymentMethod.mockResolvedValue(12);
    mocks.updatePaymentMethod.mockResolvedValue(12);
    mocks.setPaymentMethodActive.mockResolvedValue(12);
    mocks.createRecurring.mockResolvedValue(13);
    mocks.createTransaction.mockResolvedValue(14);
    mocks.upsertBudget.mockResolvedValue(15);
    mocks.deleteBudget.mockResolvedValue(15);
    mocks.updateRecurring.mockResolvedValue(13);
    mocks.deleteRecurring.mockResolvedValue(13);
    mocks.getSettlementSummary.mockResolvedValue({
      balances: [{ userId: 1, net: 500 }, { userId: 2, net: -500 }],
      settlement: { fromUserId: 2, toUserId: 1, amount: 500 },
    });
    mocks.createSettlement.mockResolvedValue(16);
    mocks.getMonthlySettlementSnapshot.mockResolvedValue(null);
    mocks.createMonthlySettlementSnapshot.mockResolvedValue(41);
    mocks.reproposeMonthlySettlementSnapshot.mockResolvedValue(true);
    mocks.confirmMonthlySettlementSnapshot.mockResolvedValue(true);
    mocks.reopenMonthlySettlementSnapshot.mockResolvedValue(true);
    mocks.listMonthlySettlementSnapshots.mockResolvedValue([]);
    mocks.logActivity.mockResolvedValue(undefined);
    mocks.listSavingsBuckets.mockResolvedValue([]);
    mocks.listSavingsAllocations.mockResolvedValue([]);
    mocks.createSavingsBucket.mockResolvedValue(31);
    mocks.updateSavingsBucket.mockResolvedValue({ id: 31, version: 2 });
    mocks.stopSavingsBucket.mockResolvedValue(31);
    mocks.addSavingsDeposit.mockResolvedValue({ bucket: { id: 31, version: 3 }, allocation: { id: 41, source: "manual" } });
  });

  it("executes create and join ledger mutations through the typed router", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.create({ name: "小明與小美", type: "couple" });
    expect(mocks.createLedger).toHaveBeenCalledWith(
      expect.objectContaining({ name: "小明與小美", type: "couple", createdBy: 1 }),
    );
    expect(mocks.createLedger.mock.calls[0][0].inviteCode).toMatch(/^[A-Z0-9]{6}$/);

    await caller.ledger.join({ inviteCode: "a7k29x" });
    expect(mocks.joinLedgerByInviteCode).toHaveBeenCalledWith("A7K29X", 1);
  });

  it("forwards leave, transfer, and delete ledger lifecycle actions", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await caller.ledger.leave({ ledgerId: 1, action: "leave" });
    await caller.ledger.leave({ ledgerId: 1, action: "transfer", transferToUserId: 2 });
    await caller.ledger.leave({ ledgerId: 1, action: "delete" });

    expect(mocks.leaveLedger).toHaveBeenNthCalledWith(1, { ledgerId: 1, action: "leave", userId: 1 });
    expect(mocks.leaveLedger).toHaveBeenNthCalledWith(2, { ledgerId: 1, action: "transfer", transferToUserId: 2, userId: 1 });
    expect(mocks.leaveLedger).toHaveBeenNthCalledWith(3, { ledgerId: 1, action: "delete", userId: 1 });
  });

  it("rejects duplicate joins as CONFLICT and trims profile nicknames", async () => {
    const caller = appRouter.createCaller(createTestContext());
    mocks.joinLedgerByInviteCode.mockRejectedValueOnce(new Error("你已經加入這個帳本，不需要重複加入"));

    await expect(caller.ledger.join({ inviteCode: "a7k29x" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "你已經加入這個帳本，不需要重複加入",
    });

    await expect(caller.profile.updateName({ name: "  新暱稱  " })).resolves.toEqual({ id: 1, name: "新暱稱" });
    expect(mocks.updateUserName).toHaveBeenCalledWith(1, "新暱稱");
  });

  it("rejects invalid expense splits and forwards valid equal, custom, and amount splits", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const base = {
      ledgerId: 1,
      payerId: 1,
      amount: 1200,
      type: "expense" as const,
      categoryId: 11,
      paymentMethodId: 12,
      date: "2026-08-16T12:00:00.000Z",
    };
    await expect(
      caller.ledger.createTransaction({
        ...base,
        splitType: "equal",
        splits: [{ userId: 1, shareAmount: 500 }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    for (const splitType of ["equal", "custom", "amount"] as const) {
      await caller.ledger.createTransaction({
        ...base,
        splitType,
        splits: [
          { userId: 1, shareAmount: 600 },
          { userId: 2, shareAmount: 600 },
        ],
      });
    }
    expect(mocks.createTransaction).toHaveBeenCalledTimes(3);
    expect(mocks.createTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 1, splitType: "amount" }),
    );
  });

  it("rejects a user-created transfer at the typed transaction boundary", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(caller.ledger.createTransaction({
      ledgerId: 1,
      payerId: 1,
      amount: 500,
      type: "transfer",
      categoryId: 11,
      paymentMethodId: 12,
      date: "2026-08-21T12:00:00.000Z",
      splitType: "none",
      splits: [],
    } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createTransaction).not.toHaveBeenCalled();
  });

  it("forwards ledger rename, direct ownership transfer, and independent travel plans", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.rename({ ledgerId: 1, name: "  週末旅行帳本  " });
    await caller.ledger.transferOwnership({ ledgerId: 1, targetUserId: 2 });
    await caller.ledger.travelPlans({ ledgerId: 1 });
    await caller.ledger.createTravelPlan({
      ledgerId: 1,
      name: "台南三日遊",
      budget: 15000,
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      notes: "不納入每月預算",
    });
    await caller.ledger.deleteTravelPlan({ ledgerId: 1, planId: 21 });

    expect(mocks.renameLedger).toHaveBeenCalledWith({ ledgerId: 1, name: "週末旅行帳本", userId: 1 });
    expect(mocks.transferLedgerOwnership).toHaveBeenCalledWith({ ledgerId: 1, targetUserId: 2, userId: 1 });
    expect(mocks.listTravelPlans).toHaveBeenCalledWith(1);
    expect(mocks.createTravelPlan).toHaveBeenCalledWith(expect.objectContaining({
      ledgerId: 1,
      name: "台南三日遊",
      budget: 15000,
      userId: 1,
      startDate: expect.any(Date),
      endDate: expect.any(Date),
    }));
    expect(mocks.deleteTravelPlan).toHaveBeenCalledWith({ ledgerId: 1, planId: 21, userId: 1 });
  });

  it("enforces the budget ceiling at the typed router boundary", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(caller.ledger.upsertBudget({ ledgerId: 1, categoryId: 0, amount: 100_000_001, month: "2026-08" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.ledger.createTravelPlan({ ledgerId: 1, name: "超額", budget: 100_000_001, startDate: "2026-09-01", endDate: "2026-09-03" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("executes category, payment method, budget, and recurring mutations", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.createCategory({
      ledgerId: 1,
      parentCategoryId: 0,
      name: "早餐",
      type: "expense",
      icon: "🍜",
      color: "#C98558",
    });
    await caller.ledger.createPaymentMethod({ ledgerId: 1, name: "Cube 卡", icon: "卡" });
    await caller.ledger.upsertBudget({ ledgerId: 1, categoryId: 11, amount: 8000, month: "2026-08" });
    await caller.ledger.createRecurring({
      ledgerId: 1,
      title: "薪資",
      amount: 45000,
      type: "income",
      categoryId: 11,
      paymentMethodId: 12,
      frequency: "monthly",
      dayOfMonth: 5,
    });
    expect(mocks.createCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "早餐", parentCategoryId: 0 }));
    expect(mocks.createPaymentMethod).toHaveBeenCalledWith(expect.objectContaining({ name: "Cube 卡" }));
    expect(mocks.upsertBudget).toHaveBeenCalledWith(expect.objectContaining({ amount: 8000, month: "2026-08" }));
    expect(mocks.createRecurring).toHaveBeenCalledWith(expect.objectContaining({ frequency: "monthly", dayOfMonth: 5, userId: 1 }));
  });

  it("updates and deletes planning items through the authorized ledger route", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.deleteBudget({ ledgerId: 1, budgetId: 15 });
    await caller.ledger.updateRecurring({
      ledgerId: 1,
      recurringId: 13,
      title: "更新後房租",
      amount: 18000,
      type: "expense",
      categoryId: 11,
      paymentMethodId: 12,
      frequency: "monthly",
      dayOfMonth: 5,
    });
    await caller.ledger.deleteRecurring({ ledgerId: 1, recurringId: 13 });

    expect(mocks.deleteBudget).toHaveBeenCalledWith({ ledgerId: 1, id: 15 });
    expect(mocks.updateRecurring).toHaveBeenCalledWith(expect.objectContaining({ id: 13, ledgerId: 1, title: "更新後房租" }));
    expect(mocks.deleteRecurring).toHaveBeenCalledWith({ ledgerId: 1, id: 13 });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ entityType: "budget", action: "delete" }));
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ entityType: "recurring", action: "update" }));
  });

  it("updates, searches through, and toggles managed categories and payment methods", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.updateCategory({ ledgerId: 1, categoryId: 11, name: "早午餐", type: "expense", icon: "🍳", color: "#C98558" });
    await caller.ledger.setCategoryActive({ ledgerId: 1, categoryId: 11, isActive: 0 });
    await caller.ledger.updatePaymentMethod({ ledgerId: 1, paymentMethodId: 12, name: "共同信用卡", icon: "💳" });
    await caller.ledger.setPaymentMethodActive({ ledgerId: 1, paymentMethodId: 12, isActive: 1 });
    expect(mocks.updateCategory).toHaveBeenCalledWith({ ledgerId: 1, id: 11, name: "早午餐", type: "expense", icon: "🍳", color: "#C98558" });
    expect(mocks.setCategoryActive).toHaveBeenCalledWith({ ledgerId: 1, id: 11, isActive: 0 });
    expect(mocks.updatePaymentMethod).toHaveBeenCalledWith({ ledgerId: 1, id: 12, name: "共同信用卡", icon: "💳" });
    expect(mocks.setPaymentMethodActive).toHaveBeenCalledWith({ ledgerId: 1, id: 12, isActive: 1 });
  });

  it("manages authorized savings buckets with payment sources and allocation history", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.savings.buckets({ ledgerId: 1 });
    await caller.ledger.savings.allocations({ ledgerId: 1, bucketId: 31 });
    await caller.ledger.savings.create({
      ledgerId: 1,
      paymentMethodId: 12,
      name: "日本旅遊",
      icon: "✈️",
      targetAmount: 100_000,
      monthlyAmount: 5_000,
      dayOfMonth: 5,
      priority: 1,
    });

    expect(mocks.listSavingsBuckets).toHaveBeenCalledWith(1);
    expect(mocks.listSavingsAllocations).toHaveBeenCalledWith(1, 31);
    expect(mocks.createSavingsBucket).toHaveBeenCalledWith(expect.objectContaining({
      ledgerId: 1,
      paymentMethodId: 12,
      monthlyAmount: 5_000,
      dayOfMonth: 5,
      createdBy: 1,
      isActive: 1,
    }));
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ entityType: "savingsBucket", action: "create" }));
  });

  it("returns a conflict instead of silently overwriting a newer savings bucket", async () => {
    const caller = appRouter.createCaller(createTestContext());
    mocks.updateSavingsBucket.mockRejectedValueOnce(new Error("SAVINGS_BUCKET_CONFLICT"));

    await expect(caller.ledger.savings.update({
      ledgerId: 1,
      bucketId: 31,
      expectedVersion: 1,
      paymentMethodId: 12,
      name: "買車基金",
      icon: "🚗",
      targetAmount: 500_000,
      monthlyAmount: 10_000,
      dayOfMonth: 1,
      priority: 0,
      isActive: true,
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("creates a manual savings deposit through the authorized, optimistic-lock route", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.savings.addDeposit({ ledgerId: 1, bucketId: 31, expectedVersion: 2, amount: 3_000 });
    expect(mocks.addSavingsDeposit).toHaveBeenCalledWith(expect.objectContaining({
      ledgerId: 1,
      bucketId: 31,
      expectedVersion: 2,
      amount: 3_000,
      userId: 1,
    }));
  });

  it("returns a conflict rather than silently repeating a manual savings deposit", async () => {
    const caller = appRouter.createCaller(createTestContext());
    mocks.addSavingsDeposit.mockRejectedValueOnce(new Error("SAVINGS_BUCKET_CONFLICT"));
    await expect(caller.ledger.savings.addDeposit({ ledgerId: 1, bucketId: 31, expectedVersion: 2, amount: 3_000 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("archives completed savings buckets and restores them through the authorized optimistic-lock route", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await caller.ledger.savings.archive({ ledgerId: 1, bucketId: 31, expectedVersion: 2 });
    await caller.ledger.savings.restore({ ledgerId: 1, bucketId: 31, expectedVersion: 3 });

    expect(mocks.archiveSavingsBucket).toHaveBeenCalledWith({ ledgerId: 1, id: 31, expectedVersion: 2 });
    expect(mocks.restoreSavingsBucket).toHaveBeenCalledWith({ ledgerId: 1, id: 31, expectedVersion: 3 });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ entityType: "savingsBucket", summary: "封存已達標儲蓄桶" }));
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ entityType: "savingsBucket", summary: "重新顯示已封存儲蓄桶" }));
  });

  it("enforces admin role changes and manages a versioned monthly settlement", async () => {
    const caller = appRouter.createCaller(createTestContext());
    mocks.getLedgerAccess.mockResolvedValueOnce({ ...adminAccess, member: { ...adminAccess.member, role: "viewer" as const } });
    await expect(
      caller.ledger.updateMemberRole({ ledgerId: 1, userId: 2, role: "member" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await caller.ledger.updateMemberRole({ ledgerId: 1, userId: 2, role: "admin" });
    expect(mocks.updateLedgerMemberRole).toHaveBeenCalledWith({ ledgerId: 1, userId: 2, role: "admin" });

    await caller.ledger.settlement.markSettled({ ledgerId: 1, month: "2026-08" });
    expect(mocks.createMonthlySettlementSnapshot).toHaveBeenCalledWith({
      ledgerId: 1,
      month: "2026-08",
      proposedByUserId: 1,
      fromUserId: 2,
      toUserId: 1,
      amount: 500,
    });

    mocks.getMonthlySettlementSnapshot.mockResolvedValue({ id: 41, ledgerId: 1, month: "2026-08", fromUserId: 2, toUserId: 1, amount: 500, proposedByUserId: 1, confirmedByUserId: null, status: "pending", version: 1 });
    const secondMember = appRouter.createCaller(createTestContext(2));
    await secondMember.ledger.settlement.confirm({ ledgerId: 1, month: "2026-08", version: 1 });
    expect(mocks.confirmMonthlySettlementSnapshot).toHaveBeenCalledWith({ ledgerId: 1, month: "2026-08", expectedVersion: 1, confirmedByUserId: 2 });

    mocks.getLedgerAccess.mockResolvedValue(adminAccess);
    await caller.ledger.settlement.reopen({ ledgerId: 1, month: "2026-08", version: 2 });
    expect(mocks.reopenMonthlySettlementSnapshot).toHaveBeenCalledWith({ ledgerId: 1, month: "2026-08", expectedVersion: 2 });
  });
});
