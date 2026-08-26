# Together Ledger v1.3.18

## 帳戶刪除：倒數最終確認與安全告別

- Web、PWA 與 Android 現在會在輸入目前密碼後，顯示五秒倒數的最終確認畫面。
- 倒數只解除永久刪除按鈕的鎖定；**不會自動刪除帳戶**。你可隨時取消並保留帳戶與帳本資料。
- 成功刪帳後會安全撤銷本機與 Firebase 工作階段、返回登入入口，並顯示可關閉的友善告別訊息。
- Firebase Email／Password 帳戶仍必須完成近期驗證；Google 等非密碼登入帳戶依然不能以密碼自刪。

## 發布

- Android `versionName=1.3.18`、`versionCode=41`。
- 官方 APK 發布後請從 GitHub Release 下載 `together-ledger.apk`，並比對同頁 SHA-256 校驗值。
