/**
 * Roadmap service — 純前端 hard-coded 資料源 + 純函式統計。
 *
 * 對應規劃文件：docs/規劃-改善Roadmap.md
 * 介面契約：docs/契約-Roadmap頁面.md
 *
 * 維護規則：當改善項目落地時，更新對應 item 的 status / commitHash / completedAt，
 * 並同步更新規劃文件勾選框，一起 commit。
 */

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

/* ───────────────────────────── 資料定義 ───────────────────────────── */

const PHASES: RoadmapPhase[] = [
  {
    id: 'phase-completed',
    title: '已完成項目',
    description: '歷次 commit 落地的功能與修補，依時間累積。',
    order: 0,
    status: 'done',
  },
  {
    id: 'phase-0',
    title: 'Phase 0 — vibe 校準',
    description:
      'CM 顧問核心警告：「HR 在 30% 完成度時以為自己在 90%」。低成本高槓桿，先把 CM 思維注入核心流程。',
    order: 1,
    status: 'done',
  },
  {
    id: 'phase-1',
    title: 'Phase 1 — 補 Desire 階段（Stakeholder 視角）',
    description:
      'CM 評估 ADKAR 中 Desire 階段只覆蓋 5%——完全缺 stakeholder 概念，這是 CM 失敗第一名原因。',
    order: 2,
    status: 'researching',
  },
  {
    id: 'phase-2',
    title: 'Phase 2 — 補 Reinforcement 階段（Sustainment 追蹤）',
    description:
      'Reinforcement 覆蓋 15%——只有技術種子（生效日 + changelog）無流程。發布後 60–90 天 reversion 風險最高。',
    order: 3,
    status: 'researching',
  },
  {
    id: 'phase-3',
    title: 'Phase 3 — 流程衝擊強化（BPMN 重定位）',
    description:
      'CM 強烈反對降級——這是工具最該差異化的功能。改名 + 結構強化，藏起 BPMN 字眼但保留發現性。',
    order: 4,
    status: 'researching',
  },
  {
    id: 'phase-4',
    title: 'Phase 4 — 規劃模型擴充（PM 視角缺口）',
    description:
      'PM 評估缺「編制／空位」概念——讓 HR 沒辦法表達「規劃中還沒到位的人」。',
    order: 5,
    status: 'planned',
  },
  {
    id: 'phase-5',
    title: 'Phase 5 — 體驗摩擦消除（UXR 視角）',
    description: 'UXR 模擬三情境發現的小型體驗修補，個別獨立。',
    order: 6,
    status: 'planned',
  },
  {
    id: 'phase-observing',
    title: '觀察項',
    description: '依賴後續訪談結果決定是否啟動。',
    order: 7,
    status: 'observing',
  },
];

