# Arena Desktop 🖥️

**arena.ai 的非官方 Windows 桌面版**，用 Electron 打造：

- 🗂️ **多分頁瀏覽**（開新分頁、還原上次分頁、上一頁/下一頁、縮放）
- 📌 **系統匣常駐**（關閉縮到背景、用托盤選單或快捷鍵叫回）
- ⌨️ **全域快捷鍵**（預設 `Ctrl+Shift+A`，可在設定裡自訂）
- 🔔 **系統通知**（網站推播 → Windows 原生通知，可開關）
- 🔄 **自動更新**（背景下載新版，一鍵重新啟動套用）
- 📦 **兩種安裝包**：NSIS 安裝精靈（`*-Setup-*.exe`）＋ 免安裝攜帶版（`*-portable.exe`）
- 🔐 **記住登入**（獨立持久化 session，重開 App 不掉登入；Google 登入彈窗在 App 內完成）
- 📡 **斷線頁面**（沒網路時顯示友善重試頁，而不是白畫面）
- 🖱️ **中文右鍵選單**（輸入框剪下/複製/貼上、連結用瀏覽器開啟）

> 免責聲明：這是社群自製的非官方客戶端，與 arena.ai 官方無關。

---

## 目錄

- [為什麼選 Electron？](#為什麼選-electron)
- [系統需求](#系統需求)
- [快速開始](#快速開始)
- [專案結構](#專案結構)
- [打包安裝包](#打包安裝包)
- [發佈新版本與自動更新](#發佈新版本與自動更新)
- [換圖示](#換圖示)
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
- [Node.js 22 LTS](https://nodejs.org/)（開發用；一般使用者裝成品 `.exe` 不需要 Node）
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
│   ├── preload.ts       # 安全橋樑：只暴露白名單 API 給前端
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
├── assets/icon.png      # 圖示來源（換圖示只換這張）
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

自動更新的來源是 **GitHub Releases**，流程已經全自動：

```powershell
# 1. 改 package.json 的 version，例如 0.1.0 → 0.2.0
# 2. 提交並打 tag
git add -A
git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin arena/01a0a816-arena-app --tags
```

CI 會在 Windows 上打包並把 `.exe`＋`latest.yml` 上傳到該 tag 的 Release。
使用者那邊的 App 會在啟動 10 秒後（之後每 6 小時）自動檢查、下載，
下載完成後在工具列和設定裡出現「重新啟動並更新」。

⚠️ **如果你 fork 或改名了這個 repo**，記得同步改 `electron-builder.yml` 的 `publish.owner/repo`，
否則自動更新會去錯誤的地方找新版本。

## 換圖示

1. 準備一張 512×512 以上的正方形 PNG，蓋掉 `assets/icon.png`
2. 跑 `npm run gen:icon`（打包時也會自動跑，不跑也沒關係）

## 設定與資料位置

| 內容 | Windows 路徑 |
|---|---|
| 設定檔 `settings.json` | `%APPDATA%\Arena\` |
| 登入 Cookie / 快取 / 分頁還原 | `%APPDATA%\Arena\`（Partition `persist:arena`） |

解除安裝 NSIS 版時**不會**刪除這些資料（`deleteAppDataOnUninstall: false`），
要登出直接在 App 設定裡按「清除瀏覽資料」即可。

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

- [ ] 分頁拖曳排序
- [ ] 啟動時最小化到系統匣選項
- [ ] 深色/淺色主題跟隨系統
- [ ] 下載管理（arena.ai 匯出對話時）
- [ ] 程式碼簽署＋ Microsoft Store（MSIX）上架
- [ ] macOS / Linux 打包
