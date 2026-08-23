# Together Ledger v1.3.13 驗收紀錄

**範圍：** Firebase Authentication 電子郵件帳號安全、既有本機帳戶遷移、短效 app session、近期再驗證帳戶刪除，以及 Android／Web／PWA 發布。

## 已完成的實作

| 項目 | 驗收結果 |
| --- | --- |
| Firebase Email／Password | Web、PWA、Android 均提供註冊、驗證信、重寄驗證信、登入、忘記／重設密碼與重設後重新登入流程。 |
| 既有帳戶保護 | 不替換既有 `users.id` 或帳本關聯；使用者只能以相同且已驗證的 Firebase 電子信箱綁定。信箱衝突會由伺服器拒絕。 |
| 伺服器端驗證 | 後端僅信任 Firebase Admin `verifyIdToken(idToken, true)` 的結果，拒絕未驗證信箱、UID 不符與近期再驗證不足的刪除要求。 |
| Session 保護 | 新增 `users.sessionVersion`、migration `0022_smooth_jigsaw.sql` 與 rollback 指引；Firebase app session 為一小時，集中比對 session version，綁定時撤銷舊 session。 |
| 帳戶刪除 | Firebase 已綁定帳戶須以五分鐘內重新登入取得的 token 完成再驗證；本機帳戶維持原密碼確認。資料庫先完成可恢復的匿名化與 Firebase UID 清理，再嘗試刪除 Firebase identity。 |
| Android 發布設定 | Android workflow 只從 GitHub Actions secrets 注入 `EXPO_PUBLIC_FIREBASE_*` client 設定；服務帳號 JSON 不進入 APK。 |

## 自動化驗收

下列檢查於安全調整與 v1.3.13／versionCode 36 同步後均已完成：

```text
pnpm exec tsc --noEmit
pnpm test
pnpm exec tsx mobile/scripts/verify-core-flows.mjs
cd mobile && pnpm typecheck
pnpm build
```

Web/PWA 的登入頁亦已於桌機與窄螢幕視圖檢查註冊、登入、忘記密碼與重寄驗證信入口的可讀性與不溢位排版。

## 資料庫變更

| Migration | 性質 | 已套用狀態 |
| --- | --- | --- |
| `0021_typical_bullseye.sql` | 新增可為空且唯一的 `users.firebaseUid`，保留既有使用者與帳本外鍵。 | 已套用。 |
| `0022_smooth_jigsaw.sql` | 新增預設值為 `1` 的 `users.sessionVersion`，支援 app session 撤銷。 | 已套用。 |

兩項 migration 均有 rollback 指引。由於 rollback 會影響已綁定 Firebase 的身份資料，僅可在確認不存在 Firebase 使用者或已完成資料處理後執行。

## GitHub 與 APK 發布

| 項目 | 結果 |
| --- | --- |
| 功能 Pull Request | [#26](https://github.com/ben880320-boop/together-ledger/pull/26) 已經 feature branch 流程合併。 |
| 發布待辦文件 Pull Request | [#28](https://github.com/ben880320-boop/together-ledger/pull/28) 已合併；不直接推送 `main`。 |
| 正式 Release | [v1.3.13](https://github.com/ben880320-boop/together-ledger/releases/tag/v1.3.13) 已發布，非 draft、非 prerelease。 |
| APK | [`together-ledger.apk`](https://github.com/ben880320-boop/together-ledger/releases/download/v1.3.13/together-ledger.apk)，77,041,015 bytes。 |
| APK SHA-256 | `222e3b74b5b0cb88d851f722fe30a481d712b6daca888b93f9a3d2608a135171`；另附 `.sha256` 資產。 |

## 人工部署確認

Firebase Console 的 **Authentication → Settings → Authorized domains** 必須成功加入 `togetherapp-hdbmsjkf.manus.space`。這是 Firebase Hosted Email 驗證與密碼重設頁面回到網站登入頁的必要設定。此項由 Firebase Console 帳戶管理者操作，並非程式碼或 APK 可代為設定的項目。
