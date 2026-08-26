import { z } from "zod";
import { customAlphabet } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import type { TrpcContext } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  archiveCategory,
  archivePaymentMethod,
  deleteCategory,
  deleteBudget,
  deletePaymentMethod,
  deleteRecurring,
  createCategory,
  updateCategory,
  setCategoryActive,
  createLedger,
  createPaymentMethod,
  updatePaymentMethod,
  updateRecurring,
  setPaymentMethodActive,
  createRecurring,
  confirmMonthlySettlementSnapshot,
  createMonthlySettlementSnapshot,
  createTransaction,
  getActivityLogs,
  getAnalytics,
  logActivity,
  syncDueRecurring,
  getCalendarTransactions,
  getCategories,
  getLedgerAccess,
  getLedgerMembers,
  getPaymentMethods,
  updateLedgerMemberRole,
  getSettlementSummary,
  getMonthlySettlementSnapshot,
  getTransactionForLedger,
  getTransactions,
  updateTransaction,
  deleteTransaction,
  joinLedgerByInviteCode,
  leaveLedger,
  updateUserName,
  listBudgets,
  listLedgersForUser,
  listRecurring,
  listSettlements,
  listMonthlySettlementSnapshots,
  upsertBudget,
  renameLedger,
  transferLedgerOwnership,
  listTravelPlans,
  createTravelPlan,
  deleteTravelPlan,
  createFirebaseUser,
  createLocalUser,
  deleteUserAccount,
  getAdminAccountSummary,
  getAuthAutomationStatus,
  getUserByEmail,
  getUserByFirebaseUid,
  getUserById,
  listAdminAccountAudits,
  listAdminAccounts,
  verifyLocalPassword,
  syncFirebaseEmailForUser,
  writeAdminAccountAudit,
  listSavingsBuckets,
  listSavingsAllocations,
  createSavingsBucket,
  createDiagnosticReport,
  updateSavingsBucket,
  stopSavingsBucket,
  archiveSavingsBucket,
  restoreSavingsBucket,
  addSavingsDeposit,
  getNotificationPreferences,
  updateDiagnosticReportingEnabled,
  reopenMonthlySettlementSnapshot,
  reproposeMonthlySettlementSnapshot,
  linkUserToFirebaseUid,
} from "./db";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { sdk } from "./_core/sdk";
import {
  deleteFirebaseIdentity,
  verifyFirebaseIdentity,
  verifyRecentlyAuthenticatedFirebaseIdentity,
} from "./firebaseAuth";

const ledgerType = z.enum(["couple", "roommate", "family", "travel", "custom"]);
// Transfers are created only by protected system workflows such as savings deposits.
// General income/expense forms must never create a transfer directly.
const transactionType = z.enum(["expense", "income"]);
const splitType = z.enum(["equal", "custom", "amount", "none"]);
const localAccountInput = z.object({
  email: z.string().trim().email("請輸入有效的電子信箱").max(320),
  password: z.string().min(8, "密碼至少需要 8 個字元").max(128, "密碼不可超過 128 個字元"),
});
const firebaseIdTokenInput = z.object({
  idToken: z.string().min(100, "Firebase 登入憑證無效，請重新登入。"),
  rememberDevice: z.boolean().default(false),
});
export async function syncMonthlySettlementReminderSchedule(input: {
  userId: number;
  sessionToken: string;
  monthlySettlementEnabled: boolean;
  monthlyReminderDay: number;
}) {
  // 通知功能暫停期間不建立、更新或啟用任何月結算排程；保留函式簽章以維持舊版用戶端相容。
  void input;
  return null;
}

function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式必須為 YYYY-MM" });
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式不正確" });
  return { start: new Date(Date.UTC(year, monthIndex, 1)), end: new Date(Date.UTC(year, monthIndex + 1, 1)) };
}

function previousMonthKey(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式必須為 YYYY-MM" });
  const current = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 2, 1));
  return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function assertMonthOpenForTransactions(ledgerId: number, month: string) {
  const snapshot = await getMonthlySettlementSnapshot(ledgerId, month);
  if (snapshot?.status === "settled") {
    throw new TRPCError({ code: "CONFLICT", message: `${month} 已完成雙方結算。請由管理員重新開啟該月份後再修改收支。` });
  }
}

export function persistLocalSessionCookie(
  ctx: Pick<TrpcContext, "req" | "res">,
  token: string,
  rememberDevice = false,
) {
  ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req, rememberDevice));
}

async function requireLedger(ledgerId: number, userId: number) {
  const access = await getLedgerAccess(ledgerId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "你不是此帳本的成員" });
  return access;
}

const memberInput = z.object({ userId: z.number().int().positive(), shareAmount: z.number().int().nonnegative() });
const generateInviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const FIREBASE_APP_SESSION_TTL_MS = 60 * 60 * 1000;

