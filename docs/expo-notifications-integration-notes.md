# Expo 通知整合來源紀錄

## 官方文件重點

Expo 的 `expo-notifications` 可在 Android／iOS 取得 Expo Push Token、顯示與排程本機通知、接收前景與背景通知，以及處理通知點擊事件。Android SDK 53 之後的遠端推播不可使用 Expo Go 測試，必須使用 development 或 standalone build；本機通知仍可使用。

伺服器可將每個使用者裝置的 Expo Push Token 保存後，透過 HTTPS `POST https://exp.host/--/api/v2/push/send` 發送通知。官方建議對 HTTP `429` 與 `5xx` 採用指數退避重試，並在約 15 分鐘後查詢 receipt；收到 `DeviceNotRegistered` 時應停用對應 token。

本次 v1.2.2 採用 Expo Push Service：交易建立時建立帳本內通知並向符合偏好的其他成員裝置送出遠端推播；每月結算提醒使用可靠的伺服器排程觸發，並在 app 端以通知點擊深連結回到相應帳本。

## 來源

1. [Expo：Send notifications with the Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/)
2. [Expo：expo-notifications API](https://docs.expo.dev/versions/latest/sdk/notifications/)
