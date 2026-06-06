# UI 測試驗收報告（UI Testing Acceptance Report）

- **產品／範圍**：HR 組織調整工具（React + TypeScript + Vite），本次驗收聚焦前端 UI 層（`src/components`、`src/pages`）的元件／互動測試、DOM 結構快照與無障礙（a11y）測試。
- **分支**：`integration`
- **驗收角色**：Acceptance / QA Lead（獨立驗證，不採信、逐項實測）
- **驗收日期**：2026-06-06
- **驗收原則**：所有結論皆以「實際執行的指令輸出」為依據；本次驗收**未修改**任何 production 程式碼、設定或既有測試，僅新增本報告。

---

## 一、本次新增內容摘要（驗證後確認）

兩位專責 agent 新增的測試與共用工具，經檢視後確認到位：

- **元件／互動測試**（Testing Library + user-event）：
  - 表單／編輯器：`EmployeeForm`、`GroupForm`、`AssignmentEditor`
  - 頁面：`PeoplePage`、`GroupsPage`、`ChangeLogPage`、`CsvImportPage`
  - 元件：`EmployeeList`、`DataToolbar`、`ConfirmDialog`
- **DOM 結構快照測試**（`*.snapshot.test.tsx`，結構性快照，**非**像素截圖）：
  - `ui/badge`、`orgFlow/EmployeeNode`、`orgFlow/DiffLegend`、`bpmn/nodes/BpmnNodes`
- **無障礙測試**（`*.a11y.test.tsx`，使用 `src/test/axe.ts` 的 `assertNoA11yViolations`，jsdom 下停用 color-contrast）：
  - `Layout`、`pages`（People/Groups/ChangeLog/Csv/BpmnList）、`forms`（Employee/Group/Confirm/AssignmentEditor）、`EmployeeList`、`ui`
  - 真實違規以 `it.skip` + `docs/無障礙稽核報告.md` 追蹤。
- **共用測試工具**：`src/test/renderWithProviders.tsx`（OrgProvider + BpmnProvider + MemoryRouter）、`src/test/fixtures.ts`（OrgData/員工/組別/職級/歸屬建構子）、`src/test/axe.ts`，並各附 smoke test。

---

## 二、測量數據（指令實測）

### 2.1 測試數量與穩定度

執行 `npx vitest run` **連續三次**，結果完全一致：

| 執行 | Test Files | Tests | Duration |
|------|-----------|-------|----------|
| 第 1 次 | 39 passed \| 1 skipped (40) | **238 passed \| 5 skipped (243)** | 8.73s |
| 第 2 次 | 39 passed \| 1 skipped (40) | **238 passed \| 5 skipped (243)** | 8.15s |
| 第 3 次 | 39 passed \| 1 skipped (40) | **238 passed \| 5 skipped (243)** | 8.08s |

- **0 失敗、0 flakiness**（三次數字逐項相同）。
- 1 個 skipped test file 與 5 個 skipped tests，皆為 a11y 已知問題（見 §3.3）。

### 2.2 型別與 Lint

| 指令 | 結果 |
|------|------|
| `npx tsc -b` | **乾淨**（exit code 0，無輸出） |
| `npx eslint .` | **乾淨**（exit code 0，無輸出） |

### 2.3 覆蓋率

> ⚠️ **重要校正**：`vite.config.ts` 的 `coverage.include` 僅設定為 `['src/services/**', 'src/context/**']`。
> 因此 `npx vitest run --coverage` 報出的「**86.88%**」整體數字**完全不含本次主打的 UI 層**（`src/components`、`src/pages`）。
> 該門檻（stmts 83 / branch 68 / func 86 / lines 84）係針對 services/context 的回歸防護，本次有通過，但**不能代表 UI 測試的覆蓋成效**。

**(A) 設定預設範圍（services + context）— `npx vitest run --coverage`：**

| 範圍 | % Stmts | % Branch | % Funcs | % Lines |
|------|--------:|--------:|--------:|--------:|
| **All files（設定範圍）** | **86.88** (1139/1311) | **73.2** (519/709) | **89.74** (280/312) | **88.34** (993/1124) |
| context | 74.3 | 63.46 | 78.84 | 74.52 |
| services | 88.47 | 72.85 | 91.53 | 90.21 |
| services/migrations | 100 | 92.1 | 100 | 100 |

