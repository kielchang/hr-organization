# 介面契約 — Phase 0：vibe 校準（R0.1–R0.5）

> 協調者產出的契約。對應 [規劃-改善Roadmap](規劃-改善Roadmap.md) Phase 0。
> 核心精神（CM 顧問）：**「HR 在 30% 完成度時以為自己在 90%」**——把變革管理思維注入工具核心流程，讓 HR 一進來不會走錯方向。
> 狀態：草案 → 開工。最後更新：2026-06-06。

## 0. 範圍

一次完成 5 項（彼此檔案交織，由單一前端角色連貫實作，不平行）：
R0.1 發布摩擦、R0.2 詞彙稽核、R0.3 健檢分群、R0.4 保留事項、R0.5 規劃就緒度。
後端不涉及。

---

## R0.1 — 發布按鈕加摩擦（CM vibe 校準核心）

**檔案**：`src/components/orgFlow/EditModeToolbar.tsx`（發布對話框，現有「發布異動？」+ 生效日欄位）

- 在發布確認對話框內、生效日欄位附近，新增**三個選填問題**（純前端 state，不持久化、不送後端）：
  1. 「**這次調整的 sponsor（高層支持者）是誰？**」（單行輸入）
  2. 「**主要受影響的關鍵人員／單位有哪些？**」（單行或多行輸入）
  3. 「**落地後的追蹤負責人（sustainment owner）是誰？**」（單行輸入）
- **任一題空白**：對話框顯示一段**柔性提醒**（warning callout，不是錯誤）：「組織調整的成敗多半取決於『人的一面』。建議先想清楚 sponsor、受影響者、追蹤人——但你仍可直接發布。」
- **不阻擋發布**：三題全空也能按「確定發布」。提醒只是 nudge。
- 這三題的值**不需要存進 OrgData／版本**（v1 純 nudge）；發布行為與既有完全相同（`publishVersion(draft, effectiveDate)`）。
- 對話框關閉後三題 state 重置。

> 設計意圖：用最低成本（不改資料模型）把「發布不等於完成、要想人的一面」這個 CM 思維插進核心流程。

---

## R0.2 — 詞彙去工程化

聚焦 **HR 主動線**頁面（不動 BPMN 設計／模擬子頁的「節點」等流程設計語境詞）。

### `src/pages/OrgHealthPage.tsx`
- category 標籤 map（約 L49-51）：
  - `chain: '斷鏈'` → `chain: '懸空匯報'`
  - `spof: '單點風險'` → `spof: '無備援主管'`
  - `depth`（若為「層級深度」）→ 維持「層級深度」但確認副標已有「組內匯報層級」說明（M3 已加）；本輪不需再改
- 副標（約 L134）「…斷鏈／循環／單點等結構風險…」→「…**懸空匯報／循環指派／無備援主管**等結構風險…」

### `src/services/orgHealth.ts`（finding message 殘留工程詞）
- chain-orphan message「（孤兒節點）」→「（**無任何歸屬**）」（拿掉「節點」）
- 其餘 message 已口語（「管理幅度過寬」「無備援」「唯一主管」），維持

### `src/components/bpmn/impact/BaselineSelector.tsx`
- 「捕捉快照」（L52）→「**設定比較基準**」
- 「建立基準快照」（L89）→「**記下目前狀態為基準**」
- 「尚未建立快照——點擊按鈕擷取目前組織狀態」→「尚未設定基準——點擊按鈕記下目前組織狀態作為比較對照」

### `src/pages/BpmnImpactPage.tsx`
- 流程健檢 tab 內說明（約 L174）「…『找不到核准人』及『單點風險』情況」→「…『找不到核准人』及『**僅一位核准人（無備援）**』情況」

> 不改：BPMN 設計/模擬子頁的「節點」「連線」（流程圖語境合理、且為次層進階功能）。

---

## R0.3 — 健檢結果分群摺疊

**檔案**：`src/pages/OrgHealthPage.tsx`（findings 呈現區）

- 目前 findings 為單一平鋪清單。改為**依 category 分群**（span / depth / function / chain / cycle / spof），每群一個可摺疊區塊（預設展開）。
- 每群標題顯示：群名（用 R0.2 後的中文標籤）+ 該群 finding 數 + 嚴重度指示（有 warning 時紅點）。
- 群內維持既有 finding 呈現（severity badge + message）。
- 群的順序：warning 為主的群優先（span/chain/cycle/spof/function 的 warning），再 info。簡化做法：固定順序 `['chain','cycle','spof','span','function','depth']`，群內 warning 在前。
- 沿用既有摺疊元件（若無則用原生 `<details>` 或 shadcn Collapsible；挑專案已有的；無則最小自製，鍵盤可及）。
- 空群不顯示。

---

## R0.4 — 「保留事項」摘要（CM 獨家）

**服務** `src/services/scenarioCompare.ts`：在 `ScenarioResult.diffSummary` 同層或新增欄位，提供「**未變動摘要**」。

