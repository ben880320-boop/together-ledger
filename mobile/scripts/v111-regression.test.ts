import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = resolve(process.cwd(), "mobile");
const readMobile = (relativePath: string) =>
  readFileSync(resolve(mobileRoot, relativePath), "utf8");

describe("Together Ledger v1.1.1 Android wiring", () => {
  it("registers a concrete OAuth callback route with state verification", () => {
    const callbackPath = resolve(mobileRoot, "app/oauth/callback.tsx");
    expect(existsSync(callbackPath)).toBe(true);
    const callback = readMobile("app/oauth/callback.tsx");
    expect(callback).toContain("useLocalSearchParams");
    expect(callback).toContain("AsyncStorage.getItem(oauthStateKey)");
    expect(callback).toContain("AsyncStorage.removeItem(oauthStateKey)");
    expect(callback).toContain("router.replace(\"/\")");
    expect(callback).toContain("saveSessionToken(token)");
  });

  it("keeps native travel date pickers and YYYY-MM-DD normalization", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("@react-native-community/datetimepicker");
    expect(app).toContain("DateTimePicker");
    expect(app).toContain("dateKey(value)");
    expect(app).toContain("選擇開始日期");
    expect(app).toContain("選擇結束日期");
    expect(app).toContain('display={Platform.OS === "android" ? "calendar" : "spinner"}');
    expect(app).toContain("T00:00:00");
    expect(app).toContain("T23:59:59");
  });

  it("uses the themed confirmation surface instead of native Alert", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("function ConfirmModal(");
    expect(app).toContain("<ConfirmModal request={confirmRequest}");
    expect(app).toContain("confirmOverlay");
    expect(app).not.toContain("Alert.alert");
    expect(app).toContain("再次確認移除");
  });

  it("ships the intended app version and deep-link configuration", () => {
    const appJson = JSON.parse(readMobile("app.json")) as {
      expo?: { version?: string; scheme?: string };
    };
    expect(appJson.expo?.version).toBe("1.1.1");
    expect(appJson.expo?.scheme).toBe("togetherledger");
  });
});
