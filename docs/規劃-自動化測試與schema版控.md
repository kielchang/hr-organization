# 規劃：自動化測試導入 ＋ Schema 版本管理

> 對應 [系統設計文件](系統設計文件.md) 第 10 章短期目標與第 11 章風險。
> 本文件為**規劃**；提供選型、架構、檔案落點、實作順序與驗收標準。
> 建立日期：2026-06-06。
>
> **實作進度（2026-06-06）**：核心已完成 ✅
> - Vitest 設定、`src/test/setup.ts`、`test`/`test:watch`/`test:cov` scripts
> - 通用 migration 框架 `src/services/migrations/`（`runMigrations` + `orgMigrations` + `bpmnMigrations`）
> - OrgData 導入 `schemaVersion`；BPMN 統一 key `bpmn-store` 並集中 migration
> - Phase A 核心 services 與 migration 測試（共 43 個測試）、CI `test.yml`
>
> **未完成（後續）**：Phase C 圖形建構測試、Phase D 元件/Provider 測試、覆蓋率門檻、`version`→`contentVersion` 更名、清理既有 lint 債。

---

# Part 1：自動化測試導入

## 1.1 現況與問題
- 專案**目前沒有任何測試**（無 `*.test.*`、無 vitest/jest 設定）。
- 商業邏輯集中在 `src/services/`，多為**純函式**，本應是最容易也最值得測試的部分。
- CI（`.github/workflows/deploy-pages.yml`）為求速度**跳過型別檢查**（僅 `vite build`），型別錯誤可能漏網。
- 重構（如 schema 調整、組織圖演算法）缺乏回歸保護，風險高。

## 1.2 選型
| 項目 | 採用 | 理由 |
|------|------|------|
| 測試框架 | **Vitest** | 與 Vite 8 共用設定與轉譯，零額外打包設定；API 近 Jest |
| 元件測試 | **@testing-library/react** + **jsdom** | 與 React 19 相容，聚焦行為而非實作 |
| 覆蓋率 | **@vitest/coverage-v8** | 內建、快速 |
| E2E〔後期〕 | Playwright（暫不導入） | 待核心單元測試穩定後再評估 |

新增 devDependencies：`vitest`、`@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/user-event`、`jsdom`、`@vitest/coverage-v8`。

## 1.3 設定
- 於 `vite.config.ts` 併入 `test` 區塊（或新增 `vitest.config.ts`）：
  - `environment: 'jsdom'`、`globals: true`、`setupFiles: ['./src/test/setup.ts']`
  - `setup.ts` 載入 `@testing-library/jest-dom`，並在每測試後 `localStorage.clear()`（避免 Provider 狀態互染）
- `package.json` scripts：
  ```jsonc
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage"
  ```
- 測試檔放置：與來源並列 `src/services/foo.test.ts`，元件測試 `src/components/.../Foo.test.tsx`。

## 1.4 測試優先順序（由純函式往外）

**Phase A — services 純函式（最高 CP 值，先做）**
| 目標 | 重點測項 |
|------|----------|
| `validators.ts` | OrgData 驗證、**匯報循環偵測**（正例／反例） |
| `computeOrgDiff.ts` | 新增／移除／修改的員工、歸屬、邊集合正確 |
| `assignmentLevels.ts` | 缺 `level` 的回填、組織深度計算 |
| `csvToOrgData.ts` / `csvParse.ts` | 正常解析、缺欄位／重複／BOM、錯誤訊息 |
| `bpmnSimulator.ts` | 四種 `ApproverResolutionMode` 解析、gateway 條件評估、`orgContext` 擷取 |
| `processImpact.ts` | 探測情境產生、健檢（斷鏈／SPOF）、基準 vs 現況路徑差異 |
| `exportImport.ts` | `parseOrgDataRaw` 容錯與錯誤拋出 |
| `dataVersions.ts` / `publishedVersions.ts` | 版本掃描、預設版本挑選、bundle 打包／還原 |

**Phase B — migration（與 Part 2 綁定）**
- BPMN `migrateV1` / `migrateV2`、以及新建的 OrgData migration pipeline（見 Part 2）。

**Phase C — 圖形建構（資料正確性，非視覺）**
- `buildOrgFlowGraph.ts` / `buildGroupMembershipGraph.ts`：節點／邊數量、層級線、邊界計算（Dagre 排版座標可不精確比對）。

**Phase D〔後期〕— 元件 / 互動**
- Provider（`OrgProvider`、`BpmnProvider`）reducer 與 localStorage 持久化、關鍵頁面表單流程。

## 1.5 CI 整合
- 新增 `.github/workflows/test.yml`（push / PR 觸發）：`npm ci` → `npm run lint` → `npm run test` →（可選）`tsc -b --noEmit`。
- 部署 workflow 維持快速建置；**型別檢查移到 test workflow**，補回現況漏網的型別保護。

## 1.6 里程碑與驗收
1. 設定就緒：`npm run test` 可跑、CI 綠燈。
2. Phase A 完成：services 核心純函式覆蓋率 ≥ 70%。
3. Phase B 完成：所有 migration 路徑皆有測試（含損壞輸入）。
4. Phase C 完成後整體 `src/services` 覆蓋率 ≥ 80%。

---

# Part 2：Schema 版本管理

## 2.1 現況與問題
1. **兩種「version」語意混淆**：
   - `OrgData.version`（`src/types/org.ts`）：使用者面的**資料內容版本**，發布時遞增，`parseOrgDataRaw` 預設 1 —— 並非 schema 版本。
   - `BpmnStore.schemaVersion`（`src/context/BpmnProvider.tsx`）：真正的**結構 schema 版本**（目前 3），有 migration。
