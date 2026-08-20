# Android 推播憑證診斷紀錄

使用者回報 Android 通知狀態出現 `InvalidCredentials`。伺服器端 `dispatchExpoPush` 直接保存 Expo Push Service 回傳的錯誤，因此這是 Expo／FCM 上游憑證問題，而非 App 端通知權限拒絕或交易通知偏好問題。

Expo 官方文件指出：Android 經由 Expo Push Service 投遞通知時，需要為對應 Expo 專案設定 Firebase Cloud Messaging (FCM) V1 service account credentials；`google-services.json` 僅提供 App 端 Firebase 專案資訊，不能取代 Expo 服務端的 FCM V1 憑證。

## 參考來源

1. [Expo：Obtain Google Service Account Keys using FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/)
2. [Expo：Push notifications setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
3. [Expo：Send notifications with the Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/)