**(B) 本次主打的 UI 層（components + pages）— 以 CLI 旗標一次性量測，未改設定：**

`npx vitest run --coverage --coverage.include='src/components/**' --coverage.include='src/pages/**'`（門檻暫設 0 以利量測）

| 範圍 | % Stmts | % Branch | % Funcs | % Lines |
|------|--------:|--------:|--------:|--------:|
| **All files（components + pages）** | **22.16** (311/1403) | **16.15** (163/1009) | **25.5** (163/639) | **23.5** (284/1208) |
| components（直屬） | 76.0 | 61.98 | 75.0 | 77.84 |
| components/ui | 82.81 | 92.59 | 79.62 | 82.81 |
| components/bpmn/nodes | 95.23 | 77.77 | 100 | 95.23 |
| components/bpmn（編輯器） | **0** | 0 | 0 | 0 |
| components/bpmn/impact | **0** | 0 | 0 | 0 |
| components/bpmn/simulation | **0** | 0 | 0 | 0 |
| components/groupMembership | **0** | 0 | 0 | 0 |
| components/orgFlow | **1.75** | 3.12 | 2.22 | 2.13 |
| pages | 23.63 | 18.18 | 22.6 | 25.25 |

**逐檔重點（components/pages）：**

- 已測良好：`AssignmentEditor` 93.18% 行、`EmployeeList` 94.44%、`EmployeeForm` 86.95%、`GroupForm` 83.87%、`BpmnNodes` 100%、`GroupsPage` 100% 行、`ChangeLogPage` 81.81%、`PeoplePage` 75%。
- 偏低／未測：`DataToolbar` 28%（僅渲染面，互動分支多未覆蓋）、`VersionSelector` 64%、`CsvImportPage` 57.57%、`DeployInfo` 80%。
- **完全未測（0%）**：`BpmnCanvas`、`BpmnPropertiesPanel`、`BpmnScaffoldEditor`、`Bpmn*Page`（Designer/Impact/List/Simulate）、`OrgChartPage`、`OrgFlowChart` 與整個 `orgFlow/*`（NodeDetailPanel 552 行、ChartChrome、ControlBar…）、`groupMembership/*`、`bpmn/impact|simulation` 全部子元件。

> 解讀：本次 UI 測試**有效但範圍偏窄**——集中在「人員／組別 CRUD 與歸屬」這條核心表單流程及 UI primitives；視覺化重區塊（React Flow 組織圖、BPMN 設計器／模擬器／影響分析）幾乎是測試空白。

---

## 三、品質評估（不只看數字）

### 3.1 互動測試是否有意義？（抽查多檔）

抽查 `EmployeeForm`、`GroupForm`、`PeoplePage`、`GroupsPage`、`AssignmentEditor`、`DataToolbar`、`ConfirmDialog` 七個檔，結論：**品質高、非套套邏輯**。斷言的是真實使用者可見結果與領域驗證，例如：

- **驗證訊息**：留空→「請填寫工號與姓名」、重複工號→「工號已存在」、重複組別代碼→「組別代碼已存在」、重複歸屬→「同一員工在此組別已有歸屬紀錄」、缺組別→「找不到組別」。
- **領域規則**：`AssignmentEditor` 主管清單**排除員工本人**、勾選主管後才出現「主主管」下拉、缺組別/職級時多條錯誤合併呈現。
- **回呼語意**：`ConfirmDialog` 確認呼叫 `onConfirm` 且 `onOpenChange(false)`；取消只關閉不呼叫 `onConfirm`；`open=false` 不渲染 dialog。
- **流程往返**：`PeoplePage` 新增歸屬選組別＋職級→儲存→列表出現新卡片；`GroupsPage` 新增組別→表格出現新列。
- **刪除安全**：`PeoplePage` 以 `vi.spyOn(window, 'confirm')` 驗證取消不刪、確認才刪並切換選取。

查詢策略**以可及角色為主**（getByRole/getByLabelText/getByText），符合 Testing Library 最佳實務。

