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
