import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, MonitorSmartphone, RefreshCw, Share, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaInstallPanelProps = { variant?: "landing" | "settings" };

type PwaDraftSafety = {
  hasUnsavedChanges: boolean;
  context?: string;
};

let pwaDraftSafety: PwaDraftSafety = { hasUnsavedChanges: false };

/**
 * Form surfaces call this while a stable draft is open. The service worker is
 * then allowed to activate only after the user closes or submits that form.
 */
export function setPwaDraftSafety(next: PwaDraftSafety) {
  pwaDraftSafety = next;
}

const isIosBrowser = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

export function PwaRuntime() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let isReloading = false;
    let shouldReload = false;
    let announcedRegistration: ServiceWorkerRegistration | null = null;

    const requestSafeReload = (registration: ServiceWorkerRegistration) => {
      if (pwaDraftSafety.hasUnsavedChanges) {
        toast.warning("已保留新版，請先完成表單。", {
          description: `${pwaDraftSafety.context || "目前有未提交的輸入"}；關閉或儲存後再重新載入，避免草稿遺失。`,
          duration: 7_000,
        });
        return;
      }
      shouldReload = true;
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    };

    const announceUpdate = (registration: ServiceWorkerRegistration) => {
      if (!registration.waiting || !navigator.serviceWorker.controller || announcedRegistration === registration) return;
      announcedRegistration = registration;
      toast("新版共帳已準備完成。", {
        description: "沒有未提交表單時可立即更新；輸入中的內容會先受到保護。",
        duration: Infinity,
        action: {
          label: "安全重新載入",
          onClick: () => requestSafeReload(registration),
        },
      });
    };

    const onControllerChange = () => {
      if (!shouldReload || isReloading) return;
      isReloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .then(registration => {
        announceUpdate(registration);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") announceUpdate(registration);
          });
        });
      })
      .catch(error => console.warn("[PWA] Service Worker 註冊失敗", error));

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}

export function PwaInstallPanel({ variant = "settings" }: PwaInstallPanelProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIosBrowser());
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      toast.success("共帳已加入裝置主畫面。")
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === "accepted") toast.success("已送出主畫面安裝。")
      setInstallPrompt(null);
    } catch {
      toast.error("目前無法開啟安裝視窗，請稍後再試。")
    }
  };

  const landing = variant === "landing";
  return <aside aria-label="加入主畫面" className={`rounded-2xl border border-[var(--border)] bg-[color:var(--card)] text-[var(--card-foreground)] ${landing ? "mt-5 max-w-xl p-4" : "mt-5 p-4"}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)] text-[var(--primary)]"><MonitorSmartphone size={19} /></div>
        <div className="min-w-0"><h3 className="text-sm font-bold">{installed ? "已加入主畫面" : "加入主畫面使用"}</h3><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{installed ? "共帳會以獨立視窗開啟，介面與帳本資料會持續同步。" : "安裝後可從手機桌面直接開啟，並保留最近一次可用的帳本閱讀快照。"}</p></div>
      </div>
      {installed ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--scene-income)]"><CheckCircle2 size={16} />已安裝</span> : installPrompt ? <Button type="button" size="sm" onClick={() => void install()} className="shrink-0 bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"><Download size={15} className="mr-1.5" />加入主畫面</Button> : null}
    </div>
    {!installed && ios && <p className="mt-3 flex items-start gap-2 rounded-xl bg-[color:var(--muted)] px-3 py-2.5 text-xs leading-5 text-[var(--muted-foreground)]"><Share size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />請使用 Safari 開啟本站，點選「分享」，再選擇「加入主畫面」。</p>}
    {!installed && !ios && !installPrompt && <p className="mt-3 flex items-start gap-2 rounded-xl bg-[color:var(--muted)] px-3 py-2.5 text-xs leading-5 text-[var(--muted-foreground)]"><Smartphone size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />請由瀏覽器網址列或選單選擇「安裝應用程式」或「加入主畫面」。</p>}
    {landing && <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]"><RefreshCw size={13} />新版準備完成時，會提示你安全重新載入。</p>}
  </aside>;
}