**小瑕疵（非阻擋）：**

- 少數測試以 DOM 結構導航定位元素，如 `heading.parentElement!`、`.closest('button')!`、`.closest('[data-slot="card"]')`（`PeoplePage.test.tsx:12,19,58`、`PeoplePage.test.tsx:83-85`）。功能正確，但對版面重構較脆弱；後續可改用更穩定的 query（如 `aria-label`、`within(region)`）。
- 部分以 `getAllByRole('combobox')` 的索引順序定位組別/職級下拉（`AssignmentEditor.test.tsx:43`、`PeoplePage.test.tsx:86`），順序一旦調整即失準——這也正是 a11y 問題 1（Select 無可及名稱）連帶造成測試只能靠順序定位，修好 a11y 後可改用名稱定位，一石二鳥。

### 3.2 DOM 快照是否穩定合理？

- 共 4 個快照檔，行數 73 / 111 / 215 / 252（合計 651 行），**規模適中**，非巨型脆弱 blob。
- 每個 `it` 只快照**單一元件**的 `container.firstChild`（單一節點），並以 `it.each` 對 variant／狀態（如 Badge 11 種 variant、EmployeeNode 的主/非主組別/選取/diff added·removed·modified）參數化，**意圖清楚、可讀**。
- **唯一脆弱點**：快照內嵌完整 Tailwind utility class 字串（例：EmployeeNode 一行 30+ 個 class）。任何樣式微調都會迫使快照重產生。對「結構性回歸防護」而言可接受，但屬偏脆弱，需團隊知道「改樣式＝必更新快照」。

### 3.3 a11y 的 `it.skip` 是否為正當已知問題、報告是否準確？

5 個 skip **全部正當**，且皆附「待修規則 id」與指向 `docs/無障礙稽核報告.md`。逐一回查 source 後**屬實**：

| Skip 測試 | 規則 | 根因（已回查 source 確認） |
|-----------|------|------|
| `pages.a11y` PeoplePage | button-name | 經 `EmployeeList.tsx:77` 的 `<SelectTrigger>` 無關聯 Label/`id`、無 aria-label ✅ |
| `EmployeeList.a11y` | button-name | 同上，`EmployeeList.tsx:77` 狀態篩選 Select ✅ |
| `forms.a11y` AssignmentEditor | button-name | `AssignmentEditor` 組別/職級/主主管 Select 未關聯 Label（報告列 :136/:158/:205） |
| `pages.a11y` BpmnListPage | button-name | `BpmnListPage.tsx:126-128` 純圖示 `<Trash2>` 刪除鈕無 aria-label ✅ |
| `forms.a11y` document.body 全頁掃描 | aria-command-name | Base UI Dialog 在 portal 注入的 focus-guard sentinel，屬**函式庫層級**、非專案缺陷 ✅ |

報告本身（`docs/無障礙稽核報告.md`）**準確且專業**：對照精確行號（issue 1、2 我已逐一驗證）、正確區分函式庫層級（issue 3）與專案層級問題、明列 WCAG 2.2 AA 範圍與 jsdom 限制（color-contrast、鍵盤焦點、報讀器實機未涵蓋）、提供具體修法與「修好後取消 skip 轉綠燈」的守門路徑。✅ 採信。

> 補充：a11y 測試對 Dialog 的處理正確——因內容經 React Portal 掛到 `document.body`，改抓 `role="dialog"` 元素本身稽核（而非空的 container）。此細節到位，避免偽陰性。

### 3.4 Flakiness / 過廣選擇器

- **Flakiness**：三次執行逐項相同，**無 flakiness**。所有非同步互動皆以 `findBy*` / `waitFor` 等候，無裸 `setTimeout`。
- **過廣選擇器**：整體良好（角色／標籤為主）。少數 `closest()`/`parentElement` 與 combobox 索引定位偏脆（見 §3.1），列為改進建議而非阻擋項。

---

## 四、覆蓋缺口與風險（依優先序）

