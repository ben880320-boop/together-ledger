# Together Ledger v1.3.11

## 跨平台邀請、每月結算與帳本讀取加速

- 邀請 QR Code 改為 HTTPS 通用邀請頁。已安裝 Android App 時優先開啟 App；沒有 App 的使用者可以保留在 Web／PWA 邀請頁，登入後安全加入帳本。
- 結算採每月快照：一位成員提出、第二位成員確認後鎖定該月份。管理員若需更正舊資料，必須明確重新開啟該月，再重新提出與確認。
- 工作區減少重複讀取與不必要重繪，保留 SSE 同步、節流輪詢備援、離線快照與草稿保護。

## 發布與安全性

- Android `versionName=1.3.11`，`versionCode=34`。
- 官方 APK 維持固定受保護簽章，GitHub Release 會附上 `together-ledger.apk.sha256` 校驗檔。
