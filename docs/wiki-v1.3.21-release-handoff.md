# Together Ledger v1.3.21 Wiki 更新交接稿

> 本文件是提供 GitHub Wiki 維護者貼入或改寫的交接稿。它不含 OAuth 用戶端識別碼、任何 secret、Firebase UID、帳戶資料或帳務資料。

## 版本摘要

**v1.3.21（Android versionCode 44）** 提供 Web、PWA 與 Android 一致的 Google Firebase 登入、供應者感知的近期重新驗證、獨立固定的公開首頁主題，以及更精確且隱私最小化的管理安全資訊。

## 登入與帳戶安全

使用者可選擇 Firebase Email／Password，或 Google 登入。Email／Password 新帳戶必須完成 Email 驗證；Google 帳戶由 Firebase Google 供應者驗證。三個平台共用同一帳戶與帳本資料。

刪除帳號等敏感操作一律要求五分鐘內的近期 Firebase 驗證。Email／Password 帳戶會要求 Firebase 密碼重新驗證；Google 帳戶會開啟 Google 供應者重新驗證，**不應要求使用者輸入不存在的共帳密碼**。系統不儲存明文密碼、Google access token 或 OAuth secret；伺服器只驗證 Firebase ID Token。

若既有共帳本機帳戶的 Email 與 Google 帳戶相同，系統不會自動合併。使用者應先以原本帳戶登入，再依帳戶安全頁的明確流程處理，避免帳本權限被靜默轉移。

Web／PWA 優先使用登入視窗；行動瀏覽器封鎖登入視窗時，會改用 Firebase redirect 回呼。登入前選擇的「記住此裝置」與邀請連結導向會被保留。暫時離線或逾時不會清除記住裝置；只有伺服器確認的 session 撤銷、主動登出或帳戶刪除才會清除。

## 公開首頁與主題

公開首頁採用固定、獨立的品牌視覺主題。使用者在帳本或個人設定選擇的主題只影響已登入的工作區，不會影響訪客首頁、登入前的資訊或下載入口。

## 管理員帳戶與撤銷登入稽核

管理員 Web 頁的帳戶詳情區分：

| 指標 | 定義 |
| --- | --- |
| 擁有帳本數量 | 目前 `createdBy` 為該使用者的帳本數量；所有權轉讓後即時反映。 |
| 參與帳本數量 | 使用者目前仍是成員、且該帳本並非目前由自己擁有的帳本數量。 |

「撤銷登入稽核」僅限管理員查看，可依 7／30／90 天或自訂最多 90 天期間、以及 complete／partial／failed／unknown 結果篩選。它只保留去識別化事件摘要、建立時間與衍生結果，協助追蹤安全操作；不會顯示使用者或管理員 ID、電子信箱、Firebase UID、token、密碼／雜湊、IP、帳本、交易、金額、收據或其他帳務明細。

## 維運檢查清單

1. Firebase Authentication 的 Google 供應者必須啟用。
2. Firebase Authorized domains 必須保留正式網站網域，讓 Web／PWA redirect 與 Email 動作安全返回。
3. Android 發行應由受保護的 GitHub Actions 固定簽章流程建立，並使用對應 Firebase Android 設定。
4. 發行前在 GitHub Actions 設定 Android 建置所需的 Web OAuth client ID secret；絕不將 secret、token 或憑證寫入 Wiki、README、程式碼或 Release note。
5. 維運人員應僅從正式 GitHub Release 下載 APK，並比對 Release 提供的 SHA-256。

## 驗證範圍

v1.3.21 的發行前驗收涵蓋 TypeScript、單元測試、Android 核心流程、Web/PWA 建置、Android 型別檢查與 Git 差異完整性。實際 Google 登入、重新驗證及帳戶刪除必須只以專用非管理測試帳戶驗證，切勿對真實或管理員帳戶做破壞性測試。
