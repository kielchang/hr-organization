# 介面規劃（Penpot 畫板計畫）— HR 組織規劃工具

> 目的：在 Penpot 上呈現整體系統的介面規劃，讓使用者一眼看懂方向，並能**直接在 Penpot 上修改**來回饋他想要的設計。
> 本檔是渲染到 Penpot 的 **spec**；以**現行程式碼行為**＋[[product-vision-hr-planning]] 校準後定位為準。
> 狀態：草案（待重啟後 Penpot 連線渲染）。最後更新：2026-06-06。

## 0. 前置與未決

- Penpot MCP 以 `local` scope 設定（token 不入 repo）；工具須**新 session 才載入**。
- **能力待確認**：重啟後第一步先探明此 Penpot MCP 能否「建立/修改」畫板與圖元，或僅「讀取」。據此決定：
  - 可建立 → 依本計畫直接產生畫板。
  - 僅讀取 → 改由我在 repo 內產出 HTML/低保真原型或在 Penpot 既有檔上標註，使用者再於 Penpot 自建並回饋。
- 渲染時依多角色政策可引入 `UI Designer`／`UX Architect` 角色協作。

## 1. 設計系統基礎（先建一塊「Design System」畫板）

對齊現行技術棧，避免設計與實作脫節：
- **字型**：Geist（sans）；標題/內文/數字三級。
- **元件庫**：shadcn/ui（base-nova 風格，Base UI + Radix Slot）。
- **樣式**：Tailwind v4 設計變數；色彩用語意 token（primary/muted/info/warning/destructive）。
- **圖示**：lucide-react。
- **要件**：按鈕、輸入、Select、Tabs、Badge（含部門/職能徽章：職能=info、部門=muted）、Table、Card、Dialog、橫幅警示（localStorage 失敗）。
- 標註：徽章與狀態色直接對映現有 `src/lib/uiSemantics.ts` 與 `selectOptions.ts`。

## 2. 畫板清單（每個畫面一塊 board）

> 標註慣例：`〔現有〕`＝已實作頁面；`〔本輪新增〕`＝專案職能雙維度；`〔提案〕`＝校準後 HR 規劃主線的下一候選（尚未實作，供討論）。

### A. App Shell / 導覽 〔現有〕
- 頂部導覽（`Layout`）＋ `Outlet`；版本選擇器（`VersionSelector`：含生效日「排程/已生效」標示）；資料工具列（`DataToolbar`：匯出/匯入/發布）。

### B. 人員與歸屬 `PeoplePage` 〔現有〕
- 員工清單 + 表單（`EmployeeForm`）；歸屬編輯（`AssignmentEditor`：組別、職級、主管、主歸屬）。
- 矩陣重點：主管/職級掛在「歸屬」上（一人多組可不同主管）。

### C. 組別 `GroupsPage` 〔現有＋本輪新增〕
- 組別階層維護；**新增「種類」欄與徽章（部門/職能）**；建立/編輯可選種類；職能列上層顯示「—」。

### D. 組織圖 `OrgChartPage` ★核心★
- **D1 匯報組織圖** 〔現有〕：節點=人員，實線=主匯報、虛線=其他主管；層級線；編輯模式快照/diff 著色。
- **D2 組別歸屬圖** 〔現有＋本輪新增〕：**「全部/部門/職能」過濾切換**；職能視角面板 `FunctionCoveragePanel`（無成員職能、無 lead 職能、跨職能負載前幾名）；過濾與選定組別不符時自動切回全部視角。
- 這是「**匯報線 × 專案職能**雙維度規劃」的視覺重心，設計重點放這裡。

### E. 變更歷程 `ChangeLogPage` 〔現有〕
- 時間軸列出操作；前後 JSON diff 檢視。

### F. 匯入 `CsvImportPage` 〔現有〕
- CSV/Excel(.xlsx) 上傳 → 預覽 → 產生/下載 JSON（匯入組別預設種類=部門）。

### G. 版本與生效日 〔現有〕
- 版本清單（草稿/種子/發布）；發布可指定**生效日**；下拉顯示排程/已生效。

### H. BPMN 影響分析 `BpmnImpactPage` 〔現有，重定位〕
- **定位為 HR 決策輔助透鏡**（非營運系統）：以基準快照比對「這次組織調整，動到哪些作業/決策流程的簽核路徑」；健檢斷鏈/SPOF。
- BPMN 清單/設計/模擬頁仍在，但設計上**收斂為輔助**，不放主視覺。

### I. 規劃指標 / 健檢 Dashboard 〔提案〕
- 給規劃者的量化訊號卡片：管理幅度（span of control）、層級深度、主管負載、空缺/超載、**職能覆蓋缺口**、單點風險（SPOF）。
- 編輯/比較時即時更新，回答「這個結構好不好」。

### J. 規劃情境比較（what-if） 〔提案〕
- 並排多個組織方案；比 diff 與 §I 指標；支援「試算多案再選」。重用既有 snapshot/diff/版本。

## 3. 重啟後執行步驟

1. 確認 Penpot 工具已載入（`claude mcp list` / 工具清單出現 penpot）。
2. **探明能力**（建立 vs 唯讀），回報使用者並據此選渲染策略。
3. 先建「Design System」畫板（§1），再依 §2 順序建畫板；★核心★ D 區優先。
4. 完成一批就請使用者在 Penpot 上**直接改**，把回饋當作設計方向契約，下一輪據以調整實作。
