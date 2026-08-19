import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(fileURLToPath(new URL("./LedgerWorkspace.tsx", import.meta.url)), "utf8");
const auth = readFileSync(fileURLToPath(new URL("./WebAuth.tsx", import.meta.url)), "utf8");
const footer = readFileSync(fileURLToPath(new URL("../components/ReleaseFooter.tsx", import.meta.url)), "utf8");

describe("Together Ledger 真實網頁帳本入口", () => {
  it("使用既有的真實帳本 tRPC 讀寫流程，不使用靜態模擬交易資料", () => {
    expect(workspace).toContain("trpc.ledger.list.useQuery");
    expect(workspace).toContain("trpc.ledger.workspace.useQuery");
    expect(workspace).toContain("trpc.ledger.create.useMutation");
    expect(workspace).toContain("trpc.ledger.join.useMutation");
    expect(workspace).toContain("trpc.ledger.createTransaction.useMutation");
    expect(workspace).toContain("收支已新增。");
  });

  it("讓網頁版帳密登入沿用 Android App 的電子信箱帳號資料", () => {
    expect(auth).toContain("trpc.auth.login.useMutation");
    expect(auth).toContain("trpc.auth.register.useMutation");
    expect(auth).toContain("manus-cookie");
    expect(auth).toContain("登入並開啟帳本");
  });

  it("讓手機版沿用 Android App 的五項主導覽，並保留收支與帳本外個人設定入口", () => {
    expect(workspace).toContain('aria-label="帳本行動版主要功能導覽"');
    expect(workspace).toContain("const mobileNavigation = navigation.filter");
    expect(workspace).toContain('["overview", "calendar", "analysis", "planning", "settings"]');
    expect(workspace).toContain("grid grid-cols-5");
    expect(workspace).toContain('selectPage("records")');
    expect(workspace).toContain('onClick={onProfile}');
    expect(workspace).toContain("返回我的帳本");
    expect(workspace).toContain("window.scrollTo");
  });

  it("在個人設定保留單一外觀模式入口，並提供登出與 Android App 下載操作", () => {
    expect(workspace).toContain("<WebAppearancePanel />");
    expect(workspace).not.toContain('Card title="外觀模式"');
    expect(workspace).toContain("確定要登出此裝置嗎？");
    expect(workspace).toContain("下載 Together Ledger App");
    expect(workspace).toContain("releases/latest");
  });

  it("提供固定收支的新增、編輯、刪除與到期同步操作", () => {
    expect(workspace).toContain("trpc.ledger.updateRecurring.useMutation");
    expect(workspace).toContain("編輯固定收支");
    expect(workspace).toContain("同步到期項目");
  });

  it("提供可辨識的發布資訊與重新取得最新版本操作", () => {
    expect(footer).toContain('WEB_RELEASE_VERSION = "1.2.9"');
    expect(footer).toContain("WEB_BUILD_TIMESTAMP");
    expect(footer).toContain("formatTaipeiTimestamp");
    expect(footer).toContain("重新載入最新版本");
    expect(footer).toContain("window.caches");
    expect(footer).toContain("url.searchParams.set(\"refresh\"");
  });

  it("以 Android App 的首頁資訊層級呈現成員支付、近期收支與結算資訊", () => {
    expect(workspace).toContain("雙方支付總覽");
    expect(workspace).toContain("共同財務摘要");
    expect(workspace).toContain("目前結算狀態");
    expect(workspace).toContain("完整檢視");
  });

  it("對操作日誌日期與舊版圖示採用安全的跨平台呈現規則", () => {
    expect(workspace).toContain("normalizeLedgerWorkspace");
    expect(workspace).toContain("formatActivityTimestamp");
    expect(workspace).not.toContain('category?.icon || "◌"');
  });

  it("登入後先顯示與 Android App 相同的我的帳本入口，並提供搜尋、建立與加入流程", () => {
    expect(workspace).toContain("function LedgerHomePage");
    expect(workspace).toContain("我的帳本");
    expect(workspace).toContain("選擇共同帳本");
    expect(workspace).toContain("搜尋帳本名稱");
    expect(workspace).toContain("建立帳本");
    expect(workspace).toContain("加入帳本");
    expect(workspace).toContain("setLedgerHome(false)");
  });

  it("以 App 式月曆月份網格、日期收支標記與單日明細取代交易清單月曆", () => {
    expect(workspace).toContain("function AppCalendar");
    expect(workspace).toContain("app-calendar-day");
    expect(workspace).toContain("app-calendar-dot-expense");
    expect(workspace).toContain("app-calendar-dot-income");
    expect(workspace).toContain("明細");
    expect(workspace).toContain("changeMonth(-1)");
    expect(workspace).toContain("changeMonth(1)");
  });

  it("以可選帳本圖示及無圖示選項取代帳本類型，並保留無帳本個人設定流程", () => {
    expect(workspace).toContain("function CreateLedgerDialog");
    expect(workspace).toContain("帳本圖示（可選）");
    expect(workspace).toContain("aria-pressed={icon === null}");
    expect(workspace).toContain("item.ledger.icon ||");
    expect(workspace).toContain("<CreateLedgerDialog");
    expect(workspace).toContain("<Profile workspace={null}");
    expect(workspace).toContain("<WebAppearancePanel /></div></div></div>");
  });

  it("在完整收支、分析、規劃與設定頁保留 Android App 同等的行動重點互動", () => {
    expect(workspace).toContain('useState<"week" | "month" | "previous">("month")');
    expect(workspace).toContain("本週");
    expect(workspace).toContain("本月");
    expect(workspace).toContain("上月");
    expect(workspace).toContain("md:hidden");
    expect(workspace).toContain("分類圓環");
    expect(workspace).toContain("conic-gradient");
    expect(workspace).toContain("與上月比較");
    expect(workspace).toContain("月總預算");
    expect(workspace).toContain('setSheet("total-budget")');
    expect(workspace).toContain('useState<"all" | "transaction" | "settings" | "member">("all")');
    expect(workspace).toContain("此類型尚無操作日誌。");
  });
});