```ts
export interface ScenarioRetained {
  unchangedEmployees: number;   // 兩版都存在且內容相同的員工 record 數
  unchangedAssignments: number; // 兩版都存在且內容相同的歸屬數
  unchangedRatio: number;       // 未變動歸屬 / 基準歸屬總數（0–1，基準為 0 時回 0）
}
```
- 加進 `ScenarioResult`（每個非基準情境一份；基準自己的 retained 全等於總數、ratio=1）。
- 計算：重用 `computeOrgDiff` 已算出的 added/removed/modified——未變動員工 = 基準員工數 − (removed + modified)；未變動歸屬 = 基準歸屬數 − (removed + modified assignments)。
- **`unchangedRatio` 以基準（base）的「歸屬（assignment）總數」為分母**（修訂：原定義用員工分母，但「安定感」訊號的本質是「**歸屬**（部門/主管/職級）有沒有變」，而非「員工 record 是否改名/離職」——`Employee` record 不含歸屬資訊，用員工分母會把「歸屬大改、人沒改名」誤算成不變，在組織重組情境嚴重高估安定感、給假安心，與 CM 降低焦慮意圖相反）。
- 型別 export，供 UI 取用。

**UI** `src/pages/ScenarioComparePage.tsx`：每個非基準情境的結構差異摘要卡，**加一行「保留事項」**：
- 文案對齊計算（以歸屬為準）：「**{X}% 的人員配置維持不變**（{基準歸屬總數} 筆歸屬中 {unchangedAssignments} 筆不受影響）」
- 用 success 色調呈現（這是「安定感」訊號，降低焦慮）。

> 設計意圖（CM）：員工最焦慮的是「我會變什麼」。先講「大部分不變」是 reduce-anxiety-by-anchoring。

---

## R0.5 — 規劃就緒度（Structural Readiness）

**服務** `src/services/orgHealth.ts`：新增純函式 `buildReadiness(health)` 與型別。

```ts
export interface ReadinessDimension {
  key: 'span' | 'structure' | 'function' | 'keyPerson';
  label: string;        // 繁中：管理幅度健康／結構完整性／職能覆蓋／關鍵人風險
  score: number;        // 0–100
  findingCount: number; // 該維度相關 finding 數
}
export interface ReadinessResult {
  total: number;        // 0–100 加權總分
  level: 'high' | 'medium' | 'low';  // ≥80 high、60–79 medium、<60 low
  dimensions: ReadinessDimension[];
}
export function buildReadiness(health: OrgHealth): ReadinessResult;
```

- **誠實命名**：這是「**結構面**就緒度」，**不冒充完整變革就緒度**（缺 leadership/comms/sponsor 資料）。
- 維度與 finding 對應：
  - `span`：span category findings（wide=重、narrow=輕）
  - `structure`：chain + cycle category findings（都重）
  - `function`：function category findings
  - `keyPerson`：spof category findings（重）
- 計分：每維度從 100 起扣——warning 每筆扣較多（如 15）、info 每筆扣較少（如 5），最低 0。total = 四維度平均（可等權）。
- level 門檻：≥80 high、60–79 medium、<60 low。

**UI** `src/pages/OrgHealthPage.tsx`：在摘要卡片列下方、findings 上方，新增「**規劃就緒度**」區塊：
- 大數字 total（0–100）+ level 徽章（high=success／medium=warning／low=destructive）
- 四維度各一條（label + score 條或數字）
- **一句 CM 註記**：「此為**結構面**就緒度；完整的變革就緒（sponsor、溝通、抗拒管理）需搭配 stakeholder 評估——見[改善 Roadmap](/roadmap) Phase 1。」

> 設計意圖（CM）：給規劃者一個「這個結構準備好了沒」的快速訊號，同時用註記防止 HR 把「結構 OK」誤當成「變革就緒」。

---

## 角色分派與邊界

| 角色 | 範圍 | 邊界 |
|---|---|---|
| 協調者 | 本契約 + 整合（含更新 roadmap.ts 把 R0.1–R0.5 標 done） | 僅契約／文件／roadmap 資料同步 |
| 前端（Frontend Developer） | R0.1–R0.5 全部（`src/`），**不寫測試**、**不動 roadmap.ts** | 不碰 server／不改契約 |
| 測試/QA（Test Results Analyzer） | `buildReadiness` 與 scenarioCompare 未變動摘要的單元測試；受影響頁面 render smoke 更新；跑完整 verify | 僅測試碼 |
| 程式碼審查（Code Reviewer，含資安） | 唯讀審查 | 只回報 |
| 文件（Technical Writer） | 系統設計文件 §2/§4/§6、待辦清單、規劃-改善Roadmap.md 勾選 R0.* | 僅文件 |

**驗收門檻**：`npm run verify` 綠 + `verify:server` 綠 + 各角色把關 → 協調者提交 `integration`，並更新 `/roadmap` 進度（R0.* → done）。
