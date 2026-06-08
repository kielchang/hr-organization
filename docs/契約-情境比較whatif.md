# 介面契約 — 規劃情境比較（what-if）

> 協調者（Software Architect）產出的開發契約。各角色照本契約開發，**不得自改契約**（要改回報協調者）。
> 對應方向：HR 規劃決策旅程的關鍵環節——「擬 A/B/C 案討論再選」。
> 狀態：草案 → 開工。最後更新：2026-06-06。

## 0. 目標與非目標

**目標**：HR 同時選 2~3 個方案（發布版本或內建種子）並排比較——既看**結構差異**（diff：誰新增/離開/移組/換主管），也看**規劃指標差異**（健檢分數對照），協助試算多案後選擇。

**v1 非目標（明確排除）**：
- 即時「新建虛擬草案」做比較（v1 只比現有發布版本/內建種子；要比草案先發布為版本）
- 三維以上指標雷達圖（v1 用表格對照夠用）
- 推薦／自動排名（v1 只呈現差異，由 HR 自己判斷）
- 合併方案（merge）
- 比較結果匯出（v1 在頁面看就好）

## 1. 架構決策（ADR 摘要）

與雙維度／健檢同模式：**前端純函式 + 新頁面，後端零改動**。
- 重用 `computeOrgDiff`（結構差異）、`buildOrgHealth`（指標）、`loadPublishedVersions`／`dataVersions`（版本來源）
- 不新增資料模型、不改 schema、不動 server
- 新增**一個薄聚合服務**把多版本對齊到同一份輸出格式，UI 只負責呈現

## 2. 服務契約（純函式）— 新增 `src/services/scenarioCompare.ts`

```ts
import type { OrgData } from '../types/org';
import type { OrgDiffResult } from '../types/editSession';
import type { OrgHealth } from './orgHealth';

/** 一個情境（要比較的方案）：含取得來源的 versionId + 顯示用 label + 攤平的 OrgData */
export interface ScenarioInput {
  versionId: string;      // 版本識別（與既有版本下拉同源）
  label: string;          // 顯示名稱
  data: OrgData;          // 已 migrate 完的整包資料
}

/** 一個情境的計算結果：對「基準情境」的 diff + 自己的健檢 */
export interface ScenarioResult {
  input: ScenarioInput;
  health: OrgHealth;
  /** 與「基準情境」（陣列第一個）的 diff；基準自己 diff 為空 */
  diffVsBaseline: OrgDiffResult;
  /** diff 摘要計數（供卡片顯示，不必算重） */
  diffSummary: {
    addedEmployees: number;
    removedEmployees: number;
    modifiedEmployees: number;
    addedAssignments: number;
    removedAssignments: number;
    modifiedAssignments: number;
    addedEdges: number;
    removedEdges: number;
  };
}

export interface ScenarioComparison {
  scenarios: ScenarioResult[];   // 順序＝輸入順序，第一個為基準
  /** 指標對照矩陣：每行一個指標、每欄一個情境，便於 UI 渲染 */
  metricMatrix: {
    label: string;               // 指標名稱（繁中）
    key: MetricKey;              // 程式用 id
    values: (number | string)[]; // 與 scenarios 同序
    /** 對於該指標，數字越大越好(↑)、越小越好(↓)、或中性(=) */
    direction: 'up' | 'down' | 'neutral';
  }[];
}

export type MetricKey =
  | 'activeEmployees' | 'departments' | 'functions' | 'supervisors'
  | 'avgSpan' | 'maxDepth' | 'warningCount'
  | 'functionsWithoutMembers' | 'functionsWithoutLead' | 'spofCount';

export function buildScenarioComparison(inputs: ScenarioInput[]): ScenarioComparison;
```

