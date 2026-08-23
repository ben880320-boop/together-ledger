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
      sessionVersion: 0,
    });
    expect(verified?.appId).toBeTruthy();
  });

  it("preserves an explicit session version for server-side revocation checks", async () => {
    const token = await sdk.createSessionToken("local_test_account", {
      name: "Firebase 已綁定使用者",
      sessionVersion: 3,
      expiresInMs: 60_000,
    });

    await expect(sdk.verifySession(token)).resolves.toMatchObject({
      openId: "local_test_account",
      sessionVersion: 3,
    });
  });

  it("rejects a modified local session token", async () => {
    const token = await sdk.createSessionToken("local_test_account", {
      name: "電子信箱使用者",
      expiresInMs: 60_000,
    });

    const [header, payload, signature] = token.split(".");
    const alteredPayload = `${payload.slice(0, -1)}${payload.endsWith("a") ? "b" : "a"}`;
    const tamperedToken = [header, alteredPayload, signature].join(".");
    await expect(sdk.verifySession(tamperedToken)).resolves.toBeNull();
  });
});
