# 工作流程：integration 分支（不必等你合併）

> 目標：Claude 把所有工作堆在 **`integration`** 分支，這條分支**永遠保持「綠」且可無痛合併回 `main`**。
> 你（維護者）只要有空時去看那條標準 PR，決定要不要按合併即可，不再是任何人的阻塞點。
> 建立日期：2026-06-06。

---

## 核心原則

1. **`main` 只透過合併 `integration` 前進**——永遠不直接 commit 到 `main`。
   因此 `integration` 永遠是 `main` 的後代，合併**零衝突**。
2. **`integration` 的每個 commit 都先驗證通過才推送**（pre-push hook 跑 `npm run verify`）。
   任何一刻的 `integration` 都能安全合併。
3. **單一標準 PR**：`integration → main`，永遠開著（或合併後我再開新的）。你只需偶爾瞄一眼決定合併。
4. **合併方式固定用 GitHub 的「Create a merge commit」**——這能讓我合併後用快進（fast-forward）把 `integration` 無痛追平 `main`。

---

## 你要做的事（極少）

1. 有空時打開 `integration → main` 的 PR，看一下變更。
2. 想合併就按 **「Merge pull request」→「Create a merge commit」→ Confirm**。
3. 其他都不用管。**不要**直接 commit 到 `main`，也**不要**用 Squash/Rebase 合併（會讓分支歷史分岔，破壞無痛特性）。

> 若 GitHub 介面預設是 Squash/Rebase，請在 repo Settings → General → Pull Requests 勾選「Allow merge commits」，並把它設為預設。

---

## 我（Claude）要做的事

### 開始一段工作前：先把 integration 追平已合併的 main
```bash
git fetch origin
git checkout integration
git merge origin/main      # 你若剛合併過 PR，這步把 main 的 merge commit 併回來（零衝突）
git push                   # 觸發 pre-push 驗證
```
> 因為 `main` 的內容全部來自 `integration`，把 `main` 併回 `integration` **永遠不會有衝突**（FF 或一個無內容的 merge commit）。

### 日常開發
- 直接在 `integration` 上做小步、可驗證的 commit（較大的風險工作可開短命 feature 分支，驗證後自己併回 `integration`）。
- 每次 `git push` 都會自動跑 `npm run verify`（tsc + lint + test + build），紅的就擋下，確保推上去的永遠是綠的。

### 維護標準 PR
- 若 `integration → main` 尚無開啟的 PR，就開一個；已存在則讓它隨推送自動更新。
- PR 內文保持可掃讀，方便你快速決定。

### 你合併之後
- 我下次開工時的「追平」步驟會自動把 `integration` 對齊新的 `main`，並在有新工作時開新的標準 PR。

---

## 驗證關卡（pre-push hook）

- `.githooks/pre-push` 會在每次推送前跑 `npm run verify`。
- 啟用方式（clone 後一次性）：`npm run setup:hooks`（即 `git config core.hooksPath .githooks`）。
- 緊急略過（純文件、不建議）：`SKIP_VERIFY=1 git push`。
- `npm run verify` = `tsc -b && eslint . && vitest run --coverage && vite build`。

---

## 為什麼這樣就「無痛」

- `main` 只被 `integration` 以 merge commit 推進 → `integration` 永遠是 `main` 祖先 → **合併零衝突**。
- 合併後 `integration` 可 fast-forward 追平 `main`（或一個零內容 merge）→ **追平零衝突**。
- 每次推送前強制驗證 → `integration` **永遠是綠的、永遠可合併**。
- 你的角色縮到最小：**只在有空時按一個 Merge 鈕**。

---

## 邊界情況

- **你很久沒合併**：沒關係，`integration` 持續累積、PR 持續更新，仍永遠可合併。
- **驗證失敗**：pre-push 直接擋下，不會把紅的推上去；我會先修好再推。
- **真的需要 hotfix 直上 main**：請仍走 `integration`（在它上面做 hotfix → 合併），以免 `main` 出現非來自 `integration` 的 commit 而破壞無痛前提；若不得已直推了 `main`，告訴我，我會用 `git merge origin/main` 把 `integration` 追平。
