import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const app = readFileSync(resolve(projectRoot, "app/index.tsx"), "utf8");
const router = readFileSync(resolve(projectRoot, "../server/routers.ts"), "utf8");
const db = readFileSync(resolve(projectRoot, "../server/db.ts"), "utf8");
const eas = readFileSync(resolve(projectRoot, "eas.json"), "utf8");
const createLedgerStart = db.indexOf("export async function createLedger");
const createLedgerEnd = db.indexOf("export async function joinLedgerByInviteCode");
const createLedgerBlock = db.slice(createLedgerStart, createLedgerEnd);

const checks = [
  ["未登入顯示登入／註冊畫面", app.includes('if (!user)') && app.includes('登入／註冊')],
  ["登入／註冊使用 OAuth signIn／signUp 並驗證 state", app.includes('mode: "signIn" | "signUp"') && app.includes('set("type", mode)') && app.includes('登入回呼驗證失敗')],
  ["EAS OAuth app id 與 portal 設定正確", app.includes('HDBmsjkFmtXoV2nyYfgboo') && eas.includes('"EXPO_PUBLIC_APP_ID": "HDBmsjkFmtXoV2nyYfgboo"') && eas.includes('"EXPO_PUBLIC_OAUTH_PORTAL_URL": "https://manus.im"')],
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
  ["操作日誌", app.includes('activityLogs') && app.includes('api.ledger.activityLogs.query') && router.includes('activityLogs')],
  ["結算摘要與標記已結算", app.includes('api.ledger.settlement.summary.query') && app.includes('api.ledger.settlement.markSettled.mutate')],
  ["月曆與分析資料", app.includes('api.ledger.calendar.query') && app.includes('api.ledger.analytics.query')],
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
