import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(fileURLToPath(new URL("./LedgerWorkspace.tsx", import.meta.url)), "utf8");
const savingsBuckets = readFileSync(fileURLToPath(new URL("../components/SavingsBucketsPanel.tsx", import.meta.url)), "utf8");
const auth = readFileSync(fileURLToPath(new URL("./WebAuth.tsx", import.meta.url)), "utf8");
const firebaseAuth = readFileSync(fileURLToPath(new URL("../lib/firebaseAuth.ts", import.meta.url)), "utf8");
const inviteJoin = readFileSync(fileURLToPath(new URL("./InviteJoin.tsx", import.meta.url)), "utf8");
const footer = readFileSync(fileURLToPath(new URL("../components/ReleaseFooter.tsx", import.meta.url)), "utf8");
const pwa = readFileSync(fileURLToPath(new URL("../components/PwaInstallPanel.tsx", import.meta.url)), "utf8");
const appearance = readFileSync(fileURLToPath(new URL("../components/WebAppearancePanel.tsx", import.meta.url)), "utf8");
const realtime = readFileSync(fileURLToPath(new URL("../lib/ledgerRealtime.ts", import.meta.url)), "utf8");
const ledgerIcons = readFileSync(fileURLToPath(new URL("../../../shared/ledgerIcons.ts", import.meta.url)), "utf8");

