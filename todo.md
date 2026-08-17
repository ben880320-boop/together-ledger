# Android APK Build TODO

- [x] 1. 檢查 mobile 專案的 app.json 與 eas.json 設定，準備進行本機或雲端 APK 建置
- [x] 2. 執行 Android APK 建置指令，產出 `.apk` 檔案
- [x] 3. 驗證最新 APK 產物並提供下載與安裝說明

## Pasted content 一致性修正

- [x] 4. 確保 Android 第一次開啟一定先顯示登入／註冊頁面，未登入不可看到帳本內容
- [x] 5. 確保建立新帳本時不產生預設交易、預設預算或預設固定收支，保持真正空白
- [x] 6. 完成核心 Android UI 與 tRPC 接線，並以 workflow 測試回歸建立／加入、三種分攤、分類／支付、預算／固定收支、角色／結算；實機互動仍需安裝後驗證
- [x] 7. 依 pasted_content.txt 補齊 admin／member／viewer、QR／邀請 deep link、支付方式自訂、固定收入／支出週期與完整主／子分類；任意自訂權限組合目前明確不支援
- [x] 8. 完成 Android API、型別、單元測試與 APK 安裝前驗證
- [x] 9. 重新建置並交付包含最後登入／註冊、角色與子分類修正的 APK

## 待補驗證缺口

- [x] 10. 補上明確的登入與建立帳號入口，分別傳送 OAuth signIn／signUp；實際帳號建立仍由 Manus OAuth 頁面完成
- [x] 11. 新增可執行 tRPC workflow 回歸測試與 Android 接線覆蓋檢查，覆蓋建立／加入、三種分攤、結算、月曆、分析、預算、固定收支、分類與支付方式路由
- [x] 12. 完成多人角色 UI、QR／邀請 deep link 解析與固定收支同步接線；實體裝置的 OAuth、相機／QR 掃描與端到端操作仍需使用者安裝後驗證

## 使用者回報修正 (1.0.3)

- [x] 13. 修正登入與註冊跳轉錯誤：統一正確 OAuth app id、EAS preview 環境變數、togetherledger callback scheme 與 state 驗證；實機仍需使用者確認
- [x] 14. 移除 App 可見的服務商／帳號登入提示，改為「安全登入頁」與共帳品牌說明
- [x] 15. 移除登入後的「預設資料」提示文字，保留簡潔的空白帳本說明

## 使用者回報修正 (1.0.4 - 圖示更換與直接交付)

- [x] 16. 設計並套用全新的 Android 桌面圖示（取代預設 Android 機器人綠色圖示），配置於 app.json icon 與 adaptiveIcon
- [x] 17. 重新執行 EAS build 產出 1.0.4 APK，並透過下載與轉存確認可作為訊息附件直接發送

## 使用者回報修正 (1.0.5 - OAuth redirect_uri 授權修正)

- [x] 18. 修正 Android OAuth redirect_uri 不被接受的問題：改用授權服務允許的伺服器回呼網址（如 `https://togetherapp-hdbmsjkf.manus.space/api/oauth/callback`），並在伺服器回呼成功後透過 deep link 將 token 安全帶回 Android App

## 使用者回報修正 (1.0.6 - 導覽與個人化設定)

- [x] 19. 帳本內邀請碼支援點擊一鍵複製（使用 `expo-clipboard`）
- [x] 20. 進入帳本後提供明顯的「退出／返回主頁」按鈕，可隨時切回帳本列表頁
- [x] 21. 帳本下方新增底部快捷分頁列（總覽、月曆、分析、規劃、設定），方便快速切換
- [x] 22. 主頁面與設定區增加個人自定義設定：字體風格（系統／圓體／襯線）、App 主題（玫瑰／石墨／拿鐵／薄荷）與文字大小調整（小／標準／大），並以 AsyncStorage 持久化

- [x] 23. 重新建置並驗證 1.0.6 Android APK（包含邀請碼複製、返回主頁、底部快捷分頁與個人化設定），SHA-256：`54c822e2dd8d2bdae67dfce69328f685e2bac3b7a0026fa717626ab9d6ac443f`


## 使用者回報修正 (1.0.7 - 支出流程、掃描與啟動故障)

- [x] 完成 Android 啟動相關的 Expo／依賴／建置層修正與驗證；Expo Android 匯出及後續 1.1.1 APK 建置均通過，實際裝置啟動仍需使用者端確認
- [x] 支出分攤方式加入「無」選項並完成前後端驗證
- [x] 支出分類選擇加入可直接搜尋的搜尋欄
- [x] 日期欄改為點選後開啟月曆並可選取日期
- [x] 雙方支付總覽限制初始顯示長度，超出內容可獨立滑動
- [x] 設定頁支援移除分類與支付方式，並保護既有資料關聯（採停用保留資料）
- [x] 加入發票拍照與相簿選圖，辨識後自動填入支出欄位
- [x] 收支支援編輯與移除，避免錯誤或重複輸入
- [x] 新增操作日誌，記錄新增、編輯與移除收支等事件
- [x] 為本次功能更新補充 Vitest、Android 接線與回歸測試（根專案 9 tests、Android 25 checks、Expo Doctor 18/18）
- [x] 重新建立並驗證新版 Android APK，更新安裝說明（1.0.7，SHA-256：`eeb21d267fea22fb6b445ad2a91547618809f839810ac3618a9253d6494312a7`）
- [x] 已正式提供 v1.1.1 Android APK、安裝步驟、檔案大小與 SHA-256；1.0.7／1.1.1 的實機或模擬器安裝確認保留為使用者端最後檢查


