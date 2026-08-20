import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(new URL("./PwaInstallPanel.tsx", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../../public/service-worker.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
const appearanceSource = readFileSync(new URL("./WebAppearancePanel.tsx", import.meta.url), "utf8");

describe("PWA 安裝與離線體驗", () => {
  it("提供符合主畫面安裝需求的 manifest 與 Apple 中繼資料", () => {
    expect(manifest).toContain('"display": "standalone"');
    expect(manifest).toContain('"start_url": "/?source=pwa"');
    expect(manifest).toContain("together-ledger-icon-512");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('rel="apple-touch-icon"');
  });

  it("只快取公開 App Shell 與靜態資產，絕不快取帳本 API 回應", () => {
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('request.mode === "navigate"');
    expect(serviceWorker).toContain("networkFirst(request)");
    expect(serviceWorker).toContain("cacheFirst(request)");
    expect(serviceWorker).toContain("clients.claim()");
  });

  it("只在使用者選擇重新載入後套用新版，首次安裝不會強制刷新", () => {
    expect(panelSource).toContain("let shouldReload = false");
    expect(panelSource).toContain("shouldReload = true");
    expect(panelSource).toContain("if (!shouldReload || isReloading) return");
    expect(panelSource).toContain('postMessage({ type: "SKIP_WAITING" })');
  });

  it("在公開首頁與個人設定提供同一套安裝入口及 Safari 指引", () => {
    expect(homeSource).toContain('<PwaInstallPanel variant="landing" />');
    expect(appearanceSource).toContain("<PwaInstallPanel />");
    expect(panelSource).toContain("beforeinstallprompt");
    expect(panelSource).toContain("請使用 Safari 開啟本站");
    expect(panelSource).toContain("加入主畫面");
  });
});
