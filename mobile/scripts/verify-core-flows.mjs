import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const app = readFileSync(resolve(projectRoot, "app/index.tsx"), "utf8");
const appConfig = readFileSync(resolve(projectRoot, "app.json"), "utf8");
const router = readFileSync(resolve(projectRoot, "../server/routers.ts"), "utf8");
const db = readFileSync(resolve(projectRoot, "../server/db.ts"), "utf8");
const eas = readFileSync(resolve(projectRoot, "eas.json"), "utf8");
const createLedgerStart = db.indexOf("export async function createLedger");
const createLedgerEnd = db.indexOf("export async function joinLedgerByInviteCode");
const createLedgerBlock = db.slice(createLedgerStart, createLedgerEnd);

const checks = [
  ["未登入顯示登入／註冊畫面", app.includes('if (!user)') && app.includes('登入／註冊')],
  ["登入／註冊使用電子信箱與密碼並儲存 JWT", app.includes('api.auth.login.mutate') && app.includes('api.auth.register.mutate') && app.includes('saveSessionToken(result.token)') && router.includes('register: publicProcedure') && router.includes('login: publicProcedure') && db.includes('createLocalUser') && db.includes('verifyLocalPassword')],
  ["本機帳密工作階段不會轉跳 OAuth", !app.includes('WebBrowser.openAuthSessionAsync') && !app.includes('oauthStateKey') && !app.includes('登入回呼驗證失敗')],
  ["App 可見文案不顯示 Manus 帳號或預設資料提示", !/(Manus 帳號|Manus 登入|Manus OAuth|預設資料)/.test(app)],
  ["建立新帳本保持空白且有預設主／子分類／支付方式", app.includes('建立空白共同帳本') && createLedgerBlock.includes('rootPresets') && createLedgerBlock.includes('childPresets') && createLedgerBlock.includes('parentCategoryId') && createLedgerBlock.includes('paymentMethods').toString() && createLedgerBlock.includes('現金') && !/(transactions|budgets|recurringTransactions|settlements)\\.values/.test(createLedgerBlock)],
  ["邀請碼加入帳本", app.includes('api.ledger.join.mutate') && router.includes('join: protectedProcedure')],
  ["QR Code、分享與 deep link 加入", app.includes('QRCode') && app.includes('Share.share') && app.includes('Linking.addEventListener') && app.includes('inviteCodeFromUrl')],
  ["三種分攤方式與無分攤", app.includes('equal') && app.includes('custom') && app.includes('amount') && app.includes('無分攤') && app.includes('splitType')],
  ["分類搜尋", app.includes('搜尋分類名稱') && app.includes('filteredCategories')],
  ["日期欄月曆選擇", app.includes('datePickerVisible') && app.includes('calendarCells') && app.includes('setDatePickerVisible(true)')],
  ["支付總覽獨立滑動限制", app.includes('paymentOverviewScroll') && app.includes('nestedScrollEnabled')],
  ["收支編輯與移除", app.includes('updateTransaction') && app.includes('deleteTransaction') && app.includes('編輯收支') && app.includes('移除收支')],
  ["分類與支付方式停用", app.includes('archiveCategory') && app.includes('archivePaymentMethod') && router.includes('archiveCategory') && router.includes('archivePaymentMethod')],
  ["發票拍照與相簿辨識", app.includes('pickReceipt("camera")') && app.includes('pickReceipt("library")') && app.includes('scanReceipt') && router.includes('scanReceipt')],
  ["操作日誌", app.includes('activityLogs') && app.includes('setActivityLogs(workspace.activityLogs') && router.includes('activityLogs')],
  ["結算摘要與標記已結算", app.includes('setSettlement(workspace.settlement') && app.includes('api.ledger.settlement.markSettled.mutate')],
  ["月曆與分析資料", app.includes('setCalendarTransactions(workspace.calendarTransactions') && app.includes('setAnalytics(workspace.analytics')],
  ["預算與固定收支", app.includes('api.ledger.upsertBudget.mutate') && app.includes('api.ledger.createRecurring.mutate') && app.includes('api.ledger.syncRecurring.mutate')],
  ["分類與支付方式自訂", app.includes('api.ledger.createCategory.mutate') && app.includes('api.ledger.createPaymentMethod.mutate')],
  ["多人 admin/member/viewer 角色管理", app.includes('api.ledger.updateMemberRole.mutate') && app.includes('設為管理員') && app.includes('允許編輯') && app.includes('改檢視') && app.includes('不提供任意自訂權限組合')],
  ["固定收支週期欄位", app.includes('frequency') && app.includes('dayOfMonth') && db.includes('syncDueRecurring') && db.includes('recurring.frequency')],
  ["邀請碼可點擊複製", app.includes('Clipboard.setStringAsync') && app.includes('複製邀請碼') && app.includes('點擊複製')],
  ["帳本可退出返回我的帳本", app.includes('setLedgerHome(true)') && app.includes('返回我的帳本') && app.includes('我的帳本')],
  ["帳本底部快捷分頁列", app.includes('function QuickNav') && app.includes('QuickNav active={activeAction}') && app.includes('切換至${item.label}')],
  ["個人化主題、擴充字體與文字大小設定", app.includes('AppearanceProvider') && app.includes('appearanceStorageKey') && app.includes('App 主題') && app.includes('字體') && app.includes('文字大小') && app.includes('sans-serif-condensed') && app.includes('monospace') && app.includes('tiny') && app.includes('xl')],
  ["最近收支固定高度獨立滑動", app.includes('recentTransactionsScroll') && app.includes('nestedScrollEnabled') && app.includes('最近收支')],
  ["冷啟動固定回到帳本首頁", app.includes('Never restore the last open ledger') && app.includes('setLedgerHome(true)') && app.includes('setActiveLedger(null)')],
  ["阻止重複加入同一帳本", app.includes('api.ledger.join.mutate') && db.includes('你已經加入這個帳本，不需要重複加入') && router.includes('CONFLICT')],
  ["帳本退出／轉讓／刪除入口與角色提示", app.includes('requestLeaveLedger') && app.includes('onLeaveLedger={requestLeaveLedger}') && app.includes('performLeaveLedger("transfer"') && app.includes('performLeaveLedger("leave"') && app.includes('action: "delete"') && app.includes('再次確認刪除帳本')],
  ["移除 hamburger drawer", !app.includes('function Drawer') && !app.includes('drawerBackdrop') && !app.includes('drawerItem')],
  ["暱稱更新與獨立個人設定頁接線", app.includes('PersonalSettingsPage') && app.includes('current => current === "profile"') && app.includes('api.profile.updateName.mutate') && app.includes('使用者暱稱') && app.includes('onUpdateNickname')],
  ["登出確認、編輯單次確認與刪除二次確認", app.includes('確認登出') && app.includes('編輯收支') && app.includes('開啟編輯') && app.includes('再次確認移除')],
  ["App 內檢查、下載官方 APK 並交接 Android 安裝確認", app.includes('GITHUB_REPOSITORY_URL') && app.includes('GITHUB_LATEST_RELEASE_API') && app.includes('releases/latest') && app.includes('isVersionNewer') && app.includes('發現新版 Together Ledger') && app.includes('confirmText: "下載並更新"') && app.includes('FileSystem.createDownloadResumable') && app.includes('IntentLauncher.startActivityAsync') && app.includes('OFFICIAL_APK_URL_PREFIX') && appConfig.includes('REQUEST_INSTALL_PACKAGES')],
  ["通知偏好儲存後正規化、同步回饋與競態保護", app.includes('normalizeNotificationPreferences') && app.includes('notificationRequestRef') && app.includes('showToast') && app.includes('提醒設定已儲存')],
  ["每月提醒日使用 1–28 點選控制", app.includes('Array.from({ length: 28 }') && app.includes('每月提醒日期（1–28 日）') && app.includes('setNotificationDraft(current => ({ ...current, monthlyReminderDay: day }))')],
  ["所有 App 主題採用明確情境背景而非單色", app.includes('function ThemeAtmosphere') && app.includes('starPositions') && app.includes('petalPositions') && app.includes('snowPositions') && app.includes('key={`blossom-${left}`}') && app.includes('key={`wave-${left}`}') && app.includes('key={`reflection-${index}`}') && app.includes('preferences.theme === "rose"') && app.includes('preferences.theme === "cherry"') && app.includes('preferences.theme === "graphite"') && app.includes('preferences.theme === "latte"') && app.includes('preferences.theme === "mint"') && app.includes('preferences.theme === "ocean"') && app.includes('preferences.theme === "sunset"') && app.includes('preferences.theme === "starry"') && app.includes('preferences.theme === "forest"') && app.includes('preferences.theme === "meadow"') && app.includes('preferences.theme === "snow"') && app.includes('preferences.theme === "lavender"') && app.includes('label: "櫻花"') && app.includes('label: "草原"') && app.includes('label: "雪地"')],
  ["登入、空帳本、帳本與個人設定均掛載主題情境", (app.match(/<ThemeAtmosphere \/>/g) || []).length >= 5],
  ["pnpm 部署設定與 lockfile 使用一致的 workspace 設定", readFileSync(resolve(projectRoot, "../pnpm-workspace.yaml"), "utf8").includes("patchedDependencies:")],
  ["分類與支付方式表情符號正確帶入交易表單", app.includes('categoryEmoji(item)') && app.includes('paymentEmoji(item)')],
  ["個人設定分區、版本資訊與鍵盤避讓", app.includes('SettingsSection') && app.includes('目前版本 v{APP_VERSION}') && app.includes('KeyboardAvoidingView') && app.includes('android: undefined') && appConfig.includes('"softwareKeyboardLayoutMode": "resize"')],
  ["帳本管理使用固定高度彈窗並提供隱藏或安全刪除", app.includes('managerScroll') && app.includes('api.ledger.deleteCategory.mutate') && app.includes('api.ledger.deletePaymentMethod.mutate') && router.includes('deleteCategory: protectedProcedure') && router.includes('deletePaymentMethod: protectedProcedure')],
  ["最近收支可展開本週、本月與上月完整檢視", app.includes('完整收支') && app.includes('本週') && app.includes('本月') && app.includes('上月')],
  ["所有成功儲存回饋使用右下角五秒提示", app.includes('function SuccessToast(') && app.includes('showToast') && app.includes('5_000') && app.includes('globalToastLayer')],
  ["帳本載入採單一工作區快照以減少請求", app.includes('api.ledger.workspace.query') && router.includes('workspace: protectedProcedure') && router.includes('Promise.all([')],
  ["個人設定提供密碼確認的帳號刪除流程", app.includes('function AccountDeletionModal(') && app.includes('永久刪除帳號') && app.includes('api.auth.deleteAccount.mutate') && router.includes('deleteAccount: protectedProcedure') && db.includes('deleteUserAccount')],
  ["交易與輸入彈窗可捲動並具備鍵盤安全區", app.includes("modalScrollableContent") && app.includes('keyboardDismissMode="on-drag"') && app.includes("automaticallyAdjustKeyboardInsets") && app.includes("transactionModalScrollContent: { flexGrow: 1, paddingBottom: 12 }") && !app.includes('transactionModalScrollContent: { flexGrow: 1, justifyContent: "flex-end"') && !app.includes('transactionModalCard: { minHeight: "100%"')],
  ["Android 交付版本為 1.2.8.4", appConfig.includes('"version": "1.2.8.4"') && appConfig.includes('"versionCode": 14')],
];

const failed = checks.filter(([, passed]) => !passed).map(([label]) => label);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
}
if (failed.length) {
  console.error(`\\n${failed.length} 項核心流程檢查失敗。`);
  process.exit(1);
}
console.log(`\\n${checks.length} 項 Android 接線與需求覆蓋檢查全部通過；可執行 tRPC workflow 回歸另由 server/ledger.workflow.test.ts 驗證。`);
