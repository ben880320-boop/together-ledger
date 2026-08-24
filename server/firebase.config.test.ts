import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const requiredConfig = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;
const requiredExpoConfig = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

const hasFirebaseConfig = requiredConfig.every(key => Boolean(process.env[key]));
const hasExpoFirebaseConfig = requiredExpoConfig.every(key => Boolean(process.env[key]));
const describeWithFirebaseConfig = hasFirebaseConfig ? describe : describe.skip;
const describeWithExpoFirebaseConfig = hasExpoFirebaseConfig ? describe : describe.skip;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const describeWithServiceAccount = serviceAccountJson ? describe : describe.skip;

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function createServiceAccountAssertion(serviceAccount: FirebaseServiceAccount) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 300,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(serviceAccount.private_key).toString("base64url")}`;
}

describeWithFirebaseConfig("Firebase Authentication 設定", () => {
  it("可安全連線至已啟用的 Email/Password 密碼重設端點", async () => {
    const apiKey = process.env.VITE_FIREBASE_API_KEY!;
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: "PASSWORD_RESET",
          // .invalid 是保留且不可投遞的網域，測試不會寄送給真實收件者。
          email: "together-ledger-firebase-config-check@example.invalid",
        }),
      },
    );

    const result = (await response.json()) as { error?: { message?: string } };
    const errorCode = result.error?.message ?? "";
    // 未註冊地址可回 EMAIL_NOT_FOUND；啟用防枚舉保護時也可能以成功回應處理。
    // 兩者都證明 API key、專案與 Firebase Authentication 端點可用。
    expect([200, 400]).toContain(response.status);
    expect(errorCode).not.toMatch(/API_KEY_INVALID|PROJECT_NOT_FOUND|OPERATION_NOT_ALLOWED/i);
  }, 15_000);
});

describeWithExpoFirebaseConfig("Expo Firebase Authentication 設定", () => {
  it("可用 Android 公開設定安全連線至密碼重設端點", async () => {
    expect(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID).toBe(process.env.VITE_FIREBASE_PROJECT_ID);
    expect(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN).toBe(process.env.VITE_FIREBASE_AUTH_DOMAIN);
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(process.env.EXPO_PUBLIC_FIREBASE_API_KEY!)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: "PASSWORD_RESET",
          email: "together-ledger-expo-config-check@example.invalid",
        }),
      },
    );
    const result = (await response.json()) as { error?: { message?: string } };
    expect([200, 400]).toContain(response.status);
    expect(result.error?.message ?? "").not.toMatch(/API_KEY_INVALID|PROJECT_NOT_FOUND|OPERATION_NOT_ALLOWED/i);
  }, 15_000);
});

describe("Firebase 跨平台郵件與認證提示回歸", () => {
  const projectRoot = process.cwd();
  const webFirebaseHelper = readFileSync(resolve(projectRoot, "client/src/lib/firebaseAuth.ts"), "utf8");
  const mobileFirebaseHelper = readFileSync(resolve(projectRoot, "mobile/lib/firebaseAuth.ts"), "utf8");
  const webAuthPage = readFileSync(resolve(projectRoot, "client/src/pages/WebAuth.tsx"), "utf8");
  const mobileAuthPage = readFileSync(resolve(projectRoot, "mobile/app/index.tsx"), "utf8");
  const mobileApi = readFileSync(resolve(projectRoot, "mobile/lib/api.ts"), "utf8");

  it("Web、PWA 與 Android 寄出的 Firebase 驗證／重設信均指定繁體中文語系", () => {
    expect(webFirebaseHelper).toMatch(/languageCode\s*=\s*["']zh-TW["']/);
    expect(mobileFirebaseHelper).toMatch(/languageCode\s*=\s*["']zh-TW["']/);
  });

  it("各平台的註冊、重設與綁定流程均保留垃圾郵件提醒與浮動提示入口", () => {
    expect(webAuthPage).toContain("垃圾郵件匣");
    expect(webAuthPage).toContain("toast.success");
    expect(mobileAuthPage).toContain("垃圾郵件匣");
    expect(mobileAuthPage).toContain("onNotice");
    expect(mobileAuthPage).toContain("accessibilityLabel=\"關閉提示\"");
  });

  it("記住此裝置只保存可撤銷的 session 與明確偏好，不保存明碼密碼", () => {
    expect(webFirebaseHelper).toContain("browserSessionPersistence");
    expect(webFirebaseHelper).toContain("browserLocalPersistence");
    expect(webAuthPage).toContain("記住此裝置");
    expect(webAuthPage).toContain("不會保存密碼");
    expect(mobileAuthPage).toContain("記住此裝置");
    expect(mobileApi).toContain("REMEMBER_DEVICE_KEY");
    expect(mobileApi).toContain("Passwords are never persisted");
  });
});

describeWithServiceAccount("Firebase Admin 服務帳號設定", () => {
  it("可安全取得短時效 OAuth access token，供伺服器驗證 Firebase ID Token", async () => {
    const serviceAccount = JSON.parse(serviceAccountJson!) as FirebaseServiceAccount;
    expect(serviceAccount.project_id).toBe(process.env.VITE_FIREBASE_PROJECT_ID);
    expect(serviceAccount.client_email).toMatch(/\.gserviceaccount\.com$/);
    expect(serviceAccount.private_key).toContain("BEGIN PRIVATE KEY");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: createServiceAccountAssertion(serviceAccount),
      }),
    });
    const result = (await response.json()) as { access_token?: string; error?: string };
    expect(response.status).toBe(200);
    expect(result.error).toBeUndefined();
    expect(typeof result.access_token).toBe("string");
    expect(result.access_token?.length).toBeGreaterThan(20);
  }, 15_000);
});
