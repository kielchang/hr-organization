# 介面契約 — M3 整合 UX 收尾

> 協調者（Software Architect）產出的開發契約。各角色照本契約開發，**不得自改契約**。
> 對應方向：把零散的功能串成一條 HR 規劃工作流，讓首次使用者「一進來就知道接下來該做什麼」。
> 狀態：草案 → 開工。最後更新：2026-06-06。

## 0. 目標與非目標

**目標**：
1. 首次進入工具的 HR 能看到「**這是什麼工具 / 規劃旅程是什麼 / 我下一步該做什麼**」的引導。
2. 串連 6 個關鍵環節成可點擊的旅程地圖：**載入 → 編輯 → 健檢 → 比較 → 影響 → 發布**。
3. 順便收掉 M2 留下兩個 nit。

**v1 非目標**：
- 完整 onboarding 教學流程（v1 是「靜態旅程地圖 + 智慧 CTA」，不做多步引導 modal）
- 每個既有頁面的空狀態大改（v1 只動 `BpmnImpactPage` 的 M2 nit#2）
- 帳號設定 / 偏好設定頁
- 使用者自訂的「首頁顯示哪些卡片」

## 1. 架構決策（ADR）

**新增 `OverviewPage` 為首頁（`/`）**，原 PeoplePage 移到 `/people`。理由：
- `/` 留給總覽是最符合直覺的入口
- 既有 PeoplePage 是純編輯介面，當「首頁」對新使用者不友善
- 路由變動極小：1 個新路由、1 個路徑搬家、Layout 導覽加 1 項
- 既有書籤 `/` 仍可用（顯示總覽）；既有 PeoplePage 連結要從 `/` 改 `/people`——只有少數內部連結需確認

**狀態推薦改用純函式**：新增 `src/services/overviewStatus.ts`，回傳當前資料狀態與建議的「下一步」。這樣 UI 純呈現、可單元測試。

## 2. 路由與導覽

### `src/App.tsx`
- 新增 `OverviewPage` lazy import。
- 將 `<Route index element={<PeoplePage />} />` 改為 `<Route index element={<OverviewPage />} />`。
- 新增 `<Route path="people" element={<PeoplePage />} />`（保持邏輯不動，僅換路徑）。
- 其他路由不變。

### `src/components/Layout.tsx`
- `navItems` 開頭加 `{ to: '/', label: '總覽', icon: LayoutDashboard }`（或 `Home`、`Compass`，挑語意最近的 lucide-react 圖示）。
- 第二項從 `{ to: '/', ..., '人員與歸屬', icon: Users }` 改 `{ to: '/people', ... }`。
- 順序：總覽 → 人員與歸屬 → 組別管理 → 組織圖 → 規劃健檢 → 情境比較 → 變更影響 → 調整紀錄 → CSV 匯入。

## 3. 服務契約（純函式）— 新增 `src/services/overviewStatus.ts`

```ts
export type OverviewStepKey =
  | 'load'      // 載入現況
  | 'edit'      // 編輯人員/組別
  | 'health'    // 規劃健檢
  | 'compare'   // 情境比較
  | 'impact'    // 變更影響
  | 'publish';  // 發布

export interface OverviewStep {
  key: OverviewStepKey;
  label: string;        // 繁中
  description: string;  // 一句話說明
  to: string;           // 對應路由
  /** 狀態：done=已完成、ready=可開始、blocked=需先完成前置（v1 簡化為 ready/done） */
  status: 'done' | 'ready';
}

export interface OverviewRecommendation {
  /** 推薦的下一步（旅程中某一步），若無資料推薦從 load 開始 */
  nextStep: OverviewStepKey;
  /** 給使用者看的繁中說明 */
  message: string;
  /** 點擊後跳到的路由 */
  to: string;
}

export interface OverviewStatus {
  steps: OverviewStep[];           // 固定 6 步順序
  recommendation: OverviewRecommendation;
  /** 統計：當前活躍員工 / 部門 / 職能 / 發布版本數 / 流程數 */
  stats: {
    activeEmployees: number;
    departments: number;
    functions: number;
    publishedVersions: number;
    processes: number;
  };
}

export function buildOverviewStatus(args: {
  data: OrgData;
  publishedVersionsCount: number;
  processesCount: number;
  impactBaselineSet: boolean;
}): OverviewStatus;
```

