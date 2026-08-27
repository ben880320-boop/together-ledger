import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const googleClientIdPattern = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/;

describe("Google OAuth 公開用戶端設定", () => {
  it("接受同一 Firebase 專案的 Web 與 Android Client ID，且 Google OIDC discovery 可用", async () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    const googleServices = JSON.parse(
      readFileSync(new URL("../mobile/google-services.json", import.meta.url), "utf8")
    ) as {
      client?: Array<{
        client_info?: { android_client_info?: { package_name?: string } };
        oauth_client?: Array<{ client_id?: string; client_type?: number; android_info?: { package_name?: string } }>;
      }>;
    };
    const appClient = googleServices.client?.find(client =>
      client.client_info?.android_client_info?.package_name === "com.togetherledger.app"
    );
    const oauthClients = appClient?.oauth_client ?? [];
    const androidOAuth = oauthClients.find(client =>
      client.client_type === 1 && client.android_info?.package_name === "com.togetherledger.app"
    );
    const webOAuth = oauthClients.find(client => client.client_type === 3);
    // The Android client is selected from the signed `google-services.json` by
    // package and SHA-1. CI needs only the Web client ID injected for native
    // Firebase credentials, so never require a duplicate Android environment
    // value or expose either client ID in output.
    expect(androidOAuth?.client_id).toMatch(googleClientIdPattern);
    expect(webOAuth?.client_id).toMatch(googleClientIdPattern);
    expect(webOAuth?.client_id?.split("-")[0]).toBe(androidOAuth?.client_id?.split("-")[0]);

    // The PR Quality Gate intentionally has no secrets. When the Android
    // release workflow supplies the public Web client ID, it must still match
    // the Web OAuth entry in the Firebase configuration exactly.
    if (webClientId !== undefined) {
      expect(webClientId).toMatch(googleClientIdPattern);
      expect(webOAuth?.client_id).toBe(webClientId);
    }

    const response = await fetch("https://accounts.google.com/.well-known/openid-configuration");
    expect(response.ok).toBe(true);
    const metadata = (await response.json()) as { issuer?: string; authorization_endpoint?: string };
    expect(metadata.issuer).toBe("https://accounts.google.com");
    expect(metadata.authorization_endpoint).toContain("accounts.google.com");
  });
});
