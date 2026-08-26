import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const routers = source("./routers.ts");
const db = source("./db.ts");
const firebaseAuth = source("./firebaseAuth.ts");
const automation = source("./authAutomation.ts");
const webAuth = source("../client/src/pages/WebAuth.tsx");
const webFirebase = source("../client/src/lib/firebaseAuth.ts");
const mobileApp = source("../mobile/app/index.tsx");
const mobileFirebase = source("../mobile/lib/firebaseAuth.ts");

describe("帳戶生命週期安全契約", () => {
  it("Web token 交換明確傳遞記住裝置選擇，且伺服器只在選擇後建立持久 cookie", () => {
    expect(webAuth).toContain("mutateAsync({ idToken, rememberDevice: remember })");
    expect(routers).toContain("rememberDevice: z.boolean().default(false)");
    expect(routers).toContain("persistLocalSessionCookie(ctx, token, input.rememberDevice)");
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
