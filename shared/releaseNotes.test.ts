import { describe, expect, it } from "vitest";
import { extractVersionNotes } from "./releaseNotes";

describe("GitHub Release 版本說明切割", () => {
  it("只擷取與目前 tag 相符的累積式版本段落", () => {
    const cumulativeNotes = [
      "## Together Ledger v1.3.5",
      "- 修正同步與圖示顯示。",
      "- 更新 Android 建置流程。",
      "## Together Ledger v1.3.4",
      "- 舊版內容不得出現在 v1.3.5。",
    ].join("\n");

    expect(extractVersionNotes(cumulativeNotes, "v1.3.5")).toBe("- 修正同步與圖示顯示。\n- 更新 Android 建置流程。");
  });

  it("保留已正確分版或缺少標題的 Release 說明", () => {
    expect(extractVersionNotes("- 單一版本的發行說明", "v1.3.5")).toBe("- 單一版本的發行說明");
    expect(extractVersionNotes("", "v1.3.5")).toBe("");
  });
});
