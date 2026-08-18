import { useAuth } from "@/_core/hooks/useAuth";
import { ReleaseFooter } from "@/components/ReleaseFooter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BarChart3, CalendarDays, Check, ChevronDown, Clipboard, CreditCard, Heart, LayoutDashboard, LogOut, Plus, Receipt, Users, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { useLocation } from "wouter";
import type { AppRouter } from "../../../server/routers";

const money = (value: number) => `NT$ ${Math.round(Number(value) || 0).toLocaleString("zh-TW")}`;
const localDate = (value: Date | string) => new Date(value).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
const todayKey = () => new Date().toISOString().slice(0, 10);
const initialMonth = () => new Date().toISOString().slice(0, 7);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作未完成，請稍後再試。";
}

type AddForm = {
  note: string;
  amount: string;
  date: string;
  type: "expense" | "income";
  categoryId: number;
  paymentMethodId: number;
  payerId: number;
};

type RouterOutput = inferRouterOutputs<AppRouter>;
type LedgerWorkspacePayload = RouterOutput["ledger"]["workspace"];
type LedgerRecord = RouterOutput["ledger"]["list"][number]["ledger"];
type CategoryRecord = LedgerWorkspacePayload["categories"][number];
type PaymentMethodRecord = LedgerWorkspacePayload["paymentMethods"][number];
type MemberRecord = LedgerWorkspacePayload["members"][number];

