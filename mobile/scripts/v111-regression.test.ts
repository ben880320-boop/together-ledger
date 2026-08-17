import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = resolve(process.cwd(), "mobile");
const readMobile = (relativePath: string) =>
  readFileSync(resolve(mobileRoot, relativePath), "utf8");

describe("Together Ledger v1.2.0 Android wiring", () => {
  it("registers a concrete OAuth callback route with state verification", () => {
    const callbackPath = resolve(mobileRoot, "app/oauth/callback.tsx");
    expect(existsSync(callbackPath)).toBe(true);
    const callback = readMobile("app/oauth/callback.tsx");
    expect(callback).toContain("useLocalSearchParams");
    expect(callback).toContain("AsyncStorage.getItem(oauthStateKey)");
    expect(callback).toContain("AsyncStorage.removeItem(oauthStateKey)");
    expect(callback).toContain('router.replace("/")');
    expect(callback).toContain("saveSessionToken(token)");
  });

  it("keeps native travel date pickers and YYYY-MM-DD normalization", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("@react-native-community/datetimepicker");
    expect(app).toContain("DateTimePicker");
    expect(app).toContain("dateKey(value)");
    expect(app).toContain(
      "const dateKeyPattern = /^(\\d{4})-(\\d{2})-(\\d{2})$/;"
    );
    expect(app).toContain("選擇開始日期");
    expect(app).toContain("選擇結束日期");
    expect(app).toContain(
      'display={Platform.OS === "android" ? "calendar" : "spinner"}'
    );
    expect(app).toContain(
      "const localDateFromKey = (value: string, endOfDay = false) =>"
    );
    expect(app).toContain("endOfDay ? 23 : 0");
    expect(app).toContain("endOfDay ? 59 : 0");
  });

  it("uses the themed confirmation surface instead of native Alert", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("function ConfirmModal(");
    expect(app).toContain("<ConfirmModal request={confirmRequest}");
    expect(
      (app.match(/<ConfirmModal request=\{confirmRequest\}/g) || []).length
    ).toBeGreaterThanOrEqual(3);
    expect(app).toContain("confirmOverlay");
    expect(app).not.toContain("Alert.alert");
    expect(app).toContain("再次確認移除");
    expect((app.match(/name=\"logout\"/g) || []).length).toBe(1);
  });

  it("wires v1.2.0 appearance, settings management, and home search", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain('label: "海洋"');
    expect(app).toContain('label: "星空"');
    expect(app).toContain("AppearanceCardStyle");
    expect(app).toContain("AppearanceNavStyle");
    expect(app).toContain("updateCategory");
    expect(app).toContain("setCategoryActive");
    expect(app).toContain("updatePaymentMethod");
    expect(app).toContain("setPaymentMethodActive");
    expect(app).toContain("categorySort");
    expect(app).toContain("paymentSort");
    expect(app).toContain("sort-variant");
    expect(app).toContain("settingsFilterActions");
    expect(app).toContain("主題、字體與版型會立即套用並保存在這台裝置");
    expect(app).toContain("搜尋帳本名稱");
    expect(app).toContain("ledgerQuery");
  });

  it("ships the intended app version and deep-link configuration", () => {
    const appJson = JSON.parse(readMobile("app.json")) as {
      expo?: { version?: string; scheme?: string };
    };
    expect(appJson.expo?.version).toBe("1.2.0");
    expect(appJson.expo?.scheme).toBe("togetherledger");
  });

  it("keeps a quota-independent GitHub Actions Android APK workflow", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/android-apk.yml"),
      "utf8"
    );
    const packageJson = JSON.parse(readMobile("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain("android-actions/setup-android@v3");
    expect(workflow).toContain("pnpm run prebuild:android");
    expect(workflow).toContain("assembleDebug");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain(
      "together-ledger-${{ steps.app-version.outputs.version }}-debug-apk"
    );
    expect(workflow).toContain("app-debug.apk");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(packageJson.scripts?.["prebuild:android"]).toContain(
      "expo prebuild --platform android --no-install"
    );
    expect(packageJson.scripts?.["build:android:ci"]).toContain(
      "assembleDebug"
    );
  });
});
