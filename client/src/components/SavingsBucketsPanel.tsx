import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CalendarDays, History, LoaderCircle, PauseCircle, Pencil, PiggyBank, Plus, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type PaymentMethod = { id: number; name: string; icon?: string; isActive?: number | boolean };
type SavingsBucket = {
  id: number;
  paymentMethodId: number;
  name: string;
  icon: string;
  targetAmount: number | string;
  monthlyAmount: number | string;
  dayOfMonth: number;
  priority: number;
  isActive: number | boolean;
  version: number;
  savedAmount: number | string;
  remainingAmount: number | string;
};
type SavingsAllocation = {
  id: number;
  month: string;
  scheduledAmount: number | string;
  allocatedAmount: number | string;
  shortfallAmount: number | string;
  status: "completed" | "partial" | "skipped";
};

const SAVINGS_ICON_OPTIONS = ["🎯", "🚗", "✈️", "🏠", "💻", "💍", "🧳", "🎓", "🏦", "🛠️", "🌱", "✨"];
const toAmount = (value: number | string | null | undefined) => Math.max(0, Math.trunc(Number(value) || 0));
const money = (value: number | string | null | undefined) => `NT$ ${toAmount(value).toLocaleString("zh-TW")}`;
const statusLabel = (status: SavingsAllocation["status"]) => status === "completed" ? "已完成" : status === "partial" ? "部分分配" : "本月略過";
const statusTone = (status: SavingsAllocation["status"]) => status === "completed" ? "bg-[#EDF5EF] text-[#4E7B5A]" : status === "partial" ? "bg-[#FFF1DF] text-[#9B6A2E]" : "bg-[#F4EDEF] text-[#80636B]";

function savingsError(error: unknown) {
  const message = error instanceof Error ? error.message : "儲蓄桶操作未完成，請稍後再試。";
  toast.error(message.includes("CONFLICT") || message.includes("其他成員修改") ? "此儲蓄桶已被其他成員修改，請重新整理後再編輯。" : message);
}

