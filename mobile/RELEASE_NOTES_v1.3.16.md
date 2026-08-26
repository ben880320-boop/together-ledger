# Together Ledger v1.3.16

## 帳戶生命週期與跨平台安全

- 修正 Web／PWA 記住此裝置登入缺少伺服器持久工作階段參數的問題；受保護 Firebase persistence 與 HTTP-only cookie 會一併保留 30 天，未選取則維持短期工作階段，密碼不會被保存。
- 忘記密碼與重新寄送驗證改為先輸入 Email 的對話框；重寄驗證另要求目前密碼。註冊前會顯示須手動關閉的未驗證身分清理提醒。
- 新增修改電子信箱的兩步流程：目前 Firebase 密碼近期驗證後，輸入新信箱寄發驗證連結；驗證完成後以新信箱重新登入，伺服器只同步同一 Firebase UID 的已驗證 Email。
- 既有本機帳密入口調整為 30 天的低顯著遷移連結；遷移期到期後，伺服器會阻止舊本機密碼登入，避免繞過 Firebase 的驗證與撤銷機制。

## Web 專用管理員保護

- Web 新增後端 `adminProcedure` 保護的帳戶管理頁，可查看最小化帳戶狀態、搜尋、清理工作狀態與稽核紀錄。
- 管理員刪除帳戶需要輸入 `DELETE`，不能刪除自己或其他管理員；不會在畫面顯示密碼、Firebase UID、收據或交易明細。
- 每日未驗證 Firebase Email／Password 身分清理 handler 已完成。它只會處理超過 24 小時、未驗證且尚未建立共帳帳戶的 Firebase-only 身分；正式排程須於部署後由管理員確認啟用。

## 發布

- Android `versionName=1.3.16`、`versionCode=39`。
- 官方 APK 發布後請從 GitHub Release 下載 `together-ledger.apk`，並比對該 Release 的 SHA-256 校驗值。
