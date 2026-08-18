import { describe, expect, it } from "vitest";
import { sdk } from "./_core/sdk";

describe("local email/password session tokens", () => {
  it("signs and verifies a local_ identity using the shared session contract", async () => {
    const token = await sdk.createSessionToken("local_test_account", {
      name: "電子信箱使用者",
      expiresInMs: 60_000,
    });

    const verified = await sdk.verifySession(token);

    expect(verified).toMatchObject({
      openId: "local_test_account",
      name: "電子信箱使用者",
    });
    expect(verified?.appId).toBeTruthy();
  });

  it("rejects a modified local session token", async () => {
    const token = await sdk.createSessionToken("local_test_account", {
      name: "電子信箱使用者",
      expiresInMs: 60_000,
    });

    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    await expect(sdk.verifySession(tamperedToken)).resolves.toBeNull();
  });
});
