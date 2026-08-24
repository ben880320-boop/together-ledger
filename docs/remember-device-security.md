# 「記住此裝置」安全行為

## 使用者可見行為

「記住此裝置」是登入頁的可選項目，預設不選取。使用者勾選後，可以在相同的個人裝置上於下一次開啟共帳時恢復已驗證的登入工作階段；它不是「記住密碼」功能。

> 共帳不會儲存、回填、顯示或傳送明碼密碼。

| 平台 | 勾選 | 未勾選 |
| --- | --- | --- |
| Web／PWA | Firebase local persistence，瀏覽器再次開啟可交換短效 app session | Firebase session persistence，只在目前瀏覽器工作階段有效 |
| Android | Firebase identity 與 app JWT 僅在 SecureStore 偏好允許時於冷啟動恢復 | 冷啟動時清除 app JWT 與 Firebase 身分，需重新登入 |

## 撤銷規則

主動登出、帳戶刪除與伺服器發現 `sessionVersion` 不相符時，app 會撤銷本機 app token、Firebase 登入狀態與「記住此裝置」偏好。此設計仍保留伺服器端的一小時短效 app JWT、Firebase ID token 驗證和帳本層級授權檢查。

## 使用建議

只應在個人且已啟用螢幕鎖定的手機、平板或電腦使用此選項。公共電腦、共用平板、他人可解鎖的手機，或瀏覽器可能被多人使用的情境，請保持未勾選並在用完後主動登出。
