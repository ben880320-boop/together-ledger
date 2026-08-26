import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const routers = source("./routers.ts");
const db = source("./db.ts");
const firebaseAuth = source("./firebaseAuth.ts");
const automation = source("./authAutomation.ts");
const webMain = source("../client/src/main.tsx");
const webAuth = source("../client/src/pages/WebAuth.tsx");
const webFirebase = source("../client/src/lib/firebaseAuth.ts");
const mobileApp = source("../mobile/app/index.tsx");
const mobileFirebase = source("../mobile/lib/firebaseAuth.ts");
const adminConsole = source("../client/src/pages/AdminConsole.tsx");
const lifecycleRunbook = source("../docs/test-account-cross-platform-lifecycle-v1.3.19.md");

describe("帳戶生命週期安全契約", () => {
  it("Web token 交換明確傳遞記住裝置選擇，且伺服器只在選擇後建立持久 cookie", () => {
    expect(webAuth).toContain("mutateAsync({ idToken, rememberDevice: remember })");
    expect(routers).toContain("rememberDevice: z.boolean().default(false)");
    expect(routers).toContain("persistLocalSessionCookie(ctx, token, input.rememberDevice)");
  });

  it("已記住裝置在 App session 到期時先進入 Firebase 靜默恢復，而非直接導向外部登入", () => {
    expect(webMain).toContain('window.location.assign("/login")');
    expect(webMain).toContain("isRoutingToFirebaseRecovery");
    expect(webAuth).toContain("getPersistedVerifiedFirebaseIdToken");
    expect(webAuth).toContain("completeFirebaseSignIn(idToken, true)");
    expect(mobileApp).toContain("authState?.user ?? null");
    expect(mobileApp).toContain("if (await getRememberDevicePreference())");
    expect(mobileApp).toContain("isUnauthorized(loadError)");
  });

  it("既有本機密碼只能在期限內作為遷移用途，過期後回傳可辨識的轉換錯誤", () => {
    expect(db).toContain("legacyPasswordLoginDeadline");
    expect(db).toContain('throw new Error("LEGACY_PASSWORD_MIGRATION_EXPIRED")');
    expect(routers).toContain('code: "PRECONDITION_FAILED"');
    expect(routers).toContain("舊帳密遷移期已結束");
  });

  it("信箱變更必須先於 Firebase 近期驗證，並只同步相同 Firebase UID 的已驗證信箱", () => {
    expect(webFirebase).toContain("reauthenticateFirebaseEmail");
    expect(webFirebase).toContain("verifyBeforeUpdateEmail");
    expect(mobileFirebase).toContain("reauthenticateFirebaseEmail");
    expect(mobileFirebase).toContain("verifyBeforeUpdateEmail");
    expect(db).toContain("user.firebaseUid !== input.firebaseUid");
    expect(routers).toContain("syncFirebaseEmail: protectedProcedure");
    expect(mobileApp).toContain("FirebaseEmailChangeModal");
  });

  it("已綁定 Firebase 的電子信箱帳密帳戶可在近期驗證後自行刪除，非密碼帳戶仍會被拒絕", () => {
    expect(routers).toContain('ctx.user.loginMethod === "firebase-email" && Boolean(ctx.user.firebaseUid)');
    expect(routers).toContain("verifyRecentlyAuthenticatedFirebaseIdentity(input.firebaseIdToken)");
    expect(routers).toContain('message: "只有電子信箱帳密帳號可以在 App 內自行刪除。"');
  });

  it("管理員端點在後端強制授權，且拒絕自刪與刪除其他管理員", () => {
    expect(routers).toContain("admin: router(");
    expect(routers).toContain("deleteUser: adminProcedure");
    expect(routers).toContain("input.targetUserId === ctx.user.id");
    expect(routers).toContain('target.role === "admin"');
    expect(routers).toContain("writeAdminAccountAudit");
  });

  it("管理員只能撤銷一般帳戶的所有 session，並同時撤銷 Firebase refresh token 與寫入稽核", () => {
    expect(routers).toContain("revokeUserSessions: adminProcedure");
    expect(routers).toContain("input.targetUserId === ctx.user.id");
    expect(routers).toContain('target.role === "admin"');
    expect(routers).toContain('action: "sessionRevoke"');
    expect(db).toContain("revokeUserApplicationSessions");
    expect(firebaseAuth).toContain("revokeFirebaseIdentitySessions");
  });

  it("持久登入、管理員撤銷與同步衝突只留下去識別化作業事件，不記錄帳戶或財務資料", () => {
    expect(db).toContain("recordOperationalSecurityEvent");
    expect(db).toContain("operationalSecurityEvents");
    expect(routers).toContain('event: "rememberRestore"');
    expect(routers).toContain('event: "sessionRevoke"');
    expect(routers).toContain('event: "syncConflict"');
    expect(routers).not.toContain("recordOperationalSecurityEvent({ event: \"syncConflict\", userId:");
  });

  it("管理員只能查看匿名事件彙總，且 UI 提供失敗後的重新讀取入口", () => {
    const summaryStart = db.indexOf("export async function getOperationalSecurityEventSummary");
    const summaryEnd = db.indexOf("export async function listAdminAccountAudits", summaryStart);
    const summaryBlock = db.slice(summaryStart, summaryEnd);
    expect(routers).toContain("operationalOverview: adminProcedure");
    expect(summaryBlock).toContain("groupBy(");
    expect(summaryBlock).not.toContain("userId");
    expect(summaryBlock).not.toContain("ledgerId");
    expect(summaryBlock).not.toContain("amount");
    expect(adminConsole).toContain("trpc.admin.operationalOverview.useQuery");
    expect(adminConsole).toContain("不包含任何帳戶、帳本、交易、收支或 Firebase 身分資料。");
    expect(adminConsole).toContain("重新讀取");
  });

  it("跨端生命週期劇本明定只用測試帳戶，並覆蓋恢復、撤銷與不可逆刪除邊界", () => {
    expect(lifecycleRunbook).toContain("專門建立且無真實帳本、收支、聯絡資料或共同成員的測試 Firebase Email/Password 帳戶");
    expect(lifecycleRunbook).toContain("已記住裝置的短效 Session 到期驗收");
    expect(lifecycleRunbook).toContain("管理員撤銷所有登入驗收");
    expect(lifecycleRunbook).toContain("只限測試帳戶的刪除驗收");
    expect(lifecycleRunbook).toContain("不得附帶帳戶、Email、Firebase UID、JWT、IP、帳本、交易、金額或收據資料");
  });

  it("每日清理只處理超過 24 小時、未驗證且使用 Email/Password 的 Firebase-only 身分", () => {
    expect(firebaseAuth).toContain("cleanupUnverifiedEmailPasswordFirebaseIdentities");
    expect(firebaseAuth).toContain("24 * 60 * 60 * 1000");
    expect(firebaseAuth).toContain("provider.providerId === \"password\"");
    expect(firebaseAuth).toContain("if (user.emailVerified || !user.email || !hasPasswordProvider");
    expect(firebaseAuth).toContain("await auth.deleteUser(user.uid)");
    expect(automation).toContain("DAILY_AUTH_CLEANUP_JOB_PATH");
    expect(automation).toContain("recordAuthAutomationRun");
  });
});
