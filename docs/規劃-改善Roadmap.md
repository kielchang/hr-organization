# 改善 Roadmap

> 整合 PM + UXR + Change Management Consultant 三方評審後的改善計畫。
> 採 CM 的 ADKAR 框架排序：先**校準 vibe 與 Awareness 階段**（讓 HR 一進來不會走錯方向），再補 **Desire（stakeholder）**、**Reinforcement（sustainment）** 結構性缺口。
> 最後更新：2026-06-06。

## 0. 三方評審來源

- **PM 評審**：產品策略、業務契合度、定位邊界。
- **UXR 評審**：HR 三情境（年度改造／跨部門小組／M&A）使用者旅程模擬。
- **CM 評審**：ADKAR/Kotter/Prosci 框架，揭露工具當前**「Knowledge-heavy、其餘皆空」**的核心問題；提出最重要的 vibe 警告——「**工具讓 HR 變強，但讓 HR 高估自己**」。

完整評審詳細在主執行緒對話記錄；本文件是**已執行的整合與排序**，作為改善工程的事實來源。

## 1. CM vibe 校準（最高優先、無條件先做）

CM 顧問的核心警告：**「HR 在 30% 完成度時以為自己在 90%」**。
工具當前的「規劃 → 一鍵發布 → 結束」流程暗示完成感過早。**必須在工具核心流程注入 CM 思維**。

### Phase 0 — vibe 校準（低成本高槓桿）
- [ ] `R0.1` **發布按鈕加摩擦**：publish 前提問三題（sponsor 誰？stakeholder 名單？sustainment owner？），任一題空白警告但不擋
- [ ] `R0.2` **詞彙稽核**：去工程化全站文案（SPOF→無備援主管、斷鏈→懸空匯報、層級深度→組織層級、節點→人員、邊→匯報線、捕捉快照→設定比較基準、function→跨部門職能、發布→**改名留待 Phase 1 決定**）
- [ ] `R0.3` **健檢結果分群摺疊**：findings 按類別分群（span/depth/function/chain/cycle/spof），減少資訊過載
- [ ] `R0.4` **「保留事項」摘要**（CM 獨家、低成本）：scenarioCompare 結果加一欄「**未變動的部分**」（從 diff 反推），給員工 anchor
- [ ] `R0.5` **Readiness Score**（CM 獨家、低成本）：從現有 findings 自動算 100 分量表（Leadership/Capacity/Stakeholder/Infrastructure/Comms 五大類），在 `/health` 加分頁

## 2. Phase 1 — 補 Desire 階段（Stakeholder 視角）

CM 評估工具 ADKAR 中 Desire 階段只覆蓋 **5%**——完全缺 stakeholder 概念。這是 CM 失敗第一名原因。

- [ ] `R1.1` **發布版本四段狀態**：draft → proposed → announced → live（CM 深化 PM 的三段建議，避免「生效日當天員工才知道」反模式）
- [ ] `R1.2` **CEO/Sponsor Brief 一鍵產出**（三方共識、CM 補強內容）：含 burning platform、新組織示意、stakeholder impact heat map、保留事項、risk register、cascade timeline、**Sponsor Ask**（CEO 要做什麼動作）
- [ ] `R1.3` **Stakeholder Map**（CM 獨家、需新欄位）：員工新增 influence/support/impact 三個欄位，新頁 `/stakeholder-map` 畫 influence × support 2x2 grid

## 3. Phase 2 — 補 Reinforcement 階段（Sustainment 追蹤）

CM 評估 Reinforcement 覆蓋 **15%**——只有技術種子（生效日 + changelog）無流程。發布後 60-90 天是 reversion 風險最高的窗口。

- [ ] `R2.1` **Sustainment Checkpoints**（D+30/+60/+90）：發布版本時自動生成三個 checkpoint，到日提醒 HR 跑健檢、記錄分數變化
- [ ] `R2.2` **Manager Cascade 預覽**：按 N-1/N-2 自動分波（Wave 1/2/3），每人一份「**你的部屬有哪些變動**」摘要
- [ ] `R2.3` **Reversion 監測**（可選、依 R2.1 結果再決定）

## 4. Phase 3 — 流程衝擊強化（BPMN 重定位）