const ITEMS: RoadmapItem[] = [
  /* ── 已完成（phase-completed） ── */
  {
    id: 'done-雙維度',
    title: '雙維度組織模型（匯報線 × 專案職能）',
    description: '建立 group 雙維度資料結構與 UI 流程，作為後續健檢、比較、影響分析的基礎。',
    status: 'done',
    sources: ['pm', 'uxr', 'cm', 'consensus'],
    size: 'large',
    phaseId: 'phase-completed',
    commitHash: '13f5d4a',
    completedAt: '2026-06-06',
  },
  {
    id: 'done-健檢',
    title: '組織健檢（span / depth / function coverage / chain / SPOF）',
    description: '量化指標支持規劃決策，是工具差異化核心。',
    status: 'done',
    sources: ['pm', 'uxr', 'cm', 'consensus'],
    size: 'large',
    phaseId: 'phase-completed',
    commitHash: 'e9da58d',
    completedAt: '2026-06-06',
  },
  {
    id: 'done-m1',
    title: '情境比較 what-if（M1）',
    description: '兩個版本／快照之間的指標差異與節點 diff 視覺化。',
    status: 'done',
    sources: ['pm', 'uxr', 'consensus'],
    size: 'large',
    phaseId: 'phase-completed',
    commitHash: '01c29d0',
    completedAt: '2026-06-06',
  },
  {
    id: 'done-m2',
    title: '變更影響重定位（M2）',
    description: 'BPMN 影響分析從工程化頁面改為以「核准人變動」為主視角的 HR 友善版面。',
    status: 'done',
    sources: ['pm', 'uxr', 'cm', 'consensus'],
    size: 'medium',
    phaseId: 'phase-completed',
    commitHash: '7b81a2a',
    completedAt: '2026-06-06',
  },
  {
    id: 'done-m3',
    title: '整合 UX 收尾（M3）',
    description: '總覽頁 + 規劃旅程地圖，把六步串成一條清楚的入口。',
    status: 'done',
    sources: ['uxr'],
    size: 'medium',
    phaseId: 'phase-completed',
    commitHash: 'a37e4b2',
    completedAt: '2026-06-06',
  },
  {
    id: 'done-m4',
    title: 'README + 使用者導引收尾（M4）',
    description: 'HR 規劃旅程 walkthrough、文件同步。',
    status: 'done',
    sources: ['uxr'],
    size: 'small',
    phaseId: 'phase-completed',
    commitHash: '2368961',
    completedAt: '2026-06-06',
  },
  {
    id: 'done-flaky',
    title: '修 Base UI Select uncontrolled→controlled 切換 flaky',
    description: '修補測試 flakiness，提升 CI 穩定度。',
    status: 'done',
    sources: ['uxr'],
    size: 'small',
    phaseId: 'phase-completed',
    commitHash: 'd09c289',
    completedAt: '2026-06-06',
  },

  /* ── Phase 0 — vibe 校準（規劃文件 §1） ── */
  {
    id: 'R0.1',
    title: '發布按鈕加摩擦',
    description:
      'publish 前提問三題（sponsor 誰？stakeholder 名單？sustainment owner？），任一題空白警告但不擋。',
    status: 'done',
    commitHash: '1bdd955',
    completedAt: '2026-06-06',
    sources: ['cm'],
    size: 'small',
    phaseId: 'phase-0',
  },
  {
    id: 'R0.2',
    title: '詞彙稽核（去工程化全站文案）',
    description:
      'SPOF→無備援主管、斷鏈→懸空匯報、捕捉快照→設定比較基準、孤兒節點→無任何歸屬等（HR 主動線；BPMN 設計子頁「節點」維持流程語境）。「發布」改名留待 Phase 1 四段狀態決定。',
    status: 'done',
    commitHash: '1bdd955',
    completedAt: '2026-06-06',
    sources: ['cm', 'uxr', 'consensus'],
    size: 'medium',
    phaseId: 'phase-0',
  },
  {
    id: 'R0.3',
    title: '健檢結果分群摺疊',
    description:
      'findings 按類別分群（span / depth / function / chain / cycle / spof），減少資訊過載。',
    status: 'done',
    commitHash: '1bdd955',
    completedAt: '2026-06-06',
    sources: ['uxr', 'cm', 'consensus'],
    size: 'small',
    phaseId: 'phase-0',
  },
  {
    id: 'R0.4',
    title: '「保留事項」摘要',
    description:
      'scenarioCompare 結果加一欄「未變動的部分」（未變動歸屬比率，從 diff 反推），給員工 anchor、降低焦慮。',
    status: 'done',
    commitHash: '1bdd955',
    completedAt: '2026-06-06',
    sources: ['cm'],
    size: 'small',
    phaseId: 'phase-0',
  },
  {
    id: 'R0.5',
    title: '規劃就緒度（結構面）',
    description:
      '從現有 findings 自動算 0–100 結構就緒度（4 維：管理幅度／結構完整性／職能覆蓋／關鍵人風險）+ 等級，在 /health 加區塊；誠實命名「結構面」，完整變革就緒需搭配 stakeholder 評估（連 Phase 1）。',
    status: 'done',
    commitHash: '1bdd955',
    completedAt: '2026-06-06',
    sources: ['cm'],
    size: 'medium',
    phaseId: 'phase-0',
  },

  /* ── Phase 1 — Desire / Stakeholder（§2） ── */
  {
    id: 'R1.1',
    title: '發布版本四段狀態',
    description:
      'draft → proposed → announced → live（CM 深化 PM 的三段建議，避免「生效日當天員工才知道」反模式）。',
    status: 'researching',
    sources: ['pm', 'cm', 'consensus'],
    size: 'medium',
    phaseId: 'phase-1',
    notes: '需先訪談問題 #1',
  },
  {
    id: 'R1.2',
    title: 'CEO / Sponsor Brief 一鍵產出',
    description:
      '含 burning platform、新組織示意、stakeholder impact heat map、保留事項、risk register、cascade timeline、Sponsor Ask（CEO 要做什麼動作）。',
    status: 'researching',
    sources: ['pm', 'uxr', 'cm', 'consensus'],
    size: 'large',
    phaseId: 'phase-1',
    notes: '需先訪談問題 #2',
  },
  {
    id: 'R1.3',
    title: 'Stakeholder Map（influence × support 2×2）',
    description:
      '員工新增 influence / support / impact 三個欄位，新頁 /stakeholder-map 畫 influence × support 2×2 grid。',
    status: 'researching',
    sources: ['cm'],
    size: 'large',
    phaseId: 'phase-1',
    notes: '需先訪談問題 #6',
  },

  /* ── Phase 2 — Reinforcement（§3） ── */
  {
    id: 'R2.1',
    title: 'Sustainment Checkpoints（D+30 / +60 / +90）',
    description:
      '發布版本時自動生成三個 checkpoint，到日提醒 HR 跑健檢、記錄分數變化。',
    status: 'researching',
    sources: ['cm'],
    size: 'medium',
    phaseId: 'phase-2',
    notes: '需先訪談問題 #8',
  },
  {
    id: 'R2.2',
    title: 'Manager Cascade 預覽',
    description:
      '按 N-1 / N-2 自動分波（Wave 1/2/3），每人一份「你的部屬有哪些變動」摘要。',
    status: 'researching',
    sources: ['cm'],
    size: 'medium',
    phaseId: 'phase-2',
  },
  {
    id: 'R2.3',
    title: 'Reversion 監測',
    description: '可選；依 R2.1 落地後的實際數據再決定是否做。',
    status: 'researching',
    sources: ['cm'],
    size: 'medium',
    phaseId: 'phase-2',
    dependencies: ['R2.1'],
  },

  /* ── Phase 3 — 流程衝擊強化（§4） ── */
  {
    id: 'R3.1',
    title: '「流程與 stakeholder 衝擊」改名',
    description: '藏 BPMN 字眼，對新手仍保留次層發現性。',
    status: 'researching',
    sources: ['pm', 'uxr', 'cm', 'consensus'],
    size: 'small',
    phaseId: 'phase-3',
    notes: '需先訪談問題 #3',
  },
  {
    id: 'R3.2',
    title: '三層 stakeholder 結構',
    description:
      'approver（核准人）+ process owner（流程負責主管）+ end user（終端使用者）三層各自影響範圍。',
    status: 'researching',
    sources: ['cm'],
    size: 'large',
    phaseId: 'phase-3',
    notes: '需先訪談問題 #3',
  },
  {
    id: 'R3.3',
    title: '影響分析含頻率／嚴重度交叉',
    description:
      '一條流程一個月跑一次 vs 一天跑 50 次，CM 應對完全不同——影響分析加上頻率／嚴重度維度。',
    status: 'researching',
    sources: ['cm'],
    size: 'medium',
    phaseId: 'phase-3',
  },

  /* ── Phase 4 — 規劃模型擴充（§5） ── */
  {
    id: 'R4.1',
    title: '編制（target headcount）',
    description: 'group 新增目標人數，健檢能算「編制缺口」。',
    status: 'planned',
    sources: ['pm'],
    size: 'medium',
    phaseId: 'phase-4',
  },
  {
    id: 'R4.2',
    title: '規劃中虛擬員工（planned status）',
    description:
      '員工 status 加 planned，視覺以虛線框／灰底節點呈現，讓 HR 能表達「規劃中還沒到位的人」。',
    status: 'planned',
    sources: ['pm'],
    size: 'medium',
    phaseId: 'phase-4',
  },
  {
    id: 'R4.3',
    title: '變更理由（rationale）+ 歷史方案命名',
    description: '版本／changelog 加結構化欄位，記錄方案 why。',
    status: 'planned',
    sources: ['pm'],
    size: 'small',
    phaseId: 'phase-4',
  },

  /* ── Phase 5 — UXR 摩擦消除（§6） ── */
  {
    id: 'R5.1',
    title: '首次使用導覽（3 分鐘）+ 資料載入首推改組織圖',
    description: '降低第一次開啟工具的迷茫感。',
    status: 'planned',
    sources: ['uxr'],
    size: 'medium',
    phaseId: 'phase-5',
  },
  {
    id: 'R5.2',
    title: '編輯態 before / after 浮層',
    description: '不發布也能看指標變化，鼓勵反覆試算。',
    status: 'planned',
    sources: ['uxr'],
    size: 'medium',
    phaseId: 'phase-5',
  },
  {
    id: 'R5.3',
    title: 'CSV 欄位中文化',
    description: '匯入範本欄位名稱改中文，降低試算門檻。',
    status: 'planned',
    sources: ['uxr'],
    size: 'small',
    phaseId: 'phase-5',
  },
  {
    id: 'R5.4',
    title: '比較模式入口重設計',
    description:
      '局部比較、降低「建完整第二版」的假設；目前流程逼使用者複製整個版本才能比。',
    status: 'planned',
    sources: ['uxr'],
    size: 'medium',
    phaseId: 'phase-5',
  },
  {
    id: 'R5.5',
    title: '弱化六步旅程感',
    description: '允許任意進入點，旅程是建議不是強制。',
    status: 'planned',
    sources: ['uxr'],
    size: 'small',
    phaseId: 'phase-5',
  },

  /* ── 觀察項（§7） ── */
  {
    id: 'OBS.1',
    title: '接班計畫透鏡（succession lens）',
    description: 'PM 提案：從現有組織資料衍生接班候選人視角。',
    status: 'observing',
    sources: ['pm'],
    size: 'large',
    phaseId: 'phase-observing',
  },
  {
    id: 'OBS.2',
    title: 'Flight Risk Proxy（M&A 場景）',
    description: 'CM 提案：從歷史變動頻率與 stakeholder 結構推離職風險指標。',
    status: 'observing',
    sources: ['cm'],
    size: 'large',
    phaseId: 'phase-observing',
  },
  {
    id: 'OBS.3',
    title: 'Champion Network',
    description: '依賴 Stakeholder Map（R1.3）完成。',
    status: 'observing',
    sources: ['cm'],
    size: 'medium',
    phaseId: 'phase-observing',
    dependencies: ['R1.3'],
  },
  {
    id: 'OBS.4',
    title: 'Resistance Risk Register',
    description: '依賴 Stakeholder Map（R1.3）完成。',
    status: 'observing',
    sources: ['cm'],
    size: 'medium',
    phaseId: 'phase-observing',
    dependencies: ['R1.3'],
  },
  {
    id: 'OBS.5',
    title: '分階段執行計畫（30 / 60 / 90 天分段生效）',
    description: 'UXR 提案：允許版本內部分節點分段生效，不必一次全切。',
    status: 'observing',
    sources: ['uxr'],
    size: 'large',
    phaseId: 'phase-observing',
  },
  {
    id: 'OBS.6',
    title: '規劃成效追蹤趨勢線',
    description: 'UXR 提案：把歷次版本的健檢分數連成趨勢，看規劃方向是否往好走。',
    status: 'observing',
    sources: ['uxr'],
    size: 'medium',
    phaseId: 'phase-observing',
  },
];

