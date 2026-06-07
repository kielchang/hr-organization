import {
  buildHealthDelta,
  buildOrgHealth,
  buildReadiness,
  compareOrgHealth,
  filterFindingsForEmployee,
  type OrgHealth,
  type OrgHealthFinding,
} from './orgHealth';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

/**
 * orgHealth.ts 純函式測試。對齊既有測試風格（functionCoverage.test / validators 重用），
 * 以 fixtures 工廠造最小資料，逐一覆蓋各指標與每個 finding 類別的命中/不命中與邊界。
 *
 * 約定：assignment 工廠預設 isPrimaryGroup=true、level 未設（會走 backfill）。
 * span/depth/spof/chain 皆以「主歸屬」（isPrimaryGroup===true）那筆為準。
 */

/** 造一筆主歸屬部門 + 一筆職級，省去重複樣板。 */
function baseGroupsAndLevels() {
  return {
    groups: [group('dept', { kind: 'department' })],
    jobLevels: [jobLevel('j1', 10)],
  };
}

describe('buildOrgHealth — span（管理幅度）', () => {
  it('directReports 計數正確、average/max/min/supervisorCount 與排序', () => {
    // sup 帶 2 名部屬、mgr 帶 1 名部屬 → entries 依 directReports 降冪
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [
        emp('sup'),
        emp('mgr'),
        emp('a'),
        emp('b'),
        emp('c'),
      ],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mgr', {
          employeeId: 'mgr',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
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
          supervisorIds: ['mgr'],
          primarySupervisorId: 'mgr',
        }),
        // c 由 sup 直接帶 → sup 共 mgr + a + c = 3
        assignment('as-c', {
          employeeId: 'c',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
      ],
    });
    const { span, summary } = buildOrgHealth(data);
    expect(span.entries.map((e) => [e.supervisor.id, e.directReports])).toEqual([
      ['sup', 3],
      ['mgr', 1],
    ]);
    expect(span.supervisorCount).toBe(2);
    expect(span.max).toBe(3);
    expect(span.min).toBe(1);
    expect(span.average).toBe(2); // (3 + 1) / 2
    expect(summary.supervisors).toBe(2);
    expect(summary.avgSpan).toBe(2);
  });

  it('只計 active：inactive 部屬不計入、inactive 主管的部屬整組不計入', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [
        emp('sup'),
        emp('liveReport'),
        emp('deadReport', { status: 'inactive' }),
        emp('deadSup', { status: 'inactive' }),
        emp('orphanOfDeadSup'),
      ],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        // 活部屬 → 計入 sup
        assignment('as-live', {
          employeeId: 'liveReport',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        // inactive 部屬 → 不計入 sup
        assignment('as-dead', {
          employeeId: 'deadReport',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        // 部屬指向 inactive 主管 → 該主管完全不出現在 entries
        assignment('as-orphan', {
          employeeId: 'orphanOfDeadSup',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['deadSup'],
          primarySupervisorId: 'deadSup',
        }),
      ],
    });
    const { span } = buildOrgHealth(data);
    expect(span.entries.map((e) => e.supervisor.id)).toEqual(['sup']);
    expect(span.entries[0].directReports).toBe(1); // 只有 liveReport
    expect(span.entries.some((e) => e.supervisor.id === 'deadSup')).toBe(false);
  });

  it('wide/narrow 分類與門檻邊界：剛好等於門檻不算 wide、超過才算', () => {
    // sup 帶 8 名部屬（==預設門檻 8）→ 不算 wide
    const reports = Array.from({ length: 8 }, (_, i) => `r${i}`);
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), ...reports.map((id) => emp(id))],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        ...reports.map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ),
      ],
    });
    const atThreshold = buildOrgHealth(data);
    expect(atThreshold.span.entries[0].directReports).toBe(8);
    expect(atThreshold.span.wide).toEqual([]); // 8 不 > 8
    expect(atThreshold.findings.some((f) => f.id === 'span-wide:sup')).toBe(false);

    // 再加 1 名 → 9 > 8 → 算 wide
    const data9 = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), ...reports.map((id) => emp(id)), emp('r8')],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        ...[...reports, 'r8'].map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ),
      ],
    });
    const overThreshold = buildOrgHealth(data9);
    expect(overThreshold.span.wide.map((e) => e.supervisor.id)).toEqual(['sup']);
    expect(overThreshold.findings.some((f) => f.id === 'span-wide:sup')).toBe(true);
  });

  it('narrow：剛好 1 名部屬算 narrow、2 名不算', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('one'), emp('r1'), emp('two'), emp('r2'), emp('r3')],
      assignments: [
        assignment('as-one', { employeeId: 'one', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-r1', {
          employeeId: 'r1',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['one'],
          primarySupervisorId: 'one',
        }),
        assignment('as-two', { employeeId: 'two', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-r2', {
          employeeId: 'r2',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['two'],
          primarySupervisorId: 'two',
        }),
        assignment('as-r3', {
          employeeId: 'r3',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['two'],
          primarySupervisorId: 'two',
        }),
      ],
    });
    const { span, findings } = buildOrgHealth(data);
    expect(span.narrow.map((e) => e.supervisor.id)).toEqual(['one']);
    expect(findings.some((f) => f.id === 'span-narrow:one')).toBe(true);
    expect(findings.some((f) => f.id === 'span-narrow:two')).toBe(false);
  });

  it('自訂 wideSpanThreshold：門檻=2 時 3 名部屬即過寬', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), emp('a'), emp('b'), emp('c')],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        ...['a', 'b', 'c'].map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ),
      ],
    });
    const { span, findings } = buildOrgHealth(data, { wideSpanThreshold: 2 });
    expect(span.wide.map((e) => e.supervisor.id)).toEqual(['sup']);
    // 訊息應帶入自訂門檻 2
    const wideFinding = findings.find((f) => f.id === 'span-wide:sup');
    expect(wideFinding?.message).toContain('超過 2');
  });

  it('無任何主管時 span 全為 0、無 entries', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('solo')],
      assignments: [
        assignment('as-solo', { employeeId: 'solo', groupId: 'dept', jobLevelId: 'j1' }),
      ],
    });
    const { span, summary } = buildOrgHealth(data);
    expect(span.entries).toEqual([]);
    expect(span.average).toBe(0);
    expect(span.max).toBe(0);
    expect(span.min).toBe(0);
    expect(span.supervisorCount).toBe(0);
    expect(summary.avgSpan).toBe(0);
  });
});

describe('buildOrgHealth — depth（層級深度）', () => {
  it('maxDepth 與 perLevel 依各員工主歸屬有效層級計數（缺 level → 計算深度）', () => {
    // 不顯式給 level → effectiveLevel 退回 computePrimaryDepth（主匯報深度）：
    // root 第1層、mid 第2層、leaf 第3層
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('root'), emp('mid'), emp('leaf')],
      assignments: [
        assignment('as-root', { employeeId: 'root', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mid', {
          employeeId: 'mid',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['root'],
          primarySupervisorId: 'root',
        }),
        assignment('as-leaf', {
          employeeId: 'leaf',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
      ],
    });
    const { depth, summary } = buildOrgHealth(data);
    expect(depth.perLevel).toEqual([
      { level: 1, count: 1 },
      { level: 2, count: 1 },
      { level: 3, count: 1 },
    ]);
    expect(depth.maxDepth).toBe(3);
    expect(summary.maxDepth).toBe(3);
  });

  it('已顯式給 level（覆寫）時優先採用、同層多人正確累加', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('a'), emp('b'), emp('c')],
      assignments: [
        assignment('as-a', { employeeId: 'a', groupId: 'dept', jobLevelId: 'j1', level: 1 }),
        assignment('as-b', { employeeId: 'b', groupId: 'dept', jobLevelId: 'j1', level: 2 }),
        assignment('as-c', { employeeId: 'c', groupId: 'dept', jobLevelId: 'j1', level: 2 }),
      ],
    });
    const { depth } = buildOrgHealth(data);
    expect(depth.perLevel).toEqual([
      { level: 1, count: 1 },
      { level: 2, count: 2 },
    ]);
    expect(depth.maxDepth).toBe(2);
  });

  it('深度過深 finding：maxDepth>6 給 info；==6 不給', () => {
    // 造一條 7 層的線性匯報鏈 → maxDepth 7 > 6
    const chain = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'];
    const deep = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: chain.map((id) => emp(id)),
      assignments: chain.map((id, i) =>
        assignment(`as-${id}`, {
          employeeId: id,
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: i === 0 ? [] : [chain[i - 1]],
          primarySupervisorId: i === 0 ? null : chain[i - 1],
        }),
      ),
    });
    const deepHealth = buildOrgHealth(deep);
    expect(deepHealth.depth.maxDepth).toBe(7);
    const depthFinding = deepHealth.findings.find((f) => f.id === 'depth-deep');
    expect(depthFinding?.severity).toBe('info');
    expect(depthFinding?.category).toBe('depth');

    // 只取 6 層 → maxDepth 6，不觸發
    const chain6 = chain.slice(0, 6);
    const ok = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: chain6.map((id) => emp(id)),
      assignments: chain6.map((id, i) =>
        assignment(`as-${id}`, {
          employeeId: id,
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: i === 0 ? [] : [chain6[i - 1]],
          primarySupervisorId: i === 0 ? null : chain6[i - 1],
        }),
      ),
    });
    const okHealth = buildOrgHealth(ok);
    expect(okHealth.depth.maxDepth).toBe(6);
    expect(okHealth.findings.some((f) => f.id === 'depth-deep')).toBe(false);
  });

  it('含虛線/次要 supervisorIds 且全無 level → depth 只沿主匯報，不被虛線污染', () => {
    // 主匯報結構（primarySupervisorId）：root(第1) → mid(第2)；leaf 主匯報直接掛 root（第2）。
    // 另給 leaf 一條「虛線」掛到 mid（次要 supervisorId）。
    //
    // 舊行為（被 backfillAssignmentLevels 污染、走 per-group/全部 supervisorIds）：
    //   leaf 深度 = max(root=1, mid=2)+1 = 3 → backfill 把 level 補成 3，
    //   effectiveLevel 的 ?? 短路在 level → depthMap 永不採用 → maxDepth=3（污染值）。
    // 修補後（不 backfill、只走 primarySupervisorId）：
    //   leaf 只看 primary=root → 第2層；root=第1層、mid=第2層 → maxDepth=2、第2層 2 人。
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('root'), emp('mid'), emp('leaf')],
      assignments: [
        assignment('as-root', { employeeId: 'root', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mid', {
          employeeId: 'mid',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['root'],
          primarySupervisorId: 'root',
        }),
        assignment('as-leaf', {
          employeeId: 'leaf',
          groupId: 'dept',
          jobLevelId: 'j1',
          // 主匯報＝root（→第2層）；虛線額外掛 mid（次要）→ 舊 max 路徑會被拉深到第3層。
          supervisorIds: ['root', 'mid'],
          primarySupervisorId: 'root',
        }),
      ],
    });
    // 健全性自證：fixtures 全無 level（證明走計算深度而非覆寫）。
    expect(data.assignments.every((a) => a.level == null)).toBe(true);

    const { depth, summary } = buildOrgHealth(data);
    // 真實主匯報深度：root=第1層；mid 與 leaf 皆直屬 root → 同為第2層（共 2 人）。
    // 若仍被舊 backfill 污染，leaf 會被虛線拉到第3層、maxDepth=3 → 本斷言會 fail。
    expect(depth.perLevel).toEqual([
      { level: 1, count: 1 },
      { level: 2, count: 2 },
    ]);
    expect(depth.maxDepth).toBe(2);
    expect(summary.maxDepth).toBe(2);
  });
});

