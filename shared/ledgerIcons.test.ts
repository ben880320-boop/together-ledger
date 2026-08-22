import { describe, expect, it } from "vitest";
import { LEDGER_EMOJI_OPTIONS, LEDGER_ICON_OPTIONS } from "./ledgerIcons";

describe("帳本圖示資料契約", () => {
  it("提供一個預設圖示選項與 69 個不重複的實用圖示", () => {
    expect(LEDGER_ICON_OPTIONS).toHaveLength(70);
    expect(LEDGER_ICON_OPTIONS[0]).toBeNull();
    expect(LEDGER_EMOJI_OPTIONS).toHaveLength(69);
    expect(new Set(LEDGER_EMOJI_OPTIONS)).toHaveLength(69);
    expect(LEDGER_EMOJI_OPTIONS).toEqual(expect.arrayContaining(["🏠", "🌊", "💳", "📦"]));
  });
});
