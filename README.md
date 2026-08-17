# 共帳 Together Ledger

**Together Ledger** 是專為情侶與兩人共同生活打造的 Android 共用記帳 App。它以共享帳本為核心，將收入、支出、支付方式、分攤、預算、出遊規劃與結算整理在同一個空間，協助兩人快速看懂目前的共同花費與應結算金額。

> 登入後若尚未建立或加入帳本，App 會維持空白帳本狀態；不會建立示範帳本、預設交易或虛構收支資料。

## 下載與安裝

請前往 [GitHub Releases](https://github.com/ben880320-boop/together-ledger/releases) 下載最新的 `together-ledger-<版本>-release.apk`。Android 安裝非商店來源 APK 時，可能要求允許使用中的瀏覽器或檔案管理器安裝未知來源應用程式。請只下載本 repository Release 頁面中的 APK，並比對同頁公布的 SHA-256 檢查碼。

| 步驟 | 說明 |
| --- | --- |
| 1 | 下載最新 Release 所附的 APK 檔。 |
| 2 | 在 Android 裝置開啟檔案並依系統提示安裝。 |
| 3 | 開啟 App，先完成登入；再建立空白帳本或輸入邀請碼加入共同帳本。 |
| 4 | 若 App 偵測到 GitHub 有較新 Release，依畫面提示前往下載頁更新。 |

## 功能一覽

| 類別 | 內容 |
| --- | --- |
| 共同帳本 | 建立帳本、邀請碼加入與分享、成員角色管理、持有者轉讓與安全退出。 |
| 收支記錄 | 收入與支出新增、編輯、移除、月曆瀏覽、分類與支付方式表情符號。 |
| 分攤與結算 | 支援平均、自訂金額、比例與無分攤，提供支付摘要與結算建議。 |
| 預算與規劃 | 每月預算、固定收支，以及不納入月預算的出遊規劃。 |
| 個人化 | 9 種主題、字體、文字大小、卡片與底部導覽樣式；星空與海洋含情境背景。 |
| 通知 | 收入、支出與月結算提醒，支援金額門檻和每月 1–28 日直接點選。 |

## 通知與隱私

通知功能預設關閉，使用者可以在個人設定中個別啟用收入、支出與每月結算提醒。第一次開啟提醒時，Android 才會要求通知權限；若未取得權限，App 會提示而不會將儲存誤標為成功。設定會同步至伺服器，重新開啟設定頁時會顯示已儲存的偏好。

帳本、交易、成員及通知偏好僅用於提供共同記帳、結算與提醒功能。收據相機與相簿權限只會在使用者主動掃描或選取收據時請求。請勿公開帳本邀請碼、登入憑證或裝置通知 token。

## 開發與驗證

本專案使用 Expo SDK 54、React Native、TypeScript、Node.js、tRPC 與 MySQL。完整行動端操作與開發說明請見 [mobile/README.md](mobile/README.md)。

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm test
pnpm exec tsx mobile/scripts/verify-core-flows.mjs
```

推送至 `main` 或從 GitHub Actions 手動執行 **Android APK** 工作流程，即會建立 standalone release APK、驗證版本資訊並建立或更新對應的 GitHub Release。

## 連結與回饋

| 資源 | 連結 |
| --- | --- |
| 專案首頁 | <https://github.com/ben880320-boop/together-ledger> |
| 最新 APK | <https://github.com/ben880320-boop/together-ledger/releases> |
| 問題回報 | <https://github.com/ben880320-boop/together-ledger/issues> |

歡迎透過 GitHub Issues 提出錯誤報告與功能建議。請不要在公開 Issue 中貼出任何私人帳本資料。
