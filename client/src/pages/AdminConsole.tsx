import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ArrowLeft, LoaderCircle, Search, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const formatDate = (value: Date | string | null | undefined) => {
  if (!value) return "尚未登入";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "時間待確認" : date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "管理操作暫時無法完成，請稍後重試。";

export default function AdminConsole() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const utils = trpc.useUtils();
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string | null; email: string | null } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const isAdmin = user?.role === "admin";
  const options = { enabled: isAdmin, retry: false, refetchOnWindowFocus: false };
  const summary = trpc.admin.summary.useQuery(undefined, options);
  const cleanup = trpc.admin.authCleanupStatus.useQuery(undefined, options);
  const accounts = trpc.admin.listUsers.useQuery({ query }, options);
  const audits = trpc.admin.audits.useQuery({ limit: 50 }, options);
  const deleteAccount = trpc.admin.deleteUser.useMutation({
    onSuccess: async (result) => {
      toast.success(result.firebaseIdentityDeleted ? "帳戶已刪除並完成身分清理。" : "共帳帳戶已刪除；外部身分清理已記錄供後續處理。");
      setDeleteTarget(null);
      setConfirmation("");
      await Promise.all([utils.admin.summary.invalidate(), utils.admin.listUsers.invalidate(), utils.admin.audits.invalidate()]);
    },
    onError: error => toast.error(errorMessage(error)),
  });

  useEffect(() => {
    if (!loading && user && !isAdmin) toast.error("此頁面只供管理員使用。");
  }, [isAdmin, loading, user]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draftQuery.trim());
  };
  const confirmDelete = (event: FormEvent) => {
    event.preventDefault();
    if (!deleteTarget || confirmation !== "DELETE") return;
    deleteAccount.mutate({ targetUserId: deleteTarget.id, confirmation: "DELETE" });
  };

  if (loading) return <main className="min-h-screen bg-[#FFF9F7] p-6"><div className="mx-auto max-w-6xl animate-pulse rounded-3xl bg-white p-8 text-[#9A847B]">正在驗證管理員身分…</div></main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#FFF9F7] p-6"><section className="mx-auto max-w-xl rounded-3xl border border-[#E8D7D1] bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-[#B56C78]" /><h1 className="mt-4 text-xl font-bold text-[#5F4C47]">沒有管理權限</h1><p className="mt-2 text-sm leading-6 text-[#846E66]">此網頁僅提供具備管理員角色的共帳帳戶使用。</p><Button className="mt-6 bg-[#B56C78]" onClick={() => navigate("/app")}>返回共帳</Button></section></main>;

  return <main className="min-h-screen bg-[#FFF9F7] px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl space-y-6"><header className="flex flex-col gap-4 rounded-3xl bg-[#624B51] p-6 text-white shadow-[0_18px_50px_rgba(98,75,81,0.18)] sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold text-[#F5DADB]"><ShieldCheck className="h-4 w-4" />共帳後台管理</div><h1 className="mt-2 text-2xl font-bold tracking-tight">使用者帳戶管理</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#F1D9D8]">僅顯示帳戶營運所需資訊。密碼、Firebase UID、收據與交易明細不會在此頁呈現。</p></div><Button type="button" variant="outline" onClick={() => navigate("/app")} className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />返回共帳</Button></header>

    <section className="grid gap-4 sm:grid-cols-3"><Metric label="有效帳戶" value={summary.data?.activeUsers} icon={<UsersRound className="h-5 w-5" />} loading={summary.isLoading} /><Metric label="管理員帳戶" value={summary.data?.adminUsers} icon={<ShieldCheck className="h-5 w-5" />} loading={summary.isLoading} /><Metric label="已綁定 Firebase" value={summary.data?.firebaseLinkedUsers} icon={<ShieldCheck className="h-5 w-5" />} loading={summary.isLoading} /></section>

    <section className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]"><div className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-bold text-[#5F4C47]">帳戶清單</h2><p className="mt-1 text-sm text-[#846E66]">可按暱稱或電子信箱搜尋，最多顯示 100 筆。</p></div><form className="flex w-full gap-2 sm:max-w-sm" onSubmit={search}><Input value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="搜尋暱稱或信箱" aria-label="搜尋帳戶" /><Button type="submit" className="shrink-0 bg-[#B56C78]"><Search className="mr-1.5 h-4 w-4" />搜尋</Button></form></div>{accounts.error ? <ErrorBox text="帳戶清單暫時無法讀取，請重新整理或稍後重試。" /> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#F0E7E2] text-xs font-semibold tracking-wide text-[#8A756B]"><tr><th className="px-2 py-3">帳戶</th><th className="px-2 py-3">登入方式</th><th className="px-2 py-3">最近登入</th><th className="px-2 py-3 text-right">操作</th></tr></thead><tbody>{accounts.isLoading ? <tr><td className="px-2 py-8 text-center text-[#9A847B]" colSpan={4}><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />正在載入帳戶…</td></tr> : accounts.data?.length ? accounts.data.map(account => <tr key={account.id} className="border-b border-[#F7EEEA] last:border-0"><td className="px-2 py-4"><p className="font-semibold text-[#5F4C47]">{account.name || "未設定暱稱"}</p><p className="mt-1 max-w-[230px] truncate text-xs text-[#8A756B]">{account.email || "未提供電子信箱"}</p><div className="mt-1.5 flex flex-wrap gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${account.role === "admin" ? "bg-[#F5E4D7] text-[#8B5B34]" : "bg-[#F4F0EE] text-[#6C5B56]"}`}>{account.role === "admin" ? "管理員" : "一般帳戶"}</span>{account.firebaseLinked && <span className="rounded-full bg-[#E8F4EA] px-2 py-0.5 text-[11px] font-medium text-[#42734E]">Firebase 已綁定</span>}</div></td><td className="px-2 py-4 text-[#705B53]">{account.loginMethod === "google" ? "Google" : account.loginMethod === "email" ? "電子信箱" : "其他"}</td><td className="px-2 py-4 text-[#705B53]">{formatDate(account.lastSignedIn)}</td><td className="px-2 py-4 text-right">{account.role === "admin" || account.id === user?.id ? <span className="text-xs text-[#A28E85]">受保護</span> : <Button type="button" variant="ghost" size="sm" onClick={() => { setDeleteTarget(account); setConfirmation(""); }} className="text-[#A54856] hover:bg-[#FFF0F1] hover:text-[#963C4A]"><Trash2 className="mr-1 h-3.5 w-3.5" />刪除</Button>}</td></tr>) : <tr><td className="px-2 py-8 text-center text-[#9A847B]" colSpan={4}>沒有符合條件的帳戶。</td></tr>}</tbody></table></div>}</div>

      <aside className="space-y-6"><section className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-[#5F4C47]">未驗證身分清理</h2><p className="mt-2 text-sm leading-6 text-[#846E66]">只會清理超過 24 小時、未驗證且僅存在於 Firebase 的 Email/Password 身分，不會刪除既有共帳帳本資料。</p><div className="mt-4 rounded-2xl bg-[#FFF8F5] p-4 text-sm"><p className="font-semibold text-[#705B53]">{cleanup.data?.configured ? "每日排程已設定" : "尚未啟用每日排程"}</p><p className="mt-1 text-[#846E66]">最近執行：{formatDate(cleanup.data?.lastRunAt)}</p>{cleanup.data?.lastRunStatus && <p className="mt-1 text-[#846E66]">狀態：{cleanup.data.lastRunStatus}</p>}{cleanup.data?.lastRunError && <p className="mt-2 text-[#A54856]">{cleanup.data.lastRunError}</p>}</div></section><section className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-[#5F4C47]">近期管理紀錄</h2>{audits.error ? <ErrorBox text="稽核紀錄暫時無法讀取。" /> : <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">{audits.isLoading ? <p className="text-sm text-[#9A847B]">正在讀取紀錄…</p> : audits.data?.length ? audits.data.map(audit => <div key={audit.id} className="rounded-2xl bg-[#FFF9F7] p-3"><p className="text-sm font-semibold text-[#624B51]">{audit.summary}</p><p className="mt-1 text-xs text-[#8A756B]">{audit.action} · {formatDate(audit.createdAt)}</p></div>) : <p className="text-sm text-[#9A847B]">尚無管理紀錄。</p>}</div>}</section></aside></section>
  </div><Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) { setDeleteTarget(null); setConfirmation(""); } }}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-[#A54856]"><AlertTriangle className="h-5 w-5" />確認刪除帳戶</DialogTitle><DialogDescription>此動作會移除目標帳戶對共帳的存取權，且無法復原。管理員與您自己的帳戶無法由此介面刪除。</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={confirmDelete}><div className="rounded-2xl bg-[#FFF7F5] p-4 text-sm text-[#705B53]"><p className="font-semibold">{deleteTarget?.name || "未設定暱稱"}</p><p className="mt-1 text-xs">{deleteTarget?.email || "未提供電子信箱"}</p></div><label className="block space-y-2 text-sm font-medium text-[#5F4C47]"><span>輸入 <b>DELETE</b> 以確認</span><Input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" required /></label><Button type="submit" disabled={confirmation !== "DELETE" || deleteAccount.isPending} className="w-full bg-[#A54856] hover:bg-[#913C49]">{deleteAccount.isPending ? "正在刪除…" : "永久刪除此帳戶"}</Button></form></DialogContent></Dialog></main>;
}

function Metric({ label, value, icon, loading }: { label: string; value: number | undefined; icon: React.ReactNode; loading: boolean }) {
  return <div className="rounded-3xl border border-[#E8D7D1] bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-[#B56C78]"><span className="text-sm font-medium text-[#846E66]">{label}</span>{icon}</div><p className="mt-3 text-3xl font-bold text-[#5F4C47]">{loading ? "—" : (value ?? 0).toLocaleString("zh-TW")}</p></div>;
}

function ErrorBox({ text }: { text: string }) {
  return <p className="mt-4 rounded-2xl bg-[#FFF0F1] p-3 text-sm text-[#A54856]">{text}</p>;
}
