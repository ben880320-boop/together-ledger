# Firebase 郵件範本與繁體中文設定

## 官方能力確認

Firebase Authentication 的 Email 驗證與密碼重設信，可於 Firebase Console 的 **Authentication → Templates** 修改寄件者名稱、寄件地址、回覆地址、主旨；密碼重設信亦可修改內文。寄件者名稱與主旨宜固定使用「共帳 Together Ledger」識別，避免使用者誤判為釣魚信。

Firebase Web SDK 可在呼叫 `sendEmailVerification` 或 `sendPasswordResetEmail` 前，將 Auth 實例的 `languageCode` 設為 BCP 47 語言標籤 `zh-TW`。這會要求 Firebase 使用相對應的在地化模板；用戶端說明、成功提示與自訂處理頁也應維持繁體中文。

目前產品使用 Web-first 的 Firebase action handler 與已授權的 continue URL。若日後需完全自訂驗證／重設完成頁，可在 Templates 指定受信任的自訂 action URL，再由網站以 `oobCode` 完成驗證或重設；該 URL 網域必須列入 Firebase Authorized domains。

## 建議的 Console 文字

| 類型 | 建議寄件者名稱 | 建議主旨 |
| --- | --- | --- |
| 驗證電子信箱 | 共帳 Together Ledger | 【共帳】請驗證你的電子信箱 |
| 重設密碼 | 共帳 Together Ledger | 【共帳】重設你的密碼 |

範本內應保留 Firebase 提供的 `%LINK%` 佔位符，不可手動替換為固定網址。使用者介面必須提醒：若數分鐘內未收到信件，先檢查垃圾郵件匣並回到共帳使用重寄入口。

## 一次性 Firebase Console 設定步驟

在 Firebase Console 進入 **Authentication → Templates**，分別開啟「Email address verification」與「Password reset」。每個範本均將語言切換至 **繁體中文**，並使用上表的固定寄件者名稱與主旨。驗證信與重設信都應保留 Firebase 產生的動作連結；不要自行改寫 `%LINK%`，也不要將服務帳號資訊、API 金鑰或帳號資料填進範本。

用戶端程式已在寄送驗證信與重設信前指定 `zh-TW`，但 **寄件者名稱、主旨與 Console 範本仍必須由 Firebase Console 管理員手動儲存**。這能避免版本更新時信件名稱頻繁改變，並讓使用者第一眼辨識為共帳通知。儲存後，請以測試信箱各發送一次驗證信與重設信，確認顯示的語言、主旨、寄件者與連結網域均正確。

## 本次視覺驗證

桌機 `/login` 已確認顯示「忘記密碼」與「重新寄送驗證信」入口，並在按鈕下方說明只需填寫電子信箱及檢查收件匣／垃圾郵件匣。手機瀏覽器在檢查時保有既有有效工作階段，因此依預期導向「我的帳本」而非登入頁；此結果確認已登入使用者不會被不必要地送回認證畫面。

## 官方來源

1. Firebase Help: Email templates — https://support.google.com/firebase/answer/7000714
2. Firebase: Manage users on web — https://firebase.google.com/docs/auth/web/manage-users
3. Firebase: Custom email action handlers — https://firebase.google.com/docs/auth/custom-email-handler
4. Firebase: Passing state in email actions — https://firebase.google.com/docs/auth/web/passing-state-in-email-actions
