# Together Ledger v1.3.15

## 安全記住此裝置

- Android App、Web 與 PWA 的 Firebase 登入頁新增「記住此裝置」選項；勾選後以受保護的 Firebase／App 工作階段在下次開啟時恢復登入，絕不保存明碼密碼。
- 未勾選時，Web／PWA 僅保留目前瀏覽器工作階段；Android 不會在下次冷啟動恢復登入。主動登出、帳戶刪除與 session version 失效均會撤銷本機恢復狀態。
- 請只在個人且受螢幕鎖保護的裝置勾選此選項；共用手機、公共電腦或他人可使用的瀏覽器不應勾選。

## 發布與安全性

- Android `versionName=1.3.15`、`versionCode=38`，維持固定受保護簽章與 SHA-256 檢查檔。
