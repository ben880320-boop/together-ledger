# GitHub Actions Android APK 建置

Together Ledger 的 Android APK 可以由 GitHub Actions 使用 Ubuntu runner、Java 17、Android SDK 與 Gradle 建置，不需要使用 Expo EAS 的 Android build quota。Workflow 位於 `.github/workflows/android-apk.yml`，目前會產出可直接安裝的 **debug-signed APK**，不需要提交 keystore 或任何私密簽署金鑰。

## 觸發方式

當 `mobile/**` 或 workflow 本身推送到 `main` 分支時，workflow 會自動執行；也可以在 GitHub repository 的 **Actions → Android APK → Run workflow** 手動執行。workflow 會安裝 mobile 的 frozen lockfile、執行 `expo prebuild --platform android`，接著執行 `./gradlew assembleDebug`。

## 下載 APK

建置成功後，開啟該次 workflow run，在頁面下方的 **Artifacts** 下載 `together-ledger-<version>-debug-apk`。解壓縮後的 `app-debug.apk` 可直接安裝到 Android 測試機。每個 artifact 預設保留 14 天；若要長期保存，應下載後存放到團隊的 release 或檔案儲存空間。

## 為什麼目前使用 debug APK

debug APK 已由 Android debug keystore 簽署，適合內部測試與直接安裝，完全不需要把金鑰放進 GitHub。若要發布到 Google Play 或建立正式 release APK，不能使用 debug keystore；屆時應在 GitHub repository secrets 設定 base64 編碼的 release keystore 與密碼，並新增安全的 Gradle signing step。**不要把 `.jks`、密碼或 base64 keystore 提交到 repository。**

## Repository 必要設定

需要把專案推送到 GitHub repository，並確認 repository 的 Actions 沒有被停用。Workflow 不需要 Expo token；App 的公開設定目前透過 workflow environment 注入，包括 API base URL、OAuth App ID 與 OAuth portal URL。OAuth 原生回呼仍維持 `togetherledger://oauth/callback`。

## 本地重現

在已安裝 Android SDK、Java 17 與 Android build-tools 的環境，可以執行：

```bash
cd mobile
pnpm install --frozen-lockfile
pnpm run build:android:ci
```

本地建置會產生 `mobile/android/app/build/outputs/apk/debug/app-debug.apk`。`mobile/android/` 是 CI 的暫時 prebuild 產物，已列入 `.gitignore`；因此 workflow 每次都會從 Expo 設定重新產生原生 Android 專案，避免手動修改原生檔案後與 Expo 設定漂移。

## 已知限制

GitHub Actions 只能在 repository 已連接 GitHub 並完成 push 後執行；本地 sandbox 不能代替 GitHub runner 執行雲端 workflow。若 GitHub repository 使用 fork 或不同 owner，請在 Actions 設定中允許 workflow 執行，並確認 Android artifact 的存取權限符合團隊需求。
