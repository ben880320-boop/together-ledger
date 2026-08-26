import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = resolve(process.cwd(), "mobile");
const readMobile = (relativePath: string) =>
  readFileSync(resolve(mobileRoot, relativePath), "utf8");

describe("Together Ledger v1.3.0 Android wiring", () => {
  it("uses Firebase email/password authentication without a Manus OAuth redirect", () => {
    const app = readMobile("app/index.tsx");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    const sdk = readFileSync(resolve(process.cwd(), "server/_core/sdk.ts"), "utf8");
    expect(app).toContain("電子信箱");
    expect(app).toContain("signInWithFirebaseEmail");
    expect(app).toContain("registerFirebaseEmailWithProfile");
    expect(app).toContain("exchangeFirebaseSession");
    expect(app).toContain("saveSessionToken(result.token)");
    expect(app).not.toContain("WebBrowser.openAuthSessionAsync");
    expect(router).toContain("exchangeFirebaseToken: publicProcedure");
    expect(router).toContain("FIREBASE_APP_SESSION_TTL_MS");
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

  it("uses the themed confirmation surface for destructive actions and App 內更新 availability", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("function ConfirmModal(");
    expect(app).toContain("<ConfirmModal request={confirmRequest}");
    expect(
      (app.match(/<ConfirmModal request=\{confirmRequest\}/g) || []).length
    ).toBeGreaterThanOrEqual(3);
    expect(app).toContain("confirmOverlay");
    expect(app).toContain('title: "發現新版 Together Ledger"');
    expect(app).toContain('confirmText: "下載並更新"');
    expect(app).toContain("fetchLatestAndroidRelease");
    expect(app).toContain("FileSystem.createDownloadResumable");
    expect(app).toContain("IntentLauncher.startActivityAsync");
    expect(app).toContain("檢查版本與更新內容");
    expect(app).toContain("再次確認移除");
    expect((app.match(/name=\"logout\"/g) || []).length).toBe(1);
  });

  it("wires appearance, settings management, home search, and notification controls", () => {
    const app = readMobile("app/index.tsx");
    const ledgerIcons = readFileSync(resolve(process.cwd(), "shared/ledgerIcons.ts"), "utf8");
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
    expect(app).not.toContain("每月結算提醒");
    expect(app).not.toContain("通知金額門檻（NT$）");
    expect(app).not.toContain("saveNotificationPreferences");
    expect(app).not.toContain("requestExpoPushToken");
    expect(app).not.toContain("pushRegistrationUnavailable");
    expect(app).not.toContain("推播裝置尚未完成註冊");
    expect(app).not.toContain("normalizeNotificationPreferences");
    expect(app).not.toContain("notificationRequestRef");
    expect(app).toContain("function SuccessToast(");
    expect(app).toContain("showToast");
    expect(app).toContain("5_000");
    expect(app).not.toContain("提醒設定已儲存");
    expect(app).toContain("目前版本 v{APP_VERSION}");
    expect(app).toContain("SettingsSection");
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).not.toContain("每月提醒日期（1–28 日）");
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
    expect(app).toContain("GITHUB_LATEST_RELEASE_API");
    expect(app).toContain("isVersionNewer");
    expect(app).toContain("mutationGuardRef");
    expect(app).toContain("setTimeout(() => setError");
    expect(app).toContain("FlatList");
    expect(app).toContain("maxToRenderPerBatch={4}");
    expect(app).toContain("backgroundColor: palette.surface");
    expect(app).toContain("LEDGER_EMOJI_OPTIONS");
    expect(app).toContain("CATEGORY_EMOJI_OPTIONS");
    expect(app).toContain("PAYMENT_EMOJI_OPTIONS");
    expect(app).toContain("searchLedgerIconOptions");
    expect(ledgerIcons).toContain("LEDGER_ICON_OPTIONS");
    expect(ledgerIcons).toContain('"🌊"');
    expect(readMobile("app.json")).toContain("softwareKeyboardLayoutMode");
    expect(readMobile("app.json")).toContain("REQUEST_INSTALL_PACKAGES");
  });

  it("resolves root shared modules during Android release bundling", () => {
    const metro = readMobile("metro.config.js");
    expect(metro).toContain('require("expo/metro-config")');
    expect(metro).toContain("config.watchFolders = [workspaceRoot]");
    expect(metro).toContain('"@shared": path.resolve(workspaceRoot, "shared")');
    expect(metro).toContain("config.resolver.nodeModulesPaths");
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
    expect(app).toContain('const usesNativeAndroidResize = Platform.OS === "android"');
    expect(app).toContain('enabled={enabled ?? !usesNativeAndroidResize}');
    expect(app).toContain('behavior={Platform.OS === "ios" ? "padding" : undefined}');
  });

  it("renders clear ocean, cherry and sunset scene elements without fixed light surfaces", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("key={`blossom-${left}`}");
    expect(app).toContain("key={`wave-${left}`}");
    expect(app).toContain("key={`reflection-${index}`}");
    expect(app).toContain("KeyboardAvoidingView");
    expect(app).toContain('Platform.OS === "ios" ? "padding" : undefined');
    expect(app).toContain("keyboardVerticalOffset={Platform.OS === \"ios\" ? 12 : 0}");
    expect((app.match(/automaticallyAdjustKeyboardInsets/g) || []).length).toBeGreaterThanOrEqual(8);
    expect(app).not.toContain('android: "height"');
    expect(app).toContain("confirmContent");
    expect(app).toContain('maxHeight: "88%"');
  });

  it("在總覽顯示本月待結算摘要，並能依月份與狀態篩選受保護的快照歷史", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("本月待結算");
    expect(app).toContain("api.ledger.settlement.history.query");
    expect(app).toContain("settlementMonthFilter");
    expect(app).toContain("settlementStatusFilter");
    expect(app).toContain("settlementStatusLabel");
    expect(app).toContain('"pending" | "settled" | "reopened"');
  });

  it("keeps all notification delivery and reminder scheduling disabled", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const notifications = readFileSync(resolve(process.cwd(), "server/notifications.ts"), "utf8");
    expect(router).toContain("syncMonthlySettlementReminderSchedule");
    expect(router).toContain("disabled: true as const");
    expect(router).not.toContain("createHeartbeatJob");
    expect(router).not.toContain("updateHeartbeatJob");
    expect(router).not.toContain("updateNotificationScheduleTaskUid");
    expect(notifications).toContain("NOTIFICATIONS_ENABLED = false");
    expect(notifications).toContain('skipped: "notifications-disabled"');
  });

  it("保留舊圖示相容性，並讓分類與支付方式可選擇無圖示及搜尋完整圖示庫", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("CATEGORY_EMOJI_OPTIONS");
    expect(app).toContain("PAYMENT_EMOJI_OPTIONS");
    expect(app).toContain("searchCategoryPaymentIconOptions(query, safeChoices)");
    expect(app).toContain("const options = expanded ? matchedOptions : safeChoices.slice(0, 12);");
    expect(app).toContain("不使用圖示");
    expect(app).toContain('placeholder="搜尋圖示，例如：車、旅行、愛心"');
    expect(app).toContain('"◌": "🏷️"');
    expect(app).toContain("const categoryEmoji");
    expect(app).toContain("const paymentEmoji");
    expect(app).toContain("function EmojiPicker");
    expect(app).toContain('if (item?.icon === "") return "";');
    expect(app).toContain('setIcon("");');
    expect(app).toContain('icon: icon === "" ? ""');
    expect(app).toContain('draftCategoryIcon === "" ? "" : categoryEmoji');
    expect(app).toContain('draftPaymentIcon === "" ? "" : paymentEmoji');
    expect(app).toContain("categoryEmoji(item)");
    expect(app).toContain("paymentEmoji(item)");
    expect(app).not.toContain('icon: draftCategoryIcon.trim() || "◌"');
  });

  it("防止帳本設定圖示 picker 的未定義常數造成 Android render 閃退", () => {
    const app = readMobile("app/index.tsx");
    expect(app).not.toContain("CATEGORY_EMOJI_CHOICES");
    expect(app).not.toContain("PAYMENT_EMOJI_CHOICES");
    expect(app).toContain("choices={CATEGORY_EMOJI_OPTIONS}");
    expect(app).toContain("choices={PAYMENT_EMOJI_OPTIONS}");
    expect(app).toContain("const safeChoices = choices.filter");
    expect(app).toContain("key={`${emoji}-${index}`}");
    expect(app).toContain("function CompactLedgerIconPicker");
    expect(app).toContain("key={`${item}-${index}`}");
    expect(app).toContain("SettingsErrorBoundary");
    expect(app).toContain('"android.ledger-settings.render"');
  });

  it("讓錯誤診斷維持預設關閉、需明確同意且只傳送去識別化技術資料", () => {
    const app = readMobile("app/index.tsx");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    expect(app).toContain("const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false)");
    expect(app).toContain("api.profile.diagnosticsPreference.query()");
    expect(app).toContain("api.profile.updateDiagnosticsPreference.mutate({ enabled })");
    expect(app).toContain("api.profile.reportDiagnostic.mutate");
    expect(app).toContain("開啟錯誤診斷？");
    expect(app).toContain("不會傳送帳本、收支、邀請碼、帳號、電子信箱、密碼、憑證或收據圖片");
    expect(app).toContain("sanitizeDiagnosticStack");
    expect(app).toContain("android.runtime.unhandled");
    expect(router).toContain("diagnosticsPreference: protectedProcedure");
    expect(router).toContain("updateDiagnosticsPreference: protectedProcedure");
    expect(router).toContain("reportDiagnostic: protectedProcedure");
    expect(db).toContain("if (!preferences.diagnosticReportsEnabled) return { accepted: false as const };");
    expect(db).toContain("await db.delete(diagnosticReports).where(eq(diagnosticReports.userId, userId));");
  });

  it("讓診斷偏好在首次寫入競態或暫時失敗後可安全重試", () => {
    const app = readMobile("app/index.tsx");
    const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    expect(app).toContain("const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)");
    expect(app).toContain("const [diagnosticsError, setDiagnosticsError] = useState(\"\")");
    expect(app).toContain("onRetryDiagnostics");
    expect(app).toContain("diagnosticsRetryRow");
    expect(app).toContain("重新讀取錯誤診斷設定");
    expect(app).toContain(">重試</Text>");
    expect(db).toContain("onDuplicateKeyUpdate");
    expect(db).toContain("diagnosticReportsEnabled: enabled ? 1 : 0");
  });

  it("避免同一帳本同步重複請求，並讓載入骨架尊重減少動態效果", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain("ledgerReloadInFlightRef");
    expect(app).toContain("const reloadKey = `${ledgerId}:${month}`;");
    expect(app).toContain("const inFlight = ledgerReloadInFlightRef.current.get(reloadKey);");
    expect(app).toContain("function LoadingPulse(");
    expect(app).toContain("if (preferences.reduceMotion)");
    expect(app).toContain("Animated.loop(Animated.sequence");
    expect(app).toContain("正在同步最新帳本資料…");
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

  it("keeps editable and removable category budgets and recurring entries", () => {
    const app = readMobile("app/index.tsx");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(app).toContain("編輯分類預算");
    expect(app).toContain("再次確認移除預算");
    expect(app).toContain("api.ledger.deleteBudget.mutate");
    expect(app).toContain("editingBudget");
    expect(app).toContain("編輯固定收支");
    expect(app).toContain("再次確認移除固定收支");
    expect(app).toContain("api.ledger.updateRecurring.mutate");
    expect(app).toContain("api.ledger.deleteRecurring.mutate");
    expect(app).toContain("editingRecurring");
    expect(router).toContain("deleteBudget: protectedProcedure");
    expect(router).toContain("updateRecurring: protectedProcedure");
    expect(router).toContain("deleteRecurring: protectedProcedure");
  });

  it("ships the intended app version and deep-link configuration", () => {
    const app = readMobile("app/index.tsx");
    const appJson = JSON.parse(readMobile("app.json")) as {
      expo?: { version?: string; scheme?: string; android?: { versionCode?: number } };
    };
    expect(appJson.expo?.version).toBe("1.3.16");
    expect(appJson.expo?.android?.versionCode).toBe(39);
    expect(readMobile("package.json")).toContain('"version": "1.3.16"');
    expect(appJson.expo?.scheme).toBe("togetherledger");
    expect(readMobile("app.json")).not.toContain("expo-notifications");
    expect(readMobile("app.json")).toContain('"googleServicesFile": "./google-services.json"');
    expect(readMobile("app.json")).toContain('"softwareKeyboardLayoutMode": "resize"');
    expect(app).toContain("autoDownloadUpdatesOnWifi");
    expect(app).toContain("Network.getNetworkStateAsync");
    expect(app).toContain("formatUpdateMessage");
    expect(app).toContain("安全性摘要");
    expect(app).toContain("更新與下載");
    expect(app).toContain("僅 Wi‑Fi 自動下載");
    expect(app).toContain("getUpdateNotesPreview");
    expect(app).toContain("getUpdateSecuritySummary");
    expect(app).toContain("readSavedUpdateResume");
    expect(app).toContain("download.pauseAsync");
    expect(app).toContain("resumeAndroidUpdate");
    expect(app).toContain("GITHUB_RELEASE_HISTORY_API");
    expect(app).toContain("更新歷程");
    expect(app).toContain("取得更新歷程");
    expect(app).toContain("跟隨系統");
    expect(app).toContain("淺色模式");
    expect(app).toContain("深色模式");
    expect(app).toContain("colorMode");
    expect(app).toContain("updateStatusBadge");
    expect(app).toContain("AppUpdateDiagnostic");
    expect(app).toContain("更新安裝診斷");
    expect(app).toContain("來源與校驗");
    expect(app).toContain("SHA-256 校驗檔");
    expect(app).toContain("availablePayments");
    expect(app).toContain("managerActionScroll");
    expect(app).toContain('name="delete-outline"');
    expect(readMobile("lib/api.ts")).toContain("伺服器暫時回傳了非預期內容");
    expect(readMobile("package.json")).toContain('"expo-network"');
  });

  it("以可取消且可重連的 SSE 事件流同步帳本，並共用擴充圖示庫", () => {
    const app = readMobile("app/index.tsx");
    const apiSource = readMobile("lib/api.ts");
    const iconSource = readFileSync(resolve(process.cwd(), "shared/ledgerIcons.ts"), "utf8");

    expect(apiSource).toContain("export function subscribeLedgerEvents");
    expect(apiSource).toContain("Last-Event-ID");
    expect(apiSource).toContain("eventName !== \"ledger-change\"");
    expect(apiSource).toContain("Authorization: `Bearer ${token}`");
    expect(apiSource).toContain("controller.abort()");
    expect(apiSource).toContain("realtimeRetryDelay");
    expect(app).toContain("subscribeLedgerEvents");
    expect(app).toContain("LEDGER_EMOJI_OPTIONS");
    expect(app).toContain("searchLedgerIconOptions");
    expect(iconSource.match(/"[^"\n]+"/g)?.length ?? 0).toBeGreaterThanOrEqual(69);
  });

  it("在暫時帳本載入失敗時重試並回到快照，且將圖示、Wiki 與版本歷程修復維持在 App 內", () => {
    const app = readMobile("app/index.tsx");
    expect(app).toContain('import { extractVersionNotes } from "@shared/releaseNotes"');
    expect(app).toContain("extractVersionNotes(release.body, release.tag_name)");
    expect(app).toContain("isTemporaryLedgerLoadError");
    expect(app).toContain("waitForLedgerRetry");
    expect(app).toContain("setUsingOfflineSnapshot(true)");
    expect(app).toContain("GITHUB_WIKI_URL");
    expect(app).toContain("function CompactLedgerIconPicker");
    expect(app).toContain("const matchedOptions = searchLedgerIconOptions(normalizedQuery);");
    expect(readFileSync(resolve(process.cwd(), "shared/ledgerIcons.ts"), "utf8")).toContain("return LEDGER_EMOJI_OPTIONS.filter");
    expect(app).toContain('const options = expanded ? matchedOptions : emojiOptions.slice(0, 12);');
    expect(app).toContain('accessibilityLabel="不顯示帳本圖示"');
    expect(app).toContain("不使用圖示");
    expect(app).toContain('placeholder="搜尋圖示，例如：車、旅行、愛心"');
    expect(app).toContain("{ledger.icon ? <View style={styles.ledgerHomeIcon}><Text style={{ fontSize: 23 }}>{ledger.icon}</Text></View> : null}");
    expect(app).toContain("{ledger.icon ? <Text style={{ fontSize: 15 }}>{ledger.icon}</Text> : null}");
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
    expect(workflow).toContain("Prepare stable Android release signing");
    expect(workflow).toContain("secrets.ANDROID_KEYSTORE_BASE64");
    expect(workflow).toContain("secrets.ANDROID_KEYSTORE_PASSWORD");
    expect(workflow).toContain("secrets.ANDROID_KEY_ALIAS");
    expect(workflow).toContain("secrets.ANDROID_KEY_PASSWORD");
    expect(workflow).toContain("ci-release-signing.gradle");
    expect(workflow).toContain("signingConfigs.create(\"ciRelease\")");
    expect(workflow).toContain("apksigner");
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