## 使用者回報修正 (1.0.8 - 導航、帳本生命週期與確認流程)

- [x] 限制總覽「最近收支」顯示高度，超出內容在區塊內獨立滑動
- [x] 將個人化設定從帳本內移至主頁面的個人設定
- [x] App 關閉後重新開啟時回到主頁，不停留在上次帳本
- [x] 阻止重複加入已加入過的帳本，並顯示清楚提示
- [x] 新增移除帳本功能；持有者移除時提供轉讓或確認移除選項，成員退出提供提醒
- [x] 登出按鈕加入確認提示
- [x] 收支刪除與編輯修改加入雙重確認
- [x] 移除左上角三條橫線抽屜，避免與帳本內底部快捷列衝突
- [x] 個人設定支援修改使用者暱稱
- [x] 補充後端與 Android 回歸測試，重新建立並驗證新版 APK

## v1.0.8 實作檢核（本次工作階段）

- [x] 在 LedgerHome 顯示個人設定卡：暱稱、字體、主題、文字大小與登出確認
- [x] 從主入口移除 hamburger drawer 及其無用樣式／狀態
- [x] 在帳本設定加入持有者轉讓／刪除與成員退出的可操作入口
- [x] 完成交易編輯／刪除雙重確認與 Android 回歸字串檢查
- [x] 更新 1.0.8 核心流程檢查與建置說明
- [x] 建立並驗證 1.0.8 APK

## v1.0.8 後端回歸補強

- [x] 新增 Vitest 覆蓋帳本退出、持有者轉讓與刪除分支
- [x] 新增 Vitest 覆蓋重複加入的 CONFLICT 與暱稱更新流程
- [x] 重新執行根專案測試並更新 v1.0.8 交付說明

## v1.1.0 使用者回報與體驗升級

- [x] 修正規劃頁預算寫入錯誤，避免 categoryId、總預算與分類預算資料型別或欄位錯配
- [x] 主頁右上角新增人頭入口，個人設定改為獨立頁面並保留登出確認
- [x] 擴充個人設定：更多主題、字體、文字大小、動畫與顯示偏好
- [x] 將主題套用到整體介面，而非只切換背景色
- [x] 檢查並統一確認彈窗，移除不必要的重複確認並補上必要防誤觸
- [x] 帳本設定支援修改名稱、直接轉讓所有權與更多實用帳本工具
- [x] 分析頁新增圓餅／甜甜圈圖等圖形化支出視覺化
- [x] 優化發票掃描：取消強制裁切、改善回饋與讀取流程，評估不可用時的替代方案
- [x] 評估手機載具自動讀取的可行性與安全邊界，提供不冒用憑證的替代設計
- [x] 規劃頁新增獨立旅行／出遊預算與日期範圍，不納入每月預算
- [x] 總覽頁邀請碼支援點擊複製
- [x] 檢查帳本成員與權限操作，補強必要的角色限制與錯誤提示
- [x] 新增並更新後端、Android 靜態與 UI 回歸測試，重新建立 APK
- [x] 補強個人設定：實際新增更多字體選項與更多文字大小級距，並更新 Android 靜態檢查覆蓋這些新選項

## 最新 APK 交付

- [x] 以已保存的 v1.1.0 程式碼建立最新 Android preview APK
- [x] 下載 APK 並驗證檔案格式、大小與 SHA-256
- [x] 將最新 APK 與安裝資訊交付給使用者
- [x] 向使用者發送最新版 v1.1.0 APK 的正式交付訊息，附上下載連結／檔案、SHA-256、檔案大小與簡短安裝說明

## v1.1.1 體驗與錯誤修正

- [x] 修正 OAuth 登入回呼錯誤（Unmatched Route: togetherledger://oauth/callback）
- [x] 出遊規劃日期支援點擊彈出原生月曆供直接點選
- [x] 統一美化確認彈窗，確保風格與個人化設定及主題同步變動
- [x] 優化本次登入、日期與確認操作的介面流暢度，移除不必要的成功 Alert 並套用主題互動樣式
- [x] 執行測試與靜態檢查，重建並交付 v1.1.1 Android APK

## v1.1.1 執行細項