const RED_LINES: string[] = [
  '正式送簽流程／審批工作流（屬營運系統）',
  '薪資、HRIS 同步、權限管控',
  'AI 自動建議方案（HR 失去方案所有權與信心，政治自殺）',
  'BPMN 全流程引擎強化（Phase 3 只強化 stakeholder impact 透鏡，不擴展為簽核引擎）',
  '任何「真的生效」的機制（保持「試算工具」純粹性）',
];

const VALIDATION_QUESTIONS: string[] = [
  '按「發布版本」後預期會發生什麼？（驗 R0.2 改名 + R1.1 四段狀態）',
  '最後給 CEO 用什麼形式？PPT / PDF / 連結？（驗 R1.2 Sponsor Brief 投資方向）',
  '公司有用 BPMN／流程圖嗎？（驗 R3.* BPMN 強化方向）',
  '「主歸屬／次歸屬」怎麼理解？（驗雙維度直覺度）',
  '組織調整你先打開 Excel 還是工具？（驗 PMF）',
  'Stakeholder mapping / resistance register 你用什麼工具？想在這裡做嗎？（驗 R1.3 替代 vs 協作）',
  '組織調整你是包辦還是有專門 CM 顧問？（驗 HR vs CM 分工現實）',
  '發布後 30 / 60 / 90 天還會回來追蹤嗎？（驗 R2.1 Sustainment 該不該做）',
];