PM/UXR 建議 BPMN 影響分析降可選；CM **強烈反對**——這是工具最該差異化的功能。
協調者裁決：**改名 + 結構強化**（不降級、但對新手仍保留次層發現性）。

- [ ] `R3.1` **「流程與 stakeholder 衝擊」改名**（藏 BPMN 字眼）
- [ ] `R3.2` **三層 stakeholder 結構**：approver（核准人）+ process owner（流程負責主管）+ end user（終端使用者）三層各自影響範圍
- [ ] `R3.3` **影響分析含頻率／嚴重度交叉**：一條流程一個月跑一次 vs 一天跑 50 次，CM 應對完全不同

## 5. Phase 4 — 規劃模型擴充（PM 視角缺口）

PM 評估缺「編制／空位」概念——讓 HR 沒辦法表達「規劃中還沒到位的人」。

- [ ] `R4.1` **編制（target headcount）**：group 新增目標人數，健檢能算「**編制缺口**」
- [ ] `R4.2` **規劃中虛擬員工**（planned status）：員工 status 加 `planned`，視覺以虛線框／灰底節點呈現
- [ ] `R4.3` **變更理由（rationale）+ 歷史方案命名**：版本／changelog 加結構化欄位

## 6. Phase 5 — 體驗摩擦消除（UXR 視角）

- [ ] `R5.1` **首次使用導覽**（3 分鐘）+ 資料載入首推改組織圖
- [ ] `R5.2` **編輯態 before/after 浮層**：不發布也能看指標變化
- [ ] `R5.3` **CSV 欄位中文化**
- [ ] `R5.4` **比較模式入口重設計**（局部比較、降低「建完整第二版」假設）
- [ ] `R5.5` **弱化六步旅程感**：允許任意進入點

## 7. 觀察項（等真實 HR 訊號）

依賴後續訪談結果決定是否啟動。

- 接班計畫透鏡（succession lens，PM）
- Flight Risk Proxy（M&A 場景，CM）
- Champion Network（依賴 Stakeholder Map 完成，CM）
- Resistance Risk Register（依賴 Stakeholder Map 完成，CM）
- 分階段執行計畫（30/60/90 天分段生效，UXR）
- 規劃成效追蹤趨勢線（UXR）

## 8. 紅線（三方共識、不該做）

- 正式送簽流程／審批工作流（屬營運系統）
- 薪資、HRIS 同步、權限管控
- AI 自動建議方案（HR 失去方案所有權與信心，政治自殺）
- BPMN 全流程引擎強化（Phase 3 只強化 stakeholder impact 透鏡，不擴展為簽核引擎）
- 任何「真的生效」的機制（保持「試算工具」純粹性）

## 9. 必須訪談真實 HR 驗證的 8 個關鍵問題

部分 Roadmap 項目（特別是 Phase 1/2 的較大投資）強烈建議**先訪談 3-5 位真實 HR 再動**：

1. 按「發布版本」後預期會發生什麼？（驗 R0.2 改名 + R1.1 四段狀態）
2. 最後給 CEO 用什麼形式？PPT/PDF/連結？（驗 R1.2 Sponsor Brief 投資方向）
3. 公司有用 BPMN／流程圖嗎？（驗 R3.* BPMN 強化方向）
4. 「主歸屬／次歸屬」怎麼理解？（驗雙維度直覺度）
5. 組織調整你先打開 Excel 還是工具？（驗 PMF）
6. Stakeholder mapping / resistance register 你用什麼工具？想在這裡做嗎？（驗 R1.3 替代 vs 協作）
7. 組織調整你是包辦還是有專門 CM 顧問？（驗 HR vs CM 分工現實）
8. 發布後 30/60/90 天還會回來追蹤嗎？（驗 R2.1 Sustainment 該不該做）

## 10. 進度同步機制

- 本文件是**規劃事實來源**，每 phase 完成時更新狀態並紀錄 commit hash。
- 系統內提供 `/roadmap` 頁面，呈現相同內容供使用者瀏覽（資料源來自 `src/services/roadmap.ts`，與本文件同步）。
- 待辦清單 `docs/待辦清單.md` 仍保留為「下一個開工」的指引；本 Roadmap 是更長期的方向地圖。
