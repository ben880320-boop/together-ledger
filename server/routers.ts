import { z } from "zod";
import { customAlphabet } from "nanoid";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  archiveCategory,
  archivePaymentMethod,
  deleteCategory,
  deletePaymentMethod,
  createCategory,
  updateCategory,
  setCategoryActive,
  createLedger,
  createPaymentMethod,
  updatePaymentMethod,
  setPaymentMethodActive,
  createRecurring,
  createSettlement,
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
  upsertBudget,
  renameLedger,
  transferLedgerOwnership,
  listTravelPlans,
  createTravelPlan,
  deleteTravelPlan,
  getNotificationPreferences,
  updateNotificationPreferences,
  updateNotificationScheduleTaskUid,
  upsertPushDevice,
} from "./db";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { notifyLedgerMembersAboutTransaction } from "./notifications";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";

const ledgerType = z.enum(["couple", "roommate", "family", "travel", "custom"]);
const transactionType = z.enum(["expense", "income", "transfer"]);
const splitType = z.enum(["equal", "custom", "amount", "none"]);
const monthlySettlementReminderCron = "0 0 12 * * *"; // 20:00 Asia/Taipei (UTC+8), checked daily for the chosen day.

type MonthlyReminderScheduleDependencies = {
  getPreferences: typeof getNotificationPreferences;
  createJob: typeof createHeartbeatJob;
  updateJob: typeof updateHeartbeatJob;
  saveTaskUid: typeof updateNotificationScheduleTaskUid;
};

const monthlyReminderScheduleDependencies: MonthlyReminderScheduleDependencies = {
  getPreferences: getNotificationPreferences,
  createJob: createHeartbeatJob,
  updateJob: updateHeartbeatJob,
  saveTaskUid: updateNotificationScheduleTaskUid,
};

export async function syncMonthlySettlementReminderSchedule(input: {
  userId: number;
  sessionToken: string;
  monthlySettlementEnabled: boolean;
  monthlyReminderDay: number;
}, dependencies: MonthlyReminderScheduleDependencies = monthlyReminderScheduleDependencies) {
  const current = await dependencies.getPreferences(input.userId);
  if (!input.monthlySettlementEnabled) {
    if (current.scheduleCronTaskUid) {
      await dependencies.updateJob(current.scheduleCronTaskUid, { enable: false }, input.sessionToken);
    }
    return current.scheduleCronTaskUid;
  }

  const job = {
    cron: monthlySettlementReminderCron,
    path: "/api/scheduled/monthly-settlement-reminders",
    method: "POST" as const,
    payload: { reminderDay: input.monthlyReminderDay },
    description: `Together Ledger 每月結算提醒（每月 ${input.monthlyReminderDay} 日，台北時間 20:00）`,
  };
  if (current.scheduleCronTaskUid) {
    await dependencies.updateJob(current.scheduleCronTaskUid, { ...job, enable: true }, input.sessionToken);
    return current.scheduleCronTaskUid;
  }
  const created = await dependencies.createJob({ ...job, name: `together-ledger-settlement-${input.userId}` }, input.sessionToken);
  await dependencies.saveTaskUid(input.userId, created.taskUid);
  return created.taskUid;
}

function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式必須為 YYYY-MM" });
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式不正確" });
  return { start: new Date(Date.UTC(year, monthIndex, 1)), end: new Date(Date.UTC(year, monthIndex + 1, 1)) };
}

async function requireLedger(ledgerId: number, userId: number) {
  const access = await getLedgerAccess(ledgerId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "你不是此帳本的成員" });
  return access;
}