| 風險 | 區塊 | 現況 | 風險說明 | 優先 |
|------|------|------|---------|------|
| R1 | **覆蓋率設定誤導** | `coverage.include` 排除 components/pages，門檻只守 services/context | 「86.88%」會被誤讀為 UI 已充分測試；UI 實測整體僅 **22%** | **高** |
| R2 | **React Flow 組織圖** `orgFlow/*` | 1.75%，`OrgFlowChart`/`NodeDetailPanel`(552行)/工具列/控制列 0% | 產品核心視覺化與互動（拖拉、節點詳情、diff）幾乎無自動化防護 | **高** |
| R3 | **BPMN 設計器／模擬器／影響分析** | `bpmn/`、`bpmn/impact`、`bpmn/simulation`、`Bpmn*Page` 全 0% | 複雜流程編輯與模擬無測試，回歸風險大 | **高** |
| R4 | **未涵蓋頁面** | `OrgChartPage`、`BpmnDesigner/Impact/List/Simulate Page` 0% | 路由層級頁面整合行為未驗 | 中 |
| R5 | **DataToolbar 互動分支** | 28% | 匯入/匯出、版本切換等實際動作未測（僅渲染） | 中 |
| R6 | **CsvImportPage** | 57.57% | 匯入流程的錯誤/邊界分支未足 | 中 |
| R7 | **快照樣式脆弱** | 4 檔快照內嵌 Tailwind class | 改樣式即需更新快照，易產生雜訊 diff | 低 |
| R8 | **選擇器脆弱** | 少數 closest/索引定位 | 版面或下拉順序調整可能誤斷 | 低 |

> 風險定性說明：本次 UI 測試把「表單／CRUD／驗證」這條最常改動且使用者高頻的路徑守住了（這是價值最高的部分）；但**視覺化與流程編輯**這兩塊複雜度最高、最難手動回歸的區域，目前是測試真空。

---

## 五、應修正的已知缺陷

### Bug 1（功能性，**待修**）：對話框表單重用實例導致預填失效

- **根因**：`EmployeeForm.tsx:43-50` 與 `GroupForm.tsx:45-53` 以 `useState(initial ?? {...})` 初始化本地表單狀態。`useState` 的初始值**只在首次掛載時取一次**；而父頁面（`PeoplePage`/`GroupsPage`）讓對話框元件**常駐掛載、只切換 `open`**，故當 `initial`（選取的員工／組別）改變時，表單不會重新預填。
- **可觀察症狀**：
  - `PeoplePage`（`PeoplePage.tsx:172-178`）：傳入 `employee={employeeFormNew ? null : employee ?? null}`，因實例重用，「新增」時可能殘留先前選取員工的資料且 `isNew=true`。
  - `GroupsPage`：點「編輯」開啟時欄位為空（未帶入既有資料）。
- **測試是否有記錄？✅ 有，且明確記錄為已知問題：**
  - `GroupsPage.test.tsx:50-53` 直接斷言 `getByLabelText('代碼')` 值為 `''`，並於註解寫明「GroupForm 重用同一實例（useState 僅初始化一次），此處欄位未被既有資料預填，屬已知問題」。
  - `EmployeeForm.test.tsx:7-11` 於檔首註解說明「直接渲染元件可避開 PeoplePage 重用同一表單實例造成的預填問題（見最終報告 bug 註記）」。
- **建議修法**：將表單改為「`open` 為真時依 `initial` 重置狀態」——例如以 `key={employee?.id ?? 'new'}` 強制重掛載，或在元件內以 `useEffect`/受控 props 於 `open`/`initial` 變動時同步 state。修後應補一個「同一頁先編輯 A 再新增、欄位正確重置」的整合測試守門。
- **嚴重度**：中高（影響「新增/編輯」核心流程的資料正確性，可能誤帶舊資料）。

### Bug 2（無障礙，**待修**，Critical）：Select 與圖示按鈕缺可及名稱

詳見 §3.3 與 `docs/無障礙稽核報告.md` 問題 1、2。影響 `EmployeeList` 狀態篩選、`AssignmentEditor` 三個下拉、`BpmnListPage` 刪除鈕。修法：補 `<Label htmlFor>`↔`<SelectTrigger id>` 關聯，或 `aria-label`；圖示按鈕加 `aria-label` 並讓圖示 `aria-hidden`。

