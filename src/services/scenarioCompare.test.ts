import {
  buildScenarioComparison,
  type MetricKey,
  type ScenarioInput,
} from './scenarioCompare';
import { backfillAssignmentLevels } from './assignmentLevels';
import { buildOrgHealth } from './orgHealth';
import {
  assignment,
  emp,
  group,
  jobLevel,
  makeOrgData,
} from '../test/fixtures';
import type { OrgData } from '../types/org';

/**
 * scenarioCompare.ts 純函式測試。對齊 orgHealth.test / functionCoverage.test 風格：
 * - 以 fixtures 工廠造最小資料、邏輯邊界一一覆蓋
 * - 不直接判定排版/著色（屬 UI），只驗服務契約：scenarios / metricMatrix / diffSummary
 *
 * 契約對應：docs/契約-情境比較whatif.md §2
 */

/** 造一個含 1 名員工的最小 OrgData，供「最小情境」用。 */
function singleEmployeeOrg(empId = 'e1'): OrgData {
  return makeOrgData({
    employees: [emp(empId)],
    groups: [group('dept', { kind: 'department' })],
    jobLevels: [jobLevel('j1', 10)],
    assignments: [
      assignment(`as-${empId}`, {
        employeeId: empId,
        groupId: 'dept',
        jobLevelId: 'j1',
      }),
    ],
  });
}

/** 將 OrgData 包成單一 ScenarioInput（label 預設為 versionId）。 */
function toInput(
  versionId: string,
  data: OrgData,
  label = versionId,
): ScenarioInput {
  return { versionId, label, data };
}

/** 指標名稱（繁中）對 key 的對照——契約 §2 metricMatrix 固定列順序。 */
const METRIC_ORDER: { key: MetricKey; label: string }[] = [
  { key: 'activeEmployees', label: '在職人數' },
  { key: 'departments', label: '部門數' },
  { key: 'functions', label: '職能數' },
  { key: 'supervisors', label: '主管數' },
  { key: 'avgSpan', label: '平均管理幅度' },
  { key: 'maxDepth', label: '最大層級深度' },
  { key: 'warningCount', label: '警示數' },
  { key: 'functionsWithoutMembers', label: '無成員職能數' },
  { key: 'functionsWithoutLead', label: '無 lead 職能數' },
  { key: 'spofCount', label: '單點風險（SPOF）數' },
];

describe('buildScenarioComparison — 邊界（情境數）', () => {
  it('0 個情境：回 { scenarios: [], metricMatrix: [] }', () => {
    const result = buildScenarioComparison([]);
    expect(result.scenarios).toEqual([]);
    expect(result.metricMatrix).toEqual([]);
  });

  it('1 個情境：scenarios.length===1、diffVsBaseline 全空、metricMatrix 仍有 10 列、每列 values.length===1', () => {
    const data = singleEmployeeOrg('solo');
    const result = buildScenarioComparison([toInput('v1', data, '基準')]);

    // scenarios
    expect(result.scenarios).toHaveLength(1);
    const only = result.scenarios[0];
    expect(only.input.versionId).toBe('v1');
    expect(only.input.label).toBe('基準');

    // 基準對自己 diff 全空
    expect(only.diffVsBaseline.addedEmployeeIds.size).toBe(0);
    expect(only.diffVsBaseline.removedEmployeeIds.size).toBe(0);
    expect(only.diffVsBaseline.modifiedEmployeeIds.size).toBe(0);
    expect(only.diffVsBaseline.addedAssignmentIds.size).toBe(0);
    expect(only.diffVsBaseline.removedAssignmentIds.size).toBe(0);
    expect(only.diffVsBaseline.modifiedAssignmentIds.size).toBe(0);
    expect(only.diffVsBaseline.assignmentChangedEmployeeIds.size).toBe(0);
    expect(only.diffVsBaseline.addedEdgeKeys.size).toBe(0);
    expect(only.diffVsBaseline.removedEdgeKeys.size).toBe(0);

    // diffSummary 全 0
    expect(only.diffSummary).toEqual({
      addedEmployees: 0,
      removedEmployees: 0,
      modifiedEmployees: 0,
      addedAssignments: 0,
      removedAssignments: 0,
      modifiedAssignments: 0,
      addedEdges: 0,
      removedEdges: 0,
    });

    // metricMatrix 仍有 10 列、每列只有 1 個值（單欄）
    expect(result.metricMatrix).toHaveLength(10);
    for (const row of result.metricMatrix) {
      expect(row.values).toHaveLength(1);
    }
  });
});