export function SavingsBucketsPanel({ ledgerId, paymentMethods }: { ledgerId: number; paymentMethods: PaymentMethod[] }) {
  const utils = trpc.useUtils();
  const [editor, setEditor] = useState<SavingsBucket | null | "new">(null);
  const [historyBucket, setHistoryBucket] = useState<SavingsBucket | null>(null);
  const [pendingStop, setPendingStop] = useState<SavingsBucket | null>(null);
  const bucketsQuery = trpc.ledger.savings.buckets.useQuery({ ledgerId }, { refetchOnWindowFocus: true, refetchInterval: 15_000, refetchIntervalInBackground: false });
  const allocationsQuery = trpc.ledger.savings.allocations.useQuery(
    { ledgerId, ...(historyBucket ? { bucketId: historyBucket.id } : {}) },
    { enabled: Boolean(historyBucket), refetchOnWindowFocus: true },
  );

  const refreshSavings = async () => {
    await Promise.all([
      utils.ledger.savings.buckets.invalidate({ ledgerId }),
      utils.ledger.savings.allocations.invalidate({ ledgerId }),
      utils.ledger.workspace.invalidate(),
    ]);
  };
  const createBucket = trpc.ledger.savings.create.useMutation({
    onSuccess: async () => { setEditor(null); toast.success("儲蓄桶已建立。下個排程日會依設定自動轉存。"); await refreshSavings(); },
    onError: savingsError,
  });
  const updateBucket = trpc.ledger.savings.update.useMutation({
    onSuccess: async () => { setEditor(null); toast.success("儲蓄桶已更新。"); await refreshSavings(); },
    onError: savingsError,
  });
  const stopBucket = trpc.ledger.savings.stop.useMutation({
    onSuccess: async () => { toast.success("此儲蓄桶已暫停自動分配。"); await refreshSavings(); },
    onError: savingsError,
  });
  const buckets = (bucketsQuery.data ?? []) as SavingsBucket[];
  const activePaymentMethods = useMemo(() => paymentMethods.filter(item => Boolean(item.isActive)), [paymentMethods]);
  const isSaving = createBucket.isPending || updateBucket.isPending || stopBucket.isPending;

  return <>
    <section className="xl:col-span-2 rounded-[28px] border border-[#EADDD7] bg-[var(--card)] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8E9D5] text-[#A96E32]"><PiggyBank size={18} /></span><h2 className="text-lg font-bold">儲蓄桶</h2></div><p className="mt-2 max-w-2xl text-sm leading-6 text-[#927C74]">每桶可自訂目標、扣款支付方式、每月日期與優先順序。每月正式轉存不會納入消費分析，資金不足時會依優先順序部分分配並保留完整紀錄。</p></div>
        <Button type="button" onClick={() => setEditor("new")} disabled={!activePaymentMethods.length || isSaving} className="shrink-0 rounded-xl bg-[#B56C78] text-white hover:bg-[#A35B68]"><Plus size={16} className="mr-1" />新增儲蓄桶</Button>
      </div>
      {!activePaymentMethods.length && <div className="mt-4 flex gap-3 rounded-2xl border border-[#E8D7C9] bg-[#FFF7F2] p-4 text-sm text-[#856154]"><WalletCards size={18} className="mt-0.5 shrink-0 text-[#B56C78]" /><span>請先在「帳本設定」新增並啟用一個支付方式，才能設定每月自動轉存的扣款來源。</span></div>}
      {bucketsQuery.isLoading ? <div className="mt-5 flex min-h-32 items-center justify-center gap-2 text-sm text-[#927C74]"><LoaderCircle size={17} className="animate-spin" />載入儲蓄桶中…</div> : bucketsQuery.error ? <div className="mt-5 rounded-2xl border border-[#E8D7C9] bg-[#FFF7F2] p-4 text-sm text-[#856154]"><p>儲蓄桶資料暫時無法讀取。</p><Button type="button" variant="outline" size="sm" onClick={() => void bucketsQuery.refetch()} className="mt-3 rounded-lg border-[#DDBDB2] bg-white">重試</Button></div> : buckets.length ? <div className="mt-5 grid gap-4 md:grid-cols-2">{buckets.map(bucket => {
        const saved = toAmount(bucket.savedAmount); const target = toAmount(bucket.targetAmount); const progress = target ? Math.min(100, Math.round(saved / target * 100)) : 0;
        const payment = paymentMethods.find(item => item.id === bucket.paymentMethodId);
        return <article key={bucket.id} className={`rounded-2xl border p-4 ${bucket.isActive ? "border-[#E9DDD4] bg-[#FFFCFA]" : "border-[#E7DFDB] bg-[#F8F5F3] opacity-80"}`}>
          <div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F8EAD9] text-xl">{bucket.icon || "🎯"}</span><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center justify-between gap-2"><h3 className="truncate font-bold">{bucket.name}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${bucket.isActive ? "bg-[#ECF4EC] text-[#54795B]" : "bg-[#EFE8E9] text-[#80636B]"}`}>{bucket.isActive ? "自動分配中" : "已暫停"}</span></div><p className="mt-1 text-xs text-[#927C74]">優先順序 {bucket.priority} · 每月 {bucket.dayOfMonth} 日</p></div></div>
          <div className="mt-4"><div className="flex items-end justify-between gap-3"><div><p className="text-xs text-[#927C74]">已存入／目標</p><b className="mt-1 block text-lg text-[#A65F6B]">{money(saved)}</b></div><span className="shrink-0 text-sm font-bold text-[#756057]">{progress}%</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#F0E5DF]"><div className="h-full rounded-full bg-[#B56C78] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-[#927C74]">還差 {money(bucket.remainingAmount)} · 每月 {money(bucket.monthlyAmount)}</p></div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#F0E7E2] pt-3 text-xs text-[#806D65]"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />每月 {bucket.dayOfMonth} 日</span><span className="inline-flex min-w-0 items-center gap-1"><WalletCards size={13} />{payment?.icon || "💳"} {payment?.name || "扣款方式待確認"}</span></div>
          <div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setEditor(bucket)} disabled={isSaving} className="rounded-lg border-[#DDC7C0] bg-white"><Pencil size={14} className="mr-1" />編輯</Button><Button type="button" size="sm" variant="outline" onClick={() => setHistoryBucket(bucket)} className="rounded-lg border-[#DDC7C0] bg-white"><History size={14} className="mr-1" />分配紀錄</Button>{bucket.isActive && <Button type="button" size="sm" variant="ghost" onClick={() => setPendingStop(bucket)} disabled={isSaving} className="rounded-lg text-[#9A5D67]"><PauseCircle size={14} className="mr-1" />暫停</Button>}</div>
        </article>;
      })}</div> : <div className="mt-5 rounded-2xl bg-[#FBF5F1] px-4 py-8 text-center"><PiggyBank size={28} className="mx-auto text-[#BE8B68]" /><p className="mt-3 font-semibold text-[#725D54]">尚未建立儲蓄桶</p><p className="mt-1 text-sm text-[#927C74]">例如買車基金、日本旅遊、房屋頭期款或電腦基金。</p></div>}
    </section>
    <SavingsBucketDialog open={editor !== null} bucket={editor === "new" ? null : editor} ledgerId={ledgerId} paymentMethods={activePaymentMethods} saving={isSaving} onClose={() => setEditor(null)} onSave={input => editor && editor !== "new" ? updateBucket.mutate({ ...input, bucketId: editor.id, expectedVersion: editor.version }) : createBucket.mutate(input)} />
    <SavingsAllocationHistory open={Boolean(historyBucket)} bucket={historyBucket} loading={allocationsQuery.isLoading} error={Boolean(allocationsQuery.error)} rows={(allocationsQuery.data ?? []) as SavingsAllocation[]} onClose={() => setHistoryBucket(null)} onRetry={() => void allocationsQuery.refetch()} />
    <Dialog open={Boolean(pendingStop)} onOpenChange={next => !next && setPendingStop(null)}><DialogContent className="rounded-3xl sm:max-w-md"><DialogHeader><DialogTitle>暫停自動分配？</DialogTitle><DialogDescription>{pendingStop ? `「${pendingStop.name}」從下個排程起不會再建立新的自動轉存。已完成與部分分配的紀錄都會完整保留。` : ""}</DialogDescription></DialogHeader><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setPendingStop(null)} className="rounded-xl">保留自動分配</Button><Button type="button" variant="destructive" disabled={stopBucket.isPending} onClick={() => { if (!pendingStop) return; stopBucket.mutate({ ledgerId, bucketId: pendingStop.id, expectedVersion: pendingStop.version }); setPendingStop(null); }} className="rounded-xl">{stopBucket.isPending && <LoaderCircle size={16} className="mr-2 animate-spin" />}確認暫停</Button></div></DialogContent></Dialog>
  </>;
}

function SavingsBucketDialog({ open, bucket, ledgerId, paymentMethods, saving, onClose, onSave }: { open: boolean; bucket: SavingsBucket | null; ledgerId: number; paymentMethods: PaymentMethod[]; saving: boolean; onClose: () => void; onSave: (input: { ledgerId: number; paymentMethodId: number; name: string; icon: string; targetAmount: number; monthlyAmount: number; dayOfMonth: number; priority: number; isActive: boolean }) => void }) {
  const [name, setName] = useState(""); const [icon, setIcon] = useState("🎯"); const [targetAmount, setTargetAmount] = useState(""); const [monthlyAmount, setMonthlyAmount] = useState(""); const [paymentMethodId, setPaymentMethodId] = useState(0); const [dayOfMonth, setDayOfMonth] = useState(1); const [priority, setPriority] = useState(0); const [isActive, setIsActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(bucket?.name || ""); setIcon(bucket?.icon || "🎯"); setTargetAmount(bucket ? String(toAmount(bucket.targetAmount)) : ""); setMonthlyAmount(bucket ? String(toAmount(bucket.monthlyAmount)) : ""); setPaymentMethodId(bucket?.paymentMethodId || paymentMethods[0]?.id || 0); setDayOfMonth(bucket?.dayOfMonth || 1); setPriority(bucket?.priority || 0); setIsActive(bucket ? Boolean(bucket.isActive) : true);
  }, [open, bucket, paymentMethods]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = toAmount(targetAmount); const monthly = toAmount(monthlyAmount);
    if (!name.trim() || !paymentMethodId || !target || !monthly) { toast.error("請完整填寫名稱、目標金額、每月額度與扣款支付方式。", { duration: 5000 }); return; }
    onSave({ ledgerId, paymentMethodId, name: name.trim(), icon, targetAmount: target, monthlyAmount: monthly, dayOfMonth: Math.min(28, Math.max(1, Math.trunc(dayOfMonth || 1))), priority: Math.max(0, Math.trunc(priority || 0)), isActive });
  };
  return <Dialog open={open} onOpenChange={next => !next && onClose()}><DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg"><DialogHeader><DialogTitle>{bucket ? "編輯儲蓄桶" : "建立儲蓄桶"}</DialogTitle><DialogDescription>金額以新臺幣整數元保存。較小的優先順序會優先使用可用餘額；不足時只會轉存可分配的部分。</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={submit}><label className="block space-y-1.5"><span className="text-sm font-medium">圖示</span><div className="grid grid-cols-6 gap-2">{SAVINGS_ICON_OPTIONS.map(option => <button key={option} type="button" onClick={() => setIcon(option)} aria-pressed={icon === option} className={`flex h-10 items-center justify-center rounded-xl border text-lg ${icon === option ? "border-[#C77B88] bg-[#FBF0F1]" : "border-[#E7D9D3] bg-white hover:bg-[#FFF7F4]"}`}>{option}</button>)}</div></label><label className="block space-y-1.5"><span className="text-sm font-medium">儲蓄桶名稱</span><Input value={name} onChange={event => setName(event.target.value)} maxLength={128} placeholder="例如：日本旅遊" required /></label><div className="grid grid-cols-2 gap-3"><label className="block space-y-1.5"><span className="text-sm font-medium">目標金額</span><Input inputMode="numeric" type="number" min="1" step="1" value={targetAmount} onChange={event => setTargetAmount(event.target.value)} placeholder="100000" required /></label><label className="block space-y-1.5"><span className="text-sm font-medium">每月存入額度</span><Input inputMode="numeric" type="number" min="1" step="1" value={monthlyAmount} onChange={event => setMonthlyAmount(event.target.value)} placeholder="5000" required /></label></div><div className="grid grid-cols-2 gap-3"><label className="block space-y-1.5"><span className="text-sm font-medium">每月分配日期</span><Input inputMode="numeric" type="number" min="1" max="28" value={dayOfMonth} onChange={event => setDayOfMonth(Number(event.target.value))} required /></label><label className="block space-y-1.5"><span className="text-sm font-medium">優先順序</span><Input inputMode="numeric" type="number" min="0" max="100000" value={priority} onChange={event => setPriority(Number(event.target.value))} required /></label></div><label className="block space-y-1.5"><span className="text-sm font-medium">扣款支付方式</span><select value={paymentMethodId} onChange={event => setPaymentMethodId(Number(event.target.value))} className="h-10 w-full rounded-md border border-input bg-background px-3" required>{paymentMethods.map(method => <option key={method.id} value={method.id}>{method.icon || "💳"} {method.name}</option>)}</select></label>{bucket && <label className="flex items-center justify-between rounded-xl bg-[#FBF5F1] px-3 py-3 text-sm"><span><b className="block">啟用每月自動分配</b><small className="mt-1 block text-[#927C74]">停用後不會再建立新的自動轉存交易。</small></span><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="h-4 w-4 accent-[#B56C78]" /></label>}<Button type="submit" disabled={saving || !paymentMethods.length} className="w-full bg-[#B56C78] text-white hover:bg-[#A35B68]">{saving && <LoaderCircle size={16} className="mr-2 animate-spin" />}{bucket ? "儲存變更" : "建立儲蓄桶"}</Button></form></DialogContent></Dialog>;
}

function SavingsAllocationHistory({ open, bucket, loading, error, rows, onClose, onRetry }: { open: boolean; bucket: SavingsBucket | null; loading: boolean; error: boolean; rows: SavingsAllocation[]; onClose: () => void; onRetry: () => void }) {
  return <Dialog open={open} onOpenChange={next => !next && onClose()}><DialogContent className="max-h-[84vh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{bucket ? `${bucket.icon || "🎯"} ${bucket.name} 的分配紀錄` : "分配紀錄"}</DialogTitle><DialogDescription>每筆紀錄保留原定金額、實際轉存金額與不足差額；重試排程不會重複扣款。</DialogDescription></DialogHeader>{loading ? <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-[#927C74]"><LoaderCircle size={17} className="animate-spin" />載入紀錄中…</div> : error ? <div className="mt-4 rounded-2xl bg-[#FFF7F2] p-4 text-sm text-[#856154]"><p>分配紀錄暫時無法讀取。</p><Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-3 rounded-lg border-[#DDBDB2] bg-white">重試</Button></div> : rows.length ? <div className="mt-4 divide-y divide-[#F0E7E2]">{rows.map(row => <div key={row.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3"><div className="min-w-[74px] flex-1"><b className="block text-sm">{row.month}</b><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></div><div className="grid grid-cols-3 gap-3 text-right text-xs"><span><small className="block text-[#927C74]">原定</small><b>{money(row.scheduledAmount)}</b></span><span><small className="block text-[#927C74]">已轉存</small><b className="text-[#557A5D]">{money(row.allocatedAmount)}</b></span><span><small className="block text-[#927C74]">不足</small><b className={toAmount(row.shortfallAmount) ? "text-[#A86A52]" : "text-[#557A5D]"}>{money(row.shortfallAmount)}</b></span></div></div>)}</div> : <div className="mt-5 rounded-2xl bg-[#FBF5F1] px-4 py-8 text-center text-sm text-[#927C74]">尚無分配紀錄。系統會在每月設定日期後建立第一筆可追溯的轉存紀錄。</div>}</DialogContent></Dialog>;
}
