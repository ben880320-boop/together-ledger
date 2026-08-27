# Together Ledger v1.3.20

## 已撤銷登入可見性與管理員安全體驗

- Web、PWA、Android 現可辨識伺服器確認的 `sessionVersion` 撤銷，清楚說明此裝置需要重新驗證；帳本資料不會被刪除。
- 只有確認撤銷時才會清除 App session、記住此裝置偏好與 Firebase 持久身分。短暫離線、逾時或一般失敗維持原有重試與恢復行為。
- Web 管理員撤銷操作加入清晰的確認、進行中與結果狀態。若 Firebase refresh token 撤銷未完成，會顯示 App session 已撤銷、Firebase 待重試的部分完成結果，不會誤稱完整成功。
- 管理頁新增 Firebase 驗證信箱篩選、只讀安全詳情與 30 秒前景自動更新。可見資料僅限建立／最後登入時間、登入方法、驗證狀態與帳本數量；不會公開 Firebase UID、密碼、token、帳本名稱、交易、金額或收據。
- Firebase 驗證成功返回網站後，會顯示繁體中文的完成卡片與後續登入指示。實際 Firebase 寄件信與 Hosted action page 的語言、主旨與樣式，仍必須由 Firebase Console 的 Templates 設定。

## 發布資訊

- Android `versionName=1.3.20`、`versionCode=43`。
- 固定簽章與 SHA-256 檢查碼將由正式 GitHub Release 附列；僅應從官方 Release 下載 APK。
