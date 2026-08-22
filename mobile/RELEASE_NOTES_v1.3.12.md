## Android 鍵盤穩定性與月結算摘要

- Android 輸入畫面改由原生 `resize` 管理鍵盤尺寸，避免鍵盤收合時 JavaScript 與原生避讓重複套用造成的版面上下抖動；iOS 仍保留 `padding` 避讓。
- Android App、Web 與 PWA 的帳本總覽新增醒目的「本月待結算」摘要，呈現月份、付款方向、待結算差額與快照狀態。
- 結算歷史新增月份與狀態篩選，可查閱待確認、已鎖定與已重新開啟的每月快照；既有提出、第二位成員確認、管理員重新開啟、帳本權限與版本衝突保護維持不變。

## 發布與安全性

- Android `versionName=1.3.12`，`versionCode=35`。
- 官方 APK 維持固定受保護簽章，GitHub Release 會附上 `together-ledger.apk.sha256` 校驗檔。
