import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
const publicLandingStart = stylesheet.indexOf(".web-public-landing { background-color:");
const ledgerThemeStart = stylesheet.indexOf(".web-ledger-shell [class*=");
const publicLandingOverrides = stylesheet.slice(publicLandingStart, ledgerThemeStart);

describe("公開首頁固定主題契約", () => {
  it("以固定品牌色彩繪製公開首頁，而不是帳本 CSS 變數", () => {
    expect(publicLandingStart).toBeGreaterThan(-1);
    expect(ledgerThemeStart).toBeGreaterThan(publicLandingStart);
    expect(publicLandingOverrides).toContain("background-color: #fffaf7");
    expect(publicLandingOverrides).toContain("color: #42322e");
    expect(publicLandingOverrides).toContain("linear-gradient(145deg, #fffaf7 0%, #f6ede8 55%, #eff0ed 100%)");
    expect(publicLandingOverrides).not.toMatch(/var\(--(?:background|foreground|primary|card|scene-)/);
  });

  it("即使 root 使用深色模式，公開首頁卡片仍維持其固定亮色底板", () => {
    expect(stylesheet).toContain(":root.dark .web-public-landing [class*=\"bg-white/\"]");
    expect(stylesheet).toContain("background-color: rgba(255, 253, 251, 0.94)");
  });
});
