import { buildOrgHealth } from './orgHealth';
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
