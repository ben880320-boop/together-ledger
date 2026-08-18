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

  it("提供可辨識的發布資訊與重新取得最新版本操作", () => {
    expect(footer).toContain('WEB_RELEASE_VERSION = "1.2.8.7"');
    expect(footer).toContain("DEFAULT_WEB_RELEASED_AT");
    expect(footer).toContain("/__manus__/version.json");
    expect(footer).toContain('cache: "no-store"');
    expect(footer).toContain("重新載入最新版本");
    expect(footer).toContain("window.caches");
    expect(footer).toContain("url.searchParams.set(\"refresh\"");
  });
});
