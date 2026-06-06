# CLAUDE.md — hr-organization 開發協作政策

> 本檔每個 session 自動載入，是「**如何在本專案開發**」的操作核心。
> 詳細設計見 [開發協作流程-多角色分工](docs/開發協作流程-多角色分工.md)。
> 專案架構見 [系統設計文件](docs/系統設計文件.md)；git 流程見 [工作流程-integration分支](docs/工作流程-integration分支.md)。

## 專案一句話

前端優先的 HR 組織架構調整工具（React 19 + Vite + React Flow，localStorage），加 **opt-in 後端**（`server/`：Fastify + Prisma + PostgreSQL）。

---

## 最高原則：多角色協同，禁止單一角色包辦

**任何開發**（新功能、新架構、修補、重構、文件）都必須走**完整多角色協作管線**，由主執行緒擔任**架構師／協調者**分派給對應角色 agent。
**絕不允許單一角色（含協調者自己）從頭到尾做完全部工作。**

- 這是使用者的**長期授權**：在本專案，主動 `spawn`／呼叫下列角色 agent 來協作開發，不需要每次再問。
- **實作與驗證必須由不同角色**：寫程式的人不可同時為自己的程式碼背書（審查／測試／資安由獨立角色把關）。
- **靠契約交接，不靠口述**：協調者先產出介面契約（型別／API schema／資料形狀），其他角色照契約各自開發。
- **控制延遲與成本**：彼此獨立的角色**平行分派**（同一則訊息開多個 agent）；後續追問用 `SendMessage` 續用既有 agent，不重開冷 context。

## 角色 → agent 對照（沿用 `~/.claude/agents/` 既有定義）

| 角色 | subagent | 寫碼權限 |
|---|---|---|
| 1 架構師／協調者 | `Software Architect`（＝主執行緒） | 僅契約／文件 |
| 2 後端 | `Backend Architect` / `Senior Developer` | `server/` 端 |
| 3 前端 | `Frontend Developer` | `src/` 端 |
| 4 資料層 | `Backend Architect`（含 Prisma schema／migration／repository） | 資料層 |
| 5 測試／QA | `Test Results Analyzer`（+`Accessibility Auditor`、`Performance Benchmarker`） | 僅測試碼 |
| 6 程式碼審查 | `Code Reviewer` | 唯讀＋評論 |
| 7 DevOps | `DevOps Automator` | CI/CD、docker、基礎設施檔 |
| 8 資安 | `/security-review` skill ＋ `Code Reviewer`（資安視角） | 唯讀＋報告 |
| 9 除錯 | `Minimal Change Engineer`（最小修補）/ `general-purpose`（調查） | 讀為主 |
| 10 文件 | `Technical Writer` | 僅文件 |

> 無獨立的「資料層／資安／除錯」agent：資料層併入 `Backend Architect`、資安用 `/security-review` skill、除錯用 `Minimal Change Engineer`。

## 每個工作單元的管線（順序＋平行）

0. **協調者**：拆解需求 → 定義**介面契約** → 技術選型與理由（ADR 草稿）。**契約未定不得開工。**
1. **資料層**（涉及資料時）：schema／migration／repository 介面。
2. **實作（平行）**：後端依契約實作 API／邏輯 ‖ 前端依契約串接 UI。
3. **品質關卡（平行、獨立角色）**：測試／QA ＋ 程式碼審查 ＋ 資安稽核。三者**唯讀＋產出**，發現問題**回報**不自行改。
4. **除錯回圈**：關卡有問題 → 除錯定位根因 → 交回**原開發角色**修正 → 重跑關卡。
5. **DevOps**（涉及 CI/CD／容器／環境時）：pipeline、Dockerfile/compose、env。
6. **文件**：README／ADR／API 文件與實際行為同步。
7. **協調者整合驗收**：確認各產出與契約一致 → 在 `integration` 分支提交。

## 與既有工作流程的銜接

- **git**：一律在常綠 `integration` 分支小步提交；每次 `git push` 由 `.githooks/pre-push` 跑 `npm run verify`（前端）＋ `npm run verify:server`（後端）——這是**機器把關**，與上述**角色把關**互補，兩者皆綠才算完成。
- **PR**：維持單一標準 `integration → main` PR，隨推送自動更新。
- 溝通用**繁體中文**。

## 邊界速記（違反即越權）

- 後端不改前端／不自改 API 契約（要改回報協調者）；前端不改後端／不直接碰 DB。
- 資料層不寫業務邏輯；審查／測試／資安不改實作（只回報）。
- DevOps 不改業務碼；未確認不對正式環境做不可逆操作。
- 文件不改程式邏輯。