const memberInput = z.object({ userId: z.number().int().positive(), shareAmount: z.number().int().nonnegative() });
const generateInviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export const appRouter = router({
  system: systemRouter,
  notifications: router({
    preferences: protectedProcedure.query(({ ctx }) => getNotificationPreferences(ctx.user.id)),
    updatePreferences: protectedProcedure
      .input(z.object({
        incomeEnabled: z.boolean(),
        expenseEnabled: z.boolean(),
        minimumAmount: z.number().int().min(0).max(100_000_000),
        monthlySettlementEnabled: z.boolean(),
        monthlyReminderDay: z.number().int().min(1).max(28),
      }))
      .mutation(async ({ ctx, input }) => {
        const authorization = ctx.req.headers.authorization;
        const bearerToken = typeof authorization === "string" && authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length)
          : "";
        const sessionToken = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? bearerToken;
        if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "請重新登入後再更新提醒設定" });
        await syncMonthlySettlementReminderSchedule({
          userId: ctx.user.id,
          sessionToken,
          monthlySettlementEnabled: input.monthlySettlementEnabled,
          monthlyReminderDay: input.monthlyReminderDay,
        });
        return updateNotificationPreferences(ctx.user.id, {
          incomeEnabled: input.incomeEnabled ? 1 : 0,
          expenseEnabled: input.expenseEnabled ? 1 : 0,
          minimumAmount: input.minimumAmount,
          monthlySettlementEnabled: input.monthlySettlementEnabled ? 1 : 0,
          monthlyReminderDay: input.monthlyReminderDay,
        });
      }),
    registerDevice: protectedProcedure
      .input(z.object({ expoPushToken: z.string().trim().regex(/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/, "無效的 Expo 推播 token"), platform: z.enum(["android", "ios"]) }))
      .mutation(({ ctx, input }) => upsertPushDevice({ ...input, userId: ctx.user.id }).then(() => ({ success: true as const }))),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  ledger: router({
    list: protectedProcedure.query(({ ctx }) => listLedgersForUser(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(128), type: ledgerType.default("couple") }))
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
      .input(z.object({ ledgerId: z.number().int().positive(), name: z.string().trim().min(1).max(128) }))
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
        const access = await requireLedger(input.ledgerId, ctx.user.id);
        if (input.type === "expense" && input.splitType !== "none") {
          if (input.splits.length === 0 || input.splits.reduce((sum, split) => sum + split.shareAmount, 0) !== input.amount) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "分攤金額必須剛好等於交易金額" });
          }
        }
        const id = await createTransaction({ ...input, userId: ctx.user.id });
        await logActivity({ ledgerId: input.ledgerId, userId: ctx.user.id, action: "create", entityType: "transaction", entityId: id, summary: `新增${input.type === "income" ? "收入" : "支出"} ${input.amount}` });
        // Push delivery must never make saving a transaction feel slow. The durable notification
        // record is de-duplicated by transaction/user when the background delivery retries.
        void notifyLedgerMembersAboutTransaction({
          ledgerId: input.ledgerId,
          ledgerName: access.ledger.name,
          actorUserId: ctx.user.id,
          transactionId: id,
          type: input.type,
          amount: input.amount,
          note: input.note,
        }).catch(error => console.warn("[Notifications] Transaction dispatch failed", error));
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
        .input(z.object({ ledgerId: z.number().int().positive() }))
        .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getSettlementSummary(input.ledgerId))),
      history: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive() }))
        .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listSettlements(input.ledgerId))),
      markSettled: protectedProcedure
        .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
        .mutation(async ({ ctx, input }) => {
          await requireLedger(input.ledgerId, ctx.user.id);
          const summary = await getSettlementSummary(input.ledgerId);
          if (!summary.settlement) throw new TRPCError({ code: "BAD_REQUEST", message: "目前沒有需要結算的差額" });
          return createSettlement({ ledgerId: input.ledgerId, month: input.month, ...summary.settlement });
        }),
    }),
    budgets: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listBudgets(input.ledgerId, input.month))),
    upsertBudget: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), categoryId: z.number().int().nonnegative(), amount: z.number().int().positive().max(100_000_000), month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => upsertBudget(input))),
    recurring: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => listRecurring(input.ledgerId))),
    syncRecurring: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => syncDueRecurring(input.ledgerId, ctx.user.id))),
    createRecurring: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), title: z.string().trim().min(1).max(128), amount: z.number().int().positive(), type: z.enum(["expense", "income"]), categoryId: z.number().int().positive(), paymentMethodId: z.number().int().positive(), frequency: z.enum(["weekly", "monthly", "yearly"]).default("monthly"), dayOfMonth: z.number().int().min(1).max(31).default(1) }))
      .mutation(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => createRecurring({ ...input, userId: ctx.user.id }))),
  }),
  profile: router({
    updateName: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(64) }))
      .mutation(({ ctx, input }) => updateUserName(ctx.user.id, input.name)),
  }),
});

export type AppRouter = typeof appRouter;
