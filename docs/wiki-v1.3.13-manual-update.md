# Together Ledger v1.3.13 Wiki 手動更新內容

> 本檔提供 v1.3.13 的 Wiki 手動更新內容。依 Git 分支治理規範，**未直接推送** GitHub Wiki 的 `master` 分支；請在 Wiki 網頁介面貼上並發布下列段落。

## 本次應更新的 Wiki 頁面

目前 Wiki 的「開始使用」仍只描述一般電子信箱／密碼登入；「更新與疑難排解」仍顯示 v1.3.7／versionCode 30。請更新下列內容：

| Wiki 頁面 | 手動更新內容 |
| --- | --- |
| `開始使用` | 將「註冊與登入」段落替換為下方「電子郵件帳號安全」內容，並於操作表加入驗證、重寄驗證、忘記密碼與既有帳戶綁定。 |
| `更新與疑難排解` | 將最新版本改為 **v1.3.13（versionCode 36）**，新增下方「v1.3.13 更新摘要」與 Firebase 登入疑難排解項目。 |
| `Home` | 在最新更新摘要加入 v1.3.13 Firebase 電子郵件安全功能，連到更新後的「開始使用」頁。 |

## 電子郵件帳號安全

v1.3.13 起，新帳號採 Firebase Authentication 的 Email／Password 登入。註冊後請至信箱完成驗證，完成前無法登入帳本。登入畫面可以重新寄送驗證信，也能使用忘記密碼入口取得密碼重設信；流程不會顯示某個信箱是否已註冊。

若你原本使用舊版本機帳密，帳本、交易、結算和個人設定不會消失。請先以原帳密登入，前往「個人設定 → 帳戶安全」，以**相同且已完成驗證的電子信箱**登入 Firebase 後按綁定。綁定不會建立新帳本或複製資料，而是把既有帳戶安全地連到 Firebase。

Firebase 已綁定帳戶在刪除帳號前，必須重新輸入 Firebase 密碼完成近期驗證。密碼重設後請以新密碼重新登入；Android 只會在仍持有已驗證 Firebase 身份時自動換發短效 app session。

## v1.3.13 更新摘要

v1.3.13（Android versionCode 36）加入 Firebase Authentication Email／Password 流程，讓 Android App、Web 與 PWA 使用一致的註冊、Email 驗證、重寄驗證信、忘記／重設密碼與登入方式。既有帳戶必須由使用者主動以相同驗證信箱完成綁定，原帳本與收支資料不會被搬移或複製。Firebase 登入使用短效 app session；綁定、登出、重設密碼或刪除帳戶後，請依畫面提示重新登入。

| 問題 | 建議處理方式 |
| --- | --- |
| 註冊後無法登入 | 先開啟驗證信並完成 Email 驗證；可在登入頁選擇重新寄送驗證信。 |
| 沒收到驗證或重設信 | 檢查垃圾郵件匣，確認信箱拼寫，等待短暫時間後再使用重寄或忘記密碼入口。不要公開貼出驗證連結或驗證碼。 |
| 舊帳戶顯示同信箱已存在 | 先使用原本共帳密碼登入，再從個人設定以相同已驗證信箱完成 Firebase 綁定；不要重新建立帳戶。 |
| 重設密碼後仍在舊裝置登入 | 請登出並使用新密碼登入。Firebase 登入的 app session 最長一小時，Android 僅會以仍有效的 Firebase 已驗證身份換發。 |

## 管理員設定清單

| 項目 | 位置 | 必要設定 |
| --- | --- | --- |
| Email／Password | Firebase Console → Authentication → Sign-in method | 啟用 Email／Password Provider。 |
| 網站回跳 | Firebase Console → Authentication → Settings → Authorized domains | 加入 `togetherapp-hdbmsjkf.manus.space`。 |
| Android 建置設定 | GitHub repository → Settings → Secrets and variables → Actions | 建立 `EXPO_PUBLIC_FIREBASE_API_KEY`、`EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`、`EXPO_PUBLIC_FIREBASE_PROJECT_ID`、`EXPO_PUBLIC_FIREBASE_APP_ID`。 |
| 伺服器身份驗證 | Manus 專案環境變數 | 僅以 `FIREBASE_SERVICE_ACCOUNT_JSON` 保存服務帳號；不得提交至 Git 或放進 APK。 |
