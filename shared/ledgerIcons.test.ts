import { describe, expect, it } from "vitest";
import { LEDGER_EMOJI_OPTIONS, LEDGER_ICON_OPTIONS, searchLedgerIconOptions } from "./ledgerIcons";

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
});
