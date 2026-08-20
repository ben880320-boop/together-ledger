# Android v1.3.2 APK 發行監看紀錄

最後檢查：2026-08-20 17:34（GitHub Actions workflow run #37）

| 項目 | 結果 |
| --- | --- |
| 來源分支與提交 | `feat/savings-buckets` / `49b21b8` |
| JavaScript bundle 與 release APK 建置 | 已通過 |
| APK artifact | `together-ledger-1.3.2-release-apk`，32.9 MB |
| SHA-256 | `eca5047b9c2c83ee6cb31a80bd158ef88a00f9d5bf5ebc50d0d133297865907d` |
| GitHub Release 發布 | 已於 2026-08-20 17:34 建立，標籤為 `v1.3.2`，含 4 項資產 |

先前 App 未顯示更新的直接原因，是 v1.3.2 的 GitHub Actions 在 Android JavaScript bundle 階段因儲蓄桶卡片 JSX 條件式少了閉合符號而未產生 APK 與 Release。該語法已於 `49b21b8` 修正；重新觸發的 workflow run #37 已完成 APK 建置、版本驗證、artifact 上傳與 GitHub Release 發布。更新檢查的正式來源為 [Release v1.3.2](https://github.com/ben880320-boop/together-ledger/releases/tag/v1.3.2)。