- [x] 新增 Expo Router 的 OAuth callback route，解析 state／token 並導回主入口，避免 deep link 顯示 Unmatched Route
- [x] 將出遊規劃起訖日期文字輸入替換為可點擊的主題同步月曆選擇器，保留 YYYY-MM-DD API 格式
- [x] 抽出共用的主題同步確認 Modal，替換高風險操作的原生 Alert 並避免重複提示
- [x] 將邀請碼複製成功回饋改為卡片內非阻塞提示，避免成功操作中斷使用流程
- [x] 更新 Android 核心接線檢查與必要 Vitest，確認登入 callback、日期選擇與確認流程
- [x] 產出並驗證 v1.1.1 APK，提供檔案附件與可安裝版本資訊

## v1.2.0 使用者回報修正與功能擴充

- [x] 移除主頁重複登出入口，只保留個人設定內可正常運作的登出按鈕，並加入回歸檢查
- [x] 修正出遊規劃日期從 DateTimePicker 到 API 的格式轉換與建立流程，覆蓋日期格式、時區與結束日不可早於開始日
- [x] 擴充主題選項，加入海洋、星空等不同色彩系統，並確保全域元件同步更新
- [x] 在個人設定增加 UI 界面樣式選項，例如卡片圓角、密度、導覽列樣式與動畫偏好，並持久化設定
- [x] 重新設計帳本分類管理：搜尋、啟用／停用、編輯、排序與避免重複名稱，保留歷史資料關聯
- [x] 重新設計支付方式管理：搜尋、啟用／停用、編輯、排序與避免重複名稱，保留歷史資料關聯
- [x] 補強主頁實用功能入口：加入帳本名稱搜尋與結果數量提示，避免加入無實際資料的假數字
- [x] 補強個人設定與帳本設定的可發現性、說明文字與空狀態，並以實際功能為主
- [x] 新增／更新 Vitest、Android 核心接線檢查與 Expo 匯出
- [x] 將 v1.2.0 Android APK 產出方案改為 GitHub Actions runner 建置，解除對 EAS Android build quota 的依賴；實際 APK artifact 需在使用者 GitHub repository 執行 workflow 取得

## GitHub Actions Android 建置

- [x] 確認 Expo SDK 54 專案可透過 prebuild 產生 Android Gradle 專案，並決定是否追蹤 android 原生目錄
- [x] 建立 GitHub Actions workflow，使用 Ubuntu runner、Java、Android SDK 與 Gradle 建置可安裝 debug APK
- [x] 設計未簽署 debug／CI release 與可選的 GitHub Secrets 簽署流程，避免把 keystore 或密鑰提交到 repository
- [x] 上傳 APK 為 workflow artifact，加入版本命名、建置摘要與手動／push 觸發方式
- [x] 補上 GitHub Actions 建置、下載 artifact、簽署 secrets 與限制說明文件
- [x] 執行本地 prebuild／Gradle wrapper 設定檢查、更新 regression test 並準備保存 checkpoint；完整 workflow 執行仍需推送到 GitHub repository

## GitHub repository 同步與 APK 產出

- [x] 確認 `https://github.com/ben880320-boop/together-ledger` 的可公開存取結果為 404／Private；sandbox 無法驗證其預設分支與目前內容，需使用者端登入或授權後才能同步
- [x] 將已完成的 GitHub Actions、mobile scripts、文件與 v1.2.0 程式版本同步至使用者 repository
- [x] 觸發 repository 的 Android APK workflow，確認 workflow run 成功或記錄需要使用者完成授權步驟
- [x] 下載並驗證 v1.2.0 APK artifact，提供 SHA-256 與安裝檔案

## 非 GitHub／非 EAS APK 產出

- [x] 檢查 sandbox 是否具備 Android SDK、Gradle、Java 與 Expo prebuild 所需工具
- [x] 嘗試本機 Gradle 建置 v1.2.0 APK；Gradle 已進入 Android manifest／AAPT 階段，但 daemon 被 sandbox 終止，未留下 APK，因此改採可攜式建置包
- [x] 驗證建置包內容、版本與安裝流程；tar.gz／ZIP 均通過關鍵檔案與秘密／暫存檔排除檢查
- [x] 交付可攜式建置包與不需 GitHub／EAS 的 Android Studio／本機 Gradle 操作步驟；目前未宣稱已交付未產出的 APK

## 建置環境相容性補強

- [x] 將 GitHub Actions 明確安裝 Expo SDK 54 prebuild 實際使用的 Android 36、Build Tools 36 與 NDK 27.1，避免 runner 依賴 Gradle 自動下載
- [x] 更新離線 APK 建置說明，加入 Java 17、Android SDK 36／NDK 27.1 與 Android Studio 產物路徑
- [x] 建立並驗證 v1.2.0 可攜式 source build package，附離線建置說明與 SHA-256
- [x] 交付可攜式建置包；明確說明 APK 尚未由 sandbox 產出且不虛稱已交付

---

## 分類與支付方式表情符號修正

- [x] 修正編輯分類／支付方式時顯示 `◌` 佔位符，改以對應表情符號預設、舊資料轉換與快速選取流程呈現
- [x] 為圖示選擇、儲存及重新載入補齊回歸測試，並通過 21 項 Vitest、行動版 TypeScript 與 32 項核心流程檢查
- [x] 整理後續功能與使用體驗改善建議，依實用性與開發優先度排序
