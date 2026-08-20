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

describe("auth.me", () => {
  it("returns an explicit null user for an anonymous session", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());

    await expect(caller.auth.me()).resolves.toEqual({ user: null });
  });
});