2. **BPMN key 與版本不一致**：storage key 為 `bpmn-store-v2`，但資料 `schemaVersion` 已是 3，名稱誤導。
3. **OrgData 沒有 schemaVersion**：org 資料結構若改變（如新增 `Assignment.level`），舊匯出 JSON 只能靠 `parseOrgDataRaw` 的寬鬆預設值容錯，**沒有正式的版本化 migration 路徑**，難以追蹤與測試。
4. **migration 分散且無測試**：`migrateV1/V2` 內嵌在 Provider，無集中註冊、無回歸測試。

## 2.2 設計原則
- **明確區分兩個概念並重新命名**：
  - `contentVersion`（原 `OrgData.version`）：使用者面內容版本（發布遞增）。
  - `schemaVersion`：資料結構版本，僅供 migration 使用。
- **storage key 與 schemaVersion 脫鉤**：key 用穩定名稱（如 `bpmn-store`、`hr-org-draft`），版本一律放資料內的 `schemaVersion` 欄位。
- **集中、可測試、線性遞增**的 migration 框架，org 與 bpmn 共用同一套機制。

## 2.3 目標架構：通用 migration 框架
新增 `src/services/migrations/`：

```
src/services/migrations/
  runMigrations.ts     // 通用執行器
  orgMigrations.ts     // OrgData 各版 migration 註冊表
  bpmnMigrations.ts    // 由 BpmnProvider 移出、集中於此
```

`runMigrations.ts`（概念）：
```ts
export interface Migration<T> {
  to: number;                          // 升級到的目標 schemaVersion
  migrate: (raw: any) => T;            // 從 to-1 → to
}

export function runMigrations<T extends { schemaVersion: number }>(
  raw: any,
  current: number,                     // 程式碼當前支援的最新版
  migrations: Migration<T>[],
): T {
  let data = raw;
  let v = typeof raw?.schemaVersion === 'number' ? raw.schemaVersion : 0;
  for (const m of migrations.sort((a, b) => a.to - b.to)) {
    if (m.to > v) { data = m.migrate(data); v = m.to; }
  }
  if (v !== current) throw new Error(`未知的 schemaVersion: ${v}`);
  return data;
}
```

## 2.4 OrgData 導入 schemaVersion
- `src/types/org.ts`：`OrgData` 新增 `schemaVersion: number`；將既有 `version` 更名為 `contentVersion`（或保留 `version` 但文件註明其為內容版本，更名為佳但需全域改動，列為一次性遷移）。
- 定義 `ORG_SCHEMA_VERSION`（如初始 = 1，對應目前結構：assignment 含 `level`、jobLevel 含 `rank` 等）。
- `orgMigrations.ts`：登記從「無 schemaVersion 的舊資料（v0）」→ v1 的 migration——把現有 `parseOrgDataRaw` 的容錯預設（補 `jobLevels`、`changeLog`、回填 `assignment.level` 經 `assignmentLevels.ts`）正式化為 v0→v1 步驟。
- `exportImport.ts`：`parseOrgDataRaw` 改為「先驗證最小結構 → 跑 `runMigrations`」；匯出時寫入當前 `schemaVersion`。
- `OrgProvider` 載入草稿（`hr-org-draft`）與發布版本時同樣套用 migration。

## 2.5 BPMN 對齊
- 將 `migrateV1` / `migrateV2`（及未來版本）移到 `bpmnMigrations.ts`，改用 `runMigrations`。
- 把 storage key 由 `bpmn-store-v2` 改為穩定的 `bpmn-store`；保留讀取舊 key（`bpmn-store-v1`、`bpmn-store-v2`）的 fallback 一段時間以平滑遷移。
- `BpmnStore.schemaVersion` 維持為唯一真實版本來源。

## 2.6 匯出／匯入相容性
- 所有匯出檔（org JSON、bundle、bpmn）皆內含 `schemaVersion`。
- 匯入時：缺 `schemaVersion` 視為 v0 → 跑完整 migration 鏈；高於程式支援版本則明確報錯（提示升級 app），避免靜默資料損壞。

## 2.7 測試（與 Part 1 Phase B 對應）
- `runMigrations`：跳版、缺版、未知版本報錯、冪等性。
- `orgMigrations`：v0（舊匯出檔樣本）→ 最新版的結果正確。
- `bpmnMigrations`：v1→3、v2→3、損壞輸入回退預設。
- 於 `src/test/fixtures/` 放各版樣本資料供回歸測試。

## 2.8 里程碑與順序
1. 先做 Part 1 測試設定（讓 migration 有測試保護網）。
2. 建 `runMigrations` 通用框架 + 測試。
3. BPMN 遷移到新框架、統一 key（風險低，已有 v1/v2 邏輯可移植）。
4. OrgData 導入 `schemaVersion` 與 v0→v1 migration、更新匯出入。
5. 補齊 migration 回歸測試與 fixtures。
6. 更新 [系統設計文件](系統設計文件.md) 第 7、11 章，移除「版本不一致」風險項。

---

## 協作角色建議
- 框架與型別設計：`engineering-software-architect`、`engineering-senior-developer`
- 測試導入與覆蓋率：`testing-test-results-analyzer`、`engineering-code-reviewer`
- CI 設定：`engineering-devops-automator`
- 最小變動遷移（schema 改名等一次性大改）：`engineering-minimal-change-engineer`