export const appRouter = router({
  system: systemRouter,
  notifications: router({
    preferences: protectedProcedure.query(() => ({
      id: 0, userId: 0, incomeEnabled: 0, expenseEnabled: 0, minimumAmount: 0,
      monthlySettlementEnabled: 0, monthlyReminderDay: 1, budgetAlert80Enabled: 0, budgetAlert100Enabled: 0,
      scheduleCronTaskUid: null, createdAt: new Date(0), updatedAt: new Date(0), disabled: true as const,
    })),
    status: protectedProcedure.query(() => ({
      preferences: {
        id: 0, userId: 0, incomeEnabled: 0, expenseEnabled: 0, minimumAmount: 0,
        monthlySettlementEnabled: 0, monthlyReminderDay: 1, budgetAlert80Enabled: 0, budgetAlert100Enabled: 0,
        scheduleCronTaskUid: null, createdAt: new Date(0), updatedAt: new Date(0), disabled: true as const,
      },
      devices: [],
      disabled: true as const,
    })),
    updatePreferences: protectedProcedure
      .input(z.object({
        incomeEnabled: z.boolean(),
        expenseEnabled: z.boolean(),
        minimumAmount: z.number().int().min(0).max(100_000_000),
        monthlySettlementEnabled: z.boolean(),
        monthlyReminderDay: z.number().int().min(1).max(28),
        budgetAlert80Enabled: z.boolean().default(true),
        budgetAlert100Enabled: z.boolean().default(true),
      }))
      .mutation(() => ({ success: true as const, disabled: true as const })),
    registerDevice: protectedProcedure
      .input(z.object({ expoPushToken: z.string().trim().regex(/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/, "無效的 Expo 推播 token"), platform: z.enum(["android", "ios"]) }))
      .mutation(() => ({ success: true as const, disabled: true as const })),
  }),
  auth: router({
    // tRPC can omit a top-level null query result from the response stream.
    // Always wrap the optional account in an object so logged-out web sessions
    // receive a complete JSON response instead of waiting on an empty body.
    me: publicProcedure.query(opts => ({ user: opts.ctx.user ?? null })),
    register: publicProcedure
      .input(localAccountInput.extend({ name: z.string().trim().min(1, "請輸入暱稱").max(64) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await createLocalUser(input);
          const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "", sessionVersion: user.sessionVersion });
          persistLocalSessionCookie(ctx, token);
          return { token, user: { id: user.id, name: user.name, email: user.email, loginMethod: user.loginMethod } };
        } catch (error) {
          if (error instanceof Error && error.message.includes("已註冊")) {
            throw new TRPCError({ code: "CONFLICT", message: error.message });
          }
          throw error;
        }
      }),
    login: publicProcedure
      .input(localAccountInput)
      .mutation(async ({ ctx, input }) => {
        let user;
        try {
          user = await verifyLocalPassword(input.email, input.password);
        } catch (error) {
          if (error instanceof Error && error.message === "LEGACY_PASSWORD_MIGRATION_EXPIRED") {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "舊帳密遷移期已結束，請使用已驗證的 Firebase 電子信箱登入。" });
          }
          throw error;
        }
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "電子信箱或密碼錯誤" });
        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "", sessionVersion: user.sessionVersion });
        persistLocalSessionCookie(ctx, token);
        return { token, user: { id: user.id, name: user.name, email: user.email, loginMethod: user.loginMethod } };
      }),
    exchangeFirebaseToken: publicProcedure
      .input(firebaseIdTokenInput)
      .mutation(async ({ ctx, input }) => {
        let identity;
        try {
          identity = await verifyFirebaseIdentity(input.idToken);
        } catch (error) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Firebase 驗證失敗，請重新登入。" });
        }
        let user = await getUserByFirebaseUid(identity.uid);
        if (!user) {
          const existingUser = await getUserByEmail(identity.email!);
          if (existingUser) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "此電子信箱已有既有共帳帳號。請先以原本密碼登入，再到個人設定完成 Firebase 電子信箱綁定。" });
          }
          try {
            user = await createFirebaseUser({ firebaseUid: identity.uid, email: identity.email!, name: identity.name });
          } catch (error) {
            throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "無法建立 Firebase 帳號連結。" });
          }
        } else if (identity.email && user.email !== identity.email.toLowerCase()) {
          try {
            user = await syncFirebaseEmailForUser({ userId: user.id, firebaseUid: identity.uid, email: identity.email });
            await writeAdminAccountAudit({
              adminUserId: user.id,
              targetUserId: user.id,
              action: "emailChange",
              summary: "使用者完成 Firebase 已驗證電子信箱變更",
            });
          } catch (error) {
            throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "無法同步已驗證的新電子信箱。" });
          }
        }
        const token = await sdk.createSessionToken(user.openId, {
          name: user.name ?? "",
          sessionVersion: user.sessionVersion,
          // Firebase revokes its refresh tokens after a password reset; our
          // independent app JWT must expire quickly and be exchanged again.
          expiresInMs: FIREBASE_APP_SESSION_TTL_MS,
        });
        persistLocalSessionCookie(ctx, token, input.rememberDevice);
        return { token, user: { id: user.id, name: user.name, email: user.email, loginMethod: user.loginMethod, emailVerified: true } };
      }),
    syncFirebaseEmail: protectedProcedure
      .input(firebaseIdTokenInput)
      .mutation(async ({ ctx, input }) => {
        let identity;
        try {
          identity = await verifyFirebaseIdentity(input.idToken);
        } catch (error) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Firebase 驗證失敗，請重新登入。" });
        }
        if (identity.uid !== ctx.user.firebaseUid || !identity.email) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Firebase 身分與目前共帳帳戶不一致。" });
        }
        let user;
        try {
          user = await syncFirebaseEmailForUser({ userId: ctx.user.id, firebaseUid: identity.uid, email: identity.email });
          await writeAdminAccountAudit({
            adminUserId: user.id,
            targetUserId: user.id,
            action: "emailChange",
            summary: "使用者完成 Firebase 已驗證電子信箱變更",
          });
        } catch (error) {
          throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "無法同步已驗證的新電子信箱。" });
        }
        const token = await sdk.createSessionToken(user.openId, {
          name: user.name ?? "",
          sessionVersion: user.sessionVersion,
          expiresInMs: FIREBASE_APP_SESSION_TTL_MS,
        });
        persistLocalSessionCookie(ctx, token, input.rememberDevice);
        return { token, email: user.email, changed: true as const };
      }),
    linkFirebase: protectedProcedure
      .input(firebaseIdTokenInput)
      .mutation(async ({ ctx, input }) => {
        let identity;
        try {
          identity = await verifyFirebaseIdentity(input.idToken);
        } catch (error) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Firebase 驗證失敗，請重新登入。" });
        }
        try {
          const user = await linkUserToFirebaseUid({ userId: ctx.user.id, firebaseUid: identity.uid, email: identity.email! });
          const token = await sdk.createSessionToken(user.openId, {
            name: user.name ?? "",
            sessionVersion: user.sessionVersion,
            expiresInMs: FIREBASE_APP_SESSION_TTL_MS,
          });
          persistLocalSessionCookie(ctx, token);
          return { token, email: user.email, firebaseLinked: true as const };
        } catch (error) {
          throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "無法連結 Firebase 帳號。" });
        }
      }),
    firebaseStatus: protectedProcedure.query(({ ctx }) => ({ email: ctx.user.email, firebaseLinked: Boolean(ctx.user.firebaseUid) })),
    deleteAccount: protectedProcedure
      .input(z.object({
        password: z.string().min(1, "請輸入密碼").optional(),
        firebaseIdToken: z.string().min(100, "請重新登入 Firebase 後再刪除帳號。").optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const accountEmail = ctx.user.email;
        const canDeleteWithPassword =
          Boolean(accountEmail) &&
          (ctx.user.loginMethod === "email" ||
            (ctx.user.loginMethod === "firebase-email" && Boolean(ctx.user.firebaseUid)));
        if (!canDeleteWithPassword || !accountEmail) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "只有電子信箱帳密帳號可以在 App 內自行刪除。" });
        }
        if (ctx.user.firebaseUid) {
          if (!input.firebaseIdToken) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "請重新輸入 Firebase 密碼後再刪除帳號。" });
          }
          let identity;
          try {
            identity = await verifyRecentlyAuthenticatedFirebaseIdentity(input.firebaseIdToken);
          } catch (error) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Firebase 再驗證失敗。" });
          }
          if (identity.uid !== ctx.user.firebaseUid || identity.email !== ctx.user.email) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Firebase 身份與目前共帳帳戶不一致，無法刪除。" });
          }
          try {
            await deleteUserAccount(ctx.user.id);
          } catch (error) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "刪除共帳帳戶失敗，請稍後再試。" });
          }
          let firebaseIdentityDeleted = true;
          try {
            await deleteFirebaseIdentity(identity.uid);
          } catch (error) {
            // The Together Ledger account has already been anonymized. Do not
            // report a failure that would invite a user to retry an irreversible
            // delete; retain an audit signal for an administrator to complete
            // Firebase identity cleanup without exposing credentials to clients.
            firebaseIdentityDeleted = false;
            console.error("[Firebase] identity cleanup failed after account deletion", {
              userId: ctx.user.id,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
          return { success: true as const, firebaseIdentityDeleted };
        }
        if (!input.password) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "請輸入目前密碼以確認刪除帳號。" });
        }
        const verifiedUser = await verifyLocalPassword(accountEmail, input.password);
        if (!verifiedUser || verifiedUser.id !== ctx.user.id) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "密碼不正確，無法刪除帳號。" });
        }
        await deleteUserAccount(ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return { success: true as const };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  admin: router({
    summary: adminProcedure.query(async () => getAdminAccountSummary()),
    authCleanupStatus: adminProcedure.query(async () => {
      const status = await getAuthAutomationStatus();
      return status ? {
        configured: Boolean(status.scheduleCronTaskUid),
        lastRunAt: status.lastRunAt,
        lastRunStatus: status.lastRunStatus,
        lastRunError: status.lastRunError ? "最近一次清理未成功，請由管理端查看排程執行紀錄。" : null,
      } : { configured: false, lastRunAt: null, lastRunStatus: null, lastRunError: null };
    }),
    listUsers: adminProcedure
      .input(z.object({ query: z.string().trim().max(120).default("") }))
      .query(({ input }) => listAdminAccounts(input.query)),
    audits: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(60) }))
      .query(({ input }) => listAdminAccountAudits(input.limit)),
    deleteUser: adminProcedure
      .input(z.object({ targetUserId: z.number().int().positive(), confirmation: z.literal("DELETE") }))
      .mutation(async ({ ctx, input }) => {
        if (input.targetUserId === ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理員不可在此介面刪除自己的帳號。" });
        }
        const target = await getUserById(input.targetUserId);
        if (!target || target.loginMethod === "deleted") {
          throw new TRPCError({ code: "NOT_FOUND", message: "找不到可刪除的帳號。" });
        }
        if (target.role === "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "為避免失去管理權限，管理員帳號不可由此介面刪除。" });
        }
        try {
          await deleteUserAccount(target.id);
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "刪除共帳帳戶失敗。" });
        }
        let firebaseIdentityDeleted = true;
        if (target.firebaseUid) {
          try {
            await deleteFirebaseIdentity(target.firebaseUid);
          } catch (error) {
            firebaseIdentityDeleted = false;
            console.error("[Admin] Firebase identity cleanup failed after account deletion", { targetUserId: target.id, message: error instanceof Error ? error.message : "unknown" });
          }
        }
        await writeAdminAccountAudit({
          adminUserId: ctx.user.id,
          targetUserId: target.id,
          action: "delete",
          summary: "管理員刪除帳戶",
          metadata: { firebaseIdentityDeleted },
        });
        return { success: true as const, firebaseIdentityDeleted };
      }),
  }),

  ledger: router({
    list: protectedProcedure.query(({ ctx }) => listLedgersForUser(ctx.user.id)),
    workspace: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const { start, end } = monthRange(input.month);
        const previous = monthRange(previousMonthKey(input.month));
        const [
          members,
          categories,
          paymentMethods,
          transactions,
          calendarTransactions,
          analytics,
          previousAnalytics,
          settlement,
          settlementSnapshot,
          settlementHistory,
          budgets,
          travelPlans,
          recurring,
          activityLogs,
        ] = await Promise.all([
          getLedgerMembers(input.ledgerId),
          getCategories(input.ledgerId),
          getPaymentMethods(input.ledgerId),
          getTransactions(input.ledgerId, 200),
          getCalendarTransactions(input.ledgerId, start, end),
          getAnalytics(input.ledgerId, start, end),
          getAnalytics(input.ledgerId, previous.start, previous.end),
          getSettlementSummary(input.ledgerId, input.month),
          getMonthlySettlementSnapshot(input.ledgerId, input.month),
          listSettlements(input.ledgerId),
          listBudgets(input.ledgerId, input.month),
          listTravelPlans(input.ledgerId),
          listRecurring(input.ledgerId),
          getActivityLogs(input.ledgerId, 50),
        ]);
        return {
          members,
          categories,
          paymentMethods,
          transactions,
          calendarTransactions,
          analytics,
          previousAnalytics,
          settlement,
          settlementSnapshot,
          settlementHistory,
          budgets,
          travelPlans,
          recurring,
          activityLogs,
        };
      }),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(128), type: ledgerType.default("couple"), icon: z.string().trim().max(16).nullable().optional() }))
      .mutation(({ ctx, input }) => createLedger({ ...input, createdBy: ctx.user.id, inviteCode: generateInviteCode() })),
    join: protectedProcedure
      .input(z.object({ inviteCode: z.string().trim().min(4).max(16) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await joinLedgerByInviteCode(input.inviteCode.toUpperCase(), ctx.user.id);
        } catch (error) {
          if (error instanceof Error && error.message.includes("已經加入")) {
            throw new TRPCError({ code: "CONFLICT", message: error.message });
          }
          throw error;
        }
      }),
    leave: protectedProcedure
      .input(z.object({
        ledgerId: z.number().int().positive(),
        action: z.enum(["leave", "transfer", "delete"]),
        transferToUserId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        return leaveLedger({ ...input, userId: ctx.user.id });
      }),
    rename: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), name: z.string().trim().min(1).max(128), icon: z.string().trim().max(16).nullable().optional() }))
      .mutation(({ ctx, input }) => renameLedger({ ...input, userId: ctx.user.id })),
    transferOwnership: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), targetUserId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => transferLedgerOwnership({ ...input, userId: ctx.user.id })),
    travelPlans: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listTravelPlans(input.ledgerId))),
    createTravelPlan: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), name: z.string().trim().min(1).max(128), budget: z.number().int().positive().max(100_000_000), startDate: z.coerce.date(), endDate: z.coerce.date(), notes: z.string().trim().max(1000).optional() }))
      .mutation(({ ctx, input }) => createTravelPlan({ ...input, userId: ctx.user.id })),
    deleteTravelPlan: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), planId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteTravelPlan({ ...input, userId: ctx.user.id })),
    detail: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(access => access.ledger)),
    members: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getLedgerMembers(input.ledgerId))),
    updateMemberRole: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), userId: z.number().int().positive(), role: z.enum(["admin", "member", "viewer"]) }))
      .mutation(async ({ ctx, input }) => {
        const access = await requireLedger(input.ledgerId, ctx.user.id);
        if (access.member.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "只有管理員可以修改成員權限" });
        if (input.userId === access.ledger.createdBy && input.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "帳本持有者必須保留管理員權限；如需交接請使用轉讓所有權。" });
        const target = await getLedgerAccess(input.ledgerId, input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "找不到此帳本成員。" });
        await updateLedgerMemberRole(input);
        return { success: true } as const;
      }),
    categories: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getCategories(input.ledgerId))),
    createCategory: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), parentCategoryId: z.number().int().nonnegative().default(0), name: z.string().trim().min(1).max(64), type: z.enum(["expense", "income"]), icon: z.string().max(32).default("◌"), color: z.string().max(32).default("#B56C78") }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await createCategory(input);
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "create", entityType: "category", entityId: id, summary: `新增分類：${input.name}` });
        return id;
      }),
    archiveCategory: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), categoryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await archiveCategory({ ledgerId: input.ledgerId, id: input.categoryId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "delete", entityType: "category", entityId: id, summary: "停用分類" });
        return id;
      }),
    deleteCategory: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), categoryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await deleteCategory({ ledgerId: input.ledgerId, id: input.categoryId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "delete", entityType: "category", entityId: id, summary: "永久刪除分類" });
        return id;
      }),
    updateCategory: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), categoryId: z.number().int().positive(), name: z.string().trim().min(1).max(64), type: z.enum(["expense", "income"]), icon: z.string().max(32), color: z.string().max(32) }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await updateCategory({ ledgerId: input.ledgerId, id: input.categoryId, name: input.name, type: input.type, icon: input.icon, color: input.color });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "category", entityId: id, summary: `修改分類：${input.name}` });
        return id;
      }),
    setCategoryActive: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), categoryId: z.number().int().positive(), isActive: z.union([z.literal(0), z.literal(1)]) }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await setCategoryActive({ ledgerId: input.ledgerId, id: input.categoryId, isActive: input.isActive });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: input.isActive ? "create" : "delete", entityType: "category", entityId: id, summary: input.isActive ? "恢復分類" : "停用分類" });
        return id;
      }),
    paymentMethods: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getPaymentMethods(input.ledgerId))),
    createPaymentMethod: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), name: z.string().trim().min(1).max(64), icon: z.string().trim().max(16).default("💳") }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await createPaymentMethod(input);
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "create", entityType: "paymentMethod", entityId: id, summary: `新增支付方式：${input.name}` });
        return id;
      }),
    archivePaymentMethod: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), paymentMethodId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await archivePaymentMethod({ ledgerId: input.ledgerId, id: input.paymentMethodId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "delete", entityType: "paymentMethod", entityId: id, summary: "停用支付方式" });
        return id;
      }),
    deletePaymentMethod: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), paymentMethodId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await deletePaymentMethod({ ledgerId: input.ledgerId, id: input.paymentMethodId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "delete", entityType: "paymentMethod", entityId: id, summary: "永久刪除支付方式" });
        return id;
      }),
    updatePaymentMethod: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), paymentMethodId: z.number().int().positive(), name: z.string().trim().min(1).max(64), icon: z.string().trim().max(16) }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await updatePaymentMethod({ ledgerId: input.ledgerId, id: input.paymentMethodId, name: input.name, icon: input.icon });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "paymentMethod", entityId: id, summary: `修改支付方式：${input.name}` });
        return id;
      }),
    setPaymentMethodActive: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), paymentMethodId: z.number().int().positive(), isActive: z.union([z.literal(0), z.literal(1)]) }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await setPaymentMethodActive({ ledgerId: input.ledgerId, id: input.paymentMethodId, isActive: input.isActive });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: input.isActive ? "create" : "delete", entityType: "paymentMethod", entityId: id, summary: input.isActive ? "恢復支付方式" : "停用支付方式" });
        return id;
      }),
    transactions: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(100) }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getTransactions(input.ledgerId, input.limit))),
    createTransaction: protectedProcedure
      .input(z.object({
        ledgerId: z.number().int().positive(),
        payerId: z.number().int().positive(),
        amount: z.number().int().positive(),
        type: transactionType.default("expense"),
        categoryId: z.number().int().positive(),
        paymentMethodId: z.number().int().positive(),
        date: z.coerce.date(),
        note: z.string().trim().max(500).optional(),
        splitType: splitType.default("equal"),
        splits: z.array(memberInput).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        await assertMonthOpenForTransactions(input.ledgerId, input.date.toISOString().slice(0, 7));
        if (input.type === "expense" && input.splitType !== "none") {
          if (input.splits.length === 0 || input.splits.reduce((sum, split) => sum + split.shareAmount, 0) !== input.amount) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "分攤金額必須剛好等於交易金額" });
          }
        }
        const id = await createTransaction({ ...input, userId: ctx.user.id });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "create", entityType: "transaction", entityId: id, summary: `新增${input.type === "income" ? "收入" : "支出"} ${input.amount}` });
        return id;
      }),
    updateTransaction: protectedProcedure
      .input(z.object({
        ledgerId: z.number().int().positive(),
        transactionId: z.number().int().positive(),
        payerId: z.number().int().positive(),
        amount: z.number().int().positive(),
        type: transactionType.default("expense"),
        categoryId: z.number().int().positive(),
        paymentMethodId: z.number().int().positive(),
        date: z.coerce.date(),
        note: z.string().trim().max(500).optional(),
        splitType: splitType.default("equal"),
        splits: z.array(memberInput).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const existing = await getTransactionForLedger(input.ledgerId, input.transactionId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到要編輯的收支記錄" });
        await assertMonthOpenForTransactions(input.ledgerId, existing.date.toISOString().slice(0, 7));
        await assertMonthOpenForTransactions(input.ledgerId, input.date.toISOString().slice(0, 7));
        if (input.type === "expense" && input.splitType !== "none" && input.splits.reduce((sum, split) => sum + split.shareAmount, 0) !== input.amount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "分攤金額必須剛好等於交易金額" });
        }
        const id = await updateTransaction({ ...input, id: input.transactionId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "transaction", entityId: id, summary: `編輯${input.type === "income" ? "收入" : "支出"} ${input.amount}` });
        return id;
      }),
    deleteTransaction: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), transactionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const existing = await getTransactionForLedger(input.ledgerId, input.transactionId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到要移除的收支記錄" });
        await assertMonthOpenForTransactions(input.ledgerId, existing.date.toISOString().slice(0, 7));
        const id = await deleteTransaction({ ledgerId: input.ledgerId, id: input.transactionId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "delete", entityType: "transaction", entityId: id, summary: "移除收支記錄" });
        return id;
      }),
    activityLogs: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(100) }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getActivityLogs(input.ledgerId, input.limit))),
    scanReceipt: protectedProcedure
      .input(z.object({ imageDataUrl: z.string().startsWith("data:image/").max(12_000_000) }))
      .mutation(async ({ input }) => {
        const response = await invokeLLM({
          model: "gemini-3-flash-preview",
          maxTokens: 768,
          messages: [
            { role: "system", content: "你是台灣發票欄位擷取助手。只輸出 JSON，若看不清楚請使用 null，不要猜測。金額輸出整數新台幣，日期輸出 YYYY-MM-DD，note 輸出店家或品項摘要。" },
            { role: "user", content: [
              { type: "text", text: "只擷取發票金額、日期與店家或品項摘要；看不清楚的欄位回傳 null，不要解釋。" },
              { type: "image_url", image_url: { url: input.imageDataUrl, detail: "low" } },
            ] },
          ],
          response_format: { type: "json_schema", json_schema: {
            name: "receipt_fields",
            strict: true,
            schema: {
              type: "object",
              properties: {
                amount: { type: ["integer", "null"] },
                date: { type: ["string", "null"] },
                note: { type: ["string", "null"] },
                confidence: { type: "number" },
              },
              required: ["amount", "date", "note", "confidence"],
              additionalProperties: false,
            },
          } },
        });
        const content = response.choices[0]?.message.content;
        const text = typeof content === "string" ? content : content.map(part => part.type === "text" ? part.text : "").join("");
        try {
          const parsed = JSON.parse(text) as { amount?: number | null; date?: string | null; note?: string | null; confidence?: number };
          return { amount: Number.isFinite(parsed.amount) ? parsed.amount : null, date: parsed.date ?? null, note: parsed.note ?? null, confidence: parsed.confidence ?? 0 };
        } catch {
          throw new TRPCError({ code: "BAD_GATEWAY", message: "發票辨識結果格式無法解析，請改用手動輸入。" });
        }
      }),
    calendar: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const { start, end } = monthRange(input.month);
        return getCalendarTransactions(input.ledgerId, start, end);
      }),
    analytics: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const { start, end } = monthRange(input.month);
        return getAnalytics(input.ledgerId, start, end);
      }),
    settlement: router({
      summary: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
        .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getSettlementSummary(input.ledgerId, input.month))),
      history: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive() }))
        .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listMonthlySettlementSnapshots(input.ledgerId))),
      markSettled: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          const existing = await getMonthlySettlementSnapshot(input.ledgerId, input.month);
          if (existing?.status === "settled") throw new TRPCError({ code: "CONFLICT", message: "此月份已結算；如需修改請由管理員重新開啟。" });
          if (existing?.status === "pending") throw new TRPCError({ code: "CONFLICT", message: "此月份已有待確認結算，請由另一位成員確認。" });
          const summary = await getSettlementSummary(input.ledgerId, input.month);
          if (!summary.settlement) throw new TRPCError({ code: "BAD_REQUEST", message: "目前沒有需要結算的差額" });
          if (existing?.status === "reopened") {
            const updated = await reproposeMonthlySettlementSnapshot({ ledgerId: input.ledgerId, month: input.month, expectedVersion: existing.version, proposedByUserId: ctx.user.id, ...summary.settlement });
            if (!updated) throw new TRPCError({ code: "CONFLICT", message: "結算狀態已被其他成員更新，請重新整理後再試。" });
            return { status: "pending" as const };
          }
          try {
            const id = await createMonthlySettlementSnapshot({ ledgerId: input.ledgerId, month: input.month, proposedByUserId: ctx.user.id, ...summary.settlement });
            return { id, status: "pending" as const };
          } catch {
            throw new TRPCError({ code: "CONFLICT", message: "結算狀態已被其他成員更新，請重新整理後再試。" });
          }
        }),
      confirm: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/), version: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          const snapshot = await getMonthlySettlementSnapshot(input.ledgerId, input.month);
          if (!snapshot || snapshot.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "沒有可確認的待結算快照，請重新整理。" });
          if (snapshot.proposedByUserId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "請由另一位帳本成員確認本月結算。" });
          if (snapshot.version !== input.version) throw new TRPCError({ code: "CONFLICT", message: "結算狀態已更新，請重新整理後再確認。" });
          const confirmed = await confirmMonthlySettlementSnapshot({ ledgerId: input.ledgerId, month: input.month, expectedVersion: input.version, confirmedByUserId: ctx.user.id });
          if (!confirmed) throw new TRPCError({ code: "CONFLICT", message: "結算狀態已更新，請重新整理後再確認。" });
          return { status: "settled" as const };
        }),
      reopen: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/), version: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
          const access = await requireLedger(input.ledgerId, ctx.user.id);
          if (access.member.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "只有管理員可以重新開啟已結算月份。" });
          const reopened = await reopenMonthlySettlementSnapshot({ ledgerId: input.ledgerId, month: input.month, expectedVersion: input.version });
          if (!reopened) throw new TRPCError({ code: "CONFLICT", message: "結算狀態已更新，請重新整理後再試。" });
          return { status: "reopened" as const };
        }),
    }),
    budgets: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listBudgets(input.ledgerId, input.month))),
    upsertBudget: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), categoryId: z.number().int().nonnegative(), amount: z.number().int().positive().max(100_000_000), month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await upsertBudget(input);
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "budget", entityId: id, summary: `儲存 ${input.month} 預算` });
        return id;
      }),
    deleteBudget: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), budgetId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await deleteBudget({ ledgerId: input.ledgerId, id: input.budgetId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "delete", entityType: "budget", entityId: id, summary: "移除分類預算" });
        return id;
      }),
    recurring: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listRecurring(input.ledgerId))),
    syncRecurring: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => syncDueRecurring(input.ledgerId, ctx.user.id))),
    createRecurring: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), title: z.string().trim().min(1).max(128), amount: z.number().int().positive(), type: z.enum(["expense", "income"]), categoryId: z.number().int().positive(), paymentMethodId: z.number().int().positive(), frequency: z.enum(["weekly", "monthly", "yearly"]).default("monthly"), dayOfMonth: z.number().int().min(1).max(31).default(1) }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await createRecurring({ ...input, userId: ctx.user.id });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "create", entityType: "recurring", entityId: id, summary: `新增固定${input.type === "income" ? "收入" : "支出"}：${input.title}` });
        return id;
      }),
    updateRecurring: protectedProcedure
      .input(z.object({ recurringId: z.number().int().positive(), ledgerId: z.number().int().positive(), title: z.string().trim().min(1).max(128), amount: z.number().int().positive(), type: z.enum(["expense", "income"]), categoryId: z.number().int().positive(), paymentMethodId: z.number().int().positive(), frequency: z.enum(["weekly", "monthly", "yearly"]), dayOfMonth: z.number().int().min(1).max(31) }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await updateRecurring({ ...input, id: input.recurringId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "recurring", entityId: id, summary: `修改固定${input.type === "income" ? "收入" : "支出"}：${input.title}` });
        return id;
      }),
    deleteRecurring: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), recurringId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireLedger(input.ledgerId, ctx.user.id);
        const id = await deleteRecurring({ ledgerId: input.ledgerId, id: input.recurringId });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "delete", entityType: "recurring", entityId: id, summary: "移除固定收支" });
        return id;
      }),
    savings: router({
      buckets: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive() }))
        .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listSavingsBuckets(input.ledgerId))),
      allocations: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), bucketId: z.number().int().positive().optional() }))
        .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listSavingsAllocations(input.ledgerId, input.bucketId))),
      create: protectedProcedure
        .input(z.object({
          ledgerId: z.number().int().positive(),
          paymentMethodId: z.number().int().positive(),
          name: z.string().trim().min(1).max(128),
          icon: z.string().trim().max(32).default("🎯"),
          targetAmount: z.number().int().positive().max(100_000_000),
          monthlyAmount: z.number().int().positive().max(100_000_000),
          dayOfMonth: z.number().int().min(1).max(28),
          priority: z.number().int().min(0).max(100_000).default(0),
        }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          const id = await createSavingsBucket({ ...input, isActive: 1, createdBy: ctx.user.id });
          await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "create", entityType: "savingsBucket", entityId: id, summary: `新增儲蓄桶：${input.name}` });
          return id;
        }),
      update: protectedProcedure
        .input(z.object({
          ledgerId: z.number().int().positive(),
          bucketId: z.number().int().positive(),
          expectedVersion: z.number().int().positive(),
          paymentMethodId: z.number().int().positive(),
          name: z.string().trim().min(1).max(128),
          icon: z.string().trim().max(32).default("🎯"),
          targetAmount: z.number().int().positive().max(100_000_000),
          monthlyAmount: z.number().int().positive().max(100_000_000),
          dayOfMonth: z.number().int().min(1).max(28),
          priority: z.number().int().min(0).max(100_000),
          isActive: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          try {
            const bucket = await updateSavingsBucket({ ...input, id: input.bucketId, isActive: input.isActive ? 1 : 0 });
            await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "savingsBucket", entityId: bucket.id, summary: `更新儲蓄桶：${input.name}` });
            return bucket;
          } catch (error) {
            if (error instanceof Error && error.message === "SAVINGS_BUCKET_CONFLICT") {
              throw new TRPCError({ code: "CONFLICT", message: "此儲蓄桶已被其他成員修改，請重新整理後再編輯。" });
            }
            throw error;
          }
        }),
      stop: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), bucketId: z.number().int().positive(), expectedVersion: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          try {
            const id = await stopSavingsBucket({ ledgerId: input.ledgerId, id: input.bucketId, expectedVersion: input.expectedVersion });
            await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "savingsBucket", entityId: id, summary: "暫停儲蓄桶自動分配" });
            return id;
          } catch (error) {
            if (error instanceof Error && error.message === "SAVINGS_BUCKET_CONFLICT") {
              throw new TRPCError({ code: "CONFLICT", message: "此儲蓄桶已被其他成員修改，請重新整理後再編輯。" });
            }
            throw error;
          }
        }),
      archive: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), bucketId: z.number().int().positive(), expectedVersion: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          try {
            const id = await archiveSavingsBucket({ ledgerId: input.ledgerId, id: input.bucketId, expectedVersion: input.expectedVersion });
            await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "savingsBucket", entityId: id, summary: "封存已達標儲蓄桶" });
            return id;
          } catch (error) {
            if (error instanceof Error && error.message === "SAVINGS_BUCKET_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "此儲蓄桶已被其他成員修改，請重新整理後再編輯。" });
            throw error;
          }
        }),
      addDeposit: protectedProcedure
        .input(z.object({
          ledgerId: z.number().int().positive(),
          bucketId: z.number().int().positive(),
          expectedVersion: z.number().int().positive(),
          amount: z.number().int().positive().max(100_000_000),
        }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          try {
            return await addSavingsDeposit({ ...input, userId: ctx.user.id });
          } catch (error) {
            if (error instanceof Error && error.message === "SAVINGS_BUCKET_CONFLICT") {
              throw new TRPCError({ code: "CONFLICT", message: "此儲蓄桶已被其他成員修改，請重新整理後再存入。" });
            }
            throw error;
          }
        }),
      restore: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), bucketId: z.number().int().positive(), expectedVersion: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          try {
            const id = await restoreSavingsBucket({ ledgerId: input.ledgerId, id: input.bucketId, expectedVersion: input.expectedVersion });
            await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "update", entityType: "savingsBucket", entityId: id, summary: "重新顯示已封存儲蓄桶" });
            return id;
          } catch (error) {
            if (error instanceof Error && error.message === "SAVINGS_BUCKET_CONFLICT") throw new TRPCError({ code: "CONFLICT", message: "此儲蓄桶已被其他成員修改，請重新整理後再編輯。" });
            throw error;
          }
        }),
    }),
  }),
  profile: router({
    updateName: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(64) }))
      .mutation(({ ctx, input }) => updateUserName(ctx.user.id, input.name)),
    diagnosticsPreference: protectedProcedure
      .query(async ({ ctx }) => {
        const preferences = await getNotificationPreferences(ctx.user.id);
        return { enabled: Boolean(preferences.diagnosticReportsEnabled) };
      }),
    updateDiagnosticsPreference: protectedProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const preferences = await updateDiagnosticReportingEnabled(ctx.user.id, input.enabled);
        return { enabled: Boolean(preferences.diagnosticReportsEnabled) };
      }),
    reportDiagnostic: protectedProcedure
      .input(z.object({
        platform: z.enum(["android", "ios", "web"]),
        appVersion: z.string().trim().min(1).max(32),
        errorCode: z.string().trim().min(1).max(80),
        message: z.string().trim().min(1).max(512),
        stack: z.string().max(8_000).optional(),
      }))
      .mutation(({ ctx, input }) => createDiagnosticReport(ctx.user.id, input)),
  }),
});

export type AppRouter = typeof appRouter;
