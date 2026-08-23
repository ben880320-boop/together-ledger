# Firebase Authentication 整合依據

本文件記錄 Together Ledger 導入 Firebase Authentication 的官方技術依據，供後續實作與安全審查使用。

| 主題 | 採用原則 | 官方來源 |
| --- | --- | --- |
| Email／Password | 在 Firebase Console 啟用 Email/Password；以 Firebase SDK 建立與登入帳號。 | [Password-Based Accounts](https://firebase.google.com/docs/auth/web/password-auth) |
| Email 驗證與重設密碼 | 使用 Firebase 提供的驗證與密碼重設郵件流程，避免自行寄送或保存一次性密碼。 | [Password-Based Accounts](https://firebase.google.com/docs/auth/web/password-auth) |
| 後端識別 | 用戶端經 HTTPS 將 Firebase ID Token 傳給 Together Ledger 後端；後端必須驗證簽章、受眾、簽發者、到期與 UID，不能信任用戶端自行提供的使用者 ID。 | [Verify ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) |
| 登入撤銷 | 密碼重設會由 Firebase 撤銷既有 refresh token；後端如須立即阻擋被撤銷 token，應在驗證時啟用 revocation check。 | [Manage User Sessions](https://firebase.google.com/docs/auth/admin/manage-sessions) |
| Expo 跨平台 | 採 Firebase JS SDK，因其適用於 Expo、Android、iOS 與 Web 的通用 Authentication 情境；Expo 官方指明 SDK 54 應使用 Firebase 12 以上版本。 | [Using Firebase](https://docs.expo.dev/guides/using-firebase/) |
| Android 登入持久化 | Android 以 Firebase Auth 的 React Native 條件匯出配合 AsyncStorage 保存 Firebase refresh state；Together Ledger 仍只將自己的 app session 放入 SecureStore，且每次重新換發都由伺服器驗證 Firebase ID Token。 | [Using Firebase](https://docs.expo.dev/guides/using-firebase/) |

## 安全決策

不以 Firebase UID 直接取代既有資料庫使用者 ID。後端將在首次通過驗證的 Firebase UID 時，明確執行一次帳號連結；既有帳本與成員關係仍以 Together Ledger 的使用者資料列為唯一來源。登入與綁定失敗均以可理解的通用訊息回應，並在 Firebase Console 啟用 email enumeration protection，以降低由錯誤訊息推測帳號是否存在的風險。

Firebase Web 設定值可置於前端設定，但 Admin SDK 私鑰或服務帳號 JSON 僅能置於伺服器環境變數，絕不寫入版本控制或行動端程式。

Android 端不得自行保存 Firebase 密碼、ID Token 或 refresh token。Firebase SDK 以其 React Native 持久化介面管理登入狀態；應用程式只在需要建立 Together Ledger session 時取得短期 ID Token，交由後端的 Admin SDK 完成驗證與帳號連結。
