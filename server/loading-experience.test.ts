import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const webAuth = readFileSync(resolve(root, "client/src/pages/WebAuth.tsx"), "utf8");
const workspace = readFileSync(resolve(root, "client/src/pages/LedgerWorkspace.tsx"), "utf8");
const styles = readFileSync(resolve(root, "client/src/index.css"), "utf8");
const mobileApp = readFileSync(resolve(root, "mobile/app/index.tsx"), "utf8");

describe("跨平台載入體驗", () => {
  it("在網頁登入與帳本載入時提供骨架、同步回饋與降低動態效果支援", () => {
    expect(webAuth).toContain("正在安全開啟帳本…");
    expect(workspace).toContain("function AuthLoadingSkeleton()");
    expect(workspace).toContain("const isWorkspaceRefreshing");
    expect(workspace).toContain("正在同步共同帳本資料");
    expect(styles).toContain(".ledger-content-enter");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("在 Android App 初始化、登入與帳本切換時維持可存取的等待回饋", () => {
    expect(mobileApp).toContain("function AppBootstrapSkeleton()");
    expect(mobileApp).toContain("function LedgerContentSkeleton()");
    expect(mobileApp).toContain("function ContentTransition(");
    expect(mobileApp).toContain("const nextUser = authState?.user ?? null");
    expect(mobileApp).toContain('accessibilityLabel="正在同步帳本資料"');
    expect(mobileApp).toContain("preferences.reduceMotion");
  });

  it("讓手機網頁沿用 Android App 的五項主導覽，並保留收支與個人設定的明確工具入口", () => {
    expect(workspace).toContain("const mobileNavigation = navigation.filter");
    expect(workspace).toContain('["overview", "calendar", "analysis", "planning", "settings"]');
    expect(workspace).toContain('aria-label="帳本行動版主要功能導覽"');
    expect(workspace).toContain("grid grid-cols-5");
    expect(workspace).toContain('selectPage("records")');
    expect(workspace).toContain('selectPage("profile")');
    expect(workspace).toContain("window.scrollTo");
    expect(styles).toContain("table thead { display: none; }");
  });

  it("讓手機網頁登入與帳本外層採用 App 式安全區、卡片與操作層級", () => {
    expect(webAuth).toContain('className="web-auth-shell');
    expect(webAuth).toContain('className="web-auth-panel');
    expect(workspace).toContain('className="web-ledger-shell');
    expect(styles).toContain(".web-auth-shell");
    expect(styles).toContain(".web-ledger-shell");
    expect(styles).toContain("env(safe-area-inset-bottom)");
  });
});
