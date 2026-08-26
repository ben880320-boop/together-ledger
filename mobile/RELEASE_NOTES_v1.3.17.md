# Together Ledger v1.3.17

## 帳戶刪除修復

- 修正 Firebase Email／Password 帳戶輸入目前密碼完成近期驗證後，仍無法在 Web、PWA 與 Android 自行刪除帳戶的後端資格判定錯誤。
- 只有具 Firebase UID 的 Email／Password 帳戶可進入自刪流程；Google 等非密碼帳戶仍會收到明確、可理解的保護訊息，不會靜默失敗。
- 刪除成功後仍會撤銷工作階段、依既有規則移交或移除帳本資料，並以最佳努力刪除 Firebase 身分。

## 發布

- Android `versionName=1.3.17`、`versionCode=40`。
- 官方 APK 發布後請從 GitHub Release 下載 `together-ledger.apk`，並比對同頁 SHA-256 校驗值。
