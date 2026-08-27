# 共帳 Together Ledger

**Together Ledger** 是一款專為情侶與兩人共同生活設計的 Android 共用記帳 App。它將共同支出、收入、分攤、預算、出遊規劃與結算集中在同一本帳本，協助兩人清楚掌握「這筆錢由誰支付、如何分攤、目前誰應該結算給誰」。

> App 首次開啟會先顯示登入畫面。登入後若尚未建立或加入帳本，畫面會維持空白，不會自動建立示範交易或虛構資料。

## 下載最新版本

請從 [GitHub Releases](https://github.com/ben880320-boop/together-ledger/releases) 下載最新的 `together-ledger.apk`。目前正式版本為 **v1.3.21**（versionCode 44）。Android 可能會在首次安裝非商店來源的 APK 時要求允許此來源安裝應用程式；請只安裝本專案 Release 頁面所提供的檔案，並可比對同頁的 SHA-256 檢查碼。

| 安裝步驟 | 說明 |
| --- | --- |
| 1 | 下載最新 Release 所附的 APK。 |
| 2 | 在 Android 裝置開啟下載完成的 APK。 |
| 3 | 若系統詢問，僅對使用的瀏覽器或檔案管理器允許安裝未知來源 App。 |
| 4 | 完成安裝後開啟 App，使用登入頁建立或登入帳戶。 |

App 會在登入後檢查 GitHub 最新正式 Release；若偵測到較高版本，會顯示更新內容與安全性摘要、官方來源、下載進度、SHA-256 校驗提示及安裝診斷。個人設定頁也提供 GitHub 專案頁、版本下載與 Wiki 入口。v1.3.21 新增原生 Google Firebase 登入與供應者重新驗證；Google 帳戶執行刪除帳號等敏感操作時，需重新登入 Google／Firebase，而非輸入不存在的共帳密碼。伺服器只接收 Firebase ID Token，不接收或保存 Google access token。已確認撤銷登入時會顯示明確說明並清除記住裝置狀態；帳本資料不會被刪除。暫時網路錯誤不會清除記住狀態。勾選記住此裝置只保存受保護工作階段、從不保存密碼；請只在個人且有螢幕鎖保護的裝置選取。

## 登入與敏感操作

首次開啟可使用 Email／Password 註冊或登入，或直接選擇 Google 登入。Email／Password 新帳號必須完成 Firebase Email 驗證；Google 帳戶則由 Firebase 的 Google 供應者驗證。既有本機帳戶不會因同名 Google 電子信箱而被自動合併，請使用原本方式登入並依帳戶安全流程處理。

刪除帳號必須通過五秒倒數的最終確認，並要求五分鐘內完成的近期身分驗證：Email／Password 帳戶會要求 Firebase 密碼重新驗證，Google 帳戶則啟動 Google 供應者重新驗證。此流程不會保存明文密碼、Google token 或 OAuth secret。

## 核心功能

| 功能 | 使用方式 |
| --- | --- |
| 共同帳本 | 建立空白帳本，或輸入邀請碼加入另一半的帳本。邀請碼可直接點選複製與分享。 |
| 收入、支出與分攤 | 新增收入或支出，選擇分類、支付方式、日期與分攤規則；交易可編輯或刪除，避免重複或誤輸入。 |
| 結算與分析 | 從總覽查看雙方支付摘要與建議結算金額，並在分析頁檢視支出結構。 |
| 月曆、預算與規劃 | 以月曆查看交易，設定每月預算、固定收支，或建立不納入每月預算的出遊規劃。 |
| 分類與支付方式 | 可搜尋、編輯、停用及新增個人化分類與支付方式；設定的表情符號會顯示在交易表單與清單中。 |
| 成員與權限 | 支援持有者、管理員、一般成員與檢視者角色；持有者可重新命名帳本、轉讓權限或刪除帳本。 |
| 個人化介面 | 可調整主題、字體、文字大小、卡片與底部導覽樣式。所有主題皆有情境背景：玫瑰柔光、櫻花花瓣、石墨線條、拿鐵奶泡、薄荷植感、海洋波浪、夕陽地平線、深色星光、森林樹影、草原丘陵、雪地飄雪與薰衣草花田。Google 帳戶只顯示適用的帳戶安全控制項。 |

## 提醒與通知狀態

收入、支出、結算與預算門檻提醒目前已在 Android、網頁與 PWA **暫時停用**。因此 App 不會要求通知權限，個人設定也不會顯示通知偏好、裝置註冊或投遞診斷。既有帳本、交易、預算與規劃資料不受影響；若日後恢復通知服務，將另行發布權限與失敗排查指引。

## 主題情境

各主題的情境圖層會套用到登入、我的帳本、帳本內容與個人設定畫面，同時保留卡片與文字的對比度。星空的星點為唯一的低頻動畫；其餘景物以靜態幾何圖層呈現，避免影響滑動與記帳輸入的流暢性。若系統要求減少動態效果，星點會維持靜態。

## 隱私與資料使用

帳本、交易與成員資料僅用於提供共帳同步與結算功能。相機與相簿存取只會在使用者主動選擇掃描收據或從相簿選取收據時請求；目前版本不會要求通知權限。請勿將帳本邀請碼分享給不信任的對象。

「協助回報技術錯誤」位於「我的帳本 → 個人設定 → 帳戶與支援」，**預設關閉**。只有使用者閱讀說明後明確開啟，App 才會傳送平台、App 版本、錯誤代碼、技術訊息及已遮蔽的堆疊資訊，用於排查程式問題；不會傳送帳本、收支、金額、邀請碼、帳號、電子信箱、密碼、憑證或收據圖片。使用者可隨時再次關閉，伺服器也會在儲存前再驗證同意狀態與遮蔽敏感字串。

## 開發與驗證

本專案採用 Expo SDK 54、React Native、TypeScript、tRPC 與 MySQL。請在 repository 根目錄安裝依賴後執行下列檢查。

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm test
pnpm exec tsx mobile/scripts/verify-core-flows.mjs
```

GitHub Actions 會在推送至 `main` 或手動觸發時建立 Android standalone release APK、驗證 Android 版本與內嵌 JavaScript bundle，接著建立或更新對應的 GitHub Release。Google 原生登入建置需使用 Firebase 專案對應的 `google-services.json`，並在 GitHub Actions 設定僅供建置使用的 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` secret；不得在文件、程式碼或 Release 內容揭露 OAuth client secret、使用者 token 或其他憑證。詳細設定請見 [Android 建置工作流程](../.github/workflows/android-apk.yml) 與 [Google 登入設定文件](../docs/google-sign-in-setup-v1.3.21.md)。

## 專案連結

| 資源 | 連結 |
| --- | --- |
| GitHub 專案 | <https://github.com/ben880320-boop/together-ledger> |
| 最新版本下載 | <https://github.com/ben880320-boop/together-ledger/releases> |
| 使用說明 Wiki | <https://github.com/ben880320-boop/together-ledger/wiki> |
| 問題回報 | <https://github.com/ben880320-boop/together-ledger/issues> |

## 授權與回饋

歡迎透過 GitHub Issues 回報錯誤或提出功能建議。請勿在 Issue 中張貼帳本邀請碼、登入憑證、通知 token 或其他個人資料。
