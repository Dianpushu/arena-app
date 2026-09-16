## Windows 測試版

這是 Arena 非官方 Windows 桌面客戶端的 Beta 測試版本，可能仍有錯誤，不建議用於重要工作。此版本標示為 Pre-release，不作為正式版發布。

### 下載與安裝

- **Arena-Setup-版本號.exe**：安裝精靈版，支援自動更新。
- **Arena-版本號-portable.exe**：免安裝版，下載後直接執行；不支援自動更新。
- `beta.yml` 與 `.blockmap` 為更新所需檔案，一般使用者不需手動下載。

適用於 Windows 10（1809 以上）／Windows 11，64 位元。

### 測試重點

- 登入、重新啟動後保留登入狀態。
- 多分頁、新增／關閉／拖曳排序、還原上次分頁。
- 系統匣常駐、全域快捷鍵、通知。
- 暖米色／深色主題切換、離線重試。

### 已完成驗證與已知限制

- 已通過 TypeScript 型別檢查、前端與 Electron 編譯、Windows NSIS／portable 打包。
- 尚未完成 Windows 實機互動與自動更新端到端測試，歡迎回報測試結果。
- 安裝檔未配置程式碼簽署，Windows SmartScreen 可能顯示警告。請確認下載來源為本儲存庫，並自行評估後再執行。
- 本專案與 arena.ai 官方無關。

請在本儲存庫的 Issues 回報問題，附上 Windows 版本、App 版本與重現步驟；請勿附上密碼或登入憑證。
