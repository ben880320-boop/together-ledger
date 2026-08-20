import { RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

declare const __WEB_BUILD_TIMESTAMP__: number;

export const WEB_RELEASE_VERSION = "1.3.3";
export const WEB_BUILD_TIMESTAMP = typeof __WEB_BUILD_TIMESTAMP__ === "number" ? __WEB_BUILD_TIMESTAMP__ : Date.now();

export function formatTaipeiTimestamp(timestamp: number) {
  return `${new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp))}（台北時間）`;
}

export function buildLatestVersionUrl(currentHref: string, refreshAt: number) {
  const url = new URL(currentHref);
  url.searchParams.set("refresh", refreshAt.toString());
  return url.toString();
}

export async function reloadLatestVersion() {
  try {
    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName)));
    }
  } catch {
    // Cache Storage may be unavailable in private browsing. The URL revision
    // below still causes the document to be requested again.
  }

  const latestUrl = buildLatestVersionUrl(window.location.href, Date.now());
  // assign() retains the current browser history entry and works reliably in
  // embedded/iOS browsers, where replace() can occasionally resolve to blank.
  window.location.assign(latestUrl);
}

export function ReleaseFooter({ compact = false }: { compact?: boolean }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <footer className={compact ? "mt-8 border-t border-border pt-5" : "mt-12 border-t border-border bg-card/55"}>
      <div className={compact ? "flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between" : "mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-7 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8"}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-semibold text-foreground">共帳 Together Ledger</span>
          <span>網頁版 v{WEB_RELEASE_VERSION}</span>
          <span className="hidden text-muted-foreground/60 sm:inline">•</span>
          <span>本次發布：{formatTaipeiTimestamp(WEB_BUILD_TIMESTAMP)}</span>
          <span className="hidden text-muted-foreground/60 sm:inline">•</span>
          <span>建置已驗證</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[var(--scene-income)]"><ShieldCheck size={14} />版本資訊已同步</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRefreshing}
            onClick={() => {
              setIsRefreshing(true);
              void reloadLatestVersion();
            }}
            className="h-8 rounded-lg border-border bg-card/80 px-3 text-xs font-semibold text-primary hover:bg-accent"
          >
            <RefreshCw size={14} className={isRefreshing ? "mr-1.5 animate-spin" : "mr-1.5"} />
            {isRefreshing ? "正在取得最新版" : "重新載入最新版本"}
          </Button>
        </div>
      </div>
    </footer>
  );
}
