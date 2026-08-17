# 共帳 Together Ledger

**Together Ledger** 是一款專為情侶與兩人共同生活設計的 Android 共用記帳 App。它將共同支出、收入、分攤、預算、出遊規劃與結算集中在同一本帳本，協助兩人清楚掌握「這筆錢由誰支付、如何分攤、目前誰應該結算給誰」。

> App 首次開啟會先顯示登入畫面。登入後若尚未建立或加入帳本，畫面會維持空白，不會自動建立示範交易或虛構資料。

## 下載最新版本

請從 [GitHub Releases](https://github.com/ben880320-boop/together-ledger/releases) 下載最新的 `together-ledger-<版本>-release.apk`。Android 可能會在首次安裝非商店來源的 APK 時要求允許此來源安裝應用程式；請只安裝本專案 Release 頁面所提供的檔案，並可比對同頁的 SHA-256 檢查碼。

| 安裝步驟 | 說明 |
| --- | --- |
| 1 | 下載最新 Release 所附的 APK。 |
| 2 | 在 Android 裝置開啟下載完成的 APK。 |
| 3 | 若系統詢問，僅對使用的瀏覽器或檔案管理器允許安裝未知來源 App。 |
| 4 | 完成安裝後開啟 App，使用登入頁建立或登入帳戶。 |

App 會在登入後檢查 GitHub 最新正式 Release；若偵測到較高版本，會顯示更新提示並可直接開啟下載頁。個人設定頁也提供 GitHub 專案頁與下載頁入口。

## 核心功能

| 功能 | 使用方式 |
| --- | --- |
| 共同帳本 | 建立空白帳本，或輸入邀請碼加入另一半的帳本。邀請碼可直接點選複製與分享。 |
| 收入、支出與分攤 | 新增收入或支出，選擇分類、支付方式、日期與分攤規則；交易可編輯或刪除，避免重複或誤輸入。 |
| 結算與分析 | 從總覽查看雙方支付摘要與建議結算金額，並在分析頁檢視支出結構。 |
| 月曆、預算與規劃 | 以月曆查看交易，設定每月預算、固定收支，或建立不納入每月預算的出遊規劃。 |
| 分類與支付方式 | 可搜尋、編輯、停用及新增個人化分類與支付方式；設定的表情符號會顯示在交易表單與清單中。 |
| 成員與權限 | 支援持有者、管理員、一般成員與檢視者角色；持有者可重新命名帳本、轉讓權限或刪除帳本。 |
| 個人化介面 | 可調整主題、字體、文字大小、卡片與底部導覽樣式。星空主題含深色星光效果，海洋主題含深海與波浪背景。 |

## 提醒與通知

通知預設為關閉。使用者可在 **個人設定 → 提醒與通知** 分別開啟收入通知、支出通知與每月結算提醒，並設定通知金額門檻。每月提醒日採 1 至 28 日的直接點選方式，避免輸入單位數或空白時意外回復為 1 日。

第一次啟用任何通知時，Android 會要求系統通知權限。若未授權，App 會保留提示並不會將通知設定誤標示為成功。儲存成功後，設定頁會顯示同步完成回饋；重新開啟頁面時會以伺服器已儲存的偏好為準。

## 隱私與資料使用

帳本、交易、成員與通知偏好僅用於提供共帳同步、結算與提醒功能。相機與相簿存取只會在使用者主動選擇掃描收據或從相簿選取收據時請求；通知權限只會在使用者啟用提醒功能時請求。請勿將帳本邀請碼分享給不信任的對象。

## 開發與驗證

本專案採用 Expo SDK 54、React Native、TypeScript、tRPC 與 MySQL。請在 repository 根目錄安裝依賴後執行下列檢查。

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm test
pnpm exec tsx mobile/scripts/verify-core-flows.mjs
```

GitHub Actions 會在推送至 `main` 或手動觸發時建立 Android standalone release APK、驗證 Android 版本與內嵌 JavaScript bundle，接著建立或更新對應的 GitHub Release。詳細設定請見 [Android 建置工作流程](../.github/workflows/android-apk.yml)。

## 專案連結

| 資源 | 連結 |
| --- | --- |
| GitHub 專案 | <https://github.com/ben880320-boop/together-ledger> |
| 最新版本下載 | <https://github.com/ben880320-boop/together-ledger/releases> |
| 問題回報 | <https://github.com/ben880320-boop/together-ledger/issues> |

## 授權與回饋

歡迎透過 GitHub Issues 回報錯誤或提出功能建議。請勿在 Issue 中張貼帳本邀請碼、登入憑證、通知 token 或其他個人資料。
