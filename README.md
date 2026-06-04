# HR 組織架構調整工具

人事用來管理公司人員的**組別歸屬**、**直屬／虛線主管**與**職級**的前端原型。支援矩陣組織（一人可多組、每組可有不同主管），並以 [React Flow](https://reactflow.dev/) 顯示組織匯報關係。

## 功能

- **人員與歸屬**：維護員工在各組別的職級與主管（含主主管、主組別）
- **組別管理**：組織單位階層與啟用狀態
- **組織圖**：依組別切換，React Flow 顯示主匯報（實線）與其他主管（虛線）
- **調整紀錄**：變更歷程與 diff 檢視
- **匯出／匯入**：儲存變更時自動下載 JSON；可手動匯出或從檔案載入

## 技術棧

- React 19 + Vite + TypeScript
- [Fluent UI React v9](https://react.fluentui.dev/)
- [@xyflow/react](https://reactflow.dev/)（React Flow v12）
- @dagrejs/dagre（組織圖自動排版）

## 開始使用

```bash
npm install
npm run dev
```

瀏覽器開啟終端機顯示的網址（通常為 http://localhost:5173）。

## 資料檔案說明

| 路徑 | 是否進版控 | 用途 |
|------|------------|------|
| `src/data/org-data.json` | 是 | 各環境共用的**初始**組織資料（clone 後預設載入） |
| `src/data/mock/*.json` | 否（`.gitignore`） | 本機產生的其他版本，供開發時在「資料版本」選單切換 |

初始 `org-data.json` 內含 12 名員工、6 個組別，以及矩陣組織範例（例如黃建國同時屬於前端組與產品部）。

## 更新共用初始資料

1. 在應用程式中調整組別、主管或職級後按**儲存**。
2. 瀏覽器會**自動下載** `org-data-*.json`（完整組織資料）。
3. 將下載的檔案內容**覆蓋** `src/data/org-data.json` 並 commit。
4. 重新整理頁面，或點工具列「從檔案載入」驗證。

> **注意**：目前僅前端記憶體狀態，若未匯出就重新整理，變更會消失。

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

成功後**重新啟動** `npm run dev`，在頂部「資料版本」選單選擇新檔案。

應用內也可開啟 **CSV 匯入** 頁面：上傳預覽、下載 JSON，或複製上述指令寫入專案。

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
| `npm run build` | 建置正式版 |
| `npm run preview` | 預覽建置結果 |

## 後續擴充（未實作）

- 後端 API、生效日排程、送審流程
- Excel 匯入、Azure AD 登入
