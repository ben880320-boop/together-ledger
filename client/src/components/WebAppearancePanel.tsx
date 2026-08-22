import { Button } from "@/components/ui/button";
import { PwaInstallPanel } from "@/components/PwaInstallPanel";
import { Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const RELEASE_HISTORY_URL = "https://api.github.com/repos/ben880320-boop/together-ledger/releases?per_page=20";
const SCENES = [
  ["rose", "玫瑰", "溫柔日常"], ["cherry", "櫻花", "花瓣與暖光"], ["graphite", "石墨", "俐落專注"],
  ["latte", "拿鐵", "柔和咖啡"], ["mint", "薄荷", "清新平衡"], ["ocean", "海洋", "深海波光"],
  ["sunset", "夕暮", "落日餘暉"], ["starry", "星空", "靜謐星點"], ["forest", "森林", "湖畔綠意"],
  ["meadow", "草原", "自然晴朗"], ["snow", "雪地", "澄澈冷光"], ["lavender", "薰衣草", "柔和紫霧"],
] as const;

type Release = { tag_name?: string; body?: string; published_at?: string };

function securitySummary(notes: string) {
  return /安全|security|漏洞|修補|修复|隱私|privacy|權限|permission|認證|authentication|加密/i.test(notes)
    ? "此版本的發行說明包含安全性、隱私或權限相關調整，建議儘快更新。"
    : "發行說明未標示專屬安全性修正；請僅使用官方 GitHub Release 取得 Android 更新檔。";
}

function applyAppearance(scene: string, mode: "system" | "light" | "dark") {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.scene = scene;
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("together-ledger-web-scene", scene);
  localStorage.setItem("together-ledger-color-mode", mode);
  window.dispatchEvent(new Event("together-ledger-appearance-change"));
}

export function WebAppearancePanel() {
  const [scene, setScene] = useState("rose");
  const [mode, setMode] = useState<"system" | "light" | "dark">("system");
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Release[] | null>(null);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    const savedScene = localStorage.getItem("together-ledger-web-scene") || "rose";
    const savedMode = (localStorage.getItem("together-ledger-color-mode") as "system" | "light" | "dark") || "system";
    setScene(savedScene); setMode(savedMode); applyAppearance(savedScene, savedMode);
  }, []);

  const changeScene = (next: string) => { setScene(next); applyAppearance(next, mode); toast.success("場景主題已套用。") };
  const changeMode = (next: "system" | "light" | "dark") => { setMode(next); applyAppearance(scene, next); toast.success("顯示模式已套用。") };
  const openHistory = async () => {
    setHistoryOpen(true); setHistoryError("");
    if (history) return;
    try {
      const response = await fetch(RELEASE_HISTORY_URL, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error("讀取失敗");
      const releases = await response.json();
      setHistory(Array.isArray(releases) ? releases : []);
    } catch { setHistoryError("暫時無法取得官方更新歷程，請確認網路後重試。"); setHistory([]); }
  };

  return <section className="mt-5 rounded-3xl border border-[var(--border)] bg-[color:var(--card)] p-5 text-[var(--card-foreground)] shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-bold"><Sparkles size={17} />場景主題與更新歷程</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">此裝置的外觀偏好不會影響共同帳本資料，Android 與網頁可各自選擇喜歡的場景。</p></div><Button type="button" variant="outline" onClick={() => void openHistory()} className="border-[var(--border)] text-[var(--card-foreground)]"><RefreshCw size={15} className="mr-1.5" />查看更新歷程</Button></div>
    <div className="mt-4 flex flex-wrap gap-2">{SCENES.map(([key, label, detail]) => <Button key={key} type="button" size="sm" variant={scene === key ? "default" : "outline"} onClick={() => changeScene(key)} className={scene === key ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--card-foreground)]"}>{label}<span className="ml-1 hidden text-[10px] opacity-75 sm:inline">{detail}</span></Button>)}</div>
    <div aria-label="顯示模式" className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">{(["system", "light", "dark"] as const).map(item => <Button key={item} type="button" size="sm" variant={mode === item ? "default" : "outline"} onClick={() => changeMode(item)} className={mode === item ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--card-foreground)]"}>{item === "system" ? "跟隨系統" : item === "light" ? "淺色模式" : "深色模式"}</Button>)}</div>
    <PwaInstallPanel />
    {isHistoryOpen && <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[color:var(--popover)] p-4 text-[var(--popover-foreground)]"><div className="flex items-center justify-between gap-3"><div><b>官方更新歷程</b><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">內容直接讀取 GitHub Releases，包含安全性摘要。</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setHistoryOpen(false)}>收合</Button></div>{history === null ? <div className="flex items-center gap-2 py-6 text-sm text-[var(--muted-foreground)]"><Loader2 size={16} className="animate-spin" />正在讀取更新歷程…</div> : historyError ? <p className="py-4 text-sm text-[var(--scene-expense)]">{historyError}</p> : <div className="mt-3 max-h-80 divide-y divide-[var(--border)] overflow-y-auto">{history.map((release, index) => { const notes = release.body?.trim() || "包含功能更新、錯誤修正與穩定性改善。"; return <article key={`${release.tag_name}-${index}`} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><b>v{release.tag_name?.replace(/^v/i, "") || "未標示版本"}</b><span className="text-xs text-[var(--muted-foreground)]">{release.published_at ? new Date(release.published_at).toLocaleDateString("zh-TW") : "日期未提供"}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--card-foreground)]">{notes.length > 420 ? `${notes.slice(0, 420)}…` : notes}</p><p className="mt-2 flex gap-1.5 text-xs leading-5 text-[var(--scene-income)]"><ShieldCheck size={14} className="mt-0.5 shrink-0" />{securitySummary(notes)}</p></article> })}</div>}</div>}
  </section>;
}

export { SCENES, securitySummary };
