import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./WebAppearancePanel.tsx", import.meta.url), "utf8");

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
});
