# HR 組織架構調整工具

人事用來管理公司人員的**組別歸屬**、**直屬／虛線主管**與**職級**的工具。支援矩陣組織（一人可多組、每組可有不同主管），並以 [React Flow](https://reactflow.dev/) 視覺化組織匯報關係與組別歸屬。

> **前端優先**：預設純前端，工作資料自動保存在瀏覽器 `localStorage`，並可匯出／匯入 JSON 做版本保存與共享。
> **後端為 opt-in**：另提供雲端版本持久化（Fastify + PostgreSQL，以 `VITE_API_URL` 啟用），可用 Docker Compose 一鍵起整套（DB + API + 前端）。

## 功能

- **人員與歸屬**：維護員工在各組別的職級與主管（含主主管、主組別）
- **組別管理**：組織單位階層與啟用狀態
- **組織圖**（兩種視角）
  - **匯報組織圖**：以人員為節點，依匯報關係連線（實線＝主匯報、虛線＝其他主管）
  - **組別歸屬圖**：以每筆「組別歸屬」為節點，同一人跨組會出現多個節點
- **直接從圖上編輯**：點節點開「人員詳情」浮動卡片，可改個人資料與各筆組別歸屬
- **調整紀錄**：變更歷程與 diff 檢視
- **版本與生效日**：發布版本可指定**生效日**（排程生效），版本下拉顯示「排程／已生效」
- **匯出／匯入**：自動存 `localStorage`；可手動匯出 JSON 或從檔案載入
- **CSV / Excel 匯入**：以一張「員工 × 組別」CSV 或 `.xlsx` 產生組織 JSON
- **雲端版本**（opt-in）：設定 `VITE_API_URL` 後，發布／刪除版本會寫穿到後端並併入版本下拉

## 技術棧

| 範疇 | 採用 |
|------|------|
| 框架 / 建置 | React 19、Vite 8、TypeScript |
| UI 元件 | [shadcn/ui](https://ui.shadcn.com/)（base-nova 風格，底層 [Base UI](https://base-ui.com/) + Radix Slot） |
| 樣式 | Tailwind CSS v4（`@tailwindcss/vite`）、`tw-animate-css`、`class-variance-authority`、`clsx` + `tailwind-merge` |
| 圖示 / 字型 | `lucide-react`、Geist（`@fontsource-variable/geist`） |
| 組織圖 | [`@xyflow/react`](https://reactflow.dev/)（React Flow v12）+ `@dagrejs/dagre`（自動排版） |
| 動畫 | `@react-spring/web`（觀景窗物理動畫） |
| 路由 | `react-router-dom` v7 |
| 後端（opt-in） | Node + TypeScript + [Fastify](https://fastify.dev/) v5、[Prisma](https://www.prisma.io/) v6、PostgreSQL 16、`zod` 驗證 |
| 容器 | Docker、docker-compose（DB + API + 前端 nginx） |

> 已自 Fluent UI v9 全面遷移至 shadcn/ui + Tailwind。後端為選用——純前端開發不需要它，詳見 [系統設計文件](docs/系統設計文件.md) 與 [後端規劃](docs/規劃-後端與持久層.md)。

## 開始使用

需求：**Node 20.19+ 或 22.12+**（Vite 8 要求）。

```bash
npm install
npm run dev      # 純前端開發（localStorage 模式）
```

瀏覽器開啟終端機顯示的網址（通常為 http://localhost:5173）。此模式不需後端。

### 用 Docker Compose 一鍵啟動整套（DB + API + 前端）

```bash
docker compose up -d --build   # 首次或改動後加 --build
docker compose ps              # 查看服務狀態
docker compose logs -f api     # 看後端日誌
docker compose down            # 停止（加 -v 連資料庫卷一起清）
```

- 前端：http://localhost:8088 （已內建指向後端 API）
- API：http://localhost:3001/api/health
- PostgreSQL：localhost:55432（對外埠，避免與本機 5432 衝突）

> 後端為 opt-in：純前端 `npm run dev` 不需要後端；要前後端整合（雲端版本持久化）才需起 compose 或設定 `VITE_API_URL`。
> 只起 DB + API（前端仍用 `npm run dev`）：`docker compose up -d --build db api`，再以 `VITE_API_URL=http://localhost:3001 npm run dev` 啟動前端。

## 專案結構

```
src/                      # 前端（React / Vite）
├─ pages/                 # 路由頁面：人員、組別、組織圖、調整紀錄、CSV/Excel 匯入、BPMN
├─ components/
│  ├─ ui/                 # shadcn/ui 基礎元件（button、select、card、dialog…）
│  ├─ orgFlow/            # 匯報組織圖：畫布、左上工具列、控制列、觀景窗、人員詳情
│  ├─ groupMembership/    # 組別歸屬圖的節點與畫布
│  ├─ bpmn/               # BPMN 流程設計畫布與屬性面板
│  └─ *.tsx               # 各種表單（員工、組別、歸屬）與清單
├─ context/               # OrgProvider / BpmnProvider（全域資料狀態）
├─ services/              # 純邏輯：建圖、CSV/xlsx、匯出入、版本、生效日、模擬、API client
│  └─ migrations/         # schemaVersion migration 框架（org / bpmn 共用）
├─ lib/                   # cn() 與下拉選項、語意色等小工具
├─ types/                 # 型別定義
└─ data/                  # 初始資料、CSV 範本、本機 mock

server/                   # 後端（opt-in，Fastify + Prisma）
├─ src/routes/            # REST 路由（/api/versions、/api/draft、/api/health）
├─ src/repositories/      # 持久層抽象 + 記憶體／Prisma 實作
└─ prisma/schema.prisma   # OrgVersion / OrgDraft（JSONB 文件持久化）

docker-compose.yml        # 一鍵起 DB + API + 前端 web
Dockerfile                # 前端多階段建置 → nginx
```

### 組織圖畫面元件（`components/orgFlow`）

| 元件 | 角色 |
|------|------|
| `OrgFlowChart` / `GroupMembershipFlowChart` | 兩種視角的 React Flow 畫布與版面組裝 |
| `OrgFlowTopBar` | 左上角：檢視組別（底線下拉）＋圖例驚嘆號 popup |
| `OrgDetailPanel` | 左側浮動人員詳情卡片，內含個人資料與組別歸屬編輯（Modal） |
| `OrgFlowControlBar` | 右下角水平控制列：導航模式（滑鼠／觸控板）、縮放百分比、放大縮小 |
| `OrgFlowChartChrome` | 右下角觀景窗（react-spring 圓鈕展開／吸收動畫）與全螢幕鈕 |
| `useDraggableFlowNodes` / `orgFlowNav` | 節點拖曳狀態、滑鼠／觸控板平移縮放參數 |

### 狀態與持久化

`OrgProvider` 持有全域組織資料。每次儲存（員工／組別／歸屬）都會：

1. 更新 React state
2. 寫入瀏覽器 `localStorage`（key：`hr-org-draft`）

重新整理會優先載入 `localStorage` 草稿；**匯出**才會下載 JSON 檔。

## 資料檔案說明

| 路徑 | 是否進版控 | 用途 |
|------|------------|------|
| `src/data/org-data.json` | 是 | 各環境共用的**初始**組織資料（無草稿時預設載入） |
| `src/data/mock/*.json` | 否（`.gitignore`） | 本機產生的其他版本，供開發時在「資料版本」選單切換 |

初始 `org-data.json` 內含 12 名員工、6 個組別，以及矩陣組織範例（例如黃建國同時屬於前端組與產品部）。

## 更新共用初始資料

1. 在應用程式中調整組別、主管或職級後按**儲存**（會自動存入 `localStorage`）。
2. 點工具列「**匯出目前資料**」下載 `org-data-*.json`。
3. 將下載檔案內容**覆蓋** `src/data/org-data.json` 並 commit。
4. 重新整理或用「從檔案載入」驗證。

## CSV 匯入（成員歸屬 → JSON）

一張 CSV 彙整「員工 × 組別」歸屬，可轉成 `src/data/mock/*.json`（本機、不進版控）並在版本選單切換。

### 欄位（一列一筆 assignment）

| 欄位 | 說明 |
|------|------|
| `employeeNo` / `employeeName` / `employeeStatus` | 員工工號、姓名、在職狀態（active / inactive） |
| `groupCode` / `groupName` / `parentGroupCode` / `groupStatus` | 組別代碼、名稱、上層組別代碼（根節點留空）、狀態 |
| `jobLevelCode` / `jobLevelName` / `jobLevelRank` | 職級 |
| `supervisorEmployeeNos` | 主管工號，多筆以 `\|` 分隔 |
| `primarySupervisorEmployeeNo` | 主主管工號 |
| `isPrimaryGroup` | 是否主組別（1 / 0） |

範本：`src/data/templates/org-members.template.csv`
完整範例：`npm run generate:csv-sample` 產生 `org-members.sample.csv`

### 指令寫入本機 mock

```bash
npm run import:csv -- -i ./src/data/templates/org-members.sample.csv -o org-data-imported -v 3
```

成功後**重新啟動** `npm run dev`，在頂部「資料版本」選單選擇新檔案。應用內也可開啟 **CSV 匯入** 頁面：上傳預覽、下載 JSON，或複製上述指令。

## 資料格式

單一 JSON 檔案，欄位說明：

| 欄位 | 說明 |
|------|------|
| `employees` | 員工（id、工號、姓名、在職狀態） |
| `groups` | 組別（代碼、名稱、上層 parentId、狀態） |
| `jobLevels` | 職級表（code、name、rank） |
| `assignments` | 歸屬：員工 + 組別 + 職級 + 主管清單 + 主主管 + 是否主組別 |
| `changeLog` | 調整紀錄 |

## 指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 型別檢查 + 建置正式版 |
| `npm run preview` | 預覽建置結果 |
| `npm run lint` | ESLint 檢查 |
| `npm run test` | 執行單元測試（Vitest） |
| `npm run test:watch` | 監看模式測試 |
| `npm run test:cov` | 測試並產生覆蓋率報告（含門檻） |
| `npm run verify` | 一鍵驗證（前端）：型別 + lint + 測試覆蓋率 + 建置 |
| `npm run verify:server` | 驗證後端（`server/`：tsc + 測試） |
| `npm run verify:all` | 前端 + 後端整套驗證 |
| `npm run setup:hooks` | 啟用 pre-push 驗證 hook（clone 後執行一次） |
| `npm run import:csv` | CSV → 本機 mock JSON |
| `npm run generate:csv-sample` | 產生 CSV 範例檔 |

## 測試

以 [Vitest](https://vitest.dev/)（jsdom 環境）撰寫，測試檔與來源並列（`*.test.ts`）。

```bash
npm run test       # 單次執行
npm run test:cov   # 覆蓋率（services/context 設有門檻，CI 強制）
```

- 前端約 **255** 個測試（43 檔）：schema migration、核心 services（org 操作、圖形建構、BPMN 模擬與影響分析、CSV/xlsx、生效日、API client）、Context Provider，以及 UI 元件／互動／無障礙（vitest-axe）與 DOM 快照。
- 後端（`server/`）有自己的 Vitest 設定，含路由與 Prisma 整合測試（CI 起真實 Postgres）。
- CI（`.github/workflows/test.yml`）於 push / PR 跑前端 lint + 型別檢查 + 覆蓋率門檻，以及後端測試。
- 開發流程採常綠 `integration` 分支 + pre-push 驗證，詳見下方文件連結。

## 後續擴充

本輪已完成：opt-in 後端 API + JSONB 版本持久層（P1–P3）、版本生效日、Excel 匯入。後續方向：

- 正式送簽流程（接 BPMN 簽核）
- 後端實體表正規化（P4，目前以 JSONB 文件持久化）、BPMN 持久化（P5）、認證接點（P6）
- Azure AD / SSO 登入與權限控管、多租戶

> 細部進度見 [代辦清單](docs/待辦清單.md) 與 [後端規劃](docs/規劃-後端與持久層.md)。

## 文件

- [系統設計文件](docs/系統設計文件.md)：整體架構（前端 + opt-in 後端）、資料模型、核心服務、Roadmap
- [規劃：後端與持久層](docs/規劃-後端與持久層.md)：後端選型、儲存庫結構與 P1–P6 漸進式導入進度
- [規劃：自動化測試與 schema 版控](docs/規劃-自動化測試與schema版控.md)：測試導入與 schema 版本管理
- [工作流程：integration 分支](docs/工作流程-integration分支.md)：以常綠整合分支讓合併回 main 零阻塞
- [代辦清單](docs/待辦清單.md)：backlog 與完成進度
- [無障礙稽核報告](docs/無障礙稽核報告.md) ｜ [UI 測試驗收報告](docs/UI測試驗收報告.md)：點時間品質報告（2026-06-06）
</content>
