# HR 組織規劃工具

> **HR 用來規劃組織結構的試算工具**——沿**匯報線（階層部門）× 專案職能（跨部門）**雙維度，建立、試算、健檢、比較多個組織方案後，選一個發布生效。前端優先（localStorage），後端為 opt-in。

[![整合分支驗證](https://img.shields.io/badge/integration-pre--push%20verify-brightgreen)](docs/工作流程-integration分支.md) [![測試](https://img.shields.io/badge/tests-463%20passing-brightgreen)](#測試) [![部署](https://img.shields.io/badge/deploy-GitHub%20Pages-blue)](#部署)

---

## 這個工具給誰、解決什麼

**給誰**：HR / 組織治理人員（組織規劃者）。

**解決什麼**：
- HR 在做組織調整時，過去常常開 Excel／畫白板來試算，缺一個「能視覺化、能比較、能看影響」的工具。
- 本工具讓 HR 在**草稿**中安全試算多個方案，量化評估結構（管理幅度、職能缺口、單點風險），並比較版本後再發布。
- **定位邊界**：這**不是全公司日常營運系統**——不接 SSO、不做正式送簽、不做多租戶。BPMN 流程**只是輔助透鏡**，用來看「組織改了之後動到哪些核准路徑」，不是簽核引擎。

> 詳細定位校準理由見 [系統設計文件 §1](docs/系統設計文件.md#1-專案概述) 與 [待辦清單「定位（最高指導原則）」](docs/待辦清單.md)。

---

## 規劃旅程 walkthrough

從打開應用到發布一份組織方案，常見動線是這 6 步。**旅程是建議、不是強制——你可以任選一步開始**。首頁 `/`（總覽）會根據目前狀態，**自動推薦下一步**——你不需要記住流程。

| # | 步驟 | 在做什麼 | 對應頁面 | 一句話例子 |
|---|---|---|---|---|
| 1 | **載入現況** | 取得基礎組織資料（員工、組別、主管關係） | `/csv-import` 或內建範本（首頁工具列） | 「從 HRIS 匯出員工 × 組別 CSV 進來」 |
| 2 | **編輯人員與組別** | 維護員工歸屬、主管關係、組別結構；可區分階層部門與跨部門職能 | `/people`、`/groups`、`/workbench`（組織圖中心） | 「把新 AI 小組標為跨部門職能，加入三位來自不同部門的成員」 |
| 3 | **規劃健檢** | 量化評估這個結構好不好 | `/health` | 「看哪個主管管理幅度過寬、有沒有單點風險（SPOF）、哪些職能沒人帶」 |
| 4 | **情境比較** | 並排試算多個方案，比 diff + 指標 | `/compare` | 「A 案扁平化 vs B 案強化矩陣，最多 4 案並排對照」 |
| 5 | **變更影響** | 看結構調整動到哪些作業／決策流程的核准路徑 | `/bpmn/impact` | 「設定基準後對照——改完之後哪些核准會找不到主管？」 |
| 6 | **發布版本** | 設定生效日並發布，下拉徽章顯示「排程／已生效」 | `/people` 工具列（DataToolbar） | 「6/30 公告、7/1 生效」 |

> 這 6 步是**建議路徑（可任選一步開始）**，不是強制順序——每步都可獨立進入或回頭使用。首頁 `OverviewPage` 會把每步顯示為 `done`／`ready`，並用智慧 CTA 卡片建議「現在最該做什麼」。

---

## 核心功能

### HR 規劃主線

- **總覽頁（首頁 `/`）**：歡迎標題 + 智慧 CTA 卡（推薦下一步）+ 6 步規劃旅程地圖 + 5 張狀態小卡（在職員工／部門／專案職能／已發布版本／流程定義）。是整套工具的入口與導航器。
- **雙維度建模（匯報線 × 專案職能）**：`Group.kind` 區分 `department`（階層部門，走 `parentId` 匯報線）與 `function`（跨部門職能，扁平）；表單可選種類、列表以徽章標示。
- **組織圖中心：工作台（`/workbench`）三視角**——上方一排 Tabs 切換三個視角，前兩者可編輯、共用同一編輯 session（在草稿中試算）：
  - **匯報組織圖**（可編輯）：節點＝人員、連線＝匯報關係（實線主匯報、虛線其他主管）；可拖人到主管節點上改匯報線。
  - **組別組織圖**（可編輯）：以組別為主，每人一節點、同組以背景分區聚集、組間以組長鏈相連；可拖成員改主管或改所屬組。
  - **組別歸屬圖**（唯讀）：節點＝每筆組別歸屬，同一人跨組會多個節點；可依「全部／部門／職能」**過濾**，並開啟**職能視角面板**（`FunctionCoveragePanel`：無成員職能、無 lead 職能、跨職能負載前幾名）。
  > 自旅程優先 IA 整併起，組織圖中心統一在工作台；舊路由 `/org-chart` 已**重導向 `/workbench`**（保留舊連結不死），主導覽不再有獨立的「組織圖」入口。
- **規劃健檢（`/health`）**：管理幅度（span of control，過寬／過窄）、層級深度、職能覆蓋缺口、結構風險（斷鏈／匯報循環／SPOF）的量化指標與可行動警示清單。
- **情境比較 what-if（`/compare`）**：最多 4 個情境槽並排，以陣列首個有效情境為基準算 `computeOrgDiff`，並對齊規劃指標矩陣（10 指標，down 指標標 warning／success 色，全相同不上色），協助 HR 試算多案後選擇。
- **變更影響（`/bpmn/impact`）**：HR 視角呈現「組織改了之後動到哪些作業／決策流程的核准人與路徑」。含「變更影響比對」與「流程健檢」兩個 tab，無流程資料時顯示主要 CTA 卡片連 `/bpmn`，避免雙重入口。
- **版本與生效日**：發布版本可指定**生效日**（排程生效），版本下拉徽章顯示「**排程／已生效**」，支援 `pickEffectiveVersionId` 推導「某時點目前生效版本」。

### 基礎能力

- **編輯模式快照（snapshot）與 diff 著色**：所有變更先進入草稿，可比對前後差異。
- **異動歷程面板（前後對比 + 操作流水）**：編輯時可開啟右側「異動歷程」面板，**發布前逐欄審視「這次到底改了什麼」**——「前後對比」分頁列出每個變動的員工／組別／歸屬的「欄位：前值→後值」（id 已解析為姓名／組名），「操作流水」分頁依時間序列出做了哪些操作、逐筆可展開欄位變更；匯報與組別兩視圖共用同一面板。
- **變更歷程（changelog）**：時間軸列出所有操作 + 前後 JSON diff 檢視（`/changelog`）。
- **CSV / Excel 匯入**：以一張「員工 × 組別」CSV 或 `.xlsx` 產生組織 JSON（`/csv-import` 或 CLI）。
- **資料版本管理**：草稿、內建種子、本機 mock、發布版本、雲端版本統一在版本下拉切換。
- **opt-in 後端**：設定 `VITE_API_URL` 後，發布／刪除版本會寫穿到 Fastify + PostgreSQL（JSONB 文件持久化），可用 Docker Compose 一鍵起 DB + API + 前端。

---

## 技術棧

| 範疇 | 採用 |
|------|------|
| 框架 / 建置 | React 19、Vite 8、TypeScript（strict） |
| UI 元件 | [shadcn/ui](https://ui.shadcn.com/)（base-nova 風格，底層 [Base UI](https://base-ui.com/) + Radix Slot） |
| 樣式 | Tailwind CSS v4（`@tailwindcss/vite`）、`tw-animate-css`、`class-variance-authority`、`clsx` + `tailwind-merge` |
| 圖示 / 字型 | `lucide-react`、Geist（`@fontsource-variable/geist`） |
| 組織圖 | [`@xyflow/react`](https://reactflow.dev/)（React Flow v12）+ `@dagrejs/dagre`（自動排版） |
| 動畫 | `@react-spring/web`（觀景窗物理動畫） |
| 路由 | `react-router-dom` v7 |
| Excel 解析 | `@e965/xlsx`（懶載入，不進首屏） |
| 後端（opt-in） | Node + TypeScript + [Fastify](https://fastify.dev/) v5、[Prisma](https://www.prisma.io/) v6、PostgreSQL 16、`zod` 驗證 |
| 容器 | Docker、docker-compose（DB + API + 前端 nginx） |

---

## 快速開始

需求：**Node 20.19+ 或 22.12+**（Vite 8 要求）。

### 純前端（localStorage 模式，最快）

```bash
npm install
npm run dev      # 開瀏覽器到終端機顯示的網址（通常 http://localhost:5173）
```

此模式不需後端，所有資料自動存在瀏覽器 `localStorage`。

### Docker Compose 一鍵起整套（DB + API + 前端）

```bash
docker compose up -d --build   # 首次或改動後加 --build
docker compose ps              # 查看服務狀態
docker compose logs -f api     # 看後端日誌
docker compose down            # 停止（加 -v 連資料庫卷一起清）
```

- 前端：http://localhost:8088（已內建指向後端 API）
- API：http://localhost:3001/api/health
- PostgreSQL：localhost:55432（對外埠，避免與本機 5432 衝突）

只起 DB + API（前端仍用 `npm run dev`）：

```bash
docker compose up -d --build db api
VITE_API_URL=http://localhost:3001 npm run dev
```

---

## 專案結構

```
src/                      # 前端（React / Vite）
├─ pages/                 # 路由頁面（與 Layout 導覽對應）：
│  ├─ OverviewPage        #   /            總覽（首頁入口）
│  ├─ WorkbenchPage       #   /workbench   組織圖中心（工作台，三視角：匯報／組別組織圖可編輯、組別歸屬圖唯讀）
│  ├─ PeoplePage          #   /people      人員與歸屬
│  ├─ GroupsPage          #   /groups      組別管理
│  ├─ OrgChartPage        #   /org-chart → 重導向 /workbench（@deprecated 備援，不再被路由引用）
│  ├─ OrgHealthPage       #   /health      規劃健檢
│  ├─ ScenarioComparePage #   /compare     情境比較 what-if
│  ├─ BpmnImpactPage      #   /bpmn/impact 變更影響（HR 視角主入口）
│  ├─ ChangeLogPage       #   /changelog   調整紀錄
│  ├─ CsvImportPage       #   /csv-import  CSV 匯入
│  └─ Bpmn{List,Designer,Simulate}Page # /bpmn* BPMN 次層入口
├─ components/
│  ├─ ui/                 # shadcn/ui 基礎元件
│  ├─ orgFlow/            # 匯報組織圖畫布、工具列、控制列、觀景窗、人員詳情
│  ├─ groupMembership/    # 組別歸屬圖節點與畫布
│  └─ bpmn/               # BPMN 流程設計畫布與屬性面板
├─ context/               # OrgProvider / BpmnProvider（全域狀態）
├─ services/              # 純函式：overviewStatus、orgHealth、scenarioCompare、
│                         #          functionCoverage、buildOrgFlowGraph、CSV/xlsx、
│                         #          publishedVersions、effectiveDate、apiClient…
│  └─ migrations/         # schemaVersion migration 框架（org / bpmn 共用）
├─ lib/、types/、data/    # 工具、型別、初始資料 + CSV 範本

server/                   # 後端（opt-in，Fastify + Prisma）
├─ src/routes/            # REST：/api/versions、/api/draft、/api/health
├─ src/repositories/      # 持久層抽象 + 記憶體／Prisma 實作
└─ prisma/schema.prisma   # OrgVersion / OrgDraft（JSONB 文件持久化）

docker-compose.yml        # 一鍵起 DB + API + 前端 web
Dockerfile                # 前端多階段建置 → nginx
```

### 狀態與持久化

`OrgProvider` 持有全域組織資料。每次儲存（員工／組別／歸屬）都會：

1. 更新 React state
2. 寫入瀏覽器 `localStorage`（key：`hr-org-draft`）

重新整理會優先載入 `localStorage` 草稿；**匯出**才會下載 JSON 檔。啟用後端時，發布／刪除版本另會 best-effort 寫穿到雲端（失敗只 `console.warn`，不阻斷本機操作）。

---

## 資料與匯入

### 資料檔案

| 路徑 | 是否進版控 | 用途 |
|------|------------|------|
| `src/data/org-data.json` | 是 | 各環境共用的**初始**組織資料（無草稿時預設載入） |
| `src/data/mock/*.json` | 否（`.gitignore`） | 本機產生的其他版本，供開發時在「資料版本」選單切換 |

初始 `org-data.json` 內含 12 名員工、6 個組別，以及矩陣組織範例（例如黃建國同時屬於前端組與產品部）。

### 更新共用初始資料

1. 在應用程式中調整後按**儲存**（會自動存入 `localStorage`）。
2. 點工具列「**匯出目前資料**」下載 `org-data-*.json`。
3. 將下載檔案內容**覆蓋** `src/data/org-data.json` 並 commit。
4. 重新整理或用「從檔案載入」驗證。

### 版本生效日徽章

發布版本可指定**生效日**（`effectiveDate`），版本下拉與資訊區會顯示：

- **「排程」徽章**：生效日 > 目前時間（尚未生效，可用於預告）
- **「已生效」徽章**：生效日 ≤ 目前時間

`pickEffectiveVersionId(versions, at)` 服務可推導「某時點目前生效版本」，供未來排程或審計使用。

### CSV 匯入（成員歸屬 → JSON）

一張 CSV 彙整「員工 × 組別」歸屬，可轉成 `src/data/mock/*.json`（本機、不進版控）並在版本選單切換。

欄名以**中文為主**（13 欄，順序如下）；**舊版英文欄名仍向後相容**，既有英文 CSV 可直接匯入，匯出 header 則一律輸出中文。

| 中文欄名（主） | 英文欄名（相容） | 說明 |
|------|------|------|
| `員工工號` / `員工姓名` / `在職狀態` | `employeeNo` / `employeeName` / `employeeStatus` | 員工工號、姓名、在職狀態（active / inactive，亦接受 在職／停用） |
| `組別代碼` / `組別名稱` / `上層組別代碼` / `組別狀態` | `groupCode` / `groupName` / `parentGroupCode` / `groupStatus` | 組別代碼、名稱、上層組別代碼（根節點留空）、狀態 |
| `職級代碼` / `職級名稱` / `職級層級` | `jobLevelCode` / `jobLevelName` / `jobLevelRank` | 職級代碼、名稱、層級（數字，越大越高） |
| `主管工號` | `supervisorEmployeeNos` | 主管工號，多筆以 `\|` 分隔 |
| `直屬主管工號` | `primarySupervisorEmployeeNo` | 主主管工號 |
| `是否主要組別` | `isPrimaryGroup` | 是否主組別（1 / 0，亦接受 是） |

> header 解析中英相容：每欄依「中文主名 → 英文欄名 → 別名」順序比對命中（英文比對不分大小寫）。缺少必要欄位時，錯誤訊息以中文欄名提示。

範本：`src/data/templates/org-members.template.csv`
完整範例：`npm run generate:csv-sample` 產生 `org-members.sample.csv`

CLI：

```bash
npm run import:csv -- -i ./src/data/templates/org-members.sample.csv -o org-data-imported -v 3
```

成功後**重新啟動** `npm run dev`，在頂部「資料版本」選單選擇新檔案。應用內也可開啟 **CSV 匯入** 頁面上傳預覽。

### 資料格式（單一 JSON）

| 欄位 | 說明 |
|------|------|
| `schemaVersion` | 結構版本（migration 用） |
| `version` | 內容版本（發布遞增） |
| `employees` | 員工（id、工號、姓名、在職狀態） |
| `groups` | 組別（代碼、名稱、上層 parentId、狀態、`kind`＝department/function） |
| `jobLevels` | 職級表（code、name、rank） |
| `assignments` | 歸屬：員工 + 組別 + 職級 + 主管清單 + 主主管 + 是否主組別 |
| `changeLog` | 調整紀錄 |

---

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

### 測試

以 [Vitest](https://vitest.dev/)（jsdom 環境）撰寫，測試檔與來源並列（`*.test.ts`）。

- 前端**數百個測試**：schema migration、核心 services（org 操作、圖形建構、orgHealth、scenarioCompare、functionCoverage、BPMN 模擬與影響分析、CSV/xlsx、生效日、API client、overviewStatus）、Context Provider，以及 UI 元件／互動／無障礙（vitest-axe）與 DOM 快照。
- 後端（`server/`）有自己的 Vitest 設定，含路由與 Prisma 整合測試（CI 起真實 Postgres）。
- CI（`.github/workflows/test.yml`）於 push / PR 跑前端 lint + 型別檢查 + 覆蓋率門檻，以及後端測試。

---

## 開發協作流程

本專案任何開發都走「**10 角色協同、互相把關、禁止單一角色包辦**」的完整管線——架構師（協調者）拆解需求並產出介面契約後，平行分派給後端、前端、資料層、測試、審查、資安、DevOps、文件等角色；實作與驗證必須由**不同角色**。git 流程採常綠 `integration` 分支 + pre-push 驗證，PR 維持單一 `integration → main`。

- 規則（每 session 自動載入）：[CLAUDE.md](CLAUDE.md)
- 詳細設計：[開發協作流程-多角色分工](docs/開發協作流程-多角色分工.md)
- git 流程：[工作流程-integration分支](docs/工作流程-integration分支.md)

---

## 進度與路線圖

定位校準後，Roadmap 以 **HR 規劃／試算**為主線。

### 已完成

**HR 規劃主線**

| 里程碑 | 內容 | 狀態 |
|---|---|---|
| — | 雙維度建模（`Group.kind`、職能視角、組別歸屬圖過濾） | ✅ |
| — | 規劃健檢 `orgHealth.ts` + `/health` 頁 | ✅ |
| **M1** | 規劃情境比較 what-if（`scenarioCompare.ts` + `/compare`） | ✅ |
| **M2** | 變更影響重定位（主導覽改「變更影響」直連 `/bpmn/impact`，BPMN 子頁降次層） | ✅ |
| **M3** | 整合 UX 收尾（新增 `OverviewPage` + 智慧 CTA + 規劃旅程地圖） | ✅ |
| **M4** | README + 使用者導引（本文件） | ✅ |
| — | 組織圖工作台 `/workbench`（reporting/組別組織圖編輯 + 右側即時整合面板 + drag-to-reassign） | ✅ |
| — | 旅程優先 IA 整併（工作台 3 視角合併、側欄三層分區、`/org-chart` 重導向、總覽旅程文案軟化） | ✅ |

**基礎能力**

- opt-in 後端 API + 持久層 P1–P3（JSONB 版本持久化、前端寫穿、docker compose 一鍵起整套）
- Excel 匯入（`xlsxToOrgData`，懶載入）
- 版本生效日（`effectiveDate`，排程／已生效徽章）
- 自動化測試與覆蓋率門檻（前端數百個測試、後端路由 + Prisma 整合測試）
- 組織圖中心三視角（工作台：匯報／組別組織圖可編輯、組別歸屬圖唯讀）、變更歷程、CSV 匯入、版本管理、localStorage 草稿

### 已降級（非定位核心）

> 以下偏**全公司營運系統**能力，與本工具「HR 規劃／試算」定位不符，已**主動降為非主線**，僅在使用者明確要求時才排。

| 項目 | 降級理由 |
|---|---|
| 後端實體表正規化 P4 | JSONB 文件夠用，正規化是低使用者價值的內部優化 |
| BPMN 持久化 P5 | BPMN 為輔助透鏡，目前 localStorage 已足夠規劃情境使用 |
| 認證接點 P6 → Azure AD / SSO → 多租戶 | 偏全公司營運系統能力，非規劃工具定位核心 |
| 正式送簽流程（接 BPMN 簽核） | 同上；本工具發布的是「組織版本」，不是簽核件 |

詳細理由見 [系統設計文件 §10 Roadmap](docs/系統設計文件.md#10-開發方向與-roadmap) 與 [待辦清單「已降級」](docs/待辦清單.md)。

### 部署

GitHub Pages 多分支自動部署（`.github/workflows/deploy-pages.yml`），各分支輸出至 `/hr-organization/{分支名}/` 子目錄。Pages 為純前端靜態部署，不含後端。

---

## 文件導覽

### 活的文件（持續更新）

- [系統設計文件](docs/系統設計文件.md)：整體架構、資料模型、核心服務、Roadmap（以**現況程式碼**為準）
- [待辦清單](docs/待辦清單.md)：定位、已完成項目、已降級項目
- [CLAUDE.md](CLAUDE.md)：開發協作政策（每 session 載入）
- [開發協作流程：多角色分工](docs/開發協作流程-多角色分工.md)：10 角色協同細節
- [工作流程：integration 分支](docs/工作流程-integration分支.md)：常綠整合分支 + pre-push 驗證
- [設計：介面規劃 Penpot](docs/設計-介面規劃-penpot.md)：Penpot MCP 介面規劃 spec（目前暫緩）

### 介面契約（M1–M4 開發依據）

- [契約：規劃健檢](docs/契約-規劃健檢.md)
- [契約：專案職能雙維度](docs/契約-專案職能雙維度.md)
- [契約：情境比較 what-if](docs/契約-情境比較whatif.md)
- [契約：變更影響重定位](docs/契約-變更影響重定位.md)
- [契約：整合 UX 收尾](docs/契約-整合UX收尾.md)
- [契約：README 重寫](docs/契約-README重寫.md)（本文件依據）

### 歷史報告（落地當下的快照，後續以系統設計文件為準）

- [規劃：後端與持久層](docs/reports/規劃-後端與持久層.md)
- [規劃：自動化測試與 schema 版控](docs/reports/規劃-自動化測試與schema版控.md)
- [無障礙稽核報告](docs/reports/無障礙稽核報告.md)
- [UI 測試驗收報告](docs/reports/UI測試驗收報告.md)
- [參考：軟體開發 10 角色藍本](docs/reports/參考-軟體開發10角色藍本.md)
