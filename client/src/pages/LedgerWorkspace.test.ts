import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(fileURLToPath(new URL("./LedgerWorkspace.tsx", import.meta.url)), "utf8");
const auth = readFileSync(fileURLToPath(new URL("./WebAuth.tsx", import.meta.url)), "utf8");
const footer = readFileSync(fileURLToPath(new URL("../components/ReleaseFooter.tsx", import.meta.url)), "utf8");

describe("Together Ledger 真實網頁帳本入口", () => {
  it("使用既有的真實帳本 tRPC 讀寫流程，不使用靜態模擬交易資料", () => {
    expect(workspace).toContain("trpc.ledger.list.useQuery");
    expect(workspace).toContain("trpc.ledger.workspace.useQuery");
    expect(workspace).toContain("trpc.ledger.create.useMutation");
    expect(workspace).toContain("trpc.ledger.join.useMutation");
    expect(workspace).toContain("trpc.ledger.createTransaction.useMutation");
    expect(workspace).toContain("收支已加入帳本");
  });

  it("讓網頁版帳密登入沿用 Android App 的電子信箱帳號資料", () => {
    expect(auth).toContain("trpc.auth.login.useMutation");
    expect(auth).toContain("trpc.auth.register.useMutation");
    expect(auth).toContain("manus-cookie");
    expect(auth).toContain("登入並開啟帳本");
  });

  it("讓手機版也能切換所有帳本功能，不將設定與個人頁面截斷在四個入口之外", () => {
    expect(workspace).toContain('aria-label="帳本行動版完整功能導覽"');
    expect(workspace).toContain("navigation.map(([key, label, Icon])");
    expect(workspace).not.toContain("navigation.slice(0, 4)");
    expect(workspace).toContain("grid grid-cols-4");
    expect(workspace).not.toContain("overflow-x-auto rounded-2xl border border-[#E9DED8] bg-white p-2 lg:hidden");
  });

  it("在個人設定保留單一外觀模式入口，並提供登出與 Android App 下載操作", () => {
    expect(workspace).toContain("<WebAppearancePanel />");
    expect(workspace).not.toContain('Card title="外觀模式"');
    expect(workspace).toContain("確定要登出此裝置嗎？");
    expect(workspace).toContain("下載 Together Ledger App");
    expect(workspace).toContain("releases/latest");
  });

  it("提供固定收支的新增、編輯、刪除與到期同步操作", () => {
    expect(workspace).toContain("trpc.ledger.updateRecurring.useMutation");
    expect(workspace).toContain("編輯固定收支");
    expect(workspace).toContain("同步到期項目");
  });

  it("提供可辨識的發布資訊與重新取得最新版本操作", () => {
    expect(footer).toContain('WEB_RELEASE_VERSION = "1.2.8.9"');
    expect(footer).toContain("DEFAULT_WEB_RELEASED_AT");
    expect(footer).toContain("/__manus__/version.json");
    expect(footer).toContain('cache: "no-store"');
    expect(footer).toContain("重新載入最新版本");
    expect(footer).toContain("window.caches");
    expect(footer).toContain("url.searchParams.set(\"refresh\"");
  });
});