### 推薦邏輯（v1 簡單規則，由上往下第一個命中）
1. `activeEmployees === 0` → 推薦 `load`，「先匯入 CSV/Excel 或載入內建範本」→ `/csv-import`
2. `publishedVersionsCount === 0` → 推薦 `publish` 之前的某一步，先看健檢：「資料已就緒，建議先看『規劃健檢』確認結構」→ `/health`
3. `publishedVersionsCount === 1` → 推薦 `compare`：「想試另一個方案？先建第二個版本再用『情境比較』比 diff 與指標」→ `/compare`
4. `publishedVersionsCount >= 2 && processesCount > 0 && !impactBaselineSet` → 推薦 `impact`：「設定基準快照，看組織調整動到哪些流程」→ `/bpmn/impact`
5. else → 推薦 `health`：「繼續優化結構或開新方案」→ `/health`

### steps 的 done 判定
- `load`: `activeEmployees > 0` ⇒ done
- `edit`: 同 load（有資料就視為已進入編輯狀態）
- `health`: 永遠 ready（純檢視，無「完成」概念，但若無資料則 N/A——v1 用 status：當 load done 後標 ready，否則仍 ready 但旅程地圖顯示淡化）
  - **簡化**：v1 只回 `done | ready`，UI 在「沒資料」時把後續步驟視覺淡化（CSS class）。
- `compare`: `publishedVersionsCount >= 2` ⇒ done
- `impact`: `impactBaselineSet === true` ⇒ done
- `publish`: `publishedVersionsCount > 0` ⇒ done

## 4. UI 契約 — `OverviewPage`

### 4.1 版面（由上而下）
1. **歡迎標題**：「HR 組織規劃」+ 一句話定位「以匯報線 × 專案職能雙維度規劃組織，量化評估、比較方案、看變更影響」。
2. **智慧 CTA 卡片**（顯眼）：呈現 `recommendation`——大字推薦訊息 + 行動按鈕（連到 `to`）。
3. **規劃旅程地圖**：6 個步驟橫排（手機自動換行），每步：
   - 圖示 + 名稱 + 一句話描述
   - `done` 顯示勾號（success 色）；`ready` 顯示空圈
   - 點擊跳到 `to`
4. **目前狀態小卡**（次要）：人員/部門/職能/已發布版本/已定義流程 5 個數字。

### 4.2 樣式
- 沿用既有 shadcn Card / Badge / Button；色彩用 `uiSemantics`。
- 旅程地圖用一條視覺線（border 或 dotted line）連起 6 步，每步一個圓點圖示。
- 無新元件庫、無新依賴。

## 5. M2 收尾 nits（一併處理）

### 5.1 `src/pages/BpmnImpactPage.tsx` callout 文案
- 「匯報線斷鏈」改為「**找不到核准人**」（更口語、貼 HR 視角）。
- 完整新文案：
  > 完成組織調整後，這裡會告訴你：哪些作業／決策流程的**核准人**因人事變動而改變、哪些流程因主管異動**找不到核准人**。沒有流程資料時，可至下方「進階：管理流程定義」設定。

### 5.2 `BpmnImpactPage` 空流程主要 CTA
- 當 `store.processes.length === 0` 時：
  - **隱藏**現有 Tabs（沒流程談不上影響比對與健檢）
  - **顯示主要 CTA 卡片**：「**還沒有任何流程定義**——影響分析需要先有 BPMN 流程才能比對。建立第一個流程後再回到這頁。」+ 主要按鈕「**前往管理流程定義**」連 `/bpmn`。
  - callout 與頁尾的「進階：管理流程定義」可保留也可在此狀態下隱藏（避免重複）；UI 自決。
- 當 `store.processes.length > 0` 時：行為與 M2 完全相同（不變）。

## 6. 角色分派

| 角色 | 範圍 |
|---|---|
| 協調者 | 本契約、整合驗收 |
| 前端（Frontend Developer） | §2 路由 + §3 服務 + §4 OverviewPage + §5.1/§5.2 BpmnImpactPage 修改（`src/`），**不寫測試** |
| 後端 | 空跑（無變動） |
| 測試/QA | `overviewStatus.test.ts` 單元 + `OverviewPage.test.tsx` render smoke + `BpmnImpactPage.test.tsx` 更新；跑完整 verify | 
| 程式碼審查 | 唯讀審查；含資安視角 |
| 文件 | 系統設計文件 §2/§4/§6、待辦清單 |

**驗收門檻**：`npm run verify` 綠 + `verify:server` 綠 → 提交 `integration`。
