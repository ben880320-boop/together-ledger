import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(fileURLToPath(new URL("./Home.tsx", import.meta.url)), "utf8");

describe("Together Ledger 網頁產品入口", () => {
  it("同步顯示 Android App 版本、更新歷程與跨裝置使用引導", () => {
    expect(homePage).toContain("1.3.0");
    expect(homePage).toContain("Android 與 Web 同步更新 · v1.3.0");
    expect(homePage).toContain(">v1.3.0</span>");
    expect(homePage).toContain("更新歷程");
    expect(homePage).toContain("iOS");
    expect(homePage).toContain("Android");
    expect(homePage).toContain("github.com/ben880320-boop/together-ledger/releases/latest");
    expect(homePage).toContain("ReleaseFooter");
    expect(homePage).toContain('setLocation("/login")');
  });

  it("正式環境不會因登入狀態切換到舊版靜態模擬帳本", () => {
    expect(homePage).toContain("正式網域一律使用新版產品入口");
    expect(homePage).toContain("import.meta.env.DEV");
    expect(homePage).toContain("legacyWorkspacePreview");
    expect(homePage).toContain("return <LoginLanding onLogin={() => setLocation(\"/login\")} />;");
  });
});
