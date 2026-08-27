# Together Ledger v1.3.21

## Google 登入與近期身分驗證

- Web、PWA 與 Android 新增 Firebase Google 登入。僅交換 Firebase ID token；不保存 Google access token、密碼或 Firebase UID。
- Google 帳戶進行帳戶刪除時，須完成五分鐘內的 Google provider 重新驗證；電子信箱／密碼帳戶維持原有密碼重新驗證。兩種路徑都會驗證 Firebase UID、已驗證電子信箱與近期驗證時間。
- Android 改用原生 Google Sign-In 與 Firebase credential 流程，正式 APK 仍使用既有固定簽章。

## 管理與公開首頁

- 公開首頁使用獨立固定視覺，不會受到登入後帳本情境、深淺模式或個人主題設定覆寫。
- 管理員帳戶詳情改為分別顯示目前持有帳本與共同參與帳本；共同參與數不重複計算自己持有的帳本。
- 管理頁新增可按時間與結果篩選的撤銷登入稽核紀錄；輸出維持去識別化，不含 UID、token、IP、帳本／交易／金額或收據。

## Android 發行資訊

- Android `versionName=1.3.21`、`versionCode=44`。
- 發行前已驗證型別檢查、單元測試、Android 核心流程、Web／PWA production build 與 Expo typecheck；實際 Google 登入與刪除驗證應僅使用專用測試身分，勿刪除真實帳戶。
