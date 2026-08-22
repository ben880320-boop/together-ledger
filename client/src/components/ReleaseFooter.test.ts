import { describe, expect, it } from "vitest";
import { buildLatestVersionUrl, formatTaipeiTimestamp } from "./ReleaseFooter";

describe("buildLatestVersionUrl", () => {
  it("保留目前登入路徑與既有參數，僅更新快取破除版本", () => {
    expect(buildLatestVersionUrl("https://togetherapp-hdbmsjkf.manus.space/login?tab=register", 123456))
      .toBe("https://togetherapp-hdbmsjkf.manus.space/login?tab=register&refresh=123456");
  });

  it("可從根路徑建立可重新請求的最新版網址", () => {
    expect(buildLatestVersionUrl("https://togetherapp-hdbmsjkf.manus.space/", 123456))
      .toBe("https://togetherapp-hdbmsjkf.manus.space/?refresh=123456");
  });

  it("以台北時區格式化建置發布時間", () => {
    const formatted = formatTaipeiTimestamp(Date.UTC(2026, 7, 19, 8, 22));
    expect(formatted).toContain("2026");
    expect(formatted).toContain("16:22");
    expect(formatted).toContain("台北時間");
  });
});
