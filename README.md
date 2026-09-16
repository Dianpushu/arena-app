# Arena Desktop 🖥️

**arena.ai 的非官方 Windows 桌面版**，用 Electron 打造：

- 🗂️ **多分頁瀏覽**（開新分頁、拖曳排序、還原上次分頁、上一頁/下一頁、縮放）
- 📌 **系統匣常駐**（關閉縮到背景、用托盤選單或快捷鍵叫回）
- ⌨️ **全域快捷鍵**（預設 `Ctrl+Shift+A`，可在設定裡自訂）
- 🔔 **系統通知**（網站推播 → Windows 原生通知，可開關）
- 🔄 **自動更新**（背景下載新版，一鍵重新啟動套用）
- 📦 **兩種安裝包**：NSIS 安裝精靈（`*-Setup-*.exe`）＋ 免安裝攜帶版（`*-portable.exe`）
- 🔐 **記住登入**（獨立持久化 session，重開 App 不掉登入；Google 登入彈窗在 App 內完成）
- 📡 **斷線頁面**（沒網路時顯示友善重試頁，而不是白畫面）
- 🖱️ **中文右鍵選單**（輸入框剪下/複製/貼上、連結用瀏覽器開啟）
- 🎨 **官網同款外觀**（暖米紙色＋襯線字＋官方柱式標誌，另有深色主題可切換）

> 免責聲明：這是社群自製的非官方客戶端，與 arena.ai 官方無關。
> App 內使用的官方標誌商標權屬 Arena 所有，僅用於識別此客戶端連接的服務。

---

## 目錄

