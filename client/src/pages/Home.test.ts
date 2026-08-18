import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(fileURLToPath(new URL("./Home.tsx", import.meta.url)), "utf8");

describe("Together Ledger 網頁產品入口", () => {
  it("同步顯示 Android App 版本、更新歷程與跨裝置使用引導", () => {
    expect(homePage).toContain("1.2.8.7");
    expect(homePage).toContain("更新歷程");
    expect(homePage).toContain("iOS");
    expect(homePage).toContain("Android");
    expect(homePage).toContain("GitHub");
  });
});
