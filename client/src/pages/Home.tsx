import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarClock,
  Car,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  CreditCard,
  Download,
  Gift,
  Github,
  HandCoins,
  Heart,
  History,
  Home as HomeIcon,
  LayoutDashboard,
  Landmark,
  Menu,
  MoreHorizontal,
  PieChart,
  Plus,
  Receipt,
  Repeat2,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Utensils,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReleaseFooter } from "@/components/ReleaseFooter";
import { PwaInstallPanel } from "@/components/PwaInstallPanel";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";

const money = (value: number) => `NT$ ${Math.round(value).toLocaleString("zh-TW")}`;
const shortMoney = (value: number) => `NT$${Math.round(value).toLocaleString("zh-TW")}`;

const categoryMeta = {
  飲食: { icon: Utensils, color: "#D47762", tint: "#FCEBE6" },
  交通: { icon: Car, color: "#6387A8", tint: "#E8F1F8" },
  生活: { icon: HomeIcon, color: "#7E8D70", tint: "#EDF3E9" },
  購物: { icon: ShoppingBag, color: "#B88C5E", tint: "#FBF2E5" },
  情侶: { icon: Gift, color: "#BE7181", tint: "#F9EAF0" },
} as const;

type CategoryName = keyof typeof categoryMeta;
type Member = "小辰" | "安安";
type SplitMode = "equal" | "custom" | "amount";
type NavKey = "overview" | "calendar" | "analysis" | "planning" | "settings";

type Transaction = {
  id: number;
  title: string;
  amount: number;
  type: "expense" | "income";
  category: CategoryName;
  date: string;
  payer: Member;
  method: string;
  note: string;
  splitMode: SplitMode;
  shares: Record<Member, number>;
};

type Recurring = {
  id: number;
  title: string;
  amount: number;
  type: "expense" | "income";
  category: CategoryName;
  day: number;
  frequency: string;
};

type Budget = { name: string; amount: number; spent: number; color: string };

const initialTransactions: Transaction[] = [
  { id: 1, title: "鼎泰豐晚餐", amount: 1280, type: "expense", category: "飲食", date: "2026-08-16", payer: "小辰", method: "信用卡", note: "週末約會", splitMode: "equal", shares: { 小辰: 640, 安安: 640 } },
  { id: 2, title: "Netflix", amount: 390, type: "expense", category: "生活", date: "2026-08-15", payer: "安安", method: "街口支付", note: "共同訂閱", splitMode: "equal", shares: { 小辰: 195, 安安: 195 } },
  { id: 3, title: "精品咖啡", amount: 180, type: "expense", category: "飲食", date: "2026-08-14", payer: "小辰", method: "Apple Pay", note: "上班前的咖啡", splitMode: "equal", shares: { 小辰: 90, 安安: 90 } },
  { id: 4, title: "八月房租", amount: 24000, type: "expense", category: "生活", date: "2026-08-01", payer: "安安", method: "銀行轉帳", note: "共同居住", splitMode: "equal", shares: { 小辰: 12000, 安安: 12000 } },
  { id: 5, title: "高鐵來回票", amount: 3200, type: "expense", category: "交通", date: "2026-08-07", payer: "小辰", method: "信用卡", note: "台南小旅行", splitMode: "custom", shares: { 小辰: 1600, 安安: 1600 } },
  { id: 6, title: "八月薪資", amount: 45000, type: "income", category: "生活", date: "2026-08-05", payer: "小辰", method: "銀行轉帳", note: "固定收入", splitMode: "equal", shares: { 小辰: 45000, 安安: 0 } },
  { id: 7, title: "接案收入", amount: 12000, type: "income", category: "生活", date: "2026-08-12", payer: "安安", method: "銀行轉帳", note: "設計案尾款", splitMode: "equal", shares: { 小辰: 0, 安安: 12000 } },
  { id: 8, title: "生活用品採買", amount: 1680, type: "expense", category: "購物", date: "2026-08-10", payer: "安安", method: "信用卡", note: "洗衣精與日用品", splitMode: "equal", shares: { 小辰: 840, 安安: 840 } },
];

const initialBudgets: Budget[] = [
  { name: "本月總預算", amount: 30000, spent: 27730, color: "#B56C78" },
  { name: "飲食", amount: 8000, spent: 6420, color: "#D47762" },
  { name: "交通", amount: 5000, spent: 3200, color: "#6387A8" },
  { name: "生活", amount: 15000, spent: 15390, color: "#7E8D70" },
];

const initialRecurring: Recurring[] = [
  { id: 1, title: "房租", amount: 24000, type: "expense", category: "生活", day: 1, frequency: "每月" },
  { id: 2, title: "Netflix", amount: 390, type: "expense", category: "情侶", day: 15, frequency: "每月" },
  { id: 3, title: "薪資", amount: 45000, type: "income", category: "生活", day: 5, frequency: "每月" },
];

const navItems: { key: NavKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "總覽", icon: LayoutDashboard },
  { key: "calendar", label: "月曆", icon: CalendarDays },
  { key: "analysis", label: "分析", icon: BarChart3 },
  { key: "planning", label: "規劃", icon: Wallet },
  { key: "settings", label: "設定", icon: Settings2 },
];

function CategoryIcon({ category, size = 18 }: { category: CategoryName; size?: number }) {
  const Icon = categoryMeta[category].icon;
  return <Icon size={size} strokeWidth={1.8} />;
}

function ProgressBar({ value, total, color = "#B56C78" }: { value: number; total: number; color?: string }) {
  const percent = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1E9E4]">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: color }} />
    </div>
  );
}

function DonutChart({ values }: { values: { value: number; color: string }[] }) {
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const segments = values.map(item => {
    const start = cursor;
    cursor += (item.value / total) * 360;
    return `${item.color} ${start}deg ${cursor}deg`;
  });
  return <div className="relative h-40 w-40 rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }}><div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-[#FFFCF9]"><span className="text-[11px] text-[#9B8C86]">本月支出</span><strong className="mt-1 text-lg font-semibold text-[#3A2F2B]">31,850</strong></div></div>;
}

/**
 * 正式網域一律使用新版產品入口。
 *
 * 先前此檔案會依登入狀態切到下方的舊版靜態模擬帳本；因此已登入的
 * 使用者會誤以為網站回退到舊版本。該畫面不含真實帳本資料，不能作為
 * 正式網站入口。若需比對舊版視覺，僅允許在本機開發環境以
 * `?legacyWorkspacePreview=1` 開啟。
 */
export default function Home() {
  const [, setLocation] = useLocation();
  const allowLegacyWorkspacePreview =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("legacyWorkspacePreview") === "1";

  if (!allowLegacyWorkspacePreview) {
    return <LoginLanding onLogin={() => setLocation("/login")} />;
  }

  return <LegacyWorkspacePreview />;
}