- [為什麼選 Electron？](#為什麼選-electron)
- [系統需求](#系統需求)
- [快速開始](#快速開始)
- [專案結構](#專案結構)
- [打包安裝包](#打包安裝包)
- [發佈新版本與自動更新](#發佈新版本與自動更新)
- [圖示與外觀](#圖示與外觀)
- [設定與資料位置](#設定與資料位置)
- [常見問題](#常見問題)
- [Roadmap](#roadmap)

---

## 為什麼選 Electron？

| 需求 | Electron | Tauri |
|---|---|---|
| arena.ai 是重型互動式 Web App | ✅ 內嵌完整 Chromium，相容性最穩 | ⚠️ 用系統 WebView2，渲染差異難除錯 |
| 多分頁（多 WebView 管理） | ✅ `WebContentsView` 成熟 | ⚠️ 多 WebView＋分頁要自己刻，較麻煩 |
| 系統匣 / 全域快捷鍵 / 通知 | ✅ 現成 API | ✅ 也有，但生態較小 |
| NSIS＋免安裝版＋自動更新 | ✅ electron-builder＋electron-updater 一條龍 | ⚠️ updater 需額外設定簽章流程 |
| 安裝包大小 | ❌ 約 60–80 MB | ✅ 約 10–15 MB |
| 記憶體佔用 | ❌ 較高（獨立 Chromium） | ✅ 較低 |

**結論**：你要的是「包裝＋桌面增強＋進階功能」，穩定性和開發速度優先，Electron 是務實的選擇。
安裝包大小是主要代價，但對 Windows 桌面軟體來說完全可接受。

技術棧：`Electron 44` ＋ `Vite 8` ＋ `React 19` ＋ `TypeScript` ＋ `electron-builder 26`

---

## 系統需求

- Windows 10（1809 以上）/ Windows 11，64 位元
- [Node.js 22.12.0 以上](https://nodejs.org/)（開發用；一般使用者裝成品 `.exe` 不需要 Node）
- Git

## 快速開始

```powershell
# 1. 取得程式碼
git clone https://github.com/Dianpushu/arena-app.git
cd arena-app

# 2. 安裝依賴（第一次會下載 Electron，約 100 MB，請耐心等候）
npm install

# 3. 啟動開發模式（Vite 前端 + Electron 桌面視窗）
npm run dev
```

- 改 `src/` 的 React 程式碼會熱重載；改 `electron/` 主進程程式碼要重跑 `npm run dev`。
- 開發模式會自動開啟 DevTools，正式打包不會。
- 其他指令：`npm run typecheck`（型別檢查）、`npm run build`（編譯但不打包）。

## 專案結構

```
arena-app/
├── electron/            # 主進程（Node 環境）
│   ├── main.ts          # 進入點：視窗、IPC、彈窗、權限
│   ├── tabs.ts          # 分頁管理（WebContentsView 多開、縮放、離線頁）
│   ├── ui-preload.ts    # 主 UI 的完整 API（main 再驗證 sender/frame/URL）
│   ├── content-preload.ts # 內容分頁僅提供受限制的離線重試
│   ├── url-policy.ts    # HTTP(S) 與精確 origin / document 驗證
│   ├── settings-store.ts # debounce / async / atomic 設定儲存
│   ├── tray.ts          # 系統匣圖示與選單
│   ├── shortcuts.ts     # 全域快捷鍵
│   ├── updater.ts       # 自動更新（electron-updater）
│   ├── context-menu.ts  # 右鍵選單
│   ├── settings.ts      # JSON 設定檔讀寫
│   └── shared.ts        # 三端共用型別（主進程/Preload/前端）
├── src/                 # 前端（分頁列＋工具列＋設定面板）
│   ├── App.tsx          # 主畫面、快捷鍵、狀態管理
│   ├── api.ts           # window.arena 呼叫封裝＋瀏覽器預覽用 mock
│   └── components/      # TitleBar / ToolBar / SettingsPanel / Toasts
├── public/offline.html  # 斷線時顯示的頁面
├── assets/icon.svg      # 圖示來源（官方柱式標誌，換圖示只換這張）
├── scripts/gen-icon.mjs # 從 PNG 產生 Windows .ico
├── electron-builder.yml # 打包設定（NSIS＋portable＋自動更新來源）
└── .github/workflows/   # Windows 自動打包 CI
```

架構圖：

```
┌─ BrowserWindow（無邊框，自繪 UI）─────────────────┐
│ 分頁列 + 工具列（React，跑在 window 本體）          │
├───────────────────────────────────────────────────┤
│ 分頁內容（WebContentsView × N，同 session 持久化）  │  ← arena.ai 網頁
└───────────────────────────────────────────────────┘
     ↕ IPC（preload 白名單 API）   ↖右鍵/彈窗/托盤/快捷鍵/自動更新
```

## 測試與程式碼檢查

設定是 React DOM，但網頁是原生 `WebContentsView`，CSS `z-index` 無法蓋過它。
主 UI 透過受 sender／frame 驗證的 IPC 同步設定開關，`TabManager` 在每次 layout 時套用隱藏狀態；關閉設定後恢復目前分頁，不銷毀或重新載入網頁。

在有圖形桌面的環境（Windows CI 會自動執行）：

```powershell
npm run lint
npm run typecheck
npm test
npm run gen:icon
npm run build
npm run test:electron
```

測試使用臨時使用者資料目錄與本機 HTTP 測試網頁，實際走 Renderer → preload → IPC → 原生視圖，驗證設定開關、版面／分頁變動、IPC / preload 隔離、OAuth 來源分頁、清除資料重建、離線重試及退出前儲存。瀏覽器預覽不包含原生視圖，不能單靠它驗證這類層級問題。

純函式與儲存測試使用 Node test runner，無需 Electron 圖形桌面。Lint 使用支援 TypeScript 7 的 Oxlint；格式化使用 `npm run format`（Prettier）。

## 打包安裝包

```powershell
npm run dist:win
```

完成後到 `dist-release/` 拿檔案：

| 檔案 | 說明 |
|---|---|
| `Arena-Setup-0.1.0.exe` | NSIS 安裝精靈：下一步安裝、有開始選單/桌面捷徑、支援自動更新 |
| `Arena-0.1.0-portable.exe` | 免安裝攜帶版：點開即用（⚠️ 攜帶版不支援自動更新，要手動下載新版） |

> 沒有程式碼簽署憑證的話，Windows SmartScreen 首次開啟會跳警告，按「其他資訊 → 仍要執行」即可。
> 這是所有未簽署軟體的正常現象（見下方常見問題）。

## 發佈新版本與自動更新

### CI 與 Release 分離

- **CI**（`.github/workflows/ci.yml`）：一般 push / PR 只執行 lint、typecheck、單元測試、build 與 Windows Electron 整合測試。不產生安裝包、不發布；權限為 `contents: read`。
- **Release Windows**（`.github/workflows/release.yml`）：僅 `v*` tag 或手動執行才驗證、打包、發布。只有最後的 `publish` job 擁有 `contents: write`；編譯與測試 job 不持有寫入權限。
- 舊的 `[publish-beta]` commit 標記不再觸發發布。

### 發布步驟

1. 使用 `npm version <版本號> --no-git-tag-version` 同步版本與 lockfile。Beta 使用 `X.Y.Z-beta.N`；正式版使用 `X.Y.Z`。
2. 建立對應的 `release-notes/v<版本號>.md`，再提交並推送工作分支。流程會拒絕缺少該版本說明、tag/version 不符或重複版本。
3. 新 workflow 合併至預設分支後，到 Actions → **Release Windows** → **Run workflow** 選定來源分支，輸入相同版本號，即可在檢查成功後發布並建立指向該次提交的 tag。也可以由維護者建立對應的 `v<版本號>` tag 觸發。
4. Beta 自動標記為 GitHub Pre-release、不標記 Latest，附上 `beta.yml`；正式版發布為正式 Release，附上 `latest.yml`。兩者都提供 NSIS、portable 與 `.blockmap`。

請不要直接覆寫已發布版本的資產；修正應使用新版本號。Release 流程會再次執行 CI；只有全部通過才打包與發布。

本機需要發布時，`npm run release:win` 會先產生 icon，依版本號選擇 beta/latest channel。它需要已設定的 GitHub 發布權限；正式版先建立 draft 供維護者確認，Beta 標記為 prerelease。建議優先使用上面的 Release workflow。

### 自動更新分流

`electron-updater` 依目前執行版本的 prerelease component 決定 `allowPrerelease`：正式版不接受 Beta；Beta 可接收更新的 Beta 或正式版。版本升為正式版後，後續啟動自然回到正式版更新規則。不允許自動降版。

安裝版在啟動 10 秒後、之後每 6 小時自動檢查更新；退出時會取消初始 timeout 與 interval。

⚠️ **如果你 fork 或改名了這個 repo**，記得同步改 `electron-builder.yml` 的 `publish.owner/repo`，
否則自動更新會去錯誤的地方找新版本。

## 圖示與外觀

- 圖示來源是 `assets/icon.svg`（Arena 官方 rebrand 柱式標誌，取自 https://arena.ai/images/favicon-rebrand.svg，僅把配色改為 currentColor 以跟隨 App 主題）。
  `npm run gen:icon` 會自動產生米色圓角底的 `assets/icon.png`（1024px，視窗＋系統匣用）
  與 `assets/icon.ico`（多尺寸，安裝包用）；打包時會自動跑，不用手動執行。
- 要換圖示：用新的 SVG 蓋掉 `assets/icon.svg` 再跑 `npm run gen:icon` 即可。
  標題列裡的標誌是直接引入同一份 SVG（`?raw`），會自動同步。
- 外觀主題預設是跟官網同款的暖米色（`arena`），在設定裡可切換深色（`dark`）。
  主題存在設定檔裡（見下表），切換即時生效，不用重開。

## 設定與資料位置

| 內容 | Windows 路徑 |
|---|---|
| 設定檔 `settings.json` | `%APPDATA%\Arena\` |
| 登入 Cookie / 快取 / 分頁還原 | `%APPDATA%\Arena\`（Partition `persist:arena`） |

解除安裝 NSIS 版時**不會**刪除這些資料（`deleteAppDataOnUninstall: false`），
要登出直接在 App 設定裡按「清除瀏覽資料」即可。清除時會關閉登入 popup、銷毀所有內容分頁，清除 Cookies／網站儲存／快取與 HTTP 認證，再重建分頁；未送出的頁面輸入會消失。

Portable 也使用上述使用者資料夾，不是將 Cookies 存在 EXE 旁邊。
設定含 `settingsVersion: 1`；舊檔案逐欄驗證並補預設值。修改會即時更新記憶體，350ms 合併後非同步寫入 `settings.json.tmp`、fsync，再 rename；正常退出會等待最新分頁與設定寫完。強制終止、斷電或磁碟故障仍可能遺失尚未完成的變更。

安全策略、驗證範圍與尚未採用的效能策略見 [Electron 強化紀錄](docs/electron-hardening.md)。

## 常見問題

**Q：打開安裝好的 App 顯示 SmartScreen 警告？**
A：因為沒有購買程式碼簽署憑證（一年約數千台幣）。按「其他資訊 → 仍要執行」即可。
之後如果要簽署，買憑證後在 CI 補上 `CSC_LINK` / `CSC_KEY_PASSWORD` 兩個 secret 即可，electron-builder 原生支援。

**Q：防毒軟體誤報？**
A：未簽署的 Electron App 偶爾會被誤判。解法同上：簽署憑證；或把安裝流程改走 Microsoft Store（MSIX）。

**Q：登入狀態會不見嗎？**
A：不會。所有分頁共用 `persist:arena` 持久化 session，Cookie 存在本機，除非你按了「清除瀏覽資料」。

**Q：Google 登入彈窗打不開？**
A：App 會把彈窗開在 App 內小視窗並共用 session，登入完成跳回 arena.ai 時自動關閉。
如果卡住，把彈窗關掉重試一次即可。

**Q：攜帶版可以自動更新嗎？**
A：不行，這是 electron-updater 的限制（只有 NSIS 版支援）。攜帶版要手動下載新版覆蓋。

**Q：可以用在 Mac / Linux 嗎？**
A：程式碼本身跨平台，但目前只寫了 Windows 的打包設定和測試。以後要加的話，在 `electron-builder.yml` 補 `mac` / `linux` 區段並加 CI job 即可。

**Q：怎麼除錯主進程？**
A：開發模式的終端機會直接印主進程 `console.log`；前端的 log 在 DevTools Console。

## Roadmap

- [ ] 啟動時最小化到系統匣選項
- [ ] 主題跟隨系統（目前為手動切換）
- [ ] 下載管理（arena.ai 匯出對話時）
- [ ] 程式碼簽署＋ Microsoft Store（MSIX）上架
- [ ] macOS / Linux 打包
