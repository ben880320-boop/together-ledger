import { describe, expect, it } from "vitest";
import { calculateSettlement } from "./db";

describe("calculateSettlement", () => {
  it("calculates the full amount owed for an equal split", () => {
    const result = calculateSettlement([
      { transactionId: 1, payerId: 1, splitUserId: 1, amount: 1000, shareAmount: 500 },
      { transactionId: 1, payerId: 1, splitUserId: 2, amount: 1000, shareAmount: 500 },
    ]);

    expect(result.balances).toEqual([
      { userId: 1, net: 500 },
      { userId: 2, net: -500 },
    ]);
    expect(result.settlement).toEqual({ fromUserId: 2, toUserId: 1, amount: 500 });
  });

  it("nets multiple transactions before deciding who pays whom", () => {
    const result = calculateSettlement([
      { transactionId: 1, payerId: 1, splitUserId: 1, amount: 1200, shareAmount: 600 },
      { transactionId: 1, payerId: 1, splitUserId: 2, amount: 1200, shareAmount: 600 },
      { transactionId: 2, payerId: 2, splitUserId: 1, amount: 800, shareAmount: 400 },
      { transactionId: 2, payerId: 2, splitUserId: 2, amount: 800, shareAmount: 400 },
    ]);

    expect(result.settlement).toEqual({ fromUserId: 2, toUserId: 1, amount: 200 });
  });

  it("returns no settlement when the two sides are balanced", () => {
    const result = calculateSettlement([
      { transactionId: 1, payerId: 1, splitUserId: 1, amount: 1000, shareAmount: 500 },
      { transactionId: 1, payerId: 1, splitUserId: 2, amount: 1000, shareAmount: 500 },
      { transactionId: 2, payerId: 2, splitUserId: 1, amount: 1000, shareAmount: 500 },
      { transactionId: 2, payerId: 2, splitUserId: 2, amount: 1000, shareAmount: 500 },
    ]);

    expect(result.settlement).toBeNull();
  });
});
