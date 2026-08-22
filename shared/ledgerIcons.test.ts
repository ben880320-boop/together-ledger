import { describe, expect, it } from "vitest";
import {
  CATEGORY_EMOJI_OPTIONS,
  LEDGER_EMOJI_OPTIONS,
  LEDGER_ICON_OPTIONS,
  PAYMENT_EMOJI_OPTIONS,
  searchCategoryPaymentIconOptions,
  searchLedgerIconOptions,
} from "./ledgerIcons";

describe("帳本圖示資料契約", () => {
  it("提供一個真正不顯示圖示的選項與 69 個不重複的實用圖示", () => {
    expect(LEDGER_ICON_OPTIONS).toHaveLength(70);
    expect(LEDGER_ICON_OPTIONS[0]).toBeNull();
    expect(LEDGER_EMOJI_OPTIONS).toHaveLength(69);
    expect(new Set(LEDGER_EMOJI_OPTIONS)).toHaveLength(69);
    expect(LEDGER_EMOJI_OPTIONS).toEqual(expect.arrayContaining(["🏠", "🌊", "💳", "📦"]));
  });

  it("可用中文情境關鍵字搜尋新增圖示，且空白搜尋保留完整圖示庫", () => {
    expect(searchLedgerIconOptions("車")).toContain("🚗");
    expect(searchLedgerIconOptions("旅行")).toEqual(expect.arrayContaining(["✈️", "🏖️", "⛺"]));
    expect(searchLedgerIconOptions("愛心")).toEqual(expect.arrayContaining(["❤", "💖", "💞"]));
    expect(searchLedgerIconOptions(" ")).toHaveLength(69);
  });

  it("讓分類與支付方式共用完整圖示庫並保留其專用常用圖示", () => {
    expect(CATEGORY_EMOJI_OPTIONS).toEqual(expect.arrayContaining(["🍜", "🚗", "🏠", "🏷️", "🌊", "📦"]));
    expect(PAYMENT_EMOJI_OPTIONS).toEqual(expect.arrayContaining(["💵", "💳", "📱", "🏦", "🔁", "🌊"]));
    expect(new Set(CATEGORY_EMOJI_OPTIONS)).toHaveLength(CATEGORY_EMOJI_OPTIONS.length);
    expect(new Set(PAYMENT_EMOJI_OPTIONS)).toHaveLength(PAYMENT_EMOJI_OPTIONS.length);
  });

  it("讓分類與支付方式可用中文搜尋完整圖示庫", () => {
    expect(searchCategoryPaymentIconOptions("車", CATEGORY_EMOJI_OPTIONS)).toContain("🚗");
    expect(searchCategoryPaymentIconOptions("旅行", PAYMENT_EMOJI_OPTIONS)).toEqual(expect.arrayContaining(["✈️", "🏖️", "⛺"]));
    expect(searchCategoryPaymentIconOptions(" ", CATEGORY_EMOJI_OPTIONS)).toEqual(CATEGORY_EMOJI_OPTIONS);
  });
});
