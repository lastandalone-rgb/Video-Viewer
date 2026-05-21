# 🎬 Video Viewer

一款基於 **Electron + React** 打造的現代化本地影片管理播放器，支援多種瀏覽模式、資料夾樹狀管理、內建瀏覽器等豐富功能。

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
![Electron](https://img.shields.io/badge/Electron-42.x-47848F?logo=electron)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite)

---

## ✨ 功能特色

### 📁 影音資料庫管理
- 新增本地資料夾至資料庫，自動掃描所有影片
- 支援直接將資料夾或影片**拖曳**進視窗加入庫
- 資料夾縮圖自動從第一部影片產生

### 🖼️ 多種瀏覽模式
- **網格模式**：卡片式縮圖瀏覽，支援分頁（可設定每頁 24 / 48 / 96 筆或全部載入）
- **條列模式**：清爽的清單檢視
- **清單模式**：含日期、大小詳細資訊的表格檢視
- **劇場模式**：左側影片清單 + 右側內嵌播放器，連續播放體驗

### 🗂️ 資料夾樹狀結構模式
- 每個資料夾可獨立設定為「**扁平模式**」（顯示全部影片）或「**樹狀模式**」（顯示子資料夾結構）
- 樹狀模式下可直接瀏覽子資料夾層級
- 支援**拖曳影片至子資料夾**，自動在 Windows 中移動實體檔案
- 搬移後右下角顯示 Toast 通知，支援一鍵**復原**搬移操作

### 🎬 靈活播放方式
- **視窗內播放**：直接在應用程式內全螢幕播放
- **彈出獨立視窗**：開啟獨立的浮動播放視窗
  - 點擊任意位置可**拖曳移動**播放視窗
  - 圖釘按鈕可切換**永遠置頂**
  - 支援設定預設是否置頂

### 🎮 播放器功能
- 進度條拖曳、快進 / 快退 10 秒
- 音量控制與靜音
- 播放速度調整（0.5x ~ 2x）
- 迴圈模式：單片迴圈、播放清單迴圈，可設定迴圈次數
- 自動連播下一部
- 雙擊進入 / 退出全螢幕

### ❤️ 我的最愛
- 右鍵選單可將影片或資料夾加入最愛
- 最愛頁面分類顯示：**網頁書籤**、**資料夾**、**影片**

### 🌐 內建瀏覽器
- 完整可操作的內建瀏覽器（基於 Electron WebView）
- 頂部控制列：**上一頁**、**下一頁**、**重新整理**、**網址列**
- 一鍵將當前網頁**加入書籤**，書籤同步顯示於「我的最愛」
- 設定中可設定預設首頁

### ⚙️ 設定中心
- 預設視圖模式（網格 / 條列 / 清單 / 劇場）
- 播放行為（視窗內 / 彈出視窗）
- 彈出視窗預設置頂開關
- 網格模式分頁數量
- 快取與縮圖自訂存放路徑
- 內建瀏覽器首頁網址

### 🔄 全局狀態保留
- 切換左側菜單（資料庫 ↔ 最愛 ↔ 瀏覽器 ↔ 設定）時，**各頁面的瀏覽狀態與捲軸位置完整保留**，不會重置

---

## 🚀 快速開始

### 系統需求
- Windows 10 / 11
- macOS 10.15 (Catalina) 或更新版本，支援 Intel (x64) 與 Apple Silicon (arm64)
- Node.js 18+

### 安裝與開發

```bash
# 複製專案
git clone https://github.com/lastandalone-rgb/Video-Viewer.git
cd Video-Viewer

# 安裝依賴
npm install

# 啟動開發模式
npm run dev
```

### 打包為可執行檔

```bash
# 打包 macOS（產生 .dmg 與 .zip，同時支援 x64 與 arm64）
npm run build:mac

# 打包 Windows（產生 portable .exe）
npm run build:win

# 同時打包兩個平台（需在對應平台或 CI 環境執行）
npm run build
```

打包完成後：
- macOS：`release/` 目錄下的 `.dmg`（Intel）與 `arm64.dmg`（Apple Silicon）
- Windows：`release/VideoPlayer-win32-x64/VideoPlayer.exe`

---

## 🏗️ 技術架構

| 層面 | 技術 |
|------|------|
| 框架 | Electron 42 + React 19 |
| 建置工具 | Vite 8 + vite-plugin-electron |
| UI 元件 | Lucide React |
| 樣式 | Vanilla CSS（CSS Variables + Glassmorphism）|
| 資料儲存 | Electron 主程序 + JSON 設定檔 |
| 縮圖生成 | HTML5 Canvas（渲染器端）|

### 專案結構

```
video-viewer/
├── electron/
│   ├── main.js          # 主程序：視窗管理、IPC、檔案系統操作
│   └── preload.js       # 橋接層：安全地將 API 暴露給渲染器
├── src/
│   ├── components/
│   │   ├── VideoPlayer.jsx  # 播放器元件（內嵌 & 彈出）
│   │   └── Thumbnail.jsx    # 影片縮圖產生元件
│   ├── App.jsx          # 主應用程式：所有頁面與狀態管理
│   └── index.css        # 全域樣式
├── public/
├── index.html
├── vite.config.js
└── package.json
```

---

## 🎨 介面預覽

- 深色玻璃擬態（Glassmorphism）設計風格
- 流暢的過場動畫與 Hover 效果
- 響應式側邊欄（可收合）
- 懸浮式分頁控制列

---

## 📝 版本記錄

### v1.0.0
- 基礎影音資料庫管理與多種瀏覽模式
- 完整播放器功能（進度、音量、速度、迴圈）
- 彈出獨立播放視窗（含圖釘置頂）
- 資料夾樹狀模式與拖曳搬移檔案
- 搬移復原 Toast 通知
- 我的最愛（影片、資料夾、書籤）
- 內建瀏覽器（含網址列、書籤）
- 全局狀態保留（切換頁面不重置）
- 跨平台支援：自動偵測 macOS 環境下不支援的 MKV (AC3/DTS) 音訊，透過 ffmpeg 進行無縫即時轉碼串流播放
- 完美支援轉碼串流影片的任意進度條拖曳快轉 (Seeking)
- 智慧字幕載入：自動偵測並載入與影片同名的外掛字幕檔 (支援 SRT / VTT / ASS)
---

## 📄 授權

MIT License
