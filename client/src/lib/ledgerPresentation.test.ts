import { describe, expect, it } from "vitest";
import { categoryEmoji, formatActivityTimestamp, normalizeLedgerWorkspace, paymentEmoji } from "./ledgerPresentation";

describe("帳本資料呈現正規化", () => {
  it("將 Android 與舊版資料的分類占位符轉為可辨識的表情符號", () => {
    expect(categoryEmoji({ icon: "◌", name: "其他支出" })).toBe("🏷️");
    expect(categoryEmoji({ icon: "⌂", name: "房租" })).toBe("🏠");
    expect(categoryEmoji({ icon: "", name: "餐飲" })).toBe("");
  });

  it("將舊版支付方式符號轉為跨平台一致的圖示", () => {
    expect(paymentEmoji({ icon: "現", name: "現金" })).toBe("💵");
    expect(paymentEmoji({ icon: "卡", name: "信用卡" })).toBe("💳");
  });

  it("保留使用者明確選擇的無圖示，不以名稱推測圖示覆蓋", () => {
    expect(categoryEmoji({ icon: "", name: "交通" })).toBe("");
    expect(paymentEmoji({ icon: "", name: "現金" })).toBe("");
  });

  it("正規化工作區內的分類、支付方式與分析圖示", () => {
    const workspace = normalizeLedgerWorkspace({
      categories: [{ id: 1, icon: "◌", name: "其他" }],
      paymentMethods: [{ id: 1, icon: "銀", name: "銀行" }],
      analytics: { categories: [{ id: 1, icon: "◇", name: "購物" }] },
    });
    expect(workspace.categories[0].icon).toBe("🏷️");
    expect(workspace.paymentMethods[0].icon).toBe("🏦");
    expect(workspace.analytics.categories[0].icon).toBe("🛍️");
  });

  it("對缺漏或無效的操作日誌日期提供安全回退文字", () => {
    expect(formatActivityTimestamp(undefined)).toBe("時間資料暫時無法顯示");
    expect(formatActivityTimestamp("2026-08-19T12:00:00.000Z")).not.toBe("時間資料暫時無法顯示");
  });
});
