# Together Ledger v1.3.12 驗收紀錄

## 已完成的自動化驗證

| 驗證項目 | 結果 | 重點 |
| --- | --- | --- |
| `pnpm exec tsc --noEmit` | 通過 | Web、PWA、Android 與既有 tRPC 契約可編譯。 |
| `pnpm test` | 通過 | 22 個測試檔、120 項測試通過；包含月結算快照、樂觀鎖與帳本授權回歸。 |
| `pnpm exec tsx mobile/scripts/verify-core-flows.mjs` | 通過 | 61 項 Android 核心流程檢查通過；涵蓋原生鍵盤 resize、待結算摘要與歷史篩選。 |
| `pnpm build` | 通過 | Vite 與伺服器產物均成功建置。 |

## Web／PWA 響應式視覺檢視

已以桌面 `1280×720` 及行動裝置 `375×812` 檢視公開首頁。兩種尺寸均正常顯示，版面未見文字裁切或水平溢出；頁尾版本資訊已顯示 `v1.3.12`。受登入與帳本授權保護的「本月待結算」和結算歷史篩選以元件／靜態回歸測試驗證。

> Android 鍵盤關閉後的實際位移只能由裝置原生輸入法觸發；本次已移除 Android 原生 `resize` 與 React Native `KeyboardAvoidingView` 的重複避讓，並由核心流程腳本保護此契約。發布後仍應以實體 Android 裝置逐一確認登入、收支、預算與帳本設定表單。