describe('buildScenarioComparison — 2 個情境：基準 + 變動斷言', () => {
  /**
   * 造一對 base/current 涵蓋全部 8 種 diff：
   * - employee added: e_add
   * - employee removed: e_rm
   * - employee modified: e_mod（改名）
   * - assignment added: as-add（屬 e_add）
   * - assignment removed: as-rm（屬 e_rm）
   * - assignment modified: as-mod（屬 e_keep，supervisor 改變 → 同時製造 edge 新增/移除）
   * - edge added: oldBoss→e_keep 改為 newBoss→e_keep
   * - edge removed: oldBoss→e_keep 消失
   *
   * 注意：modifiedAssignment 改 supervisor 會同時製造一條 edge 新增與一條 edge 移除，
   * 滿足「邊新增、邊移除各一」的斷言條件。
   */
  function buildPairedScenarios(): { base: OrgData; curr: OrgData } {
    const base = makeOrgData({
      employees: [
        emp('e_keep', { name: '原名' }),
        emp('e_rm'),
        emp('e_mod', { name: '原名' }),
        emp('oldBoss'),
        emp('newBoss'), // 兩個 boss 都在 base/curr 都存在，避免污染 addedEmployees
      ],
      groups: [group('dept', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('as-keep', {
          employeeId: 'e_keep',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['oldBoss'],
          primarySupervisorId: 'oldBoss',
        }),
        assignment('as-rm', {
          employeeId: 'e_rm',
          groupId: 'dept',
          jobLevelId: 'j1',
        }),
        assignment('as-mod', {
          employeeId: 'e_mod',
          groupId: 'dept',
          jobLevelId: 'j1',
        }),
        assignment('as-oldboss', {
          employeeId: 'oldBoss',
          groupId: 'dept',
          jobLevelId: 'j1',
        }),
        // newBoss 已存在但尚未有對應 assignment（curr 時才新增）
      ],
    });

    const curr = makeOrgData({
      employees: [
        emp('e_keep', { name: '原名' }),
        // e_rm 被移除
        emp('e_mod', { name: '新名' }), // 改名 → modifiedEmployees
        emp('oldBoss'),
        emp('newBoss'),
        emp('e_add'), // 新員工
      ],
      groups: [group('dept', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        // 改 supervisor：oldBoss → newBoss（同時造出 modifiedAssignment + addedEdge + removedEdge）
        assignment('as-keep', {
          employeeId: 'e_keep',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['newBoss'],
          primarySupervisorId: 'newBoss',
        }),
        // as-rm 被移除
        assignment('as-mod', {
          employeeId: 'e_mod',
          groupId: 'dept',
          jobLevelId: 'j1',
        }),
        assignment('as-oldboss', {
          employeeId: 'oldBoss',
          groupId: 'dept',
          jobLevelId: 'j1',
        }),
        assignment('as-newboss', {
          employeeId: 'newBoss',
          groupId: 'dept',
          jobLevelId: 'j1',
        }),
        // 新員工的新歸屬 → addedAssignments
        assignment('as-add', {
          employeeId: 'e_add',
          groupId: 'dept',
          jobLevelId: 'j1',
        }),
      ],
    });

    return { base, curr };
  }

  it('順序＝輸入順序，第一個為基準；第二個情境 diff 以「base→curr」算出', () => {
    const { base, curr } = buildPairedScenarios();
    const result = buildScenarioComparison([
      toInput('base', base, '基準'),
      toInput('curr', curr, '提案'),
    ]);

    expect(result.scenarios.map((r) => r.input.versionId)).toEqual([
      'base',
      'curr',
    ]);

    // 基準自己 diff 為空
    const baseR = result.scenarios[0];
    expect(baseR.diffVsBaseline.addedEmployeeIds.size).toBe(0);
    expect(baseR.diffVsBaseline.removedEmployeeIds.size).toBe(0);

    // 提案 diff：至少抓到「新員工 e_add」這筆變動，證明是「base→curr」算的
    const proposal = result.scenarios[1];
    expect(proposal.diffVsBaseline.addedEmployeeIds.has('e_add')).toBe(true);
    expect(proposal.diffVsBaseline.removedEmployeeIds.has('e_rm')).toBe(true);
  });

  it('diffSummary 8 個計數正確（加員工、移員工、改員工、加歸屬、移歸屬、改歸屬、邊新增、邊移除）', () => {
    const { base, curr } = buildPairedScenarios();
    const result = buildScenarioComparison([
      toInput('base', base),
      toInput('curr', curr),
    ]);
    const s = result.scenarios[1].diffSummary;

    expect(s.addedEmployees).toBe(1); // e_add
    expect(s.removedEmployees).toBe(1); // e_rm
    expect(s.modifiedEmployees).toBe(1); // e_mod 改名
    expect(s.addedAssignments).toBe(2); // as-add + as-newboss
    expect(s.removedAssignments).toBe(1); // as-rm
    expect(s.modifiedAssignments).toBe(1); // as-keep 改 supervisor
    expect(s.addedEdges).toBe(1); // newBoss → e_keep
    expect(s.removedEdges).toBe(1); // oldBoss → e_keep
  });
});

describe('buildScenarioComparison — metricMatrix 規格', () => {
  it('列順序、label、direction：4 個 down 指標、其餘 6 個 neutral', () => {
    const data = singleEmployeeOrg();
    const result = buildScenarioComparison([toInput('v1', data)]);

    // 列順序與 label 對齊契約
    expect(result.metricMatrix.map((r) => r.key)).toEqual(
      METRIC_ORDER.map((m) => m.key),
    );
    expect(result.metricMatrix.map((r) => r.label)).toEqual(
      METRIC_ORDER.map((m) => m.label),
    );

    // direction：明確列舉 4 個 down 與其餘 neutral，避免「全部都對」恒真
    const directionByKey = new Map(
      result.metricMatrix.map((r) => [r.key, r.direction]),
    );
    const downKeys: MetricKey[] = [
      'warningCount',
      'functionsWithoutMembers',
      'functionsWithoutLead',
      'spofCount',
    ];
    const neutralKeys: MetricKey[] = [
      'activeEmployees',
      'departments',
      'functions',
      'supervisors',
      'avgSpan',
      'maxDepth',
    ];
    for (const k of downKeys) expect(directionByKey.get(k)).toBe('down');
    for (const k of neutralKeys) expect(directionByKey.get(k)).toBe('neutral');

    // 無 up 指標
    expect(result.metricMatrix.some((r) => r.direction === 'up')).toBe(false);
  });

  it('values 型別：avgSpan 為 string（toFixed(1)），其餘為 number', () => {
    // 造一份「avgSpan 非整數」的資料：sup 帶 3 名部屬、mgr 帶 2 名（sup/mgr 各自獨立）
    // → 兩位主管 directReports 為 3、2 → avg=(3+2)/2=2.5
    const data = makeOrgData({
      employees: [
        emp('sup'),
        emp('mgr'),
        emp('a'),
        emp('b'),
        emp('c'),
        emp('d'),
        emp('e'),
      ],
      groups: [group('dept', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        // sup 與 mgr 皆為頂層（無 supervisor），避免 sup 多算到 mgr
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mgr', { employeeId: 'mgr', groupId: 'dept', jobLevelId: 'j1' }),
        // sup 帶 a/b/c（3 名）
        assignment('as-a', {
          employeeId: 'a',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        assignment('as-b', {
          employeeId: 'b',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        assignment('as-c', {
          employeeId: 'c',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        // mgr 帶 d/e（2 名）
        assignment('as-d', {
          employeeId: 'd',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['mgr'],
          primarySupervisorId: 'mgr',
        }),
        assignment('as-e', {
          employeeId: 'e',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['mgr'],
          primarySupervisorId: 'mgr',
        }),
      ],
    });
    const result = buildScenarioComparison([toInput('v1', data)]);

    const byKey = new Map(result.metricMatrix.map((r) => [r.key, r.values]));
    // avgSpan 應為字串（toFixed(1)）；(3+2)/2=2.5 → '2.5'
    const avgValues = byKey.get('avgSpan')!;
    expect(typeof avgValues[0]).toBe('string');
    expect(avgValues[0]).toBe('2.5');

    // 其餘指標皆為 number
    const otherKeys: MetricKey[] = [
      'activeEmployees',
      'departments',
      'functions',
      'supervisors',
      'maxDepth',
      'warningCount',
      'functionsWithoutMembers',
      'functionsWithoutLead',
      'spofCount',
    ];
    for (const k of otherKeys) {
      const vs = byKey.get(k)!;
      expect(typeof vs[0]).toBe('number');
    }
  });

  it('多情境 values 與 scenarios 同序、長度一致', () => {
    const a = singleEmployeeOrg('a');
    const b = singleEmployeeOrg('b');
    const c = singleEmployeeOrg('c');
    const result = buildScenarioComparison([
      toInput('va', a),
      toInput('vb', b),
      toInput('vc', c),
    ]);
    expect(result.scenarios.map((r) => r.input.versionId)).toEqual([
      'va',
      'vb',
      'vc',
    ]);
    for (const row of result.metricMatrix) {
      expect(row.values).toHaveLength(3);
    }
  });

  it('spofCount 由 findings 中 category==="spof" 計數推導', () => {
    // 造一個 spof：唯一主管帶 ≥2 名部屬（與 orgHealth.test 同模式）
    const spofData = makeOrgData({
      employees: [emp('sup'), emp('r1'), emp('r2')],
      groups: [group('dept', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-r1', {
          employeeId: 'r1',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        assignment('as-r2', {
          employeeId: 'r2',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
      ],
    });
    const noSpof = singleEmployeeOrg('solo');
    const result = buildScenarioComparison([
      toInput('with-spof', spofData),
      toInput('clean', noSpof),
    ]);
    const spofRow = result.metricMatrix.find((r) => r.key === 'spofCount')!;
    expect(spofRow.values[0]).toBe(1); // 一筆 spof
    expect(spofRow.values[1]).toBe(0);
  });

  it('functionsWithoutMembers / functionsWithoutLead 由 functionCoverage 推導', () => {
    // 空職能 + 無 lead 職能
    const data = makeOrgData({
      employees: [emp('m1'), emp('m2')],
      groups: [
        group('empty-fn', { code: 'FN-EMPTY', kind: 'function' }),
        group('nolead-fn', { code: 'FN-NOLEAD', kind: 'function' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a1', {
          employeeId: 'm1',
          groupId: 'nolead-fn',
          jobLevelId: 'j1',
          isPrimaryGroup: false,
        }),
        assignment('a2', {
          employeeId: 'm2',
          groupId: 'nolead-fn',
          jobLevelId: 'j1',
          isPrimaryGroup: false,
        }),
      ],
    });
    const result = buildScenarioComparison([toInput('v1', data)]);
    const byKey = new Map(result.metricMatrix.map((r) => [r.key, r.values]));
    expect(byKey.get('functionsWithoutMembers')![0]).toBe(1); // empty-fn
    expect(byKey.get('functionsWithoutLead')![0]).toBe(1); // nolead-fn
  });
});

describe('buildScenarioComparison — 入口 backfill（#5）', () => {
  /**
   * 驗證 service 入口統一做 backfillAssignmentLevels：
   * 即使呼叫端傳入「未 backfill 的 OrgData」（assignments 全無 level），
   * 仍能算出有意義的層級深度（maxDepth ≥ 1、perLevel 非空），
   * 而非退化成 0。
   *
   * 同時驗證 diff 端：兩邊都未 backfill 但結構相同 → modifiedAssignments 應為 0
   * （證明 diff 端也用 normalized 資料比較，而不是被「level: undefined → 補成 1」
   *   解讀成欄位變動）。
   */
  it('未 backfill 的兩個情境：health.depth 仍可推導；結構相同時 modifiedAssignments=0', () => {
    // 造一條兩層 chain：sup（頂層）→ r1（部屬），未顯式設 level
    function chainOrg(): OrgData {
      return makeOrgData({
        employees: [emp('sup'), emp('r1')],
        groups: [group('dept', { kind: 'department' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-sup', {
            employeeId: 'sup',
            groupId: 'dept',
            jobLevelId: 'j1',
          }),
          assignment('as-r1', {
            employeeId: 'r1',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ],
      });
    }

    // 健全性自證：fixtures 的 assignment 預設無 level
    const raw = chainOrg();
    expect(raw.assignments.every((a) => a.level == null)).toBe(true);

    const result = buildScenarioComparison([
      toInput('base', chainOrg(), '基準'),
      toInput('curr', chainOrg(), '提案'),
    ]);

    // health.depth 必須被推導出 ≥ 1（證明 service 入口跑了 backfill；
    // 否則某些路徑下會退化成 0）
    expect(result.scenarios[0].health.depth.maxDepth).toBeGreaterThanOrEqual(1);
    expect(result.scenarios[0].health.depth.perLevel.length).toBeGreaterThan(0);

    // 兩邊結構相同 → 不應誤判 modifiedAssignments
    // （證明 computeOrgDiff 拿到的是同一份 normalized data）
    expect(result.scenarios[1].diffSummary.modifiedAssignments).toBe(0);
    expect(result.scenarios[1].diffSummary.addedAssignments).toBe(0);
    expect(result.scenarios[1].diffSummary.removedAssignments).toBe(0);
  });
});

describe('buildScenarioComparison — 健全性', () => {
  it('scenarios[i].health 等同 buildOrgHealth(inputs[i].data)（不重算、不竄改）', () => {
    const a = singleEmployeeOrg('a');
    const b = singleEmployeeOrg('b');
    const result = buildScenarioComparison([
      toInput('va', a),
      toInput('vb', b),
    ]);
    expect(result.scenarios[0].health).toEqual(buildOrgHealth(a));
    expect(result.scenarios[1].health).toEqual(buildOrgHealth(b));
  });

  it('scenarios[i].input 保留輸入語意（versionId / label / data 經 backfill 後等同）', () => {
    const data = singleEmployeeOrg();
    const input = toInput('v1', data, '我的情境');
    const result = buildScenarioComparison([input]);
    expect(result.scenarios[0].input.versionId).toBe('v1');
    expect(result.scenarios[0].input.label).toBe('我的情境');
    // 入口統一做 backfillAssignmentLevels（idempotent）；
    // data 在語意上應與「backfill(原 data)」等同。
    expect(result.scenarios[0].input.data).toEqual(
      backfillAssignmentLevels(data),
    );
  });

  it('輸入若本身已 backfilled（assignments 均含 level），則 input.data 與原引用相同（純函式不深拷貝）', () => {
    // 顯式塞 level，使 backfillAssignmentLevels 走 idempotent early-return 路徑
    const data = makeOrgData({
      employees: [emp('e1')],
      groups: [group('dept', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('as-e1', {
          employeeId: 'e1',
          groupId: 'dept',
          jobLevelId: 'j1',
          level: 1,
        }),
      ],
    });
    const input = toInput('v1', data, '已 backfilled');
    const result = buildScenarioComparison([input]);
    // 已 backfilled → backfillAssignmentLevels 直接回原引用 → 透過 spread 賦回 input.data 仍為同一引用
    expect(result.scenarios[0].input.data).toBe(data);
  });
});
