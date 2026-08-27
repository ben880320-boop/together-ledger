import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "internal-open-id",
      name: "測試帳戶",
      email: "test@example.com",
      role: "user",
      loginMethod: "google",
      passwordHash: "must-not-be-public",
      firebaseUid: "must-not-be-public",
      sessionVersion: 9,
      createdAt: new Date("2026-08-27T00:00:00.000Z"),
      lastSignedIn: new Date("2026-08-27T00:00:00.000Z"),
    },
    authState: "authenticated",
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("auth.me", () => {
  it("returns an explicit null user for an anonymous session", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());

    await expect(caller.auth.me()).resolves.toEqual({ user: null });
  });

  it("returns only the public account DTO for an authenticated session", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(caller.auth.me()).resolves.toEqual({
      user: {
        id: 7,
        name: "測試帳戶",
        email: "test@example.com",
        role: "user",
        loginMethod: "google",
      },
      authState: "authenticated",
    });
  });
});
