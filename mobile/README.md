# 共帳 Together Ledger Android App

這是「共帳 Together Ledger」的 **Expo Android 手機版本**。它不是以瀏覽器頁面作為主要產品形態，而是使用 Android 原生觸控元件、Safe Area、側邊抽屜與深連結登入流程。

## 目前已完成

首次開啟會先顯示登入畫面；登入完成後會從伺服器讀取使用者的真實帳本清單。若帳戶尚未建立或加入任何帳本，畫面會維持「目前還沒有帳本」，不會自動產生示範帳本或交易。左上角的三條橫線使用原生 `Pressable`，可以開啟側邊抽屜，並提供總覽、月曆、分析、規劃、設定與登出入口。

Android 登入使用 Manus OAuth 深連結 `togetherledger://oauth/callback`。伺服器會將一次性 OAuth state 與 session token 回傳給 App；App 會驗證 state 後以 Android Secure Store 保存 Bearer session，後續帳本請求透過既有 tRPC API 完成。

目前已串接：真實登入、使用者查詢、帳本清單、建立帳本、邀請碼加入、成員查詢、本月分析與結算摘要。月曆、交易新增、預算、固定收支與分類管理的 Android 專用操作頁仍需依序移植到手機導覽畫面，既有 Web 版後端 API 已準備完成。

## 啟動方式

```bash
cd mobile
pnpm install
pnpm start
```

接著可使用 Expo Go、Android Emulator 或 `pnpm android` 開啟。正式 Android build 建議使用 Android Studio 或 EAS Build。

## API 與 OAuth 設定

預設 API 網域為 `https://togetherapp-hdbmsjkf.manus.space`，OAuth portal 預設為 `https://manus.im`，App ID 使用本專案已配置的公開 OAuth App ID。若需要切換測試或正式環境，可以在 build 前設定：

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-domain.example
EXPO_PUBLIC_OAUTH_PORTAL_URL=https://manus.im
EXPO_PUBLIC_APP_ID=your-oauth-app-id
```

伺服器端必須允許的原生 callback URI 為：

```text
togetherledger://oauth/callback
```

## 驗證指令

```bash
pnpm typecheck
pnpm export:android
```

## GitHub Actions APK 建置

專案已加入 `.github/workflows/android-apk.yml`。推送 `mobile/**` 到 `main`，或在 GitHub Actions 手動執行 **Android APK** workflow，即可由 GitHub runner 使用 Android SDK／Gradle 建置 debug-signed APK，不會消耗 Expo EAS Android build quota。建置成功後，從該次 workflow run 的 Artifacts 下載 `together-ledger-<version>-debug-apk`。

本地若已安裝 Java 17、Android SDK 與 build-tools，可執行 `pnpm run build:android:ci`；該命令會先以 Expo prebuild 產生暫時的 `android/` 目錄，再執行 Gradle `assembleDebug`。目前產物是供測試安裝的 debug APK；Google Play 或正式 release APK 仍需透過 GitHub Secrets 管理 release keystore，不應將 keystore 或密碼提交到 repository。完整設定請參考根目錄 `docs/github-actions-android.md`。