### 語意定義
- **基準（baseline）**：傳入陣列第一個。其他情境的 diff 都是「以基準為 base、自己為 current」算出來的（重用 `computeOrgDiff(baseline.data, this.data)`）。
- **`metricMatrix` 指標選定**：來自 `OrgHealth.summary` + 從 `functionCoverage.functionsWithoutMembers.length`、`functionsWithoutLead.length`、`findings.filter(f => f.category === 'spof').length` 推導。
- **`direction`**：
  - `up`：activeEmployees、departments、functions、supervisors（中性偏好越多越「組織量體足」）→ 標 `neutral` 避免暗示判斷
  - `down`：warningCount、functionsWithoutMembers、functionsWithoutLead、spofCount（缺口/風險，越少越好）
  - `down`：avgSpan、maxDepth（合理範圍內小較好，過小過大都不好——v1 標 `neutral` 不誤導）
  - 實作：除 `warningCount` / `functionsWithoutMembers` / `functionsWithoutLead` / `spofCount` 為 `down`，其餘皆 `neutral`。

### 邊界
- 0 個情境：回傳 `{ scenarios: [], metricMatrix: [] }`。
- 1 個情境：基準自己（不報錯，metricMatrix 仍可呈現單欄）。
- 上限：服務不設硬上限，UI 建議 ≤4。

## 3. UI 契約 — 新增頁面 `src/pages/ScenarioComparePage.tsx`，路由 `/compare`

- **導覽**：`Layout` 加入口「情境比較」。
- **資料來源**：
  - 版本下拉內容＝既有 `useOrg().dataVersions`（含內建種子、mock、發布版本、雲端版本）
  - 載入指定版本的 OrgData：發布版本／雲端版本看 `publishedVersionToInfo` 或 `loadVersionById` 等既有工具；內建種子直接讀 `data-version` JSON。
  - 取得後一律先 `migrateOrgData` 再 `backfillAssignmentLevels`，與其他頁面一致。
- **互動**：
  - 上方一排「情境槽」（slot），最多 4 個。每個槽是 Select 選版本（含空狀態「+ 加入情境」）。
  - 第一個槽預設選當前 active 版本，標明「基準」。
  - 至少選 2 個情境才開始計算與呈現。
- **呈現**（區塊由上而下）：
  1. **情境槽列**：每個槽顯示版本名 + 健檢摘要小卡（人數/部門/警示數）+ 刪除按鈕。
  2. **指標對照表**：`metricMatrix` 渲染——指標名 × 各情境值；對 `direction='down'` 的指標，最大值用 warning 色標、最小值用 success 色標，協助一眼判斷。
  3. **結構差異摘要**（每個非基準情境）：用 `diffSummary` 顯示「新增 X 人、移除 Y 人、調動 Z 筆歸屬…」+ 可展開細項（員工列表）。
  4. **連結到細節**：每個情境提供「在組織圖檢視此版本」連結（傳 versionId 到 OrgChartPage）——若實作成本高可 v2，**v1 跳過**。
- 沿用既有 shadcn 元件（Card/Badge/Table/Select），語意色用 `uiSemantics`。

## 4. 後端：不涉及

純前端推導，無需改 `server/`。後端角色本輪空跑「確認 round-trip 不受影響」。

## 5. 角色分派與邊界

| 角色 | 範圍 | 邊界 |
|---|---|---|
| 協調者（主執行緒） | 本契約、整合驗收 | 僅契約／文件 |
| 前端（Frontend Developer） | §2 服務 + §3 頁面/導覽（`src/`），**不寫測試** | 不碰 `server/`、不改契約 |
| 後端（Backend Architect） | 空跑：確認 OrgData 含 `kind` 等欄位 round-trip 仍正常 | 僅 `server/` |
| 測試/QA（Test Results Analyzer） | `scenarioCompare.test.ts` 單元測試 + 頁面 render smoke；跑完整 `verify` | 僅測試碼，不改實作 |
| 程式碼審查（Code Reviewer，含資安視角） | 唯讀審查 §2–§3 | 只回報不改 |
| 文件（Technical Writer） | 系統設計文件 §4/§6、待辦清單 | 僅文件 |

**驗收門檻**：`npm run verify` 綠 + `verify:server` 綠 + 各角色把關通過 → 協調者於 `integration` 提交。
