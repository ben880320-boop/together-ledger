# v1.2.7 通知異常錄影觀察

來源：使用者於 2026-08-18 提供的 `1000006768.mp4`。

錄影顯示使用者在個人設定開啟「每月結算提醒」、將通知金額門檻從 0 改為 100，然後點選「儲存提醒設定」。畫面隨後顯示 Android Firebase 初始化錯誤：`Default FirebaseApp is not initialized in this process com.togetherledger.app`。錯誤後，已啟用的開關回復關閉、門檻回到 0，表示裝置推播 token 註冊錯誤錯誤地中斷了本應獨立保存的通知偏好流程。

修正驗證重點：偏好保存必須先完成；推播權限、token 取得或 Firebase 設定失敗時，設定仍需保留，並以繁體中文提示推播尚未完成啟用及可採取的後續步驟。
