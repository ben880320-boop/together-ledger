import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userId = 1, openId = "test-user-1"): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId,
    email: "test@example.com",
    name: "測試小辰",
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

describe("Ledger & Category Router Logic", () => {
  it("allows authenticated user to construct router caller", () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller).toBeDefined();
  });
});
