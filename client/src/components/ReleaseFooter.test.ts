import { describe, expect, it } from "vitest";
import { buildLatestVersionUrl } from "./ReleaseFooter";

describe("buildLatestVersionUrl", () => {
  it("保留目前登入路徑與既有參數，僅更新快取破除版本", () => {
    expect(buildLatestVersionUrl("https://togetherapp-hdbmsjkf.manus.space/login?tab=register", 123456))
      .toBe("https://togetherapp-hdbmsjkf.manus.space/login?tab=register&refresh=123456");
  });

  it("可從根路徑建立可重新請求的最新版網址", () => {
    expect(buildLatestVersionUrl("https://togetherapp-hdbmsjkf.manus.space/", 123456))
      .toBe("https://togetherapp-hdbmsjkf.manus.space/?refresh=123456");
  });
});
