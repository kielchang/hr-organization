# 介面契約 — Roadmap 頁面（M5）

> 協調者產出的契約。各角色照本契約開發、不得自改契約。
> 對應 [規劃-改善Roadmap](規劃-改善Roadmap.md)：把改善方向公開到系統內、追蹤進度。
> 狀態：草案 → 開工。最後更新：2026-06-06。

## 0. 目標與非目標

**目標**：在工具內呈現「**改善方向地圖 + 完成進度**」，讓使用者：
- 知道未來要改什麼
- 看到每次更新落地了什麼
- 看到目前的優先順序與來源（PM/UXR/CM/共識）

**v1 非目標**：
- Roadmap 編輯介面（資料源是 hard-coded 在 service 層，隨 commit 進化）
- 投票／回饋介面（v1 純展示，使用者意見走外部管道）
- 與 git tag / GitHub release 整合（v1 commit hash 字串即可）
- i18n（中文先）

## 1. 架構決策（ADR）

**純前端 + hard-coded 資料源**：與 `data/org-data.json` 同模式——`src/services/roadmap.ts` export 純資料 + 純函式統計工具。

理由：
- Roadmap 是「工具與專案維護者公佈的事實」，不該被使用者編輯
- 改一行資料 = 一個 commit，commit 就是最自然的更新追蹤
- 不需新 schema、不動 OrgProvider、不需後端
- 與規劃文件 [規劃-改善Roadmap.md] 內容對齊（兩者隨 commit 同步更新）

## 2. 服務契約 — 新增 `src/services/roadmap.ts`

```ts
export type RoadmapItemStatus =
  | 'done'         // 已完成
  | 'in-progress'  // 進行中
  | 'planned'      // 已排程、待開工
  | 'researching'  // 需訪談／驗證後才決定
  | 'observing';   // 觀察中、等訊號

export type RoadmapItemSource = 'pm' | 'uxr' | 'cm' | 'consensus';

export type RoadmapItemSize = 'small' | 'medium' | 'large';

export interface RoadmapItem {
  /** 對應規劃文件的 id（如 R0.1、R1.2）；用於穩定排序與引用 */
  id: string;
  title: string;
  description: string;
  status: RoadmapItemStatus;
  sources: RoadmapItemSource[];   // 一項可能來自多視角（共識項目）
  size: RoadmapItemSize;
  phaseId: string;                 // 對應 RoadmapPhase.id
  /** done 項目：完成時的 commit hash（短版 7 位即可） */
  commitHash?: string;
  /** done 項目：完成日期（ISO YYYY-MM-DD） */
  completedAt?: string;
  /** 依賴的其他 item id（顯示依賴箭頭用） */
  dependencies?: string[];
  /** 可選註腳，例如「需先訪談問題 #N」 */
  notes?: string;
}

export interface RoadmapPhase {
  id: string;
  title: string;
  description: string;
  order: number;
  status: RoadmapItemStatus;
}

export interface RoadmapData {
  phases: RoadmapPhase[];
  items: RoadmapItem[];
  /** 紅線（不該做的事，三方共識），純字串展示用 */
  redLines: string[];
  /** 需要訪談驗證的問題清單 */
  validationQuestions: string[];
  /** 資料最後更新日期（ISO YYYY-MM-DD） */
  lastUpdated: string;
}

/** 取得完整 roadmap 資料（純函式，回傳 frozen 物件，避免被誤改） */
export function getRoadmapData(): RoadmapData;

/** 統計每個狀態下的項目數 */
export interface RoadmapStatusCounts {
  done: number;
  inProgress: number;
  planned: number;
  researching: number;
  observing: number;
  total: number;
}
export function countByStatus(data: RoadmapData): RoadmapStatusCounts;

/** 依 phase 分組 items，phases 按 order 升冪、items 按 id 字串升冪 */
export function groupItemsByPhase(data: RoadmapData): Array<{
  phase: RoadmapPhase;
  items: RoadmapItem[];
}>;
```

### 初始資料內容（來源：規劃-改善Roadmap.md）

**已完成項目（status: 'done'）**：需從現有 git log 取出 commit hash 對應。協調者已提供以下完成項目供前端帶入：
- `done-雙維度`：commit `13f5d4a`，2026-06-06，size large
- `done-健檢`：commit `e9da58d`，2026-06-06，size large
- `done-flaky`：commit `d09c289`，2026-06-06，size small
- `done-m1`：commit `01c29d0`，2026-06-06，size large（情境比較 what-if）
- `done-m2`：commit `7b81a2a`，2026-06-06，size medium（變更影響重定位）
- `done-m3`：commit `a37e4b2`，2026-06-06，size medium（整合 UX 收尾）
- `done-m4`：commit `2368961`，2026-06-06，size small（README）

放在一個固定的 `phase-completed` phase 內。

