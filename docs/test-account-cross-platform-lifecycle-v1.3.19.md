# v1.3.19 非正式測試帳戶跨端帳戶生命週期驗收

本劇本只可使用**專門建立且無真實帳本、收支、聯絡資料或共同成員的測試 Firebase Email/Password 帳戶**。測試人員不得以個人、管理員或日常使用帳戶進行「刪除帳戶」測試。此劇本不要求記錄密碼、Firebase UID、JWT、收據或交易內容；驗收紀錄僅保留通過／失敗、平台、日期與非識別化錯誤碼。

| 範圍 | 受測平台 | 成功條件 | 禁止事項 |
| --- | --- | --- | --- |
| 已記住裝置恢復 | Web、已安裝 PWA、Android | 短效 App session 逾期後，以既有 Firebase 身分靜默換發 App session | 不記錄、不展示或不回填密碼 |
| 全端撤銷登入 | Web、PWA、Android | 管理員撤銷後三端都必須重新登入 | 不對管理員或日常帳戶測試撤銷 |
| 刪除帳戶 | 一個獨立測試帳戶 | 僅在前述測試完成後，依雙重確認流程刪除該測試帳戶 | 不對真實或含帳本資料的帳戶執行 |

## 前置條件

請建立一個新的 Firebase Email/Password 測試信箱並完成驗證，再以此帳戶登入 Web、PWA 與 Android。測試帳戶不得加入或建立帳本，Android 必須安裝目標版本，Web 與 PWA 必須使用同一個已發布版本。三端登入時都要勾選「記住此裝置」，並確認各端都能開啟個人設定後再繼續。

## 已記住裝置的短效 Session 到期驗收

依序關閉 Web 瀏覽器頁面、PWA 與 Android App。等待伺服器短效 App session 到期，或在**測試環境**以既有安全測試工具模擬過期 App JWT；不可修改正式使用者資料或直接偽造 token。接著分別重新開啟三個平台並記錄結果。

| 平台 | 操作 | 預期結果 | 失敗判定與復原入口 |
| --- | --- | --- | --- |
| Web | 開啟原工作階段或受保護頁面 | 先導向同源登入頁，再由 Firebase persisted identity 靜默恢復，回到可使用狀態 | 顯示登入或網路錯誤；恢復連線後可重新開啟登入頁重試 |
| PWA | 從主畫面重新啟動 | 使用 browser local persistence 換發短效 App session | 顯示登入或網路錯誤；恢復連線後重新啟動 PWA |
| Android | 強制關閉後冷啟動 | 保留 SecureStore 的記住偏好，偵測未授權或 `auth.me` 空使用者後只嘗試一次 Firebase 靜默恢復 | 顯示登入或連線錯誤；恢復連線後重新開啟 App，不應陷入無限重試 |

暫時網路失敗不應清除 Firebase persisted identity 或「記住此裝置」偏好。相對地，明確 Firebase token revoked、user disabled、user not found、invalid user token，或伺服器 `sessionVersion` 不符時，必須停止靜默恢復並要求使用者重新登入。

## 管理員撤銷所有登入驗收

使用另一個非日常的管理員測試帳戶，於 Web-only `/admin` 搜尋目標測試帳戶。確認目標既不是目前管理員也不是其他管理員後，選擇「撤銷登入」、輸入 `REVOKE` 並確認。系統應同時遞增應用程式 `sessionVersion` 與撤銷 Firebase refresh token；管理頁只可顯示處理結果，不能顯示 Firebase UID、token 或密碼。

接著在 Web、PWA 與 Android 分別觸發下一個受保護請求或重新啟動。三端都必須回到登入狀態，且先前的 Firebase persisted identity 不得靜默恢復成已登入狀態。若撤銷動作本身失敗，管理頁應顯示可重試的錯誤，且匿名 `sessionRevoke` failure 事件可在管理員的「安全與同步健康度」彙總中查看。

## 只限測試帳戶的刪除驗收

只有在前列恢復與撤銷流程都記錄完成後，才可對該獨立測試帳戶執行刪除。使用測試帳戶重新登入，依產品的倒數、近期 Firebase 再驗證及 `DELETE` 確認流程完成刪除。確認 Web、PWA 與 Android 的本機狀態已清除，且後續登入不再取得共帳存取權。此步驟不可在任何真實帳戶、管理員帳戶或擁有帳本資料的帳戶上執行。

## 可觀測性與驗收紀錄

管理員可在 Web-only `/admin` 查看近七日的匿名彙總。事件僅由 `rememberRestore`、`sessionRevoke` 與 `syncConflict`，以及平台來源、成功／失敗與固定診斷碼組成；不得附帶帳戶、Email、Firebase UID、JWT、IP、帳本、交易、金額或收據資料。若發現大量失敗，請先記錄平台、時間範圍、事件類型與固定錯誤碼，再依安全支援流程排查，切勿擷取或傳送帳戶憑證。
