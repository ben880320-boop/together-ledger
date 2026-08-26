# 「記住此裝置」安全行為

## 使用者可見行為

「記住此裝置」是登入頁的可選項目，預設不選取。使用者勾選後，可以在相同的個人裝置上於下一次開啟共帳時恢復已驗證的登入工作階段；它不是「記住密碼」功能。

> 共帳不會儲存、回填、顯示或傳送明碼密碼。

| 平台 | 勾選 | 未勾選 |
| --- | --- | --- |
| Web／PWA | Firebase local persistence；短效 App session 到期時會先進入同源登入頁並以既有 Firebase identity 交換新的短效 session | Firebase session persistence，只在目前瀏覽器工作階段有效 |
| Android | Firebase identity 與 app JWT 僅在 SecureStore 偏好允許時於冷啟動恢復；未授權或 `auth.me` 空使用者會單次嘗試靜默換發 | 冷啟動時清除 app JWT 與 Firebase 身分，需重新登入 |

## 撤銷規則

主動登出、帳戶刪除與伺服器發現 `sessionVersion` 不相符時，app 會撤銷本機 app token、Firebase 登入狀態與「記住此裝置」偏好。管理員對一般帳戶執行「撤銷所有登入」時，也會同時使 App session 與 Firebase refresh token 失效。此設計仍保留伺服器端的一小時短效 app JWT、Firebase ID token 驗證和帳本層級授權檢查。

## 到期與暫時失敗

短效 App session 到期本身不會清除已選擇的「記住此裝置」。Web／PWA 與 Android 會使用已驗證的 Firebase persisted identity 單次換發 session。若只是短暫離線、逾時或服務暫時無法連線，系統保留 identity 讓使用者恢復連線後重試；只有 Firebase 已明確回報憑證撤銷、使用者停用／不存在或 token 無效時，才清除持久登入狀態並要求重新登入。

## 使用建議

只應在個人且已啟用螢幕鎖定的手機、平板或電腦使用此選項。公共電腦、共用平板、他人可解鎖的手機，或瀏覽器可能被多人使用的情境，請保持未勾選並在用完後主動登出。
