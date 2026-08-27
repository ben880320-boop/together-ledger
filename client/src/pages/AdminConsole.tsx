import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, CircleCheck, Clock3, Eye, KeyRound, LoaderCircle, RefreshCw, Search, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type AccountFilter = "all" | "firebase" | "verified" | "legacy" | "password" | "recent";
type AdminAccount = {
  id: number;
  name: string | null;
  email: string | null;
  role: "admin" | "user";
  loginMethod: string | null;
  firebaseLinked: boolean;
  emailVerificationStatus: "firebase-verified" | "legacy-not-asserted";
  createdAt: Date | string | null;
  lastSignedIn: Date | string | null;
  ledgerMembershipCount: number;
  ownedLedgerCount: number;
};

const RECENT_SIGN_IN_MS = 30 * 24 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 30_000;

const formatDate = (value: Date | string | number | null | undefined, empty = "尚未登入") => {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "時間待確認" : date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "管理操作暫時無法完成，請稍後重試。";
const isRecentSignIn = (value: Date | string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= RECENT_SIGN_IN_MS;
};
const loginMethodLabel = (method: string | null) => {
  if (method === "firebase-email") return "Firebase Email／密碼";
  if (method === "email") return "電子信箱";
  if (method === "google") return "Google";
  return "其他";
};
const verificationLabel = (status: AdminAccount["emailVerificationStatus"]) => status === "firebase-verified" ? "Firebase 已驗證" : "舊有資料・未主張";

export default function AdminConsole() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const utils = trpc.useUtils();
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [detailTarget, setDetailTarget] = useState<AdminAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminAccount | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [lastActionFeedback, setLastActionFeedback] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const isAdmin = user?.role === "admin";
  const options = {
    enabled: isAdmin,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
  };
  const summary = trpc.admin.summary.useQuery(undefined, options);
  const cleanup = trpc.admin.authCleanupStatus.useQuery(undefined, options);
  const accounts = trpc.admin.listUsers.useQuery({ query }, options);
  const audits = trpc.admin.audits.useQuery({ limit: 50 }, options);
  const operationalOverview = trpc.admin.operationalOverview.useQuery({ days: 7 }, options);
  const newestUpdate = Math.max(summary.dataUpdatedAt, cleanup.dataUpdatedAt, accounts.dataUpdatedAt, audits.dataUpdatedAt, operationalOverview.dataUpdatedAt);

  useEffect(() => {
    if (newestUpdate > 0) setLastRefreshedAt(newestUpdate);
  }, [newestUpdate]);
  useEffect(() => {
    if (!loading && user && !isAdmin) toast.error("此頁面只供管理員使用。");
  }, [isAdmin, loading, user]);

  const invalidateAccountData = async () => {
    await Promise.all([
      utils.admin.summary.invalidate(),
      utils.admin.authCleanupStatus.invalidate(),
      utils.admin.listUsers.invalidate(),
      utils.admin.audits.invalidate(),
      utils.admin.operationalOverview.invalidate(),
    ]);
  };
  const refreshAdminData = async () => {
    try {
      await Promise.all([summary.refetch(), cleanup.refetch(), accounts.refetch(), audits.refetch(), operationalOverview.refetch()]);
      setLastActionFeedback("管理資料已重新讀取。");
    } catch {
      toast.error("部分管理資料暫時無法更新，請稍後再試。");
    }
  };
  const deleteAccount = trpc.admin.deleteUser.useMutation({
    onSuccess: async result => {
      const message = result.firebaseIdentityDeleted ? "帳戶已刪除並完成身分清理。" : "共帳帳戶已刪除；外部身分清理已記錄供後續處理。";
      toast.success(message);
      setLastActionFeedback(message);
      setDeleteTarget(null);
      setConfirmation("");
      await invalidateAccountData();
    },
    onError: error => {
      const message = errorMessage(error);
      setLastActionFeedback(`刪除未完成：${message}`);
      toast.error(message);
    },
  });
  const revokeSessions = trpc.admin.revokeUserSessions.useMutation({
    onSuccess: async result => {
      const message = result.success
        ? result.firebaseSessionsRevoked ? "已撤銷 App 與 Firebase 的所有登入。" : "已撤銷此帳戶的所有 App 登入。"
        : "App 登入已撤銷，但 Firebase 登入尚未確認撤銷。請再次執行撤銷以重試。";
      result.success ? toast.success(message) : toast.error(message);
      setLastActionFeedback(message);
      setRevokeTarget(null);
      setConfirmation("");
      await invalidateAccountData();
    },
    onError: error => {
      const message = errorMessage(error);
      setLastActionFeedback(`撤銷未開始：${message}`);
      toast.error(message);
    },
  });

  const visibleAccounts = useMemo(() => (accounts.data ?? []).filter(account => {
    if (accountFilter === "firebase") return account.firebaseLinked;
    if (accountFilter === "verified") return account.emailVerificationStatus === "firebase-verified";
    if (accountFilter === "legacy") return account.emailVerificationStatus === "legacy-not-asserted";
    if (accountFilter === "password") return account.loginMethod === "email" || account.loginMethod === "firebase-email";
    if (accountFilter === "recent") return isRecentSignIn(account.lastSignedIn);
    return true;
  }), [accountFilter, accounts.data]);
  const dataIsRefreshing = summary.isFetching || cleanup.isFetching || accounts.isFetching || audits.isFetching || operationalOverview.isFetching;
  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draftQuery.trim());
  };
  const confirmDelete = (event: FormEvent) => {
    event.preventDefault();
    if (deleteTarget && confirmation === "DELETE") deleteAccount.mutate({ targetUserId: deleteTarget.id, confirmation: "DELETE" });
  };
  const confirmRevoke = (event: FormEvent) => {
    event.preventDefault();
    if (revokeTarget && confirmation === "REVOKE") revokeSessions.mutate({ targetUserId: revokeTarget.id, confirmation: "REVOKE" });
  };
  const closeManagementDialog = () => {
    setDeleteTarget(null);
    setRevokeTarget(null);
    setConfirmation("");
  };

  if (loading) return <main className="min-h-screen bg-[#FFF9F7] p-6"><div className="mx-auto max-w-6xl animate-pulse rounded-3xl bg-white p-8 text-[#9A847B]">正在驗證管理員身分…</div></main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#FFF9F7] p-6"><section className="mx-auto max-w-xl rounded-3xl border border-[#E8D7D1] bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-[#B56C78]" /><h1 className="mt-4 text-xl font-bold text-[#5F4C47]">沒有管理權限</h1><p className="mt-2 text-sm leading-6 text-[#846E66]">此網頁僅提供具備管理員角色的共帳帳戶使用。</p><Button className="mt-6 bg-[#B56C78]" onClick={() => navigate("/app")}>返回共帳</Button></section></main>;

  return <main className="admin-console min-h-screen bg-[#FFF9F7] px-4 py-6 sm:px-6 lg:px-8"><style>{`@media (max-width: 639px) { main.admin-console table { display: block; width: 100%; } main.admin-console table thead { display: none; } main.admin-console table tbody { display: block; } main.admin-console table tr { display: block; margin-bottom: .75rem; border: 1px solid #F0E7E2; border-radius: 1.25rem; padding: .25rem .75rem; } main.admin-console table tr:last-child { margin-bottom: 0; } main.admin-console table td { display: flex; align-items: flex-start; gap: .75rem; padding: .75rem .25rem !important; text-align: left; } main.admin-console table td:first-child { display: block; } main.admin-console table td:nth-child(2)::before { content: "登入方式"; } main.admin-console table td:nth-child(3)::before { content: "驗證狀態"; } main.admin-console table td:nth-child(4)::before { content: "最近登入"; } main.admin-console table td:nth-child(5)::before { content: "安全操作"; } main.admin-console table td:nth-child(n+2)::before { flex: 0 0 4.75rem; color: #8A756B; font-size: .75rem; font-weight: 600; line-height: 1.25rem; } main.admin-console table td:nth-child(5) > div { flex-wrap: wrap; justify-content: flex-start; } }`}</style><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-4 rounded-3xl bg-[#624B51] p-6 text-white shadow-[0_18px_50px_rgba(98,75,81,0.18)] sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold text-[#F5DADB]"><ShieldCheck className="h-4 w-4" />共帳後台管理</div><h1 className="mt-2 text-2xl font-bold tracking-tight">使用者帳戶管理</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#F1D9D8]">可依驗證與登入狀態檢視帳戶，撤銷非管理員帳戶登入，或在嚴格確認後刪除帳戶。此頁不呈現密碼、Firebase UID、帳本名稱、收據或收支明細。</p></div><Button type="button" variant="outline" onClick={() => navigate("/app")} className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />返回共帳</Button></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="有效帳戶" value={summary.data?.activeUsers} icon={<UsersRound className="h-5 w-5" />} loading={summary.isLoading} /><Metric label="管理員帳戶" value={summary.data?.adminUsers} icon={<ShieldCheck className="h-5 w-5" />} loading={summary.isLoading} /><Metric label="Firebase 已驗證信箱" value={summary.data?.firebaseVerifiedUsers} icon={<CircleCheck className="h-5 w-5" />} loading={summary.isLoading} /><Metric label="舊有 Email 資料" value={summary.data?.legacyEmailUsers} icon={<Clock3 className="h-5 w-5" />} loading={summary.isLoading} /></section>
    <section className="grid gap-6 lg:grid-cols-[1.45fr_.85fr]"><div className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-bold text-[#5F4C47]">帳戶清單</h2><p className="mt-1 text-sm text-[#846E66]">可按暱稱或電子信箱搜尋；驗證狀態是由已通過 Firebase 驗證的連結身分衍生，舊有資料不會被誤標為已驗證。</p></div><form className="flex w-full gap-2 sm:max-w-sm" onSubmit={search}><Input value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="搜尋暱稱或信箱" aria-label="搜尋帳戶" /><Button type="submit" className="shrink-0 bg-[#B56C78]"><Search className="mr-1.5 h-4 w-4" />搜尋</Button></form></div><div className="flex flex-wrap items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-[#705B53]"><span className="shrink-0">帳戶狀態</span><select aria-label="篩選帳戶狀態" value={accountFilter} onChange={event => setAccountFilter(event.target.value as AccountFilter)} className="h-10 min-w-0 flex-1 rounded-xl border border-[#E8D7D1] bg-white px-3 text-sm text-[#5F4C47] outline-none focus-visible:ring-2 focus-visible:ring-[#B56C78]"><option value="all">全部帳戶</option><option value="verified">Firebase 已驗證信箱</option><option value="legacy">舊有 Email 資料</option><option value="firebase">已綁定 Firebase</option><option value="password">可用密碼登入</option><option value="recent">30 日內登入</option></select></label><span className="text-xs text-[#9A847B]">顯示 {visibleAccounts.length} 筆</span></div><div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FFF8F5] px-3 py-2 text-xs text-[#846E66]"><span className="flex items-center gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${dataIsRefreshing ? "animate-spin" : ""}`} />{dataIsRefreshing ? "自動更新中…" : `每 30 秒自動更新・上次更新：${formatDate(lastRefreshedAt, "尚未更新")}`}</span><Button type="button" variant="ghost" size="sm" onClick={() => void refreshAdminData()} disabled={dataIsRefreshing} className="h-7 px-2 text-[#805D2E]">立即更新</Button></div>{lastActionFeedback && <div role="status" className="rounded-2xl border border-[#E8D7D1] bg-[#FFFDFB] px-3 py-2.5 text-sm text-[#705B53]">最近操作：{lastActionFeedback}</div>}</div>{accounts.error ? <ErrorBox text="帳戶清單暫時無法讀取。"><Button type="button" size="sm" variant="outline" onClick={() => void accounts.refetch()}>重試</Button></ErrorBox> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#F0E7E2] text-xs font-semibold tracking-wide text-[#8A756B]"><tr><th className="px-2 py-3">帳戶狀態</th><th className="px-2 py-3">登入方式</th><th className="px-2 py-3">驗證狀態</th><th className="px-2 py-3">最近登入</th><th className="px-2 py-3 text-right">安全操作</th></tr></thead><tbody>{accounts.isLoading ? <tr><td className="px-2 py-8 text-center text-[#9A847B]" colSpan={5}><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />正在載入帳戶…</td></tr> : visibleAccounts.length ? visibleAccounts.map(account => { const isProtected = account.role === "admin" || account.id === user?.id; return <tr key={account.id} className="border-b border-[#F7EEEA] last:border-0"><td className="px-2 py-4"><p className="font-semibold text-[#5F4C47]">{account.name || "未設定暱稱"}</p><p className="mt-1 max-w-[230px] truncate text-xs text-[#8A756B]">{account.email || "未提供電子信箱"}</p><div className="mt-1.5 flex flex-wrap gap-1.5"><Badge text={account.role === "admin" ? "管理員" : "一般帳戶"} tone={account.role === "admin" ? "amber" : "neutral"} />{account.firebaseLinked && <Badge text="Firebase 已綁定" tone="green" />}{isRecentSignIn(account.lastSignedIn) && <Badge text="近期登入" tone="blue" />}</div></td><td className="px-2 py-4 text-[#705B53]">{loginMethodLabel(account.loginMethod)}</td><td className="px-2 py-4"><Badge text={verificationLabel(account.emailVerificationStatus)} tone={account.emailVerificationStatus === "firebase-verified" ? "green" : "neutral"} /></td><td className="px-2 py-4 text-[#705B53]">{formatDate(account.lastSignedIn)}</td><td className="px-2 py-4 text-right"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => setDetailTarget(account)} className="text-[#705B53] hover:bg-[#F6F0ED]"><Eye className="mr-1 h-3.5 w-3.5" />詳情</Button>{isProtected ? <span className="self-center text-xs text-[#A28E85]">受保護</span> : <><Button type="button" variant="ghost" size="sm" onClick={() => { setRevokeTarget(account); setConfirmation(""); }} className="text-[#805D2E] hover:bg-[#FFF6E7] hover:text-[#6D4B20]"><KeyRound className="mr-1 h-3.5 w-3.5" />撤銷</Button><Button type="button" variant="ghost" size="sm" onClick={() => { setDeleteTarget(account); setConfirmation(""); }} className="text-[#A54856] hover:bg-[#FFF0F1] hover:text-[#963C4A]"><Trash2 className="mr-1 h-3.5 w-3.5" />刪除</Button></>}</div></td></tr>; }) : <tr><td className="px-2 py-8 text-center text-[#9A847B]" colSpan={5}>沒有符合條件的帳戶。</td></tr>}</tbody></table></div>}</div>
      <aside className="space-y-6"><section className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-[#5F4C47]">未驗證身分清理</h2><p className="mt-2 text-sm leading-6 text-[#846E66]">只會清理超過 24 小時、未驗證且僅存在於 Firebase 的 Email／Password 身分，不會刪除既有共帳帳本資料。</p><div className="mt-4 rounded-2xl bg-[#FFF8F5] p-4 text-sm"><p className="font-semibold text-[#705B53]">{cleanup.data?.configured ? "每日排程已設定" : "尚未啟用每日排程"}</p><p className="mt-1 text-[#846E66]">最近執行：{formatDate(cleanup.data?.lastRunAt)}</p>{cleanup.data?.lastRunStatus && <p className="mt-1 text-[#846E66]">狀態：{cleanup.data.lastRunStatus}</p>}{cleanup.data?.lastRunError && <p className="mt-2 text-[#A54856]">{cleanup.data.lastRunError}</p>}</div></section><section className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-[#5F4C47]">安全與同步健康度</h2><p className="mt-1 text-xs leading-5 text-[#846E66]">近 7 日匿名彙總；不包含帳戶、帳本、交易、收支或 Firebase 身分資料。</p></div><Button type="button" variant="ghost" size="sm" onClick={() => void operationalOverview.refetch()} disabled={operationalOverview.isFetching} className="shrink-0 text-[#805D2E]">{operationalOverview.isFetching ? "讀取中…" : "重新讀取"}</Button></div>{operationalOverview.error ? <ErrorBox text="匿名事件摘要暫時無法讀取。"><Button type="button" size="sm" variant="outline" onClick={() => void operationalOverview.refetch()}>重試</Button></ErrorBox> : <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">{operationalOverview.isLoading ? <p className="text-sm text-[#9A847B]">正在讀取匿名事件…</p> : operationalOverview.data?.events.length ? operationalOverview.data.events.map(item => <div key={`${item.event}-${item.source}-${item.outcome}-${item.code ?? "none"}`} className="flex items-center justify-between gap-3 rounded-2xl bg-[#FFF9F7] px-3 py-2.5"><div className="min-w-0"><p className="text-sm font-semibold text-[#624B51]">{item.event === "rememberRestore" ? "記住裝置恢復" : item.event === "sessionRevoke" ? "撤銷登入" : "同步衝突"}</p><p className="mt-0.5 truncate text-xs text-[#8A756B]">{item.source} · {item.outcome === "success" ? "成功" : "失敗"}{item.code ? ` · ${item.code}` : ""}</p></div><span className="shrink-0 rounded-full bg-[#F4F0EE] px-2 py-1 text-xs font-semibold text-[#705B53]">{item.count.toLocaleString("zh-TW")}</span></div>) : <p className="text-sm text-[#9A847B]">近 7 日尚無匿名作業事件。</p>}</div>}</section><section className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-[#5F4C47]">近期管理紀錄</h2>{audits.error ? <ErrorBox text="稽核紀錄暫時無法讀取。"><Button type="button" size="sm" variant="outline" onClick={() => void audits.refetch()}>重試</Button></ErrorBox> : <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">{audits.isLoading ? <p className="text-sm text-[#9A847B]">正在讀取紀錄…</p> : audits.data?.length ? audits.data.map(audit => <div key={audit.id} className="rounded-2xl bg-[#FFF9F7] p-3"><p className="text-sm font-semibold text-[#624B51]">{audit.summary}</p><p className="mt-1 text-xs text-[#8A756B]">{audit.action} · {formatDate(audit.createdAt)}</p></div>) : <p className="text-sm text-[#9A847B]">尚無管理紀錄。</p>}</div>}</section></aside></section>
  </div><Dialog open={Boolean(detailTarget)} onOpenChange={open => { if (!open) setDetailTarget(null); }}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-[#5F4C47]"><Eye className="h-5 w-5" />帳戶安全詳情</DialogTitle><DialogDescription>僅顯示安全且必要的管理資料；不含帳本名稱、收支、收據、密碼或外部身分識別碼。</DialogDescription></DialogHeader>{detailTarget && <dl className="mt-2 divide-y divide-[#F0E7E2] rounded-2xl border border-[#F0E7E2] text-sm"><DetailRow label="帳戶" value={detailTarget.name || "未設定暱稱"} /><DetailRow label="電子信箱" value={detailTarget.email || "未提供電子信箱"} /><DetailRow label="驗證狀態" value={verificationLabel(detailTarget.emailVerificationStatus)} /><DetailRow label="建立時間" value={formatDate(detailTarget.createdAt, "時間待確認")} /><DetailRow label="最近登入" value={formatDate(detailTarget.lastSignedIn)} /><DetailRow label="參與帳本數量" value={`${detailTarget.ledgerMembershipCount} 個`} /><DetailRow label="擁有帳本數量" value={`${detailTarget.ownedLedgerCount} 個`} /><DetailRow label="保護狀態" value={detailTarget.role === "admin" || detailTarget.id === user?.id ? "管理員或目前帳戶，禁止此處撤銷／刪除" : "可依安全程序撤銷登入或刪除"} /></dl>}</DialogContent></Dialog><Dialog open={Boolean(deleteTarget || revokeTarget)} onOpenChange={open => { if (!open) closeManagementDialog(); }}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle className={`flex items-center gap-2 ${deleteTarget ? "text-[#A54856]" : "text-[#805D2E]"}`}><AlertTriangle className="h-5 w-5" />{deleteTarget ? "確認刪除帳戶" : "確認撤銷所有登入"}</DialogTitle><DialogDescription>{deleteTarget ? "此動作會移除目標帳戶對共帳的存取權，且無法復原。管理員與您自己的帳戶無法由此介面刪除。" : "第一步會立即使目標帳戶的 App session 失效。若帳戶使用 Firebase Email，系統接著撤銷其 Firebase refresh session；第二步失敗時，介面會明確提示重試，絕不宣稱完整成功。帳本、收支與其他帳戶資料不會被刪除。"}</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={deleteTarget ? confirmDelete : confirmRevoke}><div className="rounded-2xl bg-[#FFF7F5] p-4 text-sm text-[#705B53]"><p className="font-semibold">{(deleteTarget || revokeTarget)?.name || "未設定暱稱"}</p><p className="mt-1 text-xs">{(deleteTarget || revokeTarget)?.email || "未提供電子信箱"}</p></div><label className="block space-y-2 text-sm font-medium text-[#5F4C47]"><span>輸入 <b>{deleteTarget ? "DELETE" : "REVOKE"}</b> 以確認</span><Input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" required /></label><Button type="submit" disabled={confirmation !== (deleteTarget ? "DELETE" : "REVOKE") || deleteAccount.isPending || revokeSessions.isPending} className={`w-full ${deleteTarget ? "bg-[#A54856] hover:bg-[#913C49]" : "bg-[#805D2E] hover:bg-[#6D4B20]"}`}>{deleteTarget ? deleteAccount.isPending ? "正在刪除…" : "永久刪除此帳戶" : revokeSessions.isPending ? "正在撤銷…" : "撤銷所有登入"}</Button></form></DialogContent></Dialog></main>;
}

function Metric({ label, value, icon, loading }: { label: string; value: number | undefined; icon: React.ReactNode; loading: boolean }) {
  return <div className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-[#B56C78]"><span className="text-sm font-medium text-[#846E66]">{label}</span>{icon}</div><p className="mt-3 text-3xl font-bold text-[#5F4C47]">{loading ? "—" : (value ?? 0).toLocaleString("zh-TW")}</p></div>;
}

function Badge({ text, tone }: { text: string; tone: "amber" | "blue" | "green" | "neutral" }) {
  const color = tone === "amber" ? "bg-[#F5E4D7] text-[#8B5B34]" : tone === "blue" ? "bg-[#EAF1FF] text-[#46608D]" : tone === "green" ? "bg-[#E8F4EA] text-[#42734E]" : "bg-[#F4F0EE] text-[#6C5B56]";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{text}</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[7.25rem_1fr] gap-3 px-4 py-3"><dt className="font-medium text-[#846E66]">{label}</dt><dd className="min-w-0 break-words text-[#5F4C47]">{value}</dd></div>;
}

function ErrorBox({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FFF0F1] p-3 text-sm text-[#A54856]"><p>{text}</p>{children}</div>;
}
