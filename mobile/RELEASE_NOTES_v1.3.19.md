# Together Ledger v1.3.19

## 記住裝置：短效工作階段可安全恢復

- Web、PWA 與 Android 的「記住此裝置」現在會在一小時短效 App 工作階段到期後，使用仍有效的 Firebase 持久身分安全換發新的短效工作階段。
- 暫時網路異常不會清除記住裝置狀態，因此回復連線後仍可重試；主動登出、帳戶刪除、明確 Firebase 撤銷／失效與管理員撤銷全部登入才會清除恢復狀態。
- 此功能不保存明碼密碼。請僅在自己的、受螢幕鎖保護的裝置勾選「記住此裝置」。

## Web 管理與安全觀測

- Web 管理員可搜尋與篩選帳戶，並對非管理員、非本人帳戶輸入 `REVOKE` 後撤銷所有登入。
- 撤銷會同步使 App session 與 Firebase refresh token 失效；管理員本人及其他管理員帳戶均不可由此操作撤銷。
- 管理端顯示的作業事件只含事件種類、來源、結果與錯誤代碼的匿名彙總；不包含 Email、Firebase UID、帳本、交易、金額、密碼或憑證。

## 發布

- Android `versionName=1.3.19`、`versionCode=42`。
- 官方 APK 發布後請從 GitHub Release 下載 `together-ledger.apk`，並比對同頁 SHA-256 校驗值。