describe("Together Ledger 真實網頁帳本入口", () => {
  it("使用既有的真實帳本 tRPC 讀寫流程，不使用靜態模擬交易資料", () => {
    expect(workspace).toContain("trpc.ledger.list.useQuery");
    expect(workspace).toContain("trpc.ledger.workspace.useQuery");
    expect(workspace).toContain("trpc.ledger.create.useMutation");
    expect(workspace).toContain("trpc.ledger.join.useMutation");
    expect(workspace).toContain("trpc.ledger.createTransaction.useMutation");
    expect(workspace).toContain("收支已新增。");
  });

  it("保留受限的既有帳密遷移入口，但不再提供顯著登入按鈕", () => {
    expect(auth).toContain("trpc.auth.login.useMutation");
    expect(auth).toContain("舊帳戶遷移登入（暫時保留）");
    expect(auth).not.toContain("使用既有帳密登入");
    expect(auth).toContain("manus-cookie");
    expect(auth).toContain("登入並開啟帳本");
  });

  it("提供 Firebase 驗證信、非枚舉密碼重設與已驗證 token 交換登入", () => {
    expect(auth).toContain("registerFirebaseEmail");
    expect(auth).toContain("signInFirebaseEmail");
    expect(auth).toContain("requestFirebasePasswordReset");
    expect(auth).toContain("resendFirebaseVerification");
    expect(auth).toContain("exchangeFirebaseToken");
    expect(auth).toContain("驗證信已寄出。請完成信箱驗證後");
    expect(auth).toContain("若此電子信箱已啟用共帳登入，重設密碼信已寄出");
    expect(auth).toContain("垃圾郵件匣");
    expect(auth).toContain("toast.success");
  });

  it("提供 Web／PWA Google popup 與行動 redirect 備援，且僅以 Firebase ID token 建立登入狀態", () => {
    expect(auth).toContain("signInFirebaseGoogle");
    expect(auth).toContain("getRedirectedFirebaseGoogleSignIn");
    expect(auth).toContain("hasPendingGoogleRedirectSignIn");
    expect(auth).toContain("正在開啟 Google 安全驗證頁，完成後會返回共帳。");
    expect(auth).toContain("exchangeFirebaseToken");
    expect(firebaseAuth).toContain("signInWithPopup");
    expect(firebaseAuth).toContain("signInWithRedirect");
    expect(firebaseAuth).toContain("getRedirectResult");
    expect(firebaseAuth).toContain("GOOGLE_REDIRECT_INTENT_KEY");
    expect(firebaseAuth).toContain("return user.getIdToken(true);");
    expect(firebaseAuth).not.toContain("GoogleAuthProvider.credential");
  });

  it("在個人設定提供同信箱 Firebase 綁定，且不改變既有帳本資料", () => {
    expect(workspace).toContain("trpc.auth.firebaseStatus.useQuery");
    expect(workspace).toContain("trpc.auth.linkFirebase.useMutation");
    expect(workspace).toContain("Firebase 電子信箱安全");
    expect(workspace).toContain("不會建立新帳本，也不會變更既有帳本資料");
    expect(workspace).toContain("signInFirebaseEmail");
    expect(workspace).toContain("firebaseIdToken");
  });

  it("以密碼後五秒倒數的最終確認防止誤觸刪帳，並在成功後回到公開告別入口", () => {
    expect(workspace).toContain("setAccountDeletionConfirmationOpen(true)");
    expect(workspace).toContain("setAccountDeletionCountdown(5)");
    expect(workspace).toContain("倒數不會自動刪除帳號");
    expect(workspace).toContain("取消並保留帳號");
    expect(workspace).toContain('navigate("/?account-deleted=1")');
    expect(workspace).not.toContain('window.confirm("確定要永久刪除帳號嗎？此動作不可復原。")');
  });

  it("在新增收支對話框開啟期間固定工作區快照，不讓背景同步清除未提交草稿", () => {
    expect(workspace).toContain("function StableTransactionDialog");
    expect(workspace).toContain("workspaceSnapshot.current = props.workspace");
    expect(workspace).toContain("const dialogElement = useRef<any>(null);");
    expect(workspace).toContain("dialogElement.current = <TransactionDialog");
    expect(workspace).toContain("return dialogElement.current;");
    expect(workspace).toContain("<StableTransactionDialog");
    expect(workspace).not.toContain('<TransactionDialog open={sheet === "transaction"} workspace={workspace}');
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

  it("以可追溯、具樂觀鎖保護的儲蓄桶介面同步網頁與 PWA 規劃功能", () => {
    expect(workspace).toContain("<SavingsBucketsPanel");
    expect(workspace).toContain("isSavingsTransfer");
    expect(workspace).toContain("儲蓄桶自動轉存則保留為唯讀紀錄");
    expect(savingsBuckets).toContain("trpc.ledger.savings.buckets.useQuery");
    expect(savingsBuckets).toContain("trpc.ledger.savings.allocations.useQuery");
    expect(savingsBuckets).toContain("trpc.ledger.savings.create.useMutation");
    expect(savingsBuckets).toContain("trpc.ledger.savings.update.useMutation");
    expect(savingsBuckets).toContain("trpc.ledger.savings.stop.useMutation");
    expect(savingsBuckets).toContain("expectedVersion: editor.version");
    expect(savingsBuckets).toContain("此儲蓄桶已被其他成員修改，請重新整理後再編輯。");
    expect(savingsBuckets).toContain("部分分配");
    expect(savingsBuckets).toContain("shortfallAmount");
  });

  it("讓網頁與 PWA 從儲蓄桶額外存入，並將手動紀錄與自動分配清楚區分", () => {
    expect(savingsBuckets).toContain("trpc.ledger.savings.addDeposit.useMutation");
    expect(savingsBuckets).toContain("expectedVersion: depositBucket.version");
    expect(savingsBuckets).toContain("額外存入");
    expect(savingsBuckets).toContain('source === "manual"');
    expect(savingsBuckets).toContain("剩餘目標");
  });

  it("不在一般新增或編輯收支表單提供手動轉帳選項", () => {
    expect(workspace).toContain('["expense", "income"].map(item');
    expect(workspace).not.toContain('["expense", "income", "transfer"].map(item');
  });

  it("讓分類與支付方式選擇器固定提供無圖示入口，並可展開搜尋完整圖示庫", () => {
    expect(workspace).toContain("function CategoryPaymentIconPicker");
    expect(workspace).toContain("CATEGORY_EMOJI_OPTIONS");
    expect(workspace).toContain("PAYMENT_EMOJI_OPTIONS");
    expect(workspace).toContain("searchCategoryPaymentIconOptions(query, choices)");
    expect(workspace).toContain("const options = expanded ? filteredOptions : choices.slice(0, 12);");
    expect(workspace).toContain("不使用圖示");
    expect(workspace).toContain("搜尋圖示，例如：車、旅行、愛心");
    expect(workspace).toContain('icon === "" ? "" : categoryEmoji({ name, icon })');
    expect(workspace).toContain('icon === "" ? "" : paymentEmoji({ name, icon })');
  });

  it("在儲蓄目標首次達標時提供可減少動態效果的慶祝、封存與重新顯示流程", () => {
    expect(savingsBuckets).toContain('trpc.ledger.savings.archive.useMutation');
    expect(savingsBuckets).toContain('trpc.ledger.savings.restore.useMutation');
    expect(savingsBuckets).toContain("目標達成！");
    expect(savingsBuckets).toContain("封存此目標");
    expect(savingsBuckets).toContain("重新顯示");
    expect(savingsBuckets).toContain("motion-reduce:animate-none");
    expect(savingsBuckets).toContain("together-ledger:savings-completed:");
  });

  it("將所有帳本輸入對話框維持在穩定快照中，避免背景同步覆寫未提交文字", () => {
    expect(workspace).toContain("function StableFormDialog");
    expect(workspace).toContain("propsSnapshot.current = props");
    expect(workspace).toContain("dialogElement.current = <DialogComponent {...propsSnapshot.current} />;");
    expect(workspace).toContain("Keep both the props and the element identity stable until the sheet closes.");
    expect(workspace).toContain("<StableFormDialog");
    expect(savingsBuckets).toContain("}, [open, bucket?.id]);");
  });

  it("提供可辨識的發布資訊與重新取得最新版本操作", () => {
    expect(footer).toContain('WEB_RELEASE_VERSION = "1.3.21"');
    expect(footer).toContain("WEB_BUILD_TIMESTAMP");
    expect(footer).toContain("formatTaipeiTimestamp");
    expect(footer).toContain("重新載入最新版本");
    expect(footer).toContain("window.caches");
    expect(footer).toContain("url.searchParams.set(\"refresh\"");
  });

  it("在行動 Web／PWA 顯示同步狀態，並在未儲存草稿存在時阻擋新版重載", () => {
    expect(workspace).toContain("setPwaDraftSafety");
    expect(workspace).toContain("同步狀態");
    expect(workspace).toContain("最後同步");
    expect(workspace).toContain("重試同步");
    expect(pwa).toContain("PwaDraftSafety");
    expect(pwa).toContain("hasUnsavedChanges");
    expect(pwa).toContain("避免草稿遺失");
  });

  it("以同源 SSE 接收帳本異動並以防抖快取失效更新，不重設開啟中的草稿", () => {
    expect(workspace).toContain("subscribeLedgerChanges({");
    expect(workspace).toContain("utils.ledger.workspace.invalidate");
    expect(workspace).toContain("utils.ledger.list.invalidate");
    expect(workspace).toContain("StableTransactionDialog");
    expect(realtime).toContain("/api/ledgers/${ledgerId}/events");
    expect(realtime).toContain('source.addEventListener("ledger-change"');
    expect(realtime).toContain("source.close()");
  });

  it("以 SSE 優先、節流輪詢與 memoized 查找降低讀取和重繪成本", () => {
    expect(workspace).toContain("refetchInterval: online ? 30000 : false");
    expect(workspace).toContain("refetchInterval: online && !ledgerHome ? 20000 : false");
    expect(workspace).toContain("staleTime: 10_000");
    expect(workspace).toContain("staleTime: 15_000");
    expect(workspace).toContain("const workspace = useMemo(() => normalizeLedgerWorkspace");
    expect(workspace).toContain("const memberNames = useMemo(() => new Map");
    expect(workspace).toContain("const categoriesById = useMemo(() => new Map");
    expect(workspace).toContain("const paymentsById = useMemo(() => new Map");
    expect(workspace).toContain("if (ledgerList.isFetching || workspaceQuery.isFetching) return;");
    expect(workspace).not.toContain("void refresh().catch(() => undefined);");
  });

  it("提供 HTTPS 邀請備援，讓未安裝 Android App 的使用者也能登入後安全加入帳本", () => {
    expect(inviteJoin).toContain("const joinOrSignIn = () => {");
    expect(inviteJoin).toContain("if (!user) {");
    expect(inviteJoin).toContain('setLocation(`/login?invite=${encodeURIComponent(code)}`)');
    expect(inviteJoin).toContain("intent://join?code=${encodeURIComponent(code)}");
    expect(inviteJoin).toContain("package=com.togetherledger.app");
    expect(inviteJoin).toContain('fallback.searchParams.set("web", "1")');
    expect(inviteJoin).toContain('join.mutate({ inviteCode: code })');
    expect(inviteJoin).toContain("onClick={joinOrSignIn}");
    expect(inviteJoin).toContain("未安裝 App 也能在此網頁加入");
    expect(inviteJoin).toContain("帳本存取權仍由伺服器驗證");
  });

  it("以版本保護的每月結算快照提供提出、第二位成員確認與管理員重新開啟流程", () => {
    expect(workspace).toContain("trpc.ledger.settlement.history.useQuery");
    expect(workspace).toContain("trpc.ledger.settlement.markSettled.useMutation");
    expect(workspace).toContain("trpc.ledger.settlement.confirm.useMutation");
    expect(workspace).toContain("trpc.ledger.settlement.reopen.useMutation");
    expect(workspace).toContain("等待另一位成員確認");
    expect(workspace).toContain("確認並鎖定");
    expect(workspace).toContain("重新開啟本月結算");
  });

  it("將本月待結算摘要置於總覽，並提供月份與狀態篩選的結算快照歷史", () => {
    expect(workspace).toContain("本月待結算");
    expect(workspace).toContain("結算快照與鎖定狀態");
    expect(workspace).toContain("function SettlementHistoryPanel");
    expect(workspace).toContain("const [monthFilter, setMonthFilter]");
    expect(workspace).toContain("statusFilter");
    expect(workspace).toContain("全部月份");
    expect(workspace).toContain("全部狀態");
    expect(workspace).toContain("等待確認");
    expect(workspace).toContain("已重新開啟");
    expect(workspace).toContain("utils.ledger.settlement.history.invalidate");
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
    expect(workspace).toContain("function CompactLedgerIconPicker");
    expect(workspace).toContain("const filteredOptions = searchLedgerIconOptions(query);");
    expect(workspace).toContain("const options = expanded ? filteredOptions : LEDGER_EMOJI_OPTIONS.slice(0, 12);");
    expect(workspace).toContain("不使用圖示");
    expect(workspace).toContain('placeholder="搜尋圖示，例如：車、旅行、愛心"');
    expect(workspace).toContain('aria-label="搜尋帳本圖示"');
    expect(workspace).toContain("item.ledger.icon ? <span");
    expect(workspace).not.toContain("item.ledger.icon ||");
    expect(workspace).toContain("LEDGER_EMOJI_OPTIONS");
    expect(workspace).toContain("searchLedgerIconOptions");
    expect(ledgerIcons).toContain("LEDGER_ICON_OPTIONS");
    expect(ledgerIcons).toContain('"🏠"');
    expect(ledgerIcons).toContain('"🌊"');
    expect(workspace).toContain("<CreateLedgerDialog");
    expect(workspace).toContain("<Profile workspace={null}");
    expect(workspace).toContain("<WebAppearancePanel /></div></div></div>");
  });

  it("在 Web／PWA Wiki 與更新歷程只顯示對應版本說明", () => {
    expect(workspace).toContain("使用說明 Wiki");
    expect(appearance).toContain("Wiki 使用說明");
    expect(appearance).toContain("extractVersionNotes(release.body, release.tag_name)");
    expect(appearance).toContain("const WIKI_URL");
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
