# main 分支保護建議

## 稽核結論

2026-08-22 稽核時，GitHub API 對 `main` 的分支保護設定回傳 `404 Not Found`；這代表目前 **尚未啟用分支保護規則**。專案雖已採用 feature branch 與 Pull Request 發布流程，但沒有保護規則時，具寫入權限的成員仍可能直接推送至 `main`、略過審閱或在未完成驗收時觸發 Android APK 發布。

> 這份文件只記錄建議；本次不直接修改 GitHub repository 設定，避免在未經擁有者確認時改變協作與發布權限。

## 建議的初始規則

| 設定 | 建議值 | 理由 |
| --- | --- | --- |
| 規則目標 | `main` | 保護正式 Web／PWA 與固定簽章 APK 的發布來源。 |
| Require a pull request before merging | 開啟；至少 1 個核准 | 禁止直接推送，保留變更說明與可審閱差異。 |
| Dismiss stale approvals | 開啟 | 程式、版本或 Release Notes 變更後，舊核准不應沿用。 |
| Require conversation resolution | 開啟 | 確保 PR 中提出的帳務、權限或發布疑慮都有明確結論。 |
| Require status checks | 在 PR CI 工作流程上線後開啟 | 應涵蓋 `pnpm exec tsc --noEmit`、`pnpm test`、`pnpm exec tsx mobile/scripts/verify-core-flows.mjs` 與 `pnpm build`。目前 Android APK 工作流程只在合併後執行，不宜先將不存在的 PR 檢查設為必需。 |
| Require branches to be up to date | 與 required checks 一併開啟 | 避免舊分支在未重新驗證的情況下合併。 |
| Do not allow bypassing | 建議開啟 | 連 repository 管理員也須透過 PR 與檢查，降低意外直接發布風險。 |
| Restrict force pushes / deletions | 禁止 | 保護可追溯的版本、Release 與固定簽章發行歷史。 |

## 採用順序

請先新增只在 Pull Request 觸發的 CI 工作流程，將上述四項驗收命令拆成可識別的檢查名稱。確認連續數次 PR 均穩定通過後，再在 GitHub 的 **Settings → Branches → Add branch protection rule** 對 `main` 啟用「Require status checks」與「Require branches to be up to date」。Android 固定簽章 APK 工作流程則維持只在合併至 `main` 或手動執行時發布，避免從未合併的 PR 產生正式 Release。
