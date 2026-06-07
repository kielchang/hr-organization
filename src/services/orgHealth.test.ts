import {
  buildOrgHealth,
  buildReadiness,
  compareOrgHealth,
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
  it('maxDepth 與 perLevel 依各員工主歸屬 level 計數（含 backfill）', () => {
    // 不顯式給 level，讓 backfillAssignmentLevels 由組內匯報深度推導：
    // root level 1、mid level 2、leaf level 3
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

  it('已顯式給 level 時直接採用、同層多人正確累加', () => {
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
   * 維度 → category 對應（對齊契約 R0.5）：
   *   span      ← ['span']
   *   structure ← ['chain','cycle']
   *   function  ← ['function']
   *   keyPerson ← ['spof']
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
