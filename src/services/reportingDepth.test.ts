import { computePrimaryDepth, effectiveLevel } from './reportingDepth';
import { assignment } from '../test/fixtures';

/**
 * computePrimaryDepth：每位員工的「主匯報深度」（1-indexed）。
 * 契約（docs/契約-階層由匯報深度計算.md §2.1）：
 * - 正規父 = 顯示歸屬（isPrimaryGroup 優先、否則第一筆）的 primarySupervisorId。
 * - 父為 null 或父不在集合內 → 根 depth=1；否則父+1。
 * - 只走主匯報（primarySupervisorId），忽略 supervisorIds 的虛線。
 * - 有環防護。
 */
describe('computePrimaryDepth', () => {
  it('單根線性鏈：根=1、每階+1', () => {
    const depth = computePrimaryDepth([
      assignment('a-root', { employeeId: 'root', primarySupervisorId: null }),
      assignment('a-mid', {
        employeeId: 'mid',
        supervisorIds: ['root'],
        primarySupervisorId: 'root',
      }),
      assignment('a-leaf', {
        employeeId: 'leaf',
        supervisorIds: ['mid'],
        primarySupervisorId: 'mid',
      }),
    ]);
    expect(depth.get('root')).toBe(1);
    expect(depth.get('mid')).toBe(2);
    expect(depth.get('leaf')).toBe(3);
  });

  it('同一主管的多名直屬落在同一層', () => {
    const depth = computePrimaryDepth([
      assignment('a-boss', { employeeId: 'boss', primarySupervisorId: null }),
      assignment('a-c1', {
        employeeId: 'c1',
        supervisorIds: ['boss'],
        primarySupervisorId: 'boss',
      }),
      assignment('a-c2', {
        employeeId: 'c2',
        supervisorIds: ['boss'],
        primarySupervisorId: 'boss',
      }),
    ]);
    expect(depth.get('boss')).toBe(1);
    expect(depth.get('c1')).toBe(2);
    expect(depth.get('c2')).toBe(2);
  });

  it('多根森林：各自的根都是深度 1', () => {
    const depth = computePrimaryDepth([
      assignment('a-r1', { employeeId: 'r1', primarySupervisorId: null }),
      assignment('a-r2', { employeeId: 'r2', primarySupervisorId: null }),
      assignment('a-c1', {
        employeeId: 'c1',
        supervisorIds: ['r1'],
        primarySupervisorId: 'r1',
      }),
      assignment('a-c2', {
        employeeId: 'c2',
        supervisorIds: ['r2'],
        primarySupervisorId: 'r2',
      }),
    ]);
    expect(depth.get('r1')).toBe(1);
    expect(depth.get('r2')).toBe(1);
    expect(depth.get('c1')).toBe(2);
    expect(depth.get('c2')).toBe(2);
  });

  it('只走主匯報：虛線 supervisorIds 不影響深度', () => {
    // low 的主管是 mid（深度 3），但 supervisorIds 另掛了 boss（深度 1）的虛線。
    // 深度只看 primarySupervisorId → low=3，虛線 boss 不把它拉成 2。
    const depth = computePrimaryDepth([
      assignment('a-boss', { employeeId: 'boss', primarySupervisorId: null }),
      assignment('a-mid', {
        employeeId: 'mid',
        supervisorIds: ['boss'],
        primarySupervisorId: 'boss',
      }),
      assignment('a-low', {
        employeeId: 'low',
        // 虛線 boss 排在前、主管 mid 在後 → 仍以 primarySupervisorId 為準。
        supervisorIds: ['boss', 'mid'],
        primarySupervisorId: 'mid',
      }),
    ]);
    expect(depth.get('boss')).toBe(1);
    expect(depth.get('mid')).toBe(2);
    expect(depth.get('low')).toBe(3);
  });

  it('父不在傳入集合內 → 視為根（depth=1）', () => {
    // child 的主管 ghost 不在集合中（如單組視角下的跨組主管）→ child 為根。
    const depth = computePrimaryDepth([
      assignment('a-child', {
        employeeId: 'child',
        supervisorIds: ['ghost'],
        primarySupervisorId: 'ghost',
      }),
      assignment('a-grand', {
        employeeId: 'grand',
        supervisorIds: ['child'],
        primarySupervisorId: 'child',
      }),
    ]);
    expect(depth.get('child')).toBe(1);
    expect(depth.get('grand')).toBe(2);
  });

  it('顯示歸屬以 isPrimaryGroup 優先決定正規父（非第一筆）', () => {
    // worker 有兩筆歸屬：第一筆（次要組、主管 a）+ 第二筆（主組、主管 root）。
    // 顯示歸屬應取 isPrimaryGroup=true 那筆 → 父 = root → 深度 2。
    const depth = computePrimaryDepth([
      assignment('a-root', { employeeId: 'root', primarySupervisorId: null }),
      assignment('a-a', {
        employeeId: 'a',
        supervisorIds: ['root'],
        primarySupervisorId: 'root',
      }),
      assignment('a-worker-secondary', {
        employeeId: 'worker',
        groupId: 'g2',
        supervisorIds: ['a'],
        primarySupervisorId: 'a',
        isPrimaryGroup: false,
      }),
      assignment('a-worker-primary', {
        employeeId: 'worker',
        groupId: 'g1',
        supervisorIds: ['root'],
        primarySupervisorId: 'root',
        isPrimaryGroup: true,
      }),
    ]);
    // 經由主組（父 root）→ 深度 2；若誤用第一筆（父 a，深度 2）會變成 3。
    expect(depth.get('worker')).toBe(2);
  });

  it('主組已在前：後續次要歸屬不覆寫已選定的顯示歸屬', () => {
    // worker 的主組（父 root）排在前、次要組（父 a）排在後。
    // 既已選到 isPrimaryGroup 那筆，後來的次要筆不應把它換掉 → 父仍是 root（深度 2）。
    const depth = computePrimaryDepth([
      assignment('a-root', { employeeId: 'root', primarySupervisorId: null }),
      assignment('a-a', {
        employeeId: 'a',
        supervisorIds: ['root'],
        primarySupervisorId: 'root',
      }),
      assignment('a-worker-primary', {
        employeeId: 'worker',
        groupId: 'g1',
        supervisorIds: ['root'],
        primarySupervisorId: 'root',
        isPrimaryGroup: true,
      }),
      assignment('a-worker-secondary', {
        employeeId: 'worker',
        groupId: 'g2',
        supervisorIds: ['a'],
        primarySupervisorId: 'a',
        isPrimaryGroup: false,
      }),
    ]);
    expect(depth.get('worker')).toBe(2);
  });

  it('防環：互為主管不爆堆疊、回傳有限的合理深度', () => {
    // x ←→ y 互指（理論上被 validators 擋掉）；防環應回傳有限值、不無限遞迴。
    const depth = computePrimaryDepth([
      assignment('a-x', {
        employeeId: 'x',
        supervisorIds: ['y'],
        primarySupervisorId: 'y',
      }),
      assignment('a-y', {
        employeeId: 'y',
        supervisorIds: ['x'],
        primarySupervisorId: 'x',
      }),
    ]);
    expect(depth.get('x')).toBeGreaterThanOrEqual(1);
    expect(depth.get('y')).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(depth.get('x'))).toBe(true);
    expect(Number.isFinite(depth.get('y'))).toBe(true);
  });

  it('空集合 → 空 map', () => {
    expect(computePrimaryDepth([]).size).toBe(0);
  });
});

describe('effectiveLevel', () => {
  const depthMap = new Map<string, number>([
    ['root', 1],
    ['mid', 2],
  ]);

  it('有 level 覆寫時優先用覆寫值（即使與計算深度不同）', () => {
    const a = assignment('a-mid', { employeeId: 'mid', level: 5 });
    expect(effectiveLevel(a, depthMap)).toBe(5);
  });

  it('無 level 覆寫時用計算深度', () => {
    const a = assignment('a-mid', { employeeId: 'mid' });
    expect(effectiveLevel(a, depthMap)).toBe(2);
  });

  it('覆寫與深度皆無 → 退回 1', () => {
    const a = assignment('a-orphan', { employeeId: 'orphan' });
    expect(effectiveLevel(a, depthMap)).toBe(1);
  });

  it('level 覆寫為 1 時仍視為覆寫（非當作缺值）', () => {
    // assignment.level=1（明確覆寫）即使 depthMap 算出較深，仍取 1。
    const a = assignment('a-mid', { employeeId: 'mid', level: 1 });
    expect(effectiveLevel(a, depthMap)).toBe(1);
  });
});
