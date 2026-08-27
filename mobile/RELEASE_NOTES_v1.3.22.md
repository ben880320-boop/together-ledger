# Together Ledger v1.3.22

## Google 登出帳號選擇修正

- Web、PWA 與 Android 的 Google 使用者在**主動登出**後，下一次選擇 Google 登入時會顯示帳號選擇器，不會自動沿用先前帳號。
- 此行為只套用於使用者明確登出或完成帳戶刪除後；暫時離線、逾時與其他未確認的恢復失敗不會清除本機身分，避免使用者失去重試入口。
- Web/PWA 會清除 Firebase 本機工作階段並在後續 Google 流程帶入 `select_account`；Android 同步清除原生 Google Sign-In 本機帳號狀態。伺服器仍只接收 Firebase ID Token，不會接收 Google access token、密碼或 OAuth secret。

## Android 發行資訊

- Android `versionName=1.3.22`、`versionCode=45`。
- 發行前已驗證型別檢查、單元測試、Android 核心流程、Web／PWA production build、Expo typecheck 與發布工作流程；請僅從官方 GitHub Release 下載 APK 與對應 SHA-256 校驗檔。