**未來項目（status: 'planned' / 'researching' / 'observing'）**：照 [規劃-改善Roadmap.md] §1–§7 全部列入：
- R0.1–R0.5 → phase-0、status: planned
- R1.1–R1.3 → phase-1、status: 'researching'（其中 R1.1/R1.2 需訪談 Q1/Q2/Q6 後決定）
- R2.1–R2.3 → phase-2、status: 'researching'（依問題 #8）
- R3.1–R3.3 → phase-3、status: 'researching'（依問題 #3）
- R4.1–R4.3 → phase-4、status: 'planned'
- R5.1–R5.5 → phase-5、status: 'planned'
- §7 觀察項 → phase-observing、status: 'observing'

`redLines`：[規劃-改善Roadmap.md] §8 內容。
`validationQuestions`：§9 內容（8 個問題）。
`lastUpdated`：'2026-06-06'。

每個 item 的 `sources` 來自規劃文件中的標記（CM 獨家、PM 視角、UXR 視角、三方共識）。

## 3. UI 契約 — 新增頁面 `src/pages/RoadmapPage.tsx`，路由 `/roadmap`

### 3.1 導覽
- `Layout.tsx` 加入口「**改善 Roadmap**」（icon `Map` 或 `Milestone`、放在「CSV 匯入」之後最末項——這是 meta 資訊，非規劃功能）

### 3.2 版面（由上至下）
1. **頁首**：標題「改善 Roadmap」+ 一句副標「綜合 PM、UXR、變革管理顧問三方評審後的改善方向，與每次更新的進度」
2. **狀態總覽橫條**：5 個小卡顯示 done / in-progress / planned / researching / observing 各幾項，附 total
3. **vibe 警告 callout**（重要：CM 顧問核心警告）：
   - 引言：「工具讓 HR 變強，但讓 HR 高估自己」
   - 一段話說明：本 roadmap 第 0 階段優先校準 vibe，把 CM 思維注入工具核心流程
4. **依 phase 分組**：每個 phase 用 Card，內列出 items
   - Phase 卡片頭：標題、描述、phase 狀態徽章
   - 每個 item：標題 + 狀態徽章 + size 徽章 + 來源徽章群（PM/UXR/CM/共識）+ 描述。已完成項目額外顯示 commit hash + 完成日期
   - 有依賴的 item：在 description 下面以「→ 依賴：Rx.y」表示
5. **紅線清單**：以 destructive 變體 callout 列出「不該做」
6. **訪談驗證問題**：以 info 變體 callout 列出 8 個問題，邀請使用者去訪談真實 HR

### 3.3 樣式
- 沿用 shadcn Card / Badge / Callout（若無 Callout 元件用 `rounded-lg border bg-X/30` 樣式仿造，與 BpmnImpactPage 引導 callout 一致）
- 來源徽章顏色：PM=info、UXR=success（變數名）、CM=warning（標示這是「變革管理」視角，較重）、共識=primary
- 狀態徽章顏色：done=success、in-progress=primary、planned=muted、researching=warning、observing=info

### 3.4 互動
- v1 純展示，不需 expand/collapse；items 全部展開列出
- 點 commit hash 可選——v1 只顯示字串，不做連結（將來可指 GitHub）

## 4. 後端：不涉及

純前端 hard-coded 資料 + 純函式統計，無需改 `server/`。

## 5. 角色分派與邊界

| 角色 | 範圍 | 邊界 |
|---|---|---|
| 協調者（主執行緒） | 本契約 + 規劃-改善Roadmap.md + 整合驗收 | 僅契約／文件 |
| 前端（Frontend Developer） | §2 服務 + §3 頁面/路由/導覽（`src/`），**不寫測試** | 不碰 `server/`、不改契約 |
| 測試/QA（Test Results Analyzer） | `roadmap.test.ts` 單元（getRoadmapData/countByStatus/groupItemsByPhase）+ `RoadmapPage.test.tsx` render smoke + 跑完整 verify | 僅測試碼 |
| 程式碼審查（Code Reviewer，含資安視角） | 唯讀審查 | 只回報不改 |
| 文件（Technical Writer） | 系統設計文件 §4、待辦清單、README | 僅文件 |

**驗收門檻**：`npm run verify` 綠 + `verify:server` 綠 → 提交 `integration`。

## 6. 後續維護規則（給協調者參考）

每次有改善項目落地時：
1. 更新 `src/services/roadmap.ts`：對應 item 的 status 改 `done`、補 commitHash 與 completedAt
2. 更新 [規劃-改善Roadmap.md] 對應勾選框
3. 一起 commit，確保系統內 `/roadmap` 與 docs 同步

若有**新發現的改善方向**（例如訪談後浮出的新需求）：
1. 在規劃文件加新項目（指定 id 如 R6.1）
2. 同步加到 `roadmap.ts`
3. 一起 commit
