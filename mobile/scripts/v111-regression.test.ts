import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = resolve(process.cwd(), "mobile");
const readMobile = (relativePath: string) =>
  readFileSync(resolve(mobileRoot, relativePath), "utf8");

describe("Together Ledger v1.2.8 Android wiring", () => {
  it("uses email/password authentication without a Manus OAuth redirect", () => {
    const app = readMobile("app/index.tsx");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    const sdk = readFileSync(resolve(process.cwd(), "server/_core/sdk.ts"), "utf8");
    expect(app).toContain("電子信箱");
    expect(app).toContain("api.auth.login.mutate");
    expect(app).toContain("api.auth.register.mutate");
    expect(app).toContain("saveSessionToken(result.token)");
    expect(app).not.toContain("WebBrowser.openAuthSessionAsync");
    expect(router).toContain("register: publicProcedure");
    expect(router).toContain("login: publicProcedure");
    expect(db).toContain("scrypt$");
    expect(sdk).toContain("LOCAL_OPEN_ID_PREFIX");
  });

  it("requires a password before a local account can be deleted", () => {
    const app = readMobile("app/index.tsx");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(app).toContain("function AccountDeletionModal(");
    expect(app).toContain("永久刪除帳號");
    expect(app).toContain("輸入目前密碼以確認");
    expect(app).toContain("api.auth.deleteAccount.mutate");
    expect(router).toContain("deleteAccount: protectedProcedure");
    expect(router).toContain("密碼不正確，無法刪除帳號");
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

  it("uses the themed confirmation surface for destructive actions and GitHub update availability", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("function ConfirmModal(");
    expect(app).toContain("<ConfirmModal request={confirmRequest}");
    expect(
      (app.match(/<ConfirmModal request=\{confirmRequest\}/g) || []).length
    ).toBeGreaterThanOrEqual(3);
    expect(app).toContain("confirmOverlay");
    expect(app).toContain('title: "發現新版 Together Ledger"');
    expect(app).toContain('confirmText: "前往下載"');
    expect(app).toContain("再次確認移除");
    expect((app.match(/name=\"logout\"/g) || []).length).toBe(1);
  });

  it("wires appearance, settings management, home search, and notification controls", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain('label: "海洋"');
    expect(app).toContain('label: "星空"');
    expect(app).toContain('label: "櫻花"');
    expect(app).toContain('label: "草原"');
    expect(app).toContain('label: "雪地"');
    expect(app).toContain("AppearanceCardStyle");
    expect(app).toContain("AppearanceNavStyle");
    expect(app).toContain("updateCategory");
    expect(app).toContain("setCategoryActive");
    expect(app).toContain("updatePaymentMethod");
    expect(app).toContain("setPaymentMethodActive");
    expect(app).toContain("categorySort");
    expect(app).toContain("paymentSort");
    expect(app).toContain('categorySort === "status"');
    expect(app).toContain('paymentSort === "status"');
    expect(app).toContain("settingsFilterActions");
    expect(app).toContain("主題、字體與版型會立即套用並保存在這台裝置");
    expect(app).toContain("搜尋帳本名稱");
    expect(app).toContain("ledgerQuery");
    expect(app).toContain("每月結算提醒");
    expect(app).toContain("通知金額門檻（NT$）");
    expect(app).toContain("saveNotificationPreferences");
    expect(app).toContain("requestExpoPushToken");
    expect(app).toContain("pushRegistrationUnavailable");
    expect(app).toContain("推播裝置尚未完成註冊");
    expect(app).toContain("Math.min(100_000_000");
    expect(app).toContain("Math.min(28");
    expect(app).toContain("normalizeNotificationPreferences");
    expect(app).toContain("notificationRequestRef");
    expect(app).toContain("function SuccessToast(");
    expect(app).toContain("showToast");
    expect(app).toContain("5_000");
    expect(app).toContain("提醒設定已儲存");
    expect(app).toContain("目前版本 v{APP_VERSION}");
    expect(app).toContain("SettingsSection");
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).toContain("Array.from({ length: 28 }");
    expect(app).toContain("每月提醒日期（1–28 日）");
    expect(app).toContain("ThemeAtmosphere");
    expect(app).toContain('preferences.theme === "cherry"');
    expect(app).toContain('preferences.theme === "meadow"');
    expect(app).toContain('preferences.theme === "snow"');
    expect(app).toContain('preferences.theme === "forest"');
    expect(app).toContain('preferences.theme === "sunset"');
    expect(app).toContain('preferences.theme === "lavender"');
    expect(app).toContain("petalPositions");
    expect(app).toContain("snowPositions");
    expect(app).toContain('background: "#060A1D"');
    expect(app).toContain('background: "#062638"');
    expect(app).toContain("GITHUB_REPOSITORY_URL");
    expect(app).toContain("GITHUB_RELEASES_URL");
    expect(app).toContain("isVersionNewer");
    expect(app).toContain("mutationGuardRef");
    expect(app).toContain("setTimeout(() => setError");
    expect(app).toContain("FlatList");
    expect(app).toContain("maxToRenderPerBatch={4}");
    expect(app).toContain("backgroundColor: palette.surface");
    expect(readMobile("app.json")).toContain("softwareKeyboardLayoutMode");
  });

  it("keeps long ledger management and viewing tasks in themed, bounded dialogs", () => {
    const app = readMobile("app/index.tsx");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(app).toContain("完整收支");
    expect(app).toContain("本週");
    expect(app).toContain("本月");
    expect(app).toContain("上月");
    expect(app).toContain("操作日誌");
    expect(app).toContain("managerScroll");
    expect(app).toContain("永久刪除");
    expect(app).toContain("隱藏");
    expect(app).toContain("api.ledger.deleteCategory.mutate");
    expect(app).toContain("api.ledger.deletePaymentMethod.mutate");
    expect(router).toContain("deleteCategory: protectedProcedure");
    expect(router).toContain("deletePaymentMethod: protectedProcedure");
  });

  it("keeps transaction and input dialogs scrollable above the keyboard", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("modalScrollableContent");
    expect(app).toContain("keyboardDismissMode=\"on-drag\"");
    expect(app).toContain("automaticallyAdjustKeyboardInsets");
    expect(app).toContain("transactionModalScrollContent: { flexGrow: 1, paddingBottom: 12 }");
    expect(app).toContain("transactionModalCard: { paddingBottom: 78 }");
    expect(app).not.toContain("transactionModalScrollContent: { flexGrow: 1, justifyContent: \"flex-end\"");
    expect(app).not.toContain("transactionModalCard: { minHeight: \"100%\"");
    expect((app.match(/contentContainerStyle=\{styles\.modalScrollableContent\}/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it("renders clear ocean, cherry and sunset scene elements without fixed light surfaces", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("key={`blossom-${left}`}");
    expect(app).toContain("key={`wave-${left}`}");
    expect(app).toContain("key={`reflection-${index}`}");
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).toContain('android: undefined');
    expect(app).not.toContain('android: "height"');
    expect(app).toContain("confirmContent");
    expect(app).toContain('maxHeight: "88%"');
  });

  it("keeps a verified per-user monthly reminder schedule lifecycle", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const server = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(router).toContain("syncMonthlySettlementReminderSchedule");
    expect(router).toContain("createHeartbeatJob");
    expect(router).toContain("updateHeartbeatJob");
    expect(router).toContain("updateNotificationScheduleTaskUid");
    expect(server).toContain("monthly-settlement-reminders");
    expect(server).toContain("sdk.authenticateRequest(req)");
    expect(server).toContain("user.isCron");
  });

  it("normalizes legacy category and payment icons into selectable emojis", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("const CATEGORY_EMOJI_CHOICES");
    expect(app).toContain("const PAYMENT_EMOJI_CHOICES");
    expect(app).toContain('"◌": "🏷️"');
    expect(app).toContain("const categoryEmoji");
    expect(app).toContain("const paymentEmoji");
    expect(app).toContain("function EmojiPicker");
    expect(app).toContain('setIcon(mode === "category" ? "🏷️" : "💳")');
    expect(app).toContain("icon: categoryEmoji({ name: draftCategoryName, icon: draftCategoryIcon })");
    expect(app).toContain("icon: paymentEmoji({ name: draftPaymentName, icon: draftPaymentIcon })");
    expect(app).toContain("categoryEmoji(item)");
    expect(app).toContain("paymentEmoji(item)");
    expect(app).not.toContain('icon: draftCategoryIcon.trim() || "◌"');
  });

  it("keeps instant transaction removal, useful activity filtering, and cached ledger refreshes", () => {
    const app = readMobile("app/index.tsx");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(app).toContain("setTransactions(current => current.filter(item => item.id !== transaction.id))");
    expect(app).toContain("setCalendarTransactions(current => current.filter(item => item.id !== transaction.id))");
    expect(app).toContain("void refresh()");
    expect(app).toContain("recentTransactionsButton");
    expect(app).toContain("activityFilter");
    expect(app).toContain("activityLogSummary");
    expect(app).toContain("activityKind");
    expect(app).toContain("recurringSyncRef");
    expect(app).toContain("lastRecurringSync");
    expect(app).toContain("api.ledger.workspace.query");
    expect(router).toContain("workspace: protectedProcedure");
    expect(router).toContain("Promise.all([");
  });

  it("ships the intended app version and deep-link configuration", () => {
    const appJson = JSON.parse(readMobile("app.json")) as {
      expo?: { version?: string; scheme?: string; android?: { versionCode?: number } };
    };
    expect(appJson.expo?.version).toBe("1.2.8.2");
    expect(appJson.expo?.android?.versionCode).toBe(12);
    expect(readMobile("package.json")).toContain('"version": "1.2.8.2"');
    expect(appJson.expo?.scheme).toBe("togetherledger");
    expect(readMobile("app.json")).toContain("expo-notifications");
    expect(readMobile("app.json")).toContain('"googleServicesFile": "./google-services.json"');
    expect(readMobile("app.json")).toContain('"softwareKeyboardLayoutMode": "resize"');
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
    expect(workflow).toContain('      - "release/**"');
    expect(workflow).toContain("android-actions/setup-android@v3");
    expect(workflow).toContain("pnpm run prebuild:android");
    expect(workflow).toContain("assembleRelease");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain(
      "together-ledger-${{ steps.app-version.outputs.version }}-release-apk"
    );
    expect(workflow).toContain("together-ledger.apk");
    expect(workflow).toContain("together-ledger.apk.sha256");
    expect(workflow).toContain("release upload");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(packageJson.scripts?.["prebuild:android"]).toContain(
      "expo prebuild --platform android --no-install"
    );
    expect(packageJson.scripts?.["build:android:ci"]).toContain(
      "assembleDebug"
    );
  });

  it("keeps pnpm deployment configuration in the workspace file so frozen installs match the lockfile", () => {
    const workspace = readFileSync(resolve(process.cwd(), "pnpm-workspace.yaml"), "utf8");
    const rootPackage = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    expect(workspace).toContain("overrides:");
    expect(workspace).toContain('"tailwindcss>nanoid": 3.3.7');
    expect(workspace).toContain("patchedDependencies:");
    expect(workspace).toContain('"wouter@3.7.1": patches/wouter@3.7.1.patch');
    expect(rootPackage).not.toContain('"pnpm": {');
  });
});
