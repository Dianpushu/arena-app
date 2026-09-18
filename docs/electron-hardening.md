# Electron 安全與可靠性強化

此變更尚未發布新版安裝檔；既有 beta.1 / beta.2 的下載資產保持不變。

## 信任邊界

- `ui-preload.ts` 僅由主 UI BrowserWindow 掛載，且只在主 frame 暴露完整 API。
- `content-preload.ts` 對遠端、localhost、loopback、file 內容一律只提供離線 retry；沒有設定、App、分頁管理等 API。
- 所有特權 IPC 經 `assertTrustedUI`：必須是主 UI 的 WebContents、主 frame 及指定 `dist/index.html`（開發時指定 Vite URL）。只忽略主題 query / hash，不信任任意 file、localhost 或同 origin 的其他路徑。
- 離線 retry 是獨立 IPC，驗證 sender 是否為 TabManager 管理的分頁，並確認主 frame 正顯示指定的 `offline.html`。只重試來源分頁的原網址。
- 主 UI 禁止跳到其他文件、建立 popup 或附加 webview；所有視窗使用 context isolation、sandbox 並關閉 Node integration。
- 權限預設全拒，但剪貼簿必須例外，否則網站的「複製」按鈕會靜默失效。Chromium 把非同步 Clipboard API 放在權限系統後面：`navigator.clipboard.writeText()` 在有使用者手勢且內容為標準格式時請求 `clipboard-sanitized-write`，否則（含讀取、自訂格式、無手勢）請求 `clipboard-read`。安裝了 permission handler 卻沒放行，網站只會收到 `NotAllowedError: Write permission denied` —— 按鈕有按到、剪貼簿是空的。策略：消毒過的寫入對任何 http(s) 文件放行（只能寫入、不能讀取，且需使用者手勢）；讀取與未消毒寫入僅限 `arena.ai` / `*.arena.ai`；`deprecated-sync-clipboard-read`、file/data/自訂協定、含帳密的網址一律拒絕。request 通道讀 `details.requestingUrl`，check 通道依序退回 `requestingUrl` / `embeddingOrigin` / `requestingOrigin`，取不到來源時視為拒絕。
- Clipboard API 另外要求 `document.hasFocus()`。分頁切換、建立、關閉與網址列導覽都由 React UI 的 WebContents 觸發，焦點會留在 UI 上，網頁複製會以 `Document is not focused` 失敗，因此這些操作後主動把焦點交還當前內容分頁（設定面板開啟時不搶焦點）。
- 右鍵選單的剪下／複製／貼上／全選明確綁定發出事件的 WebContents，不使用作用於「當前聚焦視窗」的 role；本 App 同時有主 UI 與多個內容 WebContentsView，role 會選錯對象。另提供「複製連結網址」。
- 程式保留一般網站瀏覽，不限制 Arena 網域。使用者導覽、外部瀏覽器連結、右鍵連結、popup 與重新導向僅接受 HTTP(S)，拒絕 file/data/javascript/custom/mailto/tel 等協定，以及含明文帳密的網址。程式主動載入的指定 UI / offline 檔案是唯一的本機文件例外。
- OAuth 回跳比較解析後的 origin（scheme、host、port），不使用字串前綴。來源 tab id 隨 popup 保留，回跳只重載來源，不切換活動分頁。這是桌面容器回跳偵測，不取代網站本身的 OAuth state / PKCE 驗證。

## 資源與持久化

- Tray 持續保存引用；popup 存在 `Set<BrowserWindow>`，closed 時移除、退出時清理。
- 背景分頁啟用 Chromium `backgroundThrottling`。這不是完整暫停或記憶體釋放；沒有加入強制 discard、分頁數量上限或記憶體警告，以免遺失聊天輸入。網站背景回覆／推播仍需實機驗收。
- 設定有 runtime validation 與 `settingsVersion: 1`。舊版／損壞／型別錯誤資料逐欄補預設值；UI 不能透過設定 IPC 改寫 restoreTabs / windowBounds / schema 版本。
- `SettingsStore` 啟動只同步讀一次。日常變更即時更新記憶體，350ms 合併、序列化非同步寫入暫存檔、fsync、rename。寫入失敗保留舊 JSON 並可於下一次 flush 重試。
- resize/move 與 slider 不再逐次同步寫磁碟；只有真正變更主題、登入啟動或快捷鍵時才更新對應原生功能。
- 正常退出／關窗結束／Tray quit／安裝更新之前取消排程、擷取最新分頁、等待 settings flush，再退出。取消 updater 初始 timeout 及 interval。強制終止、斷電、Windows 強制結束 session 或磁碟故障不保證保存最後一次變更。
- title/favicon/loading/zoom 等 UI 更新以 32ms 合併傳送；只有新增、移除、排序與主 frame URL 變動排程保存分頁（1.5 秒）。這些 UI 事件不觸發 layout。
- 清除資料會先銷毀所有內容 document 與 popup，清除儲存／快取／HTTP 認證，再以原 URL、排序及活動位置重建，避免背景頁持有舊的登入狀態。會丟失尚未送出的頁面輸入。
- 主題更新同步既有 native view 與 popup 背景、離線頁；不強制改寫第三方網站自己的 CSS 主題。

## Build 與發布

- `engines`: Node >=22.12.0、npm >=10。
- Vite config 改為 `.mts`；Electron 輸出仍維持 CommonJS。
- `build:electron` 先清除舊輸出，避免舊 preload 留在安裝包。
- `dist:win` / `release:win` 都先產生 icon；共用打包腳本明確選 beta/latest channel。
- 一般 CI 僅 read 權限，不建立安裝包。獨立 Release workflow 僅由 tag 或手動啟動，通過完整 CI 才打包；只有最後 publish job 有 contents write。
- 發布需要與版本號對應的 `release-notes/vX.Y.Z[-beta.N].md`，不自動重用舊版說明或覆蓋已發布資產。
- 正式版／Beta 自動更新分流維持 electron-updater 的 SemVer 預設規則。

## 驗證

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run gen:icon
npm run build
# 下列需要 Windows 或其他可啟動 Electron 的圖形桌面
npm run test:electron
```

- 純函式／單元測試：協定與 origin、IPC sender/frame/document、preload 隔離、設定驗證、atomic write 故障與併發、排序／zoom、updater timer 清理、剪貼簿權限矩陣（權限名稱／來源／欄位退回）。
- 真正 Electron 整合測試：設定遮擋回歸、全部特權 IPC 的不可信視窗拒絕、協定封鎖、OAuth 來源分頁、全部分頁清除資料／重建、離線重試、UI 重載／崩潰復原、立即退出的分頁 flush，以及網頁 `navigator.clipboard.writeText()` 真的寫進系統剪貼簿、非 Arena 來源讀取仍被拒。
- OAuth 使用本機 fixture，不會登入真實帳號；尚需驗證 Google 實際登入、長時間背景通知、Windows 重啟／登出，以及 NSIS 安裝更新端到端流程。沒有進行記憶體壓力測試，也不宣稱 backgroundThrottling 可消除所有背景資源消耗。
