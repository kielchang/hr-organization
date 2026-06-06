# HR 組織架構調整工具

人事用來管理公司人員的**組別歸屬**、**直屬／虛線主管**與**職級**的前端原型。支援矩陣組織（一人可多組、每組可有不同主管），並以 [React Flow](https://reactflow.dev/) 視覺化組織匯報關係與組別歸屬。

> 純前端應用，無後端。工作中的資料自動保存在瀏覽器 `localStorage`，並可匯出／匯入 JSON 做版本保存與共享。

## 功能

- **人員與歸屬**：維護員工在各組別的職級與主管（含主主管、主組別）
- **組別管理**：組織單位階層與啟用狀態
- **組織圖**（兩種視角）
  - **匯報組織圖**：以人員為節點，依匯報關係連線（實線＝主匯報、虛線＝其他主管）
  - **組別歸屬圖**：以每筆「組別歸屬」為節點，同一人跨組會出現多個節點
- **直接從圖上編輯**：點節點開「人員詳情」浮動卡片，可改個人資料與各筆組別歸屬
- **調整紀錄**：變更歷程與 diff 檢視
- **匯出／匯入**：自動存 `localStorage`；可手動匯出 JSON 或從檔案載入
- **CSV 匯入**：以一張「員工 × 組別」CSV 產生組織 JSON

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

> 已自 Fluent UI v9 全面遷移至 shadcn/ui + Tailwind。

## 開始使用

需求：**Node 20.19+ 或 22.12+**（Vite 8 要求）。

```bash
npm install
npm run dev
```

瀏覽器開啟終端機顯示的網址（通常為 http://localhost:5173）。

## 專案結構

```
src/
├─ pages/                 # 路由頁面：人員、組別、組織圖、調整紀錄、CSV 匯入
├─ components/
│  ├─ ui/                 # shadcn/ui 基礎元件（button、select、card、dialog…）
│  ├─ orgFlow/            # 匯報組織圖：畫布、左上工具列、控制列、觀景窗、人員詳情
│  ├─ groupMembership/    # 組別歸屬圖的節點與畫布
│  └─ *.tsx               # 各種表單（員工、組別、歸屬）與清單
├─ context/               # OrgProvider / useOrg / orgContextState（全域資料狀態）
├─ services/              # 純邏輯：建圖、CSV、匯出入、資料版本、驗證、操作
├─ lib/                   # cn() 與下拉選項、語意色等小工具
├─ types/                 # 型別定義
└─ data/                  # 初始資料、CSV 範本、本機 mock
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
| `npm run import:csv` | CSV → 本機 mock JSON |
| `npm run generate:csv-sample` | 產生 CSV 範例檔 |

## 後續擴充（未實作）

- 後端 API、生效日排程、送審流程
- Excel 匯入、Azure AD 登入

## 文件

- [系統設計文件](docs/系統設計文件.md)：整體架構、資料模型、核心服務、開發方向與 Roadmap
- [規劃：自動化測試與 schema 版控](docs/規劃-自動化測試與schema版控.md)：測試導入與 schema 版本管理的實作規劃
</content>
