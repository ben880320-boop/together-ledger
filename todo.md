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
