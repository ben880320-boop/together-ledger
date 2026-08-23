# Together Ledger v1.3.13

## Firebase 電子郵件帳號安全

- Android App、Web 與 PWA 改以 Firebase Authentication Email／Password 建立新帳號。註冊後會寄送 Email 驗證信，完成驗證才可登入共帳。
- 登入頁提供重寄驗證信，以及不揭露帳號是否存在的忘記／重設密碼流程。重設完成後必須以新密碼重新登入。
- 既有本機帳密使用者可在「個人設定 → 帳戶安全」以相同已驗證信箱綁定 Firebase；使用者 ID、帳本關聯、交易、成員資格及個人設定都會保留。
- Firebase session 會交換為一小時短效 app session，並以 session version 在伺服器集中驗證。綁定或安全事件後，先前 app session 會失效；Android 僅在 Firebase 已驗證身份仍可使用時自動換發。
- Firebase 已綁定帳戶刪除前必須重新輸入 Firebase 密碼。伺服器會驗證五分鐘內的 Firebase ID Token、UID 與信箱一致性，然後刪除 app 帳戶與 Firebase identity。

## 發布與安全性

- Android `versionName=1.3.13`、`versionCode=36`。
- GitHub Actions 僅注入 Firebase client 公開設定；Firebase 服務帳號 JSON 仍僅存在於伺服器環境，不會進入 APK。
- 請於 Firebase Console 的 **Authentication → Settings → Authorized domains** 加入 `togetherapp-hdbmsjkf.manus.space`，讓驗證／重設信的 Hosted action page 可安全導回登入頁。
