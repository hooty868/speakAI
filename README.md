## speakAI – 語音助理（Next.js + OpenAI TTS）

一個使用 Next.js、Tailwind CSS 與 OpenAI TTS 的語音助理應用。使用者輸入文字、選擇不同人聲後，按下按鈕即呼叫後端 API 產生語音，並立即在前端播放。

### 功能特色
- **文字轉語音（TTS）**: 透過 OpenAI `gpt-4o-mini-tts` 產生高品質語音
- **多種人聲切換**: 內建多種人聲可選（如 `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`）
- **即時播放**: 後端回傳音訊資料，前端直接播放 MP3
- **安全的 API 金鑰管理**: 以環境變數（env）保護，不會在前端暴露
- **現代化 UI**: 使用 Tailwind CSS，並套用提供的設計
- **使用 pnpm 管理**: 以 Corepack 啟用 pnpm，快速安裝與建置

### 技術棧
- **框架**: Next.js App Router（`app/`）
- **樣式**: Tailwind CSS（含 `@tailwindcss/forms`）
- **後端 SDK**: OpenAI Node SDK
- **語言**: TypeScript

### 目錄結構（精簡）
- `app/page.tsx`: 主頁 UI（文字輸入、語音選擇、播放按鈕）
- `app/api/tts/route.ts`: TTS API（呼叫 OpenAI 產生語音並回傳）
- `app/layout.tsx`: 根版型與全域樣式載入
- `app/globals.css`: Tailwind 與客製樣式
- `tailwind.config.js` / `postcss.config.js`: Tailwind 設定
- `next.config.js`: Next.js 設定
- `package.json`: 專案資訊與指令、使用 `pnpm`

### 環境變數（env）
- 必要：`OPENAI_API_KEY`
- 本機：在專案根目錄建立 `.env.local`，內容例如：
```bash
OPENAI_API_KEY=your_openai_api_key
```
- 範例檔：可使用 `.env.example` 作為參考
- 注意：`NEXT_PUBLIC_*` 變數會被曝露到前端（本專案不需要）

### 本機開發流程（pnpm）
1) 啟用 Corepack 並指定 pnpm 版本
```bash
corepack enable
corepack use pnpm@9.6.0
```
2) 安裝套件
```bash
pnpm install
```
3) 設定環境變數（本機）
```bash
cp .env.example .env.local
# 編輯 .env.local 並填入 OPENAI_API_KEY
```
4) 啟動開發伺服器
```bash
pnpm dev
```
開啟瀏覽器前往 http://localhost:3000

5) 建置與啟動
```bash
pnpm build
pnpm start
```

### 部署到 Vercel
- 在 Vercel 專案的 Environment Variables 新增：
  - **Key**: `OPENAI_API_KEY`
  - **Environments**: Production / Preview / Development 全部勾選
- 一旦設定完成即可部署；API 會於伺服器端讀取該變數

### 人聲列表（Voice）
- 預設為 `alloy`
- 可選值：`alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`

### 安全與最佳實務
- 請勿將 `OPENAI_API_KEY` 放在前端或提交到版本庫
- 只在伺服器端（`app/api/tts/route.ts`）使用 API 金鑰
- 將 `.env*`、`node_modules`、`.next` 等加入 `.gitignore`

### 常見問題（Troubleshooting）
- 401/403：請確認 `OPENAI_API_KEY` 是否正確、是否有權限
- 無法播放音訊：請檢查瀏覽器是否攔截自動播放，或確認回傳的 `Content-Type` 是否為 `audio/mpeg`
- 型別錯誤：請確保依照本專案的 `Voice` 選項傳遞

### NPM Scripts（pnpm）
- `pnpm dev`: 開發模式
- `pnpm build`: 產生產線版
- `pnpm start`: 啟動產線版伺服器

---
如需擴充功能（例如錄音上傳、語音識別、串接聊天對話流程等），可以在現有結構上加入額外的 API route 與 UI 元件。
