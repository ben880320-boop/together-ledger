# 網頁正式入口驗證紀錄

## 2026-08-19：舊版導向修正

已於正式網域 `https://togetherapp-hdbmsjkf.manus.space/` 驗證首頁顯示 **v1.2.8.7** 的新版產品入口與更新歷程。

另以 `?legacyWorkspacePreview=1&release=6e893cf8` 重新載入正式網域。正式環境仍固定顯示新版入口，未載入舊版靜態模擬帳本，證明舊版視覺已被限制在本機開發模式，既有登入工作階段與查詢參數均無法使正式網站回退。

已完成的技術驗證：

- 46 項 Vitest 測試通過。
- TypeScript `tsc --noEmit` 通過。
- Vite 生產建置通過。
- 開發預覽與正式網域皆顯示 v1.2.8.7 產品入口。
