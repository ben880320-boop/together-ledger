import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./WebAppearancePanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../pages/WebAuth.tsx", import.meta.url), "utf8");
const themeContextSource = readFileSync(new URL("../contexts/ThemeContext.tsx", import.meta.url), "utf8");
const notFoundSource = readFileSync(new URL("../pages/NotFound.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
const footerSource = readFileSync(new URL("./ReleaseFooter.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("./ManusDialog.tsx", import.meta.url), "utf8");

describe("WebAppearancePanel", () => {
  it("提供與 Android 對等的場景主題、色彩模式與官方更新歷程", () => {
    expect(source).toContain('"cherry", "櫻花"');
    expect(source).toContain('"ocean", "海洋"');
    expect(source).toContain('"starry", "星空"');
    expect(source).toContain("RELEASE_HISTORY_URL");
    expect(source).toContain("securitySummary");
  });

  it("將外觀偏好保存在瀏覽器，且更新歷程來自官方 Releases", () => {
    expect(source).toContain("together-ledger-web-scene");
    expect(source).toContain("together-ledger-color-mode");
    expect(source).toContain("api.github.com/repos/ben880320-boop/together-ledger/releases");
  });

  it("以情境語意權杖覆蓋登入、帳本首頁、月曆與互動表面", () => {
    expect(styles).toContain("--scene-hero");
    expect(styles).toContain("--scene-hero-foreground");
    expect(styles).toContain(".ledger-home-shell { background: linear-gradient");
    expect(styles).toContain(".app-calendar-day-selected { background: var(--primary)");
    expect(styles).toContain(".web-auth-form { background: var(--card)");
    expect(authSource).not.toContain("bg-[#F7F4F1]");
    expect(authSource).not.toContain("bg-[#5B4142]");
    expect(authSource).toContain("bg-primary");
  });

  it("在任何路由首次載入時同步已保存的場景與顯示模式", () => {
    expect(themeContextSource).toContain('const SCENE_STORAGE_KEY = "together-ledger-web-scene"');
    expect(themeContextSource).toContain('const MODE_STORAGE_KEY = "together-ledger-color-mode"');
    expect(themeContextSource).toContain("root.dataset.scene = localStorage.getItem(SCENE_STORAGE_KEY) || \"rose\"");
    expect(themeContextSource).toContain('root.classList.toggle("dark", theme === "dark")');
    expect(source).toContain('new Event("together-ledger-appearance-change")');
  });

  it("為深色模式提供場景專屬表面權杖，並避免 404 路由跳回固定色彩", () => {
    expect(styles).toContain(":root.dark[data-scene]");
    expect(styles).toContain("--card-foreground: #f5f7fa");
    expect(notFoundSource).toContain("bg-background");
    expect(notFoundSource).toContain("bg-card/90");
    expect(notFoundSource).not.toContain("text-slate-");
    expect(notFoundSource).not.toContain("bg-white/");
  });

  it("讓公開入口、共用頁尾與確認彈窗共享語意色彩，而非保留玫瑰或白色固定表面", () => {
    expect(homeSource).toContain("web-public-landing min-h-screen overflow-hidden bg-background text-foreground");
    expect(styles).toContain(".web-public-landing > .pointer-events-none");
    expect(styles).toContain(".web-public-landing [class*=\"bg-[#B56C78]\"]");
    expect(styles).toContain(".web-ledger-shell [class*=\"text-[#\"]");
    expect(footerSource).toContain("border-border");
    expect(footerSource).toContain("bg-card/55");
    expect(footerSource).toContain("text-[var(--scene-income)]");
    expect(dialogSource).toContain("bg-popover");
    expect(dialogSource).toContain("bg-primary");
    expect(dialogSource).not.toContain("Login with Manus");
  });
});
