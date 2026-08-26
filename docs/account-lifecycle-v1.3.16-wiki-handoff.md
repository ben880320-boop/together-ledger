# Together Ledger v1.3.16：帳戶生命週期與管理員功能 Wiki 交接

本檔案可直接作為 GitHub Wiki 的手動更新來源。依專案 Git 操作規範，不會直接寫入 Wiki 的 `master`；請在 GitHub Wiki 介面建立或更新同名頁面，再貼上本內容。

## 使用者登入與驗證

新帳號由 Firebase Email／Password 建立。註冊前會出現必須手動關閉的提醒：若超過至少 24 小時仍未完成 Email 驗證，Firebase-only 未驗證身分會由每日作業清理，因此實際刪除可能介於註冊後 24 至 48 小時。此作業絕不刪除已建立的共帳帳戶、帳本、交易或任何既有資料。

忘記密碼會先要求輸入電子信箱，完成訊息刻意不揭露該信箱是否存在。重新寄送驗證信則要求 Email 與目前密碼。請檢查收件匣與垃圾郵件匣；Firebase Hosted action page 完成後會返回登入流程。

## 記住此裝置與舊帳密遷移

勾選「記住此裝置」時，系統會保存受保護的 Firebase 工作階段與伺服器 HTTP-only cookie，效期為 30 天；不會保存任何明碼密碼。取消勾選時，Web／PWA 僅維持瀏覽器工作階段，Android 下次冷啟動需重新登入。登出、刪除帳戶與 sessionVersion 失效會撤銷所有本機恢復狀態。

歷史本機帳密只保留 30 天的遷移連結，且不以登入頁大按鈕顯示。使用者應以相同、已驗證的 Email 完成 Firebase 綁定；到期後舊密碼不再可用，以避免繞過 Firebase 的驗證、密碼重設與撤銷控制。

## 修改電子信箱

使用者在個人設定選擇「修改電子信箱」後，先輸入目前 Firebase 密碼完成近期驗證，再輸入新 Email。系統只寄送驗證連結，不會立即改寫共帳帳戶資料。使用者點擊新信箱驗證連結後，以新 Email 登入；伺服器將確認 UID 相同、Email 已驗證且未與其他帳戶衝突，才同步更新資料並撤銷舊 session。

## Web 管理員介面

管理員專用路由只存在於 Web。每一個 API 均由後端 `adminProcedure` 驗證角色，不依賴前端隱藏。管理頁僅顯示最小帳戶狀態、登入方式、最近登入時間、Firebase 綁定狀態、清理狀態與稽核資料；不得顯示密碼、Firebase UID、收據或交易明細。

帳戶刪除要求輸入 `DELETE`，管理員無法刪除自己或另一名管理員。處理成功後會寫入管理稽核紀錄；若 Firebase 身分的最佳努力清除失敗，結果也會被記錄，供後續受控處理。

## 每日未驗證身分清理啟用步驟

部署 v1.3.16 後，管理員應先確認 Web 管理頁的「未驗證身分清理」狀態，並在正式環境明確確認啟用。排程每日至少執行一次；handler 僅以受簽章的 Heartbeat callback 存取，會分頁掃描 Firebase Admin 使用者，且只刪除超過 24 小時、Email／Password、未驗證、Firebase-only 的身分。不要改成 `setInterval` 或 `node-cron`，也不要將 Firebase 服務帳號憑證寫入用戶端或版控。

> 開啟前先確認正式網站的 Firebase Authorized domains 與 Email action URL 設定正確，並保留至少一個正常登入的管理員帳戶。
