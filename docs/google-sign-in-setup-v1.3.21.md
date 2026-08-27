# Google 登入整合前置設定（v1.3.21）

## 官方依據

- Firebase Authentication — Google Sign-In（Web）：<https://firebase.google.com/docs/auth/web/google-signin>
- Expo — Using Google authentication（Android）：<https://docs.expo.dev/guides/google-authentication/>

## 已確認的整合邊界

Web/PWA 由 Firebase JavaScript SDK 的 `GoogleAuthProvider` 啟動 Google OAuth，取得 Firebase ID Token 後沿用既有伺服器端 Firebase Admin 驗證與共帳 App session 交換流程。Firebase 會以 Google 提供的已驗證 email 建立／識別 Firebase 身分；伺服器仍會驗證 Firebase ID Token，且不接收 Google access token、密碼或 Firebase UID 作為應用程式資料。

Android 原生 Google 登入需使用 Expo 官方建議的具原生設定外掛程式庫與 development/production build；不可在 Expo Go 視為可驗收目標。正式 Android 發布前，Firebase／Google Cloud 必須登錄固定簽章 APK 的 SHA-1 指紋，並保留 `google-services.json` 給建置環境。

## 2026-08-27 設定驗證紀錄

使用者提供的 Firebase Console 與 Google Cloud Console 截圖確認：Android App 的套件名稱為 `com.togetherledger.app`、固定簽章 SHA-1 已登錄，且 Google Cloud 中的 Android OAuth client 與 Web OAuth client 類型各自獨立。使用者重新下載的 `google-services.json` 已包含 Android 原生 OAuth client，並已通過本專案的非敏感類型對照測試；OAuth Client ID 與任何 client secret 均不記錄於本文件。

Web OAuth client 的截圖只顯示 localhost 與 Firebase Auth 網域的 JavaScript 來源。因此，上線前仍須在 Firebase Authentication 的 Authorized domains 加入 `togetherapp-hdbmsjkf.manus.space`；若改用 Google Cloud 直接管理 Web OAuth 來源，也應加入相同的 HTTPS origin，且不得新增路徑、查詢字串或尾端斜線。

## 管理員需完成的 Firebase Console 設定

1. 在 Firebase Console 的 **Authentication → Sign-in method** 啟用 **Google**。
2. 在 **Authentication → Settings → Authorized domains** 保留 `together-ledger-8a616.firebaseapp.com` 並加入正式 Web/PWA 網域 `togetherapp-hdbmsjkf.manus.space`。
3. 在 Firebase／Google Cloud 專案為 Android 套件 `com.togetherledger.app` 登錄固定簽章 APK 的 SHA-1；若使用 Google Play App Signing，亦需登錄 Play 提供的正式簽章 SHA-1。

## 敏感操作重新驗證原則

帳戶刪除與變更信箱均要求 Firebase 最近重新驗證：Email／密碼帳戶輸入密碼；Google 帳戶重新開啟 Google 授權選擇器並取得新的 Firebase `auth_time`。這不是免驗證，而是不要求不適用於 Google 帳戶的密碼。重新驗證不足時，伺服器拒絕操作並提供可重試入口。

## 原生實作依據與發行前檢核（2026-08-27）

Expo 官方建議 Android 以 `react-native-nitro-google-signin` 或 `@react-native-google-signin/google-signin` 的原生模組實作 Google 登入；兩者都需要 Expo config plugin 與自訂原生建置，不能以 Expo Go 作為驗收環境。[1] 本版採用後者的 Firebase 設定檔整合：config plugin 使用既有的 `android.googleServicesFile`，不在程式碼保存任何 Google secret。

Firebase Android 文件要求原生 Credential Manager／Google Sign-In 使用 Firebase **Web OAuth client** 作為 server client ID 取得 Google ID token，該 token 僅在裝置內交換為 Firebase credential；Android OAuth client 與 SHA-1 則維持作為 Android 應用程式與簽章識別。[2] 因此不可把 Android client ID 當成 server client ID，也不可把 Google access token 傳送至共帳伺服器。

Firebase Web 文件建議 Web／PWA 使用 `GoogleAuthProvider`：桌面可使用 popup、行動瀏覽器優先 redirect；若遇同 email 的不同 Firebase provider 衝突，必須要求使用者先以既有方式登入再明確連結，禁止自動合併。[3] Expo AuthSession 文件也指出隱式 token flow 僅供舊式相容用途，現代流程應以 OAuth code+PKCE 或原生 provider；本版 Android 將以原生 Google Sign-In 取代先前的隱式 AuthSession 構想。[4]

| 發行前項目 | 要求 |
| --- | --- |
| Android Firebase 設定 | `google-services.json` 含正確 Android OAuth client，並維持 `com.togetherledger.app` 與固定 APK SHA-1。 |
| Android runtime | 以 development／release APK 驗證；Expo Go 不列為 Google 登入驗收結果。 |
| Web/PWA | Firebase Authentication Authorized domains 必須有 `togetherapp-hdbmsjkf.manus.space`；自訂網域啟用時亦須另行加入。 |
| 隱私界線 | App server 僅接收 Firebase ID token；不接收或儲存 Google access token、OAuth secret、Firebase UID 或 provider 原始個資。 |

## 參考資料

[1] [Expo：Using Google authentication](https://docs.expo.dev/guides/google-authentication/)

[2] [Firebase：Authenticate with Firebase using Google on Android](https://firebase.google.com/docs/auth/android/google-signin)

[3] [Firebase：Authenticate with Firebase using Google on the web](https://firebase.google.com/docs/auth/web/google-signin)

[4] [Expo：Authentication with OAuth or OpenID providers](https://docs.expo.dev/guides/authentication/)
