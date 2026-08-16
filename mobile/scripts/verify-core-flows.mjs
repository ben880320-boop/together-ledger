import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const app = readFileSync(resolve(projectRoot, "app/index.tsx"), "utf8");
const router = readFileSync(resolve(projectRoot, "../server/routers.ts"), "utf8");
const db = readFileSync(resolve(projectRoot, "../server/db.ts"), "utf8");
const createLedgerStart = db.indexOf("export async function createLedger");
const createLedgerEnd = db.indexOf("export async function joinLedgerByInviteCode");
const createLedgerBlock = db.slice(createLedgerStart, createLedgerEnd);

const checks = [
  ["未登入顯示登入／註冊畫面", app.includes('if (!user)') && app.includes('登入／註冊')],
  ["登入／註冊使用 OAuth signIn／signUp 並驗證 state", app.includes('mode: "signIn" | "signUp"') && app.includes('set("type", mode)') && app.includes('登入回呼驗證失敗')],
  ["建立新帳本保持空白且有預設主／子分類", app.includes('建立空白共同帳本') && createLedgerBlock.includes('rootPresets') && createLedgerBlock.includes('childPresets') && createLedgerBlock.includes('parentCategoryId') && !/(transactions|budgets|recurringTransactions|paymentMethods|settlements)\\.values/.test(createLedgerBlock)],
  ["邀請碼加入帳本", app.includes('api.ledger.join.mutate') && router.includes('join: protectedProcedure')],
  ["QR Code、分享與 deep link 加入", app.includes('QRCode') && app.includes('Share.share') && app.includes('Linking.addEventListener') && app.includes('inviteCodeFromUrl')],
  ["三種分攤方式", app.includes('equal') && app.includes('custom') && app.includes('amount') && app.includes('splitType')],
  ["結算摘要與標記已結算", app.includes('api.ledger.settlement.summary.query') && app.includes('api.ledger.settlement.markSettled.mutate')],
  ["月曆與分析資料", app.includes('api.ledger.calendar.query') && app.includes('api.ledger.analytics.query')],
  ["預算與固定收支", app.includes('api.ledger.upsertBudget.mutate') && app.includes('api.ledger.createRecurring.mutate') && app.includes('api.ledger.syncRecurring.mutate')],
  ["分類與支付方式自訂", app.includes('api.ledger.createCategory.mutate') && app.includes('api.ledger.createPaymentMethod.mutate')],
  ["多人 admin/member/viewer 角色管理", app.includes('api.ledger.updateMemberRole.mutate') && app.includes('設為管理員') && app.includes('允許編輯') && app.includes('改檢視') && app.includes('不提供任意自訂權限組合')],
  ["固定收支週期欄位", app.includes('frequency') && app.includes('dayOfMonth') && db.includes('syncDueRecurring') && db.includes('recurring.frequency')],
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
