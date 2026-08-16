import { z } from "zod";
import { customAlphabet } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createCategory,
  createLedger,
  createPaymentMethod,
  createRecurring,
  createSettlement,
  createTransaction,
  getAnalytics,
  syncDueRecurring,
  getCalendarTransactions,
  getCategories,
  getLedgerAccess,
  getLedgerMembers,
  getPaymentMethods,
  updateLedgerMemberRole,
  getSettlementSummary,
  getTransactions,
  joinLedgerByInviteCode,
  listBudgets,
  listLedgersForUser,
  listRecurring,
  listSettlements,
  upsertBudget,
} from "./db";
import { TRPCError } from "@trpc/server";

const ledgerType = z.enum(["couple", "roommate", "family", "travel", "custom"]);
const transactionType = z.enum(["expense", "income", "transfer"]);
const splitType = z.enum(["equal", "custom", "amount"]);

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
      .mutation(({ ctx, input }) => joinLedgerByInviteCode(input.inviteCode.toUpperCase(), ctx.user.id)),
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
        await updateLedgerMemberRole(input);
        return { success: true } as const;
      }),
    categories: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getCategories(input.ledgerId))),
    createCategory: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), parentCategoryId: z.number().int().nonnegative().default(0), name: z.string().trim().min(1).max(64), type: z.enum(["expense", "income"]), icon: z.string().max(32).default("◌"), color: z.string().max(32).default("#B56C78") }))
      .mutation(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => createCategory(input))),
    paymentMethods: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive() }))
      .query(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => getPaymentMethods(input.ledgerId))),
    createPaymentMethod: protectedProcedure
      .input(z.object({ ledgerId: z.number().int().positive(), name: z.string().trim().min(1).max(64), icon: z.string().trim().max(16).default("💳") }))
      .mutation(({ ctx, input }) => requireLedger(input.ledgerId, ctx.user.id).then(() => createPaymentMethod(input))),
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
        if (input.type === "expense") {
          if (input.splits.length === 0 || input.splits.reduce((sum, split) => sum + split.shareAmount, 0) !== input.amount) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "分攤金額必須剛好等於交易金額" });
          }
        }
        return createTransaction({ ...input, userId: ctx.user.id });
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
      .input(z.object({ ledgerId: z.number().int().positive(), categoryId: z.number().int().nonnegative(), amount: z.number().int().positive(), month: z.string().regex(/^\d{4}-\d{2}$/) }))
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
});

export type AppRouter = typeof appRouter;
