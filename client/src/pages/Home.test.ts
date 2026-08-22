import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(fileURLToPath(new URL("./Home.tsx", import.meta.url)), "utf8");
const globalStyles = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");

describe("Together Ledger 網頁產品入口", () => {
  it("同步顯示 Android App 版本、更新歷程與跨裝置使用引導", () => {
    expect(homePage).toContain("1.3.10");
    expect(homePage).toContain("Android 與 Web 同步更新 · v1.3.10");
    expect(homePage).toContain('{ version: "1.3.10", date: "最新版本"');
    expect(homePage).toContain("診斷偏好修復與讀取體驗優化");
    expect(homePage).toContain("SSE 即時同步與擴充帳本圖示");
    expect(homePage).toContain("可重連 SSE 事件流");
    expect(homePage).toContain("更新歷程");
    expect(homePage).toContain("iOS");
    expect(homePage).toContain("Android");
    expect(homePage).toContain("github.com/ben880320-boop/together-ledger/releases/latest");
    expect(homePage).toContain("ReleaseFooter");
    expect(homePage).toContain('setLocation("/login")');
  });

  it("以近期摘要收斂更新歷程，並保留完整歷程與官方資源入口", () => {
    expect(homePage).toContain("只顯示最新的兩次改善");
    expect(homePage).toContain("查看完整更新歷程");
    expect(homePage).toContain('aria-label="完整更新歷程"');
    expect(homePage).toContain("GitHub 專案首頁");
    expect(homePage).toContain("使用說明 Wiki");
    expect(homePage).toContain("github.com/ben880320-boop/together-ledger/wiki");
    expect(homePage).toContain("一起記，彼此都看得到");
    expect(homePage).toContain("手機、電腦都能接續");
  });

  it("提供實際使用情境與可存取的跨平台同步、離線與隱私 FAQ", () => {
    expect(homePage).toContain("實際使用情境");
    expect(homePage).toContain("一筆晚餐，當下就算清楚");
    expect(homePage).toContain("先訂範圍，再一起看進度");
    expect(homePage).toContain("手機隨手記，電腦安心對帳");
    expect(homePage).toContain('aria-labelledby="homepage-faq"');
    expect(homePage).toContain("Android、網頁與 PWA 如何同步同一份帳本？");
    expect(homePage).toContain("可重連 SSE 事件流");
    expect(homePage).toContain("網路不穩或暫時離線時，資料會怎麼辦？");
    expect(homePage).toContain("最近一次可用的本機快照");
    expect(homePage).toContain("誰能看到共同帳本的收支資料？");
    expect(homePage).toContain("協助改善 App");
    expect(homePage).toContain("<details");
    expect(homePage).toContain("group-open:rotate-180");
  });

  it("為首頁 CTA、介紹卡片與 FAQ 提供鍵盤焦點與減少動態效果保護", () => {
    expect(homePage).toContain("landing-interactive-card");
    expect(homePage).toContain("motion-reduce:transition-none");
    expect(homePage).toContain("focus-visible:ring-2");
    expect(globalStyles).toContain(".web-public-landing :is(header button, main button, main a[href], main summary, main article)");
    expect(globalStyles).toContain("prefers-reduced-motion: reduce");
    expect(globalStyles).toContain(".web-public-landing main article:hover");
  });

  it("正式環境不會因登入狀態切換到舊版靜態模擬帳本", () => {
    expect(homePage).toContain("正式網域一律使用新版產品入口");
    expect(homePage).toContain("import.meta.env.DEV");
    expect(homePage).toContain("legacyWorkspacePreview");
    expect(homePage).toContain("return <LoginLanding onLogin={() => setLocation(\"/login\")} />;");
  });
});