/** 凍結整份資料避免被誤改（深凍 items 陣列）。 */
const ROADMAP_DATA: RoadmapData = Object.freeze({
  phases: Object.freeze([...PHASES]) as RoadmapPhase[],
  items: Object.freeze(ITEMS.map((item) => Object.freeze({ ...item }))) as RoadmapItem[],
  redLines: Object.freeze([...RED_LINES]) as string[],
  validationQuestions: Object.freeze([...VALIDATION_QUESTIONS]) as string[],
  lastUpdated: '2026-06-06',
}) as RoadmapData;

/* ───────────────────────────── Public API ───────────────────────────── */

/** 取得完整 roadmap 資料（純函式，回傳 frozen 物件，避免被誤改）。 */
export function getRoadmapData(): RoadmapData {
  return ROADMAP_DATA;
}

/** 統計每個狀態下的項目數。 */
export interface RoadmapStatusCounts {
  done: number;
  inProgress: number;
  planned: number;
  researching: number;
  observing: number;
  total: number;
}

export function countByStatus(data: RoadmapData): RoadmapStatusCounts {
  const counts: RoadmapStatusCounts = {
    done: 0,
    inProgress: 0,
    planned: 0,
    researching: 0,
    observing: 0,
    total: 0,
  };
  for (const item of data.items) {
    counts.total += 1;
    switch (item.status) {
      case 'done':
        counts.done += 1;
        break;
      case 'in-progress':
        counts.inProgress += 1;
        break;
      case 'planned':
        counts.planned += 1;
        break;
      case 'researching':
        counts.researching += 1;
        break;
      case 'observing':
        counts.observing += 1;
        break;
    }
  }
  return counts;
}

/** 依 phase 分組 items，phases 按 order 升冪、items 按 id 字串升冪。 */
export function groupItemsByPhase(
  data: RoadmapData,
): Array<{ phase: RoadmapPhase; items: RoadmapItem[] }> {
  const phasesSorted = [...data.phases].sort((a, b) => a.order - b.order);
  return phasesSorted.map((phase) => ({
    phase,
    items: data.items
      .filter((item) => item.phaseId === phase.id)
      .sort((a, b) => a.id.localeCompare(b.id)),
  }));
}