export default function LedgerWorkspace() {
  const [, setLocation] = useLocation();
  const { user, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(initialMonth);
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<"overview" | "records">("overview");
  const [showLedgerDialog, setShowLedgerDialog] = useState<"create" | "join" | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [ledgerName, setLedgerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [addForm, setAddForm] = useState<AddForm>({ note: "", amount: "", date: todayKey(), type: "expense", categoryId: 0, paymentMethodId: 0, payerId: 0 });

  const ledgersQuery = trpc.ledger.list.useQuery(undefined, { enabled: Boolean(user), refetchOnWindowFocus: false });
  const workspaceQuery = trpc.ledger.workspace.useQuery({ ledgerId: selectedLedgerId ?? 1, month }, { enabled: selectedLedgerId !== null, refetchOnWindowFocus: false });
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data]);

  useEffect(() => {
    const firstId = ledgers[0]?.ledger.id;
    if (!firstId) {
      setSelectedLedgerId(null);
      return;
    }
    if (!selectedLedgerId || !ledgers.some(item => item.ledger.id === selectedLedgerId)) {
      setSelectedLedgerId(firstId);
    }
  }, [ledgers, selectedLedgerId]);

  const selectedLedger = useMemo(() => ledgers.find(item => item.ledger.id === selectedLedgerId)?.ledger, [ledgers, selectedLedgerId]);
  const workspace = workspaceQuery.data;
  const activeCategories = useMemo(() => workspace?.categories.filter(category => Boolean(category.isActive) && category.type === addForm.type) ?? [], [addForm.type, workspace?.categories]);
  const activePaymentMethods = useMemo(() => workspace?.paymentMethods.filter(method => Boolean(method.isActive)) ?? [], [workspace?.paymentMethods]);
  const categoryById = useMemo(() => new Map(workspace?.categories.map(category => [category.id, category])), [workspace?.categories]);
  const paymentById = useMemo(() => new Map(workspace?.paymentMethods.map(method => [method.id, method])), [workspace?.paymentMethods]);
  const memberById = useMemo(() => new Map(workspace?.members.map(member => [member.member.userId, member.user])), [workspace?.members]);

  useEffect(() => {
    if (!workspace) return;
    setAddForm(current => ({
      ...current,
      categoryId: activeCategories.some(category => category.id === current.categoryId) ? current.categoryId : (activeCategories[0]?.id ?? 0),
      paymentMethodId: activePaymentMethods.some(method => method.id === current.paymentMethodId) ? current.paymentMethodId : (activePaymentMethods[0]?.id ?? 0),
      payerId: workspace.members.some(member => member.member.userId === current.payerId) ? current.payerId : (workspace.members[0]?.member.userId ?? 0),
    }));
  }, [activeCategories, activePaymentMethods, workspace]);

  const createLedger = trpc.ledger.create.useMutation({
    onSuccess: async ledger => {
      await utils.ledger.list.invalidate();
      setSelectedLedgerId(ledger?.id ?? null);
      setLedgerName("");
      setShowLedgerDialog(null);
      toast.success("已建立空白帳本，可開始邀請另一位成員。");
    },
    onError: error => toast.error(errorMessage(error)),
  });
  const joinLedger = trpc.ledger.join.useMutation({
    onSuccess: async ledger => {
      await utils.ledger.list.invalidate();
      setSelectedLedgerId(ledger?.id ?? null);
      setInviteCode("");
      setShowLedgerDialog(null);
      toast.success("已加入共同帳本。");
    },
    onError: error => toast.error(errorMessage(error)),
  });
  const addTransaction = trpc.ledger.createTransaction.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.ledger.workspace.invalidate(), utils.ledger.transactions.invalidate()]);
      setShowAddDialog(false);
      setAddForm(current => ({ ...current, note: "", amount: "", date: todayKey() }));
      toast.success("收支已加入帳本，成員將看到最新內容。");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const openAddTransaction = () => {
    if (!workspace || activeCategories.length === 0 || activePaymentMethods.length === 0 || workspace.members.length === 0) {
      toast.error("請先確認帳本至少有一個可用分類、支付方式與成員。");
      return;
    }
    setAddForm({ note: "", amount: "", date: todayKey(), type: "expense", categoryId: activeCategories[0].id, paymentMethodId: activePaymentMethods[0].id, payerId: workspace.members[0].member.userId });
    setShowAddDialog(true);
  };

  const handleCreateLedger = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createLedger.mutate({ name: ledgerName.trim(), type: "couple" });
  };
  const handleJoinLedger = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    joinLedger.mutate({ inviteCode: inviteCode.trim() });
  };
  const handleAddTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLedgerId || !workspace) return;
    const amount = Math.round(Number(addForm.amount));
    if (!Number.isFinite(amount) || amount <= 0 || !addForm.categoryId || !addForm.paymentMethodId || !addForm.payerId) {
      toast.error("請完整選擇項目、金額、分類、支付方式與付款人。");
      return;
    }
    const splits = addForm.type === "expense"
      ? workspace.members.map((member, index) => ({ userId: member.member.userId, shareAmount: index === workspace.members.length - 1 ? amount - Math.floor(amount / workspace.members.length) * index : Math.floor(amount / workspace.members.length) }))
      : [];
    addTransaction.mutate({ ledgerId: selectedLedgerId, payerId: addForm.payerId, amount, type: addForm.type, categoryId: addForm.categoryId, paymentMethodId: addForm.paymentMethodId, date: new Date(`${addForm.date}T12:00:00`), note: addForm.note.trim() || undefined, splitType: addForm.type === "expense" ? "equal" : "none", splits });
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F7F4F1] text-sm text-[#8D7770]">正在確認登入狀態…</div>;
  if (!user) return <AccessGate onLogin={() => setLocation("/login")} />;

  return (
    <div className="min-h-screen bg-[#F7F4F1] text-[#352B27]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        <aside className="hidden w-72 shrink-0 border-r border-[#E9DED8] bg-[#FFFDFC] px-5 py-6 lg:flex lg:flex-col">
          <button type="button" onClick={() => setLocation("/")} className="flex items-center gap-3 px-2 text-left"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F6E2E4] text-[#AF6171]"><Heart size={21} fill="currentColor" /></span><span><span className="block font-serif text-xl font-semibold">共帳</span><span className="block text-[10px] tracking-[0.22em] text-[#A48C84]">TOGETHER LEDGER</span></span></button>
          <div className="mt-9">
            <p className="px-3 text-[10px] font-bold tracking-[0.2em] text-[#B39D95]">我的帳本</p>
            <div className="mt-3 space-y-1.5">
              {ledgersQuery.data?.map(({ ledger }) => <button key={ledger.id} type="button" onClick={() => setSelectedLedgerId(ledger.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${ledger.id === selectedLedgerId ? "bg-[#F7E8E8] text-[#9D5C69]" : "text-[#7E6961] hover:bg-[#FAF3F0]"}`}><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#B56C78] shadow-sm"><WalletCards size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{ledger.name}</span><span className="mt-0.5 block text-[11px] text-[#A68F86]">{ledger.type === "couple" ? "共同帳本" : ledger.type}</span></span><ChevronDown size={14} className="-rotate-90" /></button>)}
              {!ledgersQuery.isLoading && <button type="button" onClick={() => setShowLedgerDialog("create")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#A56570] hover:bg-[#FAF3F0]"><Plus size={16} />新增帳本</button>}
            </div>
          </div>
          {selectedLedger && <nav className="mt-8 space-y-1"><NavItem active={activePage === "overview"} icon={LayoutDashboard} label="帳本總覽" onClick={() => setActivePage("overview")} /><NavItem active={activePage === "records"} icon={Receipt} label="收支紀錄" onClick={() => setActivePage("records")} /></nav>}
          <div className="mt-auto rounded-2xl border border-[#EFDCD6] bg-[#FEF7F4] p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F4DDE0] text-[#A95F70]"><Users size={16} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{user.name || "共帳使用者"}</span><span className="block truncate text-[11px] text-[#A18B83]">{user.email || "已登入"}</span></span></div><Button type="button" variant="ghost" onClick={() => void logout()} className="mt-3 h-8 w-full justify-start px-1 text-xs text-[#906E67] hover:bg-transparent hover:text-[#A85662]"><LogOut size={14} className="mr-2" />登出</Button></div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-7">
          <header className="flex flex-col gap-4 border-b border-[#E9DED8] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold tracking-[0.16em] text-[#B37882]">WEB LEDGER</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{selectedLedger?.name ?? "我的共同帳本"}</h1></div>
            <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => setShowLedgerDialog("join")} className="h-10 rounded-xl border-[#DDC7C0] bg-white px-4 text-sm text-[#875A61] hover:bg-[#FFFCFB]"><Users size={16} className="mr-2" />加入帳本</Button>{selectedLedger && <Button type="button" onClick={openAddTransaction} className="h-10 rounded-xl bg-[#B56C78] px-4 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(181,108,120,0.18)] hover:bg-[#A35B68]"><Plus size={16} className="mr-2" />新增收支</Button>}</div>
          </header>
          {!ledgersQuery.isLoading && !selectedLedger ? <EmptyLedger onCreate={() => setShowLedgerDialog("create")} onJoin={() => setShowLedgerDialog("join")} /> : workspaceQuery.isLoading ? <WorkspaceLoading /> : workspace ? <section className="py-6">{activePage === "overview" ? <Overview workspace={workspace} month={month} setMonth={setMonth} selectedLedger={selectedLedger} categoryById={categoryById} memberById={memberById} onAdd={openAddTransaction} /> : <Records workspace={workspace} categoryById={categoryById} paymentById={paymentById} memberById={memberById} />}</section> : <section className="py-12 text-center text-sm text-[#927E76]">帳本資料暫時無法載入，請稍後再試。</section>}
          <ReleaseFooter compact />
        </main>
      </div>
      <Dialog open={showLedgerDialog === "create"} onOpenChange={open => !open && setShowLedgerDialog(null)}><DialogContent className="rounded-3xl border-[#EBDDD7] bg-[#FFFDFC] sm:max-w-md"><DialogHeader><DialogTitle>建立新的共同帳本</DialogTitle><DialogDescription>新帳本不會放入任何範例收支；只會建立可立即使用的分類與支付方式。</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={handleCreateLedger}><div className="space-y-2"><Label htmlFor="ledger-name">帳本名稱</Label><Input id="ledger-name" value={ledgerName} onChange={event => setLedgerName(event.target.value)} placeholder="例如：小辰 & 安安的生活帳" maxLength={128} required /></div><Button type="submit" disabled={createLedger.isPending} className="w-full rounded-xl bg-[#B56C78] hover:bg-[#A35B68]">{createLedger.isPending ? "建立中…" : "建立空白帳本"}</Button></form></DialogContent></Dialog>
      <Dialog open={showLedgerDialog === "join"} onOpenChange={open => !open && setShowLedgerDialog(null)}><DialogContent className="rounded-3xl border-[#EBDDD7] bg-[#FFFDFC] sm:max-w-md"><DialogHeader><DialogTitle>使用邀請碼加入帳本</DialogTitle><DialogDescription>請向帳本成員取得 6 碼邀請碼。加入後即可查看與新增共同收支。</DialogDescription></DialogHeader><form className="mt-3 space-y-4" onSubmit={handleJoinLedger}><div className="space-y-2"><Label htmlFor="invite-code">邀請碼</Label><Input id="invite-code" value={inviteCode} onChange={event => setInviteCode(event.target.value.toUpperCase())} placeholder="例如：A7K29X" maxLength={16} required /></div><Button type="submit" disabled={joinLedger.isPending} className="w-full rounded-xl bg-[#B56C78] hover:bg-[#A35B68]">{joinLedger.isPending ? "加入中…" : "加入帳本"}</Button></form></DialogContent></Dialog>
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}><DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl border-[#EBDDD7] bg-[#FFFDFC] sm:max-w-lg"><DialogHeader><DialogTitle>新增收支</DialogTitle><DialogDescription>第一階段網頁版以平均分攤建立支出；進階的自訂分攤與預算設定將會接續同步。</DialogDescription></DialogHeader><form className="mt-2 space-y-4" onSubmit={handleAddTransaction}><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setAddForm(form => ({ ...form, type: "expense" }))} className={`rounded-xl py-2.5 text-sm font-semibold ${addForm.type === "expense" ? "bg-[#B56C78] text-white" : "bg-[#F7EEEA] text-[#98786E]"}`}>支出</button><button type="button" onClick={() => setAddForm(form => ({ ...form, type: "income" }))} className={`rounded-xl py-2.5 text-sm font-semibold ${addForm.type === "income" ? "bg-[#668B71] text-white" : "bg-[#F2F5F1] text-[#718277]"}`}>收入</button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="金額"><Input inputMode="numeric" value={addForm.amount} onChange={event => setAddForm(form => ({ ...form, amount: event.target.value.replace(/[^0-9]/g, "") }))} placeholder="0" required /></Field><Field label="日期"><Input type="date" value={addForm.date} onChange={event => setAddForm(form => ({ ...form, date: event.target.value }))} required /></Field><Field label="分類"><select value={addForm.categoryId} onChange={event => setAddForm(form => ({ ...form, categoryId: Number(event.target.value) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{activeCategories.map(category => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></Field><Field label="支付方式"><select value={addForm.paymentMethodId} onChange={event => setAddForm(form => ({ ...form, paymentMethodId: Number(event.target.value) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{activePaymentMethods.map(method => <option key={method.id} value={method.id}>{method.icon} {method.name}</option>)}</select></Field></div><Field label="付款人"><select value={addForm.payerId} onChange={event => setAddForm(form => ({ ...form, payerId: Number(event.target.value) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{workspace?.members.map(member => <option key={member.member.userId} value={member.member.userId}>{member.user.name || "未命名成員"}</option>)}</select></Field><Field label="項目／備註"><Textarea value={addForm.note} onChange={event => setAddForm(form => ({ ...form, note: event.target.value }))} placeholder="例如：晚餐、房租、薪資" maxLength={500} /></Field>{addForm.type === "expense" && <p className="rounded-xl bg-[#F8F0ED] px-3 py-2.5 text-xs leading-5 text-[#8B736A]">此筆支出會平均分攤給目前 {workspace?.members.length ?? 0} 位帳本成員。</p>}<Button type="submit" disabled={addTransaction.isPending} className="w-full rounded-xl bg-[#B56C78] hover:bg-[#A35B68]">{addTransaction.isPending ? "儲存中…" : "儲存收支"}</Button></form></DialogContent></Dialog>
    </div>
  );
}

function NavItem({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof LayoutDashboard; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${active ? "bg-[#F5E6E6] text-[#A35F6D]" : "text-[#827068] hover:bg-[#FAF3F0]"}`}><Icon size={17} /><span>{label}</span></button>;
}

function AccessGate({ onLogin }: { onLogin: () => void }) {
  return <div className="flex min-h-screen items-center justify-center bg-[#F7F4F1] p-5"><div className="w-full max-w-md rounded-[28px] border border-[#EBDDD7] bg-[#FFFDFC] p-8 text-center shadow-[0_18px_48px_rgba(77,51,42,0.08)]"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#F6E3E4] text-[#B06070]"><Heart size={29} fill="currentColor" /></span><h1 className="mt-5 text-2xl font-bold">先登入，再開啟共同帳本</h1><p className="mt-3 text-sm leading-7 text-[#8D7770]">網頁版會連到與 Android App 相同的帳本資料。請使用電子信箱帳號登入。</p><Button type="button" onClick={onLogin} className="mt-6 w-full rounded-xl bg-[#B56C78] hover:bg-[#A35B68]">前往登入／註冊</Button></div></div>;
}

function EmptyLedger({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center"><span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F6E4E4] text-[#B06070]"><Heart size={34} fill="currentColor" /></span><h2 className="mt-6 text-2xl font-bold">從一個空白帳本開始</h2><p className="mt-3 max-w-lg text-sm leading-7 text-[#8D7770]">尚未建立任何收支資料。你可以建立新的共同帳本，或使用對方傳來的邀請碼加入既有帳本。</p><div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button type="button" onClick={onCreate} className="rounded-xl bg-[#B56C78] hover:bg-[#A35B68]"><Plus size={16} className="mr-2" />建立第一個帳本</Button><Button type="button" variant="outline" onClick={onJoin} className="rounded-xl border-[#DDC8C1] bg-white text-[#885B62] hover:bg-[#FFFCFB]"><Users size={16} className="mr-2" />使用邀請碼加入</Button></div></section>;
}

function WorkspaceLoading() {
  return <section className="grid gap-4 py-7 md:grid-cols-3"><div className="h-36 animate-pulse rounded-3xl bg-[#EFE4DF] md:col-span-2" /><div className="h-36 animate-pulse rounded-3xl bg-[#EFE4DF]" /><div className="h-72 animate-pulse rounded-3xl bg-[#F2EAE6] md:col-span-3" /></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Overview({ workspace, month, setMonth, selectedLedger, categoryById, memberById, onAdd }: { workspace: LedgerWorkspacePayload; month: string; setMonth: (month: string) => void; selectedLedger: LedgerRecord | undefined; categoryById: Map<number, CategoryRecord>; memberById: Map<number, MemberRecord["user"]>; onAdd: () => void }) {
  const [copied, setCopied] = useState(false);
  const settlement = workspace.settlement.settlement;
  const copyInvite = async () => {
    if (!selectedLedger?.inviteCode) return;
    try { await navigator.clipboard.writeText(selectedLedger.inviteCode); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { toast.error("目前無法複製，請手動記下邀請碼。"); }
  };
  return <div className="space-y-6"><section className="relative overflow-hidden rounded-[28px] bg-[#5B4142] p-6 text-white shadow-[0_18px_45px_rgba(91,65,66,0.16)] sm:p-8"><div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border-[25px] border-white/5" /><div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between"><div><p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-[#E8CBCD]"><Heart size={14} fill="currentColor" />{selectedLedger?.type === "couple" ? "情侶共同帳本" : "共享帳本"}</p><h2 className="mt-3 font-serif text-3xl">本月一起記下的日常</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#E4D3D0]">收支、成員與結算均來自目前帳本的真實資料。</p></div><div className="flex flex-wrap items-center gap-3"><label className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white"><span className="sr-only">選擇月份</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="bg-transparent text-white outline-none [color-scheme:dark]" /></label><Button type="button" onClick={onAdd} className="rounded-xl bg-white text-[#9B5867] hover:bg-[#FFF5F4]"><Plus size={16} className="mr-2" />新增收支</Button></div></div></section><section className="grid gap-4 sm:grid-cols-3"><MetricCard label="本月收入" value={money(workspace.analytics.income)} icon={BarChart3} color="green" /><MetricCard label="本月支出" value={money(workspace.analytics.expense)} icon={CreditCard} color="rose" /><MetricCard label="本月餘額" value={money(workspace.analytics.balance)} icon={WalletCards} color="plum" /></section><section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><div className="rounded-3xl border border-[#E8DDD8] bg-[#FFFDFC] p-5 shadow-[0_10px_28px_rgba(88,59,51,0.04)] sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-bold">最近收支</h3><p className="mt-1 text-xs text-[#9B857D]">{month.slice(0, 4)} 年 {Number(month.slice(5))} 月的交易</p></div><span className="rounded-full bg-[#F7EBE8] px-2.5 py-1 text-xs font-semibold text-[#9E5D68]">{workspace.calendarTransactions.length} 筆</span></div><div className="mt-5 divide-y divide-[#F1E7E2]">{workspace.calendarTransactions.length === 0 ? <div className="py-11 text-center text-sm text-[#9A847B]">這個月還沒有收支。從第一筆開始記錄吧。</div> : workspace.calendarTransactions.slice(0, 6).map(transaction => { const category = categoryById.get(transaction.categoryId); const payer = memberById.get(transaction.payerId); return <div key={transaction.id} className="flex items-center gap-3 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl text-base" style={{ color: category?.color ?? "#B56C78", backgroundColor: `${category?.color ?? "#B56C78"}18` }}>{category?.icon ?? "◌"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{transaction.note || category?.name || "未命名收支"}</p><p className="mt-0.5 text-xs text-[#9A847B]">{localDate(transaction.date)} · {payer?.name || "帳本成員"}</p></div><strong className={transaction.type === "income" ? "text-sm text-[#598267]" : "text-sm text-[#AD5D68]"}>{transaction.type === "income" ? "+" : "−"}{money(transaction.amount)}</strong></div>; })}</div></div><div className="space-y-5"><div className="rounded-3xl border border-[#E8DDD8] bg-[#FFFDFC] p-5 shadow-[0_10px_28px_rgba(88,59,51,0.04)]"><h3 className="font-bold">分類支出</h3><div className="mt-5 space-y-4">{workspace.analytics.categories.length === 0 ? <p className="text-sm text-[#9A847B]">尚無可分析的支出資料。</p> : workspace.analytics.categories.slice(0, 5).map(category => <div key={category.id}><div className="flex justify-between gap-3 text-sm"><span className="truncate">{category.name}</span><span className="font-semibold">{money(category.amount)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1E7E2]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (category.amount / Math.max(workspace.analytics.expense, 1)) * 100)}%`, backgroundColor: category.color }} /></div></div>)}</div></div><div className="rounded-3xl bg-[#F5EBE8] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.14em] text-[#A46972]">帳本邀請碼</p><p className="mt-2 font-mono text-2xl font-bold tracking-[0.18em] text-[#73514E]">{selectedLedger?.inviteCode || "—"}</p><p className="mt-2 text-xs leading-5 text-[#916F68]">分享給對方後，對方可從網頁版或 Android App 加入。</p></div><Button type="button" size="icon" variant="outline" onClick={() => void copyInvite()} className="rounded-xl border-[#E4C8C1] bg-white/80 text-[#A2616C] hover:bg-white">{copied ? <Check size={16} /> : <Clipboard size={16} />}<span className="sr-only">複製邀請碼</span></Button></div>{settlement && <div className="mt-5 border-t border-[#E5CCC5] pt-4 text-sm text-[#765952]">待結算：{memberById.get(settlement.fromUserId)?.name || "成員"} 應支付 {money(settlement.amount)} 給 {memberById.get(settlement.toUserId)?.name || "成員"}</div>}</div></div></section></div>;
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof BarChart3; color: "green" | "rose" | "plum" }) {
  const palette = { green: "bg-[#EEF5F0] text-[#63816B]", rose: "bg-[#FAEEEE] text-[#AD6170]", plum: "bg-[#F4EDF4] text-[#805F7A]" }[color];
  return <article className="rounded-3xl border border-[#E8DDD8] bg-[#FFFDFC] p-5 shadow-[0_10px_28px_rgba(88,59,51,0.04)]"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette}`}><Icon size={18} /></span><p className="mt-5 text-sm text-[#947E75]">{label}</p><strong className="mt-1 block text-2xl tracking-tight">{value}</strong></article>;
}

function Records({ workspace, categoryById, paymentById, memberById }: { workspace: LedgerWorkspacePayload; categoryById: Map<number, CategoryRecord>; paymentById: Map<number, PaymentMethodRecord>; memberById: Map<number, MemberRecord["user"]> }) {
  return <section className="rounded-3xl border border-[#E8DDD8] bg-[#FFFDFC] p-5 shadow-[0_10px_28px_rgba(88,59,51,0.04)] sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">所有收支紀錄</h2><p className="mt-1 text-sm text-[#937D74]">最多顯示最近 200 筆真實帳本交易。</p></div><span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F7EBE8] px-3 py-1 text-xs font-semibold text-[#9E5D68]"><CalendarDays size={13} />{workspace.transactions.length} 筆</span></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-[#EEE3DD] text-xs tracking-wide text-[#9A837A]"><tr><th className="px-3 py-3 font-semibold">日期／項目</th><th className="px-3 py-3 font-semibold">分類</th><th className="px-3 py-3 font-semibold">付款人</th><th className="px-3 py-3 font-semibold">支付方式</th><th className="px-3 py-3 text-right font-semibold">金額</th></tr></thead><tbody>{workspace.transactions.length === 0 ? <tr><td colSpan={5} className="px-3 py-14 text-center text-[#9B857C]">還沒有收支紀錄。</td></tr> : workspace.transactions.map(transaction => { const category = categoryById.get(transaction.categoryId); const member = memberById.get(transaction.payerId); const payment = paymentById.get(transaction.paymentMethodId); return <tr key={transaction.id} className="border-b border-[#F3EBE7] last:border-none"><td className="px-3 py-4"><p className="font-semibold text-[#4D3A35]">{transaction.note || category?.name || "未命名收支"}</p><p className="mt-1 text-xs text-[#A18A81]">{localDate(transaction.date)} · {transaction.type === "income" ? "收入" : transaction.type === "transfer" ? "轉帳" : "支出"}</p></td><td className="px-3 py-4"><span className="inline-flex items-center gap-1.5 text-[#746058]"><span style={{ color: category?.color }}>{category?.icon ?? "◌"}</span>{category?.name ?? "未分類"}</span></td><td className="px-3 py-4 text-[#746058]">{member?.name || "帳本成員"}</td><td className="px-3 py-4 text-[#746058]">{payment ? `${payment.icon} ${payment.name}` : "未指定"}</td><td className={transaction.type === "income" ? "px-3 py-4 text-right font-bold text-[#5D856A]" : "px-3 py-4 text-right font-bold text-[#AA5F6A]"}>{transaction.type === "income" ? "+" : "−"}{money(transaction.amount)}</td></tr>; })}</tbody></table></div></section>;
}