### 議題 3（函式庫層級，追蹤）：Base UI Dialog focus-guard `aria-command-name`

非專案缺陷，隨 Base UI 升級驗證；不建議改 production 程式碼。

---

## 六、驗收結論

> ## 🟡 有條件通過（Conditionally Accepted）

**理由：**

新增的測試本身**品質紮實、零失敗、零 flakiness、tsc 與 eslint 全綠**，互動測試斷言真實使用者結果與領域驗證、a11y skip 全屬正當且報告準確、快照規模合理。就「已撰寫的測試」而言，工藝水準高，**值得收進 integration**。

之所以**未給「無條件通過」**，是因為兩項與「驗收標準的呈現正確性」相關的條件尚未滿足：

1. **覆蓋率數據具誤導性（R1，須處理）**：`coverage.include` 排除了本次主打的 `components`/`pages`，使「86.88%」無法代表 UI 測試成效；UI 層實測整體僅 **22.16% stmts**。在把覆蓋率當守門指標前，必須讓設定涵蓋 UI 層（並為其設下合理、漸進的門檻），否則指標形同虛設。
2. **核心視覺化／流程區塊為測試真空（R2、R3）**：React Flow 組織圖與 BPMN 設計器／模擬器／影響分析幾乎 0% 覆蓋，屬複雜度最高、最難手動回歸之處，需有明確補測計畫。

上述為「條件」而非「立即阻擋合併」——測試品質達標，缺的是**範圍與指標誠實度**。

### 通過所附條件（建議於後續 sprint 完成）

1. **修正覆蓋率設定**：將 `coverage.include` 擴及 `src/components/**`、`src/pages/**`（或移除 include 改用 exclude），並為 UI 層設定**漸進式**門檻（先以目前約 22% 為地板，逐步調高），避免新 UI 程式無測卻被綠燈掩蓋。
2. **修 Bug 1（表單預填）** 並補一個跨「編輯→新增」的整合測試守門。
3. **修 a11y 問題 1、2**（Critical），並逐一取消對應 `it.skip` 使其轉綠。

### Top 建議（依投資報酬）

1. 先補 `OrgFlowChart` / `NodeDetailPanel` 的關鍵互動測試（節點選取、詳情面板、diff 呈現）——這是產品核心且 0% 覆蓋，ROI 最高。
2. 為 BPMN 設計器／模擬器補「至少 happy-path 的渲染＋一條主互動」測試，建立最低限度回歸防護。
3. 補強 `DataToolbar`（匯入/匯出/版本切換）與 `CsvImportPage` 錯誤分支。
4. 快照脆弱性：團隊約定「樣式變更需同步更新快照」，或評估只快照語意結構（去除 class）以降低雜訊。
5. 將 a11y 測試與覆蓋率門檻納入 CI，讓本次建立的守門持續生效。

---

## 附錄：實測指令與關鍵輸出

```
$ npx vitest run            # 三次
 Test Files  39 passed | 1 skipped (40)
      Tests  238 passed | 5 skipped (243)        # 三次完全相同

$ npx tsc -b                # TSC_EXIT=0（無輸出）
$ npx eslint .              # ESLINT_EXIT=0（無輸出）

$ npx vitest run --coverage                       # 設定範圍：services + context
All files   86.88 | 73.2 | 89.74 | 88.34

$ npx vitest run --coverage \
    --coverage.include='src/components/**' \
    --coverage.include='src/pages/**'             # 本次主打 UI 層（CLI 一次性量測）
All files   22.16 (311/1403) | 16.15 (163/1009) | 25.5 (163/639) | 23.5 (284/1208)
  components 76.0 | components/ui 82.81 | bpmn/nodes 95.23
  orgFlow 1.75 | bpmn 0 | bpmn/impact 0 | bpmn/simulation 0 | groupMembership 0
  pages 23.63（GroupsPage 100、PeoplePage 75、ChangeLog 81.81、Csv 57.57、其餘 Bpmn/OrgChart Page 0）
```

> 註：§2.3(B) 為**一次性量測**所用旗標，過程中以 `--coverage.thresholds.*=0` 暫時放寬門檻以利取數，**未變更任何設定檔**。
