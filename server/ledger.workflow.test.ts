import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createCategory: vi.fn(),
  createLedger: vi.fn(),
  createPaymentMethod: vi.fn(),
  createRecurring: vi.fn(),
  createSettlement: vi.fn(),
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
  getTransactions: vi.fn(),
  joinLedgerByInviteCode: vi.fn(),
  leaveLedger: vi.fn(),
  logActivity: vi.fn(),
  listBudgets: vi.fn(),
  listLedgersForUser: vi.fn(),
  listRecurring: vi.fn(),
  listSettlements: vi.fn(),
  upsertBudget: vi.fn(),
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
    mocks.updateUserName.mockResolvedValue({ id: 1, name: "新暱稱" });
    mocks.createCategory.mockResolvedValue(11);
    mocks.createPaymentMethod.mockResolvedValue(12);
    mocks.createRecurring.mockResolvedValue(13);
    mocks.createTransaction.mockResolvedValue(14);
    mocks.upsertBudget.mockResolvedValue(15);
    mocks.getSettlementSummary.mockResolvedValue({
      balances: [{ userId: 1, net: 500 }, { userId: 2, net: -500 }],
      settlement: { fromUserId: 2, toUserId: 1, amount: 500 },
    });
    mocks.createSettlement.mockResolvedValue(16);
    mocks.logActivity.mockResolvedValue(undefined);
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

  it("enforces admin role changes and marks a computed settlement", async () => {
    const caller = appRouter.createCaller(createTestContext());
    mocks.getLedgerAccess.mockResolvedValueOnce({ ...adminAccess, member: { ...adminAccess.member, role: "viewer" as const } });
    await expect(
      caller.ledger.updateMemberRole({ ledgerId: 1, userId: 2, role: "member" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await caller.ledger.updateMemberRole({ ledgerId: 1, userId: 2, role: "admin" });
    expect(mocks.updateLedgerMemberRole).toHaveBeenCalledWith({ ledgerId: 1, userId: 2, role: "admin" });

    await caller.ledger.settlement.markSettled({ ledgerId: 1, month: "2026-08" });
    expect(mocks.createSettlement).toHaveBeenCalledWith({
      ledgerId: 1,
      month: "2026-08",
      fromUserId: 2,
      toUserId: 1,
      amount: 500,
    });
  });
});