function LegacyWorkspacePreview() {
  const { user, loading } = useAuth();
  const [activeNav, setActiveNav] = useState<NavKey>("overview");
  const [transactions, setTransactions] = useState(initialTransactions);
  const [budgets, setBudgets] = useState(initialBudgets);
  const [recurring, setRecurring] = useState(initialRecurring);
  const [customCategories, setCustomCategories] = useState<string[]>(["約會", "旅行"]);
  const [settled, setSettled] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [hasLedger, setHasLedger] = useState(false);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [month, setMonth] = useState("2026-08");
  const [budgetEdit, setBudgetEdit] = useState<number | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newRecurringTitle, setNewRecurringTitle] = useState("");
  const [newRecurringAmount, setNewRecurringAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", type: "expense" as "expense" | "income", category: "飲食" as CategoryName, date: "2026-08-16", payer: "小辰" as Member, method: "信用卡", note: "", splitMode: "equal" as SplitMode, customP: "50", customA: "50", amountA: "" });

  const currentMonthTransactions = useMemo(() => transactions.filter(item => item.date.startsWith(month)), [transactions, month]);
  const expenses = useMemo(() => currentMonthTransactions.filter(item => item.type === "expense"), [currentMonthTransactions]);
  const incomes = useMemo(() => currentMonthTransactions.filter(item => item.type === "income"), [currentMonthTransactions]);
  const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = incomes.reduce((sum, item) => sum + item.amount, 0);
  const balance = totalIncome - totalExpense;
  const categoryTotals = useMemo(() => Object.keys(categoryMeta).map(name => ({ name: name as CategoryName, value: expenses.filter(item => item.category === name).reduce((sum, item) => sum + item.amount, 0) })).filter(item => item.value > 0), [expenses]);
  const netBalance = useMemo(() => {
    const result: Record<Member, number> = { 小辰: 0, 安安: 0 };
    expenses.forEach(item => {
      result[item.payer] += item.amount;
      result.小辰 -= item.shares.小辰;
      result.安安 -= item.shares.安安;
    });
    return result;
  }, [expenses]);
  const owingMember: Member = netBalance.小辰 >= 0 ? "安安" : "小辰";
  const receivingMember: Member = netBalance.小辰 >= 0 ? "小辰" : "安安";
  const settlementAmount = Math.abs(netBalance.小辰);

  const resetForm = () => setForm({ title: "", amount: "", type: "expense", category: "飲食", date: "2026-08-16", payer: "小辰", method: "信用卡", note: "", splitMode: "equal", customP: "50", customA: "50", amountA: "" });
  const addTransaction = () => {
    const amount = Number(form.amount);
    if (!form.title.trim() || !amount || amount <= 0) return;
    const shares: Record<Member, number> = form.type === "income" ? { 小辰: form.payer === "小辰" ? amount : 0, 安安: form.payer === "安安" ? amount : 0 } : form.splitMode === "equal" ? { 小辰: Math.round(amount / 2), 安安: amount - Math.round(amount / 2) } : form.splitMode === "custom" ? { 小辰: Math.round(amount * (Number(form.customP) / 100)), 安安: amount - Math.round(amount * (Number(form.customP) / 100)) } : { 小辰: Math.min(amount, Math.max(0, Number(form.amountA))), 安安: Math.max(0, amount - Math.min(amount, Math.max(0, Number(form.amountA)))) };
    setTransactions(prev => [{ id: Date.now(), title: form.title, amount, type: form.type, category: form.category, date: form.date, payer: form.payer, method: form.method, note: form.note, splitMode: form.splitMode, shares }, ...prev]);
    setShowAdd(false);
    resetForm();
  };
  const addRecurring = () => {
    if (!newRecurringTitle.trim() || !Number(newRecurringAmount)) return;
    setRecurring(prev => [...prev, { id: Date.now(), title: newRecurringTitle.trim(), amount: Number(newRecurringAmount), type: "expense", category: "生活", day: 1, frequency: "每月" }]);
    setNewRecurringTitle(""); setNewRecurringAmount(""); setShowAddRecurring(false);
  };
  const copyInvite = async () => { try { await navigator.clipboard.writeText("A7K29X"); } catch { /* clipboard may be unavailable in preview */ } setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const changeMonth = (delta: number) => { const [year, m] = month.split("-").map(Number); const next = new Date(year, m - 1 + delta, 1); setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); };

  if (loading) return <LoginLanding onLogin={() => startLogin()} />;
  if (!user) return <LoginLanding onLogin={() => startLogin()} />;
  if (!hasLedger) return <EmptyLedgerLanding onCreate={() => setHasLedger(true)} onJoin={() => setHasLedger(true)} />;

  return (
    <div className="min-h-screen bg-[#FBF7F3] text-[#3A2F2B]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-[#EEE1DA] bg-[#FFFCF9] px-5 py-6 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F6E5E5] text-[#B56C78]"><Heart size={21} fill="currentColor" strokeWidth={1.5} /></div>
            <div><div className="font-serif text-[22px] tracking-[0.02em] text-[#483833]">共帳</div><div className="text-[10px] tracking-[0.22em] text-[#B69E94]">TOGETHER LEDGER</div></div>
          </div>
          <div className="relative mt-10">
            <button onClick={() => setShowLedgerMenu(prev => !prev)} className="flex w-full items-center gap-3 rounded-2xl border border-[#F0E5DF] bg-[#FBF6F2] p-3 text-left transition hover:border-[#DDBBB6]">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EED9D9] text-[#A65D6E]"><Heart size={16} fill="currentColor" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">小辰 & 安安</div><div className="mt-0.5 text-[11px] text-[#A8948B]">情侶共同帳本</div></div><ChevronDown size={15} className="text-[#B39C93]" />
            </button>
            {showLedgerMenu && <div className="absolute left-0 right-0 top-[76px] z-30 rounded-2xl border border-[#F0E5DF] bg-white p-2 shadow-[0_18px_45px_rgba(77,51,42,0.12)]"><button className="flex w-full items-center gap-3 rounded-xl bg-[#FBF0EF] p-3 text-left"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EED9D9] text-[#A65D6E]"><Heart size={14} fill="currentColor" /></span><span className="flex-1 text-sm font-medium">小辰 & 安安</span><Check size={15} className="text-[#B56C78]" /></button><button onClick={() => setShowInvite(true)} className="mt-1 flex w-full items-center gap-3 rounded-xl p-3 text-left text-xs text-[#9C8880] hover:bg-[#FBF7F3]"><Users size={15} /> 管理成員與邀請</button></div>}
          </div>
          <div className="mt-10 flex-1"><div className="mb-3 px-3 text-[10px] font-semibold tracking-[0.2em] text-[#B9A69E]">工作區</div><nav className="space-y-1.5">{navItems.map(item => { const Icon = item.icon; const active = activeNav === item.key; return <button key={item.key} onClick={() => setActiveNav(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? "bg-[#F6E6E6] font-semibold text-[#A65D6E]" : "text-[#8F7C74] hover:bg-[#FBF5F1] hover:text-[#5E4B44]"}`}><Icon size={17} strokeWidth={active ? 2 : 1.7} /><span>{item.label}</span>{item.key === "planning" && <span className="ml-auto rounded-full bg-[#F5D7D5] px-2 py-0.5 text-[10px] text-[#B56C78]">2</span>}</button>; })}</nav></div>
          <div className="rounded-2xl border border-[#F0E3DC] bg-[#FBF5F1] p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#76645D]">八月預算</span><span className="text-[11px] text-[#B56C78]">92%</span></div><div className="mt-3"><ProgressBar value={27730} total={30000} /></div><div className="mt-2 flex items-baseline justify-between"><span className="text-lg font-semibold text-[#4C3933]">{shortMoney(27730)}</span><span className="text-[11px] text-[#AA978F]">/ {shortMoney(30000)}</span></div></div>
          <div className="mt-5 flex items-center gap-3 border-t border-[#F0E3DC] pt-5"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D7E3E9] text-xs font-semibold text-[#536B77]">{user?.name?.slice(0, 1) || "小"}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{user?.name || "小辰"}</div><div className="truncate text-[10px] text-[#A8948B]">{user?.email || "預覽帳本模式"}</div></div><MoreHorizontal size={16} className="text-[#B8A49B]" /></div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-[#EFE2DB]/80 bg-[#FBF7F3]/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10"><div className="mx-auto flex max-w-[1400px] items-center justify-between"><div className="flex items-center gap-3"><button aria-label="開啟選單" onClick={() => setShowMobileMenu(true)} className="rounded-xl p-2 text-[#8E7A72] transition hover:bg-white active:scale-95 lg:hidden"><Menu size={20} /></button><div className="lg:hidden"><div className="font-serif text-xl">共帳</div></div><div className="hidden lg:block"><div className="text-[11px] tracking-[0.17em] text-[#B39D94]">2026 年 8 月 · 共同財務</div><h1 className="mt-1 font-serif text-2xl text-[#42332F]">{activeNav === "overview" ? "早安，小辰" : navItems.find(item => item.key === activeNav)?.label}</h1></div></div><div className="flex items-center gap-2"><button onClick={() => setShowNotifications(prev => !prev)} className="relative rounded-xl p-2.5 text-[#937E75] transition hover:bg-white"><Bell size={18} strokeWidth={1.7} />{!settled && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#C46A79]" />}</button><button onClick={() => setShowInvite(true)} className="hidden items-center gap-2 rounded-xl border border-[#EAD9D1] bg-white px-3 py-2 text-xs font-medium text-[#715D55] shadow-sm transition hover:border-[#D6B7B0] sm:flex"><Users size={15} /> 邀請成員</button><Button onClick={() => setShowAdd(true)} className="h-10 rounded-xl bg-[#B56C78] px-4 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(181,108,120,0.18)] hover:bg-[#A55D6A]"><Plus size={16} className="mr-1.5" /> 新增記錄</Button></div></div></header>
          {showMobileMenu && <div className="fixed inset-0 z-50 flex lg:hidden"><button aria-label="關閉選單" onClick={() => setShowMobileMenu(false)} className="flex-1 bg-[#3A2F2B]/25" /><aside className="w-[280px] bg-[#FFFCF9] p-5 shadow-2xl"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6E5E5] text-[#B56C78]"><Heart size={17} fill="currentColor" /></div><span className="font-serif text-xl text-[#483833]">共帳</span></div><button aria-label="關閉選單" onClick={() => setShowMobileMenu(false)} className="rounded-lg p-2 text-[#8E7A72] hover:bg-[#FBF5F1]"><X size={18} /></button></div><div className="mt-8 space-y-1.5">{navItems.map(item => { const Icon = item.icon; const active = activeNav === item.key; return <button key={item.key} onClick={() => { setActiveNav(item.key); setShowMobileMenu(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${active ? "bg-[#F6E6E6] font-semibold text-[#A65D6E]" : "text-[#8F7C74] hover:bg-[#FBF5F1]"}`}><Icon size={17} /><span>{item.label}</span></button>; })}</div></aside></div>}
          {showNotifications && <div className="absolute right-5 top-[76px] z-30 w-[300px] rounded-2xl border border-[#EFE2DB] bg-white p-4 shadow-[0_18px_50px_rgba(77,51,42,0.14)] sm:right-8"><div className="flex items-center justify-between"><span className="text-sm font-semibold">通知</span><button onClick={() => setShowNotifications(false)}><X size={15} className="text-[#A08D84]" /></button></div><div className="mt-4 rounded-xl bg-[#FFF7EC] p-3 text-xs text-[#977257]"><CircleAlert size={16} className="mb-2 text-[#C48B50]" /><b>生活預算已接近上限</b><p className="mt-1 leading-relaxed text-[#A78368]">本月生活類別已使用 103%，記得一起檢視支出。</p></div>{!settled && <div className="mt-2 rounded-xl bg-[#FBF0F2] p-3 text-xs text-[#9E6570]"><HandCoins size={16} className="mb-2" /><b>還有一筆待結算</b><p className="mt-1 leading-relaxed text-[#A4757D]">安安應支付給小辰 {money(settlementAmount)}。</p></div>}</div>}

          <div className="mx-auto max-w-[1400px] px-5 py-7 pb-28 sm:px-8 lg:px-10 lg:py-9 lg:pb-10">
            {activeNav === "overview" && <OverviewPage totalIncome={totalIncome} totalExpense={totalExpense} balance={balance} expenses={expenses} categoryTotals={categoryTotals} netBalance={netBalance} owingMember={owingMember} receivingMember={receivingMember} settlementAmount={settlementAmount} settled={settled} onSettle={() => setSettled(true)} onAdd={() => setShowAdd(true)} onInvite={() => setShowInvite(true)} onNav={setActiveNav} />}
            {activeNav === "calendar" && <CalendarPage month={month} transactions={currentMonthTransactions} onMonth={changeMonth} />}
            {activeNav === "analysis" && <AnalysisPage month={month} expenses={expenses} totalExpense={totalExpense} categoryTotals={categoryTotals} />}
            {activeNav === "planning" && <PlanningPage budgets={budgets} setBudgets={setBudgets} recurring={recurring} setRecurring={setRecurring} showAddRecurring={showAddRecurring} setShowAddRecurring={setShowAddRecurring} title={newRecurringTitle} setTitle={setNewRecurringTitle} amount={newRecurringAmount} setAmount={setNewRecurringAmount} onAdd={addRecurring} budgetEdit={budgetEdit} setBudgetEdit={setBudgetEdit} />}
            {activeNav === "settings" && <SettingsPage categories={[...Object.keys(categoryMeta), ...customCategories]} customCategories={customCategories} newCategory={newCategory} setNewCategory={setNewCategory} onAddCategory={() => { if (newCategory.trim()) { setCustomCategories(prev => [...prev, newCategory.trim()]); setNewCategory(""); } }} onInvite={() => setShowInvite(true)} />}
          </div>
        </main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#EDE0D9] bg-[#FFFCF9]/95 px-2 py-2 backdrop-blur-xl lg:hidden"><div className="mx-auto flex max-w-lg items-center justify-around">{navItems.map(item => { const Icon = item.icon; const active = activeNav === item.key; return <button key={item.key} onClick={() => setActiveNav(item.key)} className={`flex min-w-[54px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] ${active ? "font-semibold text-[#B56C78]" : "text-[#A4938B]"}`}><Icon size={19} strokeWidth={active ? 2.1 : 1.7} /><span>{item.label}</span></button>; })}<button onClick={() => setShowAdd(true)} className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B56C78] text-white shadow-[0_8px_22px_rgba(181,108,120,0.32)]"><Plus size={22} /></button></div></nav>

      {showAdd && <AddTransactionModal form={form} setForm={setForm} onClose={() => { setShowAdd(false); resetForm(); }} onSubmit={addTransaction} />}
      {showInvite && <InviteModal copied={copied} onCopy={copyInvite} onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function LoginLanding({ onLogin }: { onLogin: () => void }) {
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const updates = [
    { version: "1.3.10", date: "最新版本", title: "診斷偏好修復與讀取體驗優化", detail: "修正首次開啟「協助改善 App」時可能無法儲存的競態問題；帳本讀取會合併重複請求，載入骨架改為低干擾動畫並尊重減少動態效果設定。" },
    { version: "1.3.8", date: "歷史版本", title: "分類與支付方式圖示選擇器修正", detail: "Android、Web 與 PWA 的新增／編輯分類與支付方式現可固定選擇「不使用圖示」，並可展開以中文關鍵字搜尋完整圖示庫。" },
    { version: "1.3.7", date: "歷史版本", title: "帳本圖示選擇器全面改善", detail: "Android、Web 與 PWA 現將「無圖示」固定顯示，並可用中文關鍵字搜尋完整圖示庫；Android APK 升級後即可直接使用。" },
    { version: "1.3.6", date: "歷史版本", title: "帳本載入、圖示與版本歷程修復", detail: "Android 暫時載入失敗會安全重試並保留離線快照；三端的無圖示、緊湊圖示選擇器、Wiki 入口及版本專屬更新內容已同步修正。" },
    { version: "1.3.5", date: "前一版", title: "SSE 即時同步與擴充帳本圖示", detail: "Android App、網頁與 PWA 透過可重連 SSE 事件流更快同步帳本異動；建立與帳本設定可選擇 70 個生活情境圖示或無圖示。" },
    { version: "1.3.4", date: "前一版", title: "P0 體驗改善與更新診斷", detail: "網頁與 PWA 新增草稿安全更新與同步狀態中心；Android 補強官方來源、SHA-256 校驗、安裝診斷，以及全表單鍵盤安全處理。" },
    { version: "1.3.1", date: "前一版", title: "儲蓄目標達標慶祝與草稿保護", detail: "儲蓄目標達標時可慶祝、封存或重新顯示；背景同步不會再清除任何開啟中表單的未提交輸入。" },
    { version: "1.3.0", date: "前一版", title: "跨平台儲蓄桶與正式轉存", detail: "可建立不限數量的儲蓄目標、設定扣款支付方式、日期與優先順序；每月分配會保留完整歷程，且自動轉存不納入消費分析。" },
    { version: "1.2.9.2", date: "前一版", title: "通知暫停與草稿保護", detail: "通知、預算門檻提醒與投遞診斷已暫時停用；網頁新增收支時，背景同步不會再清除未提交的輸入內容。" },
    { version: "1.2.9.1", date: "前一版", title: "帳本圖示與即時更新", detail: "帳本圖示可於建立及設定時調整；新增、編輯與刪除收支會即時同步。" },
    { version: "1.2.9", date: "前一版", title: "帳本圖示與通知可靠度", detail: "建立帳本可選擇圖示或無圖示；Android 登入後會重新註冊通知裝置，網頁總覽則聚焦近期收支、支付摘要與結算。" },
    { version: "1.2.8.8", date: "前一版", title: "載入體驗優化", detail: "登入與帳本切換加入主題同步骨架、平滑過渡與較低動態效果支援。" },
    { version: "1.2.8.6", date: "前一版", title: "續傳下載與設定重整", detail: "支援更新下載中斷後續傳，並重整個人設定的更新與下載專區。" },
    { version: "1.2.8.5", date: "前一版", title: "更新資訊與輸入體驗", detail: "改善鍵盤避讓、固定收支、分類管理及更新內容顯示。" },
  ];
  const latestUpdates = updates.slice(0, 2);
  const resourceLinks = [
    { label: "GitHub 專案首頁", detail: "查看原始碼、Release 與問題回報", href: "https://github.com/ben880320-boop/together-ledger", icon: Github, tone: "bg-[#F9F2EF] text-[#A35F6D]" },
    { label: "使用說明 Wiki", detail: "認識帳本、分攤、同步與常見問題", href: "https://github.com/ben880320-boop/together-ledger/wiki", icon: BookOpen, tone: "bg-[#EEF5F0] text-[#668575]" },
  ];
  const featureCards = [
    { icon: Users, title: "一起記，彼此都看得到", detail: "建立共同帳本、邀請另一半加入；新增、編輯與刪除都會同步更新。", tone: "bg-[#FBEFEE] text-[#B56C78]" },
    { icon: HandCoins, title: "分攤清楚，結算簡單", detail: "支援平均、自訂與不分攤；所有金額以整數分運算，妥善處理餘數。", tone: "bg-[#F8F1E7] text-[#B38657]" },
    { icon: Smartphone, title: "手機、電腦都能接續", detail: "Android 隨手記錄；Web/PWA 適合大螢幕查看收支、預算與分析。", tone: "bg-[#EEF5F0] text-[#668575]" },
  ];
  const usageScenarios = [
    {
      icon: Receipt,
      step: "晚餐分攤",
      title: "一筆晚餐，當下就算清楚",
      detail: "小辰先付 NT$1,280，選擇平均分攤；系統將兩人的金額與待結算餘額一起整理。",
      tone: "bg-[#FBEFEE] text-[#B56C78]",
      preview: <><span>週末晚餐</span><strong>NT$ 1,280</strong><div className="mt-3 flex items-center justify-between text-xs text-[#8A756D]"><span>平均分攤</span><span>各 NT$ 640</span></div></>,
    },
    {
      icon: Wallet,
      step: "每月規劃",
      title: "先訂範圍，再一起看進度",
      detail: "把生活、飲食與旅行預算放進同一個帳本；月底回看支出比例，也能持續累積儲蓄目標。",
      tone: "bg-[#F8F1E7] text-[#B38657]",
      preview: <><div className="flex items-center justify-between"><span>八月生活預算</span><strong>78%</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F1E5D8]"><div className="h-full w-[78%] rounded-full bg-[#C7905D]" /></div><div className="mt-3 text-xs text-[#8A756D]">已使用 NT$ 23,400／30,000</div></>,
    },
    {
      icon: Smartphone,
      step: "跨裝置接續",
      title: "手機隨手記，電腦安心對帳",
      detail: "一人在 Android 新增收支，另一人可於 Web 或加入主畫面的 PWA 接續查看、分析與調整。",
      tone: "bg-[#EEF5F0] text-[#668575]",
      preview: <><div className="flex items-center gap-2 text-[#5D8968]"><span className="h-2 w-2 rounded-full bg-[#6BA477]" />同步成功</div><div className="mt-3 flex items-center justify-between text-xs text-[#8A756D]"><span>Android 新增</span><ArrowDownRight size={15} /><span>Web 已更新</span></div></>,
    },
  ];
  const faqItems = [
    {
      question: "Android、網頁與 PWA 如何同步同一份帳本？",
      answer: "使用同一個帳號登入並加入同一帳本後，收支、分攤、預算與儲蓄目標會共用同一份資料。連線穩定時會使用可重連 SSE 事件流加速更新；若事件流暫時不可用，系統會以輪詢作為後備。",
    },
    {
      question: "網路不穩或暫時離線時，資料會怎麼辦？",
      answer: "Web/PWA 會保留最近一次可用的本機快照，讓你能先查看既有內容；連線恢復後會重新同步。開啟中的輸入草稿也有保護機制，背景同步不應直接清除尚未送出的文字。",
    },
    {
      question: "誰能看到共同帳本的收支資料？",
      answer: "只有帳本成員能存取該帳本資料。帳本權限會在伺服器端驗證，不是只靠前端隱藏按鈕；移除成員或退出帳本後，該帳號不再保有帳本存取權。",
    },
    {
      question: "「協助改善 App」會分享我的帳務內容嗎？",
      answer: "此診斷選項預設關閉，僅在你主動開啟時才協助回傳排查問題所需的技術資訊。你可以隨時在個人設定關閉它；診斷功能不會取代帳本權限與資料保護措施。",
    },
  ];
  return <div className="web-public-landing min-h-screen overflow-hidden bg-background text-foreground">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[650px] bg-[radial-gradient(circle_at_14%_4%,rgba(244,204,207,0.9),transparent_28%),radial-gradient(circle_at_86%_13%,rgba(209,225,216,0.94),transparent_30%),linear-gradient(145deg,#fffaf7_0%,#f6ede8_54%,#eff0ed_100%)]" />
    <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 md:px-8 lg:py-7">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#B56C78] text-white shadow-[0_12px_28px_rgba(181,108,120,0.28)]"><Heart size={21} fill="currentColor" /></div><div><div className="font-serif text-[22px] font-semibold tracking-[0.02em]">共帳</div><div className="text-[10px] tracking-[0.22em] text-[#9B817B]">TOGETHER LEDGER</div></div></div>
      <div className="flex items-center gap-2"><a href="https://github.com/ben880320-boop/together-ledger/wiki" target="_blank" rel="noreferrer" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-[#876F68] transition hover:bg-white/70 md:inline-flex">使用說明</a><Button onClick={onLogin} variant="outline" className="rounded-xl border-[#DDBBB6] bg-white/80 px-4 text-[#9E5C69] shadow-sm hover:bg-white">登入／註冊</Button></div>
    </header>
    <main className="relative mx-auto w-full max-w-7xl px-5 pb-16 md:px-8 lg:pb-24">
      <section className="grid items-center gap-8 py-8 lg:grid-cols-[1.06fr_0.94fr] lg:gap-16 lg:py-16">
        <div><div className="inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/75 px-3 py-1.5 text-xs font-semibold text-[#A35F6D] shadow-sm"><Sparkles size={14} /> Android 與 Web 同步更新 · v1.3.17</div><h1 className="mt-5 max-w-3xl font-serif text-[2.45rem] leading-[1.12] tracking-[-0.04em] text-[#3C2D2A] sm:text-5xl lg:text-6xl">和重要的人，<br /><span className="text-[#B56C78]">一起把生活記清楚。</span></h1><p className="mt-5 max-w-xl text-[15px] leading-7 text-[#78655F] sm:text-base sm:leading-8">共帳是為伴侶與親密關係設計的共享記帳工具。一起記錄收支、分攤費用、規劃預算與儲蓄目標；Android 適合隨手新增，Web/PWA 讓你在電腦與 iOS 上也能安心接續。</p><div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button onClick={onLogin} className="h-12 rounded-xl bg-[#B56C78] px-6 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(181,108,120,0.22)] hover:bg-[#A55D6A]"><LayoutDashboard size={17} className="mr-2" />開始使用網頁版</Button><Button onClick={() => window.open("https://github.com/ben880320-boop/together-ledger/releases/latest", "_blank", "noopener,noreferrer")} variant="outline" className="h-12 rounded-xl border-[#DDC8C1] bg-white/80 px-6 text-sm font-semibold text-[#87555F] hover:bg-white"><Download size={17} className="mr-2" />下載 Android App</Button></div><PwaInstallPanel variant="landing" /><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#8B766F]"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-[#668575]" />帳本權限與資料一致性驗證</span><span className="inline-flex items-center gap-1.5"><Check size={15} className="text-[#B56C78]" />無需先下載 App 也能使用</span></div></div>
        <div className="relative mx-auto w-full max-w-[470px]"><div className="absolute -inset-5 -z-10 rounded-[42px] bg-white/35 blur-2xl" /><div className="rounded-[30px] border border-white/85 bg-[#fffdfb]/95 p-4 shadow-[0_30px_70px_rgba(88,59,51,0.16)] backdrop-blur-sm sm:p-5"><div className="flex items-center justify-between border-b border-[#F0E6E1] pb-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F8E6E6] text-[#B56C78]"><Heart size={18} fill="currentColor" /></div><div><div className="text-sm font-bold">小辰 & 安安</div><div className="text-[11px] text-[#A28B84]">八月共同帳本</div></div></div><span className="rounded-full bg-[#EAF4EC] px-2.5 py-1 text-[10px] font-bold text-[#5D8968]">已同步</span></div><div className="mt-4 rounded-2xl bg-[linear-gradient(135deg,#B56C78,#D89094)] p-5 text-white"><div className="text-xs text-white/75">本月可用餘額</div><div className="mt-2 text-3xl font-semibold tracking-tight">NT$ 25,150</div><div className="mt-5 flex items-center justify-between text-xs"><span>收入 NT$ 57,000</span><span>支出 NT$ 31,850</span></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#F9F3EF] p-3.5"><CalendarClock size={18} className="text-[#B56C78]" /><div className="mt-3 text-xs text-[#A08981]">固定收支</div><div className="mt-1 text-lg font-bold">3 筆</div></div><div className="rounded-2xl bg-[#EEF5F0] p-3.5"><Sparkles size={18} className="text-[#669174]" /><div className="mt-3 text-xs text-[#879B8C]">跨平台同步</div><div className="mt-1 text-lg font-bold">即時更新</div></div></div></div><div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-xl border border-white/80 bg-white/65 p-2.5 text-center text-[11px] text-[#806E68]"><strong className="block text-sm text-[#4C3D37]">共同帳本</strong>一起管理</div><div className="rounded-xl border border-white/80 bg-white/65 p-2.5 text-center text-[11px] text-[#806E68]"><strong className="block text-sm text-[#4C3D37]">分攤結算</strong>清楚公平</div><div className="rounded-xl border border-white/80 bg-white/65 p-2.5 text-center text-[11px] text-[#806E68]"><strong className="block text-sm text-[#4C3D37]">預算規劃</strong>一起達標</div></div></div>
      </section>

      <section className="border-y border-[#EADFD9]/80 py-10 lg:py-12"><div className="max-w-2xl"><p className="text-xs font-bold tracking-[0.17em] text-[#B56C78]">為一起生活而設計</p><h2 className="mt-3 font-serif text-3xl text-[#42322E] sm:text-4xl">不是只有記帳，而是讓每筆共同生活開支都有交代。</h2></div><div className="mt-7 grid gap-4 md:grid-cols-3">{featureCards.map(({ icon: Icon, title, detail, tone }) => <article key={title} className="rounded-3xl border border-[#EADFD9] bg-white/80 p-5 shadow-[0_12px_30px_rgba(89,61,51,0.045)]"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}><Icon size={19} /></div><h3 className="mt-5 text-lg font-bold text-[#4A3833]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#846F68]">{detail}</p></article>)}</div></section>

      <section className="grid gap-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-12"><div className="rounded-[28px] border border-[#EADFD9] bg-[#FFFDFC]/90 p-5 shadow-[0_14px_35px_rgba(89,61,51,0.05)] sm:p-7"><div className="flex items-center gap-2 text-[#A35F6D]"><Settings2 size={18} /><span className="text-sm font-bold">從第一筆到每一次同步，都有清楚的路徑</span></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#F9F4F1] p-4"><span className="text-xs font-bold text-[#B56C78]">01</span><h3 className="mt-3 font-bold">建立或加入帳本</h3><p className="mt-2 text-sm leading-6 text-[#8A756D]">用邀請碼讓兩人進入同一個共同帳本。</p></div><div className="rounded-2xl bg-[#F8F1E7] p-4"><span className="text-xs font-bold text-[#B38657]">02</span><h3 className="mt-3 font-bold">記錄與分攤</h3><p className="mt-2 text-sm leading-6 text-[#8A756D]">支援收支分類、付款方式與不同分攤方式。</p></div><div className="rounded-2xl bg-[#F4F7F5] p-4"><span className="text-xs font-bold text-[#668575]">03</span><h3 className="mt-3 font-bold">查看與規劃</h3><p className="mt-2 text-sm leading-6 text-[#718478]">從總覽、月曆、分析到預算與儲蓄目標。</p></div></div><div className="mt-5 flex flex-wrap gap-3"><Button onClick={onLogin} variant="outline" className="rounded-xl border-[#DDBBB6] bg-white text-[#87555F] hover:bg-[#FFF8F6]"><LayoutDashboard size={16} className="mr-2" />登入後開始</Button><a href="https://github.com/ben880320-boop/together-ledger/wiki" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-xl px-3 text-sm font-semibold text-[#76625B] hover:bg-[#F8F0EC]">先閱讀使用說明 <ArrowUpRight size={15} className="ml-1.5" /></a></div></div>
        <div className="rounded-[28px] border border-[#EADFD9] bg-[#FFFDFC]/90 p-5 shadow-[0_14px_35px_rgba(89,61,51,0.05)] sm:p-7"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[#A35F6D]"><History size={18} /><span className="text-sm font-bold">最近更新</span></div><h2 className="mt-3 text-xl font-bold text-[#42322E]">只顯示最新的兩次改善</h2><p className="mt-1 text-sm leading-6 text-[#8A756D]">完整版本內容會收在獨立視窗，不再拉長首頁。</p></div><span className="shrink-0 rounded-full bg-[#F8E6E6] px-3 py-1.5 text-xs font-bold text-[#A35F6D]">v1.3.10</span></div><div className="mt-5 space-y-3">{latestUpdates.map((item, index) => <div key={item.version} className="flex gap-3 rounded-2xl border border-[#F0E6E1] p-4"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F8E6E6] text-[#B56C78]"><Check size={15} strokeWidth={2.5} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-bold text-[#4A3833]">v{item.version}</span>{index === 0 && <span className="rounded-full bg-[#EAF4EC] px-2 py-0.5 text-[10px] font-bold text-[#5D8968]">安全摘要已更新</span>}</div><div className="mt-1 text-sm font-semibold text-[#6C514B]">{item.title}</div><p className="mt-1 text-sm leading-6 text-[#88736B]">{item.detail}</p></div></div>)}</div><button type="button" onClick={() => setShowAllUpdates(true)} className="mt-5 inline-flex items-center text-sm font-semibold text-[#A35F6D] transition hover:text-[#814754]">查看完整更新歷程 <ArrowUpRight size={16} className="ml-1.5" /></button></div>
      </section>

      <section className="grid gap-4 pb-2 sm:grid-cols-2">{resourceLinks.map(({ label, detail, href, icon: Icon, tone }) => <a key={label} href={href} target="_blank" rel="noreferrer" className="group flex items-center gap-4 rounded-3xl border border-[#EADFD9] bg-white/75 p-5 transition hover:-translate-y-0.5 hover:border-[#DDBBB6] hover:bg-white"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon size={20} /></span><span className="min-w-0 flex-1"><strong className="block text-base text-[#4A3833]">{label}</strong><span className="mt-1 block text-sm text-[#8A756D]">{detail}</span></span><ArrowUpRight size={18} className="text-[#B28B83] transition group-hover:text-[#A35F6D]" /></a>)}</section>
      <section aria-labelledby="real-usage-scenarios" className="py-12 lg:py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[0.17em] text-[#B56C78]">實際使用情境</p>
          <h2 id="real-usage-scenarios" className="mt-3 font-serif text-3xl text-[#42322E] sm:text-4xl">不是多一個表格，而是把一起生活的每一步接起來。</h2>
          <p className="mt-3 text-sm leading-7 text-[#846F68] sm:text-base">從當下記一筆、分攤金額，到月底一起回顧與規劃，兩人可以依自己的裝置與節奏接續使用。</p>
        </div>
        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {usageScenarios.map(({ icon: Icon, step, title, detail, tone, preview }) => <article key={step} className="landing-interactive-card rounded-3xl border border-[#EADFD9] bg-white/85 p-5 shadow-[0_12px_30px_rgba(89,61,51,0.045)] transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transform-none motion-reduce:transition-none">
            <div className="flex items-start justify-between gap-4"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><Icon size={20} /></div><span className="rounded-full bg-[#F8F1ED] px-3 py-1 text-[11px] font-bold text-[#9A736A]">{step}</span></div>
            <h3 className="mt-5 text-lg font-bold text-[#4A3833]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#846F68]">{detail}</p>
            <div className="mt-5 rounded-2xl border border-[#F0E4DE] bg-[#FCF8F5] p-3.5 text-sm font-medium text-[#5D4842]">{preview}</div>
          </article>)}
        </div>
      </section>

      <section aria-labelledby="homepage-faq" className="border-t border-[#EADFD9]/80 py-12 lg:py-16">
        <div className="grid gap-7 lg:grid-cols-[0.75fr_1.25fr] lg:gap-12">
          <div><p className="text-xs font-bold tracking-[0.17em] text-[#668575]">常見問題</p><h2 id="homepage-faq" className="mt-3 font-serif text-3xl text-[#42322E] sm:text-4xl">同步與隱私，先說清楚。</h2><p className="mt-3 max-w-md text-sm leading-7 text-[#846F68]">讓兩人都知道資料會如何更新、離線時能看見什麼，以及帳本權限如何保護共同生活的記錄。</p></div>
          <div className="space-y-3">{faqItems.map(({ question, answer }, index) => <details key={question} className="landing-faq-item group rounded-2xl border border-[#EADFD9] bg-white/80 shadow-[0_9px_24px_rgba(89,61,51,0.035)]">
            <summary className="landing-faq-summary flex list-none items-center gap-3 rounded-2xl px-4 py-4 text-left text-sm font-bold text-[#4A3833] outline-none transition-[background-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-[#B56C78] focus-visible:ring-offset-2 motion-reduce:transition-none sm:px-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F8E6E6] text-xs text-[#A35F6D]">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">{question}</span>
              <ChevronDown size={18} className="shrink-0 text-[#A8847C] transition-transform duration-200 group-open:rotate-180 motion-reduce:transform-none motion-reduce:transition-none" />
            </summary>
            <p className="px-4 pb-4 text-sm leading-7 text-[#846F68] sm:px-5 sm:pb-5">{answer}</p>
          </details>)}</div>
        </div>
      </section>
    </main>
    {showAllUpdates && <div role="dialog" aria-modal="true" aria-label="完整更新歷程" className="fixed inset-0 z-50 flex items-end bg-[#3C2D2A]/35 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-[30px] border border-white/80 bg-[#FFFDFC] shadow-[0_28px_80px_rgba(63,39,32,0.28)] sm:rounded-[30px]"><div className="flex items-center justify-between border-b border-[#F0E6E1] px-5 py-5 sm:px-7"><div><div className="flex items-center gap-2 text-[#A35F6D]"><History size={18} /><span className="text-sm font-bold">完整更新歷程</span></div><p className="mt-1 text-sm text-[#8A756D]">每個版本僅顯示對應的更新內容。</p></div><button type="button" aria-label="關閉完整更新歷程" onClick={() => setShowAllUpdates(false)} className="rounded-xl p-2 text-[#8A756D] transition hover:bg-[#F8F0EC] hover:text-[#5D4540]"><X size={20} /></button></div><div className="overflow-y-auto px-5 py-5 sm:px-7">{updates.map((item, index) => <div key={item.version} className="flex gap-3 border-b border-[#F0E6E1] py-4 first:pt-0 last:border-0 last:pb-0"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F8E6E6] text-[#B56C78]"><Check size={15} strokeWidth={2.5} /></div><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-[#4A3833]">v{item.version}</span><span className="text-xs text-[#A18A82]">{item.date}</span>{index === 0 && <span className="rounded-full bg-[#EAF4EC] px-2 py-0.5 text-[10px] font-bold text-[#5D8968]">最新版本</span>}</div><div className="mt-1 text-sm font-semibold text-[#6C514B]">{item.title}</div><p className="mt-1 text-sm leading-6 text-[#88736B]">{item.detail}</p></div></div>)}</div></div></div>}
    <ReleaseFooter />
  </div>;
}

function EmptyLedgerLanding({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return <div className="flex min-h-screen items-center justify-center bg-[#FBF7F3] px-5 py-10"><div className="w-full max-w-lg rounded-[28px] border border-[#EFE2DB] bg-[#FFFCF9] p-8 text-center shadow-[0_18px_50px_rgba(77,51,42,0.08)]"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F6E5E5] text-[#B56C78]"><Heart size={34} fill="currentColor" /></div><h1 className="mt-6 font-serif text-3xl text-[#3A2F2B]">目前還沒有帳本</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[#927E75]">建立一個新的共同帳本，或使用邀請碼加入伴侶、室友或家人的帳本。</p><div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center"><Button onClick={onCreate} className="h-11 rounded-xl bg-[#B56C78] px-5 text-sm font-semibold text-white hover:bg-[#A55D6A]"><Plus size={16} className="mr-2" />建立第一個帳本</Button><Button onClick={onJoin} variant="outline" className="h-11 rounded-xl border-[#E3C3C4] bg-white px-5 text-sm font-semibold text-[#B56C78]"><Users size={16} className="mr-2" />使用邀請碼加入</Button></div></div></div>;
}

function OverviewPage({ totalIncome, totalExpense, balance, expenses, categoryTotals, netBalance, owingMember, receivingMember, settlementAmount, settled, onSettle, onAdd, onInvite, onNav }: { totalIncome: number; totalExpense: number; balance: number; expenses: Transaction[]; categoryTotals: { name: CategoryName; value: number }[]; netBalance: Record<Member, number>; owingMember: Member; receivingMember: Member; settlementAmount: number; settled: boolean; onSettle: () => void; onAdd: () => void; onInvite: () => void; onNav: (key: NavKey) => void }) {
  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-[28px] bg-[#5C3F42] p-6 text-white shadow-[0_18px_45px_rgba(92,63,66,0.16)] sm:p-8"><div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[26px] border-white/5" /><div className="absolute -bottom-24 right-24 h-44 w-44 rounded-full border-[16px] border-white/5" /><div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end"><div><div className="flex items-center gap-2 text-[11px] tracking-[0.17em] text-[#E8C9CA]"><Heart size={14} fill="currentColor" /> 情侶共同帳本</div><h2 className="mt-4 font-serif text-[30px] leading-tight tracking-wide sm:text-[36px]">小辰 & 安安</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-[#E7D6D1]">一起記錄生活裡的每一份付出，讓共同財務變得更簡單、更透明。</p><button onClick={onInvite} className="mt-5 flex items-center gap-2 text-xs font-medium text-[#F4DADB] transition hover:text-white"><Users size={15} /> 2 位成員 · 管理帳本 <ArrowUpRight size={14} /></button></div><div className="md:min-w-[260px]"><div className="text-xs text-[#D6B6B5]">本月共同支出</div><div className="mt-1 text-[32px] font-semibold tracking-tight">{money(totalExpense)}</div><div className="mt-3 flex items-center gap-2 text-xs text-[#E4C3C2]"><TrendingUp size={14} /> 比上月少 8.4%</div></div></div></section>
    <section className="grid gap-4 sm:grid-cols-3"><StatCard label="本月收入" value={money(totalIncome)} sub="較上月 +12.5%" positive icon={<ArrowDownRight size={16} />} /><StatCard label="本月支出" value={money(totalExpense)} sub="較上月 -8.4%" positive icon={<ArrowUpRight size={16} />} /><StatCard label="本月結餘" value={money(balance)} sub="可用餘額" positive={balance >= 0} icon={<Sparkles size={16} />} /></section>
    <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-[24px] border border-[#EFE2DB] bg-white p-5 shadow-[0_8px_28px_rgba(83,53,44,0.04)] sm:p-6"><div className="flex items-center justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">SETTLEMENT</div><h3 className="mt-1 font-serif text-xl">目前結算</h3></div><span className={`rounded-full px-3 py-1 text-[11px] font-medium ${settled ? "bg-[#EDF3E9] text-[#6E8B67]" : "bg-[#FBF0F2] text-[#B56C78]"}`}>{settled ? "本月已結算" : "待結算"}</span></div><div className="mt-7 flex items-center justify-between gap-3"><MemberPill name="安安" tone="rose"/><div className="flex flex-1 flex-col items-center"><div className="flex w-full items-center gap-2"><div className="h-px flex-1 bg-[#EEDFDB]" /><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F9E8EA] text-[#B56C78]"><ArrowUpRight size={16} /></div><div className="h-px flex-1 bg-[#EEDFDB]" /></div><div className="mt-2 text-center text-xs text-[#A18B83]">應支付給 {receivingMember}</div><strong className="mt-1 block text-xl text-[#B56C78]">{settled ? money(0) : money(settlementAmount)}</strong></div><MemberPill name="小辰" tone="blue"/></div><div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-relaxed text-[#9D8980]">已將雙方本月代墊與應付金額自動合併計算。</p>{settled ? <div className="flex items-center gap-2 text-xs font-medium text-[#6E8B67]"><Check size={15} /> 8/16 已完成結算</div> : <Button onClick={onSettle} className="h-9 rounded-xl bg-[#B56C78] px-4 text-xs text-white hover:bg-[#A55D6A]">標記為已結算</Button>}</div></div>
      <div className="rounded-[24px] border border-[#EFE2DB] bg-white p-5 shadow-[0_8px_28px_rgba(83,53,44,0.04)] sm:p-6"><div className="flex items-start justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">SPENDING MIX</div><h3 className="mt-1 font-serif text-xl">支出分布</h3></div><button onClick={() => onNav("analysis")} className="text-xs font-medium text-[#B56C78]">查看分析 <ArrowUpRight size={13} className="inline" /></button></div><div className="mt-6 flex items-center gap-5"><DonutChart values={categoryTotals.map(item => ({ value: item.value, color: categoryMeta[item.name].color }))} /><div className="min-w-0 flex-1 space-y-3">{categoryTotals.slice(0, 4).map(item => <div key={item.name} className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 text-[#806D65]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryMeta[item.name].color }} />{item.name}</span><strong className="text-[#56433D]">{shortMoney(item.value)}</strong></div>)}</div></div></div>
    </section>
    <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]"><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-5 shadow-[0_8px_28px_rgba(83,53,44,0.04)] sm:p-6"><div className="flex items-center justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">RECENT ACTIVITY</div><h3 className="mt-1 font-serif text-xl">最近交易</h3></div><button onClick={() => onNav("calendar")} className="text-xs font-medium text-[#B56C78]">查看全部 <ArrowUpRight size={13} className="inline" /></button></div><div className="mt-4 divide-y divide-[#F3E9E3]">{expenses.slice(0, 4).map(item => <TransactionRow key={item.id} item={item} />)}</div><button onClick={onAdd} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#E9D8D1] py-3 text-xs font-medium text-[#B56C78] transition hover:bg-[#FFF7F6]"><Plus size={15} /> 新增一筆交易</button></div><div className="rounded-[24px] border border-[#EFE2DB] bg-[#FFF8F1] p-5 shadow-[0_8px_28px_rgba(83,53,44,0.04)] sm:p-6"><div className="flex items-center justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">MONTHLY BUDGET</div><h3 className="mt-1 font-serif text-xl">預算狀態</h3></div><button onClick={() => onNav("planning")} className="rounded-lg p-1.5 text-[#B68E72] hover:bg-white"><MoreHorizontal size={18} /></button></div><div className="mt-6"><div className="flex items-end justify-between"><span className="text-2xl font-semibold text-[#5B453B]">{shortMoney(27730)}</span><span className="text-xs text-[#B29B8D]">/ {shortMoney(30000)}</span></div><div className="mt-3"><ProgressBar value={27730} total={30000} color="#B56C78" /></div><div className="mt-3 flex items-center gap-2 text-xs text-[#AA7865]"><CircleAlert size={14} /> 還有 {shortMoney(2270)} 可使用</div></div><div className="mt-7 space-y-4"><BudgetMini name="飲食" value={6420} total={8000} color="#D47762"/><BudgetMini name="生活" value={15390} total={15000} color="#7E8D70" warning/></div></div></section>
  </div>;
}

function StatCard({ label, value, sub, positive, icon }: { label: string; value: string; sub: string; positive: boolean; icon: React.ReactNode }) { return <div className="rounded-[22px] border border-[#EFE2DB] bg-white p-5 shadow-[0_8px_25px_rgba(83,53,44,0.035)]"><div className="flex items-center justify-between"><span className="text-xs text-[#9C8980]">{label}</span><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${positive ? "bg-[#EDF3E9] text-[#75906D]" : "bg-[#FBEBE7] text-[#B56C78]"}`}>{icon}</span></div><div className="mt-3 text-xl font-semibold tracking-tight text-[#4A3731]">{value}</div><div className={`mt-2 text-[11px] ${positive ? "text-[#78916F]" : "text-[#B56C78]"}`}>{sub}</div></div>; }
function MemberPill({ name, tone }: { name: string; tone: "rose" | "blue" }) { return <div className="flex shrink-0 flex-col items-center gap-2"><div className={`flex h-12 w-12 items-center justify-center rounded-full border-4 border-white text-sm font-semibold shadow-sm ${tone === "rose" ? "bg-[#F3DADB] text-[#A9626D]" : "bg-[#D9E7EF] text-[#5A7585]"}`}>{name.slice(0, 1)}</div><span className="text-xs font-medium text-[#67544D]">{name}</span></div>; }
function TransactionRow({ item }: { item: Transaction }) { return <div className="flex items-center gap-3 py-3.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: categoryMeta[item.category].tint, color: categoryMeta[item.category].color }}><CategoryIcon category={item.category} size={17} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-[#5A4640]">{item.title}</div><div className="mt-1 text-[11px] text-[#A8948B]">{item.date.slice(5).replace("-", "/")} · {item.payer} 付款 · {item.method}</div></div><div className="text-right"><div className={`text-sm font-semibold ${item.type === "income" ? "text-[#78916F]" : "text-[#5A4640]"}`}>{item.type === "income" ? "+" : "-"}{shortMoney(item.amount)}</div><div className="mt-1 text-[10px] text-[#B09B92]">{item.category}</div></div></div>; }
function BudgetMini({ name, value, total, color, warning = false }: { name: string; value: number; total: number; color: string; warning?: boolean }) { return <div><div className="mb-2 flex items-center justify-between text-xs"><span className="text-[#806D65]">{name}</span><span className={warning ? "text-[#B56C78]" : "text-[#9A877F]"}>{shortMoney(value)} / {shortMoney(total)}</span></div><ProgressBar value={value} total={total} color={warning ? "#C36F79" : color} /></div>; }

function CalendarPage({ month, transactions, onMonth }: { month: string; transactions: Transaction[]; onMonth: (delta: number) => void }) { const [year, monthNumber] = month.split("-").map(Number); const days = new Date(year, monthNumber, 0).getDate(); const firstDay = new Date(year, monthNumber - 1, 1).getDay(); const cells = Array.from({ length: firstDay + days }, (_, index) => index < firstDay ? null : index - firstDay + 1); const byDay = new Map<number, Transaction[]>(); transactions.forEach(item => { const day = Number(item.date.slice(-2)); byDay.set(day, [...(byDay.get(day) || []), item]); }); const monthLabel = `${year} 年 ${monthNumber} 月`; return <div className="space-y-6"><SectionHeader eyebrow="CALENDAR" title="收支月曆" description="點選日期，快速掌握每一天的生活節奏與支出。" actions={<div className="flex items-center gap-1 rounded-xl border border-[#EADBD4] bg-white p-1"><button onClick={() => onMonth(-1)} className="rounded-lg px-2.5 py-1.5 text-[#967E75] hover:bg-[#FBF3EE]">‹</button><span className="min-w-[112px] text-center text-xs font-medium text-[#6C5750]">{monthLabel}</span><button onClick={() => onMonth(1)} className="rounded-lg px-2.5 py-1.5 text-[#967E75] hover:bg-[#FBF3EE]">›</button></div>} /><div className="grid gap-5 xl:grid-cols-[1fr_320px]"><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-4 shadow-[0_8px_28px_rgba(83,53,44,0.04)] sm:p-6"><div className="grid grid-cols-7 border-b border-[#F1E6E0] pb-3 text-center text-[11px] text-[#B19D94]"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div className="mt-2 grid grid-cols-7">{cells.map((day, index) => { const dayItems = day ? byDay.get(day) || [] : []; const expense = dayItems.filter(item => item.type === "expense").reduce((sum, item) => sum + item.amount, 0); const income = dayItems.filter(item => item.type === "income").reduce((sum, item) => sum + item.amount, 0); return <div key={`${day}-${index}`} className={`min-h-[86px] border-b border-r border-[#F5ECE7] p-2 text-left sm:min-h-[112px] ${!day ? "bg-[#FEFBF9]" : "hover:bg-[#FFFAF7]"}`}><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${day === 16 ? "bg-[#B56C78] font-semibold text-white" : "text-[#826E66]"}`}>{day || ""}</span>{day && <div className="mt-2 space-y-1">{income > 0 && <div className="truncate text-[10px] text-[#78916F]">+ {shortMoney(income)}</div>}{expense > 0 && <div className="truncate text-[10px] text-[#B56C78]">- {shortMoney(expense)}</div>}{dayItems.slice(0, 2).map(item => <div key={item.id} className="hidden truncate text-[10px] text-[#9F8C84] sm:block">{item.title}</div>)}</div>}</div>; })}</div></div><div className="rounded-[24px] border border-[#EFE2DB] bg-[#FFF8F1] p-5 sm:p-6"><div className="flex items-center gap-2"><CalendarDays size={17} className="text-[#B56C78]" /><h3 className="font-serif text-xl">八月摘要</h3></div><div className="mt-5 space-y-4"><div className="rounded-2xl bg-white/80 p-4"><div className="text-[11px] text-[#A28D83]">最高支出日</div><div className="mt-1 text-lg font-semibold text-[#5A453D]">8 月 1 日</div><div className="mt-1 text-xs text-[#B56C78]">房租 · {shortMoney(24000)}</div></div><div className="rounded-2xl bg-white/80 p-4"><div className="text-[11px] text-[#A28D83]">本月記錄</div><div className="mt-1 text-lg font-semibold text-[#5A453D]">{transactions.length} 筆</div><div className="mt-1 text-xs text-[#78916F]">平均每日 {shortMoney(transactions.length ? transactions.reduce((sum, item) => sum + item.amount, 0) / 16 : 0)}</div></div></div><div className="mt-6 text-xs leading-relaxed text-[#A1877A]">以月曆方式檢視收支，能更容易發現週末、固定扣款或特別活動帶來的支出變化。</div></div></div></div>; }

function AnalysisPage({ month, expenses, totalExpense, categoryTotals }: { month: string; expenses: Transaction[]; totalExpense: number; categoryTotals: { name: CategoryName; value: number }[] }) { const sorted = [...categoryTotals].sort((a, b) => b.value - a.value); return <div className="space-y-6"><SectionHeader eyebrow="ANALYTICS" title="財務分析" description="從分類與趨勢看見你們共同生活的財務輪廓。" actions={<button className="flex items-center gap-2 rounded-xl border border-[#EADBD4] bg-white px-3 py-2 text-xs text-[#79655D] hover:border-[#D5B8AF]"><Download size={14} /> 匯出報表</button>} /><div className="grid gap-4 sm:grid-cols-3"><StatCard label="八月總支出" value={money(totalExpense)} sub="共 6 筆支出" positive icon={<Receipt size={16} />} /><StatCard label="平均每日支出" value={money(totalExpense / 16)} sub="比上月低 8.4%" positive icon={<TrendingUp size={16} />} /><StatCard label="最大支出類別" value={sorted[0]?.name || "—"} sub={sorted[0] ? shortMoney(sorted[0].value) : "尚無資料"} positive icon={<PieChart size={16} />} /></div><div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]"><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-6 shadow-[0_8px_28px_rgba(83,53,44,0.04)]"><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">CATEGORY BREAKDOWN</div><h3 className="mt-1 font-serif text-xl">分類支出</h3><div className="mt-7 flex justify-center"><DonutChart values={categoryTotals.map(item => ({ value: item.value, color: categoryMeta[item.name].color }))} /></div><div className="mt-7 space-y-4">{sorted.map(item => <div key={item.name}><div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-[#79665D]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryMeta[item.name].color }} />{item.name}</span><span className="font-semibold text-[#55413A]">{shortMoney(item.value)} <em className="ml-1 not-italic text-[10px] font-normal text-[#AF9A91]">{Math.round((item.value / (totalExpense || 1)) * 100)}%</em></span></div><ProgressBar value={item.value} total={totalExpense} color={categoryMeta[item.name].color} /></div>)}</div></div><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-6 shadow-[0_8px_28px_rgba(83,53,44,0.04)]"><div className="flex items-start justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">MONTHLY TREND</div><h3 className="mt-1 font-serif text-xl">支出趨勢比較</h3></div><div className="flex items-center gap-3 text-[10px] text-[#A28D84]"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#E8C4C6]" />上月</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#B56C78]" />本月</span></div></div><div className="mt-8 flex h-[240px] items-end gap-5 border-b border-l border-[#F1E7E1] px-4 pb-0 pt-5 sm:gap-8">{["飲食", "交通", "生活", "購物", "情侶"].map((name, index) => { const current = categoryTotals.find(item => item.name === name)?.value || 0; const previous = [6200, 4200, 12500, 5600, 3200][index]; return <div key={name} className="flex h-full flex-1 items-end justify-center gap-1.5"><div className="w-3 rounded-t-md bg-[#E8C4C6] sm:w-5" style={{ height: `${Math.max(7, (previous / 16000) * 100)}%` }} /><div className="w-3 rounded-t-md bg-[#B56C78] sm:w-5" style={{ height: `${Math.max(7, (current / 16000) * 100)}%` }} /></div>; })}</div><div className="mt-3 flex gap-5 px-3 sm:gap-8">{["飲食", "交通", "生活", "購物", "情侶"].map(name => <span key={name} className="flex-1 text-center text-[10px] text-[#A18D85]">{name}</span>)}</div><div className="mt-7 rounded-2xl bg-[#FBF2EF] p-4 text-xs leading-relaxed text-[#95746D]">本月飲食支出比上月增加 <strong className="text-[#B56C78]">37%</strong>，生活類別則略高於預算。建議一起檢視固定支出與週末消費。</div></div></div></div>; }

function PlanningPage({ budgets, setBudgets, recurring, setRecurring, showAddRecurring, setShowAddRecurring, title, setTitle, amount, setAmount, onAdd, budgetEdit, setBudgetEdit }: { budgets: Budget[]; setBudgets: React.Dispatch<React.SetStateAction<Budget[]>>; recurring: Recurring[]; setRecurring: React.Dispatch<React.SetStateAction<Recurring[]>>; showAddRecurring: boolean; setShowAddRecurring: (value: boolean) => void; title: string; setTitle: (value: string) => void; amount: string; setAmount: (value: string) => void; onAdd: () => void; budgetEdit: number | null; setBudgetEdit: (value: number | null) => void }) { return <div className="space-y-6"><SectionHeader eyebrow="PLANNING" title="預算與固定收支" description="提前安排每月節奏，讓共同生活多一點餘裕。" actions={<button onClick={() => setShowAddRecurring(true)} className="flex items-center gap-2 rounded-xl bg-[#B56C78] px-3 py-2 text-xs font-medium text-white hover:bg-[#A55D6A]"><Plus size={14} /> 新增固定收支</button>} /><div className="grid gap-5 xl:grid-cols-[1fr_1fr]"><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-6 shadow-[0_8px_28px_rgba(83,53,44,0.04)]"><div className="flex items-start justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">BUDGETS</div><h3 className="mt-1 font-serif text-xl">八月預算</h3></div><span className="rounded-full bg-[#F9E7E7] px-3 py-1 text-[11px] text-[#B56C78]">{shortMoney(budgets[0].amount - budgets[0].spent)} 剩餘</span></div><div className="mt-6 space-y-6">{budgets.map((budget, index) => <div key={budget.name}><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-medium text-[#65514A]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: budget.color }} />{budget.name}</div>{budgetEdit === index ? <div className="flex items-center gap-1"><Input autoFocus value={budget.amount} onChange={event => setBudgets(prev => prev.map((item, i) => i === index ? { ...item, amount: Number(event.target.value) } : item))} onBlur={() => setBudgetEdit(null)} type="number" className="h-7 w-24 rounded-lg text-right text-xs" /><span className="text-[10px] text-[#A48F85]">元</span></div> : <button onClick={() => setBudgetEdit(index)} className="text-xs text-[#A28B82] hover:text-[#B56C78]">{shortMoney(budget.spent)} / {shortMoney(budget.amount)} · 編輯</button>}</div><ProgressBar value={budget.spent} total={budget.amount} color={budget.spent > budget.amount ? "#C46D78" : budget.color} />{budget.spent > budget.amount && <div className="mt-2 flex items-center gap-1 text-[11px] text-[#B56C78]"><CircleAlert size={13} /> 已超支 {shortMoney(budget.spent - budget.amount)}</div>}</div>)}</div></div><div className="rounded-[24px] border border-[#EFE2DB] bg-[#FFF8F1] p-6 shadow-[0_8px_28px_rgba(83,53,44,0.04)]"><div className="flex items-start justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">RECURRING</div><h3 className="mt-1 font-serif text-xl">固定收支</h3></div><Repeat2 size={20} className="text-[#B56C78]" /></div><div className="mt-5 space-y-2">{recurring.map(item => <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/80 p-3"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.type === "income" ? "bg-[#EAF1E6] text-[#78916F]" : "bg-[#F9E7E7] text-[#B56C78]"}`}>{item.type === "income" ? <ArrowDownRight size={16} /> : <Repeat2 size={16} />}</div><div className="min-w-0 flex-1"><div className="text-sm font-medium text-[#5C4841]">{item.title}</div><div className="mt-1 text-[10px] text-[#A48E84]">每月 {item.day} 日 · {item.category}</div></div><div className={`text-sm font-semibold ${item.type === "income" ? "text-[#78916F]" : "text-[#65504A]"}`}>{item.type === "income" ? "+" : "-"}{shortMoney(item.amount)}</div><button onClick={() => setRecurring(prev => prev.filter(row => row.id !== item.id))} className="rounded-lg p-1.5 text-[#C4AAA0] hover:bg-[#FBEEEB] hover:text-[#B56C78]"><Trash2 size={14} /></button></div>)}</div>{showAddRecurring && <div className="mt-4 rounded-2xl border border-[#E8CEC9] bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label className="text-[11px] text-[#8D776E]">項目名稱</Label><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：水電費" className="mt-1.5 h-9 rounded-xl border-[#EADBD4] text-xs" /></div><div><Label className="text-[11px] text-[#8D776E]">每月金額</Label><Input value={amount} onChange={event => setAmount(event.target.value)} type="number" placeholder="0" className="mt-1.5 h-9 rounded-xl border-[#EADBD4] text-xs" /></div></div><div className="mt-3 flex justify-end gap-2"><button onClick={() => setShowAddRecurring(false)} className="rounded-lg px-3 py-2 text-xs text-[#9F8B82]">取消</button><button onClick={onAdd} className="rounded-lg bg-[#B56C78] px-3 py-2 text-xs font-medium text-white">加入固定支出</button></div></div>}<div className="mt-5 flex items-center gap-2 text-xs leading-relaxed text-[#A4887B]"><CalendarClock size={15} className="shrink-0 text-[#B98972]" />固定項目會在指定日期自動加入本月帳本。</div></div></div></div>; }

function SettingsPage({ categories, customCategories, newCategory, setNewCategory, onAddCategory, onInvite }: { categories: string[]; customCategories: string[]; newCategory: string; setNewCategory: (value: string) => void; onAddCategory: () => void; onInvite: () => void }) { const methods = [{ name: "現金", icon: <Wallet size={15} /> }, { name: "信用卡", icon: <CreditCard size={15} /> }, { name: "銀行轉帳", icon: <Landmark size={15} /> }]; return <div className="space-y-6"><SectionHeader eyebrow="SETTINGS" title="帳本設定" description="管理成員、分類與你們的共同帳本偏好。" /><div className="grid gap-5 xl:grid-cols-2"><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-6 shadow-[0_8px_28px_rgba(83,53,44,0.04)]"><div className="flex items-center justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">MEMBERS</div><h3 className="mt-1 font-serif text-xl">帳本成員</h3></div><button onClick={onInvite} className="flex items-center gap-1.5 rounded-lg bg-[#FBF0F0] px-3 py-2 text-xs font-medium text-[#B56C78]"><Users size={14} /> 邀請</button></div><div className="mt-5 space-y-3"><div className="flex items-center gap-3 rounded-2xl bg-[#FBF6F2] p-3"><MemberPill name="小辰" tone="blue" /><div className="-ml-2 min-w-0 flex-1"><div className="text-sm font-medium">小辰</div><div className="text-[11px] text-[#A28C83]">管理員 · 主要使用者</div></div><span className="rounded-full bg-[#EAF1E6] px-2.5 py-1 text-[10px] text-[#78916F]">已加入</span></div><div className="flex items-center gap-3 rounded-2xl bg-[#FBF6F2] p-3"><MemberPill name="安安" tone="rose" /><div className="-ml-2 min-w-0 flex-1"><div className="text-sm font-medium">安安</div><div className="text-[11px] text-[#A28C83]">管理員 · 共同帳本</div></div><span className="rounded-full bg-[#EAF1E6] px-2.5 py-1 text-[10px] text-[#78916F]">已加入</span></div></div></div><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-6 shadow-[0_8px_28px_rgba(83,53,44,0.04)]"><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">CATEGORIES</div><h3 className="mt-1 font-serif text-xl">分類系統</h3><div className="mt-5 flex flex-wrap gap-2">{categories.map((category, index) => <span key={`${category}-${index}`} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${customCategories.includes(category) ? "bg-[#F7E9EC] text-[#A76572]" : "bg-[#F8F2EE] text-[#806D65]"}`}><Tag size={12} />{category}</span>)}</div><div className="mt-6 flex gap-2"><Input value={newCategory} onChange={event => setNewCategory(event.target.value)} onKeyDown={event => event.key === "Enter" && onAddCategory()} placeholder="新增自訂子分類" className="h-10 rounded-xl border-[#EADBD4] text-xs" /><button onClick={onAddCategory} className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-[#B56C78] px-3 text-xs font-medium text-white"><Plus size={14} /> 新增</button></div></div><div className="rounded-[24px] border border-[#EFE2DB] bg-white p-6 shadow-[0_8px_28px_rgba(83,53,44,0.04)]"><div className="text-[11px] tracking-[0.16em] text-[#B19C94]">PAYMENT METHODS</div><h3 className="mt-1 font-serif text-xl">付款方式</h3><div className="mt-5 grid gap-2 sm:grid-cols-3">{methods.map(method => <div key={method.name} className="flex items-center gap-2 rounded-xl bg-[#FBF6F2] px-3 py-3 text-xs text-[#77635B]">{method.icon}{method.name}</div>)}</div><div className="mt-4 text-[11px] text-[#A28C83]">新增交易時可直接選擇付款方式。</div></div><div className="rounded-[24px] border border-[#EFE2DB] bg-[#5C3F42] p-6 text-white shadow-[0_8px_28px_rgba(83,53,44,0.08)]"><div className="flex items-start justify-between"><div><div className="text-[11px] tracking-[0.16em] text-[#E5C6C5]">PRIVACY FIRST</div><h3 className="mt-1 font-serif text-xl">共同帳本，清楚又安心</h3></div><Heart size={20} fill="currentColor" className="text-[#F1C8CA]" /></div><p className="mt-4 text-xs leading-relaxed text-[#E4D3D0]">每一筆記錄都會保留付款人、分攤方式與備註，讓兩個人對共同生活的每份付出都有一致的理解。</p><button onClick={onInvite} className="mt-5 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-[#F3DADA] hover:bg-white/15"><Copy size={14} /> 分享邀請碼</button></div></div></div>; }

function SectionHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) { return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="text-[11px] tracking-[0.18em] text-[#B19C94]">{eyebrow}</div><h1 className="mt-1 font-serif text-3xl text-[#42332F]">{title}</h1><p className="mt-2 text-sm text-[#9A877F]">{description}</p></div>{actions}</div>; }

function AddTransactionModal({ form, setForm, onClose, onSubmit }: { form: { title: string; amount: string; type: "expense" | "income"; category: CategoryName; date: string; payer: Member; method: string; note: string; splitMode: SplitMode; customP: string; customA: string; amountA: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onClose: () => void; onSubmit: () => void }) { const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value } as typeof form)); return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#392628]/30 p-0 backdrop-blur-sm sm:items-center sm:p-5"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-[#FFFCF9] p-6 shadow-2xl sm:rounded-[28px] sm:p-8"><div className="flex items-start justify-between"><div><div className="text-[11px] tracking-[0.18em] text-[#B19C94]">NEW RECORD</div><h2 className="mt-1 font-serif text-2xl">新增收支記錄</h2></div><button onClick={onClose} className="rounded-xl p-2 text-[#A18B82] hover:bg-[#F8EFEB]"><X size={18} /></button></div><div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-[#F7EEE9] p-1"><button onClick={() => set("type", "expense")} className={`rounded-lg py-2 text-xs font-medium ${form.type === "expense" ? "bg-white text-[#B56C78] shadow-sm" : "text-[#A18E85]"}`}>支出</button><button onClick={() => set("type", "income")} className={`rounded-lg py-2 text-xs font-medium ${form.type === "income" ? "bg-white text-[#78916F] shadow-sm" : "text-[#A18E85]"}`}>收入</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label className="text-xs text-[#806C63]">項目名稱</Label><Input autoFocus value={form.title} onChange={event => set("title", event.target.value)} placeholder="例如：晚餐、房租、薪資" className="mt-1.5 h-11 rounded-xl border-[#E9DAD3] bg-white text-sm" /></div><div><Label className="text-xs text-[#806C63]">金額</Label><div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#AA958C]">NT$</span><Input value={form.amount} onChange={event => set("amount", event.target.value)} type="number" placeholder="0" className="h-11 rounded-xl border-[#E9DAD3] pl-12 text-sm" /></div></div><div><Label className="text-xs text-[#806C63]">日期</Label><Input value={form.date} onChange={event => set("date", event.target.value)} type="date" className="mt-1.5 h-11 rounded-xl border-[#E9DAD3] text-sm" /></div><div><Label className="text-xs text-[#806C63]">分類</Label><select value={form.category} onChange={event => set("category", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#E9DAD3] bg-white px-3 text-sm text-[#67534B] outline-none focus:border-[#C98D95]">{Object.keys(categoryMeta).map(category => <option key={category}>{category}</option>)}</select></div><div><Label className="text-xs text-[#806C63]">付款方式</Label><select value={form.method} onChange={event => set("method", event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#E9DAD3] bg-white px-3 text-sm text-[#67534B] outline-none focus:border-[#C98D95]"><option>信用卡</option><option>現金</option><option>銀行轉帳</option><option>Apple Pay</option><option>街口支付</option></select></div><div><Label className="text-xs text-[#806C63]">付款人</Label><div className="mt-1.5 grid grid-cols-2 gap-2">{(["小辰", "安安"] as Member[]).map(member => <button key={member} onClick={() => set("payer", member)} className={`h-11 rounded-xl border text-sm transition ${form.payer === member ? "border-[#D4A0A5] bg-[#FBEEEF] font-medium text-[#A55D6A]" : "border-[#E9DAD3] bg-white text-[#8F7B72]"}`}>{member}</button>)}</div></div><div><Label className="text-xs text-[#806C63]">備註</Label><Input value={form.note} onChange={event => set("note", event.target.value)} placeholder="想留下一點說明嗎？" className="mt-1.5 h-11 rounded-xl border-[#E9DAD3] text-sm" /></div></div>{form.type === "expense" && <div className="mt-5 rounded-2xl border border-[#EBDDD6] bg-[#FFF8F4] p-4"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2 text-sm font-medium text-[#634D45]"><HandCoins size={16} className="text-[#B56C78]" /> 彈性分攤</div><div className="mt-1 text-[11px] text-[#A28C83]">系統會依照分攤結果自動計算結算金額</div></div><span className="rounded-full bg-[#F8E6E7] px-2.5 py-1 text-[10px] text-[#B56C78]">必填</span></div><div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-white p-1"><button onClick={() => set("splitMode", "equal")} className={`rounded-lg py-2 text-[11px] ${form.splitMode === "equal" ? "bg-[#F9E7E7] font-medium text-[#B56C78]" : "text-[#A38E85]"}`}>平均分攤</button><button onClick={() => set("splitMode", "custom")} className={`rounded-lg py-2 text-[11px] ${form.splitMode === "custom" ? "bg-[#F9E7E7] font-medium text-[#B56C78]" : "text-[#A38E85]"}`}>自訂比例</button><button onClick={() => set("splitMode", "amount")} className={`rounded-lg py-2 text-[11px] ${form.splitMode === "amount" ? "bg-[#F9E7E7] font-medium text-[#B56C78]" : "text-[#A38E85]"}`}>直接輸入</button></div>{form.splitMode === "equal" && <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-3 text-xs text-[#836F66]"><span>小辰 50%</span><span className="h-px flex-1 border-t border-dashed border-[#E0CFC8] mx-3" /><span>安安 50%</span></div>}{form.splitMode === "custom" && <div className="mt-3 grid grid-cols-2 gap-3"><div><Label className="text-[11px] text-[#957F75]">小辰比例</Label><div className="relative mt-1"><Input value={form.customP} onChange={event => set("customP", event.target.value)} type="number" className="h-9 rounded-lg pr-8 text-xs" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A69086]">%</span></div></div><div><Label className="text-[11px] text-[#957F75]">安安比例</Label><div className="mt-1 flex h-9 items-center rounded-lg bg-[#F8F0EC] px-3 text-xs text-[#806D64]">{100 - Number(form.customP || 0)}%</div></div></div>}{form.splitMode === "amount" && <div className="mt-3 grid grid-cols-2 gap-3"><div><Label className="text-[11px] text-[#957F75]">小辰應付</Label><Input value={form.amountA} onChange={event => set("amountA", event.target.value)} type="number" placeholder="0" className="mt-1 h-9 rounded-lg text-xs" /></div><div><Label className="text-[11px] text-[#957F75]">安安應付</Label><div className="mt-1 flex h-9 items-center rounded-lg bg-[#F8F0EC] px-3 text-xs text-[#806D64]">{Math.max(0, Number(form.amount || 0) - Number(form.amountA || 0)).toLocaleString()} 元</div></div></div>}</div>}<div className="mt-7 flex gap-3"><button onClick={onClose} className="h-11 flex-1 rounded-xl border border-[#E9DAD3] text-sm text-[#8A766E] hover:bg-[#FAF3EF]">取消</button><button onClick={onSubmit} className="h-11 flex-1 rounded-xl bg-[#B56C78] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(181,108,120,0.2)] hover:bg-[#A55D6A]">儲存記錄</button></div></div></div>; }

function InviteModal({ copied, onCopy, onClose }: { copied: boolean; onCopy: () => void; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#392628]/30 p-5 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[28px] bg-[#FFFCF9] p-7 text-center shadow-2xl"><button onClick={onClose} className="float-right rounded-xl p-2 text-[#A18B82] hover:bg-[#F8EFEB]"><X size={17} /></button><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6E5E5] text-[#B56C78]"><Heart size={24} fill="currentColor" /></div><h2 className="mt-5 font-serif text-2xl">邀請加入共帳</h2><p className="mt-2 text-xs leading-relaxed text-[#9A877F]">分享邀請碼，讓另一半一起記錄每一筆共同支出。</p><div className="mt-6 rounded-2xl border border-dashed border-[#D9B8B7] bg-[#FFF4F3] py-5"><div className="text-[10px] tracking-[0.2em] text-[#B99A95]">INVITE CODE</div><div className="mt-2 text-3xl font-semibold tracking-[0.18em] text-[#A95F6D]">A7K29X</div></div><button onClick={onCopy} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B56C78] text-sm font-medium text-white hover:bg-[#A55D6A]">{copied ? <><Check size={16} /> 已複製邀請碼</> : <><Copy size={16} /> 複製邀請碼</>}</button><div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-[#AD958B]"><Users size={13} /> 目前 2 位成員 · 情侶帳本</div></div></div>; }