describe('buildOrgHealth — function findings（職能覆蓋）', () => {
  it('無成員職能 → function-no-members（warning）；有成員無 lead → function-no-lead（warning）', () => {
    const data = makeOrgData({
      employees: [emp('m1'), emp('m2')],
      groups: [
        group('empty-fn', { code: 'FN-EMPTY', name: '空職能', kind: 'function' }),
        group('lead-less-fn', { code: 'FN-NOLEAD', name: '無頭職能', kind: 'function' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        // 無頭職能有 2 名成員，皆無 primarySupervisorId（非主歸屬，避免污染 chain）
        assignment('a1', {
          employeeId: 'm1',
          groupId: 'lead-less-fn',
          jobLevelId: 'j1',
          isPrimaryGroup: false,
        }),
        assignment('a2', {
          employeeId: 'm2',
          groupId: 'lead-less-fn',
          jobLevelId: 'j1',
          isPrimaryGroup: false,
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    const noMembers = findings.find((f) => f.id === 'function-no-members:empty-fn');
    expect(noMembers?.severity).toBe('warning');
    expect(noMembers?.groupId).toBe('empty-fn');
    const noLead = findings.find((f) => f.id === 'function-no-lead:lead-less-fn');
    expect(noLead?.severity).toBe('warning');
    expect(noLead?.groupId).toBe('lead-less-fn');
  });

  it('職能有 lead（成員帶 primarySupervisorId）→ 不報 no-lead', () => {
    const data = makeOrgData({
      employees: [emp('lead'), emp('member')],
      groups: [group('fn', { code: 'FN', name: '有頭職能', kind: 'function' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a-lead', {
          employeeId: 'lead',
          groupId: 'fn',
          jobLevelId: 'j1',
          isPrimaryGroup: false,
        }),
        assignment('a-member', {
          employeeId: 'member',
          groupId: 'fn',
          jobLevelId: 'j1',
          supervisorIds: ['lead'],
          primarySupervisorId: 'lead',
          isPrimaryGroup: false,
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    expect(findings.some((f) => f.category === 'function' && f.id.startsWith('function-no-lead')))
      .toBe(false);
  });

  it('跨職能高負載：functionCount>=3 給 info（function-cross-load），<3 不給', () => {
    const data = makeOrgData({
      employees: [emp('busy', { name: '甲' }), emp('light', { name: '乙' })],
      groups: [
        group('fa', { code: 'FN-A', name: 'A職能', kind: 'function' }),
        group('fb', { code: 'FN-B', name: 'B職能', kind: 'function' }),
        group('fc', { code: 'FN-C', name: 'C職能', kind: 'function' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        // busy 跨 3 職能 → 觸發 info
        assignment('a1', { employeeId: 'busy', groupId: 'fa', jobLevelId: 'j1', isPrimaryGroup: false }),
        assignment('a2', { employeeId: 'busy', groupId: 'fb', jobLevelId: 'j1', isPrimaryGroup: false }),
        assignment('a3', { employeeId: 'busy', groupId: 'fc', jobLevelId: 'j1', isPrimaryGroup: false }),
        // light 跨 2 職能 → 不觸發
        assignment('a4', { employeeId: 'light', groupId: 'fa', jobLevelId: 'j1', isPrimaryGroup: false }),
        assignment('a5', { employeeId: 'light', groupId: 'fb', jobLevelId: 'j1', isPrimaryGroup: false }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    const crossLoad = findings.find((f) => f.id === 'function-cross-load:busy');
    expect(crossLoad?.severity).toBe('info');
    expect(crossLoad?.employeeId).toBe('busy');
    expect(findings.some((f) => f.id === 'function-cross-load:light')).toBe(false);
  });
});

describe('buildOrgHealth — chain findings（斷鏈）', () => {
  it('孤兒（無任何歸屬）→ chain-orphan（warning）', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('boss'), emp('orphan')],
      assignments: [
        assignment('as-boss', { employeeId: 'boss', groupId: 'dept', jobLevelId: 'j1' }),
        // orphan 完全沒有 assignment
      ],
    });
    const { findings } = buildOrgHealth(data);
    const orphan = findings.find((f) => f.id === 'chain-orphan:orphan');
    expect(orphan?.severity).toBe('warning');
    expect(orphan?.category).toBe('chain');
    expect(orphan?.employeeId).toBe('orphan');
    // 有歸屬的 boss 不應是孤兒
    expect(findings.some((f) => f.id === 'chain-orphan:boss')).toBe(false);
  });

  it('懸空主管（主管 inactive）→ chain-dangling（warning），訊息帶主管姓名', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('deadBoss', { status: 'inactive', name: '離職主管' }), emp('report')],
      assignments: [
        assignment('as-dead', { employeeId: 'deadBoss', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-report', {
          employeeId: 'report',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['deadBoss'],
          primarySupervisorId: 'deadBoss',
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    const dangling = findings.find((f) => f.id === 'chain-dangling:report');
    expect(dangling?.severity).toBe('warning');
    expect(dangling?.category).toBe('chain');
    expect(dangling?.message).toContain('離職主管');
  });

  it('懸空主管（主管不存在）→ chain-dangling，訊息帶主管 ID', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('report')],
      assignments: [
        assignment('as-report', {
          employeeId: 'report',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['ghostBoss'],
          primarySupervisorId: 'ghostBoss',
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    const dangling = findings.find((f) => f.id === 'chain-dangling:report');
    expect(dangling?.message).toContain('ghostBoss');
  });

  it('正常匯報線（主管 active）→ 不報 chain', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('boss'), emp('report')],
      assignments: [
        assignment('as-boss', { employeeId: 'boss', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-report', {
          employeeId: 'report',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    expect(findings.some((f) => f.category === 'chain')).toBe(false);
  });
});

describe('buildOrgHealth — cycle findings（匯報循環，重用 validators）', () => {
  it('造一個循環 → 至少一筆 cycle finding（warning）', () => {
    // a → b → a 互為主管，形成循環
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('a'), emp('b')],
      assignments: [
        assignment('as-a', {
          employeeId: 'a',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['b'],
          primarySupervisorId: 'b',
        }),
        assignment('as-b', {
          employeeId: 'b',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    const cycleFindings = findings.filter((f) => f.category === 'cycle');
    expect(cycleFindings.length).toBeGreaterThanOrEqual(1);
    expect(cycleFindings[0].id).toBe('cycle:0');
    expect(cycleFindings[0].severity).toBe('warning');
    expect(cycleFindings[0].message).toContain('循環');
  });

  it('無循環 → 無 cycle finding', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('a'), emp('b')],
      assignments: [
        assignment('as-a', { employeeId: 'a', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-b', {
          employeeId: 'b',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    expect(findings.some((f) => f.category === 'cycle')).toBe(false);
  });
});

describe('buildOrgHealth — spof findings（單點風險）', () => {
  it('唯一主管帶 ≥2 名部屬 → spof（warning），訊息含影響人數', () => {
    // sup 是 r1、r2 的唯一主管（supervisorIds 僅含 sup、無備援）
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup', { name: '關鍵主管' }), emp('r1'), emp('r2')],
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
    const { findings } = buildOrgHealth(data);
    const spof = findings.find((f) => f.id === 'spof:sup');
    expect(spof?.severity).toBe('warning');
    expect(spof?.category).toBe('spof');
    expect(spof?.employeeId).toBe('sup');
    expect(spof?.message).toContain('2 名部屬'); // 影響人數
    expect(spof?.message).toContain('關鍵主管');
  });

  it('唯一主管僅 1 名部屬 → 不報（避免噪音）', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), emp('r1')],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-r1', {
          employeeId: 'r1',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    expect(findings.some((f) => f.category === 'spof')).toBe(false);
  });

  it('部屬有備援主管（supervisorIds 含多人）→ 非單點，不報 spof', () => {
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), emp('backup'), emp('r1'), emp('r2')],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-backup', { employeeId: 'backup', groupId: 'dept', jobLevelId: 'j1' }),
        // 兩名部屬皆同時掛 sup + backup → 有備援
        assignment('as-r1', {
          employeeId: 'r1',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup', 'backup'],
          primarySupervisorId: 'sup',
        }),
        assignment('as-r2', {
          employeeId: 'r2',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup', 'backup'],
          primarySupervisorId: 'sup',
        }),
      ],
    });
    const { findings } = buildOrgHealth(data);
    expect(findings.some((f) => f.category === 'spof')).toBe(false);
  });
});

describe('buildOrgHealth — 組別↔主管一致性（Phase F）', () => {
  /**
   * Phase F 三規則（皆刻意排除合法 co-lead 平行共管，避免誤報）：
   *  1. parallel-colead（info）：每組每位推導 co-leader 一筆「與組長平行共管」，不扣 readiness。
   *  2. group-mismatch（warning, id=group-mismatch:…）：assignment 的 primarySupervisor
   *     不在該組、且非該組推導 co-leader、非 leader → 「主管不屬於該組」。
   *  3. 層級異常（warning, category=group-mismatch, id=level-anomaly:…）：組內主管但
   *     effectiveLevel(成員) <= effectiveLevel(主管) → 「層級異常」；排除 co-lead 平行。
   *
   * 領導推導（leaderId/coLeaderIds）重用 deriveAllGroupLeadership（見 groupLeadership.test）。
   * 此處聚焦「finding 是否正確產出/抑制」與「掛在哪個 readiness 維度」。
   */

  /** 由 findings 取出 category 集合，便於斷言「有/無某類」。 */
  function categoriesOf(findings: OrgHealthFinding[]): string[] {
    return findings.map((f) => f.category);
  }

  describe('規則 1：parallel-colead（info、合法平行共管、不扣 readiness）', () => {
    it('組長在組內 + 組外主管帶部分成員（夠格）→ 該組外主管出 parallel-colead(info)，readiness 不下降', () => {
      // sales 組：leaderId=ceo（組外高管，但設為組長）；s1/s2 主管 ceo（=leaderId，不算 co-lead）；
      // s3 主管 coo（組外、非 leaderId、夠格）→ coo 為推導 co-leader → 出一筆 parallel-colead(info)。
      // co-lead 收緊後：coo 須「夠格」。此處 coo 是 exec 組 leaderId（path b）→ 夠格。
      const data = makeOrgData({
        employees: [
          emp('ceo', { name: '執行長' }),
          emp('coo', { name: '營運長' }),
          emp('s1'),
          emp('s2'),
          emp('s3'),
        ],
        groups: [
          group('sales', { kind: 'department', name: '業務部', leaderId: 'ceo' }),
          group('exec', { kind: 'department', name: '高管組', leaderId: 'coo' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          // ceo/coo 本人歸屬 exec（不在 sales 成員集合內）。
          assignment('as-ceo', { employeeId: 'ceo', groupId: 'exec', jobLevelId: 'j1' }),
          assignment('as-coo', {
            employeeId: 'coo',
            groupId: 'exec',
            jobLevelId: 'j1',
            supervisorIds: ['ceo'],
            primarySupervisorId: 'ceo',
          }),
          // sales 成員：s1/s2 主管 ceo（=leaderId）。
          assignment('as-s1', {
            employeeId: 's1',
            groupId: 'sales',
            jobLevelId: 'j1',
            supervisorIds: ['ceo'],
            primarySupervisorId: 'ceo',
          }),
          assignment('as-s2', {
            employeeId: 's2',
            groupId: 'sales',
            jobLevelId: 'j1',
            supervisorIds: ['ceo'],
            primarySupervisorId: 'ceo',
          }),
          // s3 主管 coo（組外、非 leaderId）→ coo 為 co-leader。
          assignment('as-s3', {
            employeeId: 's3',
            groupId: 'sales',
            jobLevelId: 'j1',
            supervisorIds: ['coo'],
            primarySupervisorId: 'coo',
          }),
        ],
      });
      const health = buildOrgHealth(data);

      // coo 出一筆 parallel-colead(info)，指向 coo 與 sales 組。
      const parallel = health.findings.find(
        (f) => f.id === 'parallel-colead:sales:coo',
      );
      expect(parallel?.severity).toBe('info');
      expect(parallel?.category).toBe('parallel-colead');
      expect(parallel?.employeeId).toBe('coo');
      expect(parallel?.groupId).toBe('sales');
      expect(parallel?.message).toContain('平行共管');
      expect(parallel?.message).toContain('業務部');

      // 關鍵：co-lead 平行不得被誤報為 group-mismatch（s3 主管 coo 是 sales 推導 co-leader）。
      expect(
        health.findings.some((f) => f.id === 'group-mismatch:sales:s3'),
      ).toBe(false);

      // readiness 關鍵不變式：parallel-colead 不屬任何維度 → structure 維完全不受影響。
      // （此 fixture 另有 span-narrow(info)/spof(warning) 等與 Phase F 無關的 finding，
      //  會影響 span/keyPerson 維與 total；故只精準斷言「parallel-colead 不扣分」的結構維。）
      const r = buildReadiness(health);
      const byKey = Object.fromEntries(r.dimensions.map((d) => [d.key, d]));
      expect(byKey.structure.score).toBe(100); // 未被 parallel-colead 扣分
      expect(byKey.structure.findingCount).toBe(0); // parallel-colead 不計入 structure

      // 直接守門：parallel-colead 這筆 finding 不存在於任何 readiness 維度的計分集合內。
      const PARALLEL = health.findings.find(
        (f) => f.category === 'parallel-colead',
      );
      expect(PARALLEL).toBeDefined();
      // 移除 parallel-colead 後重算 readiness → total 完全不變（證明它對就緒度零影響）。
      const withoutParallel: OrgHealth = {
        ...health,
        findings: health.findings.filter((f) => f.category !== 'parallel-colead'),
      };
      expect(buildReadiness(withoutParallel).total).toBe(r.total);
    });

    it('parallel-colead 不計入 warningCount（severity=info）', () => {
      // 同上最小化：只要有一筆 co-leader 即可。確認 info 不污染 warningCount。
      const data = makeOrgData({
        employees: [emp('ceo'), emp('coo'), emp('s1')],
        groups: [
          group('sales', { name: '業務部', leaderId: 'ceo' }),
          group('exec', { name: '高管組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-ceo', { employeeId: 'ceo', groupId: 'exec', jobLevelId: 'j1' }),
          assignment('as-coo', { employeeId: 'coo', groupId: 'exec', jobLevelId: 'j1' }),
          assignment('as-s1', {
            employeeId: 's1',
            groupId: 'sales',
            jobLevelId: 'j1',
            supervisorIds: ['coo'],
            primarySupervisorId: 'coo',
          }),
          // 補一名 ceo 帶的 sales 成員，讓 leaderId=ceo 有意義（否則組內匯報根推導不影響本斷言）。
          assignment('as-s0', {
            employeeId: 'ceo',
            groupId: 'sales',
            jobLevelId: 'j1',
            isPrimaryGroup: false,
          }),
        ],
      });
      const { findings, summary } = buildOrgHealth(data);
      expect(findings.some((f) => f.category === 'parallel-colead')).toBe(true);
      // parallel-colead 全為 info → 不進 warningCount。
      const warnings = findings.filter((f) => f.severity === 'warning');
      expect(summary.warningCount).toBe(warnings.length);
      expect(findings.some((f) => f.category === 'parallel-colead' && f.severity !== 'info')).toBe(false);
    });

    it('組長本人（組內）上報組外夠格主管 S → 不產生指向 S 的 parallel-colead，也不誤報 group-mismatch（規則 2 對稱排除組長本人）', () => {
      // teamA：leaderId=L（在組內）。L 自己的 primary 主管 S 在組外（exec）、且夠格（exec leaderId）。
      // 收緊後 deriveGroupLeadership 略過組長本人那筆 → S 不被推成 co-leader → 規則 1 不產生
      // parallel-colead:teamA:S（L 上報 S 是正常上行匯報，非平行共管）。
      //
      // 規則 2 對稱排除（已落地）：當 assignment 的成員本人即本組組長（leaderId === a.employeeId）時，
      // 其組外上級主管屬「正常上行匯報」，不視為掛錯組 → 不產生 group-mismatch:teamA:L。
      // 即「組長往上報組外上級主管」既非平行共管（規則 1 略過），也非掛錯組（規則 2 排除）。
      const teamA = group('teamA', { name: 'A組', leaderId: 'L' });
      const data = makeOrgData({
        employees: [emp('L'), emp('S'), emp('m')],
        groups: [teamA, group('exec', { name: '高管組', leaderId: 'S' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          // 組長 L 在 teamA、上報組外夠格主管 S。
          assignment('as-L', {
            employeeId: 'L',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['S'],
            primarySupervisorId: 'S',
          }),
          assignment('as-S', { employeeId: 'S', groupId: 'exec', jobLevelId: 'j1' }),
          // 非組長成員 m 報組內 L（不觸發 co-lead）。
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['L'],
            primarySupervisorId: 'L',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      // 關鍵 1：S 不被推成 co-leader → 無指向 S 的 parallel-colead。
      expect(findings.some((f) => f.id === 'parallel-colead:teamA:S')).toBe(false);
      expect(findings.some((f) => f.category === 'parallel-colead')).toBe(false);
      // 關鍵 2：組長 L 的組外上級主管 S 屬正常上行匯報 → 規則 2 對稱排除 → 不產生 group-mismatch:teamA:L。
      expect(findings.some((f) => f.id === 'group-mismatch:teamA:L')).toBe(false);
      // 對 leaderId(L) 之 assignment 不應有任何 group-mismatch / level-anomaly（兩者同 category）。
      expect(
        findings.some(
          (f) => f.category === 'group-mismatch' && f.employeeId === 'L',
        ),
      ).toBe(false);
    });
  });

  describe('規則 2：group-mismatch（warning、主管完全在組外）', () => {
    /**
     * 重要實作觀察（co-lead 收緊後更新）：規則 2 的可達性取決於組外主管 s 是否「夠格」。
     *
     * 規則 2 對每筆 assignment 看其 primarySupervisorId=s 是否「在組外」。co-leader 收緊後，
     * s 只有「夠格（isLeadLevel）」才被推成 co-leader：
     *   - s 在組外、≠ leaderId、**且夠格**（主歸屬無上級／s 是某組 leaderId）
     *     → s 被推成 co-leader → sIsCoLeader=true → 規則 2 跳過（改報 parallel-colead/info）。
     *   - s 在組外、≠ leaderId、**但不夠格**（有上級且非任何組長＝掛錯組）
     *     → s **不**是 co-leader → 規則 2 命中 → group-mismatch(warning)。【收緊後新可達】
     *   - s === leaderId → sIsLeader=true → 規則 2 跳過。
     *
     * 即：「夠格」跨組主管視為合法平行共管（parallel-colead/info、不扣分）；
     * 「不夠格」跨組主管視為掛錯組（group-mismatch/warning、扣 structure 維）。
     * 以下測試同時守護兩半：夠格 → 豁免改報 parallel-colead；不夠格 → 命中 group-mismatch。
     */

    it('成員主管在組外、≠ leaderId、且「不夠格」（有上級且非任何組長）→ group-mismatch(warning)、扣 structure 維【收緊後可達正案例】', () => {
      // teamA：leaderId=lead（組內）。成員 m 的 primary 主管 midMgr 在 teamB。
      // midMgr 主歸屬掛 topBoss 為上級、且非任何組 leaderId → isLeadLevel=false（不夠格）。
      // → midMgr 不被推成 teamA co-leader → 規則 2 命中 → group-mismatch:teamA:m(warning)。
      const data = makeOrgData({
        employees: [emp('lead'), emp('topBoss'), emp('midMgr', { name: '中階' }), emp('m', { name: '小明' })],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'lead' }),
          group('teamB', { name: 'B組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-lead', { employeeId: 'lead', groupId: 'teamA', jobLevelId: 'j1' }),
          assignment('as-top', { employeeId: 'topBoss', groupId: 'teamB', jobLevelId: 'j1' }),
          // midMgr 在 teamB、主歸屬掛 topBoss（有上級）→ 不夠格。
          assignment('as-mid', {
            employeeId: 'midMgr',
            groupId: 'teamB',
            jobLevelId: 'j1',
            supervisorIds: ['topBoss'],
            primarySupervisorId: 'topBoss',
          }),
          // teamA 成員 m 的組外 primary 主管 = midMgr（不夠格）。
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['midMgr'],
            primarySupervisorId: 'midMgr',
          }),
        ],
      });
      const health = buildOrgHealth(data);
      // 命中 group-mismatch(warning)，訊息指出主管不屬本組。
      const mismatch = health.findings.find((f) => f.id === 'group-mismatch:teamA:m');
      expect(mismatch?.severity).toBe('warning');
      expect(mismatch?.category).toBe('group-mismatch');
      expect(mismatch?.employeeId).toBe('m');
      expect(mismatch?.groupId).toBe('teamA');
      expect(mismatch?.message).toContain('不屬於');
      expect(mismatch?.message).toContain('A組');
      // 不夠格 → 不被當 co-lead → 不報 parallel-colead 指向 midMgr。
      expect(health.findings.some((f) => f.id === 'parallel-colead:teamA:midMgr')).toBe(false);
      // 掛 structure 維（group-mismatch category）→ structure 自 100 扣 15。
      const r = buildReadiness(health);
      const byKey = Object.fromEntries(r.dimensions.map((d) => [d.key, d]));
      expect(byKey.structure.findingCount).toBeGreaterThanOrEqual(1);
      expect(byKey.structure.score).toBeLessThanOrEqual(100 - 15);
    });

    it('成員主管在組外且 ≠ leaderId、但「夠格」（主歸屬無上級）→ 推成 co-leader → 豁免 group-mismatch、改報 parallel-colead(info)', () => {
      // teamA：leaderId=lead（組內）；m 的主管 outsider 在 teamB。
      // outsider 主歸屬無上級（primarySupervisorId 預設 null）→ isLeadLevel=true（夠格 path a）。
      // outsider 是 teamA 成員 m 的組外 primary 主管、≠ lead、夠格 → 推成 co-leader → 規則 2 跳過。
      const data = makeOrgData({
        employees: [emp('lead'), emp('outsider'), emp('m')],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'lead' }),
          group('teamB', { name: 'B組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-lead', { employeeId: 'lead', groupId: 'teamA', jobLevelId: 'j1' }),
          assignment('as-outsider', { employeeId: 'outsider', groupId: 'teamB', jobLevelId: 'j1' }),
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['outsider'],
            primarySupervisorId: 'outsider',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      // 改報 parallel-colead(info)，不報 group-mismatch(warning)。
      expect(findings.some((f) => f.id === 'parallel-colead:teamA:outsider')).toBe(true);
      expect(findings.some((f) => f.id === 'group-mismatch:teamA:m')).toBe(false);
    });

    it('成員主管在組外且 = 該組 leaderId → 視為 leader，不報 group-mismatch、亦不報 parallel-colead', () => {
      // leaderId=ceo（組外）；成員 m 主管 ceo → sIsLeader=true → 規則 2 跳過；
      // ceo 為 leaderId → co-leader 推導排除 → 無 parallel-colead 指向 ceo。
      const data = makeOrgData({
        employees: [emp('ceo'), emp('m')],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'ceo' }),
          group('exec', { name: '高管組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-ceo', { employeeId: 'ceo', groupId: 'exec', jobLevelId: 'j1' }),
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['ceo'],
            primarySupervisorId: 'ceo',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.id === 'group-mismatch:teamA:m')).toBe(false);
      expect(findings.some((f) => f.id === 'parallel-colead:teamA:ceo')).toBe(false);
    });

    it('多名成員掛同一組外主管 → 一律豁免 group-mismatch（co-lead 守門）', () => {
      // a、b 皆掛組外 extBoss → extBoss 成 teamA co-leader（≠ leaderId）→ 兩人皆豁免。
      const data = makeOrgData({
        employees: [emp('lead'), emp('extBoss'), emp('a'), emp('b')],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'lead' }),
          group('other', { name: '其他組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-lead', { employeeId: 'lead', groupId: 'teamA', jobLevelId: 'j1' }),
          assignment('as-ext', { employeeId: 'extBoss', groupId: 'other', jobLevelId: 'j1' }),
          assignment('as-a', {
            employeeId: 'a',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['extBoss'],
            primarySupervisorId: 'extBoss',
          }),
          assignment('as-b', {
            employeeId: 'b',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['extBoss'],
            primarySupervisorId: 'extBoss',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.id === 'parallel-colead:teamA:extBoss')).toBe(true);
      expect(findings.some((f) => f.id.startsWith('group-mismatch:teamA'))).toBe(false);
    });

    it('組長本人豁免是「對稱、外科式」的：同組非組長成員掛不夠格組外主管 → 仍正確報 group-mismatch（排除沒誤殺整條規則）', () => {
      // 同一 teamA 內並置兩種情形，確認規則 2 的組長排除只豁免「組長本人那筆」、不外溢到其他成員：
      //   (a) 組長 L 上報組外夠格主管 S（S 是 exec leaderId）→ L 那筆豁免（不報 group-mismatch:teamA:L）。
      //   (b) 非組長成員 m 上報組外「不夠格」主管 midMgr（有上級 topBoss、且非任何組 leaderId）
      //       → midMgr 不被推成 co-leader、m≠leaderId → 規則 2 仍命中 → group-mismatch:teamA:m(warning)。
      // 此案是排除落地後「正向命中」的回歸守護：若實作誤把排除放寬到所有成員，(b) 會被漏報而 fail。
      const data = makeOrgData({
        employees: [
          emp('L', { name: '組長' }),
          emp('S', { name: '上級高管' }),
          emp('topBoss'),
          emp('midMgr', { name: '中階' }),
          emp('m', { name: '小明' }),
        ],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'L' }),
          group('exec', { name: '高管組', leaderId: 'S' }),
          group('teamB', { name: 'B組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          // (a) 組長 L 上報組外夠格主管 S。
          assignment('as-L', {
            employeeId: 'L',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['S'],
            primarySupervisorId: 'S',
          }),
          assignment('as-S', { employeeId: 'S', groupId: 'exec', jobLevelId: 'j1' }),
          // midMgr 在 teamB、主歸屬掛 topBoss（有上級）、非任何組長 → 不夠格。
          assignment('as-top', { employeeId: 'topBoss', groupId: 'teamB', jobLevelId: 'j1' }),
          assignment('as-mid', {
            employeeId: 'midMgr',
            groupId: 'teamB',
            jobLevelId: 'j1',
            supervisorIds: ['topBoss'],
            primarySupervisorId: 'topBoss',
          }),
          // (b) 非組長成員 m（teamA）上報組外不夠格主管 midMgr。
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['midMgr'],
            primarySupervisorId: 'midMgr',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      // (a) 組長本人那筆被豁免：不報 group-mismatch:teamA:L。
      expect(findings.some((f) => f.id === 'group-mismatch:teamA:L')).toBe(false);
      // (b) 非組長成員 m 仍正確命中：規則沒被排除誤殺。
      const mismatch = findings.find((f) => f.id === 'group-mismatch:teamA:m');
      expect(mismatch?.severity).toBe('warning');
      expect(mismatch?.category).toBe('group-mismatch');
      expect(mismatch?.employeeId).toBe('m');
    });
  });

  describe('規則 3：層級異常（warning、category=group-mismatch、組內主管但部屬未低於主管）', () => {
    it('level 覆寫造成部屬 level <= 主管 level → level-anomaly(warning)、掛 structure 維', () => {
      // boss、staff 同組；staff 主管 boss（組內）。
      // 顯式覆寫：boss level=2、staff level=2 → memberLevel(2) <= supLevel(2) → 層級異常。
      const data = makeOrgData({
        employees: [emp('boss', { name: '主管' }), emp('staff', { name: '部屬' })],
        groups: [group('dept', { kind: 'department', name: '部門' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-boss', {
            employeeId: 'boss',
            groupId: 'dept',
            jobLevelId: 'j1',
            level: 2,
          }),
          assignment('as-staff', {
            employeeId: 'staff',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
            level: 2, // 與主管同層 → 異常
          }),
        ],
      });
      const health = buildOrgHealth(data);
      const anomaly = health.findings.find(
        (f) => f.id === 'level-anomaly:dept:staff',
      );
      expect(anomaly?.severity).toBe('warning');
      expect(anomaly?.category).toBe('group-mismatch');
      expect(anomaly?.employeeId).toBe('staff');
      expect(anomaly?.groupId).toBe('dept');
      expect(anomaly?.message).toContain('層級異常');

      // 掛 structure 維（group-mismatch category）→ structure 扣 15。
      const r = buildReadiness(health);
      const byKey = Object.fromEntries(r.dimensions.map((d) => [d.key, d]));
      expect(byKey.structure.findingCount).toBeGreaterThanOrEqual(1);
      expect(byKey.structure.score).toBeLessThanOrEqual(100 - 15);
    });

    it('部屬 level 嚴格高於主管（正常）→ 不報層級異常', () => {
      // boss level=1、staff level=2（嚴格高於）→ memberLevel(2) > supLevel(1) → 正常。
      const data = makeOrgData({
        employees: [emp('boss'), emp('staff')],
        groups: [group('dept', { kind: 'department' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-boss', {
            employeeId: 'boss',
            groupId: 'dept',
            jobLevelId: 'j1',
            level: 1,
          }),
          assignment('as-staff', {
            employeeId: 'staff',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
            level: 2,
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.id === 'level-anomaly:dept:staff')).toBe(false);
      expect(findings.some((f) => f.category === 'group-mismatch')).toBe(false);
    });

    it('未覆寫 level、純主匯報深度（boss 第1層 / staff 第2層）→ 正常不報', () => {
      // 不給 level → effectiveLevel 退回 computePrimaryDepth：boss=1、staff=2 → 正常。
      const data = makeOrgData({
        employees: [emp('boss'), emp('staff')],
        groups: [group('dept', { kind: 'department' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-boss', { employeeId: 'boss', groupId: 'dept', jobLevelId: 'j1' }),
          assignment('as-staff', {
            employeeId: 'staff',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.category === 'group-mismatch')).toBe(false);
    });

    it('co-lead 平行同層不報層級異常（負案例）：co-leader 與成員同層屬合法平行共管', () => {
      // teamA：leaderId=lead（組內，level 1）。成員 peer 的主管 coLead 在組外、帶 peer →
      // coLead 為 teamA co-leader。peer 與 coLead 同層（皆 level 1）。
      // 規則 3 排除：a.employeeId 屬 co-lead 平行情境（sIsCoLeader 或成員為 co-leader）→ 不報。
      // 此案例 peer 的主管 coLead 在組外（規則 3 只處理「s 在組內」）→ 走規則 2 路徑，
      // 而 coLead 是 co-leader → 規則 2 也豁免。雙重確認同層平行不被任何規則報 warning。
      const data = makeOrgData({
        employees: [
          emp('lead'),
          emp('coLead'),
          emp('peer'),
        ],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'lead' }),
          group('exec', { name: '高管組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-lead', {
            employeeId: 'lead',
            groupId: 'teamA',
            jobLevelId: 'j1',
            level: 1,
          }),
          assignment('as-coLead', {
            employeeId: 'coLead',
            groupId: 'exec',
            jobLevelId: 'j1',
            level: 1,
          }),
          assignment('as-peer', {
            employeeId: 'peer',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['coLead'],
            primarySupervisorId: 'coLead',
            level: 1, // 與 coLead 同層
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      // coLead 為 co-leader → parallel-colead(info)。
      expect(findings.some((f) => f.id === 'parallel-colead:teamA:coLead')).toBe(true);
      // 同層平行 → 不報任何 group-mismatch（含 level-anomaly）warning。
      expect(findings.some((f) => f.category === 'group-mismatch')).toBe(false);
    });

    it('成員本身是 co-leader 時，其與組內主管的層級比較被排除（規則 3 的 coLeaderIds.includes(a.employeeId) 分支）', () => {
      // 構造一名「同時是 teamA 成員、又是 teamA co-leader」的人：
      //   peerCo 在 teamA 有一筆歸屬，其 primary 主管 inBoss 在組內（→ 走規則 3「s 在組內」路徑）；
      //   同時 peerCo 是另一成員 sub 的組外主管？不——需 peerCo 對某成員為「組外」主管才會被推 co-leader。
      // 改以最直接方式觸發該排除分支：讓 peerCo 對組外某成員無關，而是讓 teamB 的成員掛 peerCo……
      // 然而 co-leader 嚴格定義為「本組成員的組外 primary 主管」。要讓 peerCo 是 teamA co-leader，
      // 必須有 teamA 成員的 primary 主管 = peerCo 且 peerCo ∉ teamA 成員集合——但我們又要 peerCo ∈ teamA。矛盾。
      //
      // 結論：在現行推導下「a.employeeId 同時為本組 co-leader」這條排除分支也不可自然到達
      //（co-leader 必為組外）。此分支屬防禦性程式碼。本測試以「組內主管、部屬嚴格更深」的
      // 正常結構守護規則 3 不誤報，並記錄上述不可達性（見回報的實作觀察）。
      const data = makeOrgData({
        employees: [emp('boss'), emp('mid'), emp('low')],
        groups: [group('dept', { kind: 'department' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-boss', { employeeId: 'boss', groupId: 'dept', jobLevelId: 'j1' }),
          assignment('as-mid', {
            employeeId: 'mid',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
          }),
          assignment('as-low', {
            employeeId: 'low',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['mid'],
            primarySupervisorId: 'mid',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.category === 'group-mismatch')).toBe(false);
    });
  });

  describe('Phase F active／組別 status 過濾（三規則皆跳過非 active 對象）', () => {
    /**
     * co-lead 收緊同批落地的補強：Phase F 三規則皆須過濾非 active 對象——
     *  - 規則 1 parallel-colead：leader 或 co-leader 任一非 active → 不產生 finding。
     *  - 規則 2/3：assignment 成員或其主管 s 任一非 active → 跳過；組別 status!=='active' → 跳過。
     * 以下每案皆「若無過濾則本會產出 finding」，加過濾後應被抑制。
     */

    it('規則 1：co-leader 非 active → 不產生 parallel-colead', () => {
      // coo 為 sales 推導 co-leader（exec leaderId、夠格），但 coo 設為 inactive →
      // 規則 1 的 !isActive(coLeaderId) 守門 → 不產生 parallel-colead:sales:coo。
      const data = makeOrgData({
        employees: [
          emp('ceo'),
          emp('coo', { status: 'inactive' }),
          emp('s1'),
        ],
        groups: [
          group('sales', { name: '業務部', leaderId: 'ceo' }),
          group('exec', { name: '高管組', leaderId: 'coo' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-ceo', { employeeId: 'ceo', groupId: 'exec', jobLevelId: 'j1' }),
          assignment('as-coo', { employeeId: 'coo', groupId: 'exec', jobLevelId: 'j1' }),
          // ceo 在 sales 也有一筆（讓 sales leaderId=ceo 落在 active）。
          assignment('as-ceo-sales', {
            employeeId: 'ceo',
            groupId: 'sales',
            jobLevelId: 'j1',
            isPrimaryGroup: false,
          }),
          // s1 主管 coo（組外、夠格 co-leader），但 coo inactive。
          assignment('as-s1', {
            employeeId: 's1',
            groupId: 'sales',
            jobLevelId: 'j1',
            supervisorIds: ['coo'],
            primarySupervisorId: 'coo',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.id === 'parallel-colead:sales:coo')).toBe(false);
      // s1 的主管 coo inactive → 規則 2/3 亦因 !isActive(s) 跳過 → 不誤報 group-mismatch。
      expect(findings.some((f) => f.id === 'group-mismatch:sales:s1')).toBe(false);
    });

    it('規則 1：組長（leader）非 active → 不產生 parallel-colead', () => {
      // sales leaderId=ceo 但 ceo inactive → 規則 1 的 !isActive(leaderId) 守門 → 整組不產 parallel-colead。
      const data = makeOrgData({
        employees: [
          emp('ceo', { status: 'inactive' }),
          emp('coo'),
          emp('s1'),
        ],
        groups: [
          group('sales', { name: '業務部', leaderId: 'ceo' }),
          group('exec', { name: '高管組', leaderId: 'coo' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-ceo', { employeeId: 'ceo', groupId: 'exec', jobLevelId: 'j1' }),
          assignment('as-coo', { employeeId: 'coo', groupId: 'exec', jobLevelId: 'j1' }),
          // s1 主管 coo（夠格 co-leader）→ 正常本會出 parallel-colead，但 leader=ceo inactive 全組抑制。
          assignment('as-s1', {
            employeeId: 's1',
            groupId: 'sales',
            jobLevelId: 'j1',
            supervisorIds: ['coo'],
            primarySupervisorId: 'coo',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.category === 'parallel-colead')).toBe(false);
    });

    it('規則 2/3：成員（assignment.employeeId）非 active → 跳過 group-mismatch', () => {
      // 不夠格組外主管 midMgr 帶成員 m，但 m 設為 inactive → !isActive(a.employeeId) 跳過。
      const data = makeOrgData({
        employees: [
          emp('lead'),
          emp('topBoss'),
          emp('midMgr'),
          emp('m', { status: 'inactive' }),
        ],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'lead' }),
          group('teamB', { name: 'B組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-lead', { employeeId: 'lead', groupId: 'teamA', jobLevelId: 'j1' }),
          assignment('as-top', { employeeId: 'topBoss', groupId: 'teamB', jobLevelId: 'j1' }),
          assignment('as-mid', {
            employeeId: 'midMgr',
            groupId: 'teamB',
            jobLevelId: 'j1',
            supervisorIds: ['topBoss'],
            primarySupervisorId: 'topBoss',
          }),
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['midMgr'],
            primarySupervisorId: 'midMgr',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      // m inactive → 規則 2 跳過（對照「成員 active」版本本會命中 group-mismatch:teamA:m）。
      expect(findings.some((f) => f.id === 'group-mismatch:teamA:m')).toBe(false);
    });

    it('規則 2/3：主管 s 非 active → 跳過 group-mismatch（改由 chain-dangling 涵蓋）', () => {
      // 不夠格組外主管 midMgr 設為 inactive → !isActive(s) 跳過規則 2。
      const data = makeOrgData({
        employees: [
          emp('lead'),
          emp('topBoss'),
          emp('midMgr', { status: 'inactive' }),
          emp('m'),
        ],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'lead' }),
          group('teamB', { name: 'B組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-lead', { employeeId: 'lead', groupId: 'teamA', jobLevelId: 'j1' }),
          assignment('as-top', { employeeId: 'topBoss', groupId: 'teamB', jobLevelId: 'j1' }),
          assignment('as-mid', {
            employeeId: 'midMgr',
            groupId: 'teamB',
            jobLevelId: 'j1',
            supervisorIds: ['topBoss'],
            primarySupervisorId: 'topBoss',
          }),
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['midMgr'],
            primarySupervisorId: 'midMgr',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.id === 'group-mismatch:teamA:m')).toBe(false);
      // 主管非 active → 改由 chain-dangling 表達（守護「不是靜默吞掉」）。
      expect(findings.some((f) => f.id === 'chain-dangling:m')).toBe(true);
    });

    it('規則 2/3：組別 status!==active → 整組跳過（不報 group-mismatch / level-anomaly）', () => {
      // 同「不夠格組外主管」結構，但把成員所屬組 teamA 設為 inactive → group.status 守門跳過。
      const data = makeOrgData({
        employees: [emp('lead'), emp('topBoss'), emp('midMgr'), emp('m')],
        groups: [
          group('teamA', { name: 'A組', leaderId: 'lead', status: 'inactive' }),
          group('teamB', { name: 'B組' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-lead', { employeeId: 'lead', groupId: 'teamA', jobLevelId: 'j1' }),
          assignment('as-top', { employeeId: 'topBoss', groupId: 'teamB', jobLevelId: 'j1' }),
          assignment('as-mid', {
            employeeId: 'midMgr',
            groupId: 'teamB',
            jobLevelId: 'j1',
            supervisorIds: ['topBoss'],
            primarySupervisorId: 'topBoss',
          }),
          assignment('as-m', {
            employeeId: 'm',
            groupId: 'teamA',
            jobLevelId: 'j1',
            supervisorIds: ['midMgr'],
            primarySupervisorId: 'midMgr',
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.id.startsWith('group-mismatch:teamA'))).toBe(false);
    });

    it('規則 3：組別 status!==active → 即使組內層級異常也跳過', () => {
      // 組內主管 boss / 部屬 staff 同層（level 2）本會報 level-anomaly，但組 inactive → 跳過。
      const data = makeOrgData({
        employees: [emp('boss'), emp('staff')],
        groups: [group('dept', { kind: 'department', status: 'inactive' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-boss', {
            employeeId: 'boss',
            groupId: 'dept',
            jobLevelId: 'j1',
            level: 2,
          }),
          assignment('as-staff', {
            employeeId: 'staff',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
            level: 2,
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      expect(findings.some((f) => f.id === 'level-anomaly:dept:staff')).toBe(false);
    });
  });

  describe('規則 3 對稱化：成員側改用主歸屬 assignment（與主管側對稱）', () => {
    it('成員在「被檢查組」那筆為次要歸屬且 level 看似異常，但其主歸屬層級正常 → 不誤報 level-anomaly', () => {
      // 此 fixture 精準區分「用當前 a」vs「用成員主歸屬」兩種實作：
      //   dept：boss level=1。staff 在 dept 的這筆是「次要」歸屬、掛 boss、level=1（與主管同層→看似異常）。
      //   staff 的「主歸屬」在 home、level=5（正常很深）。
      // - 舊（誤用當前 a＝dept 次要那筆）：memberLevel=1 <= supLevel(boss)=1 → 誤報 level-anomaly。
      // - 修補後（成員側取主歸屬 home、level=5）：5 > 1 → 不報。對稱於主管側亦取其主歸屬。
      const data = makeOrgData({
        employees: [emp('boss'), emp('staff')],
        groups: [
          group('dept', { kind: 'department', name: '部門' }),
          group('home', { kind: 'department', name: '本部' }),
        ],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('as-boss', {
            employeeId: 'boss',
            groupId: 'dept',
            jobLevelId: 'j1',
            level: 1,
          }),
          // staff 在 dept 的「次要」歸屬：掛 boss、level=1（看似與主管同層）。
          assignment('as-staff-dept', {
            employeeId: 'staff',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
            level: 1,
            isPrimaryGroup: false,
          }),
          // staff 的「主歸屬」在 home：level=5（正常很深）→ 成員側對稱應採此筆。
          assignment('as-staff-home', {
            employeeId: 'staff',
            groupId: 'home',
            jobLevelId: 'j1',
            level: 5,
            isPrimaryGroup: true,
          }),
        ],
      });
      const { findings } = buildOrgHealth(data);
      // 成員側採主歸屬（home、level 5）對比主管 boss（level 1）→ 嚴格更深 → 不報層級異常。
      // 若實作仍誤用「當前 a（dept 次要、level 1）」，memberLevel=1<=1 會誤報 → 本斷言守護修補。
      expect(findings.some((f) => f.id === 'level-anomaly:dept:staff')).toBe(false);
      expect(findings.some((f) => f.category === 'group-mismatch')).toBe(false);
    });
  });

  describe('不回歸：無跨組主管的單組資料，Phase F 不新增任何 finding', () => {
    it('既有單組正常匯報結構（root→mid→leaf）→ 無 group-mismatch、無 parallel-colead', () => {
      // 對齊既有 depth 測試的 fixture：全在 dept、主匯報遞減層級、無跨組主管。
      const data = makeOrgData({
        ...baseGroupsAndLevels(),
        employees: [emp('root'), emp('mid'), emp('leaf')],
        assignments: [
          assignment('as-root', { employeeId: 'root', groupId: 'dept', jobLevelId: 'j1' }),
          assignment('as-mid', {
            employeeId: 'mid',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['root'],
            primarySupervisorId: 'root',
          }),
          assignment('as-leaf', {
            employeeId: 'leaf',
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['mid'],
            primarySupervisorId: 'mid',
          }),
        ],
      });
      const health = buildOrgHealth(data);
      // Phase F 兩類別皆 0 筆（無跨組主管、層級正常遞減）。
      expect(categoriesOf(health.findings)).not.toContain('group-mismatch');
      expect(categoriesOf(health.findings)).not.toContain('parallel-colead');
      // structure 維（Phase F 掛載點）完全未受影響 → 100、0 筆。
      // （此 fixture 的 mid/root 各帶 1 名 → 另有 span-narrow(info) 影響 span 維與 total，
      //  與 Phase F 無關；故只精準斷言 structure 維不被 Phase F 觸動。）
      const r = buildReadiness(health);
      const byKey = Object.fromEntries(r.dimensions.map((d) => [d.key, d]));
      expect(byKey.structure.score).toBe(100);
      expect(byKey.structure.findingCount).toBe(0);
    });

    it('warningCount 不被 Phase F 影響：純 span-wide 場景的 warningCount 仍只計 span', () => {
      // 9 名部屬同組 → span-wide(warning) + spof(warning)；無跨組主管 → Phase F 0 筆。
      const reports = Array.from({ length: 9 }, (_, i) => `r${i}`);
      const data = makeOrgData({
        ...baseGroupsAndLevels(),
        employees: [emp('sup'), ...reports.map((id) => emp(id))],
        assignments: [
          assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
          ...reports.map((id) =>
            assignment(`as-${id}`, {
              employeeId: id,
              groupId: 'dept',
              jobLevelId: 'j1',
              supervisorIds: ['sup'],
              primarySupervisorId: 'sup',
            }),
          ),
        ],
      });
      const { findings, summary } = buildOrgHealth(data);
      // Phase F 不新增任何 finding。
      expect(findings.some((f) => f.category === 'group-mismatch')).toBe(false);
      expect(findings.some((f) => f.category === 'parallel-colead')).toBe(false);
      // warningCount = span-wide(1) + spof(1) = 2，與 Phase F 前一致。
      expect(summary.warningCount).toBe(2);
    });
  });
});

describe('buildOrgHealth — summary 與不變式', () => {
  it('summary 統計（active 人數、部門/職能數、warningCount）', () => {
    const data = makeOrgData({
      employees: [
        emp('a'),
        emp('b'),
        emp('inactive', { status: 'inactive' }),
      ],
      groups: [
        group('d1', { kind: 'department' }),
        group('d2', { kind: 'department' }),
        group('d-off', { kind: 'department', status: 'inactive' }), // 不計
        group('fn', { kind: 'function' }),
        group('fn-off', { kind: 'function', status: 'inactive' }), // 不計
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('as-a', { employeeId: 'a', groupId: 'd1', jobLevelId: 'j1' }),
        assignment('as-b', {
          employeeId: 'b',
          groupId: 'd1',
          jobLevelId: 'j1',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
    const { summary } = buildOrgHealth(data);
    expect(summary.activeEmployees).toBe(2); // inactive 不計
    expect(summary.departments).toBe(2); // 只計 active department
    expect(summary.functions).toBe(1); // 只計 active function
  });

  it('warningCount 與 findings 中 severity===warning 的數量一致', () => {
    // 混合多類 finding：wide(warn) + narrow(info) + chain-orphan(warn) + spof(warn)
    const reports = Array.from({ length: 9 }, (_, i) => `w${i}`); // 9 名 → wide
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [
        emp('wideSup'),
        ...reports.map((id) => emp(id)),
        emp('narrowSup'),
        emp('nr1'),
        emp('orphan'),
      ],
      assignments: [
        assignment('as-wideSup', { employeeId: 'wideSup', groupId: 'dept', jobLevelId: 'j1' }),
        ...reports.map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['wideSup'],
            primarySupervisorId: 'wideSup',
          }),
        ),
        assignment('as-narrowSup', { employeeId: 'narrowSup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-nr1', {
          employeeId: 'nr1',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['narrowSup'],
          primarySupervisorId: 'narrowSup',
        }),
        // orphan 無 assignment
      ],
    });
    const { findings, summary } = buildOrgHealth(data);
    const warnings = findings.filter((f) => f.severity === 'warning');
    expect(summary.warningCount).toBe(warnings.length);
    // 健全性：的確同時含 warning 與 info（否則不變式測試恒真）
    expect(summary.warningCount).toBeGreaterThan(0);
    expect(findings.some((f) => f.severity === 'info')).toBe(true);
  });

  it('空資料：所有彙總為 0、findings 為空', () => {
    const { summary, span, depth, findings, functionCoverage } = buildOrgHealth(
      makeOrgData(),
    );
    expect(summary.activeEmployees).toBe(0);
    expect(summary.warningCount).toBe(0);
    expect(span.entries).toEqual([]);
    expect(depth.perLevel).toEqual([]);
    expect(depth.maxDepth).toBe(0);
    expect(findings).toEqual([]);
    expect(functionCoverage.functions).toEqual([]);
  });
});

describe('buildReadiness（規劃就緒度 — 結構面）', () => {
  /**
   * buildReadiness 僅讀取 health.findings；其餘欄位不影響計分。
   * 以最小 OrgHealth-like 物件造各類別 finding，精準控制每維度扣分，
   * 比真造一整份 OrgData 更穩定、邊界更好湊。
   *
   * 維度 → category 對應（對齊契約 R0.5、Phase F 後）：
   *   span      ← ['span']
   *   structure ← ['chain','cycle','group-mismatch']  // Phase F 新增 group-mismatch
   *   function  ← ['function']
   *   keyPerson ← ['spof']
   * 註：'parallel-colead'（info）刻意不納入任何維度 → 不扣就緒度（合法資訊性標示）。
   * 計分：每維度自 100 起扣（warning −15、info −5），Math.max(0,…)；
   * total＝四維等權平均（Math.round）；level：≥80 high／60–79 medium／<60 low。
   */

  /** 造 count 筆指定 category／severity 的 finding（內容除分類外不影響計分）。 */
  function findingsOf(
    category: OrgHealthFinding['category'],
    severity: OrgHealthFinding['severity'],
    count: number,
  ): OrgHealthFinding[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `${category}-${severity}:${i}`,
      severity,
      category,
      message: `${category} ${severity} #${i}`,
    }));
  }

  /** 以給定 findings 組出 buildReadiness 只會讀到 findings 的最小 OrgHealth。 */
  function healthWith(findings: OrgHealthFinding[]): OrgHealth {
    return {
      summary: {
        activeEmployees: 0,
        departments: 0,
        functions: 0,
        supervisors: 0,
        avgSpan: 0,
        maxDepth: 0,
        warningCount: findings.filter((f) => f.severity === 'warning').length,
      },
      span: {
        entries: [],
        average: 0,
        max: 0,
        min: 0,
        supervisorCount: 0,
        wide: [],
        narrow: [],
      },
      depth: { maxDepth: 0, perLevel: [] },
      functionCoverage: {
        functions: [],
        functionsWithoutMembers: [],
        functionsWithoutLead: [],
        crossFunctionLoad: [],
      },
      findings,
    };
  }

  /** 維度 key → score，便於斷言。 */
  function scoresByKey(health: OrgHealth): Record<string, number> {
    const r = buildReadiness(health);
    return Object.fromEntries(r.dimensions.map((d) => [d.key, d.score]));
  }

  it('健康組織（無 findings）→ 四維 score 全 100、total 100、level high', () => {
    const r = buildReadiness(healthWith([]));
    expect(r.dimensions.map((d) => d.key)).toEqual([
      'span',
      'structure',
      'function',
      'keyPerson',
    ]);
    expect(r.dimensions.every((d) => d.score === 100)).toBe(true);
    expect(r.dimensions.every((d) => d.findingCount === 0)).toBe(true);
    expect(r.total).toBe(100);
    expect(r.level).toBe('high');
  });

  it('純 warning：某維 N 筆 warning → 該維 score = max(0, 100 − 15N)', () => {
    // structure 維度放 2 筆 warning（chain）→ 100 − 30 = 70；其餘維度 100。
    const r = buildReadiness(healthWith(findingsOf('chain', 'warning', 2)));
    const scores = scoresByKey(healthWith(findingsOf('chain', 'warning', 2)));
    expect(scores.structure).toBe(100 - 15 * 2); // 70
    expect(scores.span).toBe(100);
    expect(scores.function).toBe(100);
    expect(scores.keyPerson).toBe(100);
    // structure 維度的 findingCount 對到該類別筆數
    const structureDim = r.dimensions.find((d) => d.key === 'structure');
    expect(structureDim?.findingCount).toBe(2);
  });

  it('info 扣分較輕：1 筆 info → 該維 −5', () => {
    // span narrow 屬 info → span 維 100 − 5 = 95
    const scores = scoresByKey(healthWith(findingsOf('span', 'info', 1)));
    expect(scores.span).toBe(95);
  });

  it('warning 與 info 混扣：1 warning + 2 info → −15 − 10 = −25', () => {
    const mixed = [
      ...findingsOf('spof', 'warning', 1),
      ...findingsOf('spof', 'info', 2),
    ];
    const scores = scoresByKey(healthWith(mixed));
    expect(scores.keyPerson).toBe(100 - 15 - 5 * 2); // 75
  });

  it('扣到 0 下限：堆超量 warning 不會出現負分', () => {
    // 10 筆 warning → 100 − 150 = −50，應被 Math.max(0,…) 夾到 0
    const scores = scoresByKey(healthWith(findingsOf('function', 'warning', 10)));
    expect(scores.function).toBe(0);
  });

  it('structure 維度同時吃 chain 與 cycle 兩類別', () => {
    const combo = [
      ...findingsOf('chain', 'warning', 1),
      ...findingsOf('cycle', 'warning', 1),
    ];
    const r = buildReadiness(healthWith(combo));
    const structureDim = r.dimensions.find((d) => d.key === 'structure');
    expect(structureDim?.findingCount).toBe(2);
    expect(structureDim?.score).toBe(100 - 15 * 2); // 70
  });

  it('各維 findingCount 精準對應其 category（不互相污染）', () => {
    const all = [
      ...findingsOf('span', 'info', 3), // span
      ...findingsOf('chain', 'warning', 1), // structure
      ...findingsOf('cycle', 'warning', 1), // structure
      ...findingsOf('function', 'warning', 2), // function
      ...findingsOf('spof', 'warning', 1), // keyPerson
      // depth 不屬任何就緒度維度 → 應被忽略
      ...findingsOf('depth', 'info', 4),
    ];
    const r = buildReadiness(healthWith(all));
    const byKey = Object.fromEntries(
      r.dimensions.map((d) => [d.key, d.findingCount]),
    );
    expect(byKey.span).toBe(3);
    expect(byKey.structure).toBe(2); // chain + cycle
    expect(byKey.function).toBe(2);
    expect(byKey.keyPerson).toBe(1);
    // depth findings 不影響任何維度的計分
    expect(scoresByKey(healthWith(all)).function).toBe(100 - 15 * 2);
  });

  describe('level 邊界（total 由四維等權平均 Math.round 推得）', () => {
    /**
     * 每維 score 必為 5 的倍數（penalty＝15w+5i）。
     * 以「各維放 K 筆 info」精準把某維壓到目標分數，湊出指定 total。
     */
    function infoCountFor(targetScore: number): number {
      return (100 - targetScore) / 5; // info 每筆 −5
    }
    function healthForScores(scores: {
      span: number;
      structure: number;
      function: number;
      keyPerson: number;
    }): OrgHealth {
      return healthWith([
        ...findingsOf('span', 'info', infoCountFor(scores.span)),
        ...findingsOf('chain', 'info', infoCountFor(scores.structure)),
        ...findingsOf('function', 'info', infoCountFor(scores.function)),
        ...findingsOf('spof', 'info', infoCountFor(scores.keyPerson)),
      ]);
    }

    it('total 恰為 80 → high（sum 320 / 4）', () => {
      const r = buildReadiness(
        healthForScores({ span: 80, structure: 80, function: 80, keyPerson: 80 }),
      );
      expect(r.total).toBe(80);
      expect(r.level).toBe('high');
    });

    it('total 79 → medium（sum 315 / 4 = 78.75 四捨五入 79）', () => {
      const r = buildReadiness(
        healthForScores({ span: 80, structure: 80, function: 80, keyPerson: 75 }),
      );
      expect(r.total).toBe(79);
      expect(r.level).toBe('medium');
    });

    it('total 恰為 60 → medium（sum 240 / 4）', () => {
      const r = buildReadiness(
        healthForScores({ span: 60, structure: 60, function: 60, keyPerson: 60 }),
      );
      expect(r.total).toBe(60);
      expect(r.level).toBe('medium');
    });

    it('total 59 → low（sum 235 / 4 = 58.75 四捨五入 59）', () => {
      const r = buildReadiness(
        healthForScores({ span: 60, structure: 60, function: 60, keyPerson: 55 }),
      );
      expect(r.total).toBe(59);
      expect(r.level).toBe('low');
    });
  });

  it('直接吃 buildOrgHealth 輸出：spof + function 變動會降對應維度', () => {
    // 真造一份含 spof（warning）與 function-no-lead（warning）的 OrgData，
    // 驗證 buildReadiness 串接 buildOrgHealth 的結果一致。
    const data = makeOrgData({
      employees: [emp('sup'), emp('r1'), emp('r2'), emp('m1')],
      groups: [
        group('dept', { kind: 'department' }),
        group('fn', { code: 'FN', name: '無頭職能', kind: 'function' }),
      ],
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
        // 無 lead 職能：成員無 primarySupervisorId
        assignment('as-m1', {
          employeeId: 'm1',
          groupId: 'fn',
          jobLevelId: 'j1',
          isPrimaryGroup: false,
        }),
      ],
    });
    const health = buildOrgHealth(data);
    const r = buildReadiness(health);
    const byKey = Object.fromEntries(r.dimensions.map((d) => [d.key, d]));
    // keyPerson：1 筆 spof warning → 85
    expect(byKey.keyPerson.findingCount).toBe(1);
    expect(byKey.keyPerson.score).toBe(85);
    // function：1 筆 no-lead warning → 85
    expect(byKey.function.findingCount).toBe(1);
    expect(byKey.function.score).toBe(85);
    // structure 無 finding → 100
    expect(byKey.structure.score).toBe(100);
  });
});

describe('compareOrgHealth（編輯態 before→after 指標比較）', () => {
  /**
   * compareOrgHealth 串接 buildOrgHealth + buildReadiness，產出 4 個固定指標的 delta。
   *
   * 約定（對齊契約 R5.2 §2）：
   *  - metrics 固定 4 項、固定順序：avgSpan, maxDepth, warningCount, readiness。
   *  - avgSpan/maxDepth/warningCount：after < before → improved（越小越好）。
   *  - readiness：after > before → improved（越大越好；方向與前三者相反）。
   *  - delta = after - before（原值，不四捨五入）。
   *  - hasChanges = 任一 metric.delta !== 0。
   *
   * 造資料策略：以 wide span 主管的部屬數操控 warningCount——9 名部屬觸發
   * span-wide(warning)、抽掉一名變 8 名即不再觸發，藉此構造「改善／惡化」對照。
   * 此 finding 屬 span 維度（warning），同時影響 warningCount 與 readiness。
   */

  /** 造一份「sup 帶 n 名部屬」的 OrgData（n>=9 會觸發 span-wide warning）。 */
  function spanData(reportCount: number) {
    const reports = Array.from({ length: reportCount }, (_, i) => `r${i}`);
    return makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), ...reports.map((id) => emp(id))],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        ...reports.map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ),
      ],
    });
  }

  /** metric key → 該筆 delta，便於斷言。 */
  function byKey(delta: ReturnType<typeof compareOrgHealth>) {
    return Object.fromEntries(delta.metrics.map((m) => [m.key, m]));
  }

  it('base===draft（同一份）→ 4 指標 delta 全 0、direction 全 unchanged、hasChanges false', () => {
    const data = spanData(9); // 內容不影響「相同即無變化」的結論
    const result = compareOrgHealth(data, data);

    expect(result.metrics).toHaveLength(4);
    expect(result.metrics.every((m) => m.delta === 0)).toBe(true);
    expect(result.metrics.every((m) => m.direction === 'unchanged')).toBe(true);
    expect(result.metrics.every((m) => m.before === m.after)).toBe(true);
    expect(result.hasChanges).toBe(false);
  });

  it('metrics 順序固定為 avgSpan, maxDepth, warningCount, readiness', () => {
    const result = compareOrgHealth(spanData(9), spanData(8));
    expect(result.metrics.map((m) => m.key)).toEqual([
      'avgSpan',
      'maxDepth',
      'warningCount',
      'readiness',
    ]);
    // 標籤亦對齊契約（繁中）
    expect(result.metrics.map((m) => m.label)).toEqual([
      '平均管理幅度',
      '最大層級',
      '警示數',
      '規劃就緒度',
    ]);
  });

  it('draft 改善（過寬主管抽掉一名部屬 → warningCount 下降）→ warningCount improved、delta<0、hasChanges true', () => {
    // base：9 名部屬 → span-wide(warning) + spof(warning)，warningCount=2
    // draft：8 名部屬 → 不再過寬，僅剩 spof(warning)，warningCount=1（少一筆 span-wide）
    const base = spanData(9);
    const draft = spanData(8);

    // 前置不變式：確認造的資料一邊比另一邊多一筆 warning（span-wide）
    expect(buildOrgHealth(base).summary.warningCount).toBe(2);
    expect(buildOrgHealth(draft).summary.warningCount).toBe(1);

    const result = compareOrgHealth(base, draft);
    const m = byKey(result);

    expect(m.warningCount.before).toBe(2);
    expect(m.warningCount.after).toBe(1);
    expect(m.warningCount.delta).toBe(-1);
    expect(m.warningCount.direction).toBe('improved'); // 越小越好
    expect(result.hasChanges).toBe(true);
  });

  it('draft 惡化（過寬主管多帶一名部屬 → warningCount 上升）→ warningCount worsened、delta>0', () => {
    // base：8 名（warningCount=1）；draft：9 名（多一筆 span-wide → 2）→ 方向與上題相反
    const base = spanData(8);
    const draft = spanData(9);

    const result = compareOrgHealth(base, draft);
    const m = byKey(result);

    expect(m.warningCount.before).toBe(1);
    expect(m.warningCount.after).toBe(2);
    expect(m.warningCount.delta).toBe(1);
    expect(m.warningCount.direction).toBe('worsened'); // 越小越好，變多即惡化
    expect(result.hasChanges).toBe(true);
  });

  it('readiness 方向相反：after>before → improved（與 warningCount「越小越好」反向）', () => {
    // 同一組 base(9 名、有 span warning)→draft(8 名、無 warning)：
    // warningCount 下降（improved），同時 readiness 上升（after>before）也應為 improved。
    const base = spanData(9);
    const draft = spanData(8);

    const baseReadiness = buildReadiness(buildOrgHealth(base)).total;
    const draftReadiness = buildReadiness(buildOrgHealth(draft)).total;
    // 前置不變式：抽掉過寬 warning 後 readiness 確實提升
    expect(draftReadiness).toBeGreaterThan(baseReadiness);

    const m = byKey(compareOrgHealth(base, draft));
    expect(m.readiness.before).toBe(baseReadiness);
    expect(m.readiness.after).toBe(draftReadiness);
    expect(m.readiness.delta).toBe(draftReadiness - baseReadiness);
    expect(m.readiness.delta).toBeGreaterThan(0);
    expect(m.readiness.direction).toBe('improved'); // 越大越好

    // 反向驗證：base↔draft 互換 → readiness 下降 → worsened
    const reversed = byKey(compareOrgHealth(draft, base));
    expect(reversed.readiness.delta).toBeLessThan(0);
    expect(reversed.readiness.direction).toBe('worsened');
    // 同一組互換下，warningCount 反向變成 worsened（與 readiness 的 worsened 同向「整體變差」，
    // 但兩者的「越小/越大」規則相反，仍各自判對）
    expect(reversed.warningCount.direction).toBe('worsened');
  });

  it('before/after 存 number 原值（avgSpan 不被 toFixed 破壞型別、保留小數）', () => {
    // sup 帶 3 名部屬、mgr 帶 1 名 → avgSpan = (3+1)/2 = 2（base）
    const base = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), emp('mgr'), emp('a'), emp('b'), emp('c')],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mgr', {
          employeeId: 'mgr',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        ...['a', 'b'].map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ),
        assignment('as-c', {
          employeeId: 'c',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['mgr'],
          primarySupervisorId: 'mgr',
        }),
      ],
    });
    // draft：把 c 從 mgr 移到 sup → sup 帶 mgr+a+b+c=4、mgr 帶 0（退出 entries）
    // → avgSpan = 4 / 1 = 4
    const draft = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), emp('mgr'), emp('a'), emp('b'), emp('c')],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mgr', {
          employeeId: 'mgr',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
        ...['a', 'b', 'c'].map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ),
      ],
    });

    const m = byKey(compareOrgHealth(base, draft));
    expect(typeof m.avgSpan.before).toBe('number');
    expect(typeof m.avgSpan.after).toBe('number');
    expect(m.avgSpan.before).toBe(2);
    expect(m.avgSpan.after).toBe(4);
    expect(m.avgSpan.delta).toBe(2);
    // avgSpan 越小越好 → 變大為惡化
    expect(m.avgSpan.direction).toBe('worsened');
  });

  it('avgSpan 保留小數 1 位精度（1 位小數值原樣保留、不被 round 成整數）', () => {
    // sup 帶 2 名、mgr 帶 1 名 → avgSpan = (2+1)/2 = 1.5
    // 1.5 本就是 1 位小數，round 到 1dp 仍為 1.5 → 應原樣保留、非被 round 成整數 2。
    const data = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), emp('mgr'), emp('a'), emp('b')],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mgr', {
          employeeId: 'mgr',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
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
          supervisorIds: ['mgr'],
          primarySupervisorId: 'mgr',
        }),
      ],
    });
    const m = byKey(compareOrgHealth(data, data));
    expect(m.avgSpan.before).toBe(1.5); // 1 位小數值原樣保留
    expect(Number.isInteger(m.avgSpan.before)).toBe(false); // 未被 round 成整數
  });

  /**
   * 造「每位主管各帶固定人數部屬」的扁平結構，方便精準控制原始 avgSpan。
   * reportsPerSupervisor 是各主管的直接部屬數陣列；
   * avgSpan = sum(reportsPerSupervisor) / reportsPerSupervisor.length。
   * 為避免 span-wide 警示干擾此處對 avgSpan round 的聚焦，預設各主管部屬數 < 門檻 8。
   */
  function flatSpanData(reportsPerSupervisor: number[]) {
    const employees: ReturnType<typeof emp>[] = [];
    const assignments: ReturnType<typeof assignment>[] = [];
    reportsPerSupervisor.forEach((reports, s) => {
      const supId = `sup${s}`;
      employees.push(emp(supId));
      assignments.push(
        assignment(`as-${supId}`, { employeeId: supId, groupId: 'dept', jobLevelId: 'j1' }),
      );
      for (let r = 0; r < reports; r += 1) {
        const repId = `r${s}_${r}`;
        employees.push(emp(repId));
        assignments.push(
          assignment(`as-${repId}`, {
            employeeId: repId,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: [supId],
            primarySupervisorId: supId,
          }),
        );
      }
    });
    return makeOrgData({ ...baseGroupsAndLevels(), employees, assignments });
  }

  it('avgSpan 多位小數會 round 到 1 位（如 4.333… → 4.3），before/after 小數位 ≤1', () => {
    // 3 名主管帶 (5, 5, 3) → avgSpan = 13 / 3 = 4.3333…（多位小數）
    const data = flatSpanData([5, 5, 3]);

    // 前置不變式：原始 avgSpan 確為多位小數（不是已經 1dp）
    const rawAvg = buildOrgHealth(data).summary.avgSpan;
    expect(rawAvg).toBeCloseTo(13 / 3, 10);
    expect(Number(rawAvg.toFixed(1))).toBe(4.3); // 顯示精度

    const m = byKey(compareOrgHealth(data, data));
    // before/after 已被 round 到 1 位（不再是 4.3333…）
    expect(m.avgSpan.before).toBe(4.3);
    expect(m.avgSpan.after).toBe(4.3);
    // 小數位 ≤1：×10 後為整數
    expect(Number.isInteger(m.avgSpan.before * 10)).toBe(true);
    expect(Number.isInteger(m.avgSpan.after * 10)).toBe(true);
    // 同份資料 → delta 0、unchanged
    expect(m.avgSpan.delta).toBe(0);
    expect(m.avgSpan.direction).toBe('unchanged');
  });

  it('回歸守護：base/draft 原始 avgSpan 不同但 round 後同（皆 →4.8）→ delta 0、unchanged（不再誤報「改善 −0.1」）', () => {
    // 需「兩個不同整數分子落在同一 1dp bucket」：兩分數差 = 1/分母 < 0.1，故分母（主管數）須 >10。
    // 取 12 名主管：
    //   base  部屬總數 58 → 58/12 = 4.8333…  → round1 → 4.8
    //   draft 部屬總數 57 → 57/12 = 4.75      → round1 → 4.8（Math.round(47.5)=48）
    // 兩者原始值不同（4.8333… vs 4.75）卻 round 後相同；舊實作會算出 before 4.8333…、
    // after 4.75 → delta −0.0833…（顯示時截成 −0.1、direction improved）= 此 case 要守住的回歸點。
    const SUPERVISORS = 12;

    // 把總部屬數平均分配到各主管（餘數逐一加 1），總和精準為指定值。
    const distribute = (total: number, buckets: number): number[] => {
      const base = Math.floor(total / buckets);
      const remainder = total - base * buckets;
      return Array.from({ length: buckets }, (_, i) => base + (i < remainder ? 1 : 0));
    };

    const baseDist = distribute(58, SUPERVISORS); // sum 58
    const draftDist = distribute(57, SUPERVISORS); // sum 57
    const base = flatSpanData(baseDist);
    const draft = flatSpanData(draftDist);

    // 前置不變式：原始 avgSpan 確實不同
    const rawBase = buildOrgHealth(base).summary.avgSpan;
    const rawDraft = buildOrgHealth(draft).summary.avgSpan;
    expect(rawBase).toBeCloseTo(58 / 12, 10);
    expect(rawDraft).toBeCloseTo(57 / 12, 10);
    expect(rawBase).not.toBe(rawDraft); // 原值不同
    // 各主管部屬數 < 8，確保不觸發 span-wide 警示干擾
    expect(Math.max(...baseDist, ...draftDist)).toBeLessThan(8);

    const m = byKey(compareOrgHealth(base, draft));
    // round 後 before/after 皆 4.8
    expect(m.avgSpan.before).toBe(4.8);
    expect(m.avgSpan.after).toBe(4.8);
    // 關鍵守護：round 後相同 → delta 0、unchanged（非舊行為的 −0.1/improved）
    expect(m.avgSpan.delta).toBe(0);
    expect(m.avgSpan.direction).toBe('unchanged');
  });

  it('maxDepth 改善：拉平一條過深匯報鏈使 maxDepth 下降 → improved、delta<0', () => {
    // base：root→mid→leaf 三層線性鏈 → maxDepth 3
    const base = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('root'), emp('mid'), emp('leaf')],
      assignments: [
        assignment('as-root', { employeeId: 'root', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mid', {
          employeeId: 'mid',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['root'],
          primarySupervisorId: 'root',
        }),
        assignment('as-leaf', {
          employeeId: 'leaf',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
      ],
    });
    // draft：leaf 改直接掛 root（拉平一層）→ maxDepth 2
    const draft = makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('root'), emp('mid'), emp('leaf')],
      assignments: [
        assignment('as-root', { employeeId: 'root', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mid', {
          employeeId: 'mid',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['root'],
          primarySupervisorId: 'root',
        }),
        assignment('as-leaf', {
          employeeId: 'leaf',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['root'],
          primarySupervisorId: 'root',
        }),
      ],
    });

    const m = byKey(compareOrgHealth(base, draft));
    expect(m.maxDepth.before).toBe(3);
    expect(m.maxDepth.after).toBe(2);
    expect(m.maxDepth.delta).toBe(-1);
    expect(m.maxDepth.direction).toBe('improved'); // 越小越好
  });

  it('空資料 base/draft → 4 指標全 0、direction unchanged、hasChanges false', () => {
    const result = compareOrgHealth(makeOrgData(), makeOrgData());
    expect(result.metrics.map((m) => [m.before, m.after, m.delta])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      // 空資料 readiness：無 findings → total 100
      [100, 100, 0],
    ]);
    expect(result.metrics.every((m) => m.direction === 'unchanged')).toBe(true);
    expect(result.hasChanges).toBe(false);
  });
});

describe('buildHealthDelta（已算好的 OrgHealth → 4 指標 delta，純函式）', () => {
  /**
   * buildHealthDelta 是效能優化抽出的 export 純函式：吃「已算好的」base/draft
   * OrgHealth 直接組 delta，讓呼叫端能快取 buildOrgHealth 結果（base 在編輯 session
   * 內只算一次）。compareOrgHealth 現為其薄包裝＝先 buildOrgHealth 兩次再呼叫本函式。
   *
   * 本區塊直接守護 buildHealthDelta，並以「兩路徑一致」斷言優化未改變語意：
   *   buildHealthDelta(buildOrgHealth(base), buildOrgHealth(draft))
   *     === compareOrgHealth(base, draft)
   * 既有 compareOrgHealth 區塊（avgSpan round 回歸、方向、空資料等）仍是端到端守護，
   * 兩者互補：此處直接守 buildHealthDelta 本身、那邊守整條鏈。
   */

  /** 造一份「sup 帶 n 名部屬」的 OrgData（n>=9 會觸發 span-wide warning）。 */
  function spanData(reportCount: number) {
    const reports = Array.from({ length: reportCount }, (_, i) => `r${i}`);
    return makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('sup'), ...reports.map((id) => emp(id))],
      assignments: [
        assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
        ...reports.map((id) =>
          assignment(`as-${id}`, {
            employeeId: id,
            groupId: 'dept',
            jobLevelId: 'j1',
            supervisorIds: ['sup'],
            primarySupervisorId: 'sup',
          }),
        ),
      ],
    });
  }

  /** root→mid→leaf 線性鏈（maxDepth 3），用來與淺層資料對照 depth/readiness 變化。 */
  function deepChainData() {
    return makeOrgData({
      ...baseGroupsAndLevels(),
      employees: [emp('root'), emp('mid'), emp('leaf')],
      assignments: [
        assignment('as-root', { employeeId: 'root', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('as-mid', {
          employeeId: 'mid',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['root'],
          primarySupervisorId: 'root',
        }),
        assignment('as-leaf', {
          employeeId: 'leaf',
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
      ],
    });
  }

  /** metric key → 該筆 delta，便於斷言。 */
  function byKey(delta: ReturnType<typeof buildHealthDelta>) {
    return Object.fromEntries(delta.metrics.map((m) => [m.key, m]));
  }

  it('同一份 OrgHealth（health, health）→ 4 指標 delta 全 0、direction 全 unchanged、hasChanges false', () => {
    // 內容含 span-wide + spof warning，刻意非空——「同一份即無變化」與資料內容無關。
    const health = buildOrgHealth(spanData(9));
    const result = buildHealthDelta(health, health);

    expect(result.metrics).toHaveLength(4);
    expect(result.metrics.map((m) => m.key)).toEqual([
      'avgSpan',
      'maxDepth',
      'warningCount',
      'readiness',
    ]);
    expect(result.metrics.every((m) => m.delta === 0)).toBe(true);
    expect(result.metrics.every((m) => m.direction === 'unchanged')).toBe(true);
    expect(result.metrics.every((m) => m.before === m.after)).toBe(true);
    expect(result.hasChanges).toBe(false);
  });

  it('空 OrgHealth（同一份）→ 全 unchanged、readiness 100、hasChanges false', () => {
    const empty = buildOrgHealth(makeOrgData());
    const m = byKey(buildHealthDelta(empty, empty));
    expect([m.avgSpan, m.maxDepth, m.warningCount].every((x) => x.before === 0)).toBe(true);
    expect(m.readiness.before).toBe(100); // 無 findings → 結構面就緒度 100
    expect(buildHealthDelta(empty, empty).hasChanges).toBe(false);
  });

  /**
   * 核心守護：兩條路徑結果必須完全一致（優化未改變語意）。
   * 對多組「不同形狀」的 base/draft 構造，斷言
   *   buildHealthDelta(buildOrgHealth(base), buildOrgHealth(draft))
   * 深度相等於
   *   compareOrgHealth(base, draft)
   * 涵蓋：warningCount 升降、readiness 反向、avgSpan 多位小數 round、maxDepth 變化、空資料。
   */
  it.each([
    ['warningCount 下降（9→8 名部屬，抽掉 span-wide）', spanData(9), spanData(8)],
    ['warningCount 上升（8→9 名部屬，新增 span-wide）', spanData(8), spanData(9)],
    ['maxDepth 變化（深鏈 vs 同一份淺資料）', deepChainData(), spanData(2)],
    ['avgSpan 多位小數需 round（13/3 vs 9 名部屬）', spanData(2), spanData(9)],
    ['空 base / 非空 draft', makeOrgData(), spanData(9)],
    ['空 base / 空 draft', makeOrgData(), makeOrgData()],
  ])(
    '兩路徑一致：buildHealthDelta(build,build) === compareOrgHealth — %s',
    (_label, base, draft) => {
      const viaDelta = buildHealthDelta(buildOrgHealth(base), buildOrgHealth(draft));
      const viaCompare = compareOrgHealth(base, draft);
      // 深度相等：metrics 全欄位（key/label/before/after/delta/direction）與 hasChanges 一致。
      expect(viaDelta).toEqual(viaCompare);
    },
  );

  it('兩路徑一致同時非平凡：選一組會「改善」的 base/draft，確認 delta 確有變化且兩路徑相同', () => {
    // 防「兩路徑都回全 0 才剛好相等」的偽守護：此組確有 warningCount/readiness 變化。
    const base = spanData(9); // span-wide + spof → warning
    const draft = spanData(8); // 不再過寬 → 少一筆 warning

    const viaDelta = buildHealthDelta(buildOrgHealth(base), buildOrgHealth(draft));
    const viaCompare = compareOrgHealth(base, draft);

    expect(viaDelta).toEqual(viaCompare);
    // 確認此 case 非平凡（有真正的變化，守護才有意義）
    expect(viaDelta.hasChanges).toBe(true);
    const m = byKey(viaDelta);
    expect(m.warningCount.direction).toBe('improved');
    expect(m.readiness.direction).toBe('improved');
  });

  it('readiness 取自各自 OrgHealth 的 buildReadiness().total（before/after 對齊獨立計算）', () => {
    // buildHealthDelta 內部對 base/draft 各自呼叫 buildReadiness；驗證取的是各自的 total。
    const base = spanData(9);
    const draft = spanData(8);
    const baseHealth = buildOrgHealth(base);
    const draftHealth = buildOrgHealth(draft);

    const m = byKey(buildHealthDelta(baseHealth, draftHealth));
    expect(m.readiness.before).toBe(buildReadiness(baseHealth).total);
    expect(m.readiness.after).toBe(buildReadiness(draftHealth).total);
    expect(m.readiness.delta).toBe(
      buildReadiness(draftHealth).total - buildReadiness(baseHealth).total,
    );
  });
});

describe('filterFindingsForEmployee（工作台選中節點 → 該人提醒，純函式）', () => {
  /** 造一筆 finding，預設指向某員工；可覆寫任意欄位（含改 employeeId 為 undefined）。 */
  function finding(
    id: string,
    partial: Partial<OrgHealthFinding> = {},
  ): OrgHealthFinding {
    return {
      id,
      severity: 'warning',
      category: 'span',
      message: id,
      employeeId: 'e1',
      ...partial,
    };
  }

  it('選中某人時只回傳該人的 findings（多筆 employeeId 混合）', () => {
    const findings = [
      finding('a1', { employeeId: 'alice' }),
      finding('b1', { employeeId: 'bob' }),
      finding('a2', { employeeId: 'alice', severity: 'info', category: 'function' }),
      finding('c1', { employeeId: 'carol' }),
    ];

    const result = filterFindingsForEmployee(findings, 'alice');

    expect(result.map((f) => f.id)).toEqual(['a1', 'a2']);
    expect(result.every((f) => f.employeeId === 'alice')).toBe(true);
  });

  it('employeeId 為 null（未選中）時回傳空陣列', () => {
    const findings = [finding('a1', { employeeId: 'alice' })];
    expect(filterFindingsForEmployee(findings, null)).toEqual([]);
  });

  it('傳入不存在的 employeeId 回傳空陣列', () => {
    const findings = [
      finding('a1', { employeeId: 'alice' }),
      finding('b1', { employeeId: 'bob' }),
    ];
    expect(filterFindingsForEmployee(findings, 'nobody')).toEqual([]);
  });

  it('忽略沒有 employeeId 的 findings（如 cycle/depth 類）', () => {
    const findings = [
      finding('cycle:0', { category: 'cycle', employeeId: undefined }),
      finding('depth-deep', { category: 'depth', severity: 'info', employeeId: undefined }),
      finding('a1', { employeeId: 'alice' }),
    ];

    const result = filterFindingsForEmployee(findings, 'alice');
    expect(result.map((f) => f.id)).toEqual(['a1']);
  });

  it('不修改輸入陣列（不 mutate、不改長度、不換參考）', () => {
    const findings = [
      finding('a1', { employeeId: 'alice' }),
      finding('b1', { employeeId: 'bob' }),
    ];
    const snapshotIds = findings.map((f) => f.id);
    const snapshotItems = [...findings];

    const result = filterFindingsForEmployee(findings, 'alice');

    // 輸入未被改動：長度、順序與每個元素參考皆不變。
    expect(findings.map((f) => f.id)).toEqual(snapshotIds);
    expect(findings).toEqual(snapshotItems);
    // 回傳的元素是輸入中的同一個物件參考（純過濾、未複製）。
    expect(result[0]).toBe(snapshotItems[0]);
  });

  it('保持原順序（過濾後相對順序與輸入一致）', () => {
    const findings = [
      finding('a3', { employeeId: 'alice' }),
      finding('x', { employeeId: 'bob' }),
      finding('a1', { employeeId: 'alice' }),
      finding('y', { employeeId: 'carol' }),
      finding('a2', { employeeId: 'alice' }),
    ];

    // 結果順序＝輸入中 alice 各筆出現的先後（a3, a1, a2），不重排。
    expect(filterFindingsForEmployee(findings, 'alice').map((f) => f.id)).toEqual([
      'a3',
      'a1',
      'a2',
    ]);
  });

  it('空 findings 陣列回傳空陣列', () => {
    expect(filterFindingsForEmployee([], 'alice')).toEqual([]);
  });
});
